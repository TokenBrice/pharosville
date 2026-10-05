import type { ShipMotionSample } from "../motion-types";
import { createShipMotionSample, resetSampleChoreography, type ResolveShipMotionSampleInput } from "./shared";
import { reducedMotionSampleInto } from "./reduced-motion";
import { consortShadowSampleInto } from "./consort";
import { sampleRouteCycleInto } from "./route-cycle";
import { clamp, smoothstepRange } from "../motion-utils";
import { TILE_SCALE } from "../projection";
import { shipRestSailBraceRad } from "../ship-visuals";
import { GARDEN_DEFAULT_WIND_X, GARDEN_DEFAULT_WIND_Z, gardenGustAtWorldPosition, type WeatherPlan } from "../weather";
import { isWaterTileKind, tileKindAt } from "../world-layout";

const DEG = Math.PI / 180;
/** F-A: yard brace limit either side of square. */
const SAIL_TRIM_MAX_RAD = 0.7;
/** Luff fully below this wind angle off the bow, not at all above the next. */
const LUFF_FULL_ANGLE_RAD = 35 * DEG;
const LUFF_CLEAR_ANGLE_RAD = 55 * DEG;
/** A sail lying at rest hangs slack: set, not drawing, not shivering. */
const REST_LUFF = 0.3;
/**
 * Wind heel: a steady degree on a reach and at most 3.5° more when a gust
 * front crosses. Kept small on purpose (restraint council, W4.F10): the wind
 * is coupled to PSI, so the boats must not become a second stress gauge.
 */
const HEEL_STEADY_RAD = 1 * DEG;
const HEEL_GUST_RAD = 2.5 * DEG;
/** Leeway: the bow points this much to windward of the track on a reach. */
const LEEWAY_RAD = 3 * DEG;
/** True-wind speed in tiles/s for apparent-wind maths, over `wind.speed` 0..1. */
const TRUE_WIND_BASE_TILES_PER_SECOND = 1.2;
const TRUE_WIND_RANGE_TILES_PER_SECOND = 1.6;

const restBraceByShipId = new Map<string, number>();
const gustWeatherScratch: Pick<WeatherPlan, "wind"> = { wind: { x: 0, y: 0, speed: 0, gust: 0 } };

export function resolveShipMotionSample(input: ResolveShipMotionSampleInput): ShipMotionSample {
  const out = createShipMotionSample();
  resolveShipMotionSampleInto(input, out);
  return out;
}

export function resolveShipMotionSampleInto(input: ResolveShipMotionSampleInput, out: ShipMotionSample): void {
  const route = input.plan.shipRoutes.get(input.ship.id);
  resetSampleChoreography(out);
  if (input.reducedMotion || !route) {
    reducedMotionSampleInto(input.ship, route, input.seaState ?? null, out);
    // A hull away from a quay keeps the accepted resting heading of its own
    // berth. Only a ship without one falls back to lying to the default wind,
    // which used to be applied to the whole still fleet at once.
    if (!out.currentDockId && route?.restingHeadingRad === undefined) {
      out.heading.x = -GARDEN_DEFAULT_WIND_X;
      out.heading.y = -GARDEN_DEFAULT_WIND_Z;
    }
    return;
  }

  const shadowed = input.ship.squadRole === "consort" && input.ship.squadId
    ? consortShadowSampleInto(input, route, out)
    : false;
  if (!shadowed) sampleRouteCycleInto(route, input.timeSeconds, input.seaState ?? null, out);
  const windX = input.wind?.x ?? GARDEN_DEFAULT_WIND_X;
  const windY = input.wind?.y ?? GARDEN_DEFAULT_WIND_Z;
  if (out.state === "idle" && !out.currentDockId) {
    out.heading.x = -windX;
    out.heading.y = -windY;
  } else if (!shadowed && input.wind && (out.speedTilesPerSecond ?? 0) > 0) {
    // Cross-current fades at transit endpoints, preserving the mooring seam.
    const strength = Math.min(1, (out.speedTilesPerSecond ?? 0) / 0.08) * input.wind.speed * 0.012;
    const cross = windX * -out.heading.y + windY * out.heading.x;
    const x = out.tile.x - out.heading.y * cross * strength;
    const y = out.tile.y + out.heading.x * cross * strength;
    if (isWaterTileKind(tileKindAt(Math.round(x), Math.round(y)))) {
      out.tile.x = x;
      out.tile.y = y;
    }
  }
  writeSailingInto(input, out, windX, windY);
}

/**
 * W4.F12 sailing, not sliding (contract F-A). From the apparent wind over the
 * bow: the yard brace (`sailTrimRad`), how much the sail spills (`luff`), a
 * small heel to leeward that grows as a gust front crosses (`heelRad`), and a
 * little leeway — the bow set a few degrees to windward of the track, which
 * itself is unchanged. Every term scales by `sailSet`, so a hull at rest lies
 * level with its sail slack on the rest brace, and the seams are eased.
 */
function writeSailingInto(input: ResolveShipMotionSampleInput, out: ShipMotionSample, windX: number, windY: number): void {
  const sailSet = clamp(out.sailSet ?? 0, 0, 1);
  let restBrace = restBraceByShipId.get(input.ship.id);
  if (restBrace === undefined) {
    restBrace = shipRestSailBraceRad(input.ship.id);
    restBraceByShipId.set(input.ship.id, restBrace);
  }
  if (sailSet <= 0) {
    out.sailTrimRad = restBrace;
    out.luff = REST_LUFF;
    out.heelRad = 0;
    return;
  }
  const windSpeed = clamp(input.wind?.speed ?? 0.4, 0, 1);
  const trueWind = TRUE_WIND_BASE_TILES_PER_SECOND + TRUE_WIND_RANGE_TILES_PER_SECOND * windSpeed;
  // Apparent wind, pointing where the air goes, in tile space.
  const apparentX = windX * trueWind - (out.velocity?.x ?? 0);
  const apparentY = windY * trueWind - (out.velocity?.y ?? 0);
  const apparentLength = Math.hypot(apparentX, apparentY);
  const headingX = out.heading.x;
  const headingY = out.heading.y;
  if (apparentLength <= 1e-6 || (headingX === 0 && headingY === 0)) {
    out.sailTrimRad = restBrace;
    out.luff = REST_LUFF;
    out.heelRad = 0;
    return;
  }
  // Where the wind comes FROM, against the bow and the starboard beam
  // (starboard is the heading turned +90° in tile space).
  const fromBow = -(apparentX * headingX + apparentY * headingY) / apparentLength;
  const fromStarboard = -(apparentX * -headingY + apparentY * headingX) / apparentLength;
  const offBow = Math.acos(clamp(fromBow, -1, 1));
  const side = fromStarboard >= 0 ? 1 : -1;
  const windTrim = side * Math.min(SAIL_TRIM_MAX_RAD, (Math.PI - offBow) / 2);
  const windLuff = 1 - smoothstepRange(LUFF_FULL_ANGLE_RAD, LUFF_CLEAR_ANGLE_RAD, offBow);
  const beam = Math.abs(fromStarboard);

  gustWeatherScratch.wind.x = windX;
  gustWeatherScratch.wind.y = windY;
  gustWeatherScratch.wind.speed = windSpeed;
  const gust = input.wind
    ? gardenGustAtWorldPosition(input.timeSeconds, out.tile.x * TILE_SCALE, out.tile.y * TILE_SCALE, gustWeatherScratch)
    : 0;
  out.sailTrimRad = restBrace + (windTrim - restBrace) * sailSet;
  out.luff = REST_LUFF + (windLuff - REST_LUFF) * sailSet;
  // Heel to leeward: wind from starboard lays her over to port (+).
  out.heelRad = side * beam * (HEEL_STEADY_RAD + HEEL_GUST_RAD * gust) * (1 - windLuff) * sailSet;
  // Leeway: turn the bow to windward (toward the wind's side) of the track.
  const leeway = side * LEEWAY_RAD * beam * (1 - windLuff) * sailSet;
  const cos = Math.cos(leeway);
  const sin = Math.sin(leeway);
  out.heading.x = headingX * cos - headingY * sin;
  out.heading.y = headingX * sin + headingY * cos;
}
