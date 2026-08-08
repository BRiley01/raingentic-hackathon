// Flights booking provider — implements the shared BookingProvider contract.
import type {
  BookingProvider,
  SearchResult,
  Hold,
  Booking,
} from "../shared/booking-base.js";
import type { FlightsCriteria } from "./types.js";

export const flightsProvider: BookingProvider<FlightsCriteria> = {
  async search(criteria) {
    // TODO: call integrations/<provider> and map to SearchResult[]
    throw new Error("flights.search not implemented");
  },
  async hold(resultId) {
    throw new Error("flights.hold not implemented");
  },
  async confirm(holdId) {
    // TODO: gate payment / human approval here before confirming
    throw new Error("flights.confirm not implemented");
  },
  async cancel(bookingId) {
    throw new Error("flights.cancel not implemented");
  },
};
