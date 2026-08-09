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

  let goal: string | undefined;
  let budgetCents = 0;
  let complete = false;

  for (const e of events) {
    switch (e.type) {
      case "run.started":
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

  // Only count spend for payments that actually settled.
  const settledPaymentIds = new Set(
    events.filter((e) => e.type === "payment.settled").map((e) => e.paymentId),
  );
  let tier1SpentUsdc = 0;
  for (const [paymentId, amount] of spend) {
    if (settledPaymentIds.has(paymentId)) tier1SpentUsdc += amount;
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
