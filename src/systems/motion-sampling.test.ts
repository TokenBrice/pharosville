import { describe, expect, it } from "vitest";
import {
  applySeaRoomSeparationPass,
  createShipMotionSample,
  resolveShipMotionSample,
  resolveShipMotionSampleInto,
  SEA_ROOM_BASE_RADIUS_TILES,
  SEA_ROOM_MAX_NUDGE_PER_FRAME,
  seaRoomSeparationRadius,
} from "./motion-sampling";
import { seaStateForSources, type SeaState } from "./sea-state";
import { isWaterTileKind, PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, tileKindAt } from "./world-layout";
import type { PharosVilleMotionPlan, ShipMotionRoute, ShipMotionSample } from "./motion-types";
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

describe("W3.20 sea-room separation pass", () => {
  function makeSample(id: string, x: number, y: number, state: ShipMotionSample["state"] = "sailing"): ShipMotionSample {
    return {
      shipId: id,
      tile: { x, y },
      state,
      zone: "calm",
      currentDockId: null,
      currentRouteStopId: null,
      currentRouteStopKind: null,
      heading: { x: 1, y: 0 },
      wakeIntensity: 0,
      mooringSubPhase: null,
      mooringTension: 0,
      lanternAlpha: 0,
      fenderContact: 0,
    };
  }

  function makeShip(id: string, role?: "flagship" | "consort"): ShipNode {
    return ({ id, ...(role ? { squadRole: role } : {}) } as unknown) as ShipNode;
  }

  function calmSea(): SeaState {
    return seaStateForSources({
      areas: [{ band: "CALM", count: 1 }],
      lighthouse: { psiBand: "STEADY", score: 12, unavailable: false },
      wallClockHour: 12,
    });
  }

  function stormSea(): SeaState {
    return seaStateForSources({
      areas: [{ band: "DANGER", count: 1 }],
      lighthouse: { psiBand: "DANGER", score: 90, unavailable: false },
      wallClockHour: 23,
    });
  }

  it("nudges a pair of ships apart when they sit within the separation radius", () => {
    const a = makeSample("ship.a", 10, 10);
    const b = makeSample("ship.b", 10.4, 10);
    const samples = new Map([
      [a.shipId, a],
      [b.shipId, b],
    ]);
    const ships = [makeShip("ship.a"), makeShip("ship.b")];

    const before = b.tile.x - a.tile.x;
    expect(before).toBeCloseTo(0.4, 6);
    const nudged = applySeaRoomSeparationPass(samples, ships);
    expect(nudged).toBe(1);
    const after = b.tile.x - a.tile.x;
    // Each ship moved by min((0.7 - 0.4) / 2, 0.15) = 0.15 tile, total + 0.30.
    expect(after).toBeCloseTo(before + 0.3, 6);
    expect(a.tile.y).toBe(10);
    expect(b.tile.y).toBe(10);
  });

  it("leaves moored ships untouched", () => {
    const moored = makeSample("ship.a", 10, 10, "moored");
    const sailing = makeSample("ship.b", 10.4, 10);
    const samples = new Map([
      [moored.shipId, moored],
      [sailing.shipId, sailing],
    ]);
    const ships = [makeShip("ship.a"), makeShip("ship.b")];

    const nudged = applySeaRoomSeparationPass(samples, ships);
    expect(nudged).toBe(0);
    expect(moored.tile).toEqual({ x: 10, y: 10 });
    expect(sailing.tile).toEqual({ x: 10.4, y: 10 });
  });

  it("leaves squad consorts untouched so they stay glued to their flagship", () => {
    // Consort sits right on top of its flagship-style partner; without the
    // consort skip the pair would nudge apart and break formation cohesion.
    const consort = makeSample("ship.consort", 10, 10);
    const partner = makeSample("ship.partner", 10.3, 10);
    const samples = new Map([
      [consort.shipId, consort],
      [partner.shipId, partner],
    ]);
    const ships = [makeShip("ship.consort", "consort"), makeShip("ship.partner")];

    const nudged = applySeaRoomSeparationPass(samples, ships);
    expect(nudged).toBe(0);
    expect(consort.tile).toEqual({ x: 10, y: 10 });
    expect(partner.tile).toEqual({ x: 10.3, y: 10 });
  });

  it("enforces the per-frame nudge cap of 0.15 tile when ships are heavily overlapping", () => {
    // Ships sitting on top of each other → half-shortfall is 0.35 tile,
    // capped at SEA_ROOM_MAX_NUDGE_PER_FRAME = 0.15. After one pass the total
    // separation should equal exactly 2 × cap = 0.30 tile (along the +x axis
    // since the degenerate-overlap fallback uses +x deterministically).
    const a = makeSample("ship.a", 10, 10);
    const b = makeSample("ship.b", 10, 10);
    const samples = new Map([
      [a.shipId, a],
      [b.shipId, b],
    ]);
    const ships = [makeShip("ship.a"), makeShip("ship.b")];

    applySeaRoomSeparationPass(samples, ships);
    expect(SEA_ROOM_MAX_NUDGE_PER_FRAME).toBeCloseTo(0.15, 6);
    expect(b.tile.x - a.tile.x).toBeCloseTo(2 * SEA_ROOM_MAX_NUDGE_PER_FRAME, 6);
  });

  it("uses deterministic id-sorted iteration for stable frame-to-frame nudges", () => {
    const a1 = makeSample("ship.a", 10, 10);
    const b1 = makeSample("ship.b", 10.2, 10);
    const samples1 = new Map([
      [a1.shipId, a1],
      [b1.shipId, b1],
    ]);
    const a2 = makeSample("ship.a", 10, 10);
    const b2 = makeSample("ship.b", 10.2, 10);
    const samples2 = new Map([
      [b2.shipId, b2],
      [a2.shipId, a2],
    ]);
    const ships1 = [makeShip("ship.a"), makeShip("ship.b")];
    const ships2 = [makeShip("ship.b"), makeShip("ship.a")];

    applySeaRoomSeparationPass(samples1, ships1);
    applySeaRoomSeparationPass(samples2, ships2);
    expect(a1.tile.x).toBeCloseTo(a2.tile.x, 9);
    expect(b1.tile.x).toBeCloseTo(b2.tile.x, 9);
  });

  it("modulates the radius by the supplied sea state's swell", () => {
    const calm = calmSea();
    const storm = stormSea();
    expect(seaRoomSeparationRadius(null)).toBeCloseTo(SEA_ROOM_BASE_RADIUS_TILES, 6);
    expect(seaRoomSeparationRadius(calm)).toBeGreaterThanOrEqual(SEA_ROOM_BASE_RADIUS_TILES);
    expect(seaRoomSeparationRadius(storm)).toBeGreaterThan(seaRoomSeparationRadius(calm));
  });

  it("nudges further apart in rough seas than calm seas at the same starting gap", () => {
    const ships = [makeShip("ship.a"), makeShip("ship.b")];

    const calmA = makeSample("ship.a", 10, 10);
    const calmB = makeSample("ship.b", 10.65, 10);
    const calmSamples = new Map([[calmA.shipId, calmA], [calmB.shipId, calmB]]);
    applySeaRoomSeparationPass(calmSamples, ships, { seaState: calmSea() });
    const calmDelta = calmB.tile.x - calmA.tile.x;

    const stormA = makeSample("ship.a", 10, 10);
    const stormB = makeSample("ship.b", 10.65, 10);
    const stormSamples = new Map([[stormA.shipId, stormA], [stormB.shipId, stormB]]);
    applySeaRoomSeparationPass(stormSamples, ships, { seaState: stormSea() });
    const stormDelta = stormB.tile.x - stormA.tile.x;

    expect(stormDelta).toBeGreaterThan(calmDelta);
  });

  it("is a hard no-op under reduced motion so deterministic idle samples are preserved", () => {
    const a = makeSample("ship.a", 10, 10);
    const b = makeSample("ship.b", 10.1, 10);
    const samples = new Map([
      [a.shipId, a],
      [b.shipId, b],
    ]);
    const ships = [makeShip("ship.a"), makeShip("ship.b")];

    const nudged = applySeaRoomSeparationPass(samples, ships, { reducedMotion: true });
    expect(nudged).toBe(0);
    expect(a.tile).toEqual({ x: 10, y: 10 });
    expect(b.tile).toEqual({ x: 10.1, y: 10 });
  });

  it("ignores pairs already outside the radius", () => {
    const a = makeSample("ship.a", 10, 10);
    const b = makeSample("ship.b", 12, 10);
    const samples = new Map([
      [a.shipId, a],
      [b.shipId, b],
    ]);
    const ships = [makeShip("ship.a"), makeShip("ship.b")];

    const nudged = applySeaRoomSeparationPass(samples, ships);
    expect(nudged).toBe(0);
    expect(a.tile.x).toBe(10);
    expect(b.tile.x).toBe(12);
  });
});

describe("W4.24 consort tile validation", () => {
  it("collapses a gained consort offset back to the waterborne flagship when it would land on a non-water tile", () => {
    const formationOffset = { dx: 2, dy: -2 };
    const timeSeconds = 0;
    let flagshipTile: { x: number; y: number } | null = null;
    let gainedTile: { x: number; y: number } | null = null;
    for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT && !flagshipTile; y += 1) {
      for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
        const candidate = {
          x: x + formationOffset.dx * 1.4,
          y: y + formationOffset.dy * 1.4,
        };
        if (isWaterTileKind(tileKindAt(x, y)) && !isWaterTileKind(tileKindAt(candidate.x, candidate.y))) {
          flagshipTile = { x, y };
          gainedTile = candidate;
          break;
        }
      }
    }
    expect(flagshipTile).not.toBeNull();
    expect(gainedTile).not.toBeNull();

    const flagshipRoute = {
      ...makeRoute(),
      shipId: "usds-sky",
      riskTile: flagshipTile!,
      zone: "calm",
    } satisfies ShipMotionRoute;
    const consortRoute = {
      ...makeRoute(),
      shipId: "susds-sky",
      riskTile: flagshipRoute.riskTile,
      zone: "calm",
      formationOffset,
    } satisfies ShipMotionRoute;
    const plan: PharosVilleMotionPlan = {
      animatedShipIds: new Set(),
      effectShipIds: new Set(),
      lighthouseFireFlickerPerSecond: 1,
      moverShipIds: new Set(),
      shipPhases: new Map(),
      shipRoutes: new Map([
        [flagshipRoute.shipId, flagshipRoute],
        [consortRoute.shipId, consortRoute],
      ]),
    };
    const consort = {
      id: consortRoute.shipId,
      riskPlacement: "safe-harbor",
      riskZone: "calm",
      squadId: "sky",
      squadRole: "consort",
    } as ShipNode;
    const flagshipSample = createShipMotionSample();
    flagshipSample.shipId = flagshipRoute.shipId;
    flagshipSample.tile.x = flagshipRoute.riskTile.x;
    flagshipSample.tile.y = flagshipRoute.riskTile.y;
    flagshipSample.state = "sailing";
    flagshipSample.zone = "calm";
    flagshipSample.speedTilesPerSecond = 1;

    expect(isWaterTileKind(tileKindAt(flagshipSample.tile.x, flagshipSample.tile.y))).toBe(true);
    expect(isWaterTileKind(tileKindAt(gainedTile!.x, gainedTile!.y))).toBe(false);

    const out = createShipMotionSample();
    resolveShipMotionSampleInto({
      plan,
      reducedMotion: false,
      ship: consort,
      timeSeconds,
      flagshipSamples: new Map([[flagshipRoute.shipId, flagshipSample]]),
    }, out);

    expect(out.tile).toEqual(flagshipSample.tile);
    expect(isWaterTileKind(tileKindAt(out.tile.x, out.tile.y))).toBe(true);
  });
});

describe("F2 risk-repath heading easing", () => {
  // makeRoute's calm docked cycle: dock [0,400) → departing [400,712) →
  // risk-drift [712,888) → arriving [888,1200). W4.25 elapsed-risk seconds are
  // progress × cycleSeconds × ZONE_DWELL.calm.riskDwell = progress × 288.
  const RISK_WINDOW_START = 712;
  const RISK_SECONDS_EACH = 176;
  const W425_RISK_SECONDS = 288;

  function planFor(route: ShipMotionRoute): PharosVilleMotionPlan {
    return {
      animatedShipIds: new Set(),
      effectShipIds: new Set(),
      lighthouseFireFlickerPerSecond: 1,
      moverShipIds: new Set(),
      shipPhases: new Map(),
      shipRoutes: new Map([[route.shipId, route]]),
    };
  }

  function sampleAt(route: ShipMotionRoute, timeSeconds: number) {
    return resolveShipMotionSample({
      plan: planFor(route),
      reducedMotion: false,
      ship: { id: route.shipId, riskZone: route.zone } as ShipNode,
      timeSeconds,
    });
  }

  function timeForElapsedRiskSeconds(elapsed: number): number {
    return RISK_WINDOW_START + (elapsed / W425_RISK_SECONDS) * RISK_SECONDS_EACH;
  }

  // Tack direction previous {14,22} → current {20,22} is (1, 0).
  function makeRepathRoute(): ShipMotionRoute {
    return { ...makeRoute(), previousRiskTile: { x: 14, y: 22 } };
  }

  it("starts the risk-drift phase on the orbital heading (no snap at entry)", () => {
    const eased = sampleAt(makeRepathRoute(), RISK_WINDOW_START);
    const control = sampleAt(makeRoute(), RISK_WINDOW_START);
    expect(eased.state).toBe("risk-drift");
    expect(eased.heading.x).toBeCloseTo(control.heading.x, 12);
    expect(eased.heading.y).toBeCloseTo(control.heading.y, 12);
  });

  it("eases the heading toward the tack direction while the tack-out is in motion", () => {
    const t = timeForElapsedRiskSeconds(1.0);
    const eased = sampleAt(makeRepathRoute(), t);
    const control = sampleAt(makeRoute(), t);
    expect(eased.state).toBe("risk-drift");
    expect(eased.riskTransition).not.toBeNull();
    // Tack direction is +x; the eased heading must be pulled toward it.
    expect(eased.heading.x).toBeGreaterThan(control.heading.x);
    expect(eased.heading.x).toBeGreaterThan(0.5);
  });

  it("returns to the pure orbital heading once the tack-out completes", () => {
    const t = timeForElapsedRiskSeconds(4.0);
    const eased = sampleAt(makeRepathRoute(), t);
    const control = sampleAt(makeRoute(), t);
    expect(eased.riskTransition).toBeNull();
    expect(eased.heading.x).toBeCloseTo(control.heading.x, 12);
    expect(eased.heading.y).toBeCloseTo(control.heading.y, 12);
  });

  it("is deterministic for the same (ship, route, time) inputs", () => {
    const t = timeForElapsedRiskSeconds(1.0);
    const first = sampleAt(makeRepathRoute(), t);
    const second = sampleAt(makeRepathRoute(), t);
    expect(second.heading).toEqual(first.heading);
    expect(second.tile).toEqual(first.tile);
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
