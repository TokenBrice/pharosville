import { describe, expect, it } from "vitest";
import { bareOf, leafSnowKeepOf, PATTERN_CROP, patternIdOf } from "./materials";

const unorm8 = (x: number) => Math.round(x * 255) / 255;

describe("08-T11 crop pattern", () => {
  it("survives the 8-bit COLOR_0 alpha and is no leaf (never drops, keeps the full snow cover)", () => {
    expect(patternIdOf(unorm8(PATTERN_CROP / 16))).toBe(PATTERN_CROP);
    expect(bareOf(PATTERN_CROP, [0.4, 0.3, 0.1], 1)).toBe(0);
    expect(leafSnowKeepOf(PATTERN_CROP)).toBe(1);
  });
});
