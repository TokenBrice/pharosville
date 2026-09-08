/**
 * The five-beat light score (G2/W2.1): a partition of unity over the wall
 * clock. Pure and three-free so the DOM chrome can follow the same score as
 * the renderer without pulling the Three runtime into the main chunk.
 */
export type DayCycleBeatName = "dawn" | "day" | "golden" | "blue" | "night";
export type DayCycleBeats = Record<DayCycleBeatName, number>;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Adjacent smooth crossfades, with a held golden peak until the blue-hour
 * handoff at 18:15. Midnight is inside the night plateau, not a seam.
 */
export function dayCycleBeats(hourInput: number): DayCycleBeats {
  const hour = ((hourInput % 24) + 24) % 24;
  const beats: DayCycleBeats = { dawn: 0, day: 0, golden: 0, blue: 0, night: 0 };
  if (hour < 4.75 || hour >= 20) {
    beats.night = 1;
  } else if (hour < 6) {
    beats.dawn = smoothstep(4.75, 6, hour);
    beats.night = 1 - beats.dawn;
  } else if (hour < 7.25) {
    beats.day = smoothstep(6, 7.25, hour);
    beats.dawn = 1 - beats.day;
  } else if (hour < 16.25) {
    beats.day = 1;
  } else if (hour < 17.25) {
    beats.golden = smoothstep(16.25, 17.25, hour);
    beats.day = 1 - beats.golden;
  } else if (hour < 18.25) {
    beats.golden = 1;
  } else if (hour < 19) {
    beats.blue = smoothstep(18.25, 19, hour);
    beats.golden = 1 - beats.blue;
  } else {
    beats.night = smoothstep(19, 20, hour);
    beats.blue = 1 - beats.night;
  }
  return beats;
}
