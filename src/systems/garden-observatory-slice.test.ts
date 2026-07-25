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
  resolveGardenEntityDisplayTile,
  resolveGardenShipDisplayTile,
  selectGardenObservatorySlice,
  selectGardenTransientShip,
  selectRepresentativeShips,
} from "./garden-observatory-slice";
import { tileToScreen } from "./projection";
import { MAX_TILE_X, MAX_TILE_Y } from "./world-layout";
import { landWorldTile, zoneWorldTile } from "./map-scale";

describe("Garden Observatory slice", () => {
  it("derives Overview, Explore, and Analyze without a second mode state", () => {
    expect(gardenSemanticView(0.8, null)).toBe("overview");
    expect(gardenSemanticView(1.05, null)).toBe("explore");
    expect(gardenSemanticView(0.8, "ship.usdc")).toBe("analyze");
  });

  it("renders the whole fleet and still ranks correctly when a limit applies", () => {
    // D1 (W3): the cap is now a capacity (320), not a composition rule, so a
    // ~200-ship world renders in full. The ranking logic still matters — it
    // decides who survives when a world DOES exceed capacity — so exercise it
    // with an explicit limit rather than relying on the default.
    const world = denseWorld();
    const overview = selectGardenObservatorySlice(world, null);

    expect(world.ships.length).toBeGreaterThan(20);
    expect(overview.ships).toHaveLength(world.ships.length);
    expect(overview.ships.every((placement) => placement.representative)).toBe(true);
    // W3.4: every separated chain harbor renders now (was 2), so the moored
    // majority of the fleet spreads across real piers.
    expect(overview.docks.length).toBeGreaterThan(2);
    expect(overview.docks.length).toBeLessThanOrEqual(10);
    expect(overview.areas.length).toBeLessThanOrEqual(2);

    const capped = selectRepresentativeShips(world.ships, 20);
    expect(capped).toHaveLength(20);
    // The riskiest bands must always survive a cap — that is the whole point
    // of the ranking.
    expect(capped.some((ship) => ship.riskZone === "danger")).toBe(true);
  });

  it("materializes an inspected ship that is outside the rendered slice", () => {
    // With capacity above the world size nothing is normally an outsider, but
    // the transient path must survive for data gaps and over-capacity worlds.
    const world = denseWorld();
    const target = world.ships[3]!;
    const withoutTarget = new Set(
      world.ships.filter((ship) => ship.id !== target.id).map((ship) => ship.detailId),
    );

    expect(selectGardenTransientShip(world, target.detailId, withoutTarget))
      .toMatchObject({ detailId: target.detailId });
    // A ship already in the slice is not duplicated as a transient.
    expect(selectGardenTransientShip(
      world,
      target.detailId,
      new Set([target.detailId]),
    )).toBeNull();
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

    // A transient (non-representative) placement follows its motion sample
    // exactly, with no display offset composed in.
    expect(resolveGardenShipDisplayTile({
      displayOffset: { x: 0, y: 0 },
      representative: false,
      sample,
      ship: world.ships[0]!,
    })).toEqual(sample.tile);
  });

  it("keeps roster offsets deterministic and projects the Three plane from the shared camera scale", () => {
    // W3: placement moved from authored rings to region-scoped blue-noise
    // scatter; the determinism contract is unchanged — the same world must
    // always produce the same display tiles, regardless of ship order.
    const world = denseWorld();
    const byId = (slice: ReturnType<typeof selectGardenObservatorySlice>) => (
      slice.ships
        .map(({ displayOffset, ship }) => [ship.id, displayOffset] as const)
        .toSorted(([left], [right]) => left.localeCompare(right))
    );
    const first = byId(selectGardenObservatorySlice(world, null));
    const second = byId(selectGardenObservatorySlice({ ...world }, null));
    expect(second).toEqual(first);

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
    // N1: the composition is authored in the 56-tile DESIGN space. The
    // island-relative anchors take the landmass OFFSET; the off-frame corner
    // arcs and frame-inset labels take the zone SCALE.
    const calm = { band: "CALM", tile: { x: 10, y: 40 } };
    expect(gardenAreaCenterTile(calm)).toEqual(landWorldTile({ x: 31, y: 31 }));
    expect(gardenAreaDisplayTile(calm)).toEqual(landWorldTile({ x: 42, y: 26 }));
    expect(gardenAreaCenterTile({ band: "WATCH", tile: { x: 38, y: 48 } }))
      .toEqual(landWorldTile({ x: 33, y: 33 }));
    // Ledger keys off its risk placement (band is null).
    const ledger = { riskPlacement: "ledger-mooring", tile: { x: 10, y: 5 } };
    expect(gardenAreaCenterTile(ledger)).toEqual(zoneWorldTile({ x: -4, y: 4 }));
    expect(gardenAreaDisplayTile(ledger)).toEqual(zoneWorldTile({ x: 8, y: 10 }));
    // Unknown areas fall back to their data tile for both anchors.
    const unknown = { tile: { x: 4, y: 9 } };
    expect(gardenAreaCenterTile(unknown)).toEqual({ x: 4, y: 9 });
    expect(gardenAreaDisplayTile(unknown)).toEqual({ x: 4, y: 9 });
    // Label anchors always stay on valid in-map tiles (never off-screen).
    for (const band of ["CALM", "WATCH", "ALERT", "WARNING", "DANGER"] as const) {
      const label = gardenAreaDisplayTile({ band, tile: { x: 0, y: 0 } });
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.x).toBeLessThanOrEqual(MAX_TILE_X);
      expect(label.y).toBeGreaterThanOrEqual(0);
      expect(label.y).toBeLessThanOrEqual(MAX_TILE_Y);
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
