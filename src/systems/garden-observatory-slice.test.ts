import { describe, expect, it } from "vitest";
import {
  denseFixtureChains,
  denseFixturePegSummary,
  denseFixtureReportCards,
  denseFixtureStablecoins,
  denseFixtureStress,
  fixtureStability,
} from "../__fixtures__/pharosville-world";
import { overCapacityWorldFixture } from "../__fixtures__/over-capacity-world";
import { SEA_REGION_ID, seaRegionAtTile } from "./garden-sea-regions";
import { buildPharosVilleWorld } from "./pharosville-world";
import {
  GARDEN_SHIP_ROOT_Y,
  GARDEN_HULL_SILHOUETTES,
  GARDEN_SILHOUETTE_FOR_HULL,
  GARDEN_OVERVIEW_SHIP_LIMIT,
  gardenAreaCenterTile,
  gardenAreaDisplayTile,
  gardenCameraViewHeight,
  gardenDockDisplayTile,
  gardenSemanticView,
  gardenShipVisualScale,
  gardenTileToScreen,
  resolveGardenDependencyShipDisplayTile,
  resolveGardenEntityDisplayTile,
  resolveGardenShipDisplayTile,
  GARDEN_MAX_MOTION_TILES,
  gardenHomeOffsetWeight,
  selectGardenObservatorySlice,
  selectGardenTransientShip,
  selectRepresentativeShips,
} from "./garden-observatory-slice";
import { gardenShipWaterMarginTiles, isGardenShipWater } from "./garden-water-exclusion";
import { tileToScreen } from "./projection";
import { landWorldTile, zoneWorldTile } from "./map-scale";

describe("Garden Observatory slice", () => {
  it("maps all nine semantic hull classes onto exactly six East-Asian families", () => {
    expect(GARDEN_SILHOUETTE_FOR_HULL).toEqual({
      "algo-junk": "junk",
      "chartered-brigantine": "bezaisen",
      "commodity-peg-hoy": "scow",
      "crypto-caravel": "kobaya",
      "dao-schooner": "twinhull",
      "foreign-peg-junk": "junk",
      "treasury-galleon": "bezaisen",
      "yield-barque": "takasebune",
      "yield-indiaman": "takasebune",
    });
    expect(Object.keys(GARDEN_SILHOUETTE_FOR_HULL)).toHaveLength(9);
    expect(new Set(Object.values(GARDEN_SILHOUETTE_FOR_HULL)))
      .toEqual(new Set(GARDEN_HULL_SILHOUETTES));
    expect(GARDEN_HULL_SILHOUETTES).toHaveLength(6);
  });

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

  it("keeps 320 ordinary ships and adds only the selected transient outsider", () => {
    const world = overCapacityWorldFixture();
    const ordinary = selectGardenObservatorySlice(world, null);
    const outsider = world.ships.find((ship) => (
      !ordinary.representativeDetailIds.has(ship.detailId)
    ));

    expect(ordinary.ships).toHaveLength(GARDEN_OVERVIEW_SHIP_LIMIT);
    expect(outsider).toBeDefined();
    expect(ordinary.ships.some(({ ship }) => ship.detailId === outsider!.detailId)).toBe(false);

    const selected = selectGardenObservatorySlice(world, outsider!.detailId);
    expect(selected.ships).toHaveLength(GARDEN_OVERVIEW_SHIP_LIMIT + 1);
    expect(selected.transientSelectedDetailId).toBe(outsider!.detailId);
    expect(selected.ships.at(-1)).toMatchObject({
      displayOffset: { x: 0, y: 0 },
      representative: false,
      ship: { detailId: outsider!.detailId },
    });
    const transient = selected.ships.at(-1)!;
    const transientTile = resolveGardenShipDisplayTile({ ...transient, sample: null });
    const transientMargin = gardenShipWaterMarginTiles(
      gardenShipVisualScale(transient.ship.visual.scale || 1),
      GARDEN_SILHOUETTE_FOR_HULL[transient.ship.visual.hull],
    );
    expect(isGardenShipWater(transientTile, transientMargin)).toBe(true);

    const cleared = selectGardenObservatorySlice(world, null);
    expect(cleared.ships).toHaveLength(GARDEN_OVERVIEW_SHIP_LIMIT);
    expect(cleared.transientSelectedDetailId).toBeNull();
  });

  it("revalidates dependency formation after its renderer-visible offset", () => {
    const world = denseWorld();
    const ship = {
      ...world.ships[0]!,
      dependencyFormation: { parentId: "parent", type: "collateral" as const, weight: 1 },
    };
    const tile = resolveGardenDependencyShipDisplayTile({
      parentTile: { x: 1, y: 1 },
      ship,
    });
    const margin = gardenShipWaterMarginTiles(
      gardenShipVisualScale(ship.visual.scale || 1),
      GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull],
    );
    expect(isGardenShipWater(tile, margin)).toBe(true);
  });

  it("moors a representative hull at its dock, fading the berth offset over the voyage", () => {
    const world = denseWorld();
    const slice = selectGardenObservatorySlice(world, null);
    const placement = slice.ships.find(({ displayOffset, ship }) => (
      ship.dockVisits.length > 0
      && Math.hypot(displayOffset.x, displayOffset.y) > 20
    ));
    expect(placement).toBeDefined();
    const { ship } = placement!;
    const home = ship.tile;
    const mooring = ship.dockVisits
      .map((visit) => visit.mooringTile)
      .toSorted((left, right) => Math.hypot(left.x - home.x, left.y - home.y) - Math.hypot(right.x - home.x, right.y - home.y))[0]!;
    const margin = gardenShipWaterMarginTiles(
      gardenShipVisualScale(ship.visual.scale || 1),
      GARDEN_SILHOUETTE_FOR_HULL[ship.visual.hull],
    );

    // Moored: the hull sits on the berth the dock assignment chose, not on a
    // copy of it displaced by the home offset (which is what put moored hulls
    // beyond the rim before).
    const moored = resolveGardenShipDisplayTile({ ...placement!, sample: { state: "moored", tile: mooring } });
    expect(Math.hypot(moored.x - mooring.x, moored.y - mooring.y)).toBeLessThan(1e-6);

    // Idle and small drift: the whole home offset stays, so the berth is the
    // blue-noise placement and a patrol never slides along the offset.
    const idle = resolveGardenShipDisplayTile({ ...placement!, sample: { state: "idle", tile: home } });
    const drifted = resolveGardenShipDisplayTile({
      ...placement!,
      sample: { state: "risk-drift", tile: { x: home.x + 3, y: home.y } },
    });
    expect(isGardenShipWater(idle, margin)).toBe(true);
    expect(Math.hypot(drifted.x - idle.x, drifted.y - idle.y)).toBeLessThan(3 + 1e-6);

    // Sailing: the path from berth to mooring is continuous — no step larger
    // than the sample step plus the offset's share of that step.
    const reach = Math.hypot(mooring.x - home.x, mooring.y - home.y);
    const offsetLength = Math.hypot(placement!.displayOffset.x, placement!.displayOffset.y);
    let previous = idle;
    for (let step = 1; step <= 40; step += 1) {
      const t = step / 40;
      const next = resolveGardenShipDisplayTile({
        ...placement!,
        sample: { state: "sailing", tile: { x: home.x + (mooring.x - home.x) * t, y: home.y + (mooring.y - home.y) * t } },
      });
      const composedStep = reach / 40 + offsetLength / 40 * (reach / (reach - 6));
      expect(Math.hypot(next.x - previous.x, next.y - previous.y), `step ${step}`).toBeLessThan(composedStep + 12);
      previous = next;
    }
  });

  it("keeps long berths at their sample for berth states and caps open-water sailing", () => {
    const world = denseWorld();
    const placements = selectGardenObservatorySlice(world, null).ships;
    const far = placements
      .filter(({ ship }) => ship.dockVisits.length > 0)
      .map((placement) => {
        const nearest = placement.ship.dockVisits
          .map((visit) => ({
            tile: visit.mooringTile,
            reach: Math.hypot(
              visit.mooringTile.x - placement.ship.tile.x,
              visit.mooringTile.y - placement.ship.tile.y,
            ),
          }))
          .toSorted((left, right) => left.reach - right.reach)[0]!;
        return { placement, ...nearest };
      })
      .filter(({ reach }) => reach > GARDEN_MAX_MOTION_TILES)
      .toSorted((left, right) => right.reach - left.reach)[0];
    expect(far).toBeDefined();
    expect(far!.reach).toBeGreaterThan(GARDEN_MAX_MOTION_TILES);

    const farMargin = gardenShipWaterMarginTiles(
      gardenShipVisualScale(far!.placement.ship.visual.scale || 1),
      GARDEN_SILHOUETTE_FOR_HULL[far!.placement.ship.visual.hull],
    );
    expect(isGardenShipWater(far!.tile, farMargin, false)).toBe(true);
    for (const state of ["moored", "arriving", "departing"] as const) {
      const display = resolveGardenShipDisplayTile({
        ...far!.placement,
        sample: { state, tile: far!.tile },
      });
      expect(display.x).toBeCloseTo(far!.tile.x, 8);
      expect(display.y).toBeCloseTo(far!.tile.y, 8);
    }

    // Find a deterministic open-water leg longer than the display cap whose
    // capped composition also stays on open water. That makes the assertion
    // about the sailing cap itself, rather than a nearest-water correction.
    const sailingDistance = GARDEN_MAX_MOTION_TILES + 20;
    let openWaterSailing: {
      placement: typeof placements[number];
      sample: { x: number; y: number };
      base: { x: number; y: number };
      expected: { x: number; y: number };
    } | undefined;
    for (const placement of placements) {
      if (!placement.representative) continue;
      const margin = gardenShipWaterMarginTiles(
        gardenShipVisualScale(placement.ship.visual.scale || 1),
        GARDEN_SILHOUETTE_FOR_HULL[placement.ship.visual.hull],
      );
      for (let angle = 0; angle < 360; angle += 1) {
        const radians = angle * Math.PI / 180;
        const direction = { x: Math.cos(radians), y: Math.sin(radians) };
        const sample = {
          x: placement.ship.tile.x + direction.x * sailingDistance,
          y: placement.ship.tile.y + direction.y * sailingDistance,
        };
        const motionX = sample.x - placement.ship.tile.x;
        const motionY = sample.y - placement.ship.tile.y;
        const motionDistance = Math.hypot(motionX, motionY);
        const offsetWeight = gardenHomeOffsetWeight(placement.ship, motionDistance);
        const base = {
          x: placement.ship.tile.x + placement.displayOffset.x * offsetWeight,
          y: placement.ship.tile.y + placement.displayOffset.y * offsetWeight,
        };
        const expected = {
          x: base.x + motionX * GARDEN_MAX_MOTION_TILES / motionDistance,
          y: base.y + motionY * GARDEN_MAX_MOTION_TILES / motionDistance,
        };
        if (isGardenShipWater(sample, margin, true) && isGardenShipWater(expected, margin, true)) {
          openWaterSailing = { placement, sample, base, expected };
          break;
        }
      }
      if (openWaterSailing) break;
    }
    expect(openWaterSailing).toBeDefined();
    const sailingDisplay = resolveGardenShipDisplayTile({
      ...openWaterSailing!.placement,
      sample: { state: "sailing", tile: openWaterSailing!.sample },
    });
    expect(sailingDisplay.x).toBeCloseTo(openWaterSailing!.expected.x, 8);
    expect(sailingDisplay.y).toBeCloseTo(openWaterSailing!.expected.y, 8);
    expect(Math.hypot(
      sailingDisplay.x - openWaterSailing!.base.x,
      sailingDisplay.y - openWaterSailing!.base.y,
    )).toBeCloseTo(GARDEN_MAX_MOTION_TILES, 8);
  });

  it("keeps representative motion bounded and materializes transients on hull-safe water", () => {
    const world = denseWorld();
    const placement = selectGardenObservatorySlice(world, null).ships.find(({ displayOffset }) => (
      displayOffset.x !== 0 || displayOffset.y !== 0
    ));
    expect(placement).toBeDefined();
    // Aim inward. The motion contribution remains capped; if that composed
    // point still meets authored geography, the final hull field may move it
    // farther to the nearest valid water instead of preserving an unsafe cap.
    const inward = {
      x: 70 - placement!.ship.tile.x - placement!.displayOffset.x,
      y: 70 - placement!.ship.tile.y - placement!.displayOffset.y,
    };
    const inwardLength = Math.hypot(inward.x, inward.y);
    const sample = {
      mapVisibilityAlpha: 0,
      state: "sailing" as const,
      tile: {
        x: placement!.ship.tile.x + (inward.x / inwardLength) * (GARDEN_MAX_MOTION_TILES + 8),
        y: placement!.ship.tile.y + (inward.y / inwardLength) * (GARDEN_MAX_MOTION_TILES + 8),
      },
    };
    // The berth offset fades with voyage distance, so the cap is measured from
    // the berth the composition actually used at this distance.
    const offsetWeight = gardenHomeOffsetWeight(placement!.ship, GARDEN_MAX_MOTION_TILES + 8);
    const representativeBase = {
      x: placement!.ship.tile.x + placement!.displayOffset.x * offsetWeight,
      y: placement!.ship.tile.y + placement!.displayOffset.y * offsetWeight,
    };

    const representativeDisplay = resolveGardenShipDisplayTile({
      ...placement!,
      sample,
    });
    expect(Math.hypot(
      representativeDisplay.x - representativeBase.x,
      representativeDisplay.y - representativeBase.y,
    )).toBeGreaterThanOrEqual(GARDEN_MAX_MOTION_TILES - 1e-6);
    const representativeMargin = gardenShipWaterMarginTiles(
      gardenShipVisualScale(placement!.ship.visual.scale || 1),
      GARDEN_SILHOUETTE_FOR_HULL[placement!.ship.visual.hull],
    );
    expect(isGardenShipWater(representativeDisplay, representativeMargin)).toBe(true);

    // A transient has no representative offset, but it still cannot bypass
    // the finite plate and hull-clearance field through a sailing sample.
    const transientDisplay = resolveGardenShipDisplayTile({
      displayOffset: { x: 0, y: 0 },
      representative: false,
      sample: { ...sample, tile: { x: -20, y: -20 } },
      ship: world.ships[0]!,
    });
    const transientMargin = gardenShipWaterMarginTiles(
      gardenShipVisualScale(world.ships[0]!.visual.scale || 1),
      GARDEN_SILHOUETTE_FOR_HULL[world.ships[0]!.visual.hull],
    );
    expect(isGardenShipWater(transientDisplay, transientMargin)).toBe(true);
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
