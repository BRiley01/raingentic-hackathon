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
    // TODO: call integrations/<provider> and map to SearchResult[]
    throw new Error("hotels.search not implemented");
  },
  async hold(resultId) {
    throw new Error("hotels.hold not implemented");
  },
  async confirm(holdId) {
    // TODO: gate payment / human approval here before confirming
    throw new Error("hotels.confirm not implemented");
  },
  async cancel(bookingId) {
    throw new Error("hotels.cancel not implemented");
  },
};
