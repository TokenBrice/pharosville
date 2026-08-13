import { describe, expect, it } from "vitest";
import { seasonFromDate } from "./season";

describe("seasonFromDate", () => {
  it.each([
    ["2026-03-01T00:00:00.000Z", "spring"],
    ["2026-05-31T23:59:59.999Z", "spring"],
    ["2026-06-01T00:00:00.000Z", "summer"],
    ["2026-08-31T23:59:59.999Z", "summer"],
    ["2026-09-01T00:00:00.000Z", "autumn"],
    ["2026-11-30T23:59:59.999Z", "autumn"],
    ["2026-12-01T00:00:00.000Z", "winter"],
    ["2027-02-28T23:59:59.999Z", "winter"],
  ] as const)("maps %s to %s", (iso, expected) => {
    expect(seasonFromDate(new Date(iso))).toBe(expected);
  });

  it("uses UTC month boundaries and a deterministic invalid-date fallback", () => {
    expect(seasonFromDate(new Date("2026-03-01T00:30:00+14:00"))).toBe("winter");
    expect(seasonFromDate(new Date(Number.NaN))).toBe("winter");
  });
});
