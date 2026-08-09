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
    rating: 4.5,
  },
  {
    id: 3,
    name: "Flight Agent Sucks",
    type: "flight",
    qualityPercent: 10,
    rating: 4.5,
  },
];

export async function ensureDefaultAgents() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.stat(AGENTS_FILE);
    return;
  } catch (err) {
    // file doesn't exist — write defaults
    await fs.writeFile(AGENTS_FILE, JSON.stringify(DEFAULT_AGENTS, null, 2), "utf8");
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
