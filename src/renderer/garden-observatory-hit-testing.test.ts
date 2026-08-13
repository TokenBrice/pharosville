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
import {
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_SHIP_ROOT_Y,
  GARDEN_WATER_Y,
  gardenIslandDisplayTile,
  gardenTileToScreen,
  resolveGardenShipDisplayTile,
  selectGardenObservatorySlice,
} from "../systems/garden-observatory-slice";
import type { ShipMotionSample } from "../systems/motion";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { TILE_WIDTH } from "../systems/projection";
import {
  SEA_SIGN_BOARD,
  seaSignBoards,
  seaSignScaleForZoom,
} from "../three/garden-sea-signs";
import { createGardenObservatoryHitTargetSnapshot } from "./garden-observatory-hit-testing";

describe("Garden Observatory hit targets", () => {
  it("publishes the lighthouse, production docks, and the whole rendered fleet", () => {
    const world = denseWorld();
    const camera = { offsetX: 720, offsetY: 430, zoom: 1 };
    const slice = selectGardenObservatorySlice(world, null);
    const snapshot = createGardenObservatoryHitTargetSnapshot({ camera, world });

    // D1 (W3): the fleet is no longer sampled down to 20, so hit targets
    // track the rendered slice size. Lighthouse + pigeonnier are the 2 fixed
    // singletons. Every area also carries a carved name board (N6), which is a
    // second target on the SAME detail id rather than a new destination.
    expect(snapshot.targets).toHaveLength(
      2 + slice.ships.length + world.docks.length + world.areas.length * 2 + world.graves.length,
    );
    expect(snapshot.targets.filter((target) => target.kind === "sea-sign"))
      .toHaveLength(world.areas.length);
    expect(snapshot.targets.filter((target) => target.kind === "ship"))
      .toHaveLength(slice.ships.length);
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

  it("gives every rendered ship its own hit target", () => {
    // The transient-outsider path only fires when a world exceeds render
    // capacity (320). At the current ~200-ship scale every ship is rendered,
    // so the contract that matters is total coverage: nothing is unreachable.
    const world = denseWorld();
    const slice = selectGardenObservatorySlice(world, null);

    const snapshot = createGardenObservatoryHitTargetSnapshot({
      camera: { offsetX: 720, offsetY: 430, zoom: 1 },
      selectedDetailId: world.ships[5]!.detailId,
      world,
    });
    for (const { ship } of slice.ships) {
      expect(snapshot.targetsByDetailId.has(ship.detailId)).toBe(true);
    }
    expect(snapshot.targets.filter((target) => target.kind === "ship"))
      .toHaveLength(slice.ships.length);
  });

  it("publishes a selected over-capacity outsider with its DOM detail record", () => {
    const world = overCapacityWorldFixture();
    const ordinary = selectGardenObservatorySlice(world, null);
    const outsider = world.ships.find((ship) => (
      !ordinary.representativeDetailIds.has(ship.detailId)
    ));
    expect(outsider).toBeDefined();

    const snapshot = createGardenObservatoryHitTargetSnapshot({
      camera: { offsetX: 720, offsetY: 430, zoom: 1 },
      selectedDetailId: outsider!.detailId,
      world,
    });

    expect(snapshot.targetsByDetailId.get(outsider!.detailId)).toMatchObject({
      detailId: outsider!.detailId,
      id: outsider!.id,
      kind: "ship",
    });
    expect(world.detailIndex[outsider!.detailId]).toMatchObject({
      id: outsider!.detailId,
      title: outsider!.label,
    });
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

describe("Carved sea-name board targets (N6)", () => {
  it("opens the water body's own detail rather than a parallel one", () => {
    const world = denseWorld();
    const snapshot = createGardenObservatoryHitTargetSnapshot({
      camera: { offsetX: 720, offsetY: 430, zoom: 0.7776 },
      world,
    });
    const boards = snapshot.targets.filter((target) => target.kind === "sea-sign");

    expect(new Set(boards.map((board) => board.detailId)))
      .toEqual(new Set(world.areas.map((area) => area.detailId)));
    for (const board of boards) {
      expect(world.detailIndex[board.detailId]).toBeDefined();
    }
  });

  it("wins the per-detail Tab stop from the zone anchor without moving it", () => {
    const world = denseWorld();
    const snapshot = createGardenObservatoryHitTargetSnapshot({
      camera: { offsetX: 720, offsetY: 430, zoom: 0.7776 },
      world,
    });

    for (const area of world.areas) {
      const board = snapshot.targets.find((target) => (
        target.kind === "sea-sign" && target.detailId === area.detailId
      ));
      const zone = snapshot.targets.find((target) => (
        target.kind === "area" && target.detailId === area.detailId
      ));
      // One point above, so the cycle prefers the board and the body keeps the
      // slot its zone priority already bought it.
      expect(board?.priority).toBe(zone!.priority + 1);
      // The keyboard select path reads targetsByDetailId, so it has to be the
      // board that carries the anchor.
      expect(snapshot.targetsByDetailId.get(area.detailId)?.kind).toBe("sea-sign");
    }
  });

  it("tracks the zoom-QUANTIZED board, not the true-scale geometry", () => {
    // The trap: D6 draws the boards out of scale so the sea's names stay
    // readable as the camera pulls back. W0.7 quantized that response to three
    // rungs, so the target has to follow the rung the scene draws — INSIDE a
    // rung the board is an ordinary world object whose target grows with zoom,
    // and crossing a rung steps the target by the whole rung ratio. A target
    // built from the true-scale geometry would miss the step entirely.
    const world = denseWorld();
    const widthAt = (zoom: number) => {
      const snapshot = createGardenObservatoryHitTargetSnapshot({
        camera: { offsetX: 720, offsetY: 430, zoom },
        world,
      });
      return snapshot.targets.find((target) => target.kind === "sea-sign")!.rect.width;
    };

    // Either side of the 0.88 rung edge, a 2% zoom change moves the target by
    // the rung ratio — over half again — instead of by 2%.
    const stepRatio = seaSignScaleForZoom(0.87) / seaSignScaleForZoom(0.89);
    expect(stepRatio).toBeGreaterThan(1.5);
    expect(widthAt(0.87)).toBeCloseTo(widthAt(0.89) * stepRatio * (0.87 / 0.89), 6);
    // Two framings on the same rung, and past the closest rung, are pure zoom,
    // like everything else in the world.
    expect(widthAt(0.5)).toBeCloseTo(widthAt(0.8) * (0.5 / 0.8), 6);
    expect(widthAt(2)).toBeCloseTo(widthAt(1) * 2, 6);
  });

  it("centres the target on the drawn board at every framing", () => {
    const world = denseWorld();
    for (const zoom of [0.4, 0.7776, 1.4]) {
      const camera = { offsetX: 720, offsetY: 430, zoom };
      const scale = seaSignScaleForZoom(zoom);
      const board = seaSignBoards(world.areas).find((entry) => entry.detailId);
      const target = createGardenObservatoryHitTargetSnapshot({ camera, world })
        .targetsByDetailId.get(board!.detailId!);

      const centre = gardenTileToScreen(
        { x: board!.x / Math.SQRT2, y: board!.z / Math.SQRT2 },
        GARDEN_WATER_Y + SEA_SIGN_BOARD.baseY * scale,
        camera,
      );
      expect(target?.anchor?.x).toBeCloseTo(centre.x, 6);
      expect(target?.anchor?.y).toBeCloseTo(centre.y, 6);
      // The face's own painted width, projected. The board is yawed 45 degrees,
      // which in this iso rig lays it exactly along the screen-horizontal axis,
      // so one world unit of board is TILE_WIDTH / 2 screen units.
      expect(target?.rect.width).toBeCloseTo(
        SEA_SIGN_BOARD.width * scale * (TILE_WIDTH / 2) * zoom,
        6,
      );
    }
  });

  it("stands the boards' targets down when a detail panel owns the frame", () => {
    const world = denseWorld();
    const snapshot = createGardenObservatoryHitTargetSnapshot({
      camera: { offsetX: 720, offsetY: 430, zoom: 0.7776 },
      selectedDetailId: world.areas[0]!.detailId,
      world,
    });

    expect(snapshot.targets.filter((target) => target.kind === "sea-sign")).toHaveLength(0);
    // The zone target still carries the body, so nothing becomes unreachable.
    expect(snapshot.targetsByDetailId.get(world.areas[0]!.detailId)?.kind).toBe("area");
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
