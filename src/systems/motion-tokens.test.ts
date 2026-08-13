import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GARDEN_MOTION_AUDIT,
  GARDEN_MOTION_CURVES,
  GARDEN_MOTION_DURATIONS,
} from "./motion-tokens";

describe("garden motion tokens", () => {
  it("publishes the named curves and whisper-to-weather duration ladder", () => {
    expect(Object.keys(GARDEN_MOTION_CURVES)).toEqual(["settle", "drift", "breathe"]);
    expect(GARDEN_MOTION_DURATIONS.whisper.ms).toBe(300);
    expect(GARDEN_MOTION_DURATIONS.breathe.ms).toBe(9_000);
    expect(GARDEN_MOTION_DURATIONS.weather.ms).toBeGreaterThanOrEqual(90_000);
    expect(Object.values(GARDEN_MOTION_CURVES).some((curve) => curve.css.includes("spring"))).toBe(false);
  });

  it("keeps the TypeScript vocabulary and DOM custom properties in lockstep", () => {
    const css = readFileSync(new URL("../pharosville.css", import.meta.url), "utf8");
    for (const token of Object.values(GARDEN_MOTION_CURVES)) {
      expect(css).toContain(`${token.cssVar}: ${token.css};`);
    }
    for (const token of Object.values(GARDEN_MOTION_DURATIONS)) {
      expect(css).toContain(`${token.cssVar}: ${token.css};`);
    }
  });

  it("audits every route named by W3.2 and permits only ripples and wingbeats as fast exceptions", () => {
    expect(GARDEN_MOTION_AUDIT.map(({ system }) => system)).toEqual([
      "sails-and-chain-flags",
      "wakes",
      "mist-opacity",
      "lantern-emissive",
      "buoy-and-ship-bob",
      "gull-soaring-direction",
      "water-normal-scroll",
      "ripples",
      "wingbeats",
    ]);
    expect(
      GARDEN_MOTION_AUDIT.filter(({ driver }) => driver === "fast-exception").map(({ system }) => system),
    ).toEqual(["ripples", "wingbeats"]);
  });
});
