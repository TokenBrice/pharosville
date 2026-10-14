import { describe, expect, it } from "vitest";
import { initialRungFor, ladderFor, parseTier } from "./quality";
import { gradePixel } from "./post";
import type { Grade } from "./time-of-day";

describe("quality ladder", () => {
  it("never renders above the device pixel ratio and dedupes rungs", () => {
    const one = ladderFor(1);
    expect(one.map((r) => `${r.tier}@${r.dpr}`)).toEqual(["low@1", "medium@1", "high@1"]);
    const two = ladderFor(2);
    expect(two[two.length - 1]).toEqual({ tier: "high", dpr: 2 });
    expect(ladderFor(3)[ladderFor(3).length - 1].dpr).toBe(2);
    for (const r of ladderFor(1.5)) expect(r.dpr).toBeLessThanOrEqual(1.5);
  });

  it("starts integrated GPUs at Medium 1.5 and discrete GPUs at the top", () => {
    const l = ladderFor(2);
    expect(l[initialRungFor("ANGLE (Apple, Apple M2, OpenGL 4.1)", l)]).toEqual({ tier: "medium", dpr: 1.5 });
    expect(l[initialRungFor("ANGLE (Intel, Intel(R) Iris(R) Xe Graphics)", l)]).toEqual({ tier: "medium", dpr: 1.5 });
    expect(initialRungFor("ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5070 Ti)", l)).toBe(l.length - 1);
    expect(initialRungFor("SwiftShader", l)).toBe(0);
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
