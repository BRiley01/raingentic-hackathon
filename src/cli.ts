// CLI driver: trip JSON -> allocate -> fund + scoped cards -> authorize/settle -> report.
//
//   RAIN_MODE=mock npm run trip -- examples/trip.paris.json
//   RAIN_MODE=live RAIN_API_KEY=... RAIN_USER_ID=... RAIN_CONTRACT_ID=... \
//     RAIN_SESSION_ID=... npm run trip -- examples/trip.paris.json

import { readFile } from "node:fs/promises";
import { parseTripRequest } from "./domain/shared/trip.js";
import { allocate, AllocationError } from "./domain/shared/allocator.js";
import { provisionAndSettle } from "./domain/shared/scope-cards.js";
import { makeRainClient } from "./integrations/rain/client.js";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npm run trip -- <path-to-trip.json>");
    process.exit(1);
  }

  const raw = JSON.parse(await readFile(path, "utf8"));

  let trip;
  try {
    trip = parseTripRequest(raw);
  } catch (e: any) {
    console.error("Invalid trip request:");
    console.error(e.errors ?? e.message);
    process.exit(1);
  }

  console.log(`\nTrip ${trip.tripId} — budget ${usd(trip.budget.amountCents)}\n`);

  let plan;
  try {
    plan = allocate(trip);
  } catch (e) {
    if (e instanceof AllocationError) { console.error(e.message); process.exit(1); }
    throw e;
  }

  console.log("Budget allocation");
  for (const a of plan.allocations) {
    console.log(`  ${a.domain.padEnd(11)} ${usd(a.allocated.amountCents).padStart(10)}  [${a.items.length} item(s)]`);
  }
  console.log(
    `  ${"-".repeat(11)} ${"-".repeat(10)}\n` +
    `  ${"allocated".padEnd(11)} ${usd(plan.totalAllocated.amountCents).padStart(10)}\n` +
    `  ${"remaining".padEnd(11)} ${usd(plan.remaining.amountCents).padStart(10)}\n`,
  );

  const mode = (process.env.RAIN_MODE ?? "mock").toLowerCase();
  console.log(`Rain mode: ${mode}\n`);

  const rain = makeRainClient();
  const ctx = {
    userId: process.env.RAIN_USER_ID ?? "sandbox-user",
    contractId: process.env.RAIN_CONTRACT_ID ?? "sandbox-contract",
  };

  const report = await provisionAndSettle(rain, plan, ctx);

  console.log(`Funded collateral ${usd(report.fundedCents)} (contract ${report.contractId})`);
  console.log(`Issued ${report.cards.length} scoped card(s) to user ${report.userId}`);
  for (const c of report.cards) {
    console.log(
      `  [${c.card.last4 ?? "----"}] ${c.domain.padEnd(11)} limit ${usd(c.limitCents).padStart(10)}` +
      (c.merchantAllowlist.length ? `  ->  ${c.merchantAllowlist.join(", ")}` : ""),
    );
  }

  console.log("\nCharges (authorize -> settle)");
  for (const ch of report.charges) {
    const tag = ch.status === "settled" ? "OK   " : ch.status === "skipped" ? "SKIP " : "DECL ";
    console.log(
      `  ${tag} ${usd(ch.amountCents).padStart(10)}  ${ch.vendor.padEnd(18)}` +
      (ch.reason ? `  (${ch.reason})` : ""),
    );
  }

  console.log(
    `\nSettled ${usd(report.totalSettledCents)}` +
    (report.totalDeclinedCents ? `, declined ${usd(report.totalDeclinedCents)}` : "") +
    `  —  trip ${report.ok ? "OK" : "INCOMPLETE"}\n`,
  );

  process.exit(report.ok ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
