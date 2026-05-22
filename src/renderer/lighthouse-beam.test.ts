import { describe, expect, it } from "vitest";
import type { PharosVilleAssetManifestEntry } from "../systems/asset-manifest";
import { tileToScreen } from "../systems/projection";
import { LIGHTHOUSE_DRAW_OFFSET, LIGHTHOUSE_DRAW_SCALE } from "./visual-scales";
import {
  LIGHTHOUSE_BEAM_REDUCED_ANGLE,
  lighthouseBeamSweep,
  lighthouseBeamSweepAngle,
  resolveLighthouseBeamRenderState,
} from "./lighthouse-beam";

describe("lighthouse beam model", () => {
  it("uses the shared eased sweep angle for normal and reduced motion", () => {
    expect(lighthouseBeamSweepAngle(0, false)).toBe(0);
    expect(lighthouseBeamSweepAngle(12, false)).toBeCloseTo(Math.PI / 2 + 0.15);
    expect(lighthouseBeamSweepAngle(12, true)).toBe(LIGHTHOUSE_BEAM_REDUCED_ANGLE);

    const sweep = lighthouseBeamSweep(12, false);
    expect(sweep.cos).toBeCloseTo(Math.cos(sweep.angle));
    expect(sweep.sin).toBeCloseTo(Math.sin(sweep.angle));
  });

  it("resolves the lighthouse fire point from the manifest beacon when available", () => {
    const camera = { offsetX: 100, offsetY: 80, zoom: 1.5 };
    const lighthouse = { tile: { x: 18, y: 30 } };
    const entry: PharosVilleAssetManifestEntry = {
      anchor: [128, 245],
      beacon: [128, 47],
      category: "landmark",
      displayScale: 1,
      footprint: [132, 70],
      height: 256,
      hitbox: [50, 9, 178, 236],
      id: "landmark.lighthouse",
      layer: "landmarks",
      loadPriority: "critical",
      path: "landmarks/lighthouse.png",
      width: 320,
    };
    const assets = {
      get: (id: string) => id === "landmark.lighthouse" ? { entry, image: {} as HTMLImageElement } : null,
    };

    const state = resolveLighthouseBeamRenderState({ assets, camera, lighthouse });
    const center = tileToScreen(lighthouse.tile, camera);
    const spriteAnchor = {
      x: center.x + LIGHTHOUSE_DRAW_OFFSET.x * camera.zoom,
      y: center.y + LIGHTHOUSE_DRAW_OFFSET.y * camera.zoom,
    };
    const spriteScale = camera.zoom * LIGHTHOUSE_DRAW_SCALE;

    expect(state.center).toEqual(center);
    expect(state.firePoint.x).toBeCloseTo(spriteAnchor.x);
    expect(state.firePoint.y).toBeCloseTo(spriteAnchor.y + (47 - 245) * spriteScale);
  });
});
