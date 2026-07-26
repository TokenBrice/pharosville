import { describe, expect, it } from "vitest";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import type { PharosVilleWorld } from "./world-types";
import { worldRenderContentSignature } from "./world-render-content-signature";

describe("worldRenderContentSignature", () => {
  it("ignores refresh metadata and detail-only records", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const refreshed: PharosVilleWorld = {
      ...world,
      detailIndex: { ...world.detailIndex },
      entityById: { ...world.entityById },
      freshness: { ...world.freshness, stablecoinsStale: !world.freshness.stablecoinsStale },
      generatedAt: (world.generatedAt ?? 0) + 60_000,
      visualCues: [...world.visualCues],
    };

    expect(worldRenderContentSignature(refreshed)).toBe(worldRenderContentSignature(world));
  });

  it("ignores sub-band dock-supply noise but catches an authored size-band change", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const nudgeDocks = (factor: number): PharosVilleWorld => ({
      ...world,
      docks: world.docks.map((dock) => ({ ...dock, totalUsd: dock.totalUsd * factor })),
    });
    const resized: PharosVilleWorld = {
      ...world,
      docks: world.docks.map((dock, index) => (
        index === 0 ? { ...dock, size: dock.size === 1 ? 2 : dock.size - 1 } : dock
      )),
    };

    expect(worldRenderContentSignature(nudgeDocks(1.0005)))
      .toBe(worldRenderContentSignature(world));
    expect(worldRenderContentSignature(resized))
      .not.toBe(worldRenderContentSignature(world));
  });

  it("treats the polling probe's sub-percent supply refresh as renderer-equivalent", () => {
    const input = makePharosVilleWorldInput();
    const stablecoins = {
      ...input.stablecoins!,
      peggedAssets: input.stablecoins!.peggedAssets.map((asset) => ({
        ...asset,
        circulating: asset.circulating
          ? {
              ...asset.circulating,
              peggedUSD: (asset.circulating.peggedUSD ?? 0) * 1.0004,
            }
          : asset.circulating,
      })),
    };
    const baseline = buildPharosVilleWorld(input);
    const refreshed = buildPharosVilleWorld({ ...input, stablecoins });

    expect(JSON.parse(worldRenderContentSignature(refreshed)))
      .toEqual(JSON.parse(worldRenderContentSignature(baseline)));
  });

  it("changes for baked ship visuals and analytical area semantics", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());
    const subject = world.ships[0]!;
    const changedShip: PharosVilleWorld = {
      ...world,
      ships: world.ships.map((ship) => (
        ship.id === subject.id
          ? {
              ...ship,
              visual: {
                ...ship.visual,
                overlay: ship.visual.overlay === "nav" ? "yield" : "nav",
              },
            }
          : ship
      )),
    };
    const changedArea: PharosVilleWorld = {
      ...world,
      areas: world.areas.map((area, index) => (
        index === 0 ? { ...area, label: `${area.label} revised` } : area
      )),
    };

    expect(worldRenderContentSignature(changedShip))
      .not.toBe(worldRenderContentSignature(world));
    expect(worldRenderContentSignature(changedArea))
      .not.toBe(worldRenderContentSignature(world));
  });
});
