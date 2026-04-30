import { describe, expect, it, vi } from "vitest";
import { fixtureChains, fixturePegSummary, fixtureReportCards, fixtureStablecoins, fixtureStability, fixtureStress } from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { fitCameraToMap } from "../systems/projection";
import type { PharosVilleAssetManifestEntry } from "../systems/asset-manifest";
import type { PharosVilleAssetManager } from "./asset-manager";
import { createRenderFrameCache } from "./frame-cache";
import type { DrawPharosVilleInput } from "./render-types";

const assetEntry: PharosVilleAssetManifestEntry = {
  anchor: [8, 4],
  category: "dock",
  displayScale: 1,
  footprint: [1, 1],
  height: 55,
  hitbox: [8, 4, 80, 55],
  id: "dock.wooden-pier",
  layer: "docks",
  loadPriority: "critical",
  path: "docks/wooden-pier.png",
  width: 96,
};

describe("render frame cache", () => {
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
  const camera = fitCameraToMap({ width: 1440, height: 1000, map: world.map });

  it("reuses resolved geometry for repeated entity passes in one frame", () => {
    const ship = world.ships[0]!;
    const sampledTile = { x: ship.tile.x + 2, y: ship.tile.y + 1 };
    const cache = createRenderFrameCache(makeInput({
      shipMotionSamples: new Map([
        [ship.id, {
          currentDockId: null,
          currentRouteStopId: null,
          currentRouteStopKind: null,
          heading: { x: 1, y: 0 },
          shipId: ship.id,
          state: "sailing",
          tile: sampledTile,
          wakeIntensity: 0.4,
          zone: ship.riskZone,
        }],
      ]),
    }));

    const first = cache.geometryForEntity(ship);
    const second = cache.geometryForEntity(ship);

    expect(second).toBe(first);
    expect(first.followTile).toEqual(sampledTile);
  });

  it("caches dock asset fallback resolution for the frame", () => {
    const dock = world.docks[0]!;
    const dockAsset = { entry: assetEntry, image: {} as HTMLImageElement };
    const get = vi.fn((id: string) => id === "dock.wooden-pier" ? dockAsset : null);
    const cache = createRenderFrameCache(makeInput({
      assets: { get } as unknown as PharosVilleAssetManager,
    }));

    expect(cache.assetForEntity(dock)).toBe(dockAsset);
    expect(cache.assetForEntity(dock)).toBe(dockAsset);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenNthCalledWith(1, dock.assetId);
    expect(get).toHaveBeenNthCalledWith(2, "dock.wooden-pier");
  });

  function makeInput(overrides: Partial<DrawPharosVilleInput> = {}): DrawPharosVilleInput {
    return {
      assets: null,
      camera,
      ctx: {} as CanvasRenderingContext2D,
      height: 1000,
      hoveredTarget: null,
      motion: {
        plan: {
          animatedShipIds: new Set(),
          effectShipIds: new Set(),
          lighthouseFireFlickerPerSecond: 0,
          moverShipIds: new Set(),
          shipPhases: new Map(),
          shipRoutes: new Map(),
        },
        reducedMotion: true,
        timeSeconds: 0,
      },
      selectedTarget: null,
      targets: [],
      width: 1440,
      world,
      ...overrides,
    };
  }
});
