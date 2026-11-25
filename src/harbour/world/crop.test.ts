import { describe, expect, it } from "vitest";
import { bareOf, leafSnowKeepOf, PATTERN_CROP, patternIdOf } from "./materials";
import { GLSL_SEASON } from "./shaders/season";

const unorm8 = (x: number) => Math.round(x * 255) / 255;

describe("08-T11 crop pattern", () => {
  it("survives the 8-bit COLOR_0 alpha and is no leaf (never drops, keeps the full snow cover)", () => {
    expect(patternIdOf(unorm8(PATTERN_CROP / 16))).toBe(PATTERN_CROP);
    expect(bareOf(PATTERN_CROP, [0.4, 0.3, 0.1], 1)).toBe(0);
    expect(leafSnowKeepOf(PATTERN_CROP)).toBe(1);
  });

  it("renders warm Mediterranean tilled soil with macro tonal breakup", () => {
    const fn = GLSL_SEASON.slice(GLSL_SEASON.indexOf("vec3 hbCrop"), GLSL_SEASON.indexOf("vec3 hbFoliage"));
    expect(fn).toContain("hbFbm(W * 0.085)");
    expect(fn).toContain("vec3(0.31, 0.20, 0.105)");
    expect(fn).toContain("vec3(0.19, 0.115, 0.058)");
  });
});
