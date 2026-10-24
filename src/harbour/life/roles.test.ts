import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { roleDensity, stormShare } from "./roles";
import type { Walkways } from "./walkways";

describe("roles by the hour", () => {
  it("anglers at dawn, vendors in the morning, promenaders at dusk", () => {
    expect(roleDensity("angler", 6.5)).toBeGreaterThan(0.9);
    expect(roleDensity("angler", 13)).toBe(0);
    expect(roleDensity("vendor", 10)).toBe(1);
    expect(roleDensity("vendor", 3)).toBe(0);
    expect(roleDensity("vendor", 17)).toBe(0);
    expect(roleDensity("promenader", 19)).toBe(1);
    expect(roleDensity("promenader", 12)).toBe(0);
    expect(roleDensity("promenader", 23)).toBe(0);
  });

  it("the night watchman 23–4 h, the keeper 0–4 h, the lamplighters only at dusk", () => {
    for (const h of [23.2, 0, 2, 3.9]) expect(roleDensity("watchman", h)).toBe(1);
    for (const h of [4.5, 12, 22.5]) expect(roleDensity("watchman", h)).toBe(0);
    for (const h of [0.1, 3, 3.9]) expect(roleDensity("keeper", h)).toBe(1);
    for (const h of [4.5, 12, 23.5]) expect(roleDensity("keeper", h)).toBe(0);
    expect(roleDensity("lamplighter", 19)).toBe(1);
    expect(roleDensity("lamplighter", 6)).toBe(0);
  });

  it("storms only ever thin life", () => {
    expect(stormShare(0.2)).toBe(1);
    expect(stormShare(0.4)).toBe(1);
    expect(stormShare(1)).toBeCloseTo(0.35, 5);
    for (let w = 0; w <= 1; w += 0.05) {
      expect(stormShare(w)).toBeLessThanOrEqual(1);
      expect(stormShare(w + 0.05)).toBeLessThanOrEqual(stormShare(w) + 1e-9);
    }
  });

  it("the exported walkways carry the stalls, the mole promenades, the causeway, the pastures and the cart road", () => {
    const w = JSON.parse(readFileSync(resolve(__dirname, "../../../public/harbour/walkways.json"), "utf8")) as Walkways;
    expect(w.spots.filter((s) => s.kind === "stall").length).toBeGreaterThanOrEqual(4);
    expect(w.paths.filter((p) => p.kind === "mole").length).toBe(2);
    expect(w.causeway?.length ?? 0).toBeGreaterThan(5);
    expect(w.pastures?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(w.cartway?.length ?? 0).toBeGreaterThan(10);
  });
});
