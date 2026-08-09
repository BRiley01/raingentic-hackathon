// The contract every search provider implements.
// Flights, hotels, activities, transport, and dining each provide their own
// version of this interface. The orchestrator treats them uniformly for query
// and recommendation flows without exposing booking lifecycle operations.

import type { Money } from "./types.js";

export interface SearchResult {
  id: string;
  title: string;
  price: Money;
  raw?: unknown; // provider-specific payload
}

// TCriteria is domain-specific (flight route, hotel dates, etc.)
export interface BookingProvider<TCriteria> {
  search(criteria: TCriteria): Promise<SearchResult[]>;
}
