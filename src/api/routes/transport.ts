// HTTP routes for transport. Wire these into your server framework.
import { transportProvider } from "../../domain/transport/booking.js";

export const transportRoutes = {
  search: transportProvider.search,
  hold: transportProvider.hold,
  confirm: transportProvider.confirm,
  cancel: transportProvider.cancel,
};
