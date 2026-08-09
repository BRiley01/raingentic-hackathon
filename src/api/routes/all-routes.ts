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

const handleAgentSearch = async (req: any, res: any) => {
  try {
    const agentType = req.body.agent_type ?? req.body.agentType;
    const provider = getProvider(agentType);
    const results = await provider.search(req.body);
    return res.json(results);
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

router.post("/agent_type/search", async (req: any, res: any) => handleAgentSearch(req, res));

export default router;
