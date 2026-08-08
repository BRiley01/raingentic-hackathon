// Hotels-specific search criteria and types.
import type { DateRange, Location } from "../shared/types.js";

export interface HotelsCriteria {
  location: Location;
  dates: DateRange;
  // TODO: add hotels-specific fields (e.g. passengers, party size, cuisine)
}
