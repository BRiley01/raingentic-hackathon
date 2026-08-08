// HTTP routes for flights. Wire these into your server framework.
import { flightsProvider } from "../../domain/flights/booking.js";

export const flightsRoutes = {
  search: flightsProvider.search,
  hold: flightsProvider.hold,
  confirm: flightsProvider.confirm,
  cancel: flightsProvider.cancel,
};
