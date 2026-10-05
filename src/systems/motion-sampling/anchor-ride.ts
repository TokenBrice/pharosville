import { clamp, smoothstep } from "../motion-utils";
import type { ShipMotionRoute } from "../motion-types";
import type { ShipWaterZone } from "../world-types";
import type { GardenWindShift } from "../garden-attention-scheduler";
import { GARDEN_DEFAULT_WIND_X, GARDEN_DEFAULT_WIND_Z } from "../weather";
import { isWaterTileKind, MAX_TILE_X, MAX_TILE_Y, tileKindAt } from "../world-layout";
import { isGardenObstacleTile } from "../garden-water-exclusion";
import { isSeawallBarrierTileXY } from "../seawall";
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

/**
 * Settled-wind offset (radians from the default bearing) at an anchor.
 *
 * Each shift eases from the bearing the hull is ACTUALLY lying to, not from
 * the shift's authored `fromOffsetRad`: when those disagree (the previous
 * shift ended elsewhere, or several shifts overlap) starting from the authored
 * value stepped the whole fleet's bearing the frame a shift opened, swinging
 * every anchored hull by most of its rode in one sample.
 */
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
      : offset + shortestAngleDelta(offset, shift.toOffsetRad) * smootherstep(progress);
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

export interface AnchorRideInput {
  route: ShipMotionRoute;
  zone: ShipWaterZone;
  timeSeconds: number;
  anchor: { x: number; y: number };
  /** Seconds since the rest began, and its whole length. */
  elapsedSeconds: number;
  windowSeconds: number;
}

/** The heading a hull lies to at `anchor`: settled wind plus its band's sheer.
 * Voyages blend onto and off this at their own ends, so the anchored pose
 * never depends on which rest window a sample falls in. */
export function anchorLyingAngleRad(route: ShipMotionRoute, zone: ShipWaterZone, timeSeconds: number, anchor: { x: number; y: number }): number {
  const sheer = ANCHOR_SHEER_BY_ZONE[zone];
  return anchorRideAngle(route, timeSeconds, anchor)
    + sheer.amplitudeRad * Math.sin(TWO_PI * timeSeconds / sheer.periodSeconds + sheerPhase(route));
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
  const sheer = ANCHOR_SHEER_BY_ZONE[input.zone];
  const phase = TWO_PI * timeSeconds / sheer.periodSeconds + sheerPhase(route);
  const angle = anchorLyingAngleRad(route, input.zone, timeSeconds, anchor);

  const elapsed = Math.max(0, input.elapsedSeconds);
  const remaining = Math.max(0, input.windowSeconds - elapsed);
  // The ride angle is the settled wind plus the sheer, and nothing else. It
  // used to be pinned to the entry voyage's last heading and the exit voyage's
  // first, so the pose depended on WHICH rest window a sample fell in: at a
  // window boundary the reference swapped and the hull flipped in one frame.
  // The voyages now meet this wind-lying heading from their own side.
  const rodeScale = Math.min(
    smootherstep(elapsed / ANCHOR_SETTLE_SECONDS),
    smootherstep(remaining / ANCHOR_SETTLE_SECONDS),
  );

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  heading.x = cos;
  heading.y = sin;
  // The hull trails its bow: centre sits a rode's length back along the
  // heading, surging a little at the sheer's rhythm (a quarter-phase lead).
  const surge = ANCHOR_SURGE_TILES * (sheer.amplitudeRad / ANCHOR_SHEER_BY_ZONE.danger.amplitudeRad) * Math.cos(phase);
  const reach = (ANCHOR_RODE_TILES + surge) * smoothstep(rodeScale);
  // The rode is limited by the water around the ANCHOR, measured as a DISTANCE
  // rather than a pass/fail test: a quantised direction-by-direction check is a
  // step function of the anchor, and the anchor itself interpolates during a
  // risk tack-out, so the hull snapped by its whole rode when that step fell.
  const rode = Math.min(reach, safeRodeReach(anchor));
  clampMotionTileInto(anchor.x - cos * rode, anchor.y - sin * rode, tile);
}

const RODE_DIRECTIONS = 8;
const RODE_MARCH_STEPS = 4;
const RODE_REFINEMENTS = 5;
/** Keep the hull's own bulk off the shore the clearance measurement found. */
const RODE_SHORE_ALLOWANCE = 0.08;

/**
 * Distance from `anchor` to the nearest unsafe water, marched along a ring of
 * directions and refined between samples, so it varies continuously with the
 * anchor instead of jumping when one direction flips. No memo: the value is a
 * function of a position that moves while a hull eases onto a new anchorage.
 */
function safeRodeReach(anchor: { x: number; y: number }): number {
  const full = ANCHOR_RODE_TILES + ANCHOR_SURGE_TILES + RODE_SHORE_ALLOWANCE;
  let clearance = full;
  for (let direction = 0; direction < RODE_DIRECTIONS; direction += 1) {
    const angle = TWO_PI * direction / RODE_DIRECTIONS;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let safe = 0;
    let blocked = -1;
    for (let step = 1; step <= RODE_MARCH_STEPS; step += 1) {
      const distance = full * step / RODE_MARCH_STEPS;
      if (distance > clearance) break;
      if (isSafeRideTile(anchor.x + dx * distance, anchor.y + dy * distance)) { safe = distance; continue; }
      blocked = distance;
      break;
    }
    if (blocked < 0) continue;
    for (let refinement = 0; refinement < RODE_REFINEMENTS; refinement += 1) {
      const middle = (safe + blocked) / 2;
      if (isSafeRideTile(anchor.x + dx * middle, anchor.y + dy * middle)) safe = middle;
      else blocked = middle;
    }
    clearance = Math.min(clearance, safe);
  }
  return Math.max(0, clearance - RODE_SHORE_ALLOWANCE);
}
