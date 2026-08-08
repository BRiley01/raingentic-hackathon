// Budget allocator.
//
// Pure, deterministic, network-free. Takes a validated TripRequest and produces a
// BudgetPlan: one AgentAllocation per domain that has line items. This is the
// "allocate budget across separate agents" step — it does not touch Rain or any
// vendor, so it is trivially unit-testable and safe to run before creds land.
//
// Enforcement, all reported together (not first-failure-wins):
//   1. total of all item caps must not exceed trip budget
//   2. per-domain totals must not exceed any domainCaps[domain]
//   3. currencies must be consistent

import type {
  TripRequest,
  BudgetPlan,
  AgentAllocation,
  Domain,
  LineItem,
} from "./trip.js";

export class AllocationError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`Budget allocation failed:\n - ${reasons.join("\n - ")}`);
    this.name = "AllocationError";
  }
}

function sumCents(items: LineItem[]): number {
  return items.reduce((acc, it) => acc + it.maxSpend.amountCents, 0);
}

export function allocate(trip: TripRequest): BudgetPlan {
  const reasons: string[] = [];
  const currency = trip.budget.currency;

  // Group line items by domain.
  const byDomain = new Map<Domain, LineItem[]>();
  for (const item of trip.items) {
    if (item.maxSpend.currency !== currency) {
      reasons.push(
        `item "${item.id}" is in ${item.maxSpend.currency} but trip budget is in ${currency}`,
      );
    }
    const list = byDomain.get(item.domain) ?? [];
    list.push(item);
    byDomain.set(item.domain, list);
  }

  const allocations: AgentAllocation[] = [];
  let totalAllocated = 0;

  for (const [domain, items] of byDomain) {
    const allocatedCents = sumCents(items);
    totalAllocated += allocatedCents;

    // Per-domain sub-ceiling check.
    const cap = trip.domainCaps?.[domain];
    if (cap && allocatedCents > cap.amountCents) {
      reasons.push(
        `${domain}: allocated ${fmt(allocatedCents)} exceeds domain cap ${fmt(cap.amountCents)}`,
      );
    }

    const merchantAllowlist = Array.from(
      new Set(items.flatMap((it) => it.merchantAllowlist)),
    );

    allocations.push({
      domain,
      items,
      allocated: { amountCents: allocatedCents, currency },
      merchantAllowlist,
    });
  }

  // Trip-level ceiling check.
  if (totalAllocated > trip.budget.amountCents) {
    reasons.push(
      `total allocated ${fmt(totalAllocated)} exceeds trip budget ${fmt(trip.budget.amountCents)}`,
    );
  }

  if (reasons.length > 0) throw new AllocationError(reasons);

  // Stable ordering makes output deterministic (nice for tests + demo).
  allocations.sort((a, b) => a.domain.localeCompare(b.domain));

  return {
    tripId: trip.tripId,
    budget: trip.budget,
    totalAllocated: { amountCents: totalAllocated, currency },
    remaining: {
      amountCents: trip.budget.amountCents - totalAllocated,
      currency,
    },
    allocations,
  };
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
