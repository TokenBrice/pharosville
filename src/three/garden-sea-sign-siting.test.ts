import { describe, expect, it } from "vitest";
import {
  SEA_SIGN_SCALE_STEPS,
  SEA_SIGN_STEP_ZOOMS,
  createSeaSignScaleTrack,
  seaSignScaleForZoom,
  seaSignSites,
  seaSignSteles,
  seaSignStepForZoom,
  seaSignStepWithHysteresis,
} from "./garden-sea-sign-siting";

describe("sea-stele true-world-scale siting (W2a)", () => {
  it("uses one world-scale rung across the entire camera range", () => {
    expect(SEA_SIGN_SCALE_STEPS).toEqual([1]);
    expect(SEA_SIGN_STEP_ZOOMS).toEqual([]);
    for (const zoom of [0.05, 0.28, 0.7776, 1.4, 2.4]) {
      expect(seaSignScaleForZoom(zoom)).toBe(1);
      expect(seaSignStepForZoom(zoom)).toBe(0);
      expect(seaSignStepWithHysteresis(zoom, 0)).toBe(0);
    }
  });

  it("keeps the retained track API static under motion and reduced motion", () => {
    const track = createSeaSignScaleTrack();
    for (const frame of [
      { deltaSeconds: Number.POSITIVE_INFINITY, zoom: 0.28 },
      { deltaSeconds: 1 / 60, zoom: 2.4 },
      { deltaSeconds: 0, zoom: 0.6 },
      { deltaSeconds: 1 / 60, reducedMotion: true, zoom: 1.2 },
    ]) {
      expect(track.advance(frame)).toBe(1);
      expect(track.step).toBe(0);
    }
  });

  it("sites every named body deterministically with separation", () => {
    const bodies = ["calm", "watch", "alert", "warning", "danger", "ledger", "wreck"] as const;
    const first = seaSignSites(bodies);
    expect(first).toEqual(seaSignSites(bodies));
    expect(first.map((site) => site.body)).toEqual(bodies);
    for (let left = 0; left < first.length; left += 1) {
      for (let right = left + 1; right < first.length; right += 1) {
        expect(Math.hypot(
          first[left]!.x - first[right]!.x,
          first[left]!.z - first[right]!.z,
        )).toBeGreaterThanOrEqual(11);
      }
    }
  });

  it("adds Wreck Shoal without inventing a detail record", () => {
    const steles = seaSignSteles([
      { band: "CALM", detailId: "area.calm", label: "Calm Anchorage" },
      { band: "DANGER", detailId: "area.danger", label: "Danger Strait" },
    ]);
    expect(steles.map((stele) => stele.body)).toEqual(["calm", "danger", "wreck"]);
    expect(steles.at(-1)).toMatchObject({
      body: "wreck",
      detailId: null,
      label: "Wreck Shoals",
    });
  });
});
