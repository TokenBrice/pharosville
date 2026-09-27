import { describe, expect, it } from "vitest";
import {
  gardenMicroseason,
  gardenPetalDrift,
  gardenSeasonalVisitor,
  gardenSnowCover,
  seasonalPhenology,
  solarEclipticLongitudeDeg,
} from "./garden-calendar";

const NORTH = { latitudeRad: (35 * Math.PI) / 180, southern: false };
const SOUTH = { latitudeRad: -(35 * Math.PI) / 180, southern: true };
const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("garden calendar", () => {
  it("follows the sun, not the UTC month: equinoxes, solstices and the 72 kō", () => {
    expect(solarEclipticLongitudeDeg(day("2026-03-20"))).toBeGreaterThan(359);
    expect(Math.abs(solarEclipticLongitudeDeg(day("2026-06-21")) - 90)).toBeLessThan(1);
    expect(Math.abs(solarEclipticLongitudeDeg(day("2026-09-23")) - 180)).toBeLessThan(1);
    // Risshun opens the year; the capture day falls in "Thunder ceases".
    expect(gardenMicroseason(day("2026-02-05"), NORTH)).toMatchObject({ index: 0, sekki: "Beginning of spring" });
    expect(gardenMicroseason(day("2026-09-26"), NORTH)).toMatchObject({ index: 45, name: "Thunder ceases" });
    // Half a year on in the southern hemisphere.
    expect(gardenMicroseason(day("2026-09-26"), SOUTH).sekki).toBe("Spring equinox");
  });

  it("turns each maple on its own day and bares it weeks later", () => {
    const turnDay = (seed: string) => {
      for (let offset = 0; offset < 120; offset += 1) {
        const date = new Date(Date.UTC(2026, 9, 1) + offset * 86_400_000);
        if (seasonalPhenology(seed, date, "momiji", NORTH).turn > 0.5) return offset;
      }
      return -1;
    };
    const days = Array.from({ length: 8 }, (_, index) => turnDay(`maple.${index}`));
    expect(days.every((offset) => offset > 0)).toBe(true);
    expect(new Set(days).size).toBeGreaterThan(3);
    const september = seasonalPhenology("maple.0", day("2026-09-26"), "momiji", NORTH);
    expect(september).toMatchObject({ leaf: 1, turn: 0 });
    const january = seasonalPhenology("maple.0", day("2027-01-20"), "momiji", NORTH);
    expect(january.leaf).toBe(0);
    // The same tree in Brisbane is in leaf in January and bare in July.
    expect(seasonalPhenology("maple.0", day("2027-01-20"), "momiji", SOUTH).leaf).toBe(1);
    expect(seasonalPhenology("maple.0", day("2026-07-20"), "momiji", SOUTH).leaf).toBe(0);
  });

  it("flowers the cherry for about nine days either side of early April, then drifts its petals", () => {
    const bloomDays: number[] = [];
    for (let offset = 0; offset < 365; offset += 1) {
      const date = new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000);
      if (seasonalPhenology("lee", date, "cherry", NORTH).blossom > 0) bloomDays.push(offset);
    }
    expect(bloomDays.length).toBeGreaterThan(12);
    expect(bloomDays.length).toBeLessThan(22);
    expect(bloomDays[0]).toBeGreaterThan(70);
    expect(bloomDays.at(-1)).toBeLessThan(115);
    expect(seasonalPhenology("maple", day("2026-04-05"), "momiji", NORTH).blossom).toBe(0);
    expect(gardenPetalDrift("lee", day("2026-07-01"), NORTH)).toBe(0);
  });

  it("lays snow only on a few deep-winter days", () => {
    let snowDays = 0;
    for (let offset = 0; offset < 365 * 3; offset += 1) {
      const date = new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000);
      const cover = gardenSnowCover(date, NORTH);
      if (cover === 0) continue;
      snowDays += 1;
      const month = date.getUTCMonth();
      expect(month === 11 || month <= 2, date.toISOString()).toBe(true);
    }
    expect(snowDays).toBeGreaterThan(0);
    expect(snowDays / 3).toBeLessThan(20);
  });

  it("gates one seasonal visitor by kō, and none most of the year (K24)", () => {
    expect(gardenSeasonalVisitor(day("2026-09-26"), NORTH)).toBeNull();
    expect(gardenSeasonalVisitor(day("2026-04-05"), NORTH)).toBeNull();
    expect(gardenSeasonalVisitor(day("2026-06-12"), NORTH)?.id).toBe("fireflies");
    expect(gardenSeasonalVisitor(day("2026-11-15"), NORTH)?.id).toBe("leaf-fall");
    // South of the equator the garden year is half a turn apart.
    expect(gardenSeasonalVisitor(day("2026-05-15"), SOUTH)?.id).toBe("leaf-fall");
  });
});
