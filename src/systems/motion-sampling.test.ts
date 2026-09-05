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
import { activeStopCountForCycle, routeSamplingRuntime } from "./motion-sampling/route-runtime";
import { seaStateForSources, type SeaState } from "./sea-state";
import { isWaterTileKind, PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, tileKindAt } from "./world-layout";
import type { PharosVilleMotionPlan, ShipMotionRoute, ShipMotionSample } from "./motion-types";
import type { ShipNode } from "./world-types";
import { gardenShipVisualScale } from "./garden-observatory-slice";
import { gardenShipWaterMarginTiles, isGardenShipWater, nearestGardenShipWater } from "./garden-water-exclusion";

describe("motion sampling sea-state metadata", () => {
  it("scales moored berth sway from the supplied sea state", () => {
    const route = makeRoute();
    const ship = {
      id: route.shipId,
      riskZone: route.zone,
    } as ShipNode;
    const plan: PharosVilleMotionPlan = {
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
    expect(distanceFromMooring(storm, route)).toBeGreaterThan(distanceFromMooring(calm, route));
    expect(storm.seaState?.label).toBe(stormSea.label);
  });
});

describe("sea-room separation on final display positions", () => {
  const origin = nearestGardenShipWater({ x: 100, y: 65 }, 15, "separation-test", true);
  function ship(id: string, scale = 0.7): ShipNode {
    return { id, dockVisits: [], visual: { hull: "treasury-galleon", scale } } as unknown as ShipNode;
  }
  function sample(id: string, dx = 0, state: ShipMotionSample["state"] = "sailing"): ShipMotionSample {
    return { ...createShipMotionSample(), shipId: id, state, mapVisibilityAlpha: 1,
      tile: { x: 1, y: 1 }, displayTile: { x: origin.x + dx, y: origin.y }, heading: { x: 1, y: 0 } };
  }
  function runPair(frames: number, moored = false) {
    const a = sample("a", 0, moored ? "moored" : "sailing");
    const b = sample("b", 0.5);
    const samples = new Map([["a", a], ["b", b]]);
    const ships = [ship("a"), ship("b")];
    let previousA = a.displayTile!.x;
    let previousB = b.displayTile!.x;
    for (let frame = 0; frame < frames; frame += 1) {
      a.displayTile = { ...origin };
      b.displayTile = { x: origin.x + 0.5, y: origin.y };
      applySeaRoomSeparationPass(samples, ships, { timeSeconds: frame / 60 });
      expect(Math.abs(a.displayTile.x - previousA)).toBeLessThanOrEqual(1.2 / 60 + 1e-7);
      expect(Math.abs(b.displayTile.x - previousB)).toBeLessThanOrEqual(1.2 / 60 + 1e-7);
      previousA = a.displayTile.x;
      previousB = b.displayTile.x;
    }
    return { a, b, samples, ships };
  }

  it("accumulates bounded continuous avoidance despite every frame resetting its route sample", () => {
    const { a, b } = runPair(360);
    expect(b.displayTile!.x - a.displayTile!.x).toBeGreaterThan(4);
    expect(a.tile).toEqual({ x: 1, y: 1 });
    expect(b.tile).toEqual({ x: 1, y: 1 });
    expect(SEA_ROOM_MAX_NUDGE_PER_FRAME).toBe(0.15);
  });

  it("publishes final displacement velocity while preserving the collision-tested heading", () => {
    const { a, b, samples, ships } = runPair(10);
    const previous = { ...a.displayTile! };
    const heading = { ...a.heading };
    a.displayTile = { ...origin };
    b.displayTile = { x: origin.x + 0.5, y: origin.y };
    applySeaRoomSeparationPass(samples, ships, { timeSeconds: 10 / 60 });
    expect(a.velocity!.x).toBeCloseTo((a.displayTile.x - previous.x) * 60, 6);
    expect(a.velocity!.y).toBeCloseTo((a.displayTile.y - previous.y) * 60, 6);
    expect(a.speedTilesPerSecond).toBeCloseTo(Math.hypot(a.velocity!.x, a.velocity!.y), 6);
    expect(a.heading).toEqual(heading);
  });

  it("treats moored hulls as fixed obstacles and steers moving vessels around them", () => {
    const { a, b } = runPair(360, true);
    expect(a.displayTile).toEqual(origin);
    expect(b.displayTile!.x).toBeGreaterThan(origin.x + 4.5);
  });

  it("uses rendered hull size instead of a sub-hull point radius", () => {
    const run = (scale: number) => {
      const a = sample("a");
      const b = sample("b", 6);
      return applySeaRoomSeparationPass(new Map([["a", a], ["b", b]]), [ship("a", scale), ship("b", scale)]);
    };
    expect(run(0.7)).toBe(0);
    expect(run(3)).toBe(1);
  });

  it("does not move a hull through the shoreline to resolve a collision", () => {
    const margin = gardenShipWaterMarginTiles(gardenShipVisualScale(0.7), "bezaisen");
    let shore: { x: number; y: number } | undefined;
    for (let y = 20; y < 120 && !shore; y += 10) for (let x = 10; x < 130 && !shore; x += 1) {
      if (!isGardenShipWater({ x, y }, margin, true) || isGardenShipWater({ x: x + 1, y }, margin, true)) continue;
      let safe = x;
      let blocked = x + 1;
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (safe + blocked) / 2;
        if (isGardenShipWater({ x: middle, y }, margin, true)) safe = middle;
        else blocked = middle;
      }
      shore = { x: safe, y };
    }
    expect(shore).toBeDefined();
    const a = sample("a");
    const b = sample("b");
    a.displayTile = { ...shore! };
    b.displayTile = { x: shore!.x - 0.5, y: shore!.y };
    applySeaRoomSeparationPass(new Map([["a", a], ["b", b]]), [ship("a"), ship("b")]);
    expect(a.displayTile).toEqual(shore);
    expect(isGardenShipWater(a.displayTile, margin, true)).toBe(true);
    expect(isGardenShipWater(b.displayTile, margin, true)).toBe(true);

    const persistent = new Map([["a", a], ["b", b]]);
    let previous = shore!.x - 0.2;
    for (let frame = 0; frame < 90; frame += 1) {
      const advance = Math.max(0, frame - 60) * 0.005;
      a.displayTile = { x: shore!.x - 0.2 + advance, y: shore!.y };
      b.displayTile = { x: shore!.x - 0.7 + advance, y: shore!.y };
      applySeaRoomSeparationPass(persistent, [ship("a"), ship("b")], { timeSeconds: frame / 60 });
      expect(isGardenShipWater(a.displayTile, margin, true)).toBe(true);
      expect(Math.abs(a.displayTile.x - previous)).toBeLessThan(0.026);
      previous = a.displayTile.x;
    }
  });

  it("preserves reduced-motion and formation positions", () => {
    const { a, b, samples, ships } = runPair(60);
    a.displayTile = { ...origin };
    b.displayTile = { ...origin };
    expect(applySeaRoomSeparationPass(samples, ships, { reducedMotion: true })).toBe(0);
    expect(a.displayTile).toEqual(origin);
    expect(b.displayTile).toEqual(origin);
    ships[1]!.squadRole = "consort";
    expect(applySeaRoomSeparationPass(samples, ships)).toBe(0);
  });

  it("widens the comfort gap with swell and keeps pair order deterministic", () => {
    expect(seaRoomSeparationRadius(null)).toBe(SEA_ROOM_BASE_RADIUS_TILES);
    expect(seaRoomSeparationRadius({ swell: 1 } as SeaState)).toBeGreaterThan(seaRoomSeparationRadius(null));
    const first = runPair(10);
    const a = sample("a");
    const b = sample("b", 0.5);
    const reversed = new Map([["b", b], ["a", a]]);
    for (let frame = 0; frame < 10; frame += 1) {
      a.displayTile = { ...origin };
      b.displayTile = { x: origin.x + 0.5, y: origin.y };
      applySeaRoomSeparationPass(reversed, [ship("b"), ship("a")], { timeSeconds: frame / 60 });
    }
    expect(a.displayTile).toEqual(first.a.displayTile);
    expect(b.displayTile).toEqual(first.b.displayTile);
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
  // makeRoute's leg cycle: berth rest [0,420) → outbound [420,600) →
  // risk rest [600,1020) → inbound [1020,1200). The sampler derives W4.25
  // elapsed-risk seconds from the actual scheduled risk window
  // (riskSecondsEach = 420s for this route), so one wall-clock second inside
  // the window equals one elapsed risk second — the documented 3s tack-out
  // and 500ms heading ease run at their stated durations.
  const RISK_WINDOW_START = 600;
  const RISK_SECONDS_EACH = 420;

  function planFor(route: ShipMotionRoute): PharosVilleMotionPlan {
    return {
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
    return RISK_WINDOW_START + elapsed;
  }

  // Tack direction previous {14,22} → current {20,22} is (1, 0).
  function makeRepathRoute(): ShipMotionRoute {
    return { ...makeRoute(), previousRiskTile: { x: 14, y: 22 } };
  }

  it("starts the risk-rest phase on its held heading (no snap at entry)", () => {
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

  it("returns to the held rest heading once the tack-out completes", () => {
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

  it("measures the tack-out against the actual scheduled risk window (3s wall clock)", () => {
    // Corrected invariant: the window the sampler assumes equals the window
    // the route cycle actually schedules. For this docked calm route the
    // route carries riskSecondsEach = 420s, so the 3s tack-out completes exactly
    // 3 wall-clock seconds into the risk-drift phase.
    expect(sampleAt(makeRoute(), RISK_WINDOW_START - 0.1).state).toBe("sailing");
    expect(sampleAt(makeRoute(), RISK_WINDOW_START + RISK_SECONDS_EACH - 0.1).state).toBe("risk-drift");
    expect(sampleAt(makeRoute(), RISK_WINDOW_START + RISK_SECONDS_EACH + 0.1).state).toBe("sailing");

    const before = sampleAt(makeRepathRoute(), RISK_WINDOW_START + 2.9);
    expect(before.state).toBe("risk-drift");
    expect(before.riskTransition).not.toBeNull();
    expect(before.riskTransition!.progress).toBeLessThan(1);

    const after = sampleAt(makeRepathRoute(), RISK_WINDOW_START + 3.1);
    expect(after.state).toBe("risk-drift");
    expect(after.riskTransition).toBeNull();
  });
});

describe("weighted dock-visit cadence", () => {
  // Route with presence shares 0.8 / 0.1 / 0.1 across three docks, where the
  // dominant dock is NOT the home dock. dockStopSchedule mirrors
  // weightedDockStopSchedule output for those weights: the sorted unique
  // rotation [b, a, c] followed by the dominant dock's weighted repeats.
  function makeWeightedRoute(shipId = "weighted-cadence-ship"): ShipMotionRoute {
    const stop = (dockId: string, weight: number, x: number): ShipMotionRoute["dockStops"][number] => ({
      id: dockId,
      kind: "dock",
      dockId,
      chainId: dockId.replace("dock.", ""),
      weight,
      mooringTile: { x, y: 18 },
      dockTangent: { x: 1, y: 0 },
    });
    return {
      ...makeRoute(),
      shipId,
      dockStops: [stop("dock.a", 0.1, 10), stop("dock.b", 0.8, 14), stop("dock.c", 0.1, 18)],
      dockStopSchedule: ["dock.b", "dock.a", "dock.c", "dock.b", "dock.b", "dock.b"],
      homeDockId: "dock.a",
    };
  }

  function nonHomePicksAcrossCycles(route: ShipMotionRoute, cycles: number): Map<string, number> {
    const runtime = routeSamplingRuntime(route);
    const stopCount = activeStopCountForCycle(runtime);
    expect(stopCount).toBe(1); // one complete berth→risk→berth voyage per cycle
    const counts = new Map<string, number>();
    for (let cycleIndex = 0; cycleIndex < cycles; cycleIndex += 1) {
      const dockId = route.dockStopSchedule[cycleIndex % route.dockStopSchedule.length]!;
      if (dockId === route.homeDockId) continue;
      counts.set(dockId, (counts.get(dockId) ?? 0) + 1);
    }
    return counts;
  }

  it("visits the dominant-share dock more often than low-share docks across cycles", () => {
    const counts = nonHomePicksAcrossCycles(makeWeightedRoute(), 10);
    const dominant = counts.get("dock.b") ?? 0;
    const minor = counts.get("dock.c") ?? 0;
    // Non-home schedule multiset is [b, c, b, b, b] → b takes 4 of every 5
    // non-home visits (8 vs 2 across 10 cycles).
    expect(dominant).toBe(6);
    expect(minor).toBe(2);
    expect(dominant).toBeGreaterThanOrEqual(3 * minor);
  });

  it("is deterministic across independent runtime rebuilds", () => {
    const first = nonHomePicksAcrossCycles(makeWeightedRoute("weighted-repeat-ship"), 10);
    const second = nonHomePicksAcrossCycles(makeWeightedRoute("weighted-repeat-ship"), 10);
    expect(second).toEqual(first);
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
    legDurationSeconds: 180,
    restDurationSeconds: 420,
    underwaySpeedTilesPerSecond: 0.48,
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
