// Activities booking provider — implements the shared BookingProvider contract.
import type {
  BookingProvider,
  SearchResult,
  Hold,
  Booking,
} from "../shared/booking-base.js";
import type { ActivitiesCriteria } from "./types.js";

export const activitiesProvider: BookingProvider<ActivitiesCriteria> = {
  async search(criteria) {
    // TODO: call integrations/<provider> and map to SearchResult[]
    throw new Error("activities.search not implemented");
  },
  async hold(resultId) {
    throw new Error("activities.hold not implemented");
  },
  async confirm(holdId) {
    // TODO: gate payment / human approval here before confirming
    throw new Error("activities.confirm not implemented");
  },
  async cancel(bookingId) {
    throw new Error("activities.cancel not implemented");
  },
};
