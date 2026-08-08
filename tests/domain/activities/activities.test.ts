import { describe, it, expect } from "vitest";
import { activitiesProvider } from "../../../src/domain/activities/booking.js";

describe("activitiesProvider", () => {
  it("implements the booking contract", () => {
    expect(typeof activitiesProvider.search).toBe("function");
    expect(typeof activitiesProvider.hold).toBe("function");
    expect(typeof activitiesProvider.confirm).toBe("function");
    expect(typeof activitiesProvider.cancel).toBe("function");
  });
});
