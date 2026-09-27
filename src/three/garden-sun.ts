import { MathUtils, Vector3 } from "three";
import { REST_SEAT_YAW_RAD } from "../systems/rest-seat";
import { DAY_CYCLE_ELEVATION_EDGES } from "../systems/day-cycle-beats";
import {
  gardenMoonStateAt,
  gardenSkyToday,
  gardenSkyViewAspect,
  gardenSolarElevationAt,
  gardenSolarHourAngle,
  type GardenMoonState,
  type GardenSkyDay,
} from "../systems/sky-almanac";
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
 * The noon key comes from the rest seat's right hand.
 *
 * W1.8 (light-1): the old calibrated bearing, `atan2(-30, -35)`, sat 176° from
 * the eye — behind the Pharos — so from dawn to dusk the visible faces got
 * only fill, left and right faces read equal, and every cast shadow fell
 * toward the camera behind its caster. The bearing is now the seat's right
 * vector `(cos yaw, 0, -sin yaw)`, i.e. azimuth `-yaw` (−31° at the 31° rest
 * yaw), so at noon the key is pure side light: from the landscape seat the
 * tower's +X face takes the key at 46° (N·L 0.70), the broad +Z face sits in
 * shade at 115° (N·L −0.42) and the drum's seaward face grazes at 79°.
 * With the ±57° arc this gives dawn ~33° right of forward (soft contre-jour,
 * just outside the frame edge), 17:36 at 132° (behind the viewer's right
 * shoulder) and sunset at 147°. If the rest yaw moves, the light moves with
 * it; the tests pin that relation, not a number.
 */
const NOON_BEARING = -REST_SEAT_YAW_RAD;
/** Lower apex keeps noon shadows legible without changing their bearing. */
const NOON_ELEVATION = 0.62;

/**
 * Half the azimuth swept between sunrise and sunset, in radians (~57°).
 *
 * Not the ~180° a physical sun sweeps: a full swing would put the sun dead
 * ahead at dawn (the monument a flat silhouette) and dead behind at dusk (flat
 * frontal light). ±57° around the right-hand noon keeps the monument modelled
 * from the right-hand quarter all day — front-right at dawn, side at noon,
 * back-right at golden — while moving shadows far enough that the hour is
 * legible at a glance.
 */
const ARC_SWEEP = 1.0;

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
 * Where the night key comes from while the moon is down: a high, soft bearing
 * over the seat's right shoulder, standing for the sky itself. Light-3 drops
 * the key to sky fill on moonless nights through `moonLight`; this only keeps
 * the direction describable while it does.
 */
const SKY_FILL_AZIMUTH = NOON_BEARING;
const SKY_FILL_ELEVATION = 0.9;

export interface GardenLightPose {
  /** Unit vector from the world TOWARD the light. */
  direction: Vector3;
  /** Elevation above the horizon, radians. Negative when below it. */
  elevation: number;
  /**
   * The moon's own light, 0…1: rise/set presence × illuminated fraction (1 =
   * a full moon clear of the horizon, 0 = down or new). Not gated by night —
   * consumers multiply by their night weight. Written by `gardenMoonPose` and
   * `gardenKeyLightPose`; `gardenSunPose` leaves it untouched, and a caller's
   * own scratch pose may omit it.
   */
  moonLight?: number;
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
export function gardenSunPose(hour: number, target = emptyPose(), day = gardenSkyToday()): GardenLightPose {
  const { azimuth, elevation } = sunAngles(hour, day);
  return poseFrom(azimuth, elevation, target);
}

/**
 * W2.14 (sky-7): the sun follows the date. Its elevation is the true solar
 * elevation from the almanac, scaled so the day's apex is NOON_ELEVATION: the
 * sun rises, sets and crosses every beat edge at the real minute, while noon
 * shadows keep the length the garden was modelled for in every season. The
 * azimuth keeps the compressed ±57° arc, spread over the real sunrise→sunset.
 */
function sunAngles(hour: number, day: GardenSkyDay): { azimuth: number; elevation: number } {
  const noonDelta = gardenSolarHourAngle(day, hour);
  const progress = 0.5 + noonDelta / (day.sunsetHour - day.sunriseHour);
  // Clamped only for the AZIMUTH: past the horizon the bearing stops mattering
  // and letting it run would swing the below-horizon glow to absurd headings.
  const azimuthProgress = MathUtils.clamp(progress, -0.15, 1.15);
  return {
    azimuth: NOON_BEARING + (azimuthProgress - 0.5) * 2 * ARC_SWEEP,
    elevation: gardenSolarElevationAt(day, hour) * (NOON_ELEVATION / day.apexElevationRad),
  };
}

/** Shortest signed way round from `from` to `to`, in radians. */
function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

const scratchMoon: GardenMoonState = {
  up: false,
  azimuthRad: 0,
  elevationRad: 0,
  illumination: 0,
  waxing: true,
  presence: 0,
  ageDays: 0,
};

/**
 * The real moon (W2.6, K3), as displayed: phase and rise/set from the date,
 * the arc compressed into the rest view's sky window for the live aspect. The
 * dome draws its disc here, the water lays its road under it and the night key
 * and the tower rim come from it, so all of them agree by construction.
 */
export function gardenMoonPose(hour: number, target = emptyPose(), day = gardenSkyToday()): GardenLightPose {
  const moon = gardenMoonStateAt(day, hour, gardenSkyViewAspect(), scratchMoon);
  poseFrom(moon.azimuthRad, moon.elevationRad, target);
  target.moonLight = moon.presence * moon.illumination;
  return target;
}

/**
 * What actually lights the scene: the sun by day, the moon after dark.
 *
 * The evening handoff begins at the golden→blue edge rather than waiting for
 * the night beat. Sun and moon can be far apart by then, so fitting that
 * angular distance into the night crossfade alone makes even angle
 * interpolation race visibly. Dawn follows the cycle's night weight.
 *
 * While the moon is down the night key eases (by the moon's presence) toward a
 * high sky-fill bearing, so moonrise never snaps the shadows round.
 */
export function gardenKeyLightPose(
  hour: number,
  phase: DayCyclePhase,
  target = emptyPose(),
  day = gardenSkyToday(),
): GardenLightPose {
  const sun = sunAngles(hour, day);
  const [crossStart] = DAY_CYCLE_ELEVATION_EDGES.evening.goldenBlue;
  const [, crossEnd] = DAY_CYCLE_ELEVATION_EDGES.evening.blueNight;
  const elevationDeg = MathUtils.radToDeg(gardenSolarElevationAt(day, hour));
  const eveningCrossover = gardenSolarHourAngle(day, hour) >= 0
    ? 1 - MathUtils.smoothstep(elevationDeg, crossEnd, crossStart)
    : 0;
  const night = Math.max(MathUtils.clamp(phase.night, 0, 1), eveningCrossover);
  const moon = gardenMoonStateAt(day, hour, gardenSkyViewAspect(), scratchMoon);
  const moonAzimuth = SKY_FILL_AZIMUTH + angleDelta(SKY_FILL_AZIMUTH, moon.azimuthRad) * moon.presence;
  const moonElevation = SKY_FILL_ELEVATION + (moon.elevationRad - SKY_FILL_ELEVATION) * moon.presence;
  // Blend the ANGLES, not the vectors.
  //
  // Lerping two unit directions and re-normalising looks equivalent and is not:
  // by late evening the sun is well below the horizon while the moon is up,
  // so the two vectors can be nearly opposed and the lerp passes close to the
  // origin. Normalising there amplifies a hair of numerical difference into a
  // wild swing, which on screen is the key light snapping across the sky in a
  // single frame during the dusk crossover. Interpolating azimuth (by the
  // shortest way round) and elevation independently has no such singularity.
  const azimuth = sun.azimuth + angleDelta(sun.azimuth, moonAzimuth) * night;
  const elevation = sun.elevation + (moonElevation - sun.elevation) * night;
  target.moonLight = moon.presence * moon.illumination;
  // Floor it so shadows stay describable at the ends of the day; see
  // MIN_KEY_ELEVATION.
  return poseFrom(azimuth, Math.max(elevation, MIN_KEY_ELEVATION), target);
}

function emptyPose(): GardenLightPose {
  return { direction: new Vector3(0, 1, 0), elevation: Math.PI / 2, moonLight: 0 };
}

export const GARDEN_SUN_NOON_ELEVATION = NOON_ELEVATION;
export const GARDEN_KEY_MIN_ELEVATION = MIN_KEY_ELEVATION;
