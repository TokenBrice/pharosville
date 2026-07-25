import { describe, expect, it } from "vitest";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureStability,
} from "../__fixtures__/pharosville-world";
import { SEA_REGION_ID, seaRegionAtTile } from "./garden-sea-regions";
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
  GARDEN_MAX_MOTION_TILES,
  selectGardenObservatorySlice,
  selectGardenTransientShip,
  selectRepresentativeShips,
} from "./garden-observatory-slice";
import { tileToScreen } from "./projection";
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
    )).toBeCloseTo(GARDEN_MAX_MOTION_TILES);

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

  it("anchors each area label inside the region it counts", () => {
    // W2.9: label anchors used to be hand-authored tiles. After the world
    // doubled and placement moved to region-scoped blue noise they no longer
    // sat near the ships they describe — "Danger Strait, 9 ships" floated over
    // a crowd of fifty while "Watch Breakwater, 46 ships" sat over empty
    // water. The counts were right; the label was in the wrong place, which
    // reads as the world lying about itself.
    //
    // The contract is now the strong one: a label must land ON a tile of its
    // OWN region, so it can never drift away from its ships again.
    const bandRegion = {
      CALM: SEA_REGION_ID.calm,
      WATCH: SEA_REGION_ID.watch,
      ALERT: SEA_REGION_ID.alert,
      WARNING: SEA_REGION_ID.warning,
      DANGER: SEA_REGION_ID.danger,
    } as const;
    for (const [band, regionId] of Object.entries(bandRegion)) {
      const label = gardenAreaDisplayTile({ band, tile: { x: 0, y: 0 } });
      expect(
        seaRegionAtTile(Math.round(label.x), Math.round(label.y)),
        `${band} label at (${label.x},${label.y})`,
      ).toBe(regionId);
      expect(label.x).toBeGreaterThanOrEqual(0);
      expect(label.y).toBeGreaterThanOrEqual(0);
    }

    // Ledger keys off its risk placement rather than a band.
    const ledger = gardenAreaDisplayTile({ riskPlacement: "ledger-mooring", tile: { x: 10, y: 5 } });
    expect(seaRegionAtTile(Math.round(ledger.x), Math.round(ledger.y)))
      .toBe(SEA_REGION_ID.ledger);

    // The RENDERED zone centre stays decoupled from the label anchor, and may
    // still sit on the island or off-frame — that composition is unchanged.
    expect(gardenAreaCenterTile({ band: "CALM", tile: { x: 10, y: 40 } }))
      .toEqual(landWorldTile({ x: 31, y: 31 }));
    expect(gardenAreaCenterTile({ riskPlacement: "ledger-mooring", tile: { x: 10, y: 5 } }))
      .toEqual(zoneWorldTile({ x: -4, y: 4 }));

    // Unknown areas fall back to their data tile for both anchors.
    const unknown = { tile: { x: 4, y: 9 } };
    expect(gardenAreaCenterTile(unknown)).toEqual({ x: 4, y: 9 });
    expect(gardenAreaDisplayTile(unknown)).toEqual({ x: 4, y: 9 });
  });

  it("resolves production landmarks while preserving Garden-staged tiles", () => {
    const world = denseWorld();
    const slice = selectGardenObservatorySlice(world, null);
    const secondDock = slice.docks[1]!;
    const area = slice.areas[0]!;

    expect(resolveGardenEntityDisplayTile({
      entity: secondDock,
      slice,
    })).toEqual(gardenDockDisplayTile(secondDock.tile));
    expect(resolveGardenEntityDisplayTile({
      entity: area,
      slice,
    })).toEqual(gardenAreaDisplayTile(area));
    // H1: a dock's display tile is a pure function of its own tile now, so it
    // resolves the same whether or not the dock made the rendered slice. (The
    // old assertion needed an unrendered dock to exist, which stopped being
    // true once the separation floor dropped and every harbour rendered.)
    expect(resolveGardenEntityDisplayTile({
      entity: { ...secondDock, detailId: "dock.not-rendered", id: "dock.not-rendered" },
      slice,
    })).toEqual(gardenDockDisplayTile(secondDock.tile));
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
