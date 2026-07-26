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
    expect(canViewportShowMap(1250, MIN_SHORT_SIDE_PX)).toBe(true);
    expect(canViewportShowMap(1250, 1250)).toBe(true);
    expect(canViewportShowMap(1250, 4000)).toBe(true);
  });

  it("rejects phones in either orientation because neither has chartable dimensions", () => {
    expect(canViewportShowMap(390, 844)).toBe(false);
    expect(canViewportShowMap(844, 390)).toBe(false);
  });

  it("admits tall and ultrawide viewports once both sorted dimensions pass", () => {
    // A deliberate contract change: "capable screen in portrait" used to be
    // blocked outright. A tall viewport remains valid because these are direct
    // size tests, not an orientation or aspect-ratio test.
    expect(canViewportShowMap(MIN_SHORT_SIDE_PX, 1000)).toBe(true);
    expect(canViewportShowMap(2560, MIN_SHORT_SIDE_PX)).toBe(true);
    expect(canViewportShowMap(820, 1180)).toBe(true);
    expect(canViewportShowMap(600, 960)).toBe(false);
  });

  it("blocks below the measured floor and admits the first passing size", () => {
    expect(canViewportShowMap(MIN_SHORT_SIDE_PX - 1, MIN_LONG_SIDE_PX)).toBe(false);
    expect(canViewportShowMap(MIN_SHORT_SIDE_PX, MIN_LONG_SIDE_PX - 1)).toBe(false);
    expect(canViewportShowMap(MIN_SHORT_SIDE_PX, MIN_LONG_SIDE_PX)).toBe(true);
    expect(canViewportShowMap(MIN_LONG_SIDE_PX, MIN_SHORT_SIDE_PX)).toBe(true);
  });

  it("uses the same orientation-free size predicate as the physical screen", () => {
    expect(isWidescreenViewport(719, 900)).toBe(false);
    expect(canViewportShowMap(400, 900)).toBe(false);
    expect(canViewportShowMap(720, 1000)).toBe(isWidescreenViewport(720, 1000));
    expect(canViewportShowMap(1000, 720)).toBe(isWidescreenViewport(1000, 720));
  });

  it("rejects missing dimensions", () => {
    expect(canViewportShowMap(0, 0)).toBe(false);
    expect(canViewportShowMap(Number.NaN, 800)).toBe(false);
  });
});
