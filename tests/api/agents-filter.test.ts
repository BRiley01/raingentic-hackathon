import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/api/server.js";
import { ensureDefaultAgents } from "../../src/agent/file-store.js";

const app = createApp();

describe("GET /api/agents?type=", () => {
  beforeAll(async () => {
    await ensureDefaultAgents();
  });

  it("returns every agent with no filter", async () => {
    const res = await request(app).get("/api/agents");
    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(9);
    expect(res.body.totalAgents).toBe(9);
  });

  it("filters to one type", async () => {
    const res = await request(app).get("/api/agents?type=hotel");
    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(3);
    expect(res.body.agents.every((a: any) => a.type === "hotel")).toBe(true);
  });

  it("accepts the plural form, since callers will guess either", async () => {
    const singular = await request(app).get("/api/agents?type=hotel");
    const plural = await request(app).get("/api/agents?type=hotels");
    expect(plural.status).toBe(200);
    expect(plural.body.agents.map((a: any) => a.agentId)).toEqual(
      singular.body.agents.map((a: any) => a.agentId),
    );
  });

  it("is case- and whitespace-insensitive", async () => {
    const res = await request(app).get("/api/agents?type=%20Car%20");
    expect(res.status).toBe(200);
    expect(res.body.agents.every((a: any) => a.type === "car")).toBe(true);
  });

  // The important one: a typo must not look like "no agents of that kind".
  it("rejects an unknown type with the valid values", async () => {
    const res = await request(app).get("/api/agents?type=hotell");
    expect(res.status).toBe(400);
    expect(res.body.valid).toEqual(["flight", "hotel", "car"]);
  });

  it("keeps the same response shape when filtered, so callers never branch", async () => {
    const res = await request(app).get("/api/agents?type=flight");
    for (const key of ["agents", "totalAgents", "averageRating", "ratingEndpointCalls"]) {
      expect(res.body).toHaveProperty(key);
    }
    // totalAgents describes the RESULT SET, not the whole marketplace.
    expect(res.body.totalAgents).toBe(3);
  });

  it("carries what a buyer needs to shop and pay", async () => {
    const res = await request(app).get("/api/agents?type=car");
    const agent = res.body.agents[0];
    expect(agent.agentId).toBeTruthy();
    expect(agent.name).toBeTruthy();
    expect(agent.priceUsdc).toBeGreaterThan(0);
    expect(agent.wallet).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(agent.ratingCount).toBeGreaterThan(0);
  });
});
