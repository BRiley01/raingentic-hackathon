// Scope-card service — matched to the starter-kit flow.
//
// Uses PRE-PROVISIONED credentials from the workshop desk (userId + contractId);
// it does NOT create a user or contract. For a BudgetPlan it:
//   1. funds the collateral contract for the total allocated amount
//   2. mints ONE scoped card per agent allocation (limit = that agent's slice)
//   3. charges each payable line item via authorize -> settle, SERIALLY
//
// Serial settlement is deliberate (Monad drops concurrent-nonce writes; also gives
// a well-defined already-charged set if a later leg fails).

import type { BudgetPlan } from "./trip.js";
import type { RainClient } from "../../integrations/rain/client.js";
import type { RainCard, ChargeResult } from "../../integrations/rain/types.js";

export interface RainContext {
  userId: string;     // cardholder to issue to
  contractId: string; // collateral contract to fund
}

export interface ScopeCard {
  domain: string;
  card: RainCard;
  limitCents: number;
  merchantAllowlist: string[];
}

export interface SettlementReport {
  tripId: string;
  userId: string;
  contractId: string;
  fundedCents: number;
  cards: ScopeCard[];
  charges: ChargeResult[];
  totalSettledCents: number;
  totalDeclinedCents: number;
  ok: boolean;
}

// A tiny MCC map so charges carry a sensible merchant category per domain.
const MCC_BY_DOMAIN: Record<string, string> = {
  flights: "3000",     // airlines
  hotels: "3500",      // lodging
  transport: "3351",   // car rental
  dining: "5812",      // eating places
  activities: "7999",  // recreation services
};

export async function provisionAndSettle(
  rain: RainClient,
  plan: BudgetPlan,
  ctx: RainContext,
): Promise<SettlementReport> {
  // 1. fund collateral for the whole allocated amount (rusd, cents)
  const fundedCents = plan.totalAllocated.amountCents;
  await rain.fundCollateral({
    contractId: ctx.contractId,
    currency: "rusd",
    amount: fundedCents,
  });

  // 2. one scoped card per agent allocation
  const cards: ScopeCard[] = [];
  for (const alloc of plan.allocations) {
    const card = await rain.issueScopedCard(ctx.userId, {
      amountInUSDCents: alloc.allocated.amountCents,
      policy: {
        maxTransactionAmount: alloc.allocated.amountCents,
        merchantAllowlist: alloc.merchantAllowlist,
        spendInterval: "allTime",
      },
    });
    cards.push({
      domain: alloc.domain,
      card,
      limitCents: alloc.allocated.amountCents,
      merchantAllowlist: alloc.merchantAllowlist,
    });
  }

  // 3. settle each payable line item against its domain card — SERIALLY
  const cardByDomain = new Map(cards.map((c) => [c.domain, c]));
  const charges: ChargeResult[] = [];
  let totalSettled = 0;
  let totalDeclined = 0;

  for (const alloc of plan.allocations) {
    const scope = cardByDomain.get(alloc.domain)!;
    const mcc = MCC_BY_DOMAIN[alloc.domain] ?? "7999";
    for (const item of alloc.items) {
      if (!item.payable) {
        charges.push({
          cardId: scope.card.id,
          vendor: item.vendor,
          amountCents: item.maxSpend.amountCents,
          status: "skipped",
          reason: "item marked non-payable (retrieve-only)",
        });
        continue;
      }
      const result = await rain.charge(
        scope.card.id,
        item.vendor,
        item.maxSpend.amountCents,
        mcc,
      );
      charges.push(result);
      if (result.status === "settled") totalSettled += result.amountCents;
      else if (result.status === "declined") totalDeclined += result.amountCents;
    }
  }

  const ok = charges.every((c) => c.status !== "declined");

  return {
    tripId: plan.tripId,
    userId: ctx.userId,
    contractId: ctx.contractId,
    fundedCents,
    cards,
    charges,
    totalSettledCents: totalSettled,
    totalDeclinedCents: totalDeclined,
    ok,
  };
}
