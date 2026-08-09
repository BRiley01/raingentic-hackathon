import express from "express";
import { providers } from "../../agent/orchestrator.js";
import { ensureDefaultAgents, readAgents } from "../../agent/file-store.js";

const router = express.Router();

const getProvider = (agentType: string) => {
  const key = agentType.toLowerCase();
  const provider = (providers as any)[key];
  if (!provider) {
    throw new Error(`Unknown agent_type: ${agentType}`);
  }
  return provider;
};

const handleAgentAction = async (req: any, res: any, action: "search" | "hold" | "confirm" | "cancel") => {
  try {
    const agentType = req.body.agent_type ?? req.body.agentType;
    const provider = getProvider(agentType);

    if (action === "search") {
      const results = await provider.search(req.body);
      return res.json(results);
    }

    if (action === "hold") {
      const { resultId } = req.body;
      const hold = await provider.hold(resultId);
      return res.json(hold);
    }

    if (action === "confirm") {
      const { holdId } = req.body;
      const booking = await provider.confirm(holdId);
      return res.json(booking);
    }

    if (action === "cancel") {
      const { bookingId } = req.body;
      const cancelled = await provider.cancel(bookingId);
      return res.json(cancelled);
    }

    res.status(400).json({ error: "Invalid action" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
};

router.get("/health", (_req: any, res: any) => res.json({ ok: true }));

router.get("/agents", async (_req: any, res: any) => {
  await ensureDefaultAgents();
  const agents = await readAgents();
  res.json(agents);
});

router.post("/agent_type/search", async (req: any, res: any) => handleAgentAction(req, res, "search"));
router.post("/agent_type/hold", async (req: any, res: any) => handleAgentAction(req, res, "hold"));
router.post("/agent_type/confirm", async (req: any, res: any) => handleAgentAction(req, res, "confirm"));
router.post("/agent_type/cancel", async (req: any, res: any) => handleAgentAction(req, res, "cancel"));

export default router;
