import fs from "fs/promises";
import path from "path";
import express from "express";
import {
  ensureDefaultAgents,
  getAgentStatsSnapshot,
  readAgents,
  recordAgentRating,
} from "../../agent/file-store.js";
import { AGENT_TYPES, parseAgentType } from "../../agent/agents.seed.js";
import eventRoutes from "./events.js";
import marketplaceRoutes from "./marketplace.js";

const router = express.Router();
const EXAMPLE_TRIP_PATH = path.resolve(process.cwd(), "examples", "trip.paris.json");

// Live demo event stream (SSE) — see src/events/bus.ts.
router.use(eventRoutes);

// Seller side of the marketplace: POST /agents/:agentId/query.
router.use(marketplaceRoutes);

const loadTripTemplate = async () => {
  const raw = await fs.readFile(EXAMPLE_TRIP_PATH, "utf8");
  return JSON.parse(raw);
};

router.get("/health", (_req: any, res: any) => res.json({ ok: true }));

// GET /agents            every listing
// GET /agents?type=hotel  one category (singular or plural both accepted)
//
// The response shape is identical either way, so a caller never has to branch —
// note that means `totalAgents` and `averageRating` describe the RESULT SET, not
// the whole marketplace, when a filter is applied.
router.get("/agents", async (req: any, res: any) => {
  const type = parseAgentType(req.query.type);
  if (type === null) {
    // Deliberately not an empty array: with only three valid values, a silent []
    // means a typo is indistinguishable from "no agents of that kind".
    return res.status(400).json({
      error: `unknown type: ${req.query.type}`,
      valid: AGENT_TYPES,
    });
  }

  await ensureDefaultAgents();
  const agents = await readAgents();
  const matching = type
    ? agents.filter((agent: any) => String(agent.type ?? "").toLowerCase() === type)
    : agents;

  return res.json(getAgentStatsSnapshot(matching));
});

router.post("/agents/rating", async (req: any, res: any) => {
  try {
    const agentType = String(req.body.agentType ?? req.body.agent_type ?? "unknown");
    const rating = Number(req.body.rating ?? req.body.score ?? 0);

    if (!Number.isFinite(rating)) {
      return res.status(400).json({ error: "rating must be a number" });
    }

    recordAgentRating(agentType, rating);
    const agents = await readAgents();
    return res.json(getAgentStatsSnapshot(agents));
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

router.post("/trip/variants", async (req: any, res: any) => {
  try {
    const count = Math.max(1, Number(req.body.count ?? req.body.quantity ?? 3));
    const agentType = String(req.body.agentType ?? req.body.agent_type ?? "hotels").toLowerCase();
    const tripTemplate = await loadTripTemplate();
    const variants: any[] = [];

    for (let index = 0; index < count; index += 1) {
      const variant = JSON.parse(JSON.stringify(tripTemplate));
      variant.tripId = `${tripTemplate.tripId}-${agentType}-variant-${index + 1}`;
      variant.traveler.id = `${tripTemplate.traveler.id}-${index + 1}`;
      variant.traveler.name = `${tripTemplate.traveler.name} ${index + 1}`;

      variant.items = tripTemplate.items.map((item: any, itemIndex: number) => {
        const nextItem = { ...item };
        nextItem.id = `${item.id}-${index + 1}`;
        nextItem.label = `${item.label} — variant ${index + 1}`;
        nextItem.maxSpend = {
          ...item.maxSpend,
          amountCents: item.maxSpend.amountCents + ((index + 1) * 1500 + itemIndex * 750),
        };
        return nextItem;
      });

      variants.push(variant);
    }

    return res.json(variants);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
