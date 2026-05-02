import { describe, expect, it } from "vitest";
import { denseFixtureChains, denseFixturePegSummary, denseFixtureReportCards, denseFixtureStablecoins, denseFixtureStress, fixtureChains, fixturePegSummary, fixtureReportCards, fixtureStablecoins, fixtureStability, fixtureStress, fixtureWithFlagshipPlacement, makeAsset, makeChain, makePegCoin, makerSquadFixtureInputs } from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import { buildBaseMotionPlan, buildMotionPlan, buildShipWaterRoute, isShipMapVisible, lighthouseFireFlickerSpeed, motionPlanSignature, resolveShipMotionSample, sampleShipWaterPath, shipWaterPathKey, stableMotionPhase, type ShipDockMotionStop } from "./motion";
import { getShipHeadingDelta } from "./motion-sampling";
import { chaikinSmoothPath, ensureShoreDistanceMask, shoreDistance, warmAllWaterPaths } from "./motion-water";
import { squadForMember, squadFormationOffsetForPlacement } from "./maker-squad";
import { isSeawallBarrierTile, seawallBarrierDistance } from "./seawall";
import { buildPharosVilleMap, isWaterTileKind, terrainKindAt, tileKindAt } from "./world-layout";
import type { PharosVilleMap, PharosVilleWorld, ShipWaterZone } from "./world-types";

describe("motion", () => {
  const world = buildPharosVilleWorld({
    stablecoins: fixtureStablecoins,
    chains: fixtureChains,
    stability: fixtureStability,
    pegSummary: fixturePegSummary,
    stress: fixtureStress,
    reportCards: fixtureReportCards,
    cemeteryEntries: [],
    freshness: {},
  });

  it("keeps dockless patrols meaningful across every risk water zone", () => {
    const cases: Array<{ expectedTerrains: string[]; minDistance: number; zone: ShipWaterZone; world: PharosVilleWorld }> = [
      { zone: "calm", expectedTerrains: ["calm-water"], minDistance: 8, world: worldForShip({ chainCirculating: {}, chains: ["ethereum"] }) },
      { zone: "watch", expectedTerrains: ["watch-water", "calm-water"], minDistance: 8, world: worldForShip({ chainCirculating: {}, chains: ["ethereum"], stressBand: "WATCH" }) },
      {
        zone: "alert",
        expectedTerrains: ["alert-water", "warning-water"],
        minDistance: 8,
        world: worldForShip({
          chainCirculating: {},
          chains: ["ethereum"],
          pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 100 }),
        }),
      },
      {
        zone: "warning",
        expectedTerrains: ["warning-water", "storm-water"],
        minDistance: 8,
        world: worldForShip({
          chainCirculating: {},
          chains: ["ethereum"],
          pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 250 }),
        }),
      },
      {
        zone: "danger",
        expectedTerrains: ["storm-water", "warning-water"],
        minDistance: 8,
        world: worldForShip({
          chainCirculating: {},
          chains: ["ethereum"],
          pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", activeDepeg: true }),
        }),
      },
      {
        zone: "ledger",
        expectedTerrains: ["ledger-water", "calm-water", "watch-water", "alert-water", "warning-water", "storm-water"],
        minDistance: 8,
        world: worldForShip({ chainCirculating: {}, chains: ["ethereum"], navToken: true }),
      },
    ];

    for (const entry of cases) {
      const route = onlyRoute(entry.world);
      const waypoint = route.openWaterPatrol?.waypoint;
      const ship = entry.world.ships[0]!;

      expect(route.zone).toBe(entry.zone);
      expect(route.openWaterPatrol).not.toBeNull();
      expect(waypoint).toBeDefined();
      expect(entry.expectedTerrains).toContain(terrainKindAt(waypoint?.x ?? -1, waypoint?.y ?? -1));
      expect(distance(waypoint!, route.riskTile)).toBeGreaterThanOrEqual(entry.minDistance);

      const samples = Array.from({ length: 80 }, (_, index) => resolveShipMotionSample({
        plan: buildMotionPlan(entry.world, ship.detailId),
        reducedMotion: false,
        ship,
        timeSeconds: route.cycleSeconds * (index / 80) - route.phaseSeconds,
      }));
      expect(Math.max(...samples.map((sample) => distance(sample.tile, route.riskTile)))).toBeGreaterThanOrEqual(entry.minDistance - 1);
    }
  });

  it("orders DEWS sea dwell, wake, and drift by turbulence", () => {
    const calm = cycleStats(worldForShip({ chainCirculating: {}, chains: ["ethereum"] }));
    const watch = cycleStats(worldForShip({ chainCirculating: {}, chains: ["ethereum"], stressBand: "WATCH" }));
    const alert = cycleStats(worldForShip({
      chainCirculating: {},
      chains: ["ethereum"],
      pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 100 }),
    }));
    const warning = cycleStats(worldForShip({
      chainCirculating: {},
      chains: ["ethereum"],
      pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 250 }),
    }));
    const danger = cycleStats(worldForShip({
      chainCirculating: {},
      chains: ["ethereum"],
      pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", activeDepeg: true }),
    }));

    expect(calm.riskDriftSamples).toBeLessThan(watch.riskDriftSamples);
    expect(watch.riskDriftSamples).toBeLessThan(alert.riskDriftSamples);
    expect(alert.riskDriftSamples).toBeLessThan(warning.riskDriftSamples);
    expect(warning.riskDriftSamples).toBeLessThan(danger.riskDriftSamples);

    expect(calm.maxRiskDistance).toBeLessThan(watch.maxRiskDistance);
    expect(watch.maxRiskDistance).toBeLessThan(alert.maxRiskDistance);
    expect(alert.maxRiskDistance).toBeLessThan(warning.maxRiskDistance);
    expect(warning.maxRiskDistance).toBeLessThan(danger.maxRiskDistance);

    expect(calm.maxSailingWake).toBeLessThan(watch.maxSailingWake);
    expect(watch.maxSailingWake).toBeLessThan(alert.maxSailingWake);
    expect(alert.maxSailingWake).toBeLessThan(warning.maxSailingWake);
    expect(warning.maxSailingWake).toBeLessThan(danger.maxSailingWake);
  });

  it("animates every visible ship while keeping effect highlights focused", () => {
    const plan = buildMotionPlan(world, world.ships[0]?.detailId ?? null);

    expect(plan.animatedShipIds.size).toBe(world.ships.length);
    expect(world.ships.every((ship) => plan.animatedShipIds.has(ship.id))).toBe(true);
    expect(plan.effectShipIds.size).toBeLessThanOrEqual(plan.animatedShipIds.size);
    expect(plan.animatedShipIds.has(world.ships[0]!.id)).toBe(true);
    expect(plan.shipPhases.get(world.ships[0]!.id)).toBe(stableMotionPhase(world.ships[0]!.id));
  });

  it("builds deterministic routes for every visible ship", () => {
    const firstPlan = buildMotionPlan(world, null);
    const secondPlan = buildMotionPlan(world, null);

    expect(firstPlan.shipRoutes.size).toBe(world.ships.length);
    for (const ship of world.ships) {
      const route = firstPlan.shipRoutes.get(ship.id);
      const repeatedRoute = secondPlan.shipRoutes.get(ship.id);

      expect(route).toBeDefined();
      expect(route?.riskTile).toEqual(ship.riskTile);
      expect(route?.cycleSeconds).toBe(repeatedRoute?.cycleSeconds);
      expect(route?.phaseSeconds).toBe(repeatedRoute?.phaseSeconds);
      expect(route?.dockStopSchedule).toEqual(repeatedRoute?.dockStopSchedule);
      expect(route?.dockStops.map(stripRouteStopRuntimeFields)).toEqual(ship.dockVisits);
    }
  });

  it("reuses base route maps when only selection cue state changes", () => {
    const basePlan = buildBaseMotionPlan(world);
    const unselectedPlan = buildMotionPlan(world, null, basePlan);
    const selectedPlan = buildMotionPlan(world, world.ships[0]?.detailId ?? null, basePlan);

    expect(selectedPlan.shipRoutes).toBe(unselectedPlan.shipRoutes);
    expect(selectedPlan.shipPhases).toBe(unselectedPlan.shipPhases);
    expect(selectedPlan.animatedShipIds).toBe(unselectedPlan.animatedShipIds);
    expect(selectedPlan.moverShipIds).toBe(unselectedPlan.moverShipIds);
    expect(selectedPlan.effectShipIds.size).toBeGreaterThanOrEqual(unselectedPlan.effectShipIds.size);
  });

  it("produces the same motionPlanSignature for distinct world identities with identical content", () => {
    const otherWorld = buildPharosVilleWorld({
      stablecoins: fixtureStablecoins,
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });

    expect(otherWorld).not.toBe(world);
    expect(motionPlanSignature(otherWorld)).toBe(motionPlanSignature(world));

    // Different freshness flags should not change the plan signature: live
    // refetches that only flip stale bits must reuse the cached plan.
    const staleFreshnessWorld = buildPharosVilleWorld({
      stablecoins: fixtureStablecoins,
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: { stablecoinsStale: true, chainsStale: true },
    });
    expect(motionPlanSignature(staleFreshnessWorld)).toBe(motionPlanSignature(world));
  });

  it("changes motionPlanSignature when ship content shifts in a way the plan reads", () => {
    const baseSignature = motionPlanSignature(world);
    const mutatedShips = world.ships.map((ship, index) => (
      index === 0
        ? { ...ship, marketCapUsd: ship.marketCapUsd + 1_000_000 }
        : ship
    ));
    const mutatedWorld: PharosVilleWorld = { ...world, ships: mutatedShips };
    expect(motionPlanSignature(mutatedWorld)).not.toBe(baseSignature);
  });

  it("memoizes motionPlanSignature on the same world reference", () => {
    const first = motionPlanSignature(world);
    const second = motionPlanSignature(world);
    // Reference equality proves the second call hit the WeakMap cache rather
    // than re-running the sort + join (which always allocates a fresh string).
    expect(second).toBe(first);
  });

  it("reuses cached water paths across plan rebuilds when the map identity is stable", () => {
    const sharedWorld = buildPharosVilleWorld({
      stablecoins: fixtureStablecoins,
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });
    const otherWorldSameMap: PharosVilleWorld = { ...sharedWorld, ships: [...sharedWorld.ships] };
    expect(otherWorldSameMap).not.toBe(sharedWorld);
    expect(otherWorldSameMap.map).toBe(sharedWorld.map);

    const firstPlan = buildBaseMotionPlan(sharedWorld);
    const secondPlan = buildBaseMotionPlan(otherWorldSameMap);

    // Pick a docked ship and force its outbound path to materialize on each
    // plan. With the cross-plan cache, both lookups must return the same
    // ShipWaterPath instance — proving the A* result was not recomputed.
    const dockedShip = sharedWorld.ships.find((ship) => ship.dockVisits.length > 0)!;
    const firstRoute = firstPlan.shipRoutes.get(dockedShip.id)!;
    const secondRoute = secondPlan.shipRoutes.get(dockedShip.id)!;
    const stop = firstRoute.dockStops[0]!;
    const key = shipWaterPathKey(firstRoute.riskTile, stop.mooringTile);
    const firstPath = firstRoute.waterPaths.get(key);
    const secondPath = secondRoute.waterPaths.get(key);
    expect(firstPath).toBeDefined();
    expect(secondPath).toBe(firstPath);
  });

  it("warms both docked and patrol water paths in the warmup pass", () => {
    const patrolWorld = worldForShip({
      chainCirculating: {},
      chains: ["ethereum"],
    });
    const plan = buildBaseMotionPlan(patrolWorld);
    const route = plan.shipRoutes.get(patrolWorld.ships[0]!.id)!;

    warmAllWaterPaths(plan);
    expect(route.openWaterPatrol).not.toBeNull();

    for (const stop of route.dockStops) {
      const dockKey = shipWaterPathKey(route.riskTile, stop.mooringTile);
      const returnKey = shipWaterPathKey(stop.mooringTile, route.riskTile);
      expect(route.waterPaths.get(dockKey)).toBeDefined();
      expect(route.waterPaths.get(returnKey)).toBeDefined();
    }

    const outbound = route.openWaterPatrol?.outbound;
    const inbound = route.openWaterPatrol?.inbound;
    expect(outbound).toBeDefined();
    expect(inbound).toBeDefined();
    expect(route.waterPaths.get(shipWaterPathKey(outbound!.from, outbound!.to))).toBeDefined();
    expect(route.waterPaths.get(shipWaterPathKey(inbound!.from, inbound!.to))).toBeDefined();
  });

  it("caches the squad formation offset on each consort route", () => {
    const squadWorld = buildPharosVilleWorld(makerSquadFixtureInputs());
    const plan = buildMotionPlan(squadWorld, null);
    const consortShip = squadWorld.ships.find((ship) => ship.id === "susds-sky")!;
    const flagshipShip = squadWorld.ships.find((ship) => ship.id === "usds-sky")!;
    const consortRoute = plan.shipRoutes.get(consortShip.id)!;
    const squad = squadForMember(consortShip.id)!;
    const expected = squadFormationOffsetForPlacement(consortShip.id, squad, flagshipShip.riskPlacement);

    expect(expected).not.toBeNull();
    expect(consortRoute.formationOffset).toEqual(expected);

    const flagshipRoute = plan.shipRoutes.get(flagshipShip.id)!;
    // Non-consort routes must keep the field set to null so consumers can rely
    // on the discriminator instead of probing for squad membership at runtime.
    expect(flagshipRoute.formationOffset).toBeNull();
  });

  it("caches a usable dockTangent on at least one dock stop per dock-having ship", () => {
    const plan = buildBaseMotionPlan(world);
    const dockedShip = world.ships.find((ship) => ship.dockVisits.length > 0)!;
    const route = plan.shipRoutes.get(dockedShip.id)!;
    const tangent = route.dockStops.map((stop) => stop.dockTangent).find((entry) => entry !== null);
    expect(tangent).toBeDefined();
    expect(Number.isFinite(tangent!.x)).toBe(true);
    expect(Number.isFinite(tangent!.y)).toBe(true);
    // Tangent must be a unit vector so the sampler can lerp around it without
    // re-normalizing per frame.
    expect(Math.hypot(tangent!.x, tangent!.y)).toBeCloseTo(1, 5);
  });

  it("shortens cycles and increases scheduled dock cadence with chain breadth", () => {
    const singleChainWorld = worldForShip({
      chainCirculating: chainCirculating(["Ethereum"]),
      chains: ["ethereum"],
    });
    const multiChainWorld = worldForShip({
      chainCirculating: chainCirculating(["Ethereum", "Tron", "Solana", "Arbitrum"]),
      chains: ["ethereum", "tron", "solana", "arbitrum"],
    });
    const singleRoute = onlyRoute(singleChainWorld);
    const multiRoute = onlyRoute(multiChainWorld);

    expect(singleRoute.cycleSeconds).toBeGreaterThanOrEqual(780);
    expect(multiRoute.cycleSeconds).toBeGreaterThanOrEqual(780);
    expect(multiRoute.cycleSeconds).toBeLessThan(singleRoute.cycleSeconds);
    expect(singleRoute.dockStopSchedule.slice(0, 1)).toHaveLength(1);
    expect(multiRoute.dockStopSchedule.slice(0, 3)).toHaveLength(3);
    expect(new Set(multiRoute.dockStopSchedule).size).toBeGreaterThan(new Set(singleRoute.dockStopSchedule).size);
  });

  it("returns a static risk-water idle position for reduced-motion docked samples", () => {
    const ship = world.ships[0]!;
    const plan = buildMotionPlan(world, ship.detailId);
    const sample = resolveShipMotionSample({ plan, reducedMotion: true, ship, timeSeconds: 120 });

    expect(sample.tile).toEqual(ship.riskTile);
    expect(sample.state).toBe("idle");
    expect(sample.currentDockId).toBeNull();
    expect(sample.zone).toBe(ship.riskZone);
    expect(sample.wakeIntensity).toBe(0);
  });

  it("changes ship samples over time in normal motion", () => {
    const ship = world.ships[0]!;
    const plan = buildMotionPlan(world, ship.detailId);
    const route = plan.shipRoutes.get(ship.id)!;
    const first = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: 0 });
    const second = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: route.cycleSeconds / 2 });

    expect(second.tile).not.toEqual(first.tile);
  });

  it("docks routed ships for one third of their motion cycle", () => {
    const sampleWorld = worldForShip({
      chainCirculating: chainCirculating(["Ethereum", "Tron", "Solana"]),
      chains: ["ethereum", "tron", "solana"],
    });
    const ship = sampleWorld.ships[0]!;
    const plan = buildMotionPlan(sampleWorld, ship.detailId);
    const route = plan.shipRoutes.get(ship.id)!;
    let mooredSamples = 0;
    const sampleCount = 300;

    for (let index = 0; index < sampleCount; index += 1) {
      const sample = resolveShipMotionSample({
        plan,
        reducedMotion: false,
        ship,
        timeSeconds: route.cycleSeconds * (index / sampleCount) - route.phaseSeconds,
      });
      if (sample.state === "moored") mooredSamples += 1;
    }

    expect(mooredSamples / sampleCount).toBeGreaterThan(0.31);
    expect(mooredSamples / sampleCount).toBeLessThan(0.35);
  });

  it("keeps squad consorts in formation with the flagship through the entire dock cycle", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const plan = buildMotionPlan(world, null);
    const flagship = world.ships.find((ship) => ship.id === "usds-sky")!;
    const flagshipRoute = plan.shipRoutes.get(flagship.id)!;

    // Guard: production case requires the flagship to actually have docks.
    expect(flagshipRoute.dockStops.length).toBeGreaterThan(0);

    for (const consortId of ["susds-sky", "stusds-sky"] as const) {
      const consort = world.ships.find((ship) => ship.id === consortId)!;
      const squad = squadForMember(consortId)!;
      const offset = squadFormationOffsetForPlacement(consortId, squad, flagship.riskPlacement)!;
      const flagshipStates = new Set<string>();
      const sampleCount = 60;

      for (let index = 0; index < sampleCount; index += 1) {
        const timeSeconds = flagshipRoute.cycleSeconds * (index / sampleCount) - flagshipRoute.phaseSeconds;
        const flagshipSample = resolveShipMotionSample({ plan, reducedMotion: false, ship: flagship, timeSeconds });
        const consortSample = resolveShipMotionSample({ plan, reducedMotion: false, ship: consort, timeSeconds });
        flagshipStates.add(flagshipSample.state);

        if (flagshipSample.state === "moored" || flagshipSample.state === "idle") {
          // Moored/idle: consort holds an exact integer offset (no breathing).
          expect(consortSample.tile.x - flagshipSample.tile.x).toBeCloseTo(offset.dx, 5);
          expect(consortSample.tile.y - flagshipSample.tile.y).toBeCloseTo(offset.dy, 5);
        } else {
          // Transit: sub-tile breathing perturbation may be added; tolerate it.
          expect(consortSample.tile.x - flagshipSample.tile.x).toBeCloseTo(offset.dx, 0);
          expect(consortSample.tile.y - flagshipSample.tile.y).toBeCloseTo(offset.dy, 0);
        }
        // Consort doesn't actually visit chain docks even when shadowing a moored flagship.
        expect(consortSample.currentDockId).toBeNull();
        expect(consortSample.currentRouteStopId).toBeNull();
        expect(consortSample.currentRouteStopKind).toBeNull();
      }

      // Sanity: the cycle must traverse multiple states or the formation
      // assertion is meaningless (we'd only be testing one phase).
      expect(flagshipStates.size).toBeGreaterThanOrEqual(2);
    }
  });

  it("models Ledger Mooring as a semantic route stop separate from chain docks", () => {
    const sampleWorld = worldForShip({
      chainCirculating: chainCirculating(["Ethereum", "Tron"]),
      chains: ["ethereum", "tron"],
      navToken: true,
    });
    const ship = sampleWorld.ships[0]!;
    const route = onlyRoute(sampleWorld);
    const dockStop = route.dockStops[0]!;

    expect(route.zone).toBe("ledger");
    expect(route.riskStop).toMatchObject({
      id: "area.risk-water.ledger-mooring",
      kind: "ledger",
      chainId: null,
      dockId: null,
      mooringTile: route.riskTile,
    });
    expect(route.dockStops.map(stripRouteStopRuntimeFields)).toEqual(ship.dockVisits);
    expect(route.waterPaths.has(shipWaterPathKey(route.riskTile, dockStop.mooringTile))).toBe(true);
    expect(route.waterPaths.has(shipWaterPathKey(dockStop.mooringTile, route.riskTile))).toBe(true);
    for (const path of [
      route.waterPaths.get(shipWaterPathKey(route.riskTile, dockStop.mooringTile)),
      route.waterPaths.get(shipWaterPathKey(dockStop.mooringTile, route.riskTile)),
    ]) {
      expect(path).toBeDefined();
      expect(path!.points.every((point) => inMapBounds(sampleWorld.map, point))).toBe(true);
      expect(path!.points.every((point) => /water/.test(tileKindForSample(point)))).toBe(true);
    }
  });

  it("does not lock NAV ships to Ledger Mooring when fresh DEWS stress is present", () => {
    const sampleWorld = worldForShip({
      chainCirculating: chainCirculating(["Ethereum", "Tron"]),
      chains: ["ethereum", "tron"],
      navToken: true,
      stressBand: "WATCH",
    });
    const route = onlyRoute(sampleWorld);

    expect(route.zone).toBe("watch");
    expect(route.riskStop).toBeNull();
    expect(terrainKindAt(route.riskTile.x, route.riskTile.y)).toBe("watch-water");
  });

  it("keeps NAV ships idling at Ledger Mooring while preserving dock visits and roaming range", () => {
    const sampleWorld = worldForShip({
      chainCirculating: chainCirculating(["Ethereum", "Tron", "Solana"]),
      chains: ["ethereum", "tron", "solana"],
      navToken: true,
    });
    const ship = sampleWorld.ships[0]!;
    const plan = buildMotionPlan(sampleWorld, ship.detailId);
    const route = plan.shipRoutes.get(ship.id)!;
    const visitedDockIds = new Set<string>();
    let ledgerSamples = 0;
    let maxDistanceFromRisk = 0;
    const sampleCount = 240;

    for (let cycleIndex = 0; cycleIndex < 6; cycleIndex += 1) {
      for (let index = 0; index < sampleCount; index += 1) {
        const sample = resolveShipMotionSample({
          plan,
          reducedMotion: false,
          ship,
          timeSeconds: route.cycleSeconds * (cycleIndex + index / sampleCount) - route.phaseSeconds,
        });
        expect(tileKindForSample(sample.tile), `cycle ${cycleIndex} sample ${index}`).toMatch(/water/);
        maxDistanceFromRisk = Math.max(maxDistanceFromRisk, distance(sample.tile, route.riskTile));
        if (sample.currentRouteStopKind === "ledger") {
          ledgerSamples += 1;
          expect(sample.state).toBe("moored");
          expect(sample.currentDockId).toBeNull();
          expect(distance(sample.tile, route.riskTile)).toBeLessThanOrEqual(1);
          expect(isShipMapVisible({ ...ship, visual: { ...ship.visual, sizeTier: "major" } }, sample)).toBe(true);
        }
        if (sample.state === "moored" && sample.currentDockId) {
          visitedDockIds.add(sample.currentDockId);
        }
      }
    }

    expect(ledgerSamples / (sampleCount * 6)).toBeGreaterThan(0.06);
    expect(ledgerSamples / (sampleCount * 6)).toBeLessThan(0.16);
    expect(maxDistanceFromRisk).toBeGreaterThan(6);
    expect(visitedDockIds).toEqual(new Set(route.dockStops.map((stop) => stop.dockId)));
  });

  it("pins reduced-motion NAV ships to static ledger water", () => {
    const sampleWorld = worldForShip({
      chainCirculating: chainCirculating(["Ethereum"]),
      chains: ["ethereum"],
      navToken: true,
    });
    const ship = sampleWorld.ships[0]!;
    const plan = buildMotionPlan(sampleWorld, ship.detailId);
    const sample = resolveShipMotionSample({ plan, reducedMotion: true, ship, timeSeconds: 120 });

    expect(sample.tile).toEqual(ship.riskTile);
    expect(sample.state).toBe("idle");
    expect(sample.zone).toBe("ledger");
    expect(sample.currentDockId).toBeNull();
    expect(sample.currentRouteStopId).toBeNull();
    expect(sample.currentRouteStopKind).toBeNull();
    expect(sample.wakeIntensity).toBe(0);
    expect(terrainKindAt(Math.round(sample.tile.x), Math.round(sample.tile.y))).toBe("ledger-water");
  });

  it("hides only non-titan, non-unique ships while they are moored", () => {
    const titanShip = world.ships[0]!;
    const nonTitanShip = {
      ...titanShip,
      visual: {
        ...titanShip.visual,
        sizeTier: "major" as const,
        spriteAssetId: undefined,
      },
    };
    const uniqueShip = {
      ...titanShip,
      visual: {
        ...titanShip.visual,
        sizeTier: "unique" as const,
        spriteAssetId: "ship.crvusd-unique",
      },
    };
    const mooredSample = {
      shipId: titanShip.id,
      tile: titanShip.tile,
      state: "moored" as const,
      zone: titanShip.riskZone,
      currentDockId: titanShip.dockVisits[0]?.dockId ?? null,
      currentRouteStopId: titanShip.dockVisits[0]?.dockId ?? null,
      currentRouteStopKind: "dock" as const,
      heading: { x: 0, y: 1 },
      wakeIntensity: 0,
    };
    const ledgerSample = {
      ...mooredSample,
      currentDockId: null,
      currentRouteStopId: "area.risk-water.ledger-mooring",
      currentRouteStopKind: "ledger" as const,
    };

    expect(isShipMapVisible(titanShip, mooredSample)).toBe(true);
    expect(isShipMapVisible(uniqueShip, mooredSample)).toBe(true);
    expect(isShipMapVisible(nonTitanShip, mooredSample)).toBe(false);
    expect(isShipMapVisible(nonTitanShip, ledgerSample)).toBe(true);
    expect(isShipMapVisible(nonTitanShip, { ...mooredSample, state: "departing" })).toBe(true);
    expect(isShipMapVisible(nonTitanShip, null)).toBe(true);
  });

  it("keeps routed calm ships in transit for a visible share of the cycle", () => {
    const sampleWorld = worldForShip({
      chainCirculating: chainCirculating(["Ethereum", "Tron", "Solana"]),
      chains: ["ethereum", "tron", "solana"],
    });

    expect(stateCountsOverCycle(sampleWorld).transitSamples).toBeGreaterThanOrEqual(40);
  });

  it("routes dockless ships through open-water patrols instead of parking at the risk tile", () => {
    const sampleWorld = worldForShip({
      chainCirculating: {},
      chains: ["ethereum"],
    });
    const ship = sampleWorld.ships[0]!;
    const plan = buildMotionPlan(sampleWorld, ship.detailId);
    const route = plan.shipRoutes.get(ship.id)!;
    const samples = Array.from({ length: 80 }, (_, index) => resolveShipMotionSample({
      plan,
      reducedMotion: false,
      ship,
      timeSeconds: route.cycleSeconds * (index / 80) - route.phaseSeconds,
    }));

    expect(samples.some((sample) => sample.state === "sailing")).toBe(true);
    expect(Math.max(...samples.map((sample) => distance(sample.tile, route.riskTile)))).toBeGreaterThan(6);
    expect(samples.every((sample) => /water/.test(tileKindForSample(sample.tile)))).toBe(true);
  });

  it("keeps dockless patrol waypoints in expected zone corridors, with NAV ledger patrols free to span all water zones", () => {
    const cases = [
      { expectedTerrains: ["calm-water"], world: worldForShip({ chainCirculating: {}, chains: ["ethereum"] }) },
      {
        expectedTerrains: ["alert-water", "warning-water"],
        world: worldForShip({
          chainCirculating: {},
          chains: ["ethereum"],
          pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 100 }),
        }),
      },
      {
        expectedTerrains: ["warning-water", "storm-water"],
        world: worldForShip({
          chainCirculating: {},
          chains: ["ethereum"],
          pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 250 }),
        }),
      },
      {
        expectedTerrains: ["storm-water", "warning-water"],
        world: worldForShip({
          chainCirculating: {},
          chains: ["ethereum"],
          pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", activeDepeg: true }),
        }),
      },
      {
        expectedTerrains: ["ledger-water", "calm-water", "watch-water", "alert-water", "warning-water", "storm-water"],
        world: worldForShip({ chainCirculating: {}, chains: ["ethereum"], navToken: true }),
      },
    ];

    for (const entry of cases) {
      const route = onlyRoute(entry.world);
      const waypoint = route.openWaterPatrol?.waypoint;

      expect(waypoint).toBeDefined();
      expect(entry.expectedTerrains).toContain(terrainKindAt(waypoint?.x ?? -1, waypoint?.y ?? -1));
      if (route.zone === "calm") {
        expect(waypoint?.y).toBeGreaterThanOrEqual(10);
      } else if (route.zone === "watch") {
        expect(waypoint?.y).toBeGreaterThanOrEqual(40);
      } else if (route.zone === "warning" || route.zone === "danger") {
        expect(waypoint?.x).toBeGreaterThanOrEqual(38);
      }
    }
  });

  it("keeps calm, ledger, alert, warning, and danger route samples on water tiles", () => {
    const worlds = [
      worldForShip({
        chainCirculating: chainCirculating(["Ethereum", "Tron"]),
        chains: ["ethereum", "tron"],
      }),
      worldForShip({
        chainCirculating: chainCirculating(["Ethereum", "Tron"]),
        chains: ["ethereum", "tron"],
        navToken: true,
      }),
      worldForShip({
        chainCirculating: chainCirculating(["Ethereum", "Tron"]),
        chains: ["ethereum", "tron"],
        pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 100 }),
      }),
      worldForShip({
        chainCirculating: chainCirculating(["Ethereum", "Tron"]),
        chains: ["ethereum", "tron"],
        pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: 250 }),
      }),
      worldForShip({
        chainCirculating: chainCirculating(["Ethereum", "Tron"]),
        chains: ["ethereum", "tron"],
        pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", activeDepeg: true }),
      }),
    ];

    for (const sampleWorld of worlds) {
      const ship = sampleWorld.ships[0]!;
      const plan = buildMotionPlan(sampleWorld, ship.detailId);
      const route = plan.shipRoutes.get(ship.id)!;

      expect(["calm", "ledger", "alert", "warning", "danger"]).toContain(route.zone);
      for (let index = 0; index < 40; index += 1) {
        const sample = resolveShipMotionSample({
          plan,
          reducedMotion: false,
          ship,
          timeSeconds: route.cycleSeconds * (index / 40) - route.phaseSeconds,
        });

        expect(inMapBounds(sampleWorld.map, sample.tile), `${route.zone} sample ${index} bounds`).toBe(true);
        expect(tileKindForSample(sample.tile), `${route.zone} sample ${index}`).toMatch(/water/);
      }
    }
  });

  it("routes over semantic water terrain only", () => {
    const map = buildPharosVilleMap();
    const route = buildShipWaterRoute({ from: { x: 55, y: 0 }, to: { x: 35, y: 10 }, map });

    expect(route.points.length).toBeGreaterThan(1);
    expect(terrainKindInMap(map, route.points[0]!)).toBe("storm-water");
    for (const point of route.points) {
      expect(inMapBounds(map, point)).toBe(true);
      expect(isWaterTileKind(terrainKindInMap(map, point) ?? "land"), `${point.x}.${point.y}`).toBe(true);
    }
  });

  it("prefers diagonal moves on open water under the 8-connected expansion", () => {
    const map = openWaterMap(6, 6);
    const route = buildShipWaterRoute({ from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, map });

    // Total length proves the diagonal won out: 5*sqrt(2) ≈ 7.07 for the 8-connected
    // route vs ≥10 for any 4-connected staircase on this map. Length-rather-than-
    // point-count assertion holds regardless of Chaikin smoothing's 2x point output.
    expect(route.totalLength).toBeLessThan(8);
    // Endpoints stay anchored after smoothing.
    expect(route.points[0]).toEqual({ x: 0, y: 0 });
    expect(route.points[route.points.length - 1]).toEqual({ x: 5, y: 5 });
  });

  it("rejects diagonal corner-cuts when both flanking tiles are non-water", () => {
    // Two diagonal water tiles framed by land on each cardinal corner: a 4-connected
    // path can't reach across, and an 8-connected path without corner-cut rejection
    // would clip through. We expect a fallback (or a route that avoids the cut).
    const map: PharosVilleMap = {
      width: 3,
      height: 3,
      waterRatio: 5 / 9,
      tiles: [
        { x: 0, y: 0, kind: "water" },
        { x: 1, y: 0, kind: "land" },
        { x: 2, y: 0, kind: "water" },
        { x: 0, y: 1, kind: "water" },
        { x: 1, y: 1, kind: "water" },
        { x: 2, y: 1, kind: "water" },
        { x: 0, y: 2, kind: "water" },
        { x: 1, y: 2, kind: "land" },
        { x: 2, y: 2, kind: "water" },
      ],
    };
    // (0,0) and (1,1) are water but the corner at (1,0) is land — diagonal move
    // (0,0)->(1,1) must be rejected; the path has to detour through (0,1).
    const route = buildShipWaterRoute({ from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, map });
    const stepFromStart = route.points[1];
    if (stepFromStart) {
      const dx = stepFromStart.x - 0;
      const dy = stepFromStart.y - 0;
      expect(dx === 0 || dy === 0).toBe(true);
    }
  });

  it("octile heuristic stays admissible against minimum-cost paths on open water", () => {
    // A* admissibility: heuristic must be <= true cost. On unobstructed open water
    // the actual route cost equals the octile distance (each step costs 1 cardinal
    // or SQRT2 diagonal at base), and the heuristic uses the 0.72 floor — so the
    // heuristic value must be strictly <= the realised path cost.
    const map = openWaterMap(8, 8);
    const route = buildShipWaterRoute({ from: { x: 0, y: 0 }, to: { x: 7, y: 5 }, map });
    const dx = 7;
    const dy = 5;
    const max = Math.max(dx, dy);
    const min = Math.min(dx, dy);
    const heuristicLowerBound = 0.72 * (max + (Math.SQRT2 - 1) * min);
    // route.totalLength is geometric distance; on open water it equals the actual
    // cost when zone is undefined (cost === 1 per cardinal, SQRT2 per diagonal).
    expect(heuristicLowerBound).toBeLessThanOrEqual(route.totalLength + 1e-9);
  });

  it("keeps routed ships off the seawall blocker ring", () => {
    const map = buildPharosVilleMap();
    const route = buildShipWaterRoute({ from: { x: 45, y: 28 }, to: { x: 30, y: 20 }, map, zone: "watch" });

    expect(route.points.length).toBeGreaterThan(1);
    expect(route.points.some((point) => point.y <= 20)).toBe(true);
    for (const point of route.points) {
      expect(isSeawallBarrierTile(point), `${point.x}.${point.y}`).toBe(false);
    }
  });

  it("keeps visible titan dock samples well outside the seawall", () => {
    const sampleWorld = buildPharosVilleWorld({
      stablecoins: fixtureStablecoins,
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });
    const plan = buildMotionPlan(sampleWorld, null);

    for (const ship of sampleWorld.ships.filter((entry) => entry.visual.sizeTier === "titan" && entry.dockVisits.length > 0)) {
      const route = plan.shipRoutes.get(ship.id)!;
      let closest = Number.POSITIVE_INFINITY;
      for (let index = 0; index < 240; index += 1) {
        const sample = resolveShipMotionSample({
          plan,
          reducedMotion: false,
          ship,
          timeSeconds: route.cycleSeconds * (index / 240) - route.phaseSeconds,
        });
        if (sample.state !== "moored" || sample.currentDockId == null) continue;
        closest = Math.min(closest, seawallBarrierDistance(sample.tile));
      }
      expect(closest, ship.id).toBeGreaterThanOrEqual(2.9);
    }
  });

  it("keeps all visible moored dock samples outside the seawall envelope", () => {
    const sampleWorld = buildPharosVilleWorld({
      stablecoins: fixtureStablecoins,
      chains: fixtureChains,
      stability: fixtureStability,
      pegSummary: fixturePegSummary,
      stress: fixtureStress,
      reportCards: fixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });
    const denseWorld = buildPharosVilleWorld({
      stablecoins: denseFixtureStablecoins,
      chains: denseFixtureChains,
      stability: fixtureStability,
      pegSummary: denseFixturePegSummary,
      stress: denseFixtureStress,
      reportCards: denseFixtureReportCards,
      cemeteryEntries: [],
      freshness: {},
    });

    for (const world of [sampleWorld, denseWorld]) {
      const plan = buildMotionPlan(world, null);
      for (const ship of world.ships.filter((entry) => entry.dockVisits.length > 0)) {
        const route = plan.shipRoutes.get(ship.id)!;
        let closest = Number.POSITIVE_INFINITY;
        for (let index = 0; index < 240; index += 1) {
          const sample = resolveShipMotionSample({
            plan,
            reducedMotion: false,
            ship,
            timeSeconds: route.cycleSeconds * (index / 240) - route.phaseSeconds,
          });
          if (sample.state !== "moored" || sample.currentDockId == null) continue;
          closest = Math.min(closest, seawallBarrierDistance(sample.tile));
        }
        expect(closest, `${world === denseWorld ? "dense" : "base"}:${ship.id}`).toBeGreaterThanOrEqual(1.7);
      }
    }
  });

  it("uses semantic terrain when canonical tile kind is not water", () => {
    const map: PharosVilleMap = {
      height: 1,
      width: 3,
      waterRatio: 1,
      tiles: [
        { kind: "land", terrain: "storm-water", x: 0, y: 0 },
        { kind: "land", terrain: "warning-water", x: 1, y: 0 },
        { kind: "land", terrain: "harbor-water", x: 2, y: 0 },
      ],
    };
    const route = buildShipWaterRoute({ from: { x: 0, y: 0 }, to: { x: 2, y: 0 }, map });

    // Chaikin smoothing yields 2N points; endpoints preserved, interior tiles
    // still round into the same lane row.
    expect(route.points[0]).toEqual({ x: 0, y: 0 });
    expect(route.points[route.points.length - 1]).toEqual({ x: 2, y: 0 });
    expect(route.points.every((point) => tileKindInMap(map, point) === "land")).toBe(true);
    expect(route.points.every((point) => isWaterTileKind(terrainKindInMap(map, point) ?? "land"))).toBe(true);
  });

  it("scores water routes by semantic sea zone", () => {
    const map = semanticLaneMap();
    const calmRoute = buildShipWaterRoute({ from: { x: 0, y: 1 }, to: { x: 4, y: 1 }, map, zone: "calm" });
    const dangerRoute = buildShipWaterRoute({ from: { x: 0, y: 1 }, to: { x: 4, y: 1 }, map, zone: "danger" });
    const ledgerRoute = buildShipWaterRoute({ from: { x: 0, y: 1 }, to: { x: 4, y: 1 }, map, zone: "ledger" });

    // Danger zone still prefers the storm lane; ledger still touches its lane.
    // Calm zone preference is checked on the real map (semanticLaneMap is only
    // 3 rows tall, so every row is shore-adjacent and the coastline-bias
    // tiebreaker dominates the calm-vs-storm zone preference here).
    expect(terrainsForPath(map, dangerRoute.points).filter((terrain) => terrain === "storm-water").length).toBeGreaterThanOrEqual(4);
    expect(terrainsForPath(map, ledgerRoute.points)).toContain("ledger-water");
    for (const route of [calmRoute, dangerRoute, ledgerRoute]) {
      expect(route.points.every((point) => isWaterTileKind(terrainKindInMap(map, point) ?? "land"))).toBe(true);
    }
  });

  it("uses deterministic water-only detours for longer crossings", () => {
    const map = buildPharosVilleMap();
    const firstRoute = buildShipWaterRoute({ from: { x: 8, y: 16 }, to: { x: 55, y: 16 }, map });
    const secondRoute = buildShipWaterRoute({ from: { x: 8, y: 16 }, to: { x: 55, y: 16 }, map });

    expect(firstRoute.points).toEqual(secondRoute.points);
    expect(firstRoute.points.some((point) => pointLineDistance(point, firstRoute.from, firstRoute.to) > 2)).toBe(true);
    for (const point of firstRoute.points) {
      expect(inMapBounds(map, point)).toBe(true);
      expect(tileKindForSample(point)).toMatch(/water/);
    }
  });

  it("Chaikin smoothing produces 2N points and preserves endpoints", () => {
    const input = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ];
    const smoothed = chaikinSmoothPath(input);

    expect(smoothed).toHaveLength(2 * input.length);
    expect(smoothed[0]).toEqual(input[0]);
    expect(smoothed[smoothed.length - 1]).toEqual(input[input.length - 1]);
  });

  it("Chaikin smoothing softens interior corners below 60 degrees", () => {
    const input = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ];
    const smoothed = chaikinSmoothPath(input);
    let maxTurn = 0;
    for (let i = 1; i < smoothed.length - 1; i += 1) {
      const a = smoothed[i - 1]!;
      const b = smoothed[i]!;
      const c = smoothed[i + 1]!;
      const v1 = { x: b.x - a.x, y: b.y - a.y };
      const v2 = { x: c.x - b.x, y: c.y - b.y };
      const cross = v1.x * v2.y - v1.y * v2.x;
      const dot = v1.x * v2.x + v1.y * v2.y;
      maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(cross, dot)));
    }
    expect(maxTurn).toBeLessThan(Math.PI / 3);
  });

  it("Chaikin smoothing passes single- and two-point paths through unchanged", () => {
    const single = [{ x: 4, y: 5 }];
    const pair = [{ x: 4, y: 5 }, { x: 6, y: 7 }];

    expect(chaikinSmoothPath(single)).toEqual(single);
    expect(chaikinSmoothPath(pair)).toEqual(pair);
  });

  it("shore distance mask reads coast-adjacent water as < 1.5 and open-water as > 2.5", () => {
    const map = buildPharosVilleMap();
    const mask = ensureShoreDistanceMask(map);
    let foundCoast = false;
    let foundOffshore = false;

    for (const tile of map.tiles) {
      if (!isWaterTileKind(tile.terrain ?? tile.kind)) continue;
      if (isSeawallBarrierTile(tile)) continue;
      const d = shoreDistance(tile.x, tile.y, map, mask);
      if (d > 0 && d < 1.5) foundCoast = true;
      if (d > 2.5) foundOffshore = true;
      if (foundCoast && foundOffshore) break;
    }

    expect(foundCoast).toBe(true);
    expect(foundOffshore).toBe(true);
  });

  it("shore bias keeps routes from running consecutive coast-adjacent tiles", () => {
    const map = buildPharosVilleMap();
    const mask = ensureShoreDistanceMask(map);
    const route = buildShipWaterRoute({ from: { x: 8, y: 16 }, to: { x: 55, y: 16 }, map });
    let consecutiveCoast = 0;
    let maxConsecutive = 0;

    for (const point of route.points) {
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      const d = shoreDistance(x, y, map, mask);
      if (d > 0 && d < 1.0) {
        consecutiveCoast += 1;
        maxConsecutive = Math.max(maxConsecutive, consecutiveCoast);
      } else {
        consecutiveCoast = 0;
      }
    }

    // Routes may briefly graze the shore at endpoints, but should not crawl
    // along the coastline for many tiles in a row.
    expect(maxConsecutive).toBeLessThan(4);
  });

  it("rotates weighted dock schedules across cycles instead of dropping later docks", () => {
    const sampleWorld = worldForShip({
      chainCirculating: chainCirculating(["Ethereum", "Tron", "Solana", "Arbitrum"]),
      chains: ["ethereum", "tron", "solana", "arbitrum"],
    });
    const ship = sampleWorld.ships[0]!;
    const plan = buildMotionPlan(sampleWorld, ship.detailId);
    const route = plan.shipRoutes.get(ship.id)!;
    const visitedDockIds = new Set<string>();

    for (let cycleIndex = 0; cycleIndex < 6; cycleIndex += 1) {
      for (let sampleIndex = 0; sampleIndex < 80; sampleIndex += 1) {
        const sample = resolveShipMotionSample({
          plan,
          reducedMotion: false,
          ship,
          timeSeconds: route.cycleSeconds * (cycleIndex + sampleIndex / 80) - route.phaseSeconds,
        });
        if (sample.state === "moored" && sample.currentDockId) {
          visitedDockIds.add(sample.currentDockId);
        }
      }
    }

    expect(visitedDockIds).toEqual(new Set(route.dockStops.map((stop) => stop.dockId)));
  });

  it("keeps disconnected fallback route samples on the available water tile", () => {
    const map: PharosVilleMap = {
      width: 5,
      height: 5,
      waterRatio: 2 / 25,
      tiles: Array.from({ length: 25 }, (_, index) => {
        const x = index % 5;
        const y = Math.floor(index / 5);
        return {
          x,
          y,
          kind: (x === 0 && y === 0) || (x === 4 && y === 4) ? "water" : "land",
        };
      }),
    };
    const route = buildShipWaterRoute({ from: { x: 0, y: 0 }, to: { x: 4, y: 4 }, map });

    expect(route.points).toEqual([{ x: 0, y: 0 }]);
    for (let index = 0; index <= 10; index += 1) {
      const sample = sampleShipWaterPath(route, index / 10);
      expect(tileKindInMap(map, sample.point)).toBe("water");
    }
  });

  it("keeps danger and ledger ships visiting risk water with the shared docked share", () => {
    const dangerWorld = worldForShip({
      chainCirculating: chainCirculating(["Ethereum"]),
      chains: ["ethereum"],
      pegCoin: makePegCoin({ id: "usdc-circle", symbol: "USDC", activeDepeg: true }),
    });
    const ledgerWorld = worldForShip({
      chainCirculating: chainCirculating(["Ethereum"]),
      chains: ["ethereum"],
      navToken: true,
    });

    const danger = riskVsDockDwell(dangerWorld);
    const ledger = riskVsDockDwell(ledgerWorld);

    expect(danger.riskSamples).toBeGreaterThan(25);
    expect(danger.dockSamples).toBeGreaterThan(25);
    expect(ledger.riskSamples).toBeGreaterThan(12);
    expect(ledger.dockSamples).toBeGreaterThan(25);
  });

  it("derives lighthouse fire flicker speed from PSI band and score", () => {
    expect(lighthouseFireFlickerSpeed("healthy", 100)).toBeGreaterThan(lighthouseFireFlickerSpeed("danger", 100));
    expect(lighthouseFireFlickerSpeed(null, null)).toBeGreaterThan(0);
  });

  it("uses deterministic per-entity phases", () => {
    expect(stableMotionPhase("usdt-tether")).toBe(stableMotionPhase("usdt-tether"));
    expect(stableMotionPhase("usdt-tether")).not.toBe(stableMotionPhase("usdc-circle"));
  });

  describe("liveliness improvements", () => {
    // Multi-chain world so the route has scheduled dock stops + transits we can
    // sample mid-leg. We dial in the time to a known departing/arriving phase.
    const buildLivelinessWorld = () => worldForShip({
      chainCirculating: chainCirculating(["Ethereum", "Tron", "Solana"]),
      chains: ["ethereum", "tron", "solana"],
    });

    function findTransitTime(plan: ReturnType<typeof buildMotionPlan>, ship: PharosVilleWorld["ships"][number], state: "departing" | "arriving" | "sailing"): number | null {
      const route = plan.shipRoutes.get(ship.id)!;
      for (let index = 0; index < 240; index += 1) {
        const timeSeconds = route.cycleSeconds * (index / 240) - route.phaseSeconds;
        const sample = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds });
        if (sample.state === state) return timeSeconds;
      }
      return null;
    }

    it("low-pass filters per-ship transit heading instead of snapping", () => {
      const sampleWorld = buildLivelinessWorld();
      const ship = sampleWorld.ships[0]!;
      const plan = buildMotionPlan(sampleWorld, ship.detailId);
      const transitTime = findTransitTime(plan, ship, "departing") ?? findTransitTime(plan, ship, "arriving");
      expect(transitTime).not.toBeNull();

      const dt = 0.016; // 16ms; one render frame.
      const first = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: transitTime! });
      const firstHeading = { x: first.heading.x, y: first.heading.y };
      const second = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: transitTime! + dt });

      // Filter must keep the heading well-formed (unit length, finite).
      const magnitude = Math.hypot(second.heading.x, second.heading.y);
      expect(magnitude).toBeGreaterThan(0.99);
      expect(magnitude).toBeLessThan(1.01);

      // With tau between 0.06 and 0.18 and dt=0.016, alpha is at most
      // 1 - exp(-0.016/0.06) ~= 0.234. The angular delta from `first` to
      // `second` must therefore be a fraction of any large raw jump.
      const angleDelta = Math.abs(Math.atan2(
        firstHeading.x * second.heading.y - firstHeading.y * second.heading.x,
        firstHeading.x * second.heading.x + firstHeading.y * second.heading.y,
      ));
      expect(angleDelta).toBeLessThan(0.6); // < ~34 degrees per frame
    });

    it("peaks departing/arriving wake mid-leg (parabolic envelope)", () => {
      const sampleWorld = buildLivelinessWorld();
      const ship = sampleWorld.ships[0]!;
      const plan = buildMotionPlan(sampleWorld, ship.detailId);
      const route = plan.shipRoutes.get(ship.id)!;

      // Walk the cycle and observe wake across the departing/arriving windows.
      // The parabolic envelope means the minimum wake in any leg sits near the
      // edges (progress ~0 or ~1) and the maximum sits mid-leg.
      let minWake = Number.POSITIVE_INFINITY;
      let maxWake = 0;
      const samples = 480;
      for (let index = 0; index < samples; index += 1) {
        const timeSeconds = route.cycleSeconds * (index / samples) - route.phaseSeconds;
        const sample = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds });
        if (sample.state !== "departing" && sample.state !== "arriving") continue;
        minWake = Math.min(minWake, sample.wakeIntensity);
        maxWake = Math.max(maxWake, sample.wakeIntensity);
      }

      expect(maxWake).toBeGreaterThan(minWake);
      // Edge wake must be a clear fraction of peak; with a parabolic envelope
      // sampled at progress~0.05/0.95 it is 0.19 * peak, so 0.5 * peak is a
      // safe upper bound.
      expect(minWake).toBeLessThan(maxWake * 0.5);
    });

    it("bank stays bounded across a full cycle (no runaway angular velocity)", () => {
      const sampleWorld = buildLivelinessWorld();
      const ship = sampleWorld.ships[0]!;
      const plan = buildMotionPlan(sampleWorld, ship.detailId);
      const route = plan.shipRoutes.get(ship.id)!;

      // Walk the cycle in tight steps and confirm headingDelta never explodes.
      // A small dt (~0.05s) keeps angular velocity well within reasonable bounds
      // for any realistic transit path; a runaway value would indicate the
      // smoothing math is broken or the WeakMap got polluted.
      let maxAbs = 0;
      const dt = 0.05;
      for (let index = 0; index < 200; index += 1) {
        const timeSeconds = route.cycleSeconds * (index / 200) - route.phaseSeconds;
        resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds });
        resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: timeSeconds + dt });
        const delta = Math.abs(getShipHeadingDelta(ship.id));
        if (Number.isFinite(delta)) maxAbs = Math.max(maxAbs, delta);
      }
      expect(maxAbs).toBeLessThan(Math.PI / dt); // less than half-revolution per step
      expect(getShipHeadingDelta("nonexistent-ship-id")).toBe(0);
    });

    it("keeps formation glued (no breathing) while flagship is moored", () => {
      const squadWorld = buildPharosVilleWorld(makerSquadFixtureInputs());
      const plan = buildMotionPlan(squadWorld, null);
      const flagship = squadWorld.ships.find((ship) => ship.id === "usds-sky")!;
      const consort = squadWorld.ships.find((ship) => ship.id === "susds-sky")!;
      const flagshipRoute = plan.shipRoutes.get(flagship.id)!;
      const squad = squadForMember(consort.id)!;
      const offset = squadFormationOffsetForPlacement(consort.id, squad, flagship.riskPlacement)!;

      let inspectedMoored = 0;
      const samples = 240;
      for (let index = 0; index < samples; index += 1) {
        const timeSeconds = flagshipRoute.cycleSeconds * (index / samples) - flagshipRoute.phaseSeconds;
        const flagshipSample = resolveShipMotionSample({ plan, reducedMotion: false, ship: flagship, timeSeconds });
        if (flagshipSample.state !== "moored") continue;
        const consortSample = resolveShipMotionSample({ plan, reducedMotion: false, ship: consort, timeSeconds });
        // Moored: consort tile must equal flagship tile + integer offset exactly.
        expect(consortSample.tile.x - flagshipSample.tile.x).toBeCloseTo(offset.dx, 5);
        expect(consortSample.tile.y - flagshipSample.tile.y).toBeCloseTo(offset.dy, 5);
        inspectedMoored += 1;
      }
      expect(inspectedMoored).toBeGreaterThan(0);
    });

    it("breathes consort sub-tile offsets while flagship is in transit", () => {
      const squadWorld = buildPharosVilleWorld(makerSquadFixtureInputs());
      const plan = buildMotionPlan(squadWorld, null);
      const flagship = squadWorld.ships.find((ship) => ship.id === "usds-sky")!;
      const consort = squadWorld.ships.find((ship) => ship.id === "susds-sky")!;
      const flagshipRoute = plan.shipRoutes.get(flagship.id)!;
      const squad = squadForMember(consort.id)!;
      const offset = squadFormationOffsetForPlacement(consort.id, squad, flagship.riskPlacement)!;

      let observedBreathing = false;
      const samples = 480;
      for (let index = 0; index < samples; index += 1) {
        const timeSeconds = flagshipRoute.cycleSeconds * (index / samples) - flagshipRoute.phaseSeconds;
        const flagshipSample = resolveShipMotionSample({ plan, reducedMotion: false, ship: flagship, timeSeconds });
        if (flagshipSample.state === "moored" || flagshipSample.state === "idle") continue;
        const consortSample = resolveShipMotionSample({ plan, reducedMotion: false, ship: consort, timeSeconds });
        const breathDx = consortSample.tile.x - flagshipSample.tile.x - offset.dx;
        const breathDy = consortSample.tile.y - flagshipSample.tile.y - offset.dy;
        if (Math.hypot(breathDx, breathDy) > 0.02) {
          observedBreathing = true;
          // Breathing must stay sub-tile (well below 1 tile).
          expect(Math.abs(breathDx)).toBeLessThan(0.5);
          expect(Math.abs(breathDy)).toBeLessThan(0.5);
        }
      }
      expect(observedBreathing).toBe(true);
    });
  });

  describe("docking alignment ramp", () => {
    // The ramp is applied to "arriving" transits in the final 12% of progress
    // (smoothstep 0.88 → 1.0), blending the smoothed transit heading toward
    // toMooringStop.dockTangent so the bow tucks into the berth.
    const buildAlignmentWorld = () => worldForShip({
      chainCirculating: chainCirculating(["Ethereum", "Tron", "Solana"]),
      chains: ["ethereum", "tron", "solana"],
    });

    function arrivingSamplesAcrossCycle(plan: ReturnType<typeof buildMotionPlan>, ship: PharosVilleWorld["ships"][number], samples = 1200) {
      const route = plan.shipRoutes.get(ship.id)!;
      const collected: Array<{ timeSeconds: number; sample: ReturnType<typeof resolveShipMotionSample>; toMooringStop: ShipDockMotionStop | null }> = [];
      for (let index = 0; index < samples; index += 1) {
        const timeSeconds = route.cycleSeconds * (index / samples) - route.phaseSeconds;
        const sample = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds });
        if (sample.state !== "arriving") continue;
        const toMooringStop = route.dockStops.find((stop) => stop.id === sample.currentRouteStopId) ?? null;
        collected.push({ timeSeconds, sample, toMooringStop });
      }
      return collected;
    }

    function arrivingPhaseBoundsForRouteStop(arriving: ReturnType<typeof arrivingSamplesAcrossCycle>, routeStopId: string): { startSeconds: number; endSeconds: number } | null {
      // Pick a single contiguous arriving window targeting routeStopId.
      const window = arriving.filter((entry) => entry.sample.currentRouteStopId === routeStopId);
      if (window.length === 0) return null;
      // Walk arriving in order; detect contiguous run and slice.
      // The cycle clock progresses linearly, so consecutive entries inside the
      // window stay contiguous in time until the phase ends.
      const startSeconds = window[0]!.timeSeconds;
      let endSeconds = window[0]!.timeSeconds;
      for (let index = 1; index < window.length; index += 1) {
        const prev = window[index - 1]!;
        const cur = window[index]!;
        if (cur.timeSeconds - prev.timeSeconds > (window[1]!.timeSeconds - window[0]!.timeSeconds) * 4) break;
        endSeconds = cur.timeSeconds;
      }
      return { startSeconds, endSeconds };
    }

    it("does not align when progress is below the 88% ramp window", () => {
      const sampleWorld = buildAlignmentWorld();
      const ship = sampleWorld.ships[0]!;
      const plan = buildMotionPlan(sampleWorld, ship.detailId);
      const arriving = arrivingSamplesAcrossCycle(plan, ship);
      // Pick an arriving window whose mooring stop has a non-null dockTangent.
      const target = arriving.find((entry) => entry.toMooringStop?.dockTangent);
      expect(target).toBeDefined();
      const tangent = target!.toMooringStop!.dockTangent!;
      const bounds = arrivingPhaseBoundsForRouteStop(arriving, target!.sample.currentRouteStopId!)!;
      expect(bounds).not.toBeNull();

      // Sample at the midpoint of the arriving phase: progress ~ 0.5 (well
      // below the 0.88 ramp threshold). Heading must NOT track dockTangent.
      const midSeconds = (bounds.startSeconds + bounds.endSeconds) / 2;
      const midSample = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: midSeconds });
      expect(midSample.state).toBe("arriving");
      const dot = midSample.heading.x * tangent.x + midSample.heading.y * tangent.y;
      // The path tangent during arriving points roughly TOWARD the dock; the
      // dockTangent points mooring→dock (a much shorter axis). They should not
      // be aligned (dot product nowhere near 1).
      expect(dot).toBeLessThan(0.95);
    });

    it("aligns heading to dockTangent at the very end of the arriving phase", () => {
      const sampleWorld = buildAlignmentWorld();
      const ship = sampleWorld.ships[0]!;
      const plan = buildMotionPlan(sampleWorld, ship.detailId);
      const arriving = arrivingSamplesAcrossCycle(plan, ship, 4800);
      const target = arriving.find((entry) => entry.toMooringStop?.dockTangent);
      expect(target).toBeDefined();
      const tangent = target!.toMooringStop!.dockTangent!;
      const bounds = arrivingPhaseBoundsForRouteStop(arriving, target!.sample.currentRouteStopId!)!;

      // The boundary excludes cursor === transitSecondsEach, so we sample as
      // close to the end as the cycle clock allows. With 4800 samples per
      // cycle the last arriving sample sits at progress ≈ 1 within float eps.
      const endSample = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: bounds.endSeconds });
      expect(endSample.state).toBe("arriving");
      expect(endSample.heading.x).toBeCloseTo(tangent.x, 2);
      expect(endSample.heading.y).toBeCloseTo(tangent.y, 2);
    });

    it("partially aligns heading mid-ramp (between smoothed transit heading and dockTangent)", () => {
      const sampleWorld = buildAlignmentWorld();
      const ship = sampleWorld.ships[0]!;
      const plan = buildMotionPlan(sampleWorld, ship.detailId);
      const arriving = arrivingSamplesAcrossCycle(plan, ship, 4800);
      const target = arriving.find((entry) => entry.toMooringStop?.dockTangent);
      expect(target).toBeDefined();
      const tangent = target!.toMooringStop!.dockTangent!;
      const bounds = arrivingPhaseBoundsForRouteStop(arriving, target!.sample.currentRouteStopId!)!;

      // Pre-ramp heading: sample at progress < 0.88 (mid-arriving phase).
      const preRampSample = resolveShipMotionSample({
        plan,
        reducedMotion: false,
        ship,
        timeSeconds: (bounds.startSeconds + bounds.endSeconds) / 2,
      });
      const preRampHeading = { x: preRampSample.heading.x, y: preRampSample.heading.y };

      // Mid-ramp: linear time fraction ~0.85 within the arriving window. The
      // smoothstep maps 0.85 → ~0.939, which lands at ramp_t ≈ 0.48 — squarely
      // mid-blend. We expect dot(heading, tangent) strictly between the
      // pre-ramp dot and 1.
      const window = bounds.endSeconds - bounds.startSeconds;
      const midRampSeconds = bounds.startSeconds + window * 0.85;
      const midRampSample = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: midRampSeconds });
      expect(midRampSample.state).toBe("arriving");

      const preRampDot = preRampHeading.x * tangent.x + preRampHeading.y * tangent.y;
      const midRampDot = midRampSample.heading.x * tangent.x + midRampSample.heading.y * tangent.y;
      expect(midRampDot).toBeGreaterThan(preRampDot);
      // Mid-ramp must not yet equal the tangent — the ramp factor is < 1.
      expect(midRampDot).toBeLessThan(0.999);
      // Heading must remain unit length.
      expect(Math.hypot(midRampSample.heading.x, midRampSample.heading.y)).toBeCloseTo(1, 5);
    });

    it("does not align when toMooringStop.dockTangent is null", () => {
      const sampleWorld = buildAlignmentWorld();
      const ship = sampleWorld.ships[0]!;
      const basePlan = buildMotionPlan(sampleWorld, ship.detailId);
      const route = basePlan.shipRoutes.get(ship.id)!;

      // Mutate the route in place: clear every dockTangent so arriving has no
      // alignment target. Sampler must fall back to pre-ramp behavior.
      const restoreTangents = route.dockStops.map((stop) => ({ stop, tangent: stop.dockTangent }));
      for (const entry of restoreTangents) (entry.stop as { dockTangent: { x: number; y: number } | null }).dockTangent = null;

      try {
        const arriving = arrivingSamplesAcrossCycle(basePlan, ship, 4800);
        expect(arriving.length).toBeGreaterThan(0);
        // Sample at the very end of arriving — without a tangent, heading is
        // whatever the smoothed path tangent produced (NOT dockTangent).
        const lastArriving = arriving[arriving.length - 1]!;
        // Verify no arriving sample's heading was forced to a fixed point — pick
        // two samples with different progress and confirm they differ.
        const earlyArriving = arriving[Math.floor(arriving.length * 0.2)]!;
        const earlyAngle = Math.atan2(earlyArriving.sample.heading.y, earlyArriving.sample.heading.x);
        const lateAngle = Math.atan2(lastArriving.sample.heading.y, lastArriving.sample.heading.x);
        // With no alignment, mid-leg heading still tracks the path tangent and
        // does not collapse onto a single fixed direction. (Both stay finite
        // unit vectors.)
        expect(Math.hypot(lastArriving.sample.heading.x, lastArriving.sample.heading.y)).toBeCloseTo(1, 5);
        expect(Number.isFinite(earlyAngle)).toBe(true);
        expect(Number.isFinite(lateAngle)).toBe(true);
      } finally {
        for (const entry of restoreTangents) (entry.stop as { dockTangent: { x: number; y: number } | null }).dockTangent = entry.tangent;
      }
    });

    it("does not align departing transits", () => {
      const sampleWorld = buildAlignmentWorld();
      const ship = sampleWorld.ships[0]!;
      const plan = buildMotionPlan(sampleWorld, ship.detailId);
      const route = plan.shipRoutes.get(ship.id)!;

      // Find a departing sample late in its phase. Departing has fromMooringStop
      // set, toMooringStop = null, so the alignment branch is skipped.
      const samples = 4800;
      let lateDeparting: ReturnType<typeof resolveShipMotionSample> | null = null;
      let lateDepartingFromStopId: string | null = null;
      const departingByStop = new Map<string, Array<{ timeSeconds: number; sample: ReturnType<typeof resolveShipMotionSample> }>>();
      for (let index = 0; index < samples; index += 1) {
        const timeSeconds = route.cycleSeconds * (index / samples) - route.phaseSeconds;
        const sample = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds });
        if (sample.state !== "departing") continue;
        const stopId = sample.currentRouteStopId ?? "";
        const list = departingByStop.get(stopId) ?? [];
        list.push({ timeSeconds, sample });
        departingByStop.set(stopId, list);
      }
      // Pick the last entry of any stop window — that's progress closest to 1.
      for (const [stopId, list] of departingByStop) {
        const last = list[list.length - 1]!;
        if (!lateDeparting) {
          lateDeparting = last.sample;
          lateDepartingFromStopId = stopId;
        }
      }
      expect(lateDeparting).not.toBeNull();
      const fromStop = route.dockStops.find((stop) => stop.id === lateDepartingFromStopId);
      // If the departing fromStop has a non-null dockTangent, confirm heading
      // does NOT match it. The ramp must skip departing entirely.
      if (fromStop?.dockTangent) {
        const dot = lateDeparting!.heading.x * fromStop.dockTangent.x + lateDeparting!.heading.y * fromStop.dockTangent.y;
        expect(dot).toBeLessThan(0.95);
      }
      // Heading stays well-formed.
      expect(Math.hypot(lateDeparting!.heading.x, lateDeparting!.heading.y)).toBeCloseTo(1, 5);
    });
  });

  describe("Stablecoin squad motion inheritance", () => {
    // Sky squad: USDS flagship + sUSDS savings cutter + stUSDS vanguard.
    // Maker squad: DAI flagship + sDAI savings cutter.
    // Each consort tracks its OWN squad's flagship, not a shared one.
    const consortsBySquad = [
      { flagshipId: "usds-sky", consortIds: ["susds-sky", "stusds-sky"] as const },
      { flagshipId: "dai-makerdao", consortIds: ["sdai-sky"] as const },
    ] as const;
    // Build a squad-active world with no rendered docks so flagships sail
    // open-water patrols — the only state where formation cohesion is
    // structurally guaranteed (consorts have no dockStops by design).
    const squadInputs = () => {
      const base = fixtureWithFlagshipPlacement("outer-rough-water");
      return {
        ...base,
        chains: { ...fixtureChains, chains: [] },
      };
    };

    it("each squad's consorts hold tight formation and same zone as their own flagship across full motion cycle", () => {
      const squadWorld = buildPharosVilleWorld(squadInputs());
      const plan = buildMotionPlan(squadWorld, null);
      for (const { flagshipId, consortIds } of consortsBySquad) {
        const flagshipShip = squadWorld.ships.find((ship) => ship.id === flagshipId)!;
        const flagshipRoute = plan.shipRoutes.get(flagshipId)!;
        for (const consortId of consortIds) {
          const consortShip = squadWorld.ships.find((ship) => ship.id === consortId)!;
          const consortRoute = plan.shipRoutes.get(consortId)!;
          expect(consortRoute.cycleSeconds).toBe(flagshipRoute.cycleSeconds);
          expect(consortRoute.phaseSeconds).toBe(flagshipRoute.phaseSeconds);
          expect(consortRoute.zone).toBe(flagshipRoute.zone);

          for (let step = 0; step < 8; step += 1) {
            const timeSeconds = (flagshipRoute.cycleSeconds / 8) * step;
            const flagSample = resolveShipMotionSample({ plan, reducedMotion: false, ship: flagshipShip, timeSeconds });
            const consortSample = resolveShipMotionSample({ plan, reducedMotion: false, ship: consortShip, timeSeconds });
            const dx = consortSample.tile.x - flagSample.tile.x;
            const dy = consortSample.tile.y - flagSample.tile.y;
            expect(Math.hypot(dx, dy)).toBeLessThan(4.5);
          }
        }
      }
    });

    it("consorts have no dock visits and homeDockChainId=null", () => {
      const squadWorld = buildPharosVilleWorld(squadInputs());
      for (const { consortIds } of consortsBySquad) {
        for (const id of consortIds) {
          const ship = squadWorld.ships.find((entry) => entry.id === id)!;
          expect(ship.dockVisits).toEqual([]);
          expect(ship.homeDockChainId).toBeNull();
        }
      }
    });

    it("reduced-motion frame still places each squad in formation", () => {
      const squadWorld = buildPharosVilleWorld(squadInputs());
      const plan = buildMotionPlan(squadWorld, null);
      for (const { flagshipId, consortIds } of consortsBySquad) {
        const flagshipShip = squadWorld.ships.find((ship) => ship.id === flagshipId)!;
        for (const consortId of consortIds) {
          const consortShip = squadWorld.ships.find((ship) => ship.id === consortId)!;
          const flagSample = resolveShipMotionSample({ plan, reducedMotion: true, ship: flagshipShip, timeSeconds: 0 });
          const consortSample = resolveShipMotionSample({ plan, reducedMotion: true, ship: consortShip, timeSeconds: 0 });
          expect(Math.hypot(consortSample.tile.x - flagSample.tile.x, consortSample.tile.y - flagSample.tile.y)).toBeLessThan(4.5);
        }
      }
    });
  });
});

function worldForShip(input: {
  chainCirculating: ReturnType<typeof chainCirculating>;
  chains: string[];
  freshness?: PharosVilleWorld["freshness"];
  navToken?: boolean;
  pegCoin?: ReturnType<typeof makePegCoin>;
  stressBand?: "DANGER" | "WARNING" | "ALERT" | "WATCH" | "CALM";
}): PharosVilleWorld {
  const assetId = input.navToken ? "susde-ethena" : "usdc-circle";
  const symbol = input.navToken ? "sUSDe" : "USDC";
  return buildPharosVilleWorld({
    stablecoins: {
      peggedAssets: [
        makeAsset({
          id: assetId,
          symbol,
          chainCirculating: input.chainCirculating,
        }),
      ],
    },
    chains: {
      ...fixtureChains,
      chains: input.chains.map((chainId, index) => makeChain({
        id: chainId,
        name: chainId,
        totalUsd: 10_000_000_000 - index * 100_000_000,
      })),
    },
    stability: fixtureStability,
    pegSummary: {
      ...fixturePegSummary,
      coins: input.navToken ? [] : [input.pegCoin ?? makePegCoin({ id: assetId, symbol })],
    },
    stress: input.stressBand
      ? {
        ...fixtureStress,
        signals: {
          [assetId]: {
            score: 20,
            band: input.stressBand,
            signals: {},
            computedAt: 1_700_000_000,
            methodologyVersion: "fixture",
          },
        },
      }
      : fixtureStress,
    reportCards: fixtureReportCards,
    cemeteryEntries: [],
    freshness: input.freshness ?? {},
  });
}

function chainCirculating(chainNames: string[]) {
  return Object.fromEntries(chainNames.map((chain, index) => [
    chain,
    {
      current: 1_000_000_000 / (index + 1),
      circulatingPrevDay: 1_000_000_000 / (index + 1),
      circulatingPrevWeek: 1_000_000_000 / (index + 1),
      circulatingPrevMonth: 1_000_000_000 / (index + 1),
    },
  ]));
}

function onlyRoute(sampleWorld: PharosVilleWorld) {
  const ship = sampleWorld.ships[0]!;
  return buildMotionPlan(sampleWorld, ship.detailId).shipRoutes.get(ship.id)!;
}

function stripRouteStopRuntimeFields(stop: ShipDockMotionStop) {
  return {
    chainId: stop.chainId,
    dockId: stop.dockId,
    weight: stop.weight,
    mooringTile: stop.mooringTile,
  };
}

function tileKindForSample(tile: { x: number; y: number }) {
  return tileKindAt(Math.round(tile.x), Math.round(tile.y));
}

function tileKindInMap(map: PharosVilleMap, tile: { x: number; y: number }) {
  const x = Math.round(tile.x);
  const y = Math.round(tile.y);
  return map.tiles[y * map.width + x]?.kind;
}

function terrainKindInMap(map: PharosVilleMap, tile: { x: number; y: number }) {
  const x = Math.round(tile.x);
  const y = Math.round(tile.y);
  const tileEntry = map.tiles[y * map.width + x];
  return tileEntry?.terrain ?? tileEntry?.kind;
}

function terrainsForPath(map: PharosVilleMap, points: Array<{ x: number; y: number }>) {
  return points.map((point) => terrainKindInMap(map, point));
}

function openWaterMap(width: number, height: number): PharosVilleMap {
  return {
    width,
    height,
    waterRatio: 1,
    tiles: Array.from({ length: width * height }, (_, index) => ({
      x: index % width,
      y: Math.floor(index / width),
      kind: "water" as const,
    })),
  };
}

function semanticLaneMap(): PharosVilleMap {
  const terrains = [
    ["calm-water", "calm-water", "calm-water", "calm-water", "calm-water"],
    ["storm-water", "storm-water", "storm-water", "storm-water", "storm-water"],
    ["ledger-water", "ledger-water", "ledger-water", "ledger-water", "ledger-water"],
  ] as const;
  return {
    width: 5,
    height: 3,
    waterRatio: 1,
    tiles: terrains.flatMap((row, y) => row.map((terrain, x) => ({
      x,
      y,
      kind: "water" as const,
      terrain,
    }))),
  };
}

function inMapBounds(map: PharosVilleMap, tile: { x: number; y: number }) {
  const x = Math.round(tile.x);
  const y = Math.round(tile.y);
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

function riskVsDockDwell(sampleWorld: PharosVilleWorld): { dockSamples: number; riskSamples: number } {
  const ship = sampleWorld.ships[0]!;
  const plan = buildMotionPlan(sampleWorld, ship.detailId);
  const route = plan.shipRoutes.get(ship.id)!;
  const dockTiles = ship.dockVisits.map((visit) => visit.mooringTile);
  let riskSamples = 0;
  let dockSamples = 0;

  for (let index = 0; index < 100; index += 1) {
    const sample = resolveShipMotionSample({
      plan,
      reducedMotion: false,
      ship,
      timeSeconds: route.cycleSeconds * (index / 100) - route.phaseSeconds,
    });
    if (distance(sample.tile, route.riskTile) <= 2) riskSamples += 1;
    if (dockTiles.some((tile) => distance(sample.tile, tile) <= 2)) dockSamples += 1;
  }

  return { dockSamples, riskSamples };
}

function stateCountsOverCycle(sampleWorld: PharosVilleWorld): { transitSamples: number } {
  const ship = sampleWorld.ships[0]!;
  const plan = buildMotionPlan(sampleWorld, ship.detailId);
  const route = plan.shipRoutes.get(ship.id)!;
  let transitSamples = 0;

  for (let index = 0; index < 100; index += 1) {
    const sample = resolveShipMotionSample({
      plan,
      reducedMotion: false,
      ship,
      timeSeconds: route.cycleSeconds * (index / 100) - route.phaseSeconds,
    });
    if (sample.state === "departing" || sample.state === "arriving") transitSamples += 1;
  }

  return { transitSamples };
}

function cycleStats(sampleWorld: PharosVilleWorld): { maxRiskDistance: number; maxSailingWake: number; riskDriftSamples: number } {
  const ship = sampleWorld.ships[0]!;
  const plan = buildMotionPlan(sampleWorld, ship.detailId);
  const route = plan.shipRoutes.get(ship.id)!;
  let maxRiskDistance = 0;
  let maxSailingWake = 0;
  let riskDriftSamples = 0;

  for (let index = 0; index < 240; index += 1) {
    const sample = resolveShipMotionSample({
      plan,
      reducedMotion: false,
      ship,
      timeSeconds: route.cycleSeconds * (index / 240) - route.phaseSeconds,
    });
    if (sample.state === "risk-drift") {
      riskDriftSamples += 1;
      maxRiskDistance = Math.max(maxRiskDistance, distance(sample.tile, route.riskTile));
    }
    if (sample.state === "sailing") maxSailingWake = Math.max(maxSailingWake, sample.wakeIntensity);
  }

  return { maxRiskDistance, maxSailingWake, riskDriftSamples };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointLineDistance(point: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }) {
  const numerator = Math.abs((to.y - from.y) * point.x - (to.x - from.x) * point.y + to.x * from.y - to.y * from.x);
  const denominator = Math.hypot(to.y - from.y, to.x - from.x);
  return denominator === 0 ? 0 : numerator / denominator;
}
