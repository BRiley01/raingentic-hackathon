import fs from "fs/promises";
import path from "path";
import express from "express";
import { providers } from "../../agent/orchestrator.js";
import {
  ensureDefaultAgents,
  getAgentStatsSnapshot,
  readAgents,
  recordAgentRating,
} from "../../agent/file-store.js";
import eventRoutes from "./events.js";
import marketplaceRoutes from "./marketplace.js";

const router = express.Router();
const EXAMPLE_TRIP_PATH = path.resolve(process.cwd(), "examples", "trip.paris.json");

// Live demo event stream (SSE) — see src/events/bus.ts.
router.use(eventRoutes);

// Seller side of the marketplace: POST /agents/:agentId/query.
router.use(marketplaceRoutes);

const getProvider = (agentType: string) => {
  const key = agentType.toLowerCase();
  const provider = (providers as any)[key];
  if (!provider) {
    throw new Error(`Unknown agent_type: ${agentType}`);
  }
  return provider;
};

const handleAgentSearch = async (req: any, res: any) => {
  try {
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const allowedFields = new Set(["agent_type", "agentType"]);
    const unexpectedFields = Object.keys(body).filter((key) => !allowedFields.has(key));

    if (unexpectedFields.length > 0) {
      return res.status(400).json({ error: `Unexpected fields: ${unexpectedFields.join(", ")}` });
    }

    const agentType = body.agent_type ?? body.agentType;
    if (!agentType) {
      return res.status(400).json({ error: "agent_type is required" });
    }

    await ensureDefaultAgents();
    const agents = await readAgents();
    const normalizedType = String(agentType).toLowerCase();
    const matches = agents.filter((agent: any) => {
      const type = String(agent.type ?? "").toLowerCase();
      return type === normalizedType || type === normalizedType.replace(/s$/, "");
    });

    return res.json(matches);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};

const loadTripTemplate = async () => {
  const raw = await fs.readFile(EXAMPLE_TRIP_PATH, "utf8");
  return JSON.parse(raw);
};

router.get("/health", (_req: any, res: any) => res.json({ ok: true }));

router.get("/agents", async (_req: any, res: any) => {
  await ensureDefaultAgents();
  const agents = await readAgents();
  res.json(getAgentStatsSnapshot(agents));
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

router.post("/agent_type/search", async (req: any, res: any) => handleAgentSearch(req, res));

export default router;
