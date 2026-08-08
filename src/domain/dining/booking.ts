// Dining booking provider — implements the shared BookingProvider contract.
import type {
  BookingProvider,
  SearchResult,
  Hold,
  Booking,
} from "../shared/booking-base.js";
import type { DiningCriteria } from "./types.js";

export const diningProvider: BookingProvider<DiningCriteria> = {
  async search(criteria) {
    // TODO: call integrations/<provider> and map to SearchResult[]
    throw new Error("dining.search not implemented");
  },
  async hold(resultId) {
    throw new Error("dining.hold not implemented");
  },
  async confirm(holdId) {
    // TODO: gate payment / human approval here before confirming
    throw new Error("dining.confirm not implemented");
  },
  async cancel(bookingId) {
    throw new Error("dining.cancel not implemented");
  },
};
