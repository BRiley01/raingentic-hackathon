// LLM decision layer. Interprets the user request, routes to the right
// domain provider(s), and sequences results into a coherent trip.
import { flightsProvider } from "../domain/flights/booking.js";
import { hotelsProvider } from "../domain/hotels/booking.js";
import { activitiesProvider } from "../domain/activities/booking.js";
import { transportProvider } from "../domain/transport/booking.js";
import { diningProvider } from "../domain/dining/booking.js";

export const providers = {
  flights: flightsProvider,
  hotels: hotelsProvider,
  activities: activitiesProvider,
  transport: transportProvider,
  dining: diningProvider,
};

// TODO: add LLM tool-calling loop that selects providers based on user intent.
