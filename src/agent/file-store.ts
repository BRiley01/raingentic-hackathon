import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const AGENTS_FILE = path.join(DATA_DIR, "agents.json");

const DEFAULT_AGENTS = [
  {
    id: 1,
    name: "Mock Hotel 1",
    type: "hotel",
    qualityPercent: 85,
    rating: 4.5,
  },
  {
    id: 2,
    name: "Flight Agent Supreme",
    type: "flight",
    qualityPercent: 99,
    rating: 4.9,
  },
  {
    id: 3,
    name: "Flight Agent Mid",
    type: "flight",
    qualityPercent: 72,
    rating: 4.6,
  },
  {
    id: 4,
    name: "Flight Agent Sucks",
    type: "flight",
    qualityPercent: 10,
    rating: 3.2,
  },
];

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
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.stat(AGENTS_FILE);
    const existingAgents = await readAgents();
    initializeAgentTypeStats(existingAgents);
    return;
  } catch (err) {
    await fs.writeFile(AGENTS_FILE, JSON.stringify(DEFAULT_AGENTS, null, 2), "utf8");
    initializeAgentTypeStats(DEFAULT_AGENTS);
  }
}

export async function readAgents() {
  const raw = await fs.readFile(AGENTS_FILE, "utf8");
  return JSON.parse(raw);
}

export async function writeAgents(agents: any[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(AGENTS_FILE, JSON.stringify(agents, null, 2), "utf8");
}
