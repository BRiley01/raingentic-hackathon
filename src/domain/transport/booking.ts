// Transport booking provider — implements the shared BookingProvider contract.
import type {
  BookingProvider,
  SearchResult,
  Hold,
  Booking,
} from "../shared/booking-base.js";
import type { TransportCriteria } from "./types.js";

export const transportProvider: BookingProvider<TransportCriteria> = {
  async search(criteria) {
    // TODO: call integrations/<provider> and map to SearchResult[]
    throw new Error("transport.search not implemented");
  },
  async hold(resultId) {
    throw new Error("transport.hold not implemented");
  },
  async confirm(holdId) {
    // TODO: gate payment / human approval here before confirming
    throw new Error("transport.confirm not implemented");
  },
  async cancel(bookingId) {
    throw new Error("transport.cancel not implemented");
  },
};
