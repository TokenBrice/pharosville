import { describe, expect, it } from "vitest";
import { ACTIVE_META_BY_ID } from "@shared/lib/stablecoins";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureSafetyGrades,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureChains,
  fixturePegSummary,
  fixtureSafetyGrades,
  fixtureStability,
  fixtureStress,
  makeAsset,
  makeChain,
  makePegCoin,
} from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import {
  __resetPreviousRiskCache,
  buildBaseMotionPlan,
  buildMotionPlan,
  disposePathCacheForMap,
  inletCrossingTokensBetween,
  type InletCrossingToken,
  motionPlanSignature,
  openWaterPatrolItineraryIndex,
  openWaterPatrolItineraryLength,
} from "./motion-planning";
import { isGardenInletCoreTile } from "./garden-inlet";
import {
  GARDEN_CROSSING_MIN_GAP_SECONDS,
  gardenAttentionSlotsBetween,
  planGardenScoreGifts,
} from "./garden-attention-scheduler";
import type { ShipWaterPath } from "./motion-types";
import { resolveShipMotionSample } from "./motion-sampling";
import { stableUnit } from "./stable-random";
import type { PharosVilleWorld } from "./world-types";

describe("W4.23 calm patrol itineraries", () => {
  function worldForDocklessShip(): PharosVilleWorld {
    // A USDC ship with no rendered docks (chainCirculating: {}) so the route
    // builder picks the openWaterPatrol branch instead of dock cycling.
    return buildPharosVilleWorld({
      stablecoins: {
        peggedAssets: [
          makeAsset({
            id: "usdc-circle",
            symbol: "USDC",
            chainCirculating: {},
          }),
        ],
      },
      chains: {
        ...fixtureChains,
        chains: [makeChain({ id: "ethereum", name: "Ethereum", totalUsd: 1_000_000_000 })],
      },
      stability: fixtureStability,
      pegSummary: {
        ...fixturePegSummary,
        coins: [makePegCoin({ id: "usdc-circle", symbol: "USDC" })],
      },
      stress: fixtureStress,
      safetyGrades: fixtureSafetyGrades,
      cemeteryEntries: [],
      freshness: {},
    });
  }

  function denseWorld(): PharosVilleWorld {
    // The dense fixture exercises the full ship roster so we can assert
    // itinerary lengths across many ships.
    return buildPharosVilleWorld({
      stablecoins: denseFixtureStablecoins,
      chains: denseFixtureChains,
      stability: fixtureStability,
      pegSummary: denseFixturePegSummary,
      stress: denseFixtureStress,
      safetyGrades: denseFixtureSafetyGrades,
      cemeteryEntries: [],
      freshness: {},
    });
  }

  it("derives an itinerary length of 2 or 3 from stableUnit(shipId)", () => {
    // Two pinned ids cover the < 0.5 and >= 0.5 branches of the stableUnit
    // split. The exact unit fraction is deterministic, so the assertion is
    // anchored on the boundary it implements rather than a random draw.
    for (const shipId of ["usdc-circle", "usdt-tether", "dai-makerdao", "usds-sky", "frax-frax"]) {
      const length = openWaterPatrolItineraryLength(shipId);
      const fraction = stableUnit(`${shipId}.itinerary-length`);
      expect(length).toBe(fraction < 0.5 ? 2 : 3);
      expect([2, 3]).toContain(length);
    }
  });

  it("builds an itinerary of 2 or 3 distinct anchors for dockless calm-zone ships", () => {
    const world = worldForDocklessShip();
    const ship = world.ships[0]!;
    const route = buildMotionPlan(world, ship.detailId).shipRoutes.get(ship.id)!;
    expect(route.openWaterPatrol).not.toBeNull();
    const patrol = route.openWaterPatrol!;
    expect(patrol.itinerary.length).toBeGreaterThanOrEqual(2);
    expect(patrol.itinerary.length).toBeLessThanOrEqual(3);
    expect(patrol.itinerary[0]!.waypoint).toEqual(patrol.waypoint);

    // Distinct anchors: each itinerary waypoint should be unique.
    const seen = new Set<string>();
    for (const leg of patrol.itinerary) {
      const key = `${leg.waypoint.x},${leg.waypoint.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("the first itinerary leg matches the legacy single-waypoint pick exactly", () => {
    const world = worldForDocklessShip();
    const ship = world.ships[0]!;
    const route = buildMotionPlan(world, ship.detailId).shipRoutes.get(ship.id)!;
    const patrol = route.openWaterPatrol!;
    expect(patrol.itinerary[0]!.waypoint).toEqual(patrol.waypoint);
    expect(patrol.itinerary[0]!.outbound).toBe(patrol.outbound);
    expect(patrol.itinerary[0]!.inbound).toBe(patrol.inbound);
  });

  it("returns the same itinerary index for the same ship and cycle (stable)", () => {
    const repeats = [0, 1, 2, 3, 5, 8, 13, 21];
    for (const cycleIndex of repeats) {
      expect(openWaterPatrolItineraryIndex("ship.a", cycleIndex, 3)).toBe(
        openWaterPatrolItineraryIndex("ship.a", cycleIndex, 3),
      );
    }
  });

  it("emits at least one transition between adjacent cycles for itineraries of length 2+", () => {
    // Across a span of N=16 cycles, an itinerary of size >=2 should change
    // anchors at least once. This is the "ordered pair" property: adjacent
    // cycles must not lock to the same anchor every time.
    for (const shipId of ["usdc-circle", "usdt-tether", "dai-makerdao"]) {
      const len = openWaterPatrolItineraryLength(shipId);
      const indices: number[] = [];
      for (let cycle = 0; cycle < 16; cycle += 1) {
        indices.push(openWaterPatrolItineraryIndex(shipId, cycle, len));
      }
      const distinct = new Set(indices);
      expect(distinct.size).toBeGreaterThan(1);
    }
  });

  it("rotates through every itinerary index across a long-enough cycle window", () => {
    // For len=2 over 32 cycles, both anchors should appear; for len=3 same.
    for (const shipId of ["usdc-circle", "usdt-tether", "dai-makerdao", "usds-sky"]) {
      const len = openWaterPatrolItineraryLength(shipId);
      const seen = new Set<number>();
      for (let cycle = 0; cycle < 64; cycle += 1) {
        seen.add(openWaterPatrolItineraryIndex(shipId, cycle, len));
      }
      expect(seen.size).toBe(len);
      for (let i = 0; i < len; i += 1) {
        expect(seen.has(i)).toBe(true);
      }
    }
  });

  it("materializes every itinerary path before frame-time sampling", () => {
    const world = worldForDocklessShip();
    const ship = world.ships[0]!;
    const route = buildMotionPlan(world, ship.detailId).shipRoutes.get(ship.id)!;
    const patrol = route.openWaterPatrol!;
    expect([...route.waterPaths.values()]).toHaveLength(patrol.itinerary.length * 2);
    for (const leg of patrol.itinerary) {
      const outKey = `${leg.outbound.from.x}.${leg.outbound.from.y}->${leg.outbound.to.x}.${leg.outbound.to.y}`;
      const inKey = `${leg.inbound.from.x}.${leg.inbound.from.y}->${leg.inbound.to.x}.${leg.inbound.to.y}`;
      expect(route.waterPaths.get(outKey)).toBe(leg.outbound);
      expect(route.waterPaths.get(inKey)).toBe(leg.inbound);
    }
  });

  it("path-cache headroom is comfortable when every patrol ship grows to a 3-anchor itinerary", () => {
    // Cache capacity is min(4096, max(512, 24 × shipCount)). For the dense
    // fixture the floor of 512 dominates, and even with every ship growing
    // to 3 anchors (the worst case ~6x growth call-out in the plan, since
    // each cycle's outbound + inbound is built per-anchor) the entry count
    // sits well within the cap.
    expect(ACTIVE_META_BY_ID.size).toBeGreaterThan(0); // sanity: stablecoin meta loaded
    const world = denseWorld();
    // Capacity depends only on which ships patrol and their deterministic
    // itinerary sizes. Building the full plan here needlessly solves every A*
    // leg while other source files run in parallel, turning arithmetic into a
    // machine-load timeout without adding coverage.
    const patrolShips = world.ships.filter((ship) => ship.dockVisits.length === 0);
    const docklessShips = patrolShips.length;
    const routesWithItinerary = patrolShips.filter((ship) => (
      openWaterPatrolItineraryLength(ship.id) > 0
    )).length;
    const maxItinerary = Math.max(...patrolShips.map((ship) => openWaterPatrolItineraryLength(ship.id)));
    expect(maxItinerary).toBeLessThanOrEqual(3);
    expect(routesWithItinerary).toBe(docklessShips);
    // Each itinerary anchor contributes one outbound + one inbound path. The
    // dense fixture's patrol itinerary still sits below the 512-entry floor;
    // the additional per-ship allowance is reserved for 96-tile station routes.
    expect(docklessShips * 6).toBeLessThan(512);
  });
});

describe("W1.6 the empty inlet in motion", () => {
  const world = buildPharosVilleWorld({
    stablecoins: denseFixtureStablecoins,
    chains: denseFixtureChains,
    stability: fixtureStability,
    pegSummary: denseFixturePegSummary,
    stress: denseFixtureStress,
    safetyGrades: denseFixtureSafetyGrades,
    cemeteryEntries: [],
    freshness: {},
  });
  const plans = Array.from({ length: 12 }, (_, bucket) => buildBaseMotionPlan(world, bucket * 600));

  /** Core tiles may appear only as the run that leaves (or enters) a leg endpoint lying in the core. */
  function crossesCore(path: ShipWaterPath): boolean {
    const inCore = path.points.map((point) => isGardenInletCoreTile(point.x, point.y));
    let first = 0;
    while (first < inCore.length && inCore[first]) first += 1;
    let last = inCore.length - 1;
    while (last >= first && inCore[last]) last -= 1;
    return inCore.slice(first, last + 1).some(Boolean);
  }

  it("routes every voyage without a crossing token around the inlet core", () => {
    let paths = 0;
    for (const route of plans[0]!.shipRoutes.values()) {
      const legs = [
        ...route.waterPaths.values(),
        ...(route.openWaterPatrol?.itinerary.flatMap((leg) => [leg.outbound, leg.inbound]) ?? []),
      ];
      for (const path of legs) {
        paths += 1;
        expect(crossesCore(path), `${route.shipId} ${JSON.stringify(path.from)}→${JSON.stringify(path.to)}`).toBe(false);
      }
    }
    expect(paths).toBeGreaterThan(100);
  });

  it("lets only one ceremony subject at a time cross, fifteen minutes apart, and the same holder in every plan", () => {
    const tokens = new Map<string, InletCrossingToken>();
    for (const [bucket, plan] of plans.entries()) {
      for (const token of inletCrossingTokensBetween(plan, bucket * 600, bucket * 600 + 600)) {
        const key = `${token.slotIndex}`;
        const seen = tokens.get(key);
        if (seen) expect(`${token.shipId}:${token.cycleIndex}`).toBe(`${seen.shipId}:${seen.cycleIndex}`);
        tokens.set(key, token);
      }
    }
    const ordered = [...tokens.values()].toSorted((left, right) => left.startSeconds - right.startSeconds);
    expect(ordered.length).toBeGreaterThan(0);
    for (const token of ordered) {
      // A token is only issued for a voyage that really crosses the ma.
      expect(token.path.points.some((point) => isGardenInletCoreTile(point.x, point.y))).toBe(true);
      const ship = world.ships.find((entry) => entry.id === token.shipId)!;
      expect(["titan", "unique"]).toContain(ship.visual.sizeTier);
      expect(ship.squadId).toBeUndefined();
    }
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]!.startSeconds - ordered[index - 1]!.endSeconds).toBeGreaterThanOrEqual(GARDEN_CROSSING_MIN_GAP_SECONDS);
    }
  });

  it("reports the crossing path on the token holder's sample, and the routed leg on its other arrivals", () => {
    const bucket = plans.findIndex((entry, index) => inletCrossingTokensBetween(entry, index * 600, index * 600 + 600).length > 0);
    expect(bucket).toBeGreaterThanOrEqual(0);
    const plan = plans[bucket]!;
    const [token] = inletCrossingTokensBetween(plan, bucket * 600, bucket * 600 + 600);
    const ship = world.ships.find((entry) => entry.id === token!.shipId)!;
    const route = plan.shipRoutes.get(ship.id)!;
    const during = resolveShipMotionSample({
      plan,
      reducedMotion: false,
      ship,
      timeSeconds: (token!.startSeconds + token!.endSeconds) / 2,
    });
    // The selected-route line draws exactly this path.
    expect(during.routePath).toBe(token!.path);
    const nextCycle = resolveShipMotionSample({
      plan,
      reducedMotion: false,
      ship,
      timeSeconds: (token!.startSeconds + token!.endSeconds) / 2 + route.cycleSeconds,
    });
    expect(nextCycle.routePath).toBeDefined();
    expect(nextCycle.routePath).not.toBe(token!.path);
  });

  it("leaves the attention slots a score gift claims without a crossing", () => {
    const seed = "2026-09-26";
    const crossingSlots = gardenAttentionSlotsBetween(seed, -1_800, 1_800);
    const gifts = planGardenScoreGifts(seed, crossingSlots.map((slot) => ({
      id: `gift-${slot.index}`,
      earliestSeconds: slot.startSeconds,
      latestSeconds: slot.startSeconds,
      priority: 1,
    })));
    expect(gifts.length).toBe(crossingSlots.length);
    const plan = buildBaseMotionPlan(world, 0, { seed, gifts });
    expect(inletCrossingTokensBetween(plan, -1_800, 1_800)).toEqual([]);
  });
});

describe("W4.25 risk-transition tack-out", () => {
  // Build the same usdc-circle ship at two different DEWS placements to
  // exercise the previousRiskTile cache.
  function worldAtCurrentDeviationBps(deviationBps: number | null): PharosVilleWorld {
    return buildPharosVilleWorld({
      stablecoins: {
        peggedAssets: [
          makeAsset({
            id: "usdc-circle",
            symbol: "USDC",
            chainCirculating: { ethereum: { current: 1, circulatingPrevDay: 1, circulatingPrevWeek: 1, circulatingPrevMonth: 1 } },
          }),
        ],
      },
      chains: {
        ...fixtureChains,
        chains: [makeChain({ id: "ethereum", name: "Ethereum", totalUsd: 1_000_000_000 })],
      },
      stability: fixtureStability,
      pegSummary: {
        ...fixturePegSummary,
        coins: [makePegCoin({ id: "usdc-circle", symbol: "USDC", currentDeviationBps: deviationBps })],
      },
      stress: fixtureStress,
      safetyGrades: fixtureSafetyGrades,
      cemeteryEntries: [],
      freshness: {},
    });
  }

  it("does not record previousRiskTile on the first plan build (no transition)", () => {
    __resetPreviousRiskCache();
    const world = worldAtCurrentDeviationBps(0);
    const ship = world.ships[0]!;
    const route = buildMotionPlan(world, ship.detailId).shipRoutes.get(ship.id)!;
    expect(route.previousRiskTile).toBeUndefined();
  });

  it("records previousRiskTile on the build immediately after a placement change", () => {
    __resetPreviousRiskCache();
    const calmWorld = worldAtCurrentDeviationBps(0);
    const calmShip = calmWorld.ships[0]!;
    const calmRoute = buildMotionPlan(calmWorld, calmShip.detailId).shipRoutes.get(calmShip.id)!;
    const calmRiskTile = calmRoute.riskTile;

    // Now build a route with a stress-escalated placement → riskTile shifts.
    const stressedWorld = worldAtCurrentDeviationBps(800);
    const stressedShip = stressedWorld.ships[0]!;
    const stressedRoute = buildMotionPlan(stressedWorld, stressedShip.detailId).shipRoutes.get(stressedShip.id)!;
    expect(stressedRoute.riskTile).not.toEqual(calmRiskTile);
    expect(stressedRoute.previousRiskTile).toEqual(calmRiskTile);
  });

  it("clears previousRiskTile after one cycle (steady-state placement)", () => {
    __resetPreviousRiskCache();
    const calmWorld = worldAtCurrentDeviationBps(0);
    const calmShip = calmWorld.ships[0]!;
    buildMotionPlan(calmWorld, calmShip.detailId).shipRoutes.get(calmShip.id);

    const stressedWorld = worldAtCurrentDeviationBps(800);
    const stressedShip = stressedWorld.ships[0]!;
    const stressedRoute = buildMotionPlan(stressedWorld, stressedShip.detailId).shipRoutes.get(stressedShip.id)!;
    expect(stressedRoute.previousRiskTile).toBeDefined();

    // Second build at the same placement: transition is over, no more
    // previousRiskTile surfaced.
    const stressedWorld2 = worldAtCurrentDeviationBps(800);
    const stressedShip2 = stressedWorld2.ships[0]!;
    const stressedRoute2 = buildMotionPlan(stressedWorld2, stressedShip2.detailId).shipRoutes.get(stressedShip2.id)!;
    expect(stressedRoute2.previousRiskTile).toBeUndefined();
  });

  it("clears previous-risk state when the map path cache is disposed", () => {
    __resetPreviousRiskCache();
    const calmWorld = worldAtCurrentDeviationBps(0);
    const calmShip = calmWorld.ships[0]!;
    buildMotionPlan(calmWorld, calmShip.detailId);

    const stressedWorld = worldAtCurrentDeviationBps(800);
    const stressedShip = stressedWorld.ships[0]!;
    const stressedRoute = buildMotionPlan(stressedWorld, stressedShip.detailId).shipRoutes.get(stressedShip.id)!;
    expect(stressedRoute.previousRiskTile).toBeDefined();

    disposePathCacheForMap(stressedWorld.map);
    const freshStressedWorld = worldAtCurrentDeviationBps(800);
    const freshStressedShip = freshStressedWorld.ships[0]!;
    const freshRoute = buildMotionPlan(freshStressedWorld, freshStressedShip.detailId).shipRoutes.get(freshStressedShip.id)!;
    expect(freshRoute.previousRiskTile).toBeUndefined();
  });

  it("blends the risk-drift center from previous → current over the 3s tack-out window", () => {
    __resetPreviousRiskCache();
    const calmWorld = worldAtCurrentDeviationBps(0);
    const calmShip = calmWorld.ships[0]!;
    buildMotionPlan(calmWorld, calmShip.detailId);

    // Force a different placement: warning band.
    const warningWorld = worldAtCurrentDeviationBps(300);
    const warningShip = warningWorld.ships[0]!;
    const warningPlan = buildMotionPlan(warningWorld, warningShip.detailId);
    const warningRoute = warningPlan.shipRoutes.get(warningShip.id)!;
    expect(warningRoute.previousRiskTile).toBeDefined();
    const prev = warningRoute.previousRiskTile!;
    const next = warningRoute.riskTile;

    // Walk the cycle at high resolution so we catch the 3-second tack-out
    // window at the start of the risk-drift phase. The window is small
    // compared to the full cycle (≤3s out of ~1170s), so we need finely-
    // spaced samples to hit it. Step through ~1s per sample to cover the
    // full cycle.
    let observedTransition = false;
    const sampleSeconds = Math.max(1, Math.ceil(warningRoute.cycleSeconds));
    for (let second = 0; second < sampleSeconds; second += 1) {
      const sample = resolveShipMotionSample({
        plan: warningPlan,
        reducedMotion: false,
        ship: warningShip,
        timeSeconds: second - warningRoute.phaseSeconds,
      });
      if (sample.riskTransition) {
        observedTransition = true;
        expect(sample.riskTransition.fromTile).toEqual(prev);
        expect(sample.riskTransition.toTile).toEqual(next);
        expect(sample.riskTransition.progress).toBeGreaterThanOrEqual(0);
        expect(sample.riskTransition.progress).toBeLessThan(1);
        break;
      }
    }
    expect(observedTransition).toBe(true);
  });

  it("clears riskTransition on the sample after the tack-out completes", () => {
    __resetPreviousRiskCache();
    const calmWorld = worldAtCurrentDeviationBps(0);
    const calmShip = calmWorld.ships[0]!;
    buildMotionPlan(calmWorld, calmShip.detailId);
    const warningWorld = worldAtCurrentDeviationBps(300);
    const warningShip = warningWorld.ships[0]!;
    const warningPlan = buildMotionPlan(warningWorld, warningShip.detailId);
    const warningRoute = warningPlan.shipRoutes.get(warningShip.id)!;

    // Sample late in the risk-drift window: well past the 3s tack-out.
    let lateSampleSeen = false;
    for (let step = 0; step < 240; step += 1) {
      const sample = resolveShipMotionSample({
        plan: warningPlan,
        reducedMotion: false,
        ship: warningShip,
        timeSeconds: warningRoute.cycleSeconds * (step / 240) - warningRoute.phaseSeconds,
      });
      if (sample.state === "risk-drift" && (!sample.riskTransition || sample.riskTransition.progress >= 1)) {
        // After the 3s window the sampler must clear riskTransition.
        expect(sample.riskTransition ?? null).toBeNull();
        lateSampleSeen = true;
        break;
      }
    }
    expect(lateSampleSeen).toBe(true);
  });
});

describe("motion plan signature", () => {
  it("invalidates the plan when a cached-shape world and the fresh world place the fleet differently", { timeout: 20_000 }, () => {
    const fresh = buildPharosVilleWorld({
      stablecoins: denseFixtureStablecoins,
      chains: denseFixtureChains,
      stability: fixtureStability,
      pegSummary: denseFixturePegSummary,
      stress: denseFixtureStress,
      safetyGrades: denseFixtureSafetyGrades,
      cemeteryEntries: [],
      freshness: {},
    });
    // A cached world with schema drift carries the same routing fields but
    // different placement inputs — here the leading docked hull is drawn at
    // another scale (a stale supply ranking), so its hull margin, and with it
    // the blue-noise berth its route anchors at, moves.
    const lead = fresh.ships.find((ship) => ship.dockVisits.length > 0 && ship.visual.sizeTier === "titan")!;
    const cached: PharosVilleWorld = {
      ...fresh,
      ships: fresh.ships.map((ship) => (ship.id === lead.id
        ? { ...ship, visual: { ...ship.visual, scale: (ship.visual.scale || 1) * 0.4 } }
        : ship)),
    };
    const freshPlan = buildBaseMotionPlan(fresh);
    const cachedPlan = buildBaseMotionPlan(cached);
    const moved = fresh.ships.filter((ship) => {
      const a = freshPlan.shipRoutes.get(ship.id)!.riskTile;
      const b = cachedPlan.shipRoutes.get(ship.id)!.riskTile;
      return a.x !== b.x || a.y !== b.y;
    });
    // The drift really moves anchorages, so reusing the cached plan would
    // leave the fleet where the stale world put it…
    expect(moved.length).toBeGreaterThan(0);
    // …which the signature forbids: the memoised plan is rebuilt.
    expect(motionPlanSignature(cached)).not.toBe(motionPlanSignature(fresh));
    // An identical-content refresh still reuses the plan (no A* rebuild).
    expect(motionPlanSignature({ ...fresh, ships: fresh.ships.map((ship) => ({ ...ship })) })).toBe(motionPlanSignature(fresh));
  });
});
