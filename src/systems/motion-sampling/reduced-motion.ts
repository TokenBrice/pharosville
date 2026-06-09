import { squadForMember, squadFormationOffsetForPlacement } from "../maker-squad";
import type { SeaState } from "../sea-state";
import type { PharosVilleMotionPlan, ShipMotionRoute, ShipMotionRouteStop, ShipMotionSample } from "../motion-types";
import type { ShipNode } from "../world-types";
import {
  clampMotionTileInto,
  resetSampleChoreography,
  routeIdentityKey,
  routePathIdentityKey,
  writeMapVisibilityAlphaInto,
  writeZeroVelocityInto,
} from "./shared";

interface ReducedMotionRouteFrame {
  tile: { x: number; y: number };
  heading: { x: number; y: number };
  dockStop: ShipMotionRoute["dockStops"][number] | null;
  ledgerStop: ShipMotionRouteStop | null;
}

export function reducedMotionSampleInto(
  plan: PharosVilleMotionPlan,
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

  if (!route) {
    out.tile.x = ship.riskTile.x;
    out.tile.y = ship.riskTile.y;
    return;
  }

  if (ship.squadRole === "consort" && ship.squadId) {
    const squad = squadForMember(ship.id);
    const flagshipRoute = squad ? plan.shipRoutes.get(squad.flagshipId) : undefined;
    if (flagshipRoute) {
      const flagshipFrame = reducedMotionRouteFrame(flagshipRoute);
      const offset = route.formationOffset
        ?? squadFormationOffsetForPlacement(ship.id, squad!, ship.riskPlacement)
        ?? { dx: 0, dy: 0 };
      clampMotionTileInto(flagshipFrame.tile.x + offset.dx, flagshipFrame.tile.y + offset.dy, out.tile);
      out.heading.x = flagshipFrame.heading.x;
      out.heading.y = flagshipFrame.heading.y;
      return;
    }
  }

  const frame = reducedMotionRouteFrame(route);
  out.tile.x = frame.tile.x;
  out.tile.y = frame.tile.y;
  out.heading.x = frame.heading.x;
  out.heading.y = frame.heading.y;

  if (frame.ledgerStop) {
    // Existing NAV policy treats Ledger Mooring as the static representative
    // frame rather than a rendered chain dock visit.
    return;
  }

  if (frame.dockStop) {
    out.currentDockId = frame.dockStop.dockId;
    out.currentRouteStopId = frame.dockStop.id;
    out.currentRouteStopKind = frame.dockStop.kind;
    out.mooringSubPhase = "quiet";
    out.mooringTension = 1;
  }
}

function reducedMotionRouteFrame(route: ShipMotionRoute): ReducedMotionRouteFrame {
  if (route.riskStop?.kind === "ledger") {
    return {
      tile: route.riskStop.mooringTile,
      heading: route.riskStop.dockTangent ?? { x: 0, y: 0 },
      dockStop: null,
      ledgerStop: route.riskStop,
    };
  }

  const dockStop = primaryRouteDockStop(route);
  if (dockStop) {
    return {
      tile: dockStop.mooringTile,
      heading: dockStop.dockTangent ?? { x: 0, y: 0 },
      dockStop,
      ledgerStop: null,
    };
  }

  return {
    tile: route.riskTile,
    heading: { x: 0, y: 0 },
    dockStop: null,
    ledgerStop: null,
  };
}

function primaryRouteDockStop(route: ShipMotionRoute): ShipMotionRoute["dockStops"][number] | null {
  return (route.homeDockId ? route.dockStops.find((stop) => stop.dockId === route.homeDockId) : null)
    ?? route.dockStops[0]
    ?? null;
}
