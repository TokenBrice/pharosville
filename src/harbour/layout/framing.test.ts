import { describe, expect, it } from "vitest";
import layout from "../data/layout.json";
import { FIT_BELOW_ASPECT, fitPresetToAspect, heroPoints } from "./framing";
import { toCameraPreset } from "./layout-system";
import type { HarbourLayout } from "./types";

const L = layout as unknown as HarbourLayout;
const heart = toCameraPreset(L.camera.presets.heart);
const hero = heroPoints(L);

describe("aspect-aware framing", () => {
  it("finds the hero composition in the layout", () => {
    expect(hero.length).toBeGreaterThanOrEqual(6);
  });

  it("leaves the 16:10 framing (and anything at or above the threshold) untouched", () => {
    expect(fitPresetToAspect(heart, 1.6, hero)).toBe(heart);
    expect(fitPresetToAspect(heart, FIT_BELOW_ASPECT, hero)).toBe(heart);
  });

  it("is continuous at the threshold and backs off further the narrower the screen", () => {
    const edge = fitPresetToAspect(heart, FIT_BELOW_ASPECT - 1e-4, hero);
    expect(edge.distance).toBeCloseTo(heart.distance, -1);
    const fold = fitPresetToAspect(heart, 832 / 680, hero);
    const portrait = fitPresetToAspect(heart, 744 / 1133, hero);
    expect(fold.distance).toBeGreaterThanOrEqual(heart.distance);
    expect(fold.target).not.toEqual(heart.target); // the hero is drawn toward the centre
    expect(portrait.distance).toBeGreaterThan(fold.distance * 1.3);
    expect(portrait.distance).toBeLessThan(heart.distance * 3);
    // pitch, yaw and lens are the preset's own
    expect([portrait.pitchDeg, portrait.yawDeg, portrait.fovDeg]).toEqual([heart.pitchDeg, heart.yawDeg, heart.fovDeg]);
  });
});
