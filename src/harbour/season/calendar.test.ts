import { describe, expect, it } from "vitest";
import {
  meteorIntervalSec, meteorShowerOn, moonAge, moonIllumination, parseMoonOverride, SYNODIC_DAYS,
  dayOfYear, dominantSeason, isSouthernZone, northernDay, overrideDay, parseSeasonOverride, seasonWeights, snowShareFor,
  solarDay,
} from "./calendar";
import { seasonalKeyHour } from "../engine/time-of-day";

const sum = (w: readonly number[]) => w.reduce((a, b) => a + b, 0);

describe("season calendar", () => {
  it("picks the meteorological season mid-season and sums to 1 everywhere", () => {
    expect(dominantSeason(seasonWeights(dayOfYear(2026, 1, 15)))).toBe("winter");
    expect(dominantSeason(seasonWeights(dayOfYear(2026, 4, 15)))).toBe("spring");
    expect(dominantSeason(seasonWeights(dayOfYear(2026, 7, 15)))).toBe("summer");
    expect(dominantSeason(seasonWeights(dayOfYear(2026, 10, 14)))).toBe("autumn");
    for (let d = 1; d <= 365; d++) expect(sum(seasonWeights(d))).toBeCloseTo(1, 6);
  });

  it("blends over about two weeks at a boundary, never jumps", () => {
    const dec1 = dayOfYear(2026, 12, 1);
    const w = seasonWeights(dec1);
    expect(w[2]).toBeGreaterThan(0.3);
    expect(w[3]).toBeGreaterThan(0.3);
    expect(seasonWeights(dec1 - 8)[3]).toBe(0);
    expect(seasonWeights(dec1 + 8)[2]).toBe(0);
    for (let d = 2; d <= 365; d++) {
      const a = seasonWeights(d - 1), b = seasonWeights(d);
      for (let s = 0; s < 4; s++) expect(Math.abs(a[s] - b[s])).toBeLessThan(0.2);
    }
  });

  it("puts the southern hemisphere half a year on", () => {
    expect(isSouthernZone("Australia/Sydney")).toBe(true);
    expect(isSouthernZone("Europe/Paris", -60, -120)).toBe(false);
    expect(isSouthernZone("Etc/Unknown", -660, -600)).toBe(true); // DST in January
    const july = dayOfYear(2026, 7, 15);
    expect(dominantSeason(seasonWeights(northernDay(july, true)))).toBe("winter");
  });

  it("gives long summer days and short winter ones at 35°", () => {
    const june = solarDay(dayOfYear(2026, 6, 21), 35, 1), dec = solarDay(dayOfYear(2026, 12, 21), 35, 0);
    expect(june.dayLengthHours).toBeGreaterThan(14.2);
    expect(dec.dayLengthHours).toBeLessThan(10);
    expect(june.noonElevation).toBeGreaterThan(75);
    expect(dec.noonElevation).toBeLessThan(33);
    expect(dec.sunset).toBeLessThan(17.5);
    // the southern winter is the northern summer, mirrored
    expect(solarDay(dayOfYear(2026, 6, 21), -35, 0).dayLengthHours).toBeLessThan(10);
  });

  it("reads the dev overrides in the visitor's hemisphere", () => {
    const get = (q: string) => (k: string) => new URLSearchParams(q).get(k);
    expect(parseSeasonOverride(get("season=winter"))).toEqual({ season: "winter" });
    expect(parseSeasonOverride(get("month=13"))).toEqual({});
    expect(dominantSeason(seasonWeights(overrideDay({ season: "winter" }, 2026, false)!))).toBe("winter");
    const southWinter = overrideDay({ season: "winter" }, 2026, true)!;
    expect(dominantSeason(seasonWeights(northernDay(southWinter, true)))).toBe("winter");
    expect(overrideDay({ month: 3 }, 2026, false)).toBe(dayOfYear(2026, 3, 15));
    expect(overrideDay({}, 2026, false)).toBeNull();
  });

  it("snows only in winter", () => {
    expect(snowShareFor(seasonWeights(dayOfYear(2026, 1, 15)))).toBe(1);
    expect(snowShareFor(seasonWeights(dayOfYear(2026, 7, 15)))).toBe(0);
    expect(snowShareFor(seasonWeights(dayOfYear(2026, 10, 15)))).toBe(0);
  });
});

describe("seasonal day remap", () => {
  it("lands dawn and dusk on the real sunrise and sunset", () => {
    // winter: sun up 7.3, down 17.1 → the reference keys 6.0 and 19.85
    expect(seasonalKeyHour(7.3, 7.3, 17.1)).toBeCloseTo(6.0, 5);
    expect(seasonalKeyHour(17.1, 7.3, 17.1)).toBeCloseTo(19.85, 5);
    // 18.5 on a winter evening is already the blue hour / night
    expect(seasonalKeyHour(18.5, 7.3, 17.1)).toBeGreaterThan(20.5);
    // monotone round the clock
    let prev = -1;
    for (let h = 7.3; h < 7.3 + 24; h += 0.25) {
      let k = seasonalKeyHour(h % 24, 7.3, 17.1);
      if (k < prev - 12) k += 24;
      expect(k).toBeGreaterThanOrEqual(prev);
      prev = k;
    }
  });

  it("keeps the golden hour and dusk in real hours around sunset (01-A8)", () => {
    for (const [rise, set] of [[7.3, 17.1], [5.9, 20.1], [7.6, 18.4]]) {
      expect(seasonalKeyHour(set - 1.35, rise, set)).toBeCloseTo(18.5, 5);   // the golden key
      expect(seasonalKeyHour(set - 0.15, rise, set)).toBeCloseTo(19.7, 5);   // dusk
      expect(seasonalKeyHour(set + 0.85, rise, set)).toBeCloseTo(20.7, 5);   // blue hour
      expect(seasonalKeyHour(rise + 0.4, rise, set)).toBeCloseTo(6.4, 5);    // dawn
    }
  });

  it("is the identity on the reference day", () => {
    for (const h of [0, 3, 6, 9, 12, 18.5, 21]) expect(seasonalKeyHour(h, 6.0, 19.85)).toBeCloseTo(h, 5);
  });
});

describe("W04 moon phase", () => {
  it("is new and full on real dates (within a day)", () => {
    const near = (a: number, b: number) => Math.min(Math.abs(a - b), SYNODIC_DAYS - Math.abs(a - b));
    expect(near(moonAge(Date.UTC(2024, 3, 8, 18, 21)), 0)).toBeLessThan(1);      // the April 2024 eclipse
    expect(near(moonAge(Date.UTC(2024, 3, 23, 23, 49)), SYNODIC_DAYS / 2)).toBeLessThan(1);
    expect(near(moonAge(Date.UTC(2026, 0, 3, 10, 3)), SYNODIC_DAYS / 2)).toBeLessThan(1);  // full moon 3 Jan 2026
    expect(moonIllumination(moonAge(Date.UTC(2024, 3, 8, 18, 21)))).toBeLessThan(0.02);
    expect(moonIllumination(SYNODIC_DAYS / 2)).toBeCloseTo(1);
    expect(moonIllumination(SYNODIC_DAYS / 4)).toBeCloseTo(0.5);
  });

  it("reads ?moon=", () => {
    const get = (q: string) => (k: string) => new URLSearchParams(q).get(k);
    expect(parseMoonOverride(get("moon=7.4"))).toBeCloseTo(7.4);
    expect(parseMoonOverride(get(""))).toBeNull();
    expect(parseMoonOverride(get("moon=x"))).toBeNull();
  });
});

describe("W06 meteor showers", () => {
  it("fall on their real dates and nowhere else", () => {
    expect(meteorShowerOn(dayOfYear(2026, 8, 12), false)?.shower.name).toBe("perseids");
    expect(meteorShowerOn(dayOfYear(2026, 8, 12), false)!.strength).toBeGreaterThan(0.8);
    expect(meteorShowerOn(dayOfYear(2026, 12, 14), false)?.shower.name).toBe("geminids");
    expect(meteorShowerOn(dayOfYear(2026, 10, 21), false)?.shower.name).toBe("orionids");
    expect(meteorShowerOn(dayOfYear(2026, 3, 1), false)).toBeNull();
    expect(meteorShowerOn(dayOfYear(2026, 1, 3), false)?.shower.name).toBe("quadrantids");
    // the Perseids are a northern shower; the eta Aquariids favour the south
    expect(meteorShowerOn(dayOfYear(2026, 8, 12), true)!.strength).toBeLessThan(0.3);
    expect(meteorShowerOn(dayOfYear(2026, 5, 6), true)!.strength).toBeGreaterThan(meteorShowerOn(dayOfYear(2026, 5, 6), false)!.strength);
  });

  it("are rare: 15-40 s apart at a peak, minutes apart otherwise", () => {
    expect(meteorIntervalSec(null)).toBe(300);
    const per = meteorIntervalSec(meteorShowerOn(dayOfYear(2026, 8, 12), false));
    expect(per).toBeGreaterThanOrEqual(15);
    expect(per).toBeLessThanOrEqual(40);
  });
});
