// The state of the run in progress, held on the SERVER.
//
// This is the load-bearing decision of the MCP integration: the LLM orchestrates but
// never carries the artifacts. It picks agents and justifies choices; we hold the
// LineItems, the caps, the spend and the trip. So the agent literally cannot produce
// an invalid TripRequest, mangle a JSON payload, or lose an item to a context window —
// the three ways an LLM-driven demo fails in front of an audience.
//
// One run at a time. `start` replaces any run in flight rather than erroring, because
// an agent that gets confused and restarts should recover, not deadlock — and the
// canvas resets on `run.started` anyway.

import { parseTripRequest, type Domain, type LineItem, type TripRequest } from "../domain/shared/trip.js";
import { domainOf, type AgentType } from "../agent/agents.seed.js";

export type Listing = {
  agentId: string;
  name: string;
  type: AgentType;
  rating: number;
  ratingCount: number;
  priceUsdc: number;
  wallet: string;
};

/**
 * How the budget is carved up before any shopping happens.
 *
 * Caps FIRST, never derived from what the sellers came back with — that's what makes
 * the allocator able to say no. Size the caps to fit whatever arrived and
 * `allocation.failed` becomes unreachable and the guardrail beat disappears.
 *
 * The fractions sum to 0.97, deliberately under 1. The seller clamps its quote to the
 * cap it's given, so the worst case is every item landing exactly on its cap — if the
 * caps summed to the whole budget, that worst case would fail allocation.
 */
const CAP_FRACTION: Record<Domain, number> = {
  flights: 0.43,
  hotels: 0.34,
  transport: 0.2,
  dining: 0,
  activities: 0,
};

export type Run = {
  runId: string;
  goal: string;
  budgetCents: number;
  domainCaps: Partial<Record<Domain, number>>;
  /** Last listing per type — so we know the shortlist a choice was made from. */
  listed: Map<AgentType, Listing[]>;
  /** One item per domain. Hiring twice in a category replaces the item; both payments
   *  still count, because indecision genuinely costs money. */
  items: Map<Domain, LineItem>;
  quality: Map<string, number>;
  paidAgentIds: Set<string>;
  spentUsdc: number;
  settled: boolean;
};

let current: Run | undefined;

export function startRun(goal: string, budgetCents: number, categories: AgentType[]): Run {
  const domainCaps: Partial<Record<Domain, number>> = {};
  for (const type of categories) {
    const domain = domainOf(type);
    domainCaps[domain] = Math.round(budgetCents * (CAP_FRACTION[domain] ?? 0));
  }

  const capsTotal = Object.values(domainCaps).reduce((sum, c) => sum + (c ?? 0), 0);
  if (capsTotal > budgetCents) {
    // Enforced, not trusted: an unlucky run must not be what discovers a widened cap.
    throw new Error(
      `domain caps total ${capsTotal}¢ but the budget is ${budgetCents}¢ — a maximally ` +
        `unlucky run would fail allocation`,
    );
  }

  current = {
    runId: `run_${Date.now().toString(36)}`,
    goal,
    budgetCents,
    domainCaps,
    listed: new Map(),
    items: new Map(),
    quality: new Map(),
    paidAgentIds: new Set(),
    spentUsdc: 0,
    settled: false,
  };
  return current;
}

export function activeRun(): Run | undefined {
  return current;
}

/** Throws with a message aimed at an LLM: it says what to do, not just what's wrong. */
export function requireRun(): Run {
  if (!current) {
    throw new Error("No trip run in progress. Call start_trip_run first with the goal and budget.");
  }
  return current;
}

export function recordListing(type: AgentType, listings: Listing[]): void {
  requireRun().listed.set(type, listings);
}

export function recordHire(agent: Listing, lineItem: LineItem, quality: number): void {
  const run = requireRun();
  run.items.set(lineItem.domain, lineItem);
  run.quality.set(agent.agentId, quality);
  run.paidAgentIds.add(agent.agentId);
  run.spentUsdc = Math.round((run.spentUsdc + agent.priceUsdc) * 100) / 100;
}

export function capFor(run: Run, type: AgentType): number {
  return run.domainCaps[domainOf(type)] ?? 0;
}

/** Which requested categories still have nothing hired. */
export function missingDomains(run: Run): Domain[] {
  return Object.keys(run.domainCaps)
    .filter((d) => (run.domainCaps[d as Domain] ?? 0) > 0)
    .filter((d) => !run.items.has(d as Domain)) as Domain[];
}

/**
 * Assemble the collected items into a validated TripRequest.
 *
 * Validation happens HERE, at the boundary, on data the server built — so a failure is
 * our bug rather than something the agent typed.
 */
export function assembleTrip(run: Run): TripRequest {
  const items = [...run.items.values()];
  if (items.length === 0) {
    throw new Error(
      "Nothing has been hired yet, so there is no trip to settle. Use list_agents and " +
        "hire_agent for each category first.",
    );
  }

  return parseTripRequest({
    tripId: run.runId,
    traveler: { id: "trav_001", name: "Alex Rivera", email: "alex@example.com" },
    budget: { amountCents: run.budgetCents, currency: "USD" },
    domainCaps: Object.fromEntries(
      Object.entries(run.domainCaps)
        .filter(([, cents]) => (cents ?? 0) > 0)
        .map(([domain, cents]) => [domain, { amountCents: cents, currency: "USD" }]),
    ),
    holdTtlSeconds: 900,
    items,
  });
}

export function clearRun(): void {
  current = undefined;
}
