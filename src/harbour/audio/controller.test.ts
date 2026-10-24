import { describe, expect, it } from "vitest";
import { anniversaryToday } from "../model/anniversary";
import { attentionFor, beamBreathPeak, beamCrossed, behindOf, burnRateOf, weatherInputs } from "./feed";
import { birdThinning, cicadaLevel, dayClock, hourStrikes, settleDb, settleRate, gustSwell } from "./ambience";

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

describe("harbour sound: front/back cue", () => {
  it("only sources behind the look are darkened, most when straight behind and far", () => {
    expect(behindOf(0, -500, 0, -1)).toBe(0);       // ahead
    expect(behindOf(500, 0, 0, -1)).toBe(0);        // beside
    expect(behindOf(0, 500, 0, -1)).toBeGreaterThan(0.9);
    expect(behindOf(0, 20, 0, -1)).toBeLessThan(0.4); // at the listener's feet: barely
  });
});

describe("harbour sound: the Burn's furnace", () => {
  it("follows the burn activity, and is silent when the reading is stale, banked or missing", () => {
    expect(burnRateOf({ burnRate: 0.6, banked: false })).toBeCloseTo(0.6);
    expect(burnRateOf({ burnRate: 0.6, banked: true })).toBe(0);
    expect(burnRateOf({ banked: false })).toBe(0);
    expect(burnRateOf(undefined)).toBe(0);
    expect(burnRateOf({ burnRate: Number.NaN })).toBe(0);
  });
});

describe("harbour sound: the beam's passing", () => {
  it("is heard once, as the sweep crosses the camera's bearing (not at the far side)", () => {
    expect(beamCrossed(-0.1, 0.05)).toBe(true);
    expect(beamCrossed(0.1, -0.05)).toBe(true);
    expect(beamCrossed(-0.3, -0.1)).toBe(false);
    expect(beamCrossed(3.1, -3.1)).toBe(false);
    expect(beamCrossed(Number.NaN, 0.1)).toBe(false);
  });

  it("follows the beam's reach, is nothing unlit, mutes under stale fog, never above −30 dBFS", () => {
    expect(beamBreathPeak(0.8, false, 1, 0)).toBe(0);
    expect(beamBreathPeak(0.8, true, 1, 0.5)).toBe(0);
    expect(beamBreathPeak(1, true, 1, 0)).toBeLessThanOrEqual(0.045);
    expect(beamBreathPeak(1, true, 1, 0) * 0.7).toBeLessThan(10 ** (-30 / 20) + 1e-9);
    expect(beamBreathPeak(0.9, true, 1, 0)).toBeGreaterThan(beamBreathPeak(0.2, true, 1, 0));
    expect(beamBreathPeak(0.9, true, 0, 0)).toBeLessThan(beamBreathPeak(0.9, true, 1, 0));
  });
});

describe("harbour sound: the day clock", () => {
  it("the dawn chorus, the noon hush and the deep night each hold their hours", () => {
    expect(dayClock(6).chorus).toBe(1);
    expect(dayClock(9).chorus).toBe(0);
    expect(dayClock(13).hush).toBe(1);
    expect(dayClock(17).hush).toBe(0);
    expect(dayClock(23.5).deep).toBe(1);
    expect(dayClock(2).deep).toBe(1);
    expect(dayClock(12).deep).toBe(0);
    expect(dayClock(19).deep).toBe(0);
  });

  it("the hour bell strikes once per hour 06–22, three times at noon, never at night, never a peal", () => {
    expect(hourStrikes(5)).toBe(0);
    expect(hourStrikes(6)).toBe(1);
    expect(hourStrikes(12)).toBe(3);
    expect(hourStrikes(16)).toBe(1);
    expect(hourStrikes(22)).toBe(1);
    expect(hourStrikes(23)).toBe(0);
    expect(hourStrikes(0)).toBe(0);
  });
});

describe("harbour sound: Wreck Cove's anniversary bell (deathDate)", () => {
  const today = new Date(2026, 3, 22, 12);   // 22 April 2026, local
  it("is the same month and day as a full death date from an earlier year", () => {
    expect(anniversaryToday("2024-04-22", today)).toBe(true);
    expect(anniversaryToday("2024-04-21", today)).toBe(false);
    expect(anniversaryToday("2024-05-22", today)).toBe(false);
    expect(anniversaryToday("2026-04-22", today)).toBe(false);   // died today: not yet an anniversary
  });
  it("a month-only date has no day, so never an anniversary", () => {
    expect(anniversaryToday("2024-04", today)).toBe(false);
    expect(anniversaryToday("", today)).toBe(false);
    expect(anniversaryToday(undefined, today)).toBe(false);
  });
});

describe("harbour sound: the shared gust field", () => {
  it("the swell follows the paw; its size is the wind strength only, never above the free-running gusts' ceiling", () => {
    for (const wind of [0, 0.3, 1]) {
      expect(gustSwell(1, wind, 0.5, 0.5)).toBeGreaterThan(gustSwell(0, wind, 0.5, 0.5));
      expect(gustSwell(0, wind, 0.5, 1)).toBeLessThanOrEqual(0.5);   // a lull is a lull in any wind
    }
    expect(gustSwell(1, 1, 0.5, 0.5) - gustSwell(0, 1, 0.5, 0.5)).toBeGreaterThan(3 * (gustSwell(1, 0, 0.5, 0.5) - gustSwell(0, 0, 0.5, 0.5)));
    expect(gustSwell(1, 1, 1, 1)).toBeLessThanOrEqual(0.35 + 0.5 + 0.6 + 0.4);
    expect(Number.isFinite(gustSwell(Number.NaN, 0.3, 0.3, 0.3))).toBe(true);
  });
});
