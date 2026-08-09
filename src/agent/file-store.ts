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
      // A buyer can't shop without a price and can't pay without a wallet, and the
      // display needs ratingCount to show a rating moving.
      //
      // `priceUsdc` is the ONLY price field. There was briefly a `price` alias so
      // this function could keep reading the name it already used — two names for
      // one value, which is how they drift apart.
      agentId: agent.agentId ?? String(agent.name ?? agent.id),
      priceUsdc: safeNumber(agent.priceUsdc, 0),
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

  await writeAgents(DEFAULT_AGENTS);
  await fs.writeFile(SEED_STAMP_FILE, String(SEED_VERSION), "utf8");
  initializeAgentTypeStats(DEFAULT_AGENTS);
}

export async function readAgents() {
  const raw = await fs.readFile(AGENTS_FILE, "utf8");
  return JSON.parse(raw);
}

// ---- per-agent reputation ---------------------------------------------------

/**
 * Rating writes are read-modify-write on a JSON file, so they must not interleave.
 * A swarm of buyers rating concurrently would otherwise lose votes: two readers both
 * see count=8, both write count=9, and one rating vanishes. Chaining every write
 * through one promise makes them serial.
 */
let writeChain: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = writeChain.then(work, work);
  // Keep the chain alive even if a link rejects, or every later write is poisoned.
  writeChain = next.catch(() => undefined);
  return next;
}

export interface AgentReputation {
  agentId: string;
  name: string;
  rating: number;
  ratingCount: number;
}

/**
 * Fold one rating into a single agent's running average and persist it.
 *
 * This is what `recordAgentRating` could not do: that one buckets by TYPE and keeps
 * the result in memory, so rating one hotel agent moved all three identically and a
 * restart erased everything. Reputation has to accumulate per agent and survive a
 * restart, or "rating drives the next decision" is a claim nothing backs up.
 *
 * Returns null when the agent doesn't exist.
 */
export async function recordAgentRatingById(
  agentId: string,
  stars: number,
): Promise<AgentReputation | null> {
  return serialize(async () => {
    const agents = await readAgents();
    const wanted = String(agentId).toLowerCase();
    const agent = agents.find(
      (a: any) =>
        String(a.agentId ?? "").toLowerCase() === wanted ||
        String(a.name ?? "").toLowerCase() === wanted,
    );
    if (!agent) return null;

    const ratingCount = safeNumber(agent.ratingCount, 0) + 1;
    const previousTotal = safeNumber(agent.rating, 0) * (ratingCount - 1);
    // 2dp is what the wire carries; the UI shows 1dp and leans on the count plus the
    // delta flash for the rest.
    const rating = Math.round(((previousTotal + safeNumber(stars, 0)) / ratingCount) * 100) / 100;

    agent.rating = rating;
    agent.ratingCount = ratingCount;
    await writeAgents(agents);

    // Keep the type-level aggregate in step so the old endpoint's numbers stay
    // consistent with reality.
    recordAgentRating(String(agent.type ?? "unknown"), stars);

    return { agentId: agent.agentId, name: agent.name, rating, ratingCount };
  });
}

/**
 * Restore every rating to its seeded value.
 *
 * Necessary the moment ratings persist: otherwise each rehearsal starts from
 * wherever the last one left off, and there's no way back to the state the demo was
 * designed around short of deleting files.
 */
export async function resetAgentRatings(): Promise<void> {
  return serialize(async () => {
    await writeAgents(DEFAULT_AGENTS);
    await fs.writeFile(SEED_STAMP_FILE, String(SEED_VERSION), "utf8");
    inMemoryAgentStats.byType.clear();
    inMemoryAgentStats.ratingEndpointCalls = 0;
    initializeAgentTypeStats(DEFAULT_AGENTS);
  });
}

/**
 * Write atomically: temp file, then rename.
 *
 * `writeFile` truncates and refills, so a concurrent reader can catch the file
 * half-written and blow up on JSON.parse. Rename is atomic on POSIX, so a reader sees
 * either the old contents or the new ones and never a fragment. This is not
 * theoretical — it broke reads as soon as ratings started being written during a run,
 * and the swarm is nothing but writes happening while the canvas reads.
 */
export async function writeAgents(agents: any[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temp = `${AGENTS_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(agents, null, 2), "utf8");
  await fs.rename(temp, AGENTS_FILE);
}
