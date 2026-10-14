import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QualityGovernor } from "./governor";

/** A WebGL2 stand-in with no timer-query extension (Safari / Chrome-on-Mac path) and a named GPU. */
function fakeGl(renderer: string): WebGL2RenderingContext {
  return {
    RENDERER: 0x1f01,
    getExtension: (name: string) => (name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 1 } : null),
    getParameter: () => renderer,
  } as unknown as WebGL2RenderingContext;
}

function run(g: QualityGovernor, seconds: number, frameMs: number): void {
  for (let t = 0; t < seconds * 1000; t += frameMs) g.end(frameMs / 1000);
}

describe("quality governor (no GPU timer)", () => {
  beforeEach(() => { vi.stubGlobal("location", { search: "" }); vi.stubGlobal("devicePixelRatio", 2); });
  afterEach(() => vi.unstubAllGlobals());

  it("starts an Apple GPU at Medium 1.5, steps down on missed frames, then probes back up", () => {
    const applied: string[] = [];
    const g = new QualityGovernor(fakeGl("ANGLE (Apple, Apple M1, OpenGL 4.1)"), (s, d) => applied.push(`${s.tier}@${d}`));
    expect(`${g.tier}@${g.dpr}`).toBe("medium@1.5");
    run(g, 12, 33.4);                       // 30 fps: too rich
    expect(g.level).toBeLessThan(3);
    const low = g.level;
    run(g, 60, 16.7);                       // clean 60 fps for a minute: probe upward
    expect(g.level).toBeGreaterThan(low);
    expect(applied.length).toBeGreaterThan(1);
  });

  it("a failed probe sets a ceiling instead of oscillating", () => {
    const g = new QualityGovernor(fakeGl("Apple M2"), () => {});
    const start = g.level;
    for (let i = 0; i < 3000 && g.level === start; i++) g.end(0.0167);   // clean → probe up one rung
    expect(g.level).toBe(start + 1);
    run(g, 8, 33.4);                        // the probe misses frames → back down
    expect(g.level).toBe(start);
    run(g, 40, 16.7);                       // clean again, but the ceiling holds for a while
    expect(g.level).toBe(start);
  });

  it("?quality pins the tier and never moves", () => {
    vi.stubGlobal("location", { search: "?quality=low" });
    const g = new QualityGovernor(fakeGl("NVIDIA GeForce RTX 4090"), () => {});
    expect(g.tier).toBe("low");
    run(g, 20, 40);
    expect(g.tier).toBe("low");
    expect(g.auto).toBe(false);
  });
});
