import { describe, it, expect } from "vitest";
import { transportProvider } from "../../../src/domain/transport/booking.js";

describe("transportProvider", () => {
  it("implements the booking contract", () => {
    expect(typeof transportProvider.search).toBe("function");
    expect(typeof transportProvider.hold).toBe("function");
    expect(typeof transportProvider.confirm).toBe("function");
    expect(typeof transportProvider.cancel).toBe("function");
  });
});
