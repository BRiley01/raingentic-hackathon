import { describe, it, expect } from "vitest";
import { parseTripRequest } from "../../src/domain/shared/trip.js";
import { allocate, AllocationError } from "../../src/domain/shared/allocator.js";

const base = () => ({
  tripId: "t1",
  traveler: { id: "u1", name: "Alex Rivera", email: "a@e.com" },
  budget: { amountCents: 100000, currency: "USD" },
  items: [
    {
      id: "flt-1",
      domain: "flights",
      label: "flight",
      vendor: "kayak.com",
      maxSpend: { amountCents: 60000, currency: "USD" },
      merchantAllowlist: ["kayak.com"],
      payable: true,
    },
    {
      id: "htl-1",
      domain: "hotels",
      label: "hotel",
      vendor: "booking.com",
      maxSpend: { amountCents: 30000, currency: "USD" },
      merchantAllowlist: ["booking.com"],
      payable: true,
    },
  ],
});

describe("allocate", () => {
  it("produces one allocation per domain and correct remaining", () => {
    const plan = allocate(parseTripRequest(base()));
    expect(plan.allocations).toHaveLength(2);
    expect(plan.totalAllocated.amountCents).toBe(90000);
    expect(plan.remaining.amountCents).toBe(10000);
    // sorted by domain
    expect(plan.allocations.map((a) => a.domain)).toEqual(["flights", "hotels"]);
  });

  it("unions merchant allowlists within a domain", () => {
    const t = base();
    t.items.push({
      id: "flt-2",
      domain: "flights",
      label: "flight2",
      vendor: "expedia.com",
      maxSpend: { amountCents: 5000, currency: "USD" },
      merchantAllowlist: ["expedia.com"],
      payable: true,
    });
    const plan = allocate(parseTripRequest(t));
    const flights = plan.allocations.find((a) => a.domain === "flights")!;
    expect(flights.merchantAllowlist.sort()).toEqual(["expedia.com", "kayak.com"]);
    expect(flights.allocated.amountCents).toBe(65000);
  });

  it("rejects a plan that exceeds the trip budget", () => {
    const t = base();
    t.budget.amountCents = 50000; // less than 90k allocated
    expect(() => allocate(parseTripRequest(t))).toThrowError(AllocationError);
  });

  it("rejects a plan that breaches a domain cap and reports the reason", () => {
    const t: any = base();
    t.domainCaps = { flights: { amountCents: 40000, currency: "USD" } };
    try {
      allocate(parseTripRequest(t));
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AllocationError);
      expect((e as AllocationError).reasons.join(" ")).toContain("flights");
    }
  });
});
