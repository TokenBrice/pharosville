import { squadForMember, squadFormationOffsetForPlacement } from "../maker-squad";
import { clamp, smoothstepRange } from "../motion-utils";
import type { ShipMotionRoute, ShipMotionSample } from "../motion-types";
import { GARDEN_DEFAULT_WIND_X, GARDEN_DEFAULT_WIND_Z } from "../weather";
import { isWaterTileKind, tileKindAt } from "../world-layout";
import { clampMotionTileInto, routeIdentityKey, type ResolveShipMotionSampleInput } from "./shared";
import { clearShipHeadingMemory } from "./memory";
import { sampleRouteCycleInto } from "./route-cycle";
import { shareRouteSamplingRuntime } from "./route-runtime";

/**
 * W4.F11 (fleet-motion-7): consorts follow in the wake. Each consort sails its
 * flagship's own water-safe route this many seconds per squad rank later, so
 * a squad leaves harbour in single file, turns at the same marks and can never
 * crab sideways or cross land. At rest the squad lies as a small raft: the
 * authored formation offset, turned with the flagship's heading.
 */
export const CONSORT_FOLLOW_DELAY_SECONDS = 6;
/** The raft offset eases in after arrival and out before departure. */
const CONSORT_RAFT_EASE_SECONDS = 12;
/** Authored offsets are drawn for a squad lying bow to the default wind. */
const AUTHORED_RAFT_HEADING = Math.atan2(-GARDEN_DEFAULT_WIND_Z, -GARDEN_DEFAULT_WIND_X);
/** A placement change moves the raft offset over this long, never a snap. */
const FORMATION_CHANGE_BLEND_SECONDS = 3;

interface FormationOffsetEntry {
  dx: number;
  dy: number;
  changedAt: number;
  prevDx: number;
  prevDy: number;
}
const formationOffsetCacheByShipId = new Map<string, FormationOffsetEntry>();

// Follower routes: the flagship's route under the consort's id, one per
// consort per plan route (the WeakMap releases them with the plan).
const followerRoutesByFlagshipRoute = new WeakMap<ShipMotionRoute, Map<string, ShipMotionRoute>>();

function followerRouteFor(flagshipRoute: ShipMotionRoute, consortId: string): ShipMotionRoute {
  let byConsortId = followerRoutesByFlagshipRoute.get(flagshipRoute);
  if (!byConsortId) {
    byConsortId = new Map();
    followerRoutesByFlagshipRoute.set(flagshipRoute, byConsortId);
  }
  let follower = byConsortId.get(consortId);
  if (!follower) {
    follower = {
      ...flagshipRoute,
      shipId: consortId,
      followsShipId: flagshipRoute.shipId,
      routeKey: `${routeIdentityKey(flagshipRoute)}:follow:${consortId}`,
    };
    shareRouteSamplingRuntime(follower, flagshipRoute);
    byConsortId.set(consortId, follower);
  }
  return follower;
}

function isWaterTile(x: number, y: number): boolean {
  return isWaterTileKind(tileKindAt(x, y));
}

/**
 * Squad consorts sample their flagship's route at a rank delay; the squad
 * sails as one body through every phase (berth, voyage, anchorage).
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
  const rank = Math.max(1, squad.memberIds.indexOf(input.ship.id));
  const follower = followerRouteFor(flagshipRoute, input.ship.id);
  sampleRouteCycleInto(follower, input.timeSeconds - rank * CONSORT_FOLLOW_DELAY_SECONDS, input.seaState ?? null, out);

  if (out.state === "moored" || out.state === "risk-drift" || out.state === "idle") {
    const offset = route.formationOffset
      ?? squadFormationOffsetForPlacement(input.ship.id, squad, input.ship.riskPlacement)
      ?? { dx: 0, dy: 0 };
    let dx = offset.dx;
    let dy = offset.dy;
    const cached = formationOffsetCacheByShipId.get(input.ship.id);
    if (!cached) {
      formationOffsetCacheByShipId.set(input.ship.id, { dx, dy, changedAt: input.timeSeconds, prevDx: dx, prevDy: dy });
    } else if (cached.dx !== dx || cached.dy !== dy) {
      clearShipHeadingMemory(input.ship.id);
      cached.prevDx = cached.dx;
      cached.prevDy = cached.dy;
      cached.dx = dx;
      cached.dy = dy;
      cached.changedAt = input.timeSeconds;
      dx = cached.prevDx;
      dy = cached.prevDy;
    } else {
      const blend = clamp((input.timeSeconds - cached.changedAt) / FORMATION_CHANGE_BLEND_SECONDS, 0, 1);
      dx = cached.prevDx + (dx - cached.prevDx) * blend;
      dy = cached.prevDy + (dy - cached.prevDy) * blend;
    }
    const segment = out.segment;
    const ease = segment
      ? smoothstepRange(0, CONSORT_RAFT_EASE_SECONDS, segment.secondsInto)
        * smoothstepRange(0, CONSORT_RAFT_EASE_SECONDS, segment.secondsRemaining)
      : 1;
    const turn = Math.atan2(out.heading.y, out.heading.x) - AUTHORED_RAFT_HEADING;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const baseX = out.tile.x;
    const baseY = out.tile.y;
    // Turned with the squad's heading; unturned, then halved, then onto the
    // flagship's own water if the raft would touch shore.
    let x = baseX + (dx * cos - dy * sin) * ease;
    let y = baseY + (dx * sin + dy * cos) * ease;
    if (!isWaterTile(x, y)) {
      x = baseX + dx * ease;
      y = baseY + dy * ease;
    }
    if (!isWaterTile(x, y)) {
      x = baseX + dx * ease * 0.5;
      y = baseY + dy * ease * 0.5;
    }
    if (!isWaterTile(x, y)) {
      x = baseX;
      y = baseY;
    }
    clampMotionTileInto(x, y, out.tile);
  }
  out.zone = input.ship.riskZone;
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  return true;
}
