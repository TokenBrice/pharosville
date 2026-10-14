import { describe, expect, it } from "vitest";
import { approach, indexVariants, pickVariant, targetSwing, wreckScale } from "./variants";

const HULLS = [
  { id: "usd_cat_skiff", family: "usd", class: "skiff" },
  { id: "usd_sloop_boat", family: "usd", class: "boat" },
  { id: "usd_ship_flagship", family: "usd", class: "flagship" },
  { id: "eur_botter_boat", family: "eur", class: "boat" },
  { id: "eur_botter_large", family: "eur", class: "large" },
  { id: "gold_brig_medium", family: "gold", class: "medium" },
  { id: "other_work_skiff", family: "other", class: "skiff" },
];

describe("pickVariant", () => {
  const idx = indexVariants(HULLS);
  it("uses the family's own class when present", () => {
    expect(pickVariant(idx, "eur", "boat")).toBe("eur_botter_boat");
    expect(pickVariant(idx, "usd", "flagship")).toBe("usd_ship_flagship");
  });
  it("keeps the family silhouette at the nearest class", () => {
    expect(pickVariant(idx, "eur", "flagship")).toBe("eur_botter_large");
    expect(pickVariant(idx, "eur", "skiff")).toBe("eur_botter_boat");
    expect(pickVariant(idx, "gold", "skiff")).toBe("gold_brig_medium");
  });
  it("unknown families fall back to the workboat", () => {
    expect(pickVariant(idx, "martian", "skiff")).toBe("other_work_skiff");
  });
});

describe("targetSwing", () => {
  it("is negative (starboard tack, boom to port) with the wind on the starboard side", () => {
    // heading 0 = bow +z; starboard = (-1, 0) i.e. west; wind FROM west = heading -π/2
    expect(targetSwing(0, -Math.PI / 2, 1)).toBeLessThan(0);
    expect(targetSwing(0, Math.PI / 2, 1)).toBeGreaterThan(0);
  });
  it("grows from close-hauled to running and vanishes when furled", () => {
    const close = Math.abs(targetSwing(0, 0.7, 1)), run = Math.abs(targetSwing(0, Math.PI - 0.05, 1));
    expect(close).toBeLessThan(run);
    expect(run).toBeLessThanOrEqual(0.9 + 1e-9);
    expect(targetSwing(0, 1, 0)).toBeCloseTo(0);
  });
  it("approach is rate limited", () => {
    expect(approach(0, 1, 0.1)).toBeCloseTo(0.1);
    expect(approach(0.95, 1, 0.1)).toBe(1);
  });
  it("wreck scale grows with peak cap", () => {
    expect(wreckScale(1e7)).toBeLessThan(wreckScale(1e10));
    expect(wreckScale(null)).toBeGreaterThan(0);
  });
});
