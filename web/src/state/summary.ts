// The header numbers, derived from the event log.
//
// First slice of the "events[] → view" reduction the whole UI is built on (spec
// §5): never mutate state, always fold the log. That is what makes a mid-demo
// browser refresh survivable — replay the buffer and the numbers come back.
// The full node/edge graph reducer lands next and follows the same rule.

import type { DemoEvent } from "@shared/events/types.js";

export type Summary = {
  goal?: string;
  budgetCents: number;
  tier1SpentUsdc: number;
  agentCount: number;
  agentsPaid: number;
  tier2SettledCents: number;
  cardCount: number;
  complete: boolean;
};

export const EMPTY: Summary = {
  budgetCents: 0,
  tier1SpentUsdc: 0,
  agentCount: 0,
  agentsPaid: 0,
  tier2SettledCents: 0,
  cardCount: 0,
  complete: false,
};

export function summarize(events: DemoEvent[]): Summary {
  const listed = new Set<string>();
  const paid = new Set<string>();
  const cards = new Set<string>();
  // Charge amounts are keyed by domain so a re-emitted event can't double-count.
  const charges = new Map<string, number>();
  const spend = new Map<string, number>();
  const settled = new Set<string>();

  let goal: string | undefined;
  let budgetCents = 0;
  let complete = false;

  for (const e of events) {
    switch (e.type) {
      // A new run resets the totals. The replay buffer can hold several runs, and
      // adding run #2's settlements to run #1's would put a number on the header
      // that never happened.
      case "run.started":
        listed.clear();
        paid.clear();
        cards.clear();
        charges.clear();
        spend.clear();
        settled.clear();
        complete = false;
        goal = e.goal;
        budgetCents = e.budgetCents;
        break;
      case "marketplace.results":
        for (const a of e.agents) listed.add(a.agentId);
        break;
      case "payment.challenge":
        // The challenge names the price; settlement confirms we actually paid it.
        spend.set(e.paymentId, e.amountUsdc);
        break;
      case "payment.settled":
        paid.add(e.agentId);
        settled.add(e.paymentId);
        break;
      case "payment.failed":
        spend.delete(e.paymentId);
        break;
      case "tier2.card_issued":
        cards.add(e.domain);
        break;
      case "tier2.charge":
        if (e.status === "settled") charges.set(e.domain, e.amountCents);
        break;
      case "run.complete":
        complete = true;
        break;
      default:
        break;
    }
  }

  // Only count spend for payments that actually settled — tracked inside the fold
  // so a previous run's settlement of the same paymentId ("pay_flights" is
  // deterministic) can't mark this run's pending payment as paid.
  let tier1SpentUsdc = 0;
  for (const [paymentId, amount] of spend) {
    if (settled.has(paymentId)) tier1SpentUsdc += amount;
  }

  return {
    goal,
    budgetCents,
    // USDC at 6 decimals, but prices here are cents-scale — round to avoid
    // 0.12 + 0.25 + 0.11 = 0.48000000000000004 on screen.
    tier1SpentUsdc: Math.round(tier1SpentUsdc * 100) / 100,
    agentCount: listed.size,
    agentsPaid: paid.size,
    tier2SettledCents: [...charges.values()].reduce((a, b) => a + b, 0),
    cardCount: cards.size,
    complete,
  };
}
