import { describe, expect, it } from "vitest";
import {
  deriveShipAge,
  deriveShipWabiSurface,
  SHIP_AGE_FRESH_DAYS,
  SHIP_AGE_VETERAN_DAYS,
  shipAgePatina,
} from "./ship-age";

const AS_OF = Date.parse("2026-08-13T00:00:00Z");

describe("deriveShipAge", () => {
  it("keeps the era thresholds literal and the patina continuous", () => {
    expect(deriveShipAge({ ageDays: 364 }).era).toBe("fresh");
    expect(deriveShipAge({ ageDays: 365 }).era).toBe("seasoned");
    expect(deriveShipAge({ ageDays: 1094 }).era).toBe("seasoned");
    expect(deriveShipAge({ ageDays: 1095 }).era).toBe("veteran");
    expect(shipAgePatina(SHIP_AGE_FRESH_DAYS)).toBeCloseTo(1 / 3);
    expect(shipAgePatina(SHIP_AGE_VETERAN_DAYS)).toBeCloseTo(2 / 3);
    expect(shipAgePatina(365 * 20)).toBe(1);
  });

  it("prefers reported age while retaining launch and tracking context", () => {
    expect(deriveShipAge({
      ageDays: 2_900,
      asOfMs: AS_OF,
      meta: { launchDate: "2018-09-26" },
      trackingSpanDays: 730,
    })).toMatchObject({
      ageDays: 2_900,
      era: "veteran",
      serviceSince: "2018-09-26",
      source: "age-days",
      trackingSpanDays: 730,
    });
  });

  it("uses a launch-like milestone but never an announcement or testnet promise", () => {
    const launched = deriveShipAge({
      asOfMs: AS_OF,
      meta: { milestones: [
        { date: "2022-01-01", type: "announcement", title: "Project announced" },
        { date: "2023-02-03", type: "milestone", title: "Mainnet went live" },
      ] },
    });
    expect(launched.source).toBe("launch-milestone");
    expect(launched.serviceSince).toBe("2023-02-03");
    expect(launched.era).toBe("veteran");

    expect(deriveShipAge({
      asOfMs: AS_OF,
      meta: { milestones: [
        { date: "2025-01-01", type: "announcement", title: "Launch announced" },
        { date: "2025-06-01", type: "testnet", title: "Public testnet" },
      ] },
    }).source).toBe("unavailable");

    expect(deriveShipAge({
      asOfMs: AS_OF,
      assetStatus: "pre-launch",
      meta: { milestones: [
        { date: "2026-03-18", type: "milestone", title: "Tempo mainnet launches; coin not yet migrated" },
      ] },
    }).source).toBe("unavailable");
  });

  it("labels tracking-only evidence and leaves wholly unavailable age neutral", () => {
    expect(deriveShipAge({ trackingSpanDays: 90 })).toMatchObject({
      ageDays: 90,
      era: "fresh",
      source: "tracking-only",
      trackingSpanDays: 90,
    });
    expect(deriveShipAge({})).toEqual({
      ageDays: null,
      era: "unavailable",
      patina: null,
      serviceSince: null,
      source: "unavailable",
      trackingSpanDays: null,
    });
  });
});

describe("deriveShipWabiSurface", () => {
  it("is stable per entity and keeps every decorative channel in its restraint band", () => {
    const first = deriveShipWabiSurface("usdc-circle");
    expect(deriveShipWabiSurface("usdc-circle")).toEqual(first);
    expect(Math.abs(first.hullValue - 1)).toBeGreaterThanOrEqual(0.04);
    expect(Math.abs(first.hullValue - 1)).toBeLessThanOrEqual(0.06);
    expect(Math.abs(first.propRotation) * 180 / Math.PI).toBeGreaterThanOrEqual(2);
    expect(Math.abs(first.propRotation) * 180 / Math.PI).toBeLessThanOrEqual(9);
    expect(Math.abs(first.ropeSag)).toBeGreaterThanOrEqual(0.025);
    expect(Math.abs(first.ropeSag)).toBeLessThanOrEqual(0.07);
  });

  it("does not cluster a run of ids that differ at the varying lead", () => {
    const values = ["coin-a", "coin-b", "coin-c", "coin-d", "coin-e"]
      .map((id) => deriveShipWabiSurface(id));
    expect(new Set(values.map((value) => value.hullValue.toFixed(5))).size).toBeGreaterThan(3);
    expect(new Set(values.map((value) => Math.sign(value.propRotation))).size).toBe(2);
  });
});
