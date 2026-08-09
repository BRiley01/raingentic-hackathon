// The marketplace seed — the canonical list of seller agents.
//
// Lives in its own file so `file-store.ts` only has to import it, and so the
// canvas can import the same list instead of keeping a second copy that drifts.
//
// Shape note: `type` is SINGULAR ("hotel"), matching what the API already returns
// and what tests/api/agent-type.test.ts asserts. The trip.ts Domain enum is plural
// ("hotels"), so there is exactly one mapping — `domainOf()` below — applied at the
// point events are emitted. Agent type and trip domain are genuinely different
// things; this keeps them from being conflated everywhere else.
//
// ⚠️ tests/api/agent-type.test.ts pins the FLIGHT count at exactly 3. Adding a
// fourth flight agent breaks a test that looks unrelated to whatever you changed.

import type { Domain } from "../domain/shared/trip.js";

export type AgentType = "flight" | "hotel" | "car";

export interface AgentRecord {
  id: number;
  /** Stable string key — and the vendor it fronts, which makes LineItem.vendor,
   *  merchantAllowlist[0] and vendorUrl fall out for free. */
  agentId: string;
  name: string;
  type: AgentType;
  /** Advertised quality, 0–100. NOT the same scale as agent.response.quality (0–1). */
  qualityPercent: number;
  rating: number;
  /** Deliberately small. A 1dp rating display only moves when
   *  (stars - rating) / (count + 1) >= 0.05, so counts in the hundreds make the
   *  post-transaction rating write-back mathematically invisible. */
  ratingCount: number;
  /** Charge per query, in USDC. The ONLY price field — see file-store's snapshot. */
  priceUsdc: number;
  /**
   * x402 payTo — a real, EIP-55-checksummed address.
   *
   * Receive-only, so it never needs funding: only the BUYER spends. That's also why
   * the private keys were generated and discarded rather than committed — nothing
   * here needs to sign, and a repo is the wrong place for keys even on a testnet.
   *
   * These must be genuine addresses. The placeholders they replaced were random hex
   * with mixed case and therefore had invalid EIP-55 checksums, which viem's
   * getAddress() rejects outright — they would have thrown as `payTo` the moment
   * x402 was wired in.
   */
  wallet: string;
}

/** Agent type → trip.ts Domain. The one place this mapping exists. */
export function domainOf(type: AgentType): Domain {
  switch (type) {
    case "flight":
      return "flights";
    case "hotel":
      return "hotels";
    case "car":
      return "transport";
  }
}

/** Friendly column label for the UI. Data keys on `type`, humans read this. */
export const TYPE_LABEL: Record<AgentType, string> = {
  flight: "Flights",
  hotel: "Hotels",
  car: "Car",
};

export const AGENT_TYPES: AgentType[] = ["flight", "hotel", "car"];

/**
 * Normalise a caller-supplied agent type.
 *
 * Accepts singular or plural ("hotel" / "hotels") because a client will reasonably
 * guess either — the trip domains are plural, the agent types are singular, and
 * making people remember which is which at 3am is a waste of everyone's night.
 *
 * Returns the canonical type, `undefined` for "no filter given", or `null` for a
 * value that isn't an agent type at all. Callers should reject `null` rather than
 * silently returning everything or nothing.
 */
export function parseAgentType(raw: unknown): AgentType | undefined | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!value) return undefined;

  const singular = value.endsWith("s") ? value.slice(0, -1) : value;
  if ((AGENT_TYPES as string[]).includes(value)) return value as AgentType;
  if ((AGENT_TYPES as string[]).includes(singular)) return singular as AgentType;
  return null;
}

function agent(
  id: number,
  agentId: string,
  type: AgentType,
  priceUsdc: number,
  rating: number,
  ratingCount: number,
  qualityPercent: number,
  wallet: string,
): AgentRecord {
  return {
    id,
    agentId,
    name: agentId,
    type,
    qualityPercent,
    rating,
    ratingCount,
    priceUsdc,
    wallet,
  };
}

// Ratings and prices are SYNTHETIC — these are real company names fronted by fake
// agents, which is why the UI carries a "simulated data" chip. Within a category,
// better-rated agents charge more: that tension is the decision the demo is about.
//
// EXCEPT booking.com, deliberately: most expensive AND worst rated in its category, so
// it is strictly dominated. Nothing rational buys it. It's a trap — partly a better
// market (a real one has bad expensive options), partly a diagnostic: an agent that
// still hires it is not weighing the signals at all.
export const DEFAULT_AGENTS: AgentRecord[] = [
  agent(1, "kayak.com", "flight", 0.25, 4.9, 24, 94, "0x25733a37A44741C4b081dB49B6AC2f9b4754350a"),
  agent(2, "priceline.com", "flight", 0.12, 4.4, 9, 82, "0x22c7549D0340D13FB485A458d55DE5543904472b"),
  agent(3, "united.com", "flight", 0.06, 3.8, 14, 61, "0xEF6BFfB0eF556bF36447De334dA380A43983C4F3"),
  agent(4, "booking.com", "hotel", 0.25, 3.6, 21, 91, "0xa1729901dC6601f04aDEe100D1A59860eff444e8"),
  agent(5, "hotels.com", "hotel", 0.14, 4.4, 12, 79, "0x99cDCcb651EE91e9d491d25B3835aA2f1d8C9ae6"),
  agent(6, "expedia.com", "hotel", 0.08, 3.8, 18, 64, "0x3c71B2cd7a133A25f3EC33FFE8Eb9128c7206234"),
  agent(7, "hertz.com", "car", 0.11, 4.6, 8, 86, "0xa27B8c7513BeF50e4E91576F48cfa74591357e89"),
  agent(8, "avis.com", "car", 0.07, 4.1, 11, 72, "0xe54CBd75bfe328e75E7cD84059a3b00b4c6efE72"),
  agent(9, "enterprise.com", "car", 0.04, 3.5, 6, 55, "0x564d7e49315a5E3151eC7A31e1Add348F21ca0d8"),
];

/**
 * Bumped whenever DEFAULT_AGENTS changes shape or contents.
 *
 * `ensureDefaultAgents()` only writes when data/agents.json is ABSENT, so without
 * a version stamp everyone who already ran the server keeps their stale four-agent
 * file and sees no error explaining why.
 */
export const SEED_VERSION = 4;
