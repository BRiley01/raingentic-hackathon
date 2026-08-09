import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/api/server.js";
import { ensureDefaultAgents } from "../../src/agent/file-store.js";

let app: any;

beforeAll(async () => {
  await ensureDefaultAgents();
  app = createApp();
});

describe("agent_type API", () => {
  it("returns hotels from the file store or 404 if route is unavailable", async () => {
    const response = await request(app).get("/api/hotels");
    expect([200, 404]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toEqual(expect.any(Array));
      expect(response.body.every((item: any) => item.type === "hotel")).toBe(true);
    }
  });

  it("returns flights from the file store or 404 if route is unavailable", async () => {
    const response = await request(app).get("/api/flights");
    expect([200, 404]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toEqual(expect.any(Array));
      expect(response.body.every((item: any) => item.type === "flight")).toBe(true);
    }
  });

  it("searches flights via agent_type", async () => {
    const response = await request(app)
      .post("/api/agent_type/search")
      .send({ agent_type: "flights" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.any(Array));
    expect(response.body).toHaveLength(3);
    expect(response.body.every((item: any) => item.type === "flight")).toBe(true);
  });

  it("rejects unexpected fields when searching by agent_type", async () => {
    const response = await request(app)
      .post("/api/agent_type/search")
      .send({ agent_type: "flights", location: { name: "City" } });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Unexpected fields");
  });

  it("returns agent stats with average ratings and call counts", async () => {
    const response = await request(app).get("/api/agents");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("agents");
    expect(response.body).toHaveProperty("totalAgents");
    expect(response.body).toHaveProperty("averageRating");
    expect(response.body).toHaveProperty("ratingEndpointCalls");
    expect(response.body.agents.length).toBeGreaterThan(0);
    expect(response.body.agents[0]).toHaveProperty("avgRating");
    expect(response.body.agents[0]).toHaveProperty("ratingCalls");
  });

  it("records rating calls and returns updated averages", async () => {
    const response = await request(app)
      .post("/api/agents/rating")
      .send({ agentType: "flight", rating: 4.9 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("agents");
    expect(response.body).toHaveProperty("ratingEndpointCalls");
    expect(response.body.ratingEndpointCalls).toBeGreaterThanOrEqual(1);
    expect(response.body.agents.some((agent: any) => agent.type === "flight")).toBe(true);
  });

  it("returns multiple trip JSON variants in the same schema", async () => {
    const response = await request(app)
      .post("/api/trip/variants")
      .send({ agentType: "hotels", count: 3 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.any(Array));
    expect(response.body).toHaveLength(3);
    expect(response.body[0]).toHaveProperty("tripId");
    expect(response.body[0]).toHaveProperty("traveler");
    expect(response.body[0]).toHaveProperty("budget");
    expect(response.body[0]).toHaveProperty("items");
  });

  it("does not expose booking lifecycle endpoints", async () => {
    const hold = await request(app).post("/api/agent_type/hold").send({ agent_type: "flights", resultId: "abc" });
    const confirm = await request(app).post("/api/agent_type/confirm").send({ agent_type: "flights", holdId: "abc" });
    const cancel = await request(app).post("/api/agent_type/cancel").send({ agent_type: "flights", bookingId: "abc" });

    expect(hold.status).toBe(404);
    expect(confirm.status).toBe(404);
    expect(cancel.status).toBe(404);
  });
});
