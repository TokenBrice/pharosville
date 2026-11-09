/**
 * E16/E17 (O6-I2/I3): the meadow's year and the slope it dries on. One source for the kit shader's grass branch
 * (shaders/season.ts) and its CPU twins below. Decorative and calendar-only, like the time of day: no reading, weather
 * band or data source changes the grass.
 *
 * E17, a Mediterranean ground year (ruling V12): the turf is green from the first rains in late October through the
 * winter and the spring, and straw-gold from June to October, paler on the dry ridges, with the hollows keeping their
 * olive green. Trees, the farm year's fields and the snow keep their own cycles.
 *
 * E16, continuous dryness: the slope comes from the four height-field taps the shader already reads for convexity
 * (central differences, SLOPE_TAP_M either side), so it no longer flips from one terrain triangle to the next (the
 * facet normal painted a mosaic of straw and green on every hillside). No new taps, no derivatives.
 */

/** The dry season on uSeasonPhase (0 = 1 January, northern-equivalent): it ramps in round 1 June; the first rains of
 *  late October green the turf over the following month. */
export const DRY_SEASON = { start: [0.395, 0.435], end: [0.8, 0.9] } as const;
/** Straw gold (linear albedo) at the height of the dry season. */
export const STRAW = [0.36, 0.29, 0.11] as const;
/** Spring turf multiplier: fresh, less acid than the old temperate (1.12, 1.2, 0.42). */
export const SPRING_TURF = [1.05, 1.12, 0.62] as const;
/** Half the baseline of the slope's central differences (m): the convexity taps' offset. */
export const SLOPE_TAP_M = 7;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How far into the dry season the meadow is on a calendar phase: 1 from June to October, 0 from November to May. */
export function drySeasonAt(phase: number): number {
  return smoothstep(DRY_SEASON.start[0], DRY_SEASON.start[1], phase) * (1 - smoothstep(DRY_SEASON.end[0], DRY_SEASON.end[1], phase));
}

/**
 * The slope the grass reads from four height samples SLOPE_TAP_M east, west, south and north of it (glTF +z = south):
 * its steepness (1 - n.y) and how much of it faces south (0..1). Flat, (0, 0), on level ground.
 */
export function grassSlopeOf(hE: number, hW: number, hS: number, hN: number): { steep: number; south: number } {
  const nx = (hW - hE) / (2 * SLOPE_TAP_M), nz = (hN - hS) / (2 * SLOPE_TAP_M);
  const len = Math.hypot(nx, 1, nz);
  const xz = Math.hypot(nx, nz) / len;
  return { steep: 1 - 1 / len, south: Math.min(1, Math.max(0, nz / len / Math.max(xz, 1e-3))) };
}

const f = (x: number): string => x.toFixed(4);
const v3 = (c: readonly number[]): string => `vec3(${c.map(f).join(", ")})`;

/** GLSL twin of drySeasonAt (needs uSeasonPhase). */
export const DRY_SEASON_GLSL = /* glsl */ `
float hbDrySeason() {
  return smoothstep(${f(DRY_SEASON.start[0])}, ${f(DRY_SEASON.start[1])}, uSeasonPhase) * (1.0 - smoothstep(${f(DRY_SEASON.end[0])}, ${f(DRY_SEASON.end[1])}, uSeasonPhase));
}
`;
export const STRAW_GLSL = v3(STRAW);
export const SPRING_TURF_GLSL = v3(SPRING_TURF);
