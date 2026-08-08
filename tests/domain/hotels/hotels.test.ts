import { describe, it, expect } from "vitest";
import { hotelsProvider } from "../../../src/domain/hotels/booking.js";

describe("hotelsProvider", () => {
  it("implements the booking contract", () => {
    expect(typeof hotelsProvider.search).toBe("function");
    expect(typeof hotelsProvider.hold).toBe("function");
    expect(typeof hotelsProvider.confirm).toBe("function");
    expect(typeof hotelsProvider.cancel).toBe("function");
  });
});
