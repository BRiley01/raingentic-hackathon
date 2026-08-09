// Transport booking provider — implements the shared BookingProvider contract.
import type {
  BookingProvider,
  SearchResult,
} from "../shared/booking-base.js";
import type { TransportCriteria } from "./types.js";

export const transportProvider: BookingProvider<TransportCriteria> = {
  async search(criteria) {
    // TODO: call integrations/<provider> and map to SearchResult[]
    throw new Error("transport.search not implemented");
  },
};
