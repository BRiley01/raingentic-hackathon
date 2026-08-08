// Hotels booking provider — implements the shared BookingProvider contract.
import type {
  BookingProvider,
  SearchResult,
  Hold,
  Booking,
} from "../shared/booking-base.js";
import type { HotelsCriteria } from "./types.js";

export const hotelsProvider: BookingProvider<HotelsCriteria> = {
  async search(criteria) {
    // Mock implementation: produce several hotel SearchResult entries.
    // This mock agent is configured to produce 80% good recommendations.
    const goodProbability = 0.8; // 80% good

    function makePrice(base: number) {
      return { amount: Math.round(base + Math.random() * 150), currency: "USD" };
    }

    function makeResult(i: number) {
      const isGood = Math.random() < goodProbability;
      const rating = isGood
        ? 75 + Math.round(Math.random() * 25)
        : 30 + Math.round(Math.random() * 35);
      return {
        id: `ht-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
        title: `Mock Hotel ${i + 1} — ${criteria?.location?.name ?? "unknown"}`,
        price: makePrice(120 + i * 30),
        raw: {
          rating,
          recommended: isGood,
          provider: "mock-hotels-agent",
        },
      } as SearchResult;
    }

    const results: SearchResult[] = Array.from({ length: 6 }, (_, i) => makeResult(i));
    return results;
  },
  async hold(resultId) {
    return {
      id: `hold-${resultId}-${Date.now()}`,
      resultId,
      expiresAt: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
      status: "held",
    } as Hold;
  },
  async confirm(holdId) {
    // TODO: gate payment / human approval here before confirming
    return {
      id: `booking-${holdId}-${Date.now()}`,
      status: "confirmed",
      confirmedAt: new Date().toISOString(),
    } as Booking;
  },
  async cancel(bookingId) {
    return {
      id: bookingId,
      status: "cancelled",
    } as Booking;
  },
};
