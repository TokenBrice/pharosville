import { describe, expect, it } from "vitest";
import { weatherInputs } from "./controller";
import { birdThinning, cicadaLevel } from "./ambience";

describe("harbour sound: weather and season inputs", () => {
  it("absent services read as fair weather with no season colour", () => {
    const i = weatherInputs(undefined, undefined, 0.35, 0);
    expect(i).toMatchObject({ storm: 0, rain: 0, snow: 0, wet: 0, wind: 0.35, spring: 0, summer: 0, autumn: 0, winter: 0, snowCover: 0 });
  });

  it("storminess is the DEWS level (continuous), or the band when no level is shown yet", () => {
    expect(weatherInputs({ state: { level: 4 } }, undefined, 0.3, 0).storm).toBe(1);
    expect(weatherInputs({ state: { level: 2.4 } }, undefined, 0.3, 0).storm).toBeCloseTo(0.6);
    expect(weatherInputs({ state: { level: null }, band: "ALERT" }, undefined, 0.3, 0).storm).toBe(0.5);
    expect(weatherInputs({ state: { level: 4 } }, undefined, 0.3, 0).gust).toBe(1);
  });

  it("precipitation type and intensity come from the weather; season weights and snow cover from the calendar", () => {
    const i = weatherInputs(
      { state: { level: 3, wind: 0.8, wetness: 0.7 }, precip: { rain: 0, snow: 0.62 } },
      { weights: [0, 0, 0.2, 0.8], snowCover: 0.9 }, 0.3, 0,
    );
    expect(i).toMatchObject({ rain: 0, snow: 0.62, wind: 0.8, wet: 0.7, autumn: 0.2, winter: 0.8, snowCover: 0.9 });
  });
});

describe("harbour sound: summer cicadas", () => {
  it("sing only in summer afternoons, fading at the edges", () => {
    expect(cicadaLevel(1, 15)).toBe(1);
    expect(cicadaLevel(1, 8)).toBe(0);
    expect(cicadaLevel(1, 22)).toBe(0);
    expect(cicadaLevel(1, 12)).toBeGreaterThan(0);
    expect(cicadaLevel(1, 12)).toBeLessThan(1);
    expect(cicadaLevel(0, 15)).toBe(0);
    expect(cicadaLevel(0.5, 15)).toBeCloseTo(0.5);
  });

  it("thin the birdsong only while they play", () => {
    expect(birdThinning(0)).toBe(1);
    expect(birdThinning(1)).toBeLessThan(birdThinning(0.5));
    expect(birdThinning(1)).toBeGreaterThan(0);
  });
});
