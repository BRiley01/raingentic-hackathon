// LLM decision layer. Interprets the user request, routes to the right
// domain provider(s), and sequences results into a coherent trip.
import { flightsProvider } from "../domain/flights/booking.js";
import { hotelsProvider } from "../domain/hotels/booking.js";
import { activitiesProvider } from "../domain/activities/booking.js";
import { transportProvider } from "../domain/transport/booking.js";
import { diningProvider } from "../domain/dining/booking.js";
import { readAgents, ensureDefaultAgents } from "../agent/file-store.js";

export const providers = {
  flights: flightsProvider,
  hotels: hotelsProvider,
  activities: activitiesProvider,
  transport: transportProvider,
  dining: diningProvider,
};


// Route a JSON request from the super-agent to the mock providers (flights/hotels)
// The `requestJson` is expected to optionally contain domain-specific
// criteria under keys like `flights` and `hotels`. If those keys are absent
// the same JSON is forwarded to both providers.
export async function routeRequestToMocks(requestJson: any) {
  const flightsCriteria = requestJson.flights ?? requestJson;
  const hotelsCriteria = requestJson.hotels ?? requestJson;

  const [flightsResults, hotelsResults] = await Promise.all([
    providers.flights.search(flightsCriteria),
    providers.hotels.search(hotelsCriteria),
  ]);

  return {
    flights: flightsResults,
    hotels: hotelsResults,
  };
}

//function to curl the openai api to get the llm response

// Produce a fixed list of agent quality summaries in the shape you requested.
// This intentionally returns deterministic values (ids, names, types, qualityPercent, rating).
export async function produceFixedAgentOutput() {
  // ensure the file exists with defaults, then read and return its contents
  await ensureDefaultAgents();
  const agents = await readAgents();
  return agents;
}

