import { describe, expect, it } from "vitest";
import { attentionFor, weatherInputs } from "./controller";
import { birdThinning, cicadaLevel, settleDb, settleRate } from "./ambience";

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

describe("harbour sound: the ten-minute settle", () => {
  it("attention holds for three idle minutes, then eases to zero over one", () => {
    expect(attentionFor(0)).toBe(1);
    expect(attentionFor(179)).toBe(1);
    expect(attentionFor(210)).toBeCloseTo(0.5);
    expect(attentionFor(240)).toBe(0);
    expect(attentionFor(3600)).toBe(0);
  });

  it("settled: 3 dB down and ~30 % sparser; the breathing never exceeds ±1.5 dB", () => {
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t < 3600; t += 1.3) { const d = settleDb(1, t, 0.7); lo = Math.min(lo, d); hi = Math.max(hi, d); }
    expect(hi).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(lo).toBeGreaterThanOrEqual(-1.5 - 1e-9);
    expect(hi - lo).toBeGreaterThan(2);          // it does breathe
    for (const t of [0, 77, 400]) expect(settleDb(0, t, 0.7) - settleDb(1, t, 0.7)).toBeCloseTo(-3);
    expect(settleRate(1)).toBe(1);
    expect(settleRate(0)).toBeCloseTo(0.7);
  });
});
