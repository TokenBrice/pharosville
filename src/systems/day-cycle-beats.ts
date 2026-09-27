/**
 * The five-beat light score (G2/W2.1): a partition of unity over the sky
 * clock. Pure and three-free so the DOM chrome can follow the same score as
 * the renderer without pulling the Three runtime into the main chunk.
 *
 * W2.14 (sky-7, O11): the beats are keyed to the sun's true elevation for the
 * date (`sky-almanac.ts`), not to fixed clock hours. In December the harbour
 * darkens before five; in June the evening stays gold until nearly nine; and
 * the blue hour always happens after the sun has gone.
 */
import { gardenSkyToday, gardenSolarElevationAt, gardenSolarHourAngle, type GardenSkyDay } from "./sky-almanac";

export type DayCycleBeatName = "dawn" | "day" | "golden" | "blue" | "night";
export type DayCycleBeats = Record<DayCycleBeatName, number>;

/**
 * Crossfade windows in degrees of solar elevation, high → low. Each is ≥ 8°
 * wide, so near the horizon (≈ 12°/h at 35°) no crossfade is shorter than
 * ~40 minutes. Evening: day → golden while the sun drops through 16–8°,
 * golden → blue centred on sunset, blue → night by nautical dusk (−12°).
 * Morning mirrors it with dawn in both slots, which leaves the rising sun
 * dawn-coloured until it has climbed clear of the haze.
 */
export const DAY_CYCLE_ELEVATION_EDGES = {
  evening: { dayGolden: [16, 8], goldenBlue: [4, -4], blueNight: [-4, -12] },
  morning: { nightDawn: [-12, -2], dawnDay: [6, 16] },
} as const;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The beats for a solar elevation (degrees), on the evening or the morning side of noon. */
export function dayCycleBeatsForElevation(elevationDeg: number, evening: boolean): DayCycleBeats {
  const beats: DayCycleBeats = { dawn: 0, day: 0, golden: 0, blue: 0, night: 0 };
  if (evening) {
    const edges = DAY_CYCLE_ELEVATION_EDGES.evening;
    if (elevationDeg >= edges.dayGolden[1]) {
      beats.golden = smoothstep(edges.dayGolden[0], edges.dayGolden[1], elevationDeg);
      beats.day = 1 - beats.golden;
    } else if (elevationDeg >= edges.goldenBlue[0]) {
      beats.golden = 1;
    } else if (elevationDeg >= edges.goldenBlue[1]) {
      beats.blue = smoothstep(edges.goldenBlue[0], edges.goldenBlue[1], elevationDeg);
      beats.golden = 1 - beats.blue;
    } else {
      beats.night = smoothstep(edges.blueNight[0], edges.blueNight[1], elevationDeg);
      beats.blue = 1 - beats.night;
    }
    return beats;
  }
  const edges = DAY_CYCLE_ELEVATION_EDGES.morning;
  if (elevationDeg < edges.nightDawn[1]) {
    beats.dawn = smoothstep(edges.nightDawn[0], edges.nightDawn[1], elevationDeg);
    beats.night = 1 - beats.dawn;
  } else if (elevationDeg < edges.dawnDay[0]) {
    beats.dawn = 1;
  } else {
    beats.day = smoothstep(edges.dawnDay[0], edges.dawnDay[1], elevationDeg);
    beats.dawn = 1 - beats.day;
  }
  return beats;
}

/**
 * The beats at a clock hour of a sky day (default: the world's day). Solar
 * noon and solar midnight sit inside the day and night plateaus, so neither
 * side switch is a seam.
 */
export function dayCycleBeats(hour: number, day: GardenSkyDay = gardenSkyToday()): DayCycleBeats {
  const elevationDeg = gardenSolarElevationAt(day, hour) * (180 / Math.PI);
  return dayCycleBeatsForElevation(elevationDeg, gardenSolarHourAngle(day, hour) >= 0);
}
