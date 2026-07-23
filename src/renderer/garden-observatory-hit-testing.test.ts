import { describe, expect, it } from "vitest";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureStability,
} from "../__fixtures__/pharosville-world";
import {
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_SHIP_ROOT_Y,
  gardenIslandDisplayTile,
  gardenTileToScreen,
  resolveGardenShipDisplayTile,
  selectGardenObservatorySlice,
} from "../systems/garden-observatory-slice";
import type { ShipMotionSample } from "../systems/motion";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { createGardenObservatoryHitTargetSnapshot } from "./garden-observatory-hit-testing";

describe("Garden Observatory hit targets", () => {
  it("publishes the lighthouse, production docks, and the 20-ship overview", () => {
    const world = denseWorld();
    const camera = { offsetX: 720, offsetY: 430, zoom: 1 };
    const slice = selectGardenObservatorySlice(world, null);
    const snapshot = createGardenObservatoryHitTargetSnapshot({ camera, world });

    expect(snapshot.targets).toHaveLength(
      22 + world.docks.length + world.areas.length + world.graves.length,
    );
    expect(snapshot.targets.filter((target) => target.kind === "ship")).toHaveLength(20);
    expect(snapshot.targets.filter((target) => target.kind === "dock")).toHaveLength(world.docks.length);
    expect(snapshot.targets.filter((target) => target.kind === "lighthouse")).toHaveLength(1);
    expect(snapshot.targets.filter((target) => target.kind === "area")).toHaveLength(world.areas.length);
    expect(snapshot.targets.filter((target) => target.kind === "pigeonnier")).toHaveLength(1);
    expect(new Set(snapshot.targets.map((target) => target.detailId))).toEqual(new Set([
      world.lighthouse.detailId,
      ...world.docks.map((dock) => dock.detailId),
      ...world.areas.map((area) => area.detailId),
      world.pigeonnier.detailId,
      ...world.graves.map((grave) => grave.detailId),
      ...slice.ships.map(({ ship }) => ship.detailId),
    ]));
  });

  it("adds an inspected outsider as the sole transient target", () => {
    const world = denseWorld();
    const overview = selectGardenObservatorySlice(world, null);
    const outsider = world.ships.find((ship) => !overview.representativeDetailIds.has(ship.detailId));
    expect(outsider).toBeDefined();

    const snapshot = createGardenObservatoryHitTargetSnapshot({
      camera: { offsetX: 720, offsetY: 430, zoom: 1 },
      selectedDetailId: outsider!.detailId,
      world,
    });
    expect(snapshot.targets.filter((target) => target.kind === "ship")).toHaveLength(21);
    expect(snapshot.targetsByDetailId.has(outsider!.detailId)).toBe(true);
  });

  it("covers the rendered lighthouse from its foundation through its finial", () => {
    const world = denseWorld();
    const camera = { offsetX: 720, offsetY: 430, zoom: 1 };
    const islandTile = gardenIslandDisplayTile(world.lighthouse.tile);
    const lighthouseTile = {
      x: islandTile.x + GARDEN_LIGHTHOUSE_ROOT_OFFSET.x / Math.SQRT2,
      y: islandTile.y + GARDEN_LIGHTHOUSE_ROOT_OFFSET.z / Math.SQRT2,
    };
    const base = gardenTileToScreen(
      lighthouseTile,
      GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
      camera,
    );
    const beacon = gardenTileToScreen(
      lighthouseTile,
      GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + GARDEN_LIGHTHOUSE_BEACON_Y,
      camera,
    );
    const top = gardenTileToScreen(
      lighthouseTile,
      GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + GARDEN_LIGHTHOUSE_HEIGHT,
      camera,
    );
    const target = createGardenObservatoryHitTargetSnapshot({ camera, world })
      .targetsByDetailId.get(world.lighthouse.detailId);

    expect(target?.anchor).toEqual(beacon);
    expect(target && pointInRect(base, target.rect)).toBe(true);
    expect(target && pointInRect(top, target.rect)).toBe(true);
  });

  it("anchors a ship target to the exact shared displayed tile", () => {
    const world = denseWorld();
    const placement = selectGardenObservatorySlice(world, null).ships.find(({ displayOffset }) => (
      displayOffset.x !== 0 || displayOffset.y !== 0
    ));
    expect(placement).toBeDefined();
    const camera = { offsetX: 720, offsetY: 430, zoom: 1.1 };
    const sample = {
      mapVisibilityAlpha: 0,
      tile: { x: 10, y: 14 },
    } as ShipMotionSample;
    const samples = new Map([[placement!.ship.id, sample]]);
    const expectedTile = resolveGardenShipDisplayTile({
      ...placement!,
      sample,
    });

    const overview = createGardenObservatoryHitTargetSnapshot({
      camera,
      shipMotionSamples: samples,
      world,
    });
    expect(overview.targetsByDetailId.get(placement!.ship.detailId)?.anchor).toEqual(
      gardenTileToScreen(expectedTile, GARDEN_SHIP_ROOT_Y, camera),
    );

    const inspected = createGardenObservatoryHitTargetSnapshot({
      camera,
      selectedDetailId: placement!.ship.detailId,
      shipMotionSamples: samples,
      world,
    });
    expect(inspected.targetsByDetailId.get(placement!.ship.detailId)?.anchor).toEqual(
      gardenTileToScreen(expectedTile, GARDEN_SHIP_ROOT_Y, camera),
    );
  });
});

function denseWorld() {
  return buildPharosVilleWorld({
    cemeteryEntries: [],
    chains: denseFixtureChains,
    freshness: {},
    pegSummary: denseFixturePegSummary,
    reportCards: denseFixtureReportCards,
    stability: fixtureStability,
    stablecoins: denseFixtureStablecoins,
    stress: denseFixtureStress,
  });
}

function pointInRect(
  point: { x: number; y: number },
  rect: { height: number; width: number; x: number; y: number },
): boolean {
  return (
    point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
  );
}
