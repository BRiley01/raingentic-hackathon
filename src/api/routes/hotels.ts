// HTTP routes for hotels. Wire these into your server framework.
import { hotelsProvider } from "../../domain/hotels/booking.js";

export const hotelsRoutes = {
  search: hotelsProvider.search,
  hold: hotelsProvider.hold,
  confirm: hotelsProvider.confirm,
  cancel: hotelsProvider.cancel,
};
