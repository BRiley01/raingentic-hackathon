// HTTP routes for dining. Wire these into your server framework.
import { diningProvider } from "../../domain/dining/booking.js";

export const diningRoutes = {
  search: diningProvider.search,
  hold: diningProvider.hold,
  confirm: diningProvider.confirm,
  cancel: diningProvider.cancel,
};
