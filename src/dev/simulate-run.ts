// TEST HARNESS — not product surface.
//
//   npm run simulate            demo pacing (~30s), visible beats
//   npm run simulate -- fast    no delays, for asserting the API layer works
//
// Stands in for the client agent until the real CLI agent exists, and exercises the
// API layer end to end while emitting the demo event contract so the canvas shows a
// genuinely live run.
//
// It talks HTTP to our own endpoints on purpose. Importing readAgents() and calling
// allocate() directly would be shorter and would prove nothing about the API the
// CLI agent has to use — a shape mismatch has to fail HERE, loudly, not get papered
// over by an internal call.
//
// What is REAL: the marketplace listing, the seller query, the rating write, the
// allocator, and Rain provisioning/settlement (mock-Rain unless RAIN_* is set).
// What is NOT: the x402 payment. Those events carry `simulated: true` so the canvas
// can label them and we never imply a settlement that didn't happen.

import { AGENT_TYPES, domainOf, type AgentType } from "../agent/agents.seed.js";
import { LineItemSchema, parseTripRequest, type LineItem } from "../domain/shared/trip.js";
import { allocate, AllocationError } from "../domain/shared/allocator.js";
import { provisionAndSettle } from "../domain/shared/scope-cards.js";
import { makeRainClient } from "../integrations/rain/client.js";

const BASE = process.env.API_BASE ?? "http://localhost:3000";
const FAST = process.argv.includes("fast");

const GOAL = "7 days in Paris for two, mid-March, under $1,800";
const BUDGET_CENTS = 180_000;
const TRIP_ID = "paris-2026-spring";

// Caps are fixed BEFORE any shopping, derived from the budget and never from what
// the sellers came back with. This is what makes the allocator able to say no: size
// the caps to fit whatever arrived and `allocation.failed` becomes unreachable and
// the guardrail beat disappears.
//
// They must also SUM to less than the budget. The seller clamps its quote to the cap
// it's given, so the worst case is every item landing exactly on its cap — and if the
// caps sum above the budget, that worst case fails allocation. Answer quality is a
// random draw now, so "worst case" is something that eventually happens on stage.
const DOMAIN_CAPS: Record<string, number> = {
  flights: 78_000,
  hotels: 62_000,
  transport: 36_000,
};

// Enforced rather than trusted: an unlucky run must not be the thing that discovers
// someone widened a cap.
const CAPS_TOTAL = Object.values(DOMAIN_CAPS).reduce((a, b) => a + b, 0);
if (CAPS_TOTAL > BUDGET_CENTS) {
  throw new Error(
    `domain caps total ${CAPS_TOTAL}¢ but the budget is ${BUDGET_CENTS}¢ — ` +
      `a maximally unlucky run would fail allocation. Lower a cap or raise the budget.`,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, FAST ? 0 : ms));
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Emit over HTTP, not by importing the bus.
 *
 * The bus is per-process: this script runs in its own process, so an in-process
 * emit() would publish into memory no browser is subscribed to and the canvas would
 * stay blank while the run "succeeded". POST /api/events/emit puts it on the
 * server's bus, which is the one the SSE stream reads from.
 */
async function emit(type: string, payload: Record<string, unknown> = {}): Promise<void> {
  await api("/api/events/emit", { method: "POST", body: JSON.stringify({ type, ...payload }) });
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

type Listing = {
  agentId: string;
  name: string;
  type: AgentType;
  rating: number;
  ratingCount: number;
  priceUsdc: number;
  qualityPercent: number;
  wallet: string;
};

/**
 * Price versus rating, weighted by what's at stake.
 *
 * The cap is the stake, and caps exist before shopping starts — so the client knows
 * hotels is a $650 decision and the car is a $400 one, and pays more for good advice
 * where being wrong costs more. That is why caps-first is architectural and not just
 * a demo convenience.
 */
function choose(listings: Listing[], capCents: number) {
  // score = rating − price × sensitivity × (reference cap / this cap)
  //
  // Price matters INVERSELY to the stake: $0.25 of advice on a $400 car rental is
  // proportionally dear, on an $800 flight it's noise. So a bigger line makes the
  // client more willing to pay for a better-rated advisor.
  //
  // The sensitivity constant is calibrated, not arbitrary: rating gaps here are
  // ~0.5★ and price gaps ~$0.13, so without scaling price into that range the
  // rating term dominates and the client just buys the top-rated agent every time —
  // which throws away the price-vs-rating tradeoff the whole demo is about.
  const PRICE_SENSITIVITY = 4;
  const REFERENCE_CAP_CENTS = 100_000;
  const priceWeight = PRICE_SENSITIVITY * (REFERENCE_CAP_CENTS / Math.max(1, capCents));

  const scored = listings
    .map((l) => ({ l, score: l.rating - l.priceUsdc * priceWeight }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0]!.l;
  const topRated = [...listings].sort((a, b) => b.rating - a.rating)[0]!;
  const cheapest = [...listings].sort((a, b) => a.priceUsdc - b.priceUsdc)[0]!;

  // Templated from the comparison actually made, so it can't claim a tradeoff that
  // didn't happen. An LLM can replace this behind the same event later.
  let reasoning: string;
  if (best.agentId !== topRated.agentId) {
    const multiple = (best.priceUsdc ? topRated.priceUsdc / best.priceUsdc : 0).toFixed(1);
    reasoning =
      `${topRated.agentId} rates ${(topRated.rating - best.rating).toFixed(1)}★ higher but charges ` +
      `${multiple}× per query. ${best.agentId}'s ${best.rating}★ clears my bar for a ` +
      `${usd(capCents)} line — I'd rather put the difference into the trip.`;
  } else if (best.agentId !== cheapest.agentId) {
    const multiple = (cheapest.priceUsdc ? best.priceUsdc / cheapest.priceUsdc : 0).toFixed(1);
    reasoning =
      `This is a ${usd(capCents)} line — the most expensive place to be wrong. The best-rated ` +
      `advisor earns its premium here, so I'll pay ${multiple}× ${cheapest.agentId} not to get ` +
      `this one wrong.`;
  } else {
    reasoning = `${best.agentId} is both the best rated here and the cheapest. No tradeoff to make.`;
  }

  return { best, reasoning, reason: `score ${scored[0]!.score.toFixed(2)} on rating vs price` };
}

async function main() {
  const runId = `run_${TRIP_ID}`;
  console.log(`simulating a run against ${BASE}${FAST ? " (fast)" : ""}\n`);

  await emit("run.started", { runId, goal: GOAL, budgetCents: BUDGET_CENTS });
  await sleep(400);

  const items: LineItem[] = [];
  let spentUsdc = 0;

  for (const type of AGENT_TYPES) {
    const domain = domainOf(type);
    const capCents = DOMAIN_CAPS[domain]!;
    const queryId = `q_${domain}`;

    // ---- discovery: the real marketplace endpoint ------------------------------
    await emit("marketplace.query", { queryId, category: domain });
    await sleep(600);

    // Filter server-side. Fetching all nine and filtering here would leave the
    // ?type= endpoint untested by the one thing that's supposed to exercise it.
    const snapshot = await api<{ agents: Listing[] }>(`/api/agents?type=${type}`);
    const listings = snapshot.agents;
    if (listings.length === 0) throw new Error(`no agents of type ${type} in the marketplace`);

    // The wire carries `category` on the trip.ts Domain enum; the records carry
    // singular `type`. One mapping, applied here.
    await emit("marketplace.results", {
      queryId,
      category: domain,
      agents: listings.map((l) => ({ ...l, category: domain })),
    });
    await sleep(800);

    // ---- deliberation ----------------------------------------------------------
    const { best, reasoning, reason } = choose(listings, capCents);
    await emit("client.deliberate", { queryId, considering: listings.map((l) => l.agentId), reasoning });
    await sleep(1_800);
    await emit("client.select", { queryId, agentId: best.agentId, reason });
    await sleep(500);

    // ---- payment: THE SIMULATED PART -------------------------------------------
    const paymentId = `pay_${domain}`;
    await emit("payment.challenge", {
      paymentId,
      agentId: best.agentId,
      amountUsdc: best.priceUsdc,
      payTo: best.wallet,
      network: "eip155:10143",
      simulated: true,
    });
    await sleep(600);
    await emit("payment.signed", { paymentId, agentId: best.agentId, simulated: true });
    await sleep(500);
    await emit("payment.settled", {
      paymentId,
      agentId: best.agentId,
      // No txHash: there is no transaction. Inventing one would be the single most
      // dishonest thing this file could do — the canvas shows no chain proof, which
      // is exactly right until x402 lands.
      durationMs: 0,
      simulated: true,
    });
    spentUsdc += best.priceUsdc;
    await sleep(400);

    // ---- the goods: the real seller endpoint -----------------------------------
    const answer = await api<{ quality: number; lineItem: unknown }>(
      `/api/agents/${encodeURIComponent(best.agentId)}/query`,
      { method: "POST", body: JSON.stringify({ goal: GOAL, capCents }) },
    );

    // Validate per item so a bad seller is named here, rather than surfacing later
    // as a zod dump on the assembled trip.
    const parsed = LineItemSchema.safeParse(answer.lineItem);
    if (!parsed.success) {
      throw new Error(`${best.agentId} returned an invalid LineItem: ${parsed.error.message}`);
    }

    // The client owns `id` (unique across the trip) and `domain` (it holds the
    // mapping), and normalises currency to the trip's — one seller quoting EUR
    // would otherwise fail the whole trip with an error naming nobody.
    const lineItem: LineItem = {
      ...parsed.data,
      id: `${domain}-1`,
      domain,
      maxSpend: { ...parsed.data.maxSpend, currency: "USD" },
    };
    items.push(lineItem);

    await emit("agent.response", { queryId, agentId: best.agentId, quality: answer.quality, lineItem });
    await sleep(650);

    // ---- rating: the real, persisted, per-agent endpoint ------------------------
    // Stars come from the quality actually delivered, so the rating means something.
    const stars = Math.max(1, Math.min(5, Math.round(1 + answer.quality * 4)));

    // The SERVER's numbers go on the wire, not ones computed here. Recomputing the
    // average client-side would show a rating that looks right while the stored one
    // drifted — the canvas would be reporting arithmetic instead of state.
    const rated = await api<{ rating: number; ratingCount: number }>(
      `/api/agents/${encodeURIComponent(best.agentId)}/rating`,
      { method: "POST", body: JSON.stringify({ stars }) },
    );
    await emit("client.rating", {
      agentId: best.agentId,
      stars,
      newRating: rated.rating,
      newRatingCount: rated.ratingCount,
    });

    console.log(
      `  ${domain.padEnd(10)} ${best.agentId.padEnd(16)} $${best.priceUsdc.toFixed(2)}  ` +
        `q=${answer.quality.toFixed(2)}  cap ${usd(lineItem.maxSpend.amountCents)}/${usd(capCents)}` +
        (lineItem.maxSpend.amountCents > capCents ? "  ⚠ OVER CAP" : ""),
    );
    await sleep(600);
  }

  // ---- assemble: the handoff artifact ----------------------------------------
  const trip = parseTripRequest({
    tripId: TRIP_ID,
    traveler: { id: "trav_001", name: "Alex Rivera", email: "alex@example.com" },
    budget: { amountCents: BUDGET_CENTS, currency: "USD" },
    domainCaps: Object.fromEntries(
      Object.entries(DOMAIN_CAPS).map(([d, c]) => [d, { amountCents: c, currency: "USD" }]),
    ),
    holdTtlSeconds: 900,
    items,
  });

  await emit("trip.assembled", { tripId: trip.tripId, trip });
  await sleep(900);

  // ---- allocation: REAL, and allowed to refuse -------------------------------
  let plan;
  try {
    plan = allocate(trip);
  } catch (e) {
    if (e instanceof AllocationError) {
      // Every violated rule, not just the first — and stop here. Provisioning Rain
      // cards against a plan the allocator refused would be the worst bug to demo.
      const reasons = String(e.message).split("\n").filter(Boolean);
      await emit("allocation.failed", { tripId: trip.tripId, reasons });
      await emit("run.complete", { runId, ok: false, tier1SpentUsdc: round(spentUsdc), tier2SettledCents: 0 });
      console.error(`\n✗ allocation rejected:\n${reasons.map((r) => `   ${r}`).join("\n")}`);
      process.exit(1);
    }
    throw e;
  }

  await emit("allocation.ok", {
    tripId: trip.tripId,
    allocations: plan.allocations.map((a) => ({
      domain: a.domain,
      allocatedCents: a.allocated.amountCents,
      itemCount: a.items.length,
    })),
  });
  await sleep(700);

  // ---- settlement: REAL (mock-Rain unless RAIN_* is set) ---------------------
  const rain = makeRainClient();
  const report = await provisionAndSettle(rain, plan, {
    userId: process.env.RAIN_USER_ID ?? "sandbox-user",
    contractId: process.env.RAIN_CONTRACT_ID ?? "sandbox-contract",
  });

  for (const card of report.cards) {
    await emit("tier2.card_issued", {
      domain: card.domain,
      last4: card.card.last4 ?? "----",
      limitCents: card.limitCents,
      merchantAllowlist: card.merchantAllowlist,
    });
    await sleep(400);
  }

  // ChargeResult carries cardId, not domain — and tier2.charge needs the domain to
  // know which panel slot to light. Each scoped card IS a domain, so the card is the
  // bridge.
  const domainByCardId = new Map(report.cards.map((c) => [c.card.id, c.domain]));

  for (const charge of report.charges) {
    await emit("tier2.charge", {
      domain: domainByCardId.get(charge.cardId) ?? "unknown",
      vendor: charge.vendor,
      amountCents: charge.amountCents,
      status: charge.status,
      reason: charge.reason,
    });
    await sleep(600);
  }

  await emit("run.complete", {
    runId,
    ok: report.ok,
    tier1SpentUsdc: round(spentUsdc),
    tier2SettledCents: report.totalSettledCents,
  });

  console.log(
    `\n✓ advice ${usd(Math.round(spentUsdc * 100))} (simulated x402) → ` +
      `trip ${usd(report.totalSettledCents)} settled across ${report.cards.length} cards`,
  );
  console.log(`  Rain mode: ${(process.env.RAIN_MODE ?? "mock").toLowerCase()}`);
}

const round = (n: number) => Math.round(n * 100) / 100;

main().catch((err) => {
  console.error(`\n✗ ${err.message ?? err}`);
  process.exit(1);
});
