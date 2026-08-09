// Tier 1 → tier 2: allocate a trip, then provision and settle it.
//
// One implementation behind two faces — POST /api/trip/{plan,settle} and the MCP
// `settle_trip` tool — so the REST client and the LLM agent cannot diverge in
// behaviour.
//
// This is also where the events for the tier-2 half of the canvas come from. Emitting
// here rather than at each call site means every caller narrates the same beats
// whether it's a script, an HTTP client or an LLM.

import { emit } from "../events/bus.js";
import { allocate, AllocationError } from "../domain/shared/allocator.js";
import { provisionAndSettle, type SettlementReport } from "../domain/shared/scope-cards.js";
import { makeRainClient } from "../integrations/rain/client.js";
import type { BudgetPlan, TripRequest } from "../domain/shared/trip.js";

export type PlanOutcome =
  | { ok: true; plan: BudgetPlan }
  | { ok: false; reasons: string[] };

export type SettleOutcome =
  | { ok: true; plan: BudgetPlan; report: SettlementReport }
  | { ok: false; reasons: string[] };

/**
 * The allocator reports EVERY violated rule, not just the first — that's a deliberate
 * property worth preserving all the way to the caller. An agent recommending something
 * over its cap should see the whole list, and the canvas renders all of them.
 */
function reasonsFrom(error: unknown): string[] {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** Dry run: would this trip allocate? Emits nothing — it's a question, not an event. */
export function planTrip(trip: TripRequest): PlanOutcome {
  try {
    return { ok: true, plan: allocate(trip) };
  } catch (error) {
    if (error instanceof AllocationError) return { ok: false, reasons: reasonsFrom(error) };
    throw error;
  }
}

/**
 * The real handoff. Allocates, then issues one scoped card per domain and settles each
 * payable line against it.
 *
 * A rejected allocation stops here and provisions nothing. Issuing Rain cards against
 * a plan the allocator refused would be the worst bug in this repo to demo.
 */
export async function settleTrip(trip: TripRequest): Promise<SettleOutcome> {
  emit("trip.assembled", { tripId: trip.tripId, trip });

  const planned = planTrip(trip);
  if (!planned.ok) {
    emit("allocation.failed", { tripId: trip.tripId, reasons: planned.reasons });
    return planned;
  }

  const plan = planned.plan;
  emit("allocation.ok", {
    tripId: trip.tripId,
    allocations: plan.allocations.map((a) => ({
      domain: a.domain,
      allocatedCents: a.allocated.amountCents,
      itemCount: a.items.length,
    })),
  });

  // Mock unless RAIN_* is configured, so live Rain is a config change not a code change.
  const rain = makeRainClient();
  const report = await provisionAndSettle(rain, plan, {
    userId: process.env.RAIN_USER_ID ?? "sandbox-user",
    contractId: process.env.RAIN_CONTRACT_ID ?? "sandbox-contract",
  });

  for (const card of report.cards) {
    emit("tier2.card_issued", {
      domain: card.domain,
      last4: card.card.last4 ?? "----",
      limitCents: card.limitCents,
      merchantAllowlist: card.merchantAllowlist,
    });
  }

  // ChargeResult carries cardId, not domain — and the canvas needs the domain to know
  // which panel slot to light. Each scoped card IS a domain, so the card is the bridge.
  const domainByCardId = new Map(report.cards.map((c) => [c.card.id, c.domain]));
  for (const charge of report.charges) {
    emit("tier2.charge", {
      domain: domainByCardId.get(charge.cardId) ?? "unknown",
      vendor: charge.vendor,
      amountCents: charge.amountCents,
      status: charge.status,
      reason: charge.reason,
    });
  }

  return { ok: true, plan, report };
}
