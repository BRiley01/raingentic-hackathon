// The demo event contract.
//
// This is the wire format between the backend and the live canvas. It is the one
// thing both sides must agree on, so it lives in its own file with no runtime
// dependencies beyond the trip schema.
//
// Every event carries `seq` (monotonic, gap-detectable) and `ts` (epoch ms).
// Adding a field is safe; renaming one is not — the UI keys off `type`.

import type { LineItem, TripRequest } from "../domain/shared/trip.js";

export interface EventBase {
  seq: number;
  ts: number;
}

/** An agent as the marketplace advertises it. */
export interface AgentListing {
  agentId: string;
  name: string; // "booking.com" — the vendor it fronts
  category: string; // trip.ts Domain: flights | hotels | transport
  priceUsdc: number; // charge per question
  rating: number; // 0–5
  ratingCount: number;
  wallet: string; // x402 payTo address
  qualityPercent?: number; // advertised quality, drives the response roll
}

// ---- lifecycle --------------------------------------------------------------

export interface RunStarted extends EventBase {
  type: "run.started";
  runId: string;
  goal: string;
  budgetCents: number;
}

export interface RunComplete extends EventBase {
  type: "run.complete";
  runId: string;
  ok: boolean;
  tier1SpentUsdc: number;
  tier2SettledCents: number;
}

// ---- discovery --------------------------------------------------------------

export interface MarketplaceQuery extends EventBase {
  type: "marketplace.query";
  queryId: string;
  category: string;
}

export interface MarketplaceResults extends EventBase {
  type: "marketplace.results";
  queryId: string;
  category: string;
  agents: AgentListing[];
}

// ---- deliberation (the shopping moment) -------------------------------------

export interface ClientDeliberate extends EventBase {
  type: "client.deliberate";
  queryId: string;
  considering: string[]; // agentIds
  reasoning?: string; // shown verbatim in the UI if present
}

export interface ClientSelect extends EventBase {
  type: "client.select";
  queryId: string;
  agentId: string;
  reason?: string;
}

// ---- x402 payment -----------------------------------------------------------

/**
 * Set when the payment is NOT a real on-chain settlement — e.g. the dev harness
 * exercising the API layer before x402 exists. The UI must label these: a canvas
 * that implies a settlement which never happened is worse than one that admits the
 * gap. Optional and additive, so real emitters can ignore it.
 */
export interface SimulatedFlag {
  simulated?: boolean;
}

export interface PaymentChallenge extends EventBase, SimulatedFlag {
  type: "payment.challenge";
  paymentId: string;
  agentId: string;
  amountUsdc: number;
  payTo: string;
  network: string; // "eip155:10143"
}

export interface PaymentSigned extends EventBase, SimulatedFlag {
  type: "payment.signed";
  paymentId: string;
  agentId: string;
}

export interface PaymentSettled extends EventBase, SimulatedFlag {
  type: "payment.settled";
  paymentId: string;
  agentId: string;
  /** Absent on simulated payments — there is no transaction to point at. */
  txHash?: string;
  durationMs: number;
  explorerUrl?: string;
}

export interface PaymentFailed extends EventBase {
  type: "payment.failed";
  paymentId: string;
  agentId: string;
  reason: string;
}

// ---- the goods --------------------------------------------------------------

export interface AgentResponse extends EventBase {
  type: "agent.response";
  queryId: string;
  agentId: string;
  quality: number; // 0–1, self-declared
  lineItem: LineItem;
}

export interface ClientRating extends EventBase {
  type: "client.rating";
  agentId: string;
  stars: number;
  newRating: number;
  newRatingCount: number;
}

// ---- handoff to tier 2 ------------------------------------------------------

export interface TripAssembled extends EventBase {
  type: "trip.assembled";
  tripId: string;
  trip: TripRequest;
}

export interface AllocationOk extends EventBase {
  type: "allocation.ok";
  tripId: string;
  allocations: { domain: string; allocatedCents: number; itemCount: number }[];
}

export interface AllocationFailed extends EventBase {
  type: "allocation.failed";
  tripId: string;
  reasons: string[]; // the allocator reports every violated rule, not the first
}

// ---- tier 2 -----------------------------------------------------------------

export interface Tier2CardIssued extends EventBase {
  type: "tier2.card_issued";
  domain: string;
  last4: string;
  limitCents: number;
  merchantAllowlist: string[];
}

export interface Tier2Charge extends EventBase {
  type: "tier2.charge";
  domain: string;
  vendor: string;
  amountCents: number;
  status: "settled" | "declined" | "skipped";
  reason?: string;
}

export type DemoEvent =
  | RunStarted
  | RunComplete
  | MarketplaceQuery
  | MarketplaceResults
  | ClientDeliberate
  | ClientSelect
  | PaymentChallenge
  | PaymentSigned
  | PaymentSettled
  | PaymentFailed
  | AgentResponse
  | ClientRating
  | TripAssembled
  | AllocationOk
  | AllocationFailed
  | Tier2CardIssued
  | Tier2Charge;

export type DemoEventType = DemoEvent["type"];
