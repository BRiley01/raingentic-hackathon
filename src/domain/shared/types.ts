// Common primitives shared by every booking domain.

export interface Money {
  amount: number;
  currency: string;
}

export interface DateRange {
  start: string; // ISO 8601
  end: string;   // ISO 8601
}

export interface Location {
  name: string;
  lat?: number;
  lng?: number;
  code?: string; // airport/station code where relevant
}

export interface Traveler {
  id: string;
  name: string;
  email?: string;
}

export type BookingStatus = "searched" | "held" | "confirmed" | "cancelled";
