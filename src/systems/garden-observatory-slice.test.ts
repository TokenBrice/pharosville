import { describe, expect, it } from "vitest";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureStability,
} from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import {
  GARDEN_SHIP_ROOT_Y,
  gardenAreaCenterTile,
  gardenAreaDisplayTile,
  gardenCameraViewHeight,
  gardenDockDisplayTile,
  gardenSemanticView,
  gardenTileToScreen,
  representativeShipDisplayOffsets,
  resolveGardenEntityDisplayTile,
  resolveGardenShipDisplayTile,
  selectGardenObservatorySlice,
} from "./garden-observatory-slice";
import { tileToScreen } from "./projection";

describe("Garden Observatory slice", () => {
  it("derives Overview, Explore, and Analyze without a second mode state", () => {
    expect(gardenSemanticView(0.8, null)).toBe("overview");
    expect(gardenSemanticView(1.05, null)).toBe("explore");
    expect(gardenSemanticView(0.8, "ship.usdc")).toBe("analyze");
  });

  it("keeps exactly 20 default representatives and adds only the inspected outsider", () => {
    const world = denseWorld();
    const overview = selectGardenObservatorySlice(world, null);
    const outsider = world.ships.find((ship) => !overview.representativeDetailIds.has(ship.detailId));

    expect(world.ships.length).toBeGreaterThan(20);
    expect(overview.ships).toHaveLength(20);
    expect(overview.ships.every((placement) => placement.representative)).toBe(true);
    expect(overview.docks).toHaveLength(2);
    expect(overview.areas.length).toBeLessThanOrEqual(2);
    expect(outsider).toBeDefined();

    const inspected = selectGardenObservatorySlice(world, outsider!.detailId);
    expect(inspected.ships).toHaveLength(21);
    expect(inspected.transientSelectedDetailId).toBe(outsider!.detailId);
    expect(inspected.ships.at(-1)).toMatchObject({
      displayOffset: { x: 0, y: 0 },
      representative: false,
      ship: { detailId: outsider!.detailId },
    });

    expect(selectGardenObservatorySlice(world, overview.ships[0]!.ship.detailId).ships).toHaveLength(20);
    expect(selectGardenObservatorySlice(world, null).ships).toHaveLength(20);
  });

  it("keeps representative offsets stable and materializes transients at their samples", () => {
    const world = denseWorld();
    const placement = selectGardenObservatorySlice(world, null).ships.find(({ displayOffset }) => (
      displayOffset.x !== 0 || displayOffset.y !== 0
    ));
    expect(placement).toBeDefined();
    const sample = {
      mapVisibilityAlpha: 0,
      tile: { x: 9, y: 11 },
    };

    const representativeDisplay = resolveGardenShipDisplayTile({
      ...placement!,
      sample,
    });
    const representativeBase = {
      x: placement!.ship.tile.x + placement!.displayOffset.x,
      y: placement!.ship.tile.y + placement!.displayOffset.y,
    };
    expect(Math.hypot(
      representativeDisplay.x - representativeBase.x,
      representativeDisplay.y - representativeBase.y,
    )).toBeCloseTo(2.5);

    const outsider = world.ships.find((ship) => (
      !selectGardenObservatorySlice(world, null).representativeDetailIds.has(ship.detailId)
    ));
    expect(outsider).toBeDefined();
    const transient = selectGardenObservatorySlice(world, outsider!.detailId).ships.at(-1)!;
    expect(resolveGardenShipDisplayTile({
      ...transient,
      sample,
    })).toEqual(sample.tile);
  });

  it("keeps roster offsets deterministic and projects the Three plane from the shared camera scale", () => {
    const world = denseWorld();
    const representatives = selectGardenObservatorySlice(world, null).ships.map(({ ship }) => ship);
    const first = representativeShipDisplayOffsets(representatives);
    const second = representativeShipDisplayOffsets([...representatives].reverse());
    const byId = (offsets: ReadonlyMap<string, { x: number; y: number }>) => (
      [...offsets].toSorted(([left], [right]) => left.localeCompare(right))
    );
    expect(byId(second)).toEqual(byId(first));

    const camera = { offsetX: 700, offsetY: 400, zoom: 1 };
    const tile = { x: 12.5, y: 7.25 };
    expect(gardenTileToScreen(tile, 0, camera)).toEqual(tileToScreen(tile, camera));
    const projectedShip = gardenTileToScreen(tile, GARDEN_SHIP_ROOT_Y, camera);
    expect(projectedShip.x).toBe(784);
    expect(projectedShip.y).toBeCloseTo(572.8267650887822);
    expect(gardenCameraViewHeight(1_000, 1)).toBe(62.5);
  });

  it("decouples rendered zone centers from in-frame label anchors (zones-v2)", () => {
    // Operator overlay composition: the Calm ring centers on the island,
    // Watch slightly below it, and Ledger/Alert/Warning center off-frame —
    // while every DOM label anchor stays on the visible arc inside the map.
    const calm = { band: "CALM", tile: { x: 10, y: 40 } };
    expect(gardenAreaCenterTile(calm)).toEqual({ x: 31, y: 31 });
    expect(gardenAreaDisplayTile(calm)).toEqual({ x: 42, y: 26 });
    expect(gardenAreaCenterTile({ band: "WATCH", tile: { x: 38, y: 48 } }))
      .toEqual({ x: 33, y: 33 });
    // Ledger keys off its risk placement (band is null).
    const ledger = { riskPlacement: "ledger-mooring", tile: { x: 10, y: 5 } };
    expect(gardenAreaCenterTile(ledger)).toEqual({ x: -4, y: 4 });
    expect(gardenAreaDisplayTile(ledger)).toEqual({ x: 8, y: 10 });
    // Unknown areas fall back to their data tile for both anchors.
    const unknown = { tile: { x: 4, y: 9 } };
    expect(gardenAreaCenterTile(unknown)).toEqual({ x: 4, y: 9 });
    expect(gardenAreaDisplayTile(unknown)).toEqual({ x: 4, y: 9 });
    // Label anchors always stay on valid in-map tiles (never off-screen).
    for (const band of ["CALM", "WATCH", "ALERT", "WARNING", "DANGER"] as const) {
      const label = gardenAreaDisplayTile({ band, tile: { x: 0, y: 0 } });
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.x).toBeLessThanOrEqual(55);
      expect(label.y).toBeGreaterThanOrEqual(0);
      expect(label.y).toBeLessThanOrEqual(55);
    }
  });

  it("resolves production landmarks while preserving Garden-staged tiles", () => {
    const world = denseWorld();
    const slice = selectGardenObservatorySlice(world, null);
    const secondDock = slice.docks[1]!;
    const area = slice.areas[0]!;
    const absentDock = world.docks.find((dock) => (
      !slice.docks.some((rendered) => rendered.detailId === dock.detailId)
    ));

    expect(resolveGardenEntityDisplayTile({
      entity: secondDock,
      slice,
    })).toEqual(gardenDockDisplayTile(secondDock.tile, 1));
    expect(resolveGardenEntityDisplayTile({
      entity: area,
      slice,
    })).toEqual(gardenAreaDisplayTile(area));
    expect(resolveGardenEntityDisplayTile({
      entity: absentDock!,
      slice,
    })).toEqual(gardenDockDisplayTile(
      absentDock!.tile,
      Math.max(0, (absentDock!.harborRank ?? 1) - 1),
    ));
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
