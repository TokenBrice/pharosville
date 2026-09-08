import { describe, expect, it } from "vitest";
import {
  advanceShipLanternAttention,
  createShipLanternAttentionState,
  shipLanternCeremonyBow,
  shipLanternWarmth,
  SHIP_LANTERN_HOVER_DWELL_SECONDS,
} from "./garden-ship-lantern-attention";

describe("ship lantern attention", () => {
  it("ignores pointer sweeps, then attacks near the 120ms time constant", () => {
    const state = createShipLanternAttentionState();
    advanceShipLanternAttention(state, {
      hoveredDetailId: "ship.a", reducedMotion: false, selectedDetailId: null, timeSeconds: 0,
    });
    advanceShipLanternAttention(state, {
      hoveredDetailId: "ship.b", reducedMotion: false, selectedDetailId: null, timeSeconds: 0.04,
    });
    expect(shipLanternWarmth(state, "ship.a")).toBe(0);
    expect(shipLanternWarmth(state, "ship.b")).toBe(0);

    advanceShipLanternAttention(state, {
      hoveredDetailId: "ship.b",
      reducedMotion: false,
      selectedDetailId: null,
      timeSeconds: 0.04 + SHIP_LANTERN_HOVER_DWELL_SECONDS,
    });
    advanceShipLanternAttention(state, {
      hoveredDetailId: "ship.b",
      reducedMotion: false,
      selectedDetailId: null,
      timeSeconds: 0.04 + SHIP_LANTERN_HOVER_DWELL_SECONDS + 0.12,
    });
    expect(shipLanternWarmth(state, "ship.b")).toBeCloseTo(1 - Math.exp(-1), 4);
  });

  it("releases near the 400ms time constant and snaps under reduced motion", () => {
    const state = createShipLanternAttentionState();
    advanceShipLanternAttention(state, {
      hoveredDetailId: "ship.a", reducedMotion: true, selectedDetailId: null, timeSeconds: 0,
    });
    expect(shipLanternWarmth(state, "ship.a")).toBe(1);
    advanceShipLanternAttention(state, {
      hoveredDetailId: null, reducedMotion: false, selectedDetailId: null, timeSeconds: 0.4,
    });
    expect(shipLanternWarmth(state, "ship.a")).toBeCloseTo(Math.exp(-0.25 / 0.4), 4);
    advanceShipLanternAttention(state, {
      hoveredDetailId: null, reducedMotion: true, selectedDetailId: null, timeSeconds: 0.41,
    });
    expect(shipLanternWarmth(state, "ship.a")).toBe(0);
  });

  it("bows lanterns in convoy order and freezes the reduced-motion mid-pose", () => {
    expect(shipLanternCeremonyBow(0, 3, 0.12)).toBeGreaterThan(0);
    expect(shipLanternCeremonyBow(2, 3, 0.12)).toBe(0);
    expect(shipLanternCeremonyBow(2, 3, 0.5)).toBeGreaterThan(0);
    expect(shipLanternCeremonyBow(1, 3, 0, true)).toBe(
      shipLanternCeremonyBow(1, 3, 0.5),
    );
    expect(shipLanternCeremonyBow(0, 3, 1)).toBe(0);
  });
});
