/**
 * Refresh-transition timing and clock-pure ship journey geometry (W4.2).
 *
 * Extracted from `world-renderer.ts` (Hour-Print W0.24) so the renderer's
 * wave scheduling and the per-frame fleet pass (`renderer-ship-frame.ts`) share
 * one source for journey maths without importing each other:
 *
 * - the wave cadence / snap constants and `gardenTransitionWaveReady`;
 * - `gardenMistBoundaryTile`, the hull-safe rim-opening endpoint a journey
 *   enters or leaves through;
 * - `sampleGardenShipTransition`, the pure `(spec, timeSeconds) -> pose`
 *   sampler the ship frame reads every frame. It keeps module scratch for its
 *   intermediate points, so a caller that passes its own `out` allocates
 *   nothing.
 *
 * Nothing here touches Three.js objects or renderer state.
 */
import { MathUtils } from "three";
import { RIM_OPENINGS } from "../systems/garden-rim";
import {
  isGardenShipWater,
  nearestGardenShipWater,
} from "../systems/garden-water-exclusion";
import {
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
} from "../systems/world-layout";

/** W4.2: visible refresh waves cannot begin more often than this. */
export const GARDEN_TRANSITION_WAVE_SECONDS = 20;
/** Refresh truth snaps while a newly-mounted world is still forming. */
export const GARDEN_YOUNG_WORLD_SNAP_SECONDS = 30;
/** At or above this fleet share, migration snaps instead of choreographing. */
export const GARDEN_MASS_TRANSITION_SNAP_RATIO = 0.2;
/** Ships take between one and two garden minutes to weigh anchor and settle. */
export const GARDEN_SHIP_TRANSITION_MIN_SECONDS = 60;
export const GARDEN_SHIP_TRANSITION_MAX_SECONDS = 120;
/**
 * A longer route risks cutting across the island. Those moves use two mist
 * legs with a fully-hidden hand-off at the map edge instead of a chord.
 */
export const GARDEN_SHIP_CROSS_MAP_TILES = 46;
/** Cargo/tide and dock accent render targets settle on this time constant. */
export const GARDEN_SCALAR_TRANSITION_SECONDS = 45;

export function gardenTransitionWaveReady(
  lastStartSeconds: number,
  timeSeconds: number,
): boolean {
  return !Number.isFinite(lastStartSeconds)
    || timeSeconds - lastStartSeconds >= GARDEN_TRANSITION_WAVE_SECONDS;
}

export type GardenShipTransitionKind = "arrival" | "departure" | "reanchor" | "mist";
export interface GardenTransitionTile { x: number; y: number }
export interface GardenShipTransitionSpec {
  bend: number;
  durationSeconds: number;
  from: GardenTransitionTile;
  kind: GardenShipTransitionKind;
  marginTiles: number;
  shipId: string;
  startSeconds: number;
  to: GardenTransitionTile;
}
export interface GardenShipTransitionSample {
  complete: boolean;
  headingX: number;
  headingY: number;
  progress: number;
  visibility: number;
  x: number;
  y: number;
}

const MIST_CENTER_TILE_X = (PHAROSVILLE_MAP_WIDTH - 1) / 2;
const MIST_CENTER_TILE_Y = (PHAROSVILLE_MAP_HEIGHT - 1) / 2;

function normaliseTransitionBearing(bearing: number): number {
  return Math.atan2(Math.sin(bearing), Math.cos(bearing));
}

/**
 * Ships enter through one of the two authored rim openings, never through a
 * cliff. The bearing selects the closest opening; the inset leaves a full hull
 * of water between the route and either stone shoulder.
 */
export function gardenMistBoundaryTile(
  toward: GardenTransitionTile,
  salt = 0,
  marginTiles: number,
  out: GardenTransitionTile = { x: 0, y: 0 },
): GardenTransitionTile {
  const margin = Math.max(0.5, marginTiles);
  const minTile = margin;
  const maxTileX = PHAROSVILLE_MAP_WIDTH - 1 - margin;
  const maxTileY = PHAROSVILLE_MAP_HEIGHT - 1 - margin;
  const desired = Math.abs(toward.x - MIST_CENTER_TILE_X)
      + Math.abs(toward.y - MIST_CENTER_TILE_Y) < 1e-6
    ? normaliseTransitionBearing(salt * Math.PI * 2)
    : Math.atan2(toward.y - MIST_CENTER_TILE_Y, toward.x - MIST_CENTER_TILE_X);
  const openingInset = Math.atan2(
    margin + 0.5,
    Math.min(MIST_CENTER_TILE_X, MIST_CENTER_TILE_Y),
  );
  let angle = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const opening of RIM_OPENINGS) {
    const start = opening.bearingStart + openingInset;
    const end = opening.bearingEnd - openingInset;
    const candidate = MathUtils.clamp(desired, start, end);
    const distance = Math.abs(normaliseTransitionBearing(desired - candidate));
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    angle = candidate;
  }
  // A small stable spread keeps simultaneous traffic from forming one rail,
  // while the final clamp preserves the shoulder clearance.
  const opening = RIM_OPENINGS.find((entry) => (
    angle >= entry.bearingStart + openingInset && angle <= entry.bearingEnd - openingInset
  ))!;
  angle = MathUtils.clamp(
    angle + (salt - 0.5) * openingInset,
    opening.bearingStart + openingInset,
    opening.bearingEnd - openingInset,
  );
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const scaleX = dx > 0
    ? (maxTileX - MIST_CENTER_TILE_X) / dx
    : (minTile - MIST_CENTER_TILE_X) / dx;
  const scaleY = dy > 0
    ? (maxTileY - MIST_CENTER_TILE_Y) / dy
    : (minTile - MIST_CENTER_TILE_Y) / dy;
  const scale = Math.min(Math.abs(scaleX), Math.abs(scaleY));
  out.x = MathUtils.clamp(MIST_CENTER_TILE_X + dx * scale, minTile, maxTileX);
  out.y = MathUtils.clamp(MIST_CENTER_TILE_Y + dy * scale, minTile, maxTileY);
  // The angular shoulder inset is deliberately conservative. Keep this guard
  // close to the authoring math so a future narrower opening cannot silently
  // put the route back through land.
  if (!isGardenShipWater(out, margin)) {
    const middle = (opening.bearingStart + opening.bearingEnd) * 0.5;
    const safeDx = Math.cos(middle);
    const safeDy = Math.sin(middle);
    const safeScaleX = safeDx > 0
      ? (maxTileX - MIST_CENTER_TILE_X) / safeDx
      : (minTile - MIST_CENTER_TILE_X) / safeDx;
    const safeScaleY = safeDy > 0
      ? (maxTileY - MIST_CENTER_TILE_Y) / safeDy
      : (minTile - MIST_CENTER_TILE_Y) / safeDy;
    const safeScale = Math.min(Math.abs(safeScaleX), Math.abs(safeScaleY));
    out.x = MIST_CENTER_TILE_X + safeDx * safeScale;
    out.y = MIST_CENTER_TILE_Y + safeDy * safeScale;
  }
  if (!isGardenShipWater(out, margin)) {
    // The general nearest-water resolver is intentionally not used for a
    // mist endpoint: its nearest answer may sit behind a solid rim side.
    // Retreat along this opening's bearing so edge geography can move the
    // endpoint inward, but never sideways through a cliff.
    // Recompute from `out`: the shoulder fallback immediately above may have
    // replaced the selected angle with the opening midpoint. Retreating with
    // the stale pre-fallback vector would drift sideways out of that opening.
    const retreatLength = Math.hypot(out.x - MIST_CENTER_TILE_X, out.y - MIST_CENTER_TILE_Y);
    const retreatDx = retreatLength > 1e-6 ? (out.x - MIST_CENTER_TILE_X) / retreatLength : dx;
    const retreatDy = retreatLength > 1e-6 ? (out.y - MIST_CENTER_TILE_Y) / retreatLength : dy;
    for (let retreat = 0.5; retreat <= retreatLength; retreat += 0.5) {
      const candidate = { x: out.x - retreatDx * retreat, y: out.y - retreatDy * retreat };
      if (!isGardenShipWater(candidate, margin)) continue;
      out.x = candidate.x;
      out.y = candidate.y;
      break;
    }
  }
  if (!isGardenShipWater(out, margin)) {
    throw new Error(`No hull-safe water remains in the selected garden rim opening (margin ${margin}).`);
  }
  return out;
}

function transitionEase(value: number): number {
  const t = MathUtils.clamp(value, 0, 1);
  // smootherstep: zero velocity at both berths, with no spring/overshoot.
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function curvedTransitionPoint(
  from: GardenTransitionTile,
  to: GardenTransitionTile,
  bend: number,
  progress: number,
  marginTiles: number,
  seed: string,
  out: GardenTransitionTile,
): GardenTransitionTile {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const curve = Math.min(6, distance * 0.16) * bend;
  const normalX = distance > 1e-6 ? -dy / distance : 0;
  const normalY = distance > 1e-6 ? dx / distance : 0;
  const controlX = (from.x + to.x) * 0.5 + normalX * curve;
  const controlY = (from.y + to.y) * 0.5 + normalY * curve;
  const inverse = 1 - progress;
  out.x = inverse * inverse * from.x + 2 * inverse * progress * controlX
    + progress * progress * to.x;
  out.y = inverse * inverse * from.y + 2 * inverse * progress * controlY
    + progress * progress * to.y;
  // Curvature near a corner can otherwise put the keel a fraction beyond the
  // playable sea. Clamp is a last-line invariant, not a path-shape device.
  const margin = Math.max(0.5, marginTiles);
  out.x = MathUtils.clamp(out.x, margin, PHAROSVILLE_MAP_WIDTH - 1 - margin);
  out.y = MathUtils.clamp(out.y, margin, PHAROSVILLE_MAP_HEIGHT - 1 - margin);
  if (!isGardenShipWater(out, margin)) {
    const safe = nearestGardenShipWater(out, margin, seed);
    out.x = safe.x;
    out.y = safe.y;
  }
  return out;
}

const transitionPointScratch = { x: 0, y: 0 };
const transitionAheadScratch = { x: 0, y: 0 };
const transitionOldEdgeScratch = { x: 0, y: 0 };
const transitionNewEdgeScratch = { x: 0, y: 0 };

function transitionPointAt(
  transition: GardenShipTransitionSpec,
  amount: number,
  point: GardenTransitionTile,
): GardenTransitionTile {
  if (transition.kind !== "mist") {
    return curvedTransitionPoint(
      transition.from,
      transition.to,
      transition.bend,
      amount,
      transition.marginTiles,
      `transition.${transition.shipId}.${transition.kind}`,
      point,
    );
  }
  const oldEdge = gardenMistBoundaryTile(
    transition.from,
    0.17,
    transition.marginTiles,
    transitionOldEdgeScratch,
  );
  const newEdge = gardenMistBoundaryTile(
    transition.to,
    0.83,
    transition.marginTiles,
    transitionNewEdgeScratch,
  );
  return amount < 0.5
    ? curvedTransitionPoint(
      transition.from,
      oldEdge,
      transition.bend,
      amount * 2,
      transition.marginTiles,
      `transition.${transition.shipId}.mist-old`,
      point,
    )
    : curvedTransitionPoint(
      newEdge,
      transition.to,
      -transition.bend,
      amount * 2 - 1,
      transition.marginTiles,
      `transition.${transition.shipId}.mist-new`,
      point,
    );
}

/** Clock-pure transition sampling; reload persistence is intentionally absent. */
export function sampleGardenShipTransition(
  transition: GardenShipTransitionSpec,
  timeSeconds: number,
  out: GardenShipTransitionSample = {
    complete: false,
    headingX: 0,
    headingY: 0,
    progress: 0,
    visibility: 1,
    x: 0,
    y: 0,
  },
): GardenShipTransitionSample {
  const raw = MathUtils.clamp(
    (timeSeconds - transition.startSeconds) / Math.max(1, transition.durationSeconds),
    0,
    1,
  );
  const eased = transitionEase(raw);
  // Cross-map moves never draw a chord through the island. `transitionPointAt`
  // sails to the old edge, disappears into aerial mist, then emerges at the
  // new edge; the midpoint hand-off is fully hidden.
  const point = transitionPointAt(transition, eased, transitionPointScratch);
  const ahead = transitionPointAt(
    transition,
    Math.min(1, eased + 0.002),
    transitionAheadScratch,
  );
  const headingLength = Math.hypot(ahead.x - point.x, ahead.y - point.y);
  out.x = point.x;
  out.y = point.y;
  out.headingX = headingLength > 1e-6 ? (ahead.x - point.x) / headingLength : 0;
  out.headingY = headingLength > 1e-6 ? (ahead.y - point.y) / headingLength : 0;
  out.progress = raw;
  out.complete = raw >= 1;
  if (transition.kind === "arrival") out.visibility = transitionEase(Math.min(1, raw / 0.16));
  else if (transition.kind === "departure") {
    out.visibility = 1 - transitionEase(Math.max(0, (raw - 0.84) / 0.16));
  } else if (transition.kind === "mist") {
    out.visibility = transitionEase(Math.min(1, Math.abs(raw - 0.5) * 2));
  } else out.visibility = 1;
  return out;
}
