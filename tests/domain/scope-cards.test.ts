import { describe, it, expect } from "vitest";
import { parseTripRequest } from "../../src/domain/shared/trip.js";
import { allocate } from "../../src/domain/shared/allocator.js";
import { provisionAndSettle } from "../../src/domain/shared/scope-cards.js";
import { MockRainClient } from "../../src/integrations/rain/client.js";

const ctx = { userId: "user_x", contractId: "contract_x" };

const trip = () => ({
  tripId: "t1",
  traveler: { id: "u1", name: "Alex Rivera", email: "a@e.com" },
  budget: { amountCents: 200000, currency: "USD" },
  items: [
    { id: "flt-1", domain: "flights", label: "flight", vendor: "kayak.com",
      maxSpend: { amountCents: 60000, currency: "USD" }, merchantAllowlist: ["kayak.com"], payable: true },
    { id: "htl-1", domain: "hotels", label: "hotel", vendor: "booking.com",
      maxSpend: { amountCents: 45000, currency: "USD" }, merchantAllowlist: ["booking.com"], payable: true },
    { id: "din-1", domain: "dining", label: "hold", vendor: "opentable.com",
      maxSpend: { amountCents: 12000, currency: "USD" }, merchantAllowlist: ["opentable.com"], payable: false },
  ],
});

describe("provisionAndSettle (mock Rain, starter-kit flow)", () => {
  it("funds collateral, issues one card per domain, settles payable items", async () => {
    const rain = new MockRainClient();
    const plan = allocate(parseTripRequest(trip()));
    const report = await provisionAndSettle(rain, plan, ctx);

    expect(report.fundedCents).toBe(117000); // 60000 + 45000 + 12000
    expect(report.cards).toHaveLength(3);
    expect(report.charges.filter((c) => c.status === "settled")).toHaveLength(2);
    expect(report.charges.filter((c) => c.status === "skipped")).toHaveLength(1);
    expect(report.totalSettledCents).toBe(105000);
    expect(report.ok).toBe(true);
  });

  it("declines a charge that exceeds the scoped card limit (authorize step)", async () => {
    const rain = new MockRainClient();
    const card = await rain.issueScopedCard("user_x", { amountInUSDCents: 10000 }); // $100
    const ok = await rain.charge(card.id, "kayak.com", 9000);   // $90
    const over = await rain.charge(card.id, "kayak.com", 2000); // +$20 over
    expect(ok.status).toBe("settled");
    expect(over.status).toBe("declined");
    expect(over.reason).toContain("exceeds remaining card limit");
  });

  it("records transactions readable via listTransactions", async () => {
    const rain = new MockRainClient();
    const plan = allocate(parseTripRequest(trip()));
    await provisionAndSettle(rain, plan, ctx);
    const txns = await rain.listTransactions(20);
    // 2 payable items each produce one settled transaction
    const settled = txns.filter((t) => t.status === "settled");
    expect(settled.length).toBe(2);
  });
});
