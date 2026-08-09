// Dining booking provider — implements the shared BookingProvider contract.
import type {
  BookingProvider,
  SearchResult,
} from "../shared/booking-base.js";
import type { DiningCriteria } from "./types.js";

export const diningProvider: BookingProvider<DiningCriteria> = {
  async search(criteria) {
    // TODO: call integrations/<provider> and map to SearchResult[]
    throw new Error("dining.search not implemented");
  },
};
