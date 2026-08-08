import { describe, it, expect } from "vitest";
import { flightsProvider } from "../../../src/domain/flights/booking.js";

describe("flightsProvider", () => {
  it("implements the booking contract", () => {
    expect(typeof flightsProvider.search).toBe("function");
    expect(typeof flightsProvider.hold).toBe("function");
    expect(typeof flightsProvider.confirm).toBe("function");
    expect(typeof flightsProvider.cancel).toBe("function");
  });
});
