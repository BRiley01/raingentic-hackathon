// Drive the marketplace through MCP, without an LLM: `npm run mcp:drive`
//
// rain-cli needs Bun, an Anthropic key and a real TTY, so it can't be scripted. This
// walks the same MCP tools over the same transport with hardcoded choices, so the MCP
// path can be exercised, rehearsed and debugged on its own — and it doubles as the
// reference for the call sequence an LLM agent is expected to follow.
//
// Watch it on the canvas: http://127.0.0.1:5173 with LIVE selected.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const BASE = process.env.API_BASE ?? "http://localhost:3000";
const FAST = process.argv.includes("fast");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, FAST ? 0 : ms));

// What an LLM would decide. Hardcoded here so the script is deterministic; the point is
// to prove the plumbing, not the judgement.
const CHOICES = [
  {
    category: "flight" as const,
    agentId: "priceline.com",
    reasoning:
      "kayak.com rates half a star higher but charges twice as much per question. " +
      "priceline's 4.4★ clears my bar for one round trip — I'd rather put the difference " +
      "into the seat.",
    stars: 5,
  },
  {
    category: "hotel" as const,
    agentId: "hotels.com",
    reasoning:
      "booking.com is the best rated, but at $0.25 a question it's nearly twice hotels.com " +
      "for half a star. hotels.com is good enough for a mid-range hotel.",
    stars: 4,
  },
  {
    category: "car" as const,
    agentId: "hertz.com",
    reasoning: "hertz.com is the best rated in this category and not the most expensive. No tradeoff to make.",
    stars: 4,
  },
];

const textOf = (result: any) => (result.content ?? []).map((c: any) => c.text ?? "").join("\n");

async function main() {
  const client = new Client({ name: "mcp-drive", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`)));

  const tools = (await client.listTools()).tools;
  console.log(`connected to ${BASE}/api/mcp — ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}\n`);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as any;
    const body = textOf(result);
    if (result.isError) throw new Error(`${name} failed:\n${body}`);
    return body;
  };

  console.log("▸ start_trip_run");
  console.log(indent(await call("start_trip_run", {
    goal: "7 days in Paris for two, mid-March, under $1,800",
    budgetUsd: 1800,
  })));
  await sleep(700);

  for (const choice of CHOICES) {
    console.log(`\n▸ list_agents ${choice.category}`);
    console.log(indent(await call("list_agents", { category: choice.category })));
    await sleep(1_200);

    console.log(`\n▸ hire_agent ${choice.agentId}`);
    console.log(indent(await call("hire_agent", { agentId: choice.agentId, reasoning: choice.reasoning })));
    await sleep(1_400);

    console.log(`\n▸ rate_agent ${choice.agentId} ${choice.stars}★`);
    console.log(indent(await call("rate_agent", { agentId: choice.agentId, stars: choice.stars })));
    await sleep(700);
  }

  console.log("\n▸ settle_trip");
  console.log(indent(await call("settle_trip")));

  await client.close();
}

const indent = (body: string) => body.split("\n").map((l) => `    ${l}`).join("\n");

main().catch((err) => {
  console.error(`\n✗ ${err.message ?? err}`);
  process.exit(1);
});
