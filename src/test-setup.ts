// Vitest setup. Polyfills browser APIs that the renderer uses but jsdom (and
// node) don't provide. The polyfills are minimal stubs — tests exercise call
// shape, not raster output.

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
