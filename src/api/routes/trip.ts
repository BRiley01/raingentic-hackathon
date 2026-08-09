// The tier-1 → tier-2 handoff over HTTP.
//
//   POST /api/trip/plan     dry run: would this allocate?
//   POST /api/trip/settle   the real thing: allocate, issue scoped cards, charge
//
// These exist because allocate() and provisionAndSettle() were reachable only
// in-process, so any client in its own process could not reach tier 2 at all. Both share
// one implementation with the MCP `settle_trip` tool (src/trip/service.ts).

import express from "express";
import { parseTripRequest } from "../../domain/shared/trip.js";
import { planTrip, settleTrip } from "../../trip/service.js";

const router = express.Router();

/** Parse at the boundary and report every problem, not just the first. */
function parseBody(body: unknown) {
  const parsed = parseTripRequest(body);
  return parsed;
}

router.post("/trip/plan", async (req: any, res: any) => {
  let trip;
  try {
    trip = parseBody(req.body);
  } catch (err: any) {
    return res.status(400).json({ error: "invalid TripRequest", issues: err?.issues ?? String(err) });
  }

  const outcome = planTrip(trip);
  if (!outcome.ok) return res.status(422).json(outcome);
  return res.json(outcome);
});

router.post("/trip/settle", async (req: any, res: any) => {
  let trip;
  try {
    trip = parseBody(req.body);
  } catch (err: any) {
    return res.status(400).json({ error: "invalid TripRequest", issues: err?.issues ?? String(err) });
  }

  try {
    const outcome = await settleTrip(trip);
    // A refused allocation is a 422, not a 500: the request was well-formed, the plan
    // just wasn't allowed. Nothing was provisioned.
    if (!outcome.ok) return res.status(422).json(outcome);
    return res.json(outcome);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
