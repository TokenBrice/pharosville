import { stableUnit } from "../stable-random";
import {
  formationGain,
  squadConsortHeadingLerpAlpha,
  squadForMember,
  squadFormationOffsetForPlacement,
  type SquadFormationFlagshipState,
} from "../maker-squad";
import { clamp, normalizeHeadingInto } from "../motion-utils";
import type { ShipMotionRoute, ShipMotionSample } from "../motion-types";
import { isWaterTileKind, tileKindAt } from "../world-layout";
import {
  clampMotionTileInto,
  copyVelocityInto,
  createShipMotionSample,
  routeIdentityKey,
  routePathIdentityKey,
  writeMapVisibilityAlphaInto,
  type ResolveShipMotionSampleInput,
} from "./shared";
import { clearShipHeadingMemory } from "./memory";
import { sampleRouteCycleInto } from "./route-cycle";

// Module-scope scratch sample reused for the consort branch (flagship lookup).
// Safe because resolveShipMotionSampleInto is synchronous and not re-entrant.
const flagshipScratch: ShipMotionSample = createShipMotionSample();

// D3: per-ship formation offset cache. Tracks the last-seen formationOffset for
// each consort so placement changes can be detected at sample time.
interface FormationOffsetEntry {
  dx: number;
  dy: number;
  lastFormationChangeAt: number;
  prevDx: number;
  prevDy: number;
}
const formationOffsetCacheByShipId = new Map<string, FormationOffsetEntry>();

// W4.24: per-consort heading-lag memory. Records the previous heading and the
// timestamp it was written; consorts lerp from prev toward the flagship's
// current heading with TAU = 0.6s so heading changes trail the flagship.
interface ConsortHeadingLagEntry {
  hx: number;
  hy: number;
  lastT: number;
}
const consortHeadingLagByShipId = new Map<string, ConsortHeadingLagEntry>();

/** Test-only — flushes the consort heading-lag memory. */
export function __resetConsortHeadingLagMemory(): void {
  consortHeadingLagByShipId.clear();
}

/**
 * Squad consorts shadow their flagship's sample with a placement-aware
 * formation offset, so the squad sails as one body through every motion
 * phase (moored, transit, drift). Without this, the flagship's dock cycle
 * leaves consorts orbiting their fixed riskTile while the flagship is away
 * — the cohesion gap documented in motion-planning.ts.
 *
 * Returns false when the ship has no resolvable squad/flagship route, in
 * which case the caller falls through to the normal route-cycle sample.
 */
export function consortShadowSampleInto(
  input: ResolveShipMotionSampleInput,
  route: ShipMotionRoute,
  out: ShipMotionSample,
): boolean {
  const squad = squadForMember(input.ship.id);
  const flagshipRoute = squad ? input.plan.shipRoutes.get(squad.flagshipId) : undefined;
  if (!squad || !flagshipRoute) return false;

  // Prefer the already-computed flagship sample from the per-frame map; if
  // missing (legacy callers / out-of-order iteration), fall back to a
  // local scratch route sample.
  const cachedFlagshipSample = input.flagshipSamples?.get(squad.flagshipId);
  const flagshipSample = cachedFlagshipSample ?? flagshipScratch;
  if (!cachedFlagshipSample) {
    sampleRouteCycleInto(flagshipRoute, input.timeSeconds, input.seaState ?? null, flagshipScratch);
  }
  // Prefer the route's cached formation offset over live computation.
  const offset = route.formationOffset
    ?? squadFormationOffsetForPlacement(input.ship.id, squad, input.ship.riskPlacement)
    ?? { dx: 0, dy: 0 };

  // D3: detect formation offset changes at sample time. When riskPlacement
  // changes, the new formationOffset applies but heading memory persists
  // stale. Detect the change via a per-ship cache and blend over 3.0s
  // (motion-behavior review 2026-05-03: the prior 1.5s pushed the largest
  // diagonal offsets at ~1.9 tiles/s — ~2.5× peak sail speed — visibly a
  // lurch; 3.0s gives ~0.94 tiles/s mean (peak ~1.4 with smoothstep), so
  // distress-recovery reads as a deliberate transit instead of a snap).
  const shipId = input.ship.id;
  const cachedOffset = formationOffsetCacheByShipId.get(shipId);
  const BLEND_DURATION = 3.0;
  let effectiveDx = offset.dx;
  let effectiveDy = offset.dy;
  if (!cachedOffset) {
    // First sample: seed the cache.
    formationOffsetCacheByShipId.set(shipId, {
      dx: offset.dx,
      dy: offset.dy,
      lastFormationChangeAt: input.timeSeconds,
      prevDx: offset.dx,
      prevDy: offset.dy,
    });
  } else if (cachedOffset.dx !== offset.dx || cachedOffset.dy !== offset.dy) {
    // Offset changed: flush heading/wake memory so convergence starts fresh.
    clearShipHeadingMemory(shipId);
    cachedOffset.prevDx = cachedOffset.dx;
    cachedOffset.prevDy = cachedOffset.dy;
    cachedOffset.dx = offset.dx;
    cachedOffset.dy = offset.dy;
    cachedOffset.lastFormationChangeAt = input.timeSeconds;
  } else {
    // No change: check if we're still in the blend window.
    const blendProgress = clamp((input.timeSeconds - cachedOffset.lastFormationChangeAt) / BLEND_DURATION, 0, 1);
    if (blendProgress < 1) {
      effectiveDx = cachedOffset.prevDx + (offset.dx - cachedOffset.prevDx) * blendProgress;
      effectiveDy = cachedOffset.prevDy + (offset.dy - cachedOffset.prevDy) * blendProgress;
    }
  }

  // W4.24 — formation gain: fan consorts out during calm cruising (×1.4),
  // tighten into single-file during arriving (×0.55), preserving the
  // tight-placement cap so consorts can't spill outside their water set.
  const gain = formationGain({
    zone: input.ship.riskZone,
    flagshipSpeed: flagshipSample.speedTilesPerSecond ?? 0,
    flagshipState: flagshipSample.state as SquadFormationFlagshipState,
    placement: input.ship.riskPlacement,
  });
  const gainedDx = effectiveDx * gain;
  const gainedDy = effectiveDy * gain;
  let tileX = flagshipSample.tile.x + gainedDx;
  let tileY = flagshipSample.tile.y + gainedDy;
  const gainedFormationLandsOnWater = isWaterTile(tileX, tileY);
  const shouldCollapseHighGainToFlagship =
    gain > 1 && !gainedFormationLandsOnWater && isWaterTile(flagshipSample.tile.x, flagshipSample.tile.y);
  // #8: sub-tile breathing perturbation while the flagship is actively
  // moving; skipped when moored/idle so docked formations stay glued.
  if (flagshipSample.state !== "moored" && flagshipSample.state !== "idle") {
    const phase = stableUnit(`${input.ship.id}.formation-breath`) * Math.PI * 2;
    const t = input.timeSeconds;
    tileX += Math.sin(t * 0.31 + phase) * 0.18;
    tileY += Math.cos(t * 0.27 + phase * 1.1) * 0.14;
  }
  // W4.24: high formation gain can push consorts over island/shore terrain
  // while the flagship itself is still on water. In that case collapse the
  // consort back onto the flagship tile rather than showing a ship on land.
  if (shouldCollapseHighGainToFlagship) {
    tileX = flagshipSample.tile.x;
    tileY = flagshipSample.tile.y;
  }
  out.shipId = input.ship.id;
  clampMotionTileInto(tileX, tileY, out.tile);
  out.state = flagshipSample.state;
  out.zone = input.ship.riskZone;
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  // W4.24 — lagged consort heading: lerp prevHeading → flagshipHeading
  // over TAU = 0.6s so heading changes trail the flagship instead of
  // snapping. Per-consort cache; cold-start writes flagship heading
  // directly so the first frame is correct.
  writeLaggedConsortHeadingInto(
    input.ship.id,
    input.timeSeconds,
    flagshipSample.heading,
    out.heading,
  );
  out.routeKey = routeIdentityKey(route);
  out.routePathKey = flagshipSample.routePathKey ?? routePathIdentityKey(route, "consort", flagshipRoute.shipId);
  copyVelocityInto(flagshipSample, out);
  writeMapVisibilityAlphaInto(out, flagshipSample.mapVisibilityAlpha ?? 1);
  out.wakeIntensity = flagshipSample.wakeIntensity;
  out.mooringSubPhase = flagshipSample.mooringSubPhase ?? null;
  out.mooringSwayAmplitude = flagshipSample.mooringSwayAmplitude ?? 1;
  out.mooringTension = flagshipSample.mooringTension ?? 0;
  out.lanternAlpha = flagshipSample.lanternAlpha ?? 0;
  out.fenderContact = flagshipSample.fenderContact ?? 0;
  out.seaState = input.seaState ?? flagshipSample.seaState ?? null;
  // W4.25 — consorts mirror their flagship's risk-transition state so the
  // whole squad reads as "tracking new risk band" together in DOM parity.
  out.riskTransition = flagshipSample.riskTransition ?? null;
  return true;
}

function isWaterTile(x: number, y: number): boolean {
  return isWaterTileKind(tileKindAt(x, y));
}

function writeLaggedConsortHeadingInto(
  consortId: string,
  timeSeconds: number,
  flagshipHeading: { x: number; y: number },
  out: { x: number; y: number },
): void {
  const memory = consortHeadingLagByShipId.get(consortId);
  if (!memory) {
    consortHeadingLagByShipId.set(consortId, {
      hx: flagshipHeading.x,
      hy: flagshipHeading.y,
      lastT: timeSeconds,
    });
    out.x = flagshipHeading.x;
    out.y = flagshipHeading.y;
    return;
  }
  const dt = timeSeconds - memory.lastT;
  // Cold-start: tab-resume or time-jump → skip the lerp and seed memory.
  if (dt < 0 || dt > 1.5) {
    memory.hx = flagshipHeading.x;
    memory.hy = flagshipHeading.y;
    memory.lastT = timeSeconds;
    out.x = flagshipHeading.x;
    out.y = flagshipHeading.y;
    return;
  }
  const alpha = squadConsortHeadingLerpAlpha(Math.min(dt, 0.2));
  const hx = memory.hx + (flagshipHeading.x - memory.hx) * alpha;
  const hy = memory.hy + (flagshipHeading.y - memory.hy) * alpha;
  normalizeHeadingInto(hx, hy, out);
  memory.hx = out.x;
  memory.hy = out.y;
  memory.lastT = timeSeconds;
}
