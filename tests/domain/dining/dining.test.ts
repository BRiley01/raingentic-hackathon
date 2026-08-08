import { describe, it, expect } from "vitest";
import { diningProvider } from "../../../src/domain/dining/booking.js";

describe("diningProvider", () => {
  it("implements the booking contract", () => {
    expect(typeof diningProvider.search).toBe("function");
    expect(typeof diningProvider.hold).toBe("function");
    expect(typeof diningProvider.confirm).toBe("function");
    expect(typeof diningProvider.cancel).toBe("function");
  });
});
