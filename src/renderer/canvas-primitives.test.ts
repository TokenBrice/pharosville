import { describe, expect, it, vi } from "vitest";
import type { PharosVilleAssetManifestEntry } from "../systems/asset-manifest";
import type { LoadedPharosVilleAsset } from "./asset-manager";
import {
  drawAnimatedAssetSubpixel,
  drawAsset,
  drawAssetFrame,
  drawAssetSubpixel,
} from "./canvas-primitives";

const image = {} as HTMLImageElement;
const frameSource = {} as HTMLImageElement;

describe("canvas asset primitives", () => {
  it("keeps drawAsset destination and size rounded by default", () => {
    const asset = makeAsset();
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;

    drawAsset(ctx, asset, 100.25, 80.75, 1);

    expect(drawImage).toHaveBeenCalledWith(image, 89, 59, 34, 19);
  });

  it("draws static assets with fractional destination coordinates through the subpixel helper", () => {
    const asset = makeAsset();
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;

    drawAssetSubpixel(ctx, asset, 100.25, 80.75, 1);

    expect(drawImage).toHaveBeenCalledWith(image, 89.25, 58.75, 34, 19);
  });

  it("keeps drawAssetFrame destination and size rounded by default", () => {
    const asset = makeAnimatedAsset();
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;

    expect(drawAssetFrame(ctx, asset, 101.25, 81.75, 1, 4)).toBe(true);

    expect(drawImage).toHaveBeenCalledWith(
      frameSource,
      16,
      10,
      16,
      10,
      90,
      60,
      18,
      11,
    );
  });

  it("keeps reduced-motion frame semantics while drawing animated assets at subpixel destinations", () => {
    const asset = makeAnimatedAsset();
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;

    expect(drawAnimatedAssetSubpixel(ctx, asset, 101.25, 81.75, 1, 1, true)).toBe(true);

    expect(drawImage).toHaveBeenCalledWith(
      frameSource,
      16,
      10,
      16,
      10,
      90.25,
      59.75,
      18,
      11,
    );
  });
});

function makeAsset(entryOverrides: Partial<PharosVilleAssetManifestEntry> = {}): LoadedPharosVilleAsset {
  return {
    entry: {
      anchor: [10, 20],
      category: "ship",
      displayScale: 1.1,
      footprint: [1, 1],
      height: 17,
      hitbox: [0, 0, 31, 17],
      id: "ship.test",
      layer: "ships",
      loadPriority: "deferred",
      path: "ships/test.png",
      width: 31,
      ...entryOverrides,
    },
    image,
  };
}

function makeAnimatedAsset(): LoadedPharosVilleAsset {
  return {
    ...makeAsset({
      animation: {
        frameCount: 6,
        frameSource: "ships/test-frames.png",
        fps: 8,
        loop: true,
        reducedMotionFrame: 4,
        spriteSheet: {
          columns: 3,
          frameHeight: 10,
          frameWidth: 16,
          rows: 2,
        },
      },
      height: 10,
      width: 16,
    }),
    frameSource,
  };
}
