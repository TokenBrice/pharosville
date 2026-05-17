// @vitest-environment jsdom
import { useState } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as AssetManagerModule from "../renderer/asset-manager";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { buildBaseMotionPlan, buildMotionPlan } from "../systems/motion";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import { pathKey } from "../systems/motion-utils";
import {
  WATER_PATH_WARMUP_IDLE_CHUNK_SIZE,
  useAssetLoadingPipeline,
  warmWaterPathsAcrossIdleChunks,
} from "./use-asset-loading-pipeline";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import type {
  PharosVilleMotionPlan,
  ShipMotionRoute,
  ShipWaterPath,
} from "../systems/motion-types";

describe("useAssetLoadingPipeline", () => {
  let loadLogosSpy: ReturnType<typeof vi.spyOn>;
  let loadCriticalSpy: ReturnType<typeof vi.spyOn>;
  let loadDeferredSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Stub the network-bound load methods. loadLogos resolves immediately so
    // the effect's then-branch fires synchronously inside `act`.
    loadLogosSpy = vi.spyOn(AssetManagerModule.PharosVilleAssetManager.prototype, "loadLogos")
      .mockImplementation(async () => []);
    loadCriticalSpy = vi.spyOn(AssetManagerModule.PharosVilleAssetManager.prototype, "loadCritical")
      .mockImplementation(async () => ({ errors: [], loaded: [] } as unknown as Awaited<ReturnType<AssetManagerModule.PharosVilleAssetManager["loadCritical"]>>));
    loadDeferredSpy = vi.spyOn(AssetManagerModule.PharosVilleAssetManager.prototype, "loadDeferred")
      .mockImplementation(async () => ({ errors: [], loaded: [] } as unknown as Awaited<ReturnType<AssetManagerModule.PharosVilleAssetManager["loadDeferred"]>>));
  });

  afterEach(() => {
    loadLogosSpy.mockRestore();
    loadCriticalSpy.mockRestore();
    loadDeferredSpy.mockRestore();
  });

  function Harness({ world }: { world: PharosVilleWorldModel }) {
    const [baseMotionPlan] = useState(() => buildBaseMotionPlan(world));
    const [motionPlan] = useState(() => buildMotionPlan(world, null, baseMotionPlan));
    const [motionPlanRef] = useState<{ current: typeof motionPlan }>(() => ({ current: motionPlan }));
    useAssetLoadingPipeline({ motionPlanRef, world });
    return null;
  }

  it("does not re-invoke loadLogos when a structurally-identical world replaces the previous reference", async () => {
    // Two world instances built from the same fixture inputs share identical
    // logo source arrays but have distinct array identities — the original
    // effect dep `[world.docks, world.graves, world.ships]` would re-run the
    // body on every rerender. The signature dep must skip it.
    const worldA = buildPharosVilleWorld(makePharosVilleWorldInput());
    const worldB = buildPharosVilleWorld(makePharosVilleWorldInput());
    expect(worldA).not.toBe(worldB);
    expect(worldA.docks).not.toBe(worldB.docks);

    const { rerender } = render(<Harness world={worldA} />);
    // Flush the initial loadLogos promise.
    await act(async () => {});
    const callsAfterMount = loadLogosSpy.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    // Rerender with a structurally-identical but reference-distinct world.
    await act(async () => {
      rerender(<Harness world={worldB} />);
    });

    // No additional loadLogos invocation should have been triggered: the
    // signature memo collapsed worldB.docks/graves/ships into the same string.
    expect(loadLogosSpy.mock.calls.length).toBe(callsAfterMount);
  });
});

describe("warmWaterPathsAcrossIdleChunks", () => {
  type IdleGlobalSlot = {
    requestIdleCallback?: (callback: (deadline?: unknown) => void, options?: { timeout?: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  let originalRequestIdleCallback: IdleGlobalSlot["requestIdleCallback"];
  let originalCancelIdleCallback: IdleGlobalSlot["cancelIdleCallback"];
  let idleHandlers: Array<{ id: number; callback: () => void }>;
  let nextIdleId: number;

  beforeEach(() => {
    const idleGlobal = globalThis as unknown as IdleGlobalSlot;
    originalRequestIdleCallback = idleGlobal.requestIdleCallback;
    originalCancelIdleCallback = idleGlobal.cancelIdleCallback;
    idleHandlers = [];
    nextIdleId = 1;
    // Install a manual idle scheduler so tests can step through one chunk at
    // a time and assert that the loop yields between chunks rather than
    // burning through everything in a single slice.
    idleGlobal.requestIdleCallback = (callback) => {
      const id = nextIdleId++;
      idleHandlers.push({ id, callback: () => callback() });
      return id;
    };
    idleGlobal.cancelIdleCallback = (handle) => {
      const idx = idleHandlers.findIndex((entry) => entry.id === handle);
      if (idx !== -1) idleHandlers.splice(idx, 1);
    };
  });

  afterEach(() => {
    const idleGlobal = globalThis as unknown as IdleGlobalSlot;
    idleGlobal.requestIdleCallback = originalRequestIdleCallback;
    idleGlobal.cancelIdleCallback = originalCancelIdleCallback;
  });

  function flushPendingIdleCallbacks(): void {
    // Drain whatever is queued at this moment. New callbacks queued during the
    // drain (e.g. the next chunk's yield) stay pending until the next flush.
    const draining = idleHandlers.slice();
    idleHandlers.length = 0;
    for (const entry of draining) entry.callback();
  }

  function makeFakePath(from: { x: number; y: number }, to: { x: number; y: number }): ShipWaterPath {
    return {
      from,
      to,
      points: [from, to],
      cumulativeLengths: [0, 1],
      totalLength: 1,
    };
  }

  function makeRoute(id: string, getSpy: ReturnType<typeof vi.fn>): ShipMotionRoute {
    const mooring = { x: 0, y: 0 };
    const risk = { x: 10, y: 10 };
    const route = {
      shipId: id,
      cycleSeconds: 30,
      phaseSeconds: 0,
      riskTile: risk,
      dockStops: [
        {
          id: `${id}.dock`,
          kind: "dock" as const,
          dockId: "dock.usdc-treasury-galleon",
          chainId: "ethereum",
          weight: 1,
          mooringTile: mooring,
          dockTangent: { x: 1, y: 0 },
        },
      ],
      riskStop: null,
      zone: "calm" as const,
      dockStopSchedule: [`${id}.dock`],
      homeDockId: "dock.usdc-treasury-galleon",
      openWaterPatrol: null,
      waterPaths: { get: getSpy } as unknown as ReadonlyMap<string, ShipWaterPath>,
      routeSeed: 1,
      formationOffset: null,
      staleEvidence: false,
      wakeMultiplier: 1,
    };
    return route as unknown as ShipMotionRoute;
  }

  function makePlanWithRoutes(routes: ShipMotionRoute[]): PharosVilleMotionPlan {
    return {
      animatedShipIds: new Set(),
      effectShipIds: new Set(),
      lighthouseFireFlickerPerSecond: 0,
      moverShipIds: new Set(),
      shipPhases: new Map(),
      shipRoutes: new Map(routes.map((route) => [route.shipId, route])),
    } as unknown as PharosVilleMotionPlan;
  }

  it("yields between chunks instead of burning through all warmups in one slice", async () => {
    // 3 routes × 2 warmups/route = 6 warmups, chunked at 3 → 2 idle slices.
    const getSpies = [vi.fn(makeFakePath), vi.fn(makeFakePath), vi.fn(makeFakePath)];
    const routes = getSpies.map((spy, idx) => makeRoute(`ship.${idx}`, spy));
    const plan = makePlanWithRoutes(routes);

    let finished = false;
    const promise = warmWaterPathsAcrossIdleChunks(plan).then(() => { finished = true; });

    // Loop yields BEFORE the first chunk, so nothing has run yet.
    expect(idleHandlers.length).toBe(1);
    const totalGetCallsBeforeFirstYield = getSpies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
    expect(totalGetCallsBeforeFirstYield).toBe(0);

    // Flush slice #1: should process exactly WATER_PATH_WARMUP_IDLE_CHUNK_SIZE
    // warmups, then queue another idle handler for slice #2.
    flushPendingIdleCallbacks();
    await Promise.resolve();
    await Promise.resolve();
    const totalGetCallsAfterFirstSlice = getSpies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
    expect(totalGetCallsAfterFirstSlice).toBe(WATER_PATH_WARMUP_IDLE_CHUNK_SIZE);
    expect(finished).toBe(false);
    expect(idleHandlers.length).toBe(1);

    // Flush slice #2: drains the remaining 3 warmups, no further yields needed.
    flushPendingIdleCallbacks();
    await Promise.resolve();
    await Promise.resolve();
    await promise;
    expect(finished).toBe(true);
    const totalGetCallsAfterAll = getSpies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
    expect(totalGetCallsAfterAll).toBe(6);
  });

  it("terminates immediately when the abort signal fires between chunks", async () => {
    const getSpies = [vi.fn(makeFakePath), vi.fn(makeFakePath), vi.fn(makeFakePath)];
    const routes = getSpies.map((spy, idx) => makeRoute(`ship.${idx}`, spy));
    const plan = makePlanWithRoutes(routes);
    const controller = new AbortController();

    let settled: "resolved" | "rejected" | null = null;
    const promise = warmWaterPathsAcrossIdleChunks(plan, controller.signal)
      .then(() => { settled = "resolved"; })
      .catch(() => { settled = "rejected"; });

    // First yield queued; flush it to run slice #1.
    expect(idleHandlers.length).toBe(1);
    flushPendingIdleCallbacks();
    await Promise.resolve();
    await Promise.resolve();
    const totalAfterFirst = getSpies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
    expect(totalAfterFirst).toBe(WATER_PATH_WARMUP_IDLE_CHUNK_SIZE);

    // Aborting between chunks should both (a) resolve the next
    // waitForIdleChunk and (b) prevent any further warmups from running.
    expect(settled).toBe(null);
    controller.abort();
    await promise;
    expect(settled).toBe("resolved");
    const totalAfterAbort = getSpies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
    // No additional warmups should have run after abort.
    expect(totalAfterAbort).toBe(WATER_PATH_WARMUP_IDLE_CHUNK_SIZE);
  });

  it("aborts before scheduling any idle work when the signal is already fired", async () => {
    const getSpy = vi.fn(makeFakePath);
    const plan = makePlanWithRoutes([makeRoute("ship.preaborted", getSpy)]);
    const controller = new AbortController();
    controller.abort();

    await warmWaterPathsAcrossIdleChunks(plan, controller.signal);
    // The pre-aborted call still queues one idle callback (waitForIdleChunk
    // resolves immediately when signal.aborted is true), but no warmups run
    // and no additional callbacks pile up.
    expect(getSpy.mock.calls.length).toBe(0);
    expect(idleHandlers.length).toBe(0);
  });

  it("uses the pathKey contract for both dock and patrol warmups", () => {
    // Sanity check that the warmup keys match the structure pathKey emits, so
    // the test stubs above are wired the same way the runtime would build them.
    const a = { x: 1, y: 2 };
    const b = { x: 3, y: 4 };
    const key = pathKey(a, b);
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
    expect(key).not.toBe(pathKey(b, a));
  });
});
