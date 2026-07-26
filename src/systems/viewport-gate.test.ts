import { describe, expect, it } from "vitest";
import {
  canViewportShowMap,
  isWidescreenViewport,
  MIN_LONG_SIDE_PX,
  MIN_SHORT_SIDE_PX,
} from "./viewport-gate";

describe("isWidescreenViewport", () => {
  it("asks whether the DEVICE is capable, independent of which way up it is", () => {
    // A phone is equally (in)capable in either orientation, so the device
    // question must give the same answer both ways round.
    expect(isWidescreenViewport(390, 844)).toBe(isWidescreenViewport(844, 390));
    expect(isWidescreenViewport(1920, 1080)).toBe(true);
    expect(isWidescreenViewport(1080, 1920)).toBe(true);
  });

  it("rejects screens below either floor, and missing dimensions", () => {
    // Both floors apply to the sorted sides, so the long-side failure has to be
    // a screen whose LONGER side is short — not merely a narrow tall one.
    expect(isWidescreenViewport(MIN_LONG_SIDE_PX - 1, MIN_SHORT_SIDE_PX)).toBe(false);
    expect(isWidescreenViewport(1920, MIN_SHORT_SIDE_PX - 1)).toBe(false);
    expect(isWidescreenViewport(0, 0)).toBe(false);
  });
});

describe("canViewportShowMap", () => {
  it("does not take the world away when the window gets TALLER", () => {
    // The bug this replaces, in the operator's own two window sizes: same
    // width, more height, and the map disappeared. `(orientation: portrait)` is
    // a viewport aspect test — 1250x1250 reports portrait — so growing the
    // window past square blocked it.
    expect(canViewportShowMap(1250, 547)).toBe(true);
    expect(canViewportShowMap(1250, 1250)).toBe(true);
    expect(canViewportShowMap(1250, 4000)).toBe(true);
  });

  it("still tells a portrait phone to rotate, and lets it in once it has", () => {
    expect(canViewportShowMap(390, 844)).toBe(false);
    expect(canViewportShowMap(844, 390)).toBe(true);
  });

  it("admits a tablet held upright once it is wide enough to chart", () => {
    // A deliberate contract change: "capable screen in portrait" used to be
    // blocked outright. 720px of width is 720px of width whichever axis is
    // longer.
    expect(canViewportShowMap(820, 1180)).toBe(true);
    expect(canViewportShowMap(600, 960)).toBe(false);
  });

  it("blocks a window too short to hold the composition", () => {
    expect(canViewportShowMap(1600, MIN_SHORT_SIDE_PX - 1)).toBe(false);
    expect(canViewportShowMap(1600, MIN_SHORT_SIDE_PX)).toBe(true);
  });

  it("treats width as the binding constraint, not the longer side", () => {
    // The distinction from `isWidescreenViewport`: a viewport that would pass
    // the device check by being tall must still fail on width.
    expect(isWidescreenViewport(400, 900)).toBe(true);
    expect(canViewportShowMap(400, 900)).toBe(false);
  });

  it("rejects missing dimensions", () => {
    expect(canViewportShowMap(0, 0)).toBe(false);
    expect(canViewportShowMap(Number.NaN, 800)).toBe(false);
  });
});
