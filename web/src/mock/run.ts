// The mock run — a full demo, scripted, with zero backend.
//
// This file is demo insurance AND the demo script. If the chain, the facilitator
// or the backend is unwell at showtime, `?mock=1` still tells the whole story;
// and the beat order below is the answer to marketplace-questions 4.3, so keep
// only this copy and point the doc at it.
//
// It emits exactly what the wire emits (same types, same `seq`/`ts` stamping), so
// the reducer cannot tell mock from live. Every new event type added to the
// reducer gets added here the same hour — a rotted mock is worse than none.
//
// THE ARC (~40s):
//   goal in → for each of flights/hotels/car: shop, deliberate, pay, get advice,
//   rate → assemble the TripRequest → allocator approves → Rain cards charge the
//   real merchants → done. Sub-dollar advice moved $1,714.

import type { DemoEvent } from "@shared/events/types.js";
import type { LineItem, TripRequest } from "@shared/domain/shared/trip.js";
import { LISTINGS } from "./listings.js";
import { txUrl } from "../explorer.js";

// Distributive Omit — a plain Omit over a union collapses it to the shared keys.
type Unstamped<T> = T extends unknown ? Omit<T, "seq" | "ts"> : never;
export type MockStep = { after: number; event: Unstamped<DemoEvent> };

const NETWORK = "eip155:10143"; // Monad testnet

// Beat timings. The one that matters is CHALLENGE_HOLD: settlement is fast
// (~850ms measured), so without a deliberate pause the 402 challenge and the
// settlement land in the same frame and the most interesting part of the
// protocol is invisible. Hold it so the audience sees amber before green.
const CHALLENGE_HOLD = 600;
const READ_REASONING = 1800; // long enough to actually read the client's words

const RUN_ID = "run_paris_demo";
const TRIP_ID = "paris-2026-spring";
const BUDGET_CENTS = 180_000; // $1,800 — the goal box on the canvas

// Fixed, not random: a deterministic run screenshots identically and can be
// diffed between rehearsals.
const TX_HASHES: Record<string, string> = {
  "priceline.com": "0x7b1e94a0c35f8d26e41b03a97f5c8d2e60b394a71fc058d3629ae74b0c815f3d",
  "booking.com": "0x3fa20c85d719e64b08c5372af9106e8d45b7c0293e618af5d02b74c691a3057e",
  "hertz.com": "0xc05e831b7f4a92d60e13ba587c249f0d3e6b8145a9702fceb8d5027a61c4e93f",
};

const CARD_LAST4: Record<string, string> = {
  flights: "4417",
  hotels: "8823",
  transport: "2095",
};

type Decision = {
  category: string;
  agentId: string;
  reasoning: string;
  reason: string;
  quality: number; // 0–1, self-declared (NOT the 0–100 qualityPercent on listings)
  stars: number;
  lineItem: LineItem;
  chargeCents: number; // what the merchant actually charged, ≤ the card limit
};

/** What the client picked in each category, and why. `reasoning` renders verbatim. */
const DECISIONS: Decision[] = [
  {
    category: "flights",
    agentId: "priceline.com",
    // The value pick — deliberately NOT the top-rated agent. This is the beat the
    // whole demo exists for: an agent trading quality against price on its own.
    reasoning:
      "kayak.com rates half a star higher, but charges 2× per query. priceline's 4.4★ clears my bar for a single round-trip leg — I'd rather put the difference into the seat.",
    reason: "best value: 4.4★ at half the price of kayak",
    quality: 0.82,
    stars: 5,
    lineItem: {
      id: "flt-1",
      domain: "flights",
      label: "JFK → CDG round trip, Mar 14–21",
      vendor: "priceline.com",
      vendorUrl: "https://www.priceline.com/m/fly/search/JFK-CDG",
      maxSpend: { amountCents: 78_000, currency: "USD" },
      merchantAllowlist: ["priceline.com"],
      payable: true,
    },
    chargeCents: 76_450,
  },
  {
    category: "hotels",
    agentId: "booking.com",
    // The quality pick — same client, opposite call, because the stake is bigger.
    // Shows the tradeoff cuts both ways instead of "cheapest always wins".
    reasoning:
      "Hotels are the largest line on this trip at ~$620. This is where being wrong is expensive, so the best-rated advisor earns its premium — I'll pay 3× expedia.com not to get this one wrong.",
    reason: "highest rated (4.9★) on the trip's biggest line item",
    quality: 0.91,
    stars: 5,
    lineItem: {
      id: "htl-1",
      domain: "hotels",
      label: "Hôtel Ibis Paris Bastille, 7 nights",
      vendor: "booking.com",
      vendorUrl: "https://www.booking.com/hotel/fr/ibis-paris-bastille.html",
      maxSpend: { amountCents: 62_000, currency: "USD" },
      merchantAllowlist: ["booking.com"],
      payable: true,
    },
    chargeCents: 61_200,
  },
  {
    category: "transport",
    agentId: "hertz.com",
    reasoning:
      "hertz.com is both the best rated here and mid-priced. No tradeoff to make — taking it.",
    reason: "best rated and not the most expensive",
    quality: 0.86,
    stars: 4,
    lineItem: {
      id: "car-1",
      domain: "transport",
      label: "Compact rental, 7 days, CDG pickup",
      vendor: "hertz.com",
      vendorUrl: "https://www.hertz.com",
      maxSpend: { amountCents: 36_000, currency: "USD" },
      merchantAllowlist: ["hertz.com"],
      payable: true,
    },
    chargeCents: 33_750,
  },
];

/** The whole run as a flat list of (delay, event) steps. */
export function buildRun(): MockStep[] {
  const steps: MockStep[] = [];
  const push = (after: number, event: Unstamped<DemoEvent>) => steps.push({ after, event });

  push(300, {
    type: "run.started",
    runId: RUN_ID,
    goal: "7 days in Paris for two, mid-March, under $1,800",
    budgetCents: BUDGET_CENTS,
  });

  // ---- one shopping cycle per category ------------------------------------
  DECISIONS.forEach((d, i) => {
    const queryId = `q_${d.category}`;
    const paymentId = `pay_${d.category}`;
    const listings = LISTINGS[d.category]!;
    const chosen = listings.find((a) => a.agentId === d.agentId)!;

    push(i === 0 ? 700 : 900, { type: "marketplace.query", queryId, category: d.category });
    push(800, { type: "marketplace.results", queryId, category: d.category, agents: listings });

    // The shopping moment. `considering` lights all three; `reasoning` is the
    // client explaining a spending decision in its own words — worth more than
    // any animation, per the contract doc.
    push(700, {
      type: "client.deliberate",
      queryId,
      considering: listings.map((a) => a.agentId),
      reasoning: d.reasoning,
    });
    push(READ_REASONING, { type: "client.select", queryId, agentId: d.agentId, reason: d.reason });

    // x402: the challenge is emitted BEFORE signing, always.
    push(600, {
      type: "payment.challenge",
      paymentId,
      agentId: d.agentId,
      amountUsdc: chosen.priceUsdc,
      payTo: chosen.wallet,
      network: NETWORK,
    });
    push(CHALLENGE_HOLD, { type: "payment.signed", paymentId, agentId: d.agentId });

    const txHash = TX_HASHES[d.agentId]!;
    push(850, {
      type: "payment.settled",
      paymentId,
      agentId: d.agentId,
      txHash,
      durationMs: 853,
      explorerUrl: txUrl(txHash),
    });

    // The goods: one LineItem, plus the agent's self-declared quality (0–1).
    push(650, {
      type: "agent.response",
      queryId,
      agentId: d.agentId,
      quality: d.quality,
      lineItem: d.lineItem,
    });

    // Rating write-back. Counts are seeded small (listings.ts) precisely so this
    // moves the displayed average — a 1dp display needs
    // (stars − rating)/(count + 1) ≥ 0.05. booking.com is the exception: a 5★ on
    // a 4.9★ agent shouldn't move it, and faking that would be a lie. Elsewhere
    // the reinforcing signal is the count
    // ticking up plus the star-delta flash on the edge (spec §3).
    const newRatingCount = chosen.ratingCount + 1;
    const newRating =
      Math.round(((chosen.rating * chosen.ratingCount + d.stars) / newRatingCount) * 100) / 100;
    push(600, {
      type: "client.rating",
      agentId: d.agentId,
      stars: d.stars,
      newRating,
      newRatingCount,
    });
  });

  // ---- handoff to tier 2 ---------------------------------------------------
  const trip: TripRequest = {
    tripId: TRIP_ID,
    traveler: { id: "trav_001", name: "Alex Rivera", email: "alex@example.com" },
    budget: { amountCents: BUDGET_CENTS, currency: "USD" },
    domainCaps: {
      flights: { amountCents: 80_000, currency: "USD" },
      hotels: { amountCents: 65_000, currency: "USD" },
      transport: { amountCents: 40_000, currency: "USD" },
    },
    holdTtlSeconds: 900,
    items: DECISIONS.map((d) => d.lineItem),
  };

  push(1200, { type: "trip.assembled", tripId: TRIP_ID, trip });

  push(900, {
    type: "allocation.ok",
    tripId: TRIP_ID,
    allocations: DECISIONS.map((d) => ({
      domain: d.category,
      allocatedCents: d.lineItem.maxSpend.amountCents,
      itemCount: 1,
    })),
  });

  // One scoped card per domain, locked to that domain's merchant.
  DECISIONS.forEach((d, i) => {
    push(i === 0 ? 800 : 450, {
      type: "tier2.card_issued",
      domain: d.category,
      last4: CARD_LAST4[d.category]!,
      limitCents: d.lineItem.maxSpend.amountCents,
      merchantAllowlist: d.lineItem.merchantAllowlist,
    });
  });

  DECISIONS.forEach((d, i) => {
    push(i === 0 ? 900 : 700, {
      type: "tier2.charge",
      domain: d.category,
      vendor: d.lineItem.vendor,
      amountCents: d.chargeCents,
      status: "settled",
    });
  });

  const tier1SpentUsdc =
    Math.round(
      DECISIONS.reduce((sum, d) => {
        const agent = LISTINGS[d.category]!.find((a) => a.agentId === d.agentId)!;
        return sum + agent.priceUsdc;
      }, 0) * 100,
    ) / 100;

  push(1000, {
    type: "run.complete",
    runId: RUN_ID,
    ok: true,
    tier1SpentUsdc,
    tier2SettledCents: DECISIONS.reduce((sum, d) => sum + d.chargeCents, 0),
  });

  return steps;
}

/**
 * The first `n` events of the run, stamped, with no timers — the state the canvas
 * would be in at that beat. Used by `?frame=n` for deterministic screenshots and
 * for jumping straight to a beat you're iterating on instead of waiting 30s.
 */
export function framesUpTo(n: number): DemoEvent[] {
  return buildRun()
    .slice(0, n)
    .map((step, i) => ({ seq: i + 1, ts: 0, ...step.event }) as DemoEvent);
}

/** Total number of beats in the run — the upper bound for `?frame=`. */
export function frameCount(): number {
  return buildRun().length;
}

export type MockOptions = {
  /** 2 = twice as fast. Handy when rehearsing the same beat over and over. */
  speed?: number;
  onDone?: () => void;
};

/**
 * Play the scripted run, stamping `seq`/`ts` exactly as src/events/bus.ts does.
 * Returns a stop function — call it on unmount.
 */
export function runMock(onEvent: (event: DemoEvent) => void, opts: MockOptions = {}): () => void {
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const steps = buildRun();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const play = (i: number) => {
    if (cancelled) return;
    if (i >= steps.length) {
      opts.onDone?.();
      return;
    }
    const step = steps[i]!;
    timer = setTimeout(() => {
      if (cancelled) return;
      onEvent({ seq: ++seq, ts: Date.now(), ...step.event } as DemoEvent);
      play(i + 1);
    }, step.after / speed);
  };

  play(0);

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
  };
}
