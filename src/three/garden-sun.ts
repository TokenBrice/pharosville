import { MathUtils, Vector3 } from "three";
import { type DayCyclePhase } from "./garden-day-cycle";

/**
 * Where the light actually is, as one shared answer.
 *
 * Before this module the scene held three DIFFERENT opinions about the sun and
 * none of them moved:
 *
 * - the key light sat at a fixed `(-35, 48, -30)` from the island, so shadows
 *   pointed the same way at dawn, noon and dusk;
 * - the sky dome interpolated a fixed AZIMUTH against three authored elevation
 *   constants, so its glow slid up and down one meridian;
 * - the water's specular used `normalize(vec3(-0.46, 0.2, 0.86))`, a hand-tuned
 *   constant matching neither of the other two.
 *
 * That is the real reason dawn and dusk read as "a tinted noon": every cue that
 * tells you what time it is — shadow direction and length, which face of the
 * monument is lit, where the glitter lies on the water — was frozen, and only
 * COLOUR moved. Colour alone is the weakest of those cues and the easiest to
 * read as a filter laid over the picture rather than as light in it.
 *
 * So: one arc, three consumers, and the arc is the contract.
 */

/**
 * The bearing the calibrated noon key light sits on, preserved exactly.
 *
 * The whole day grade, the AO exponent ladder and the reference gate frames
 * were tuned against this direction, so the arc is built to PASS THROUGH it at
 * midday rather than to replace it. Noon must not move.
 */
const NOON_BEARING = Math.atan2(-30, -35);
/** `atan(48 / hypot(35, 30))` — the same 46.1° the fixed rig used. */
const NOON_ELEVATION = Math.atan2(48, Math.hypot(35, 30));

/**
 * Half the azimuth swept between sunrise and sunset, in radians (~57°).
 *
 * Not the ~180° a physical sun sweeps: under a LOCKED isometric camera a full
 * swing puts the sun behind the viewer for part of the day, which flattens the
 * island into silhouette and then into frontal light — two framings the
 * composition was never designed for. A ±57° arc keeps the monument modelled
 * from a consistent quarter while still moving shadows far enough that the hour
 * is legible at a glance.
 */
const ARC_SWEEP = 1.0;

/** Sunrise and sunset, matched to the `dayCyclePhase` glow windows. */
const SUNRISE_HOUR = 5;
const SUNSET_HOUR = 19.5;

/**
 * The key light never rakes below ~3.4°.
 *
 * 2026-09-05 (warm-village B4): lowered from 0.12 (~7°). The old floor was
 * set when dusk was a tinted noon; the ember hour now needs the sun LOW so
 * its light rakes across the fleet and the monument. At 0.06 rad the tower's
 * cast shadow does run off the plate — at dusk that is the point — but the
 * direction stays above the horizon and the shadow frustum still catches the
 * shadow's start, so the form the light describes survives. The sky's own sun
 * (`gardenSunPose`) is unclamped and still sets, which is what fades the
 * scattering dome out on schedule.
 */
const MIN_KEY_ELEVATION = 0.06;

/**
 * Where the moon sits after dark.
 *
 * This constant lives here, not in `garden-sky`, because the moon is light
 * GEOMETRY and this module is the one answer about where light comes from. The
 * sky dome, the water's moon road and the night key light all read it from
 * here, so they cannot drift apart the way the three sun opinions did.
 */
export const GARDEN_MOON_AZIMUTH = Math.PI * 0.62;
const MOON_ELEVATION = Math.PI * 0.29;

export interface GardenLightPose {
  /** Unit vector from the world TOWARD the light. */
  direction: Vector3;
  /** Elevation above the horizon, radians. Negative when below it. */
  elevation: number;
}

function poseFrom(azimuth: number, elevation: number, target: GardenLightPose): GardenLightPose {
  const cosEl = Math.cos(elevation);
  target.direction.set(Math.cos(azimuth) * cosEl, Math.sin(elevation), Math.sin(azimuth) * cosEl);
  target.elevation = elevation;
  return target;
}

/**
 * The sun alone, which may be below the horizon.
 *
 * The sky dome needs this rather than the blended key light: its scattering
 * term has to fade out because the SUN has set, not because the moon happens to
 * be brighter, and a below-horizon elevation is what turns it off.
 */
export function gardenSunPose(hour: number, target = emptyPose()): GardenLightPose {
  const { azimuth, elevation } = sunAngles(hour);
  return poseFrom(azimuth, elevation, target);
}

function sunAngles(hour: number): { azimuth: number; elevation: number } {
  const span = SUNSET_HOUR - SUNRISE_HOUR;
  const progress = (hour - SUNRISE_HOUR) / span;
  // Clamped only for the AZIMUTH: past the horizon the bearing stops mattering
  // and letting it run would swing the below-horizon glow to absurd headings.
  const azimuthProgress = MathUtils.clamp(progress, -0.15, 1.15);
  return {
    azimuth: NOON_BEARING + (azimuthProgress - 0.5) * 2 * ARC_SWEEP,
    // Unclamped, so the arc continues below the horizon after dark on its own
    // rather than needing a separate authored night constant.
    elevation: NOON_ELEVATION * Math.sin(Math.PI * progress),
  };
}

/** Shortest signed way round from `from` to `to`, in radians. */
function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** The moon's fixed pose, the night half of the key light. */
export function gardenMoonPose(target = emptyPose()): GardenLightPose {
  return poseFrom(GARDEN_MOON_AZIMUTH, MOON_ELEVATION, target);
}

/**
 * What actually lights the scene: the sun by day, the moon after dark, crossed
 * over on the day cycle's own night weight so there is never a moment with two
 * key lights or none.
 */
export function gardenKeyLightPose(
  hour: number,
  phase: DayCyclePhase,
  target = emptyPose(),
): GardenLightPose {
  const sun = sunAngles(hour);
  const night = MathUtils.clamp(phase.night, 0, 1);
  // Blend the ANGLES, not the vectors.
  //
  // Lerping two unit directions and re-normalising looks equivalent and is not:
  // by late evening the sun is well below the horizon while the moon is high,
  // so the two vectors are nearly opposed and the lerp passes close to the
  // origin. Normalising there amplifies a hair of numerical difference into a
  // wild swing, which on screen is the key light snapping across the sky in a
  // single frame during the dusk crossover. Interpolating azimuth (by the
  // shortest way round) and elevation independently has no such singularity.
  const azimuth = sun.azimuth + angleDelta(sun.azimuth, GARDEN_MOON_AZIMUTH) * night;
  const elevation = sun.elevation + (MOON_ELEVATION - sun.elevation) * night;
  // Floor it so shadows stay describable at the ends of the day; see
  // MIN_KEY_ELEVATION.
  return poseFrom(azimuth, Math.max(elevation, MIN_KEY_ELEVATION), target);
}

function emptyPose(): GardenLightPose {
  return { direction: new Vector3(0, 1, 0), elevation: Math.PI / 2 };
}

export const GARDEN_SUN_NOON_BEARING = NOON_BEARING;
export const GARDEN_SUN_NOON_ELEVATION = NOON_ELEVATION;
export const GARDEN_KEY_MIN_ELEVATION = MIN_KEY_ELEVATION;
