import type { SeaState } from "../sea-state";
import type { ShipMotionRoute, ShipMotionSample } from "../motion-types";
import type { ShipNode } from "../world-types";
import {
  resetSampleChoreography,
  routeIdentityKey,
  routePathIdentityKey,
  writeMapVisibilityAlphaInto,
  writeZeroVelocityInto,
} from "./shared";

interface ReducedMotionRouteFrame {
  tile: { x: number; y: number };
  heading: { x: number; y: number };
}

export function reducedMotionSampleInto(
  ship: ShipNode,
  route: ShipMotionRoute | undefined,
  seaState: SeaState | null,
  out: ShipMotionSample,
): void {
  out.shipId = ship.id;
  out.state = "idle";
  out.zone = ship.riskZone;
  out.routeKey = route ? routeIdentityKey(route) : null;
  out.routePathKey = route ? routePathIdentityKey(route, "reduced") : null;
  out.routePath = undefined;
  out.currentDockId = null;
  out.currentRouteStopId = null;
  out.currentRouteStopKind = null;
  out.heading.x = 0;
  out.heading.y = 0;
  writeZeroVelocityInto(out);
  writeMapVisibilityAlphaInto(out, 1);
  out.wakeIntensity = 0;
  resetSampleChoreography(out);
  out.seaState = seaState;
  // Pin stillness to the quiet middle of a synthetic dwell. Consumers still
  // receive a deterministic segment shape, but no arrival/departure window can
  // accidentally animate the reduced-motion composition.
  out.segment = { kind: "dock-dwell", secondsInto: 12, secondsRemaining: 12 };

  // The still tableau shows every hull at once, so each rests on its own data
  // tile: the one the garden's berth allocator spaces hulls from. A consort's
  // tile is already its formation slot beside the flagship (ship placement);
  // recomposing it from the flagship's frame displaced it off that berth and
  // into its neighbours.
  if (!route || ship.squadRole === "consort") {
    out.tile.x = ship.riskTile.x;
    out.tile.y = ship.riskTile.y;
    return;
  }

  const frame = reducedMotionRouteFrame(route);
  out.tile.x = frame.tile.x;
  out.tile.y = frame.tile.y;
  out.heading.x = frame.heading.x;
  out.heading.y = frame.heading.y;
}

function reducedMotionRouteFrame(route: ShipMotionRoute): ReducedMotionRouteFrame {
  // Stillness uses the authored risk anchorages, not every ship's primary
  // dock at once. Chain ties stay in its record; the full fleet keeps its
  // canonical, water-safe display composition with no simulation warm-up.
  return {
    tile: route.riskStop?.kind === "ledger" ? route.riskStop.mooringTile : route.riskTile,
    heading: route.riskStop?.dockTangent ?? { x: 0, y: 0 },
  };
}
