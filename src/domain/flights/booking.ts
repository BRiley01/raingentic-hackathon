// Flights booking provider — implements the shared BookingProvider contract.
import type {
  BookingProvider,
  SearchResult,
} from "../shared/booking-base.js";
import type { FlightsCriteria } from "./types.js";

export const flightsProvider: BookingProvider<FlightsCriteria> = {
  async search(criteria) {
    // Mock implementation: produce several flight SearchResult entries.
    // This mock agent is configured to produce 60% bad recommendations
    // (i.e. 40% good). Good results have higher 'rating' values.
    const goodProbability = 0.4; // 40% good, 60% bad

    function makePrice(base: number) {
      return { amount: Math.round(base + Math.random() * 200), currency: "USD" };
    }

    function makeResult(i: number) {
      const isGood = Math.random() < goodProbability;
      const rating = isGood
        ? 70 + Math.round(Math.random() * 30)
        : 20 + Math.round(Math.random() * 40);
      return {
        id: `fl-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
        title: `Mock Flight ${i + 1} — ${criteria?.location?.name ?? "unknown"}`,
        price: makePrice(200 + i * 50),
        raw: {
          rating,
          recommended: isGood,
          provider: "mock-flights-agent",
        },
      } as SearchResult;
    }

    // generate a small list of results
    const results: SearchResult[] = Array.from({ length: 5 }, (_, i) => makeResult(i));
    return results;
  },
};
