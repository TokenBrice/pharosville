import { describe, expect, it } from "vitest";
import {
  createVisualMotionSmoothingState,
  smoothShipMotionSamples,
  type VisualMotionSmoothingState,
} from "./visual-motion";
import type { ShipMotionSample } from "./motion-types";

describe("visual motion smoothing", () => {
  it("snaps the first sample into display memory", () => {
    const state = createVisualMotionSmoothingState();
    const target = sample({
      shipId: "ship-a",
      tile: { x: 12.5, y: 8.25 },
      heading: { x: 0, y: 1 },
      wakeIntensity: 0.7,
      currentDockId: "dock.ethereum",
      currentRouteStopId: "dock.ethereum:ship-a",
      currentRouteStopKind: "dock",
      mooringSubPhase: "working",
      fenderContact: 0.4,
    });

    const display = smoothShipMotionSamples({
      targetSamples: new Map([[target.shipId, target]]),
      state,
      timeSeconds: 5,
    });

    expect(display.get(target.shipId)).toEqual(target);
    expect(state.memory.get(target.shipId)?.initialized).toBe(true);
  });

  it("converges tile and numeric fields without jumping to the target", () => {
    const state = createVisualMotionSmoothingState();
    smoothAt(state, 0, sample({ tile: { x: 0, y: 0 }, wakeIntensity: 0, fenderContact: 0 }));

    const target = sample({ tile: { x: 10, y: 0 }, wakeIntensity: 1, fenderContact: 1 });
    const firstDisplay = smoothAt(state, 1 / 60, target, { snapDistanceTiles: 100 });
    expect(firstDisplay.tile.x).toBeGreaterThan(0);
    expect(firstDisplay.tile.x).toBeLessThan(10);
    expect(firstDisplay.wakeIntensity).toBeGreaterThan(0);
    expect(firstDisplay.wakeIntensity).toBeLessThan(1);
    expect(firstDisplay.fenderContact).toBeGreaterThan(0);
    expect(firstDisplay.fenderContact).toBeLessThan(1);

    let display = firstDisplay;
    for (let frame = 2; frame <= 120; frame += 1) {
      display = smoothAt(state, frame / 60, target, { snapDistanceTiles: 100 });
    }

    expect(display.tile.x).toBeGreaterThan(9.99);
    expect(display.wakeIntensity).toBeGreaterThan(0.99);
    expect(display.fenderContact).toBeGreaterThan(0.99);
  });

  it("syncs exact samples in reduced-motion and static modes", () => {
    const reducedState = createVisualMotionSmoothingState();
    smoothAt(reducedState, 0, sample({ tile: { x: 0, y: 0 }, heading: { x: 1, y: 0 }, wakeIntensity: 0 }));
    const reducedTarget = sample({
      tile: { x: 40, y: 9 },
      heading: { x: 0, y: 1 },
      wakeIntensity: 1,
      mooringTension: 0.85,
    });

    const reducedDisplay = smoothAt(reducedState, 0.1, reducedTarget, { reducedMotion: true, snapDistanceTiles: 100 });
    expect(reducedDisplay).toEqual(reducedTarget);

    const staticState = createVisualMotionSmoothingState();
    smoothAt(staticState, 0, sample({ tile: { x: 1, y: 1 }, wakeIntensity: 0.2 }));
    const staticTarget = sample({ tile: { x: 6, y: 5 }, wakeIntensity: 0.9, lanternAlpha: 0.75 });
    const staticDisplay = smoothAt(staticState, 0.1, staticTarget, { staticMode: true, snapDistanceTiles: 100 });
    expect(staticDisplay).toEqual(staticTarget);
  });

  it("smooths compatible state transitions instead of snapping", () => {
    const state = createVisualMotionSmoothingState();
    smoothAt(state, 0, sample({
      state: "moored",
      tile: { x: 2, y: 2 },
      heading: { x: 0, y: -1 },
      routeKey: "route-a",
      routePathKey: "route-a|moored:dock.ethereum",
      currentDockId: "dock.ethereum",
      currentRouteStopId: "dock.ethereum:ship-a",
      currentRouteStopKind: "dock",
      mooringSubPhase: "cast-off-prep",
    }));

    const target = sample({
      state: "departing",
      tile: { x: 2.75, y: 2 },
      heading: { x: 1, y: 0 },
      routeKey: "route-a",
      routePathKey: "route-a|departing:dock.ethereum",
      currentDockId: "dock.ethereum",
      currentRouteStopId: "dock.ethereum:ship-a",
      currentRouteStopKind: "dock",
      mooringSubPhase: null,
      wakeIntensity: 0.2,
    });
    const display = smoothAt(state, 1 / 60, target, { snapDistanceTiles: 100 });

    expect(display.state).toBe("departing");
    expect(display.tile.x).toBeGreaterThan(2);
    expect(display.tile.x).toBeLessThan(target.tile.x);
    expect(display).not.toEqual(target);
    expect(display.velocity?.x).toBeGreaterThan(0);
    expect(display.speedTilesPerSecond).toBeGreaterThan(0);
  });

  it("smooths risk-drift into arriving when the route remains continuous", () => {
    const state = createVisualMotionSmoothingState();
    smoothAt(state, 0, sample({
      state: "risk-drift",
      tile: { x: 18, y: 20 },
      routeKey: "route-a",
      routePathKey: "route-a|risk-drift",
      currentDockId: null,
      currentRouteStopId: null,
      currentRouteStopKind: null,
    }));

    const target = sample({
      state: "arriving",
      tile: { x: 18.5, y: 20.25 },
      routeKey: "route-a",
      routePathKey: "route-a|arriving:dock.ethereum",
      currentDockId: "dock.ethereum",
      currentRouteStopId: "dock.ethereum:ship-a",
      currentRouteStopKind: "dock",
      wakeIntensity: 0.4,
    });
    const display = smoothAt(state, 1 / 60, target, { snapDistanceTiles: 100 });

    expect(display.state).toBe("arriving");
    expect(display.tile.x).toBeGreaterThan(18);
    expect(display.tile.x).toBeLessThan(target.tile.x);
    expect(display.currentRouteStopId).toBe(target.currentRouteStopId);
  });

  it("snaps on incompatible state changes instead of smearing between unrelated poses", () => {
    const state = createVisualMotionSmoothingState();
    smoothAt(state, 0, sample({
      state: "moored",
      tile: { x: 2, y: 2 },
      heading: { x: 0, y: -1 },
      currentDockId: "dock.ethereum",
      currentRouteStopId: "dock.ethereum:ship-a",
      currentRouteStopKind: "dock",
    }));

    const target = sample({
      state: "sailing",
      tile: { x: 24, y: 30 },
      heading: { x: 1, y: 0 },
      wakeIntensity: 0.9,
      currentDockId: null,
      currentRouteStopId: null,
      currentRouteStopKind: null,
    });
    const display = smoothAt(state, 1 / 60, target, { snapDistanceTiles: 1000 });

    expect(display).toEqual(target);
  });

  it("snaps when the same display key resolves to a different ship identity", () => {
    const state = createVisualMotionSmoothingState();
    smoothShipMotionSamples({
      targetSamples: new Map([["display-key", sample({ shipId: "ship-a", tile: { x: 1, y: 1 } })]]),
      state,
      timeSeconds: 0,
    });
    const target = sample({ shipId: "ship-b", tile: { x: 2, y: 2 }, wakeIntensity: 0.9 });
    const display = smoothShipMotionSamples({
      targetSamples: new Map([["display-key", target]]),
      state,
      timeSeconds: 1 / 60,
      config: { snapDistanceTiles: 100 },
    }).get("display-key");

    expect(display).toEqual(target);
  });

  it("snaps on backwards time and large frame gaps", () => {
    const backwardsState = createVisualMotionSmoothingState();
    smoothAt(backwardsState, 10, sample({ tile: { x: 0, y: 0 } }));
    const backwardsTarget = sample({ tile: { x: 4, y: 0 }, wakeIntensity: 0.9 });

    expect(smoothAt(backwardsState, 9, backwardsTarget, { snapDistanceTiles: 100 })).toEqual(backwardsTarget);

    const gapState = createVisualMotionSmoothingState();
    smoothAt(gapState, 0, sample({ tile: { x: 0, y: 0 } }));
    const gapTarget = sample({ tile: { x: 2, y: 0 }, wakeIntensity: 0.8 });

    expect(smoothAt(gapState, 1, gapTarget, { snapDistanceTiles: 100 })).toEqual(gapTarget);
  });

  it("prunes display samples and memory when ships disappear", () => {
    const state = createVisualMotionSmoothingState();
    const shipA = sample({ shipId: "ship-a", tile: { x: 1, y: 1 } });
    const shipB = sample({ shipId: "ship-b", tile: { x: 2, y: 2 } });

    smoothShipMotionSamples({
      targetSamples: new Map([[shipA.shipId, shipA], [shipB.shipId, shipB]]),
      state,
      timeSeconds: 0,
    });
    expect(state.displaySamples.has("ship-b")).toBe(true);
    expect(state.memory.has("ship-b")).toBe(true);

    smoothShipMotionSamples({
      targetSamples: new Map([[shipA.shipId, shipA]]),
      state,
      timeSeconds: 1 / 60,
    });

    expect(state.displaySamples.has("ship-a")).toBe(true);
    expect(state.displaySamples.has("ship-b")).toBe(false);
    expect(state.memory.has("ship-a")).toBe(true);
    expect(state.memory.has("ship-b")).toBe(false);
  });

  it("normalizes smoothed heading vectors", () => {
    const state = createVisualMotionSmoothingState();
    smoothAt(state, 0, sample({ heading: { x: 1, y: 0 } }));

    const display = smoothAt(state, 1 / 60, sample({ heading: { x: 0, y: 10 } }), {
      snapDistanceTiles: 100,
    });
    const length = Math.hypot(display.heading.x, display.heading.y);

    expect(length).toBeCloseTo(1, 10);
    expect(display.heading.x).toBeGreaterThan(0);
    expect(display.heading.x).toBeLessThan(1);
    expect(display.heading.y).toBeGreaterThan(0);
  });
});

function smoothAt(
  state: VisualMotionSmoothingState,
  timeSeconds: number,
  target: ShipMotionSample,
  options: {
    reducedMotion?: boolean;
    staticMode?: boolean;
    snapDistanceTiles?: number;
  } = {},
): ShipMotionSample {
  const display = smoothShipMotionSamples({
    targetSamples: new Map([[target.shipId, target]]),
    state,
    timeSeconds,
    reducedMotion: options.reducedMotion,
    staticMode: options.staticMode,
    config: {
      snapDistanceTiles: options.snapDistanceTiles,
    },
  });
  const displaySample = display.get(target.shipId);
  if (!displaySample) throw new Error(`Missing display sample for ${target.shipId}`);
  return displaySample;
}

function sample(overrides: Partial<ShipMotionSample> = {}): ShipMotionSample {
  const tile = overrides.tile ?? { x: 4, y: 4 };
  const heading = overrides.heading ?? { x: 1, y: 0 };
  const base: ShipMotionSample = {
    shipId: "ship-a",
    tile: { x: tile.x, y: tile.y },
    state: "sailing",
    zone: "calm",
    routeKey: "route-a",
    routePathKey: "route-a|sailing",
    currentDockId: null,
    currentRouteStopId: null,
    currentRouteStopKind: null,
    heading: { x: 1, y: 0 },
    velocity: { x: 0, y: 0 },
    speedTilesPerSecond: 0,
    wakeIntensity: 0.5,
    mooringSubPhase: null,
    mooringSwayAmplitude: 1,
    mooringTension: 0,
    lanternAlpha: 0,
    fenderContact: 0,
    seaState: null,
  };

  return {
    ...base,
    ...overrides,
    tile: { x: tile.x, y: tile.y },
    heading: { x: heading.x, y: heading.y },
  };
}
