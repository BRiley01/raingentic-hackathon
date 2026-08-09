import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/api/server.js";
import { ensureDefaultAgents } from "../../src/agent/file-store.js";

let app: any;

beforeAll(async () => {
  await ensureDefaultAgents();
  app = createApp();
});

describe("marketplace API", () => {
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
    const hold = await request(app).post("/api/agent_type/hold").send({ agent_type: "flights" });
    const confirm = await request(app).post("/api/agent_type/confirm").send({ agent_type: "flights" });
    const cancel = await request(app).post("/api/agent_type/cancel").send({ agent_type: "flights" });

    expect(hold.status).toBe(404);
    expect(confirm.status).toBe(404);
    expect(cancel.status).toBe(404);
  });

  // Deleted in favour of GET /api/agents?type=. It was a POST for a read, snake_case
  // where nothing else is, and returned agents in a different shape from
  // GET /api/agents — two endpoints, two shapes, one job.
  it("no longer exposes the agent_type search endpoint", async () => {
    const response = await request(app)
      .post("/api/agent_type/search")
      .send({ agent_type: "flights" });

    expect(response.status).toBe(404);
  });
});
