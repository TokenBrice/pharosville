import { describe, expect, it } from "vitest";
import { dampFollowCamera, leadFollowTile } from "./use-canvas-resize-and-camera";

describe("follow camera helpers", () => {
  it("leads the followed tile by sampled velocity", () => {
    expect(leadFollowTile(
      { x: 12, y: 8 },
      { x: 10, y: 7 },
      2,
    )).toEqual({
      x: 12.45,
      y: 8.225,
    });
  });

  it("does not lead without a usable previous sample", () => {
    const tile = { x: 12, y: 8 };

    expect(leadFollowTile(tile, null, 1)).toBe(tile);
    expect(leadFollowTile(tile, { x: 10, y: 7 }, 0)).toBe(tile);
  });

  it("damps camera movement toward the target without overshooting", () => {
    const current = { offsetX: 0, offsetY: 0, zoom: 1 };
    const target = { offsetX: 100, offsetY: -50, zoom: 1.5 };
    const next = dampFollowCamera(current, target, 0.25);

    expect(next.offsetX).toBeGreaterThan(60);
    expect(next.offsetX).toBeLessThan(target.offsetX);
    expect(next.offsetY).toBeLessThan(-30);
    expect(next.offsetY).toBeGreaterThan(target.offsetY);
    expect(next.zoom).toBeGreaterThan(current.zoom);
    expect(next.zoom).toBeLessThan(target.zoom);
  });

  it("keeps the current camera when damping cannot advance", () => {
    const current = { offsetX: 0, offsetY: 0, zoom: 1 };
    const target = { offsetX: 100, offsetY: -50, zoom: 1.5 };

    expect(dampFollowCamera(current, target, 0)).toBe(current);
    expect(dampFollowCamera(current, target, 1, 0)).toBe(current);
  });
});
