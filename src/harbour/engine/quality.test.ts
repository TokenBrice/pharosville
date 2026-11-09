import { describe, expect, it } from "vitest";
import { backingDpr, backingLimitsFor, HEADROOM_PIXELS, TIERS, initialRungFor, ladderFor, parseTier, type QualityRung } from "./quality";
import { gradePixel } from "./post";
import type { Grade } from "./time-of-day";

describe("quality ladder", () => {
  it("base rungs never render above the device pixel ratio; only Q3 headroom rungs may, on 1× screens", () => {
    // v1.8.0 Q3 (amended): the base ladder (arrival, pins, rescue) stays at or under the display ratio and the
    // 4 MP ceiling. Above it sit High-only headroom rungs under their own 8.3 MP ceiling: toward native where
    // the 4 MP ceiling clamped it, and above display ratio 1 only with supersample (1×, discrete start, switch on).
    const free = { width: 16384, height: 16384 };
    const tag = (l: QualityRung[]) => l.map((r) => `${r.tier}@${+r.dpr.toFixed(3)}${r.headroom ? "+" : ""}`);
    const at = (w: number, h: number, device: number, supersample: boolean) =>
      ladderFor(device, backingDpr(w, h, 2, free), { ceiling: backingDpr(w, h, 2, free, HEADROOM_PIXELS), supersample });
    expect(tag(at(1920, 1080, 1, true)).slice(-3)).toEqual(["high@1", "high@1.5+", "high@2+"]);
    expect(tag(at(2560, 1440, 1, true)).slice(-2)).toEqual(["high@1", "high@1.5+"]);
    expect(tag(at(1920, 1080, 1, false)).slice(-1)).toEqual(["high@1"]);       // integrated start / switch off
    expect(tag(at(1600, 1000, 2, false)).slice(-3)).toEqual(["high@1.581", "high@1.75+", "high@2+"]);   // N5
    expect(tag(at(2560, 1600, 2, true)).slice(-2)).toEqual(["high@0.988", "high@1.424+"]);   // no 1× supersampling at 2×
    expect(tag(at(3840, 2160, 1, true)).slice(-2)).toEqual(["high@0.694", "high@1+"]);
    expect(tag(at(1440, 900, 1.5, true)).slice(-1)).toEqual(["high@1.5"]);     // native fits 4 MP: nothing above it
    for (const [w, h, device] of [[1920, 1080, 1], [2560, 1440, 1], [1600, 1000, 2], [2560, 1600, 2], [3840, 2160, 1], [1366, 768, 1]] as const) {
      for (const r of at(w, h, device, true)) {
        if (!r.headroom) expect(r.dpr).toBeLessThanOrEqual(Math.min(device, backingDpr(w, h, 2, free)));
        else {
          expect(r.tier).toBe("high");
          expect(Math.floor(w * r.dpr) * Math.floor(h * r.dpr)).toBeLessThanOrEqual(HEADROOM_PIXELS);
          if (r.dpr > device) expect(device).toBeLessThanOrEqual(1);
        }
      }
    }
    const one = ladderFor(1);
    expect(one.map((r) => `${r.tier}@${r.dpr}`)).toEqual(["low@0.5", "low@0.67", "low@0.8", "low@1", "medium@1", "high@1"]);
    const two = ladderFor(2);
    expect(two[two.length - 1]).toEqual({ tier: "high", dpr: 2 });
    expect(ladderFor(3)[ladderFor(3).length - 1].dpr).toBe(2);
    for (const r of ladderFor(1.5)) expect(r.dpr).toBeLessThanOrEqual(1.5);
    expect(ladderFor(0.8).map((r) => r.dpr)).toEqual([0.5, 0.67, 0.8, 0.8, 0.8]);
    expect(ladderFor(0.4).map((r) => r.dpr)).toEqual([0.4, 0.4, 0.4]);
  });

  it("keeps tier floors while deduplicating ceiling-clamped resolution states", () => {
    const capped = ladderFor(2, 0.7);
    expect(capped).toEqual([{ tier: "low", dpr: 0.5 }, { tier: "low", dpr: 0.67 }, { tier: "low", dpr: 0.7 }, { tier: "medium", dpr: 0.7 }, { tier: "high", dpr: 0.7 }]);
    expect(ladderFor(2).filter((r) => r.tier !== "low").every((r) => r.dpr >= 1.25)).toBe(true);
  });

  it("starts integrated GPUs at Medium 1.5 and discrete GPUs at the top", () => {
    const l = ladderFor(2);
    expect(l[initialRungFor("ANGLE (Apple, Apple M2, OpenGL 4.1)", l)]).toEqual({ tier: "medium", dpr: 1.5 });
    expect(l[initialRungFor("ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)", l)]).toEqual({ tier: "medium", dpr: 1.5 });
    expect(initialRungFor("ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5070 Ti)", l)).toBe(l.length - 1);
    expect(initialRungFor("SwiftShader", l)).toBe(0);
    // a headroom rung is never a start rung: a discrete GPU starts at the 4 MP High rung
    const h = ladderFor(1, 1.39, { ceiling: 2, supersample: true });
    expect(h[initialRungFor("NVIDIA GeForce RTX 5070 Ti", h)]).toEqual({ tier: "high", dpr: 1 });
    expect(h[initialRungFor("Apple M3 Max", h)]).toEqual({ tier: "high", dpr: 1 });
  });

  it("starts phone and tablet GPUs, and any coarse-pointer device, at Medium 1.5", () => {
    const l = ladderFor(2.625);
    const medium = { tier: "medium", dpr: 1.5 };
    expect(l[initialRungFor("ANGLE (Qualcomm, Adreno (TM) 830, OpenGL ES 3.2)", l)]).toEqual(medium);
    expect(l[initialRungFor("Mali-G715", l)]).toEqual(medium);
    expect(l[initialRungFor("Apple GPU", l)]).toEqual(medium);
    expect(l[initialRungFor("PowerVR Rogue GE8320", l)]).toEqual(medium);
    expect(l[initialRungFor("ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4060 Laptop GPU)", l, true)]).toEqual(medium);
    expect(l[l.length - 1].dpr).toBe(2);
    expect(parseTier("low")).toBe("low");
    expect(parseTier("ultra")).toBeNull();
  });

  it("refreshes interval-driven shadows at most every other frame below High", () => {
    expect([TIERS.low.shadowMapSize, TIERS.medium.shadowMapSize, TIERS.high.shadowMapSize]).toEqual([1024, 2048, 4096]);
    expect(TIERS.low.shadowInterval).toBe(1 / 15);
    expect(TIERS.high.shadowInterval).toBe(0);
    expect(TIERS.high.shadowMinFrames).toBe(1);
    expect(TIERS.medium.shadowMinFrames).toBe(2);
    expect(TIERS.low.shadowMinFrames).toBe(2);
  });
});

describe("hard backing limits", () => {
  it.each([
    [4096, 8192, [16384, 16384], { width: 4096, height: 4096 }],
    [16384, 2048, [16384, 16384], { width: 2048, height: 2048 }],
    [16384, 8192, [4096, 2048], { width: 4096, height: 2048 }],
  ])("uses the tightest texture, renderbuffer and viewport bounds", (texture, renderbuffer, viewport, expected) => {
    const gl = {
      MAX_TEXTURE_SIZE: 1, MAX_RENDERBUFFER_SIZE: 2, MAX_VIEWPORT_DIMS: 3,
      getParameter: (p: number) => p === 1 ? texture : p === 2 ? renderbuffer : new Int32Array(viewport),
    } as unknown as WebGL2RenderingContext;
    expect(backingLimitsFor(gl)).toEqual(expected);
  });

  it("clamps before allocation against hard dimensions and the 4 MP ceiling", () => {
    const limits = { width: 4096, height: 2048 };
    expect(backingDpr(1000, 700, 2, limits)).toBe(2);
    expect(backingDpr(4000, 1000, 2, limits)).toBe(1);
    expect(backingDpr(1000, 4000, 2, limits)).toBe(0.512);
    expect(backingDpr(8000, 4000, 1, limits)).toBe(Math.sqrt(0.125));
  });

  it.each([[3840, 2160], [2560, 1600], [1600, 2560], [9000, 4000]])("budgets %i×%i CSS pixels before any tier or override allocates", (width, height) => {
    const dpr = backingDpr(width, height, 2, { width: 16384, height: 16384 });
    expect(Math.floor(width * dpr) * Math.floor(height * dpr)).toBeLessThanOrEqual(4_000_000);
    expect(dpr).toBeCloseTo(Math.sqrt(4_000_000 / (width * height)));
  });
});

describe("hue-selective grade", () => {
  const base: Grade = { lift: [1, 1, 1], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, contrast: 1 };
  const chroma = (c: [number, number, number]) => Math.max(...c) - Math.min(...c);
  it("blueSat calms the sea without touching a red roof", () => {
    const sea: [number, number, number] = [0.1, 0.4, 0.6], roof: [number, number, number] = [0.7, 0.25, 0.15];
    const g = { ...base, blueSat: 0.8 };
    expect(chroma(gradePixel(sea, g))).toBeLessThan(chroma(gradePixel(sea, base)) - 0.05);
    expect(chroma(gradePixel(roof, g))).toBeCloseTo(chroma(gradePixel(roof, base)), 5);
  });
  it("shadowSat desaturates dark tones but leaves bright warm lights", () => {
    const g = { ...base, shadowSat: 0.5 };
    expect(chroma(gradePixel([0.05, 0.08, 0.16], g))).toBeLessThan(chroma(gradePixel([0.05, 0.08, 0.16], base)));
    expect(chroma(gradePixel([1, 0.7, 0.4], g))).toBeCloseTo(chroma(gradePixel([1, 0.7, 0.4], base)), 5);
  });
});
