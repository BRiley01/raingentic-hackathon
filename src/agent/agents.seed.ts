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
  /** Charge per query, in USDC. */
  priceUsdc: number;
  /** Kept as `price` too, because getAgentStatsSnapshot() reads that name. */
  price: number;
  /** x402 payTo. Receive-only, so these never need funding — only the buyer does. */
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
    price: priceUsdc,
    wallet,
  };
}

// Ratings and prices are SYNTHETIC — these are real company names fronted by fake
// agents, which is why the UI carries a "simulated data" chip. Within a category,
// better-rated agents charge more: that tension is the decision the demo is about.
export const DEFAULT_AGENTS: AgentRecord[] = [
  agent(1, "kayak.com", "flight", 0.25, 4.9, 24, 94, "0x7A3f9C2b5E81dA46F0b3C77e19aB4d5E6F208c31"),
  agent(2, "priceline.com", "flight", 0.12, 4.4, 9, 82, "0x2B8eD41a9F6c07B35De29a8C41f0E7b6A5d3C902"),
  agent(3, "united.com", "flight", 0.06, 3.8, 14, 61, "0x9C0a7E35B21f8D64Ae03C5b9F172d8E4a6B7F103"),
  agent(4, "booking.com", "hotel", 0.25, 4.9, 21, 91, "0xAB41c9E07f2B85dA36C1e94F08b7D5a2E63f0c14"),
  agent(5, "hotels.com", "hotel", 0.14, 4.4, 12, 79, "0x5D9b3A28E14c06F7aB52d8C93e01B4f6A7c2E805"),
  agent(6, "expedia.com", "hotel", 0.08, 3.8, 18, 64, "0x1F6c8B05a93E27dD41b0A5c86f3E9b2D7a4C1e06"),
  agent(7, "hertz.com", "car", 0.11, 4.6, 8, 86, "0xC30e5A81b47F29dE06a3B9c15f8D42e7A6b0F207"),
  agent(8, "avis.com", "car", 0.07, 4.1, 11, 72, "0x8E27fB4a05D31c96Ae5b0C83d17F4a9E2b6D3c08"),
  agent(9, "enterprise.com", "car", 0.04, 3.5, 6, 55, "0x4A0d7C63e28B15fF93a6D1b70c8E5a4F2b9E6d09"),
];

/**
 * Bumped whenever DEFAULT_AGENTS changes shape or contents.
 *
 * `ensureDefaultAgents()` only writes when data/agents.json is ABSENT, so without
 * a version stamp everyone who already ran the server keeps their stale four-agent
 * file and sees no error explaining why.
 */
export const SEED_VERSION = 2;
