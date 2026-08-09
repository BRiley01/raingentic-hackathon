import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/api/server.js";
import { ensureDefaultAgents } from "../../src/agent/file-store.js";
import { LineItemSchema } from "../../src/domain/shared/trip.js";

let app: any;

// booking.com — qualityPercent 91, so draws should centre near 0.91.
const GOOD = "booking.com";
const WEAK = "expedia.com"; // qualityPercent 64

beforeAll(async () => {
  await ensureDefaultAgents();
  app = createApp();
});

const query = (agentId: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/agents/${encodeURIComponent(agentId)}/query`).send(body);

describe("GET /api/agents/:agentId", () => {
  it("returns one listing", async () => {
    const res = await request(app).get(`/api/agents/${GOOD}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(GOOD);
    expect(res.body.priceUsdc).toBeGreaterThan(0);
    expect(res.body.wallet).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  // The knob that predetermines answer quality must never reach a buyer.
  it("does not leak qualityPercent", async () => {
    const res = await request(app).get(`/api/agents/${GOOD}`);
    expect(res.body).not.toHaveProperty("qualityPercent");
  });

  it("404s an unknown agent", async () => {
    const res = await request(app).get("/api/agents/nope.example");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/agents/:agentId/query", () => {
  it("returns a valid LineItem and a quality score", async () => {
    const res = await query(GOOD, { seed: 1 });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(GOOD);
    expect(res.body.quality).toBeGreaterThan(0);
    expect(res.body.quality).toBeLessThanOrEqual(1);
    expect(LineItemSchema.safeParse(res.body.lineItem).success).toBe(true);
  });

  it("is reproducible for a given seed", async () => {
    const a = await query(GOOD, { seed: 42 });
    const b = await query(GOOD, { seed: 42 });
    expect(a.body.quality).toBe(b.body.quality);
  });

  it("varies across seeds — the whole point of a draw", async () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 8; seed++) {
      const res = await query(GOOD, { seed });
      seen.add(res.body.quality);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("centres on the agent's own quality, and a weak agent scores lower", async () => {
    const mean = async (agentId: string) => {
      let total = 0;
      const n = 60;
      for (let seed = 1; seed <= n; seed++) {
        total += (await query(agentId, { seed })).body.quality;
      }
      return total / n;
    };

    const good = await mean(GOOD);
    const weak = await mean(WEAK);

    expect(good).toBeGreaterThan(0.83);
    expect(good).toBeLessThan(0.99);
    expect(weak).toBeLessThan(good - 0.1);
  });

  // The run must never fail because of an unlucky roll. A rejected allocation is a
  // beat to stage deliberately, not one to leave to chance in front of judges.
  it("never quotes above a supplied cap, however bad the draw", async () => {
    const capCents = 40_000;
    for (let seed = 1; seed <= 40; seed++) {
      const res = await query(WEAK, { seed, capCents });
      expect(res.body.lineItem.maxSpend.amountCents).toBeLessThanOrEqual(capCents);
    }
  });

  it("can still exceed when no cap is given — how the rejection is reachable", async () => {
    const res = await query(WEAK, { seed: 7 });
    expect(res.body.lineItem.maxSpend.amountCents).toBeGreaterThan(40_000);
  });

  it("fills vendor and allowlist from the agent's name", async () => {
    const res = await query(GOOD, { seed: 3 });
    expect(res.body.lineItem.vendor).toBe(GOOD);
    expect(res.body.lineItem.merchantAllowlist).toEqual([GOOD]);
  });

  it("404s an unknown agent", async () => {
    const res = await query("nope.example");
    expect(res.status).toBe(404);
  });
});
