// HTTP routes for activities. Wire these into your server framework.
import { activitiesProvider } from "../../domain/activities/booking.js";

export const activitiesRoutes = {
  search: activitiesProvider.search,
  hold: activitiesProvider.hold,
  confirm: activitiesProvider.confirm,
  cancel: activitiesProvider.cancel,
};
