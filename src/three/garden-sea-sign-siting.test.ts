import { describe, expect, it } from "vitest";
import {
  SEA_SIGN_SCALE_STEPS,
  SEA_SIGN_STEP_ZOOMS,
  createSeaSignScaleTrack,
  seaSignScaleForZoom,
  seaSignSites,
  seaSignSteles,
  seaSignStepForZoom,
} from "./garden-sea-sign-siting";

describe("sea-stele overview-LOD siting (W2a)", () => {
  it("keeps true scale in-world and a readable chart rung at whole-map", () => {
    expect(SEA_SIGN_SCALE_STEPS).toEqual([1, 2.6]);
    expect(SEA_SIGN_STEP_ZOOMS).toEqual([0.4]);
    expect(seaSignScaleForZoom(0.28)).toBe(2.6);
    expect(seaSignStepForZoom(0.28)).toBe(1);
    for (const zoom of [0.7776, 1.4, 2.4]) {
      expect(seaSignScaleForZoom(zoom)).toBe(1);
      expect(seaSignStepForZoom(zoom)).toBe(0);
    }
  });

  it("settles the discrete overview rung and bypasses it under reduced-motion history", () => {
    const track = createSeaSignScaleTrack();
    expect(track.advance({ deltaSeconds: Number.POSITIVE_INFINITY, zoom: 0.28 })).toBe(2.6);
    expect(track.step).toBe(1);
    expect(track.advance({ deltaSeconds: 1 / 60, reducedMotion: true, zoom: 1.2 })).toBe(1);
    expect(track.step).toBe(0);
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

  it("sites the canonical Wreck Shoal area with its detail record", () => {
    const steles = seaSignSteles([
      { band: "CALM", detailId: "area.calm", label: "Calm Anchorage" },
      { band: "DANGER", detailId: "area.danger", label: "Danger Strait" },
      { id: "area.risk-water.wreck-shoal", detailId: "area.risk-water.wreck-shoal", label: "Wreck Shoal" },
    ]);
    expect(steles.map((stele) => stele.body)).toEqual(["calm", "danger", "wreck"]);
    expect(steles.at(-1)).toMatchObject({
      body: "wreck",
      detailId: "area.risk-water.wreck-shoal",
      label: "Wreck Shoal",
    });
  });

  it("reuses static sites until the immutable area input changes", () => {
    const areas = [
      { band: "CALM", detailId: "area.calm", label: "Calm Anchorage" },
      { band: "DANGER", detailId: "area.danger", label: "Danger Strait" },
    ];
    const first = seaSignSteles(areas);
    expect(seaSignSteles(areas)).toBe(first);
    const changed = [{ ...areas[1]!, label: "Updated danger reading" }];
    const next = seaSignSteles(changed);
    expect(next).not.toBe(first);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ body: "danger", label: "Updated danger reading" });
    expect(first.map((site) => site.label)).toEqual(["Calm Anchorage", "Danger Strait"]);
  });
});
