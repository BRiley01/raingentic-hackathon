// Drives the MCP server with a REAL MCP client over Streamable HTTP — the same
// transport rain-cli uses. Asserting the tool handlers in isolation would prove nothing
// about whether an MCP client can actually talk to us.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../../src/api/server.js";
import { ensureDefaultAgents, resetAgentRatings } from "../../src/agent/file-store.js";
import { clearRun } from "../../src/marketplace/run-state.js";
import { history, reset as resetEvents } from "../../src/events/bus.js";

let http: Server;
let baseUrl: string;

beforeAll(async () => {
  await ensureDefaultAgents();
  await new Promise<void>((resolve) => {
    http = createApp().listen(0, () => resolve());
  });
  const address = http.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/mcp`;
});

afterAll(async () => {
  await resetAgentRatings();
  clearRun();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

async function connect() {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(baseUrl)));
  return client;
}

const textOf = (result: any) =>
  (result.content ?? []).map((c: any) => c.text ?? "").join("\n");

const call = (client: Client, name: string, args: Record<string, unknown> = {}) =>
  client.callTool({ name, arguments: args }) as Promise<any>;

describe("MCP marketplace server", () => {
  it("advertises the tools an agent needs to shop", async () => {
    const client = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(
      ["hire_agent", "list_agents", "rate_agent", "settle_trip", "start_trip_run", "trip_status"].sort(),
    );
    await client.close();
  });

  it("refuses to shop before a run is started", async () => {
    clearRun();
    const client = await connect();
    const res = await call(client, "list_agents", { category: "hotel" });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/start_trip_run/);
    await client.close();
  });

  it("requires reasoning to spend money", async () => {
    const client = await connect();
    await call(client, "start_trip_run", { goal: "Paris", budgetUsd: 1800 });
    // Under the 10-char minimum: the schema should reject it outright.
    const res = await call(client, "hire_agent", { agentId: "booking.com", reasoning: "eh" });
    expect(res.isError).toBe(true);
    await client.close();
  });

  it("runs a whole trip end to end and emits the contract's events", async () => {
    clearRun();
    resetEvents();
    await resetAgentRatings();
    const client = await connect();

    const started = await call(client, "start_trip_run", {
      goal: "7 days in Paris for two, under $1,800",
      budgetUsd: 1800,
    });
    expect(textOf(started)).toMatch(/cap/);

    for (const [category, agentId] of [
      ["flight", "priceline.com"],
      ["hotel", "hotels.com"],
      ["car", "hertz.com"],
    ] as const) {
      const listed = await call(client, "list_agents", { category });
      expect(listed.isError).toBeFalsy();
      // The listing must not leak the knob that predetermines answer quality.
      expect(textOf(listed)).not.toMatch(/qualityPercent/);

      const hired = await call(client, "hire_agent", {
        agentId,
        reasoning: `${agentId} balances rating against price for this line item`,
      });
      expect(hired.isError).toBeFalsy();
      expect(textOf(hired)).toMatch(/quality/);

      const rated = await call(client, "rate_agent", { agentId, stars: 4 });
      expect(rated.isError).toBeFalsy();
    }

    const settled = await call(client, "settle_trip");
    expect(settled.isError).toBeFalsy();
    expect(textOf(settled)).toMatch(/Booked/);

    // The canvas is driven entirely by these — if the server didn't emit them, the
    // display would stay blank while the tools all reported success.
    const types = history().map((e) => e.type);
    for (const required of [
      "run.started",
      "marketplace.query",
      "marketplace.results",
      "client.deliberate",
      "client.select",
      "payment.challenge",
      "payment.settled",
      "agent.response",
      "client.rating",
      "trip.assembled",
      "allocation.ok",
      "tier2.card_issued",
      "tier2.charge",
      "run.complete",
    ]) {
      expect(types, `missing ${required}`).toContain(required);
    }

    // Payments are simulated, so nothing may claim a transaction hash.
    for (const event of history()) {
      if (event.type === "payment.settled") {
        expect(event.simulated).toBe(true);
        expect(event.txHash).toBeUndefined();
      }
    }

    await client.close();
  });

  it("carries the model's reasoning through verbatim", async () => {
    clearRun();
    resetEvents();
    const client = await connect();
    const reasoning = "hotels.com is 0.5 stars lower but half the price, which clears my bar here";

    await call(client, "start_trip_run", { goal: "Paris", budgetUsd: 1800 });
    await call(client, "list_agents", { category: "hotel" });
    await call(client, "hire_agent", { agentId: "hotels.com", reasoning });

    const deliberate = history().find((e) => e.type === "client.deliberate") as any;
    expect(deliberate?.reasoning).toBe(reasoning);
    // And the shortlist it chose from, so the canvas can light all the candidates.
    expect(deliberate?.considering).toHaveLength(3);
    await client.close();
  });

  it("will not settle an empty trip", async () => {
    clearRun();
    const client = await connect();
    await call(client, "start_trip_run", { goal: "Paris", budgetUsd: 1800 });
    const res = await call(client, "settle_trip");
    expect(res.isError).toBe(true);
    expect(textOf(res)).toMatch(/Nothing has been hired/);
    await client.close();
  });

  it("reports progress so a confused agent can recover", async () => {
    clearRun();
    const client = await connect();
    await call(client, "start_trip_run", { goal: "Paris", budgetUsd: 1800 });
    await call(client, "list_agents", { category: "car" });
    await call(client, "hire_agent", { agentId: "avis.com", reasoning: "cheapest above my rating bar" });

    const status = textOf(await call(client, "trip_status"));
    expect(status).toMatch(/avis\.com/);
    expect(status).toMatch(/Still to shop/);
    await client.close();
  });
});
