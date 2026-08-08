// Trip request + budget schema.
//
// This is the JSON shape your team hands the backend. It is the single source of
// truth for (a) how much money the trip may spend, (b) which agent/domain handles
// each line item, and (c) the exact vendor to purchase from (your team picks the
// "best place"; the backend just allocates + pays).
//
// Everything downstream — scope cards, Rain limits, settlement — is derived from
// this object, so it is validated strictly at the boundary.

import { z } from "zod";

// The five booking domains, each of which becomes one scoped agent card.
export const DomainSchema = z.enum([
  "flights",
  "hotels",
  "activities",
  "transport",
  "dining",
]);
export type Domain = z.infer<typeof DomainSchema>;

// Money is integer cents to avoid float drift. `currency` defaults to USD.
// (Rain balances come back in cents too, so we stay in cents end-to-end and only
// divide by 100 at display time.)
export const MoneySchema = z.object({
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3).default("USD"),
});
export type MoneyCents = z.infer<typeof MoneySchema>;

// A single thing to buy. Your team names the vendor + the exact URL (the "best
// place to purchase"), so the backend never has to choose. `payable` marks whether
// this line can actually be charged (some options are retrieve-only / not
// purchasable — those still get budget reserved but no card charge).
export const LineItemSchema = z.object({
  id: z.string().min(1),
  domain: DomainSchema,
  label: z.string().min(1), // "4 nights, Hotel Ibis Paris"
  vendor: z.string().min(1), // "booking.com"
  vendorUrl: z.string().url().optional(),
  // The agent may spend UP TO this much on this item. This is the cap, not a
  // guaranteed charge — the real charge comes from the vendor at settle time.
  maxSpend: MoneySchema,
  // Merchant category code / merchant name to lock the card to, if known.
  merchantAllowlist: z.array(z.string()).default([]),
  payable: z.boolean().default(true),
});
export type LineItem = z.infer<typeof LineItemSchema>;

// The whole trip request. `budget` is the hard ceiling across ALL line items;
// the allocator refuses to produce a plan whose per-item caps exceed it.
export const TripRequestSchema = z.object({
  tripId: z.string().min(1),
  traveler: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email().optional(),
  }),
  // Hard spend ceiling for the entire trip.
  budget: MoneySchema,
  // Optional per-domain sub-ceilings ("no more than $600 on flights").
  // partialRecord: caps may be given for some domains and omitted for others.
  // (Plain z.record over an enum key is exhaustive in zod 4 and would demand
  // every domain be present — not what we want here.)
  domainCaps: z.partialRecord(DomainSchema, MoneySchema).optional(),
  items: z.array(LineItemSchema).min(1),
  // How stale a hold may be (seconds) before confirm must re-check the vendor.
  holdTtlSeconds: z.number().int().positive().default(900),
});
export type TripRequest = z.infer<typeof TripRequestSchema>;

// ---- Allocation output ------------------------------------------------------

// One agent's slice of the budget: everything needed to mint its scoped card.
export interface AgentAllocation {
  domain: Domain;
  items: LineItem[];
  // Sum of the domain's line-item caps — becomes the card's spend limit.
  allocated: MoneyCents;
  merchantAllowlist: string[]; // union of the domain's item allowlists
}

export interface BudgetPlan {
  tripId: string;
  budget: MoneyCents;
  totalAllocated: MoneyCents;
  remaining: MoneyCents; // budget - totalAllocated, always >= 0 for a valid plan
  allocations: AgentAllocation[];
}

// Parse + validate untrusted JSON into a TripRequest. Throws a ZodError with a
// readable path on the first violation set (we surface all issues, per the
// team's "report every violated rule" decision).
export function parseTripRequest(input: unknown): TripRequest {
  return TripRequestSchema.parse(input);
}
