// Activities-specific search criteria and types.
import type { DateRange, Location } from "../shared/types.js";

export interface ActivitiesCriteria {
  location: Location;
  dates: DateRange;
  // TODO: add activities-specific fields (e.g. passengers, party size, cuisine)
}
