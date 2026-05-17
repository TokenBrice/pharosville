import { describe, expect, it } from "vitest";
import { resolveShipMotionSample } from "./motion-sampling";
import { seaStateForSources } from "./sea-state";
import type { PharosVilleMotionPlan, ShipMotionRoute } from "./motion-types";
import type { ShipNode } from "./world-types";

describe("motion sampling sea-state metadata", () => {
  it("scales moored berth sway from the supplied sea state", () => {
    const route = makeRoute();
    const ship = {
      id: route.shipId,
      riskZone: route.zone,
    } as ShipNode;
    const plan: PharosVilleMotionPlan = {
      animatedShipIds: new Set(),
      effectShipIds: new Set(),
      lighthouseFireFlickerPerSecond: 1,
      moverShipIds: new Set(),
      shipPhases: new Map(),
      shipRoutes: new Map([[route.shipId, route]]),
    };
    const calmSea = seaStateForSources({
      areas: [{ band: "CALM", count: 1 }],
      lighthouse: { psiBand: "STEADY", score: 12, unavailable: false },
      wallClockHour: 12,
    });
    const stormSea = seaStateForSources({
      areas: [{ band: "DANGER", count: 1 }],
      lighthouse: { psiBand: "DANGER", score: 90, unavailable: false },
      wallClockHour: 23,
    });

    const calm = resolveShipMotionSample({
      plan,
      reducedMotion: false,
      seaState: calmSea,
      ship,
      timeSeconds: 0,
    });
    const storm = resolveShipMotionSample({
      plan,
      reducedMotion: false,
      seaState: stormSea,
      ship,
      timeSeconds: 0,
    });

    expect(calm.state).toBe("moored");
    expect(storm.state).toBe("moored");
    expect(storm.mooringSwayAmplitude).toBeGreaterThan(calm.mooringSwayAmplitude ?? 0);
    expect(distanceFromMooring(storm, route)).toBeGreaterThan(distanceFromMooring(calm, route));
    expect(storm.seaState?.label).toBe(stormSea.label);
  });
});

function makeRoute(): ShipMotionRoute {
  const stop: ShipMotionRoute["dockStops"][number] = {
    id: "dock.ethereum:usdc-circle",
    kind: "dock",
    dockId: "dock.ethereum",
    chainId: "ethereum",
    weight: 1,
    mooringTile: { x: 12, y: 18 },
    dockTangent: { x: 1, y: 0 },
  };
  return {
    shipId: "usdc-circle",
    cycleSeconds: 1200,
    phaseSeconds: 0,
    riskTile: { x: 20, y: 22 },
    dockStops: [stop],
    riskStop: null,
    zone: "calm",
    dockStopSchedule: [stop.dockId],
    homeDockId: stop.dockId,
    openWaterPatrol: null,
    waterPaths: new Map(),
    routeSeed: 12345,
    formationOffset: null,
    staleEvidence: false,
    wakeMultiplier: 1,
  };
}

function distanceFromMooring(sample: { tile: { x: number; y: number } }, route: ShipMotionRoute): number {
  const mooringTile = route.dockStops[0]!.mooringTile;
  return Math.hypot(sample.tile.x - mooringTile.x, sample.tile.y - mooringTile.y);
}
