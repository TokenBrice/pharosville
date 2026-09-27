import { clamp, smoothstep } from "../motion-utils";
import type { ShipMotionRoute, ShipWaterPath } from "../motion-types";
import type { ShipWaterZone } from "../world-types";
import type { GardenWindShift } from "../garden-attention-scheduler";
import { GARDEN_DEFAULT_WIND_X, GARDEN_DEFAULT_WIND_Z } from "../weather";
import { isWaterTileKind, MAX_TILE_X, MAX_TILE_Y, tileKindAt } from "../world-layout";
import { isGardenObstacleTile } from "../garden-water-exclusion";
import { isSeawallBarrierTileXY } from "../seawall";
import { sampleShipWaterPathInto as sampleWaterPathInto } from "../motion-water";
import { clampMotionTileInto } from "./shared";

/**
 * W4.F9 — ride to the anchor (fleet-motion-1).
 *
 * An anchored hull lies bow to the settled wind a rode's length downwind of
 * its anchor and sheers gently on the rode. Everything here is a pure function
 * of the clock, the route and the anchor tile, so hit testing, following and
 * reduced motion agree with the picture frame by frame.
 *
 * - **Settled wind.** The harbour's default bearing, turned by the scheduler's
 *   wind shifts (`ShipMotionRoute.windShifts`, at most two a day). The live
 *   weather wind wanders ±80° over minutes; a hull on its rode does not chase
 *   that wander, so the anchorage holds still until the wind really shifts.
 * - **The swing.** A shift turns each berth over `ANCHOR_SWING_SECONDS`; it
 *   crosses the anchorage downwind like the gust front, so the farthest berth
 *   follows up to `ANCHOR_SWING_MAX_LAG_SECONDS` later.
 * - **Sheer, the risk carrier.** A slow yaw on the rode whose amplitude and
 *   rate rise in risk order from calm to danger (`ANCHOR_SHEER_BY_ZONE`); a
 *   calm hull turns under 0.02 of a full turn a minute.
 * - **Arriving and weighing.** Over `ANCHOR_SETTLE_SECONDS` after arrival the
 *   hull rounds up from the voyage heading and drops back on its rode; over
 *   the same span before departure it hauls up to the anchor and turns onto
 *   the next voyage's first heading, so neither seam snaps.
 */

export const ANCHOR_SWING_SECONDS = 80;
export const ANCHOR_SWING_MAX_LAG_SECONDS = 45;
export const ANCHOR_RODE_TILES = 0.42;
export const ANCHOR_SETTLE_SECONDS = 30;
/** Surge along the rode at the sheer's rhythm, at the widest (danger) sheer. */
const ANCHOR_SURGE_TILES = 0.05;

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

export interface AnchorSheer {
  readonly amplitudeRad: number;
  readonly periodSeconds: number;
}

/**
 * Sheer on the rode by risk band: amplitude and rate both rise in risk order.
 * Peak yaw rate `2π·A/T` stays under 4 °/s even in danger water.
 */
export const ANCHOR_SHEER_BY_ZONE: Readonly<Record<ShipWaterZone, AnchorSheer>> = {
  calm: { amplitudeRad: 2 * DEG, periodSeconds: 70 },
  ledger: { amplitudeRad: 2 * DEG, periodSeconds: 70 },
  watch: { amplitudeRad: 4 * DEG, periodSeconds: 55 },
  alert: { amplitudeRad: 7 * DEG, periodSeconds: 42 },
  warning: { amplitudeRad: 11 * DEG, periodSeconds: 34 },
  danger: { amplitudeRad: 15 * DEG, periodSeconds: 26 },
};

const WIND_ANGLE = Math.atan2(GARDEN_DEFAULT_WIND_Z, GARDEN_DEFAULT_WIND_X);
// Downwind projection of the map's corners bounds the swing lag.
const LAG_PROJECTIONS = [
  0,
  MAX_TILE_X * GARDEN_DEFAULT_WIND_X,
  MAX_TILE_Y * GARDEN_DEFAULT_WIND_Z,
  MAX_TILE_X * GARDEN_DEFAULT_WIND_X + MAX_TILE_Y * GARDEN_DEFAULT_WIND_Z,
];
const LAG_PROJECTION_MIN = Math.min(...LAG_PROJECTIONS);
const LAG_PROJECTION_SPAN = Math.max(...LAG_PROJECTIONS) - LAG_PROJECTION_MIN;

function smootherstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Seconds after a shift's start that the swing reaches this anchor. */
export function anchorSwingLagSeconds(anchor: { x: number; y: number }): number {
  const projection = anchor.x * GARDEN_DEFAULT_WIND_X + anchor.y * GARDEN_DEFAULT_WIND_Z;
  return ANCHOR_SWING_MAX_LAG_SECONDS * clamp((projection - LAG_PROJECTION_MIN) / LAG_PROJECTION_SPAN, 0, 1);
}

/** Settled-wind offset (radians from the default bearing) at an anchor. */
export function anchorageBearingOffsetRad(
  shifts: readonly GardenWindShift[] | undefined,
  timeSeconds: number,
  anchor: { x: number; y: number },
): number {
  if (!shifts || shifts.length === 0) return 0;
  const local = timeSeconds - anchorSwingLagSeconds(anchor);
  let offset = shifts[0]!.fromOffsetRad;
  for (let index = 0; index < shifts.length; index += 1) {
    const shift = shifts[index]!;
    if (local < shift.startSeconds) break;
    const progress = (local - shift.startSeconds) / ANCHOR_SWING_SECONDS;
    offset = progress >= 1
      ? shift.toOffsetRad
      : shift.fromOffsetRad + (shift.toOffsetRad - shift.fromOffsetRad) * smootherstep(progress);
  }
  return offset;
}

/** Heading angle (tile space) of a hull lying bow to the settled wind. */
function anchorRideAngle(route: ShipMotionRoute, timeSeconds: number, anchor: { x: number; y: number }): number {
  return WIND_ANGLE + anchorageBearingOffsetRad(route.windShifts, timeSeconds, anchor) + Math.PI;
}

function sheerPhase(route: ShipMotionRoute): number {
  return ((route.routeSeed >>> 0) % 997) / 997 * TWO_PI;
}

function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function isSafeRideTile(x: number, y: number): boolean {
  return isWaterTileKind(tileKindAt(x, y))
    && !isGardenObstacleTile(x, y)
    && !isSeawallBarrierTileXY(x, y);
}

const pathPointScratch = { x: 0, y: 0 };
const pathHeadingScratch = { x: 0, y: 0 };

function pathHeadingAngle(path: ShipWaterPath | undefined, progress: number): number | null {
  if (!path || path.totalLength <= 0) return null;
  sampleWaterPathInto(path, progress, pathPointScratch, pathHeadingScratch);
  if (pathHeadingScratch.x === 0 && pathHeadingScratch.y === 0) return null;
  return Math.atan2(pathHeadingScratch.y, pathHeadingScratch.x);
}

export interface AnchorRideInput {
  route: ShipMotionRoute;
  zone: ShipWaterZone;
  timeSeconds: number;
  anchor: { x: number; y: number };
  /** Seconds since the rest began, and its whole length. */
  elapsedSeconds: number;
  windowSeconds: number;
  /** The voyage that brought the hull here (its end heading is the entry heading). */
  entryPath?: ShipWaterPath | undefined;
  /** The voyage that takes it away (its first heading is the exit heading). */
  exitPath?: ShipWaterPath | undefined;
}

/**
 * Writes the anchored pose: `tile` (hull centre on the rode, water-safe) and
 * `heading` (unit, tile space). The hull is at rest: callers write zero
 * velocity.
 */
export function writeAnchorRideInto(
  input: AnchorRideInput,
  tile: { x: number; y: number },
  heading: { x: number; y: number },
): void {
  const { route, timeSeconds, anchor } = input;
  const rideAngle = anchorRideAngle(route, timeSeconds, anchor);
  const sheer = ANCHOR_SHEER_BY_ZONE[input.zone];
  const phase = TWO_PI * timeSeconds / sheer.periodSeconds + sheerPhase(route);
  let angle = rideAngle + sheer.amplitudeRad * Math.sin(phase);

  const elapsed = Math.max(0, input.elapsedSeconds);
  const remaining = Math.max(0, input.windowSeconds - elapsed);
  let rodeScale = 1;
  if (elapsed < ANCHOR_SETTLE_SECONDS) {
    const entryAngle = pathHeadingAngle(input.entryPath, 0.999);
    if (entryAngle !== null) {
      const settled = smootherstep(elapsed / ANCHOR_SETTLE_SECONDS);
      angle = entryAngle + shortestAngleDelta(entryAngle, angle) * settled;
      rodeScale = Math.min(rodeScale, settled);
    }
  }
  if (remaining < ANCHOR_SETTLE_SECONDS) {
    const exitAngle = pathHeadingAngle(input.exitPath, 0.001);
    if (exitAngle !== null) {
      const held = smootherstep(remaining / ANCHOR_SETTLE_SECONDS);
      angle = exitAngle + shortestAngleDelta(exitAngle, angle) * held;
      rodeScale = Math.min(rodeScale, held);
    }
  }

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  heading.x = cos;
  heading.y = sin;
  // The hull trails its bow: centre sits a rode's length back along the
  // heading, surging a little at the sheer's rhythm (a quarter-phase lead).
  const surge = ANCHOR_SURGE_TILES * (sheer.amplitudeRad / ANCHOR_SHEER_BY_ZONE.danger.amplitudeRad) * Math.cos(phase);
  const reach = (ANCHOR_RODE_TILES + surge) * smoothstep(rodeScale);
  let safeScale = 1;
  if (!isSafeRideTile(anchor.x - cos * reach, anchor.y - sin * reach)) safeScale = 0.5;
  if (!isSafeRideTile(anchor.x - cos * reach * safeScale, anchor.y - sin * reach * safeScale)) safeScale = 0;
  clampMotionTileInto(anchor.x - cos * reach * safeScale, anchor.y - sin * reach * safeScale, tile);
}
