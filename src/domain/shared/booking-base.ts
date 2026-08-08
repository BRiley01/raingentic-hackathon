// The contract EVERY booking domain implements.
// Flights, hotels, activities, transport, and dining each provide their own
// version of this interface. The orchestrator treats them all uniformly.

import type { BookingStatus, Money } from "./types.js";

export interface SearchResult {
  id: string;
  title: string;
  price: Money;
  raw?: unknown; // provider-specific payload
}

export interface Hold {
  id: string;
  resultId: string;
  expiresAt: string; // ISO 8601 — holds go stale, re-check before confirm
  status: BookingStatus;
}

export interface Booking {
  id: string;
  status: BookingStatus;
  confirmedAt?: string;
}

// TCriteria is domain-specific (flight route, hotel dates, etc.)
export interface BookingProvider<TCriteria> {
  search(criteria: TCriteria): Promise<SearchResult[]>;
  hold(resultId: string): Promise<Hold>;
  confirm(holdId: string): Promise<Booking>; // gate real payment here
  cancel(bookingId: string): Promise<Booking>;
}
