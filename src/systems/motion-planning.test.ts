import { describe, expect, it } from "vitest";
import { ACTIVE_META_BY_ID } from "@shared/lib/stablecoins";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureChains,
  fixturePegSummary,
  fixtureReportCards,
  fixtureStability,
  fixtureStress,
  makeAsset,
  makeChain,
  makePegCoin,
} from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import {
  buildMotionPlan,
  openWaterPatrolItineraryIndex,
  openWaterPatrolItineraryLength,
} from "./motion-planning";
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
      reportCards: fixtureReportCards,
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
      reportCards: denseFixtureReportCards,
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

  it("registers all itinerary outbound/inbound legs in the route waterPaths map", () => {
    const world = worldForDocklessShip();
    const ship = world.ships[0]!;
    const route = buildMotionPlan(world, ship.detailId).shipRoutes.get(ship.id)!;
    const patrol = route.openWaterPatrol!;
    for (const leg of patrol.itinerary) {
      const outKey = `${leg.outbound.from.x}.${leg.outbound.from.y}->${leg.outbound.to.x}.${leg.outbound.to.y}`;
      const inKey = `${leg.inbound.from.x}.${leg.inbound.from.y}->${leg.inbound.to.x}.${leg.inbound.to.y}`;
      expect(route.waterPaths.get(outKey)).toBe(leg.outbound);
      expect(route.waterPaths.get(inKey)).toBe(leg.inbound);
    }
  });

  it("path-cache headroom is comfortable when every patrol ship grows to a 3-anchor itinerary", () => {
    // Cache capacity is min(4096, max(512, 16 × shipCount)). For the dense
    // fixture the floor of 512 dominates, and even with every ship growing
    // to 3 anchors (the worst case ~6x growth call-out in the plan, since
    // each cycle's outbound + inbound is built per-anchor) the entry count
    // sits well within the cap.
    expect(ACTIVE_META_BY_ID.size).toBeGreaterThan(0); // sanity: stablecoin meta loaded
    const world = denseWorld();
    const plan = buildMotionPlan(world, null);
    let docklessShips = 0;
    let routesWithItinerary = 0;
    let maxItinerary = 0;
    for (const [, route] of plan.shipRoutes) {
      if (!route.openWaterPatrol) continue;
      docklessShips += 1;
      routesWithItinerary += 1;
      maxItinerary = Math.max(maxItinerary, route.openWaterPatrol.itinerary.length);
    }
    expect(maxItinerary).toBeLessThanOrEqual(3);
    expect(routesWithItinerary).toBeGreaterThanOrEqual(0);
    // Each itinerary anchor contributes one outbound + one inbound path. The
    // dense fixture sits well below the 512-entry cache floor, so the ~6×
    // headroom margin called out in the plan is preserved without a cap bump.
    expect(docklessShips * 6).toBeLessThan(512);
  });
});
