// Vitest setup. Polyfills browser APIs that the renderer uses but jsdom (and
// node) don't provide. The polyfills are minimal stubs — tests exercise call
// shape, not raster output.

declare global {
  /**
   * Visual tests set this to force a deterministic wall-clock hour while the
   * normal motion clock remains owned by the route RAF loop.
   */
  var __pharosVilleTestWallClockHour: number | undefined;
}

// Seed the legend first-visit dismissal so component tests exercise the
// steady-state world instead of the one-time onboarding overlay. Tests that
// cover the auto-open path clear this key explicitly.
try {
  globalThis.localStorage?.setItem("pharosville.legend.dismissed", "1");
} catch {
  // Non-DOM test environments have no localStorage; nothing to seed.
}

if (typeof globalThis.Path2D === "undefined") {
  class Path2DStub {
    moveTo(): void {}
    lineTo(): void {}
    arc(): void {}
    arcTo(): void {}
    bezierCurveTo(): void {}
    closePath(): void {}
    ellipse(): void {}
    quadraticCurveTo(): void {}
    rect(): void {}
    addPath(): void {}
  }
  (globalThis as unknown as { Path2D: typeof Path2DStub }).Path2D = Path2DStub;
}

export {};
