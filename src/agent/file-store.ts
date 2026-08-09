import fs from "fs/promises";
import path from "path";

import { DEFAULT_AGENTS, SEED_VERSION } from "./agents.seed.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const AGENTS_FILE = path.join(DATA_DIR, "agents.json");
// Stamped beside agents.json so a seed change actually reaches machines that
// already have the file — see ensureDefaultAgents().
const SEED_STAMP_FILE = path.join(DATA_DIR, ".seed-version");

const inMemoryAgentStats = {
  ratingEndpointCalls: 0,
  byType: new Map<string, { sum: number; count: number; calls: number }>(),
};

function safeNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function initializeAgentTypeStats(agents: any[]) {
  for (const agent of agents) {
    const key = String(agent.type ?? "unknown").toLowerCase();
    const current = inMemoryAgentStats.byType.get(key) ?? { sum: 0, count: 0, calls: 0 };
    const value = safeNumber(agent.rating, 0);
    current.sum += value;
    current.count += 1;
    inMemoryAgentStats.byType.set(key, current);
  }
}

export function getAgentStatsSnapshot(agents: any[] = []) {
  const normalizedAgents = agents.map((agent: any) => {
    const key = String(agent.type ?? "unknown").toLowerCase();
    const stats = inMemoryAgentStats.byType.get(key) ?? { sum: 0, count: 0, calls: 0 };
    const rating = safeNumber(agent.rating, 0);
    const avgRating = stats.count > 0 ? stats.sum / stats.count : rating;

    return {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      rating,
      avgRating,
      ratingCalls: stats.calls,
      price: safeNumber(agent.price ?? agent.amount ?? 0, 0),
      // Additive passthrough: a buyer can't shop without a price and can't pay
      // without a wallet, and the display needs ratingCount to show a rating
      // moving. Purely extra fields — nothing that read this before is affected.
      agentId: agent.agentId ?? String(agent.name ?? agent.id),
      priceUsdc: safeNumber(agent.priceUsdc ?? agent.price ?? 0, 0),
      ratingCount: safeNumber(agent.ratingCount, 0),
      qualityPercent: safeNumber(agent.qualityPercent, 0),
      wallet: agent.wallet ?? "",
    };
  });

  const totalAgents = normalizedAgents.length;
  const averageRating =
    totalAgents > 0
      ? normalizedAgents.reduce((sum, agent) => sum + safeNumber(agent.avgRating, 0), 0) / totalAgents
      : 0;

  return {
    agents: normalizedAgents,
    totalAgents,
    averageRating,
    ratingEndpointCalls: inMemoryAgentStats.ratingEndpointCalls,
  };
}

export function recordAgentRating(agentType: string, rating: number) {
  const key = String(agentType ?? "unknown").toLowerCase();
  const current = inMemoryAgentStats.byType.get(key) ?? { sum: 0, count: 0, calls: 0 };
  const value = safeNumber(rating, 0);
  current.sum += value;
  current.count += 1;
  current.calls += 1;
  inMemoryAgentStats.byType.set(key, current);
  inMemoryAgentStats.ratingEndpointCalls += 1;
}

export async function ensureDefaultAgents() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  // Re-seed when the file is missing OR was written by an older seed. Without the
  // version check, editing the seed is a silent no-op on every machine that has
  // already run the server — you get stale agents and no error saying why.
  const stamp = await fs.readFile(SEED_STAMP_FILE, "utf8").catch(() => null);
  const current = stamp !== null && Number(stamp) === SEED_VERSION;

  if (current) {
    try {
      const existingAgents = await readAgents();
      initializeAgentTypeStats(existingAgents);
      return;
    } catch {
      // Stamp present but the file is gone or corrupt — fall through and re-seed.
    }
  }

  await fs.writeFile(AGENTS_FILE, JSON.stringify(DEFAULT_AGENTS, null, 2), "utf8");
  await fs.writeFile(SEED_STAMP_FILE, String(SEED_VERSION), "utf8");
  initializeAgentTypeStats(DEFAULT_AGENTS);
}

export async function readAgents() {
  const raw = await fs.readFile(AGENTS_FILE, "utf8");
  return JSON.parse(raw);
}

export async function writeAgents(agents: any[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2), "utf8");
}
