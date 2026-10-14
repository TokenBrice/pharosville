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

  it("rejects screens below the profile, and missing dimensions", () => {
    expect(isWidescreenViewport(MIN_LONG_SIDE_PX - 1, MIN_SHORT_SIDE_PX)).toBe(false);
    expect(isWidescreenViewport(1920, MIN_SHORT_SIDE_PX - 1)).toBe(false);
    expect(isWidescreenViewport(0, 0)).toBe(false);
  });

  it("still admits the earlier desktop (900×720) and wide-laptop (1200×640) profiles", () => {
    expect(isWidescreenViewport(900, 720)).toBe(true);
    expect(isWidescreenViewport(1200, 640)).toBe(true);
    expect(isWidescreenViewport(640, 1200)).toBe(true);
  });

  it("admits unfolded foldables and tablets, keeps phones and folded foldables out", () => {
    expect(isWidescreenViewport(832, 750)).toBe(true);   // Galaxy Z Fold 7 inner screen
    expect(isWidescreenViewport(744, 1133)).toBe(true);  // iPad mini
    expect(isWidescreenViewport(800, 1280)).toBe(true);  // Galaxy Tab
    expect(isWidescreenViewport(412, 915)).toBe(false);  // a large phone
    expect(isWidescreenViewport(411, 960)).toBe(false);  // Fold 7 cover screen (folded)
    expect(isWidescreenViewport(480, 1040)).toBe(false); // the widest phones
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
    expect(canViewportShowMap(915, 412)).toBe(false);
  });

  it("admits the browser-trimmed viewports of foldables and tablets, both ways up", () => {
    expect(canViewportShowMap(832, 680)).toBe(true);   // Fold 7 unfolded, under Chrome's toolbar
    expect(canViewportShowMap(750, 760)).toBe(true);   // Fold 7 unfolded, held the other way
    expect(canViewportShowMap(744, 1000)).toBe(true);  // iPad mini portrait under Safari's bars
    expect(canViewportShowMap(1133, 670)).toBe(true);  // iPad mini landscape under Safari's bars
    expect(canViewportShowMap(820, 1180)).toBe(true);
    expect(canViewportShowMap(2560, MIN_SHORT_SIDE_PX)).toBe(true);
  });

  it("blocks below the measured floor and admits the first passing size", () => {
    expect(canViewportShowMap(MIN_SHORT_SIDE_PX - 1, MIN_LONG_SIDE_PX)).toBe(false);
    expect(canViewportShowMap(MIN_SHORT_SIDE_PX, MIN_LONG_SIDE_PX - 1)).toBe(false);
    expect(canViewportShowMap(MIN_SHORT_SIDE_PX, MIN_LONG_SIDE_PX)).toBe(true);
    expect(canViewportShowMap(MIN_LONG_SIDE_PX, MIN_SHORT_SIDE_PX)).toBe(true);
  });

  it("uses the same orientation-free size predicate as the physical screen", () => {
    expect(canViewportShowMap(400, 900)).toBe(false);
    expect(canViewportShowMap(720, 1000)).toBe(isWidescreenViewport(720, 1000));
    expect(canViewportShowMap(1000, 720)).toBe(isWidescreenViewport(1000, 720));
  });

  it("rejects missing dimensions", () => {
    expect(canViewportShowMap(0, 0)).toBe(false);
    expect(canViewportShowMap(Number.NaN, 800)).toBe(false);
  });
});
