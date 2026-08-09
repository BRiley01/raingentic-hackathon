// The nine seller agents, as the marketplace advertises them.
//
// Ratings, counts, prices and wallets are SYNTHETIC (the header says so) — these
// are real company names fronted by fake agents. Agents are named for the vendor
// they represent, never for their tier, so rating + price carry the entire
// quality signal (spec §1/§3).
//
// This is also the seed the backend needs in src/agent/file-store.ts. It lives
// here because the canvas needed it first; lift it wholesale when the backend
// starts emitting for real.

import type { AgentListing } from "@shared/events/types.js";

// Rating counts are deliberately SMALL, and that is load-bearing arithmetic
// rather than a cosmetic choice.
//
// A new rating moves a 1-decimal display only when
//     (stars − rating) / (count + 1)  ≥  0.05
// so for a 4.4★ agent awarded 5★ the count has to be ≤ 11. Counts in the hundreds
// (let alone the "1.1k" the original sketch had) make the write-back
// mathematically invisible: 4.40 → 4.4034, and the demo's claim that reputation
// drives the next decision becomes an assertion nobody can see.
//
// The three agents the scripted run actually hires sit at the bottom of the band
// so their ratings visibly move. booking.com is the honest exception — a 5★ on a
// 4.9★ agent SHOULDN'T move it, and pretending otherwise would be a lie.
//
// The tradeoff: low counts make ratings volatile, so few swarm samples can swing a
// selection. That is the knob to turn if the swarm ends up too twitchy.
// ⚠️ Units differ across the contract and it is easy to get wrong: `qualityPercent`
// here is 0–100 (matching src/agent/file-store.ts), while `agent.response.quality`
// is 0–1. The UI divides one and not the other.
export const LISTINGS: Record<string, AgentListing[]> = {
  flights: [
    l("kayak.com", "flights", 0.25, 4.9, 24, 94, "0x7A3f9C2b5E81dA46F0b3C77e19aB4d5E6F208c31"),
    l("priceline.com", "flights", 0.12, 4.4, 9, 82, "0x2B8eD41a9F6c07B35De29a8C41f0E7b6A5d3C902"),
    l("united.com", "flights", 0.06, 3.8, 14, 61, "0x9C0a7E35B21f8D64Ae03C5b9F172d8E4a6B7F103"),
  ],
  hotels: [
    l("booking.com", "hotels", 0.25, 4.9, 21, 91, "0xAB41c9E07f2B85dA36C1e94F08b7D5a2E63f0c14"),
    l("hotels.com", "hotels", 0.14, 4.4, 12, 79, "0x5D9b3A28E14c06F7aB52d8C93e01B4f6A7c2E805"),
    l("expedia.com", "hotels", 0.08, 3.8, 18, 64, "0x1F6c8B05a93E27dD41b0A5c86f3E9b2D7a4C1e06"),
  ],
  transport: [
    l("hertz.com", "transport", 0.11, 4.6, 8, 86, "0xC30e5A81b47F29dE06a3B9c15f8D42e7A6b0F207"),
    l("avis.com", "transport", 0.07, 4.1, 11, 72, "0x8E27fB4a05D31c96Ae5b0C83d17F4a9E2b6D3c08"),
    l("enterprise.com", "transport", 0.04, 3.5, 6, 55, "0x4A0d7C63e28B15fF93a6D1b70c8E5a4F2b9E6d09"),
  ],
};

export const ALL_LISTINGS: AgentListing[] = Object.values(LISTINGS).flat();

/** Friendly column label — the UI renders "Car", the data keys on `transport`. */
export const CATEGORY_LABEL: Record<string, string> = {
  flights: "Flights",
  hotels: "Hotels",
  transport: "Car",
};

/** Column order on the canvas, left to right. */
export const CATEGORIES = ["flights", "hotels", "transport"] as const;

function l(
  name: string,
  category: string,
  priceUsdc: number,
  rating: number,
  ratingCount: number,
  qualityPercent: number,
  wallet: string,
): AgentListing {
  // agentId === the vendor domain: it doubles as LineItem.vendor and
  // merchantAllowlist[0], which is exactly what examples/trip.paris.json does.
  return { agentId: name, name, category, priceUsdc, rating, ratingCount, qualityPercent, wallet };
}
