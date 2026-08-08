// Transport-specific search criteria and types.
import type { DateRange, Location } from "../shared/types.js";

export interface TransportCriteria {
  location: Location;
  dates: DateRange;
  // TODO: add transport-specific fields (e.g. passengers, party size, cuisine)
}
