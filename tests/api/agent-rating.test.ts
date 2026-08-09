import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/api/server.js";
import { ensureDefaultAgents, resetAgentRatings } from "../../src/agent/file-store.js";

let app: any;

const AGENT = "avis.com"; // seeded 4.1 / 11 ratings
const SIBLING = "hertz.com"; // same type ("car") — must NOT move when AGENT is rated

beforeAll(async () => {
  await ensureDefaultAgents();
  app = createApp();
});

// Ratings persist to data/agents.json now, so leave the file as we found it.
afterAll(async () => {
  await resetAgentRatings();
});

const read = async (agentId: string) =>
  (await request(app).get(`/api/agents/${encodeURIComponent(agentId)}`)).body;

const rate = (agentId: string, stars: number) =>
  request(app).post(`/api/agents/${encodeURIComponent(agentId)}/rating`).send({ stars });

describe("POST /api/agents/:agentId/rating", () => {
  it("folds the rating into that agent and returns the new reputation", async () => {
    const before = await read(AGENT);
    const res = await rate(AGENT, 5);

    expect(res.status).toBe(200);
    expect(res.body.agentId).toBe(before.agentId);
    expect(res.body.ratingCount).toBe(before.ratingCount + 1);

    const expected =
      Math.round(
        ((before.rating * before.ratingCount + 5) / (before.ratingCount + 1)) * 100,
      ) / 100;
    expect(res.body.rating).toBeCloseTo(expected, 5);
  });

  it("persists — a fresh read sees the new value", async () => {
    const before = await read(AGENT);
    await rate(AGENT, 5);
    const after = await read(AGENT);

    expect(after.ratingCount).toBe(before.ratingCount + 1);
    expect(after.rating).toBeGreaterThan(before.rating); // 5★ on a ~4.1 agent
  });

  // The defect this endpoint exists to fix: the old one bucketed by type.
  it("does not move other agents of the same type", async () => {
    const siblingBefore = await read(SIBLING);
    await rate(AGENT, 1);
    const siblingAfter = await read(SIBLING);

    expect(siblingAfter.rating).toBe(siblingBefore.rating);
    expect(siblingAfter.ratingCount).toBe(siblingBefore.ratingCount);
  });

  it("moves the average in the right direction", async () => {
    const before = await read(AGENT);
    await rate(AGENT, 1);
    const after = await read(AGENT);
    expect(after.rating).toBeLessThan(before.rating);
  });

  it("loses no votes under concurrent writes", async () => {
    const before = await read(AGENT);
    await Promise.all(Array.from({ length: 12 }, () => rate(AGENT, 4)));
    const after = await read(AGENT);
    // Read-modify-write on a JSON file: without serialisation these interleave and
    // votes vanish.
    expect(after.ratingCount).toBe(before.ratingCount + 12);
  });

  it("rejects out-of-range and non-numeric stars", async () => {
    for (const stars of [0, 6, -1, "many"]) {
      const res = await rate(AGENT, stars as number);
      expect(res.status).toBe(400);
    }
  });

  it("404s an unknown agent", async () => {
    expect((await rate("nope.example", 5)).status).toBe(404);
  });
});

describe("POST /api/marketplace/reset", () => {
  it("restores seeded ratings so a rehearsal can start clean", async () => {
    await rate(AGENT, 1);
    await rate(AGENT, 1);
    const dirty = await read(AGENT);
    expect(dirty.ratingCount).toBeGreaterThan(11);

    const res = await request(app).post("/api/marketplace/reset");
    expect(res.status).toBe(200);

    const clean = await read(AGENT);
    expect(clean.rating).toBe(4.1);
    expect(clean.ratingCount).toBe(11);
  });
});
