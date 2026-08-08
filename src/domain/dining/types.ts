// Dining-specific search criteria and types.
import type { DateRange, Location } from "../shared/types.js";

export interface DiningCriteria {
  location: Location;
  dates: DateRange;
  // TODO: add dining-specific fields (e.g. passengers, party size, cuisine)
}
