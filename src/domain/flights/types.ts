// Flights-specific search criteria and types.
import type { DateRange, Location } from "../shared/types.js";

export interface FlightsCriteria {
  location: Location;
  dates: DateRange;
  // TODO: add flights-specific fields (e.g. passengers, party size, cuisine)
}
