// Activities booking provider — implements the shared BookingProvider contract.
import type {
  BookingProvider,
  SearchResult,
} from "../shared/booking-base.js";
import type { ActivitiesCriteria } from "./types.js";

export const activitiesProvider: BookingProvider<ActivitiesCriteria> = {
  async search(criteria) {
    // TODO: call integrations/<provider> and map to SearchResult[]
    throw new Error("activities.search not implemented");
  },
};
