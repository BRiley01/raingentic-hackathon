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
      .send({ agent_type: "flights", location: { name: "City" }, dates: { start: "2026-01-01", end: "2026-01-02" } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.any(Array));
  });

  it("holds a flight via agent_type", async () => {
    const search = await request(app)
      .post("/api/agent_type/search")
      .send({ agent_type: "flights", location: { name: "City" }, dates: { start: "2026-01-01", end: "2026-01-02" } });

    const resultId = search.body[0]?.id;
    const hold = await request(app).post("/api/agent_type/hold").send({ agent_type: "flights", resultId });
    expect(hold.status).toBe(200);
    expect(hold.body).toMatchObject({ resultId });
  });

  it("confirms a flight hold via agent_type", async () => {
    const search = await request(app)
      .post("/api/agent_type/search")
      .send({ agent_type: "flights", location: { name: "City" }, dates: { start: "2026-01-01", end: "2026-01-02" } });

    const resultId = search.body[0]?.id;
    const hold = await request(app).post("/api/agent_type/hold").send({ agent_type: "flights", resultId });
    const confirm = await request(app).post("/api/agent_type/confirm").send({ agent_type: "flights", holdId: hold.body.id });
    expect(confirm.status).toBe(200);
    expect(confirm.body).toMatchObject({ status: "confirmed" });
  });

  it("cancels a flight booking via agent_type", async () => {
    const search = await request(app)
      .post("/api/agent_type/search")
      .send({ agent_type: "flights", location: { name: "City" }, dates: { start: "2026-01-01", end: "2026-01-02" } });

    const resultId = search.body[0]?.id;
    const hold = await request(app).post("/api/agent_type/hold").send({ agent_type: "flights", resultId });
    const confirm = await request(app).post("/api/agent_type/confirm").send({ agent_type: "flights", holdId: hold.body.id });
    const cancel = await request(app).post("/api/agent_type/cancel").send({ agent_type: "flights", bookingId: confirm.body.id });
    expect(cancel.status).toBe(200);
    expect(cancel.body).toMatchObject({ status: "cancelled" });
  });
});
