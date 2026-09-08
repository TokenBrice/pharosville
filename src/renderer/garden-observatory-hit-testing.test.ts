import { Vector3, Matrix4 } from "three";
import { authorDock } from "../three/garden-docks";
import { hitTest, hitTestSpatial } from "./hit-testing";
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
import { selectionCameraTarget } from "../hooks/camera-intent";
import { defaultCamera } from "../systems/camera";
import {
  GARDEN_DOCK_ROOT_Y,
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
import { worldToScreen, type IsoCamera } from "../systems/projection";
import {
  SEA_SIGN_STELE,
  createSeaSignScaleTrack,
  seaSignSteles,
  seaSignScaleForZoom,
} from "../three/garden-sea-signs";
import { createGardenObservatoryHitTargetSnapshot } from "./garden-observatory-hit-testing";
import type { SeaSignStele } from "../three/garden-sea-sign-siting";

// Projection-only tests without a rendered viewport use the desktop baseline.
const TEST_VIEWPORT = { x: 1600, y: 1000 };
describe("Garden Observatory hit targets", () => {
  it("bounds perspective pointer coverage without discarding detail targets", () => {
    const world = denseWorld();
    const camera = { offsetX: 720, offsetY: 430, zoom: 1.4 };
    for (const viewport of [{ width: 1600, height: 1000 }, { width: 1, height: 1 }]) {
      const snapshot = createGardenObservatoryHitTargetSnapshot({ camera, viewport, world });
      expect(snapshot.targets.filter((target) => target.kind === "dock").map((target) => target.detailId))
        .toEqual(world.docks.map((dock) => dock.detailId));
      expect(snapshot.spatialIndex.cells.size).toBeLessThanOrEqual(64 * 64);
      for (const target of snapshot.spatialIndex.targets) {
        expect(target.rect.x).toBeGreaterThanOrEqual(-viewport.width);
        expect(target.rect.y).toBeGreaterThanOrEqual(-viewport.height);
        expect(target.rect.x + target.rect.width).toBeLessThanOrEqual(viewport.width * 2);
        expect(target.rect.y + target.rect.height).toBeLessThanOrEqual(viewport.height * 2);
        const centre = { x: target.rect.x + target.rect.width / 2, y: target.rect.y + target.rect.height / 2 };
        expect(hitTestSpatial(snapshot.spatialIndex, centre)).toEqual(hitTest(snapshot.spatialIndex.targets, centre));
      }
      expect(hitTestSpatial(snapshot.spatialIndex, { x: viewport.width * 3, y: viewport.height * 3 })).toBeNull();
    }
  });

  it("drops non-finite projections only from the pointer index", () => {
    const world = denseWorld();
    const snapshot = createGardenObservatoryHitTargetSnapshot({
      camera: { offsetX: Number.NaN, offsetY: 430, zoom: 1 },
      world,
    });
    expect(snapshot.spatialIndex.targets).toEqual([]);
    expect(snapshot.targetsByDetailId.has(world.lighthouse.detailId)).toBe(true);
    expect(snapshot.targets.filter((target) => target.kind === "dock").map((target) => target.detailId))
      .toEqual(world.docks.map((dock) => dock.detailId));
  });

  it("picks authored flag cloth without swallowing the sea between flag and quay", () => {
    const world = denseWorld();
    for (const zoom of [0.28, 0.50184, 1.4]) {
      const camera = { offsetX: 720, offsetY: 430, zoom };
      const snapshot = createGardenObservatoryHitTargetSnapshot({ camera, world });
      for (const dock of world.docks) {
        const recipe = authorDock(dock, dock.tile, gardenIslandDisplayTile(world.lighthouse.tile));
        const { placement } = recipe.flag;
        const flag = snapshot.targets.find((target) => target.id === `${dock.id}.flag`)!;
        const quay = snapshot.targetsByDetailId.get(dock.detailId)!;
        expect(quay.id).toBe(dock.id);
        for (const yaw of [-0.28, 0, 0.28]) for (const roll of [-0.06, 0.06]) {
          const matrix = new Matrix4().makeTranslation(placement.x, placement.y, placement.z)
            .multiply(new Matrix4().makeRotationY(placement.yaw + yaw))
            .multiply(new Matrix4().makeRotationZ(roll))
            .multiply(new Matrix4().makeTranslation(0.06, 0, 0))
            .multiply(new Matrix4().makeScale(placement.scale, placement.scale, placement.scale));
          matrix.premultiply(recipe.rootMatrix);
          for (const x of [0, 1.5]) for (const y of [-0.63, 0.5]) {
            const point = new Vector3(x, y, 0).applyMatrix4(matrix);
            const screen = gardenTileToScreen(
              { x: point.x / Math.SQRT2, y: point.z / Math.SQRT2 },
              point.y,
              camera,
              TEST_VIEWPORT,
            );
            expect(hitTest([flag, quay], screen)?.detailId, dock.chainId).toBe(dock.detailId);
            if (pointInRect(screen, { x: -TEST_VIEWPORT.x, y: -TEST_VIEWPORT.y,
              width: TEST_VIEWPORT.x * 3, height: TEST_VIEWPORT.y * 3 })) {
              const pointerFlag = snapshot.spatialIndex.targetById.get(flag.id);
              expect(pointerFlag && pointInRect(screen, pointerFlag.rect), dock.chainId).toBe(true);
            }
          }
        }
        const gap = {
          x: (flag.rect.x + flag.rect.width / 2 + quay.anchor!.x) / 2,
          y: (flag.rect.y + flag.rect.height / 2 + quay.anchor!.y) / 2,
        };
        if (Math.abs(flag.rect.y - quay.rect.y) > flag.rect.height + quay.rect.height) {
          expect(hitTest([flag, quay], gap)).toBeNull();
        }
      }
    }
  });

  it("publishes the lighthouse, production docks, and the whole rendered fleet", () => {
    const world = denseWorld();
    const camera = { offsetX: 720, offsetY: 430, zoom: 1 };
    const slice = selectGardenObservatorySlice(world, null);
    const snapshot = createGardenObservatoryHitTargetSnapshot({ camera, world });

    // D1 (W3): the fleet is no longer sampled down to 20, so hit targets
    // track the rendered slice size. Lighthouse + pigeonnier are the 2 fixed
    // singletons. Every area also carries a carved name stele (W2a), which is a
    // second target on the SAME detail id rather than a new destination.
    expect(snapshot.targets).toHaveLength(
      2 + slice.ships.length + world.docks.length * 2 + world.areas.length * 2 + world.graves.length,
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

  it("preserves every shore-station target and its projected position outside the landing viewport", () => {
    const world = denseWorld();
    const viewport = { width: 1440, height: 1000 };
    const camera = defaultCamera({ ...viewport, map: world.map });
    const snapshot = createGardenObservatoryHitTargetSnapshot({ camera, viewport, world });
    const dockTargets = snapshot.targets.filter((target) => target.kind === "dock");

    expect(dockTargets).toHaveLength(world.docks.length);
    for (const dock of world.docks) {
      expect(snapshot.targetsByDetailId.get(dock.detailId)?.anchor).toEqual(
        gardenTileToScreen(
          dock.tile,
          GARDEN_DOCK_ROOT_Y,
          camera,
          { x: viewport.width, y: viewport.height },
        ),
      );
    }
    expect(dockTargets.some((target) => !rectInsideViewport(target.rect, viewport))).toBe(true);
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
      TEST_VIEWPORT,
    );
    const beacon = gardenTileToScreen(
      lighthouseTile,
      GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + GARDEN_LIGHTHOUSE_BEACON_Y,
      camera,
      TEST_VIEWPORT,
    );
    const top = gardenTileToScreen(
      lighthouseTile,
      GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + GARDEN_LIGHTHOUSE_HEIGHT,
      camera,
      TEST_VIEWPORT,
    );
    const target = createGardenObservatoryHitTargetSnapshot({ camera, world })
      .targetsByDetailId.get(world.lighthouse.detailId);

    expect(target?.anchor).toEqual(beacon);
    expect(target && pointInRect(base, target.rect)).toBe(true);
    expect(target && pointInRect(top, target.rect)).toBe(true);
    // The broad stylobate remains clickable on both sides of the tower.
    for (const direction of [-1, 1]) {
      const edge = worldToScreen({
        x: lighthouseTile.x * Math.SQRT2 + direction * Math.cos(Math.PI / 4) * 3,
        y: GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
        z: lighthouseTile.y * Math.SQRT2 - direction * Math.sin(Math.PI / 4) * 3,
      }, camera, TEST_VIEWPORT);
      expect(target && pointInRect(edge, target.rect)).toBe(true);
    }
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
      gardenTileToScreen(expectedTile, GARDEN_SHIP_ROOT_Y, camera, TEST_VIEWPORT),
    );

    const inspected = createGardenObservatoryHitTargetSnapshot({
      camera,
      selectedDetailId: placement!.ship.detailId,
      shipMotionSamples: samples,
      world,
    });
    expect(inspected.targetsByDetailId.get(placement!.ship.detailId)?.anchor).toEqual(
      gardenTileToScreen(expectedTile, GARDEN_SHIP_ROOT_Y, camera, TEST_VIEWPORT),
    );
  });

  it("keeps every dense-fleet berth and shore station fully inside both follow viewports", () => {
    const world = denseWorld();
    const slice = selectGardenObservatorySlice(world, null);

    for (const viewport of [
      { width: 1600, height: 1000 },
      { width: 1200, height: 640 },
    ]) {
      const start = defaultCamera({ ...viewport, map: world.map });
      const screenViewport = { x: viewport.width, y: viewport.height };

      for (const placement of slice.ships) {
        const camera = selectionCameraTarget({
          camera: start,
          map: world.map,
          tile: resolveGardenShipDisplayTile({ ...placement, sample: undefined }),
          viewport: screenViewport,
        });
        const target = createGardenObservatoryHitTargetSnapshot({
          camera,
          selectedDetailId: placement.ship.detailId,
          viewport,
          world,
        }).targetsByDetailId.get(placement.ship.detailId);

        expect(target, `${placement.ship.detailId} at ${viewport.width}x${viewport.height}`).toBeDefined();
        expect(rectInsideViewport(target!.rect, viewport), `${placement.ship.detailId} at ${viewport.width}x${viewport.height}`).toBe(true);
      }

      for (const dock of world.docks) {
        const camera = selectionCameraTarget({
          camera: start,
          map: world.map,
          tile: dock.tile,
          viewport: screenViewport,
        });
        const target = createGardenObservatoryHitTargetSnapshot({
          camera,
          selectedDetailId: dock.detailId,
          viewport,
          world,
        }).targetsByDetailId.get(dock.detailId);

        expect(target, `${dock.detailId} at ${viewport.width}x${viewport.height}`).toBeDefined();
        expect(rectInsideViewport(target!.rect, viewport), `${dock.detailId} at ${viewport.width}x${viewport.height}`).toBe(true);
      }
    }
  });
});

describe("Carved sea-name stele targets (W2a)", () => {
  it("opens the water body's own detail rather than a parallel one", () => {
    const world = denseWorld();
    const snapshot = createGardenObservatoryHitTargetSnapshot({
      camera: { offsetX: 720, offsetY: 430, zoom: 0.7776 },
      world,
    });
    const steles = snapshot.targets.filter((target) => target.kind === "sea-sign");

    expect(new Set(steles.map((stele) => stele.detailId)))
      .toEqual(new Set(world.areas.map((area) => area.detailId)));
    for (const stele of steles) {
      expect(world.detailIndex[stele.detailId]).toBeDefined();
    }
  });

  it("wins the per-detail Tab stop from the zone anchor without moving it", () => {
    const world = denseWorld();
    const snapshot = createGardenObservatoryHitTargetSnapshot({
      camera: { offsetX: 720, offsetY: 430, zoom: 0.7776 },
      world,
    });

    for (const area of world.areas) {
      const stele = snapshot.targets.find((target) => (
        target.kind === "sea-sign" && target.detailId === area.detailId
      ));
      const zone = snapshot.targets.find((target) => (
        target.kind === "area" && target.detailId === area.detailId
      ));
      // One point above, so the cycle prefers the stele and the body keeps the
      // slot its zone priority already bought it.
      expect(stele?.priority).toBe(zone!.priority + 1);
      // The keyboard select path reads targetsByDetailId, so it has to be the
      // stele that carries the anchor.
      expect(snapshot.targetsByDetailId.get(area.detailId)?.kind).toBe("sea-sign");
    }
  });

  it("covers the drawn stele at each overview and inhabited scale", () => {
    const world = denseWorld();
    const stele = seaSignSteles(world.areas).find((entry) => entry.detailId)!;
    for (const zoom of [0.28, 0.5, 0.8, 1, 2]) {
      const camera = { offsetX: 720, offsetY: 430, zoom };
      const snapshot = createGardenObservatoryHitTargetSnapshot({ camera, world });
      const target = snapshot.targets.find((entry) => entry.id === `sea-sign.${stele.body}`)!;
      expect(Math.abs(target.rect.width
        - Math.max(24, drawnSteleBounds(stele, seaSignScaleForZoom(zoom), camera).width)))
        .toBeLessThan(0.1);
    }
  });

  it("uses the renderer track's exact scale throughout both hysteresis walks", () => {
    const world = denseWorld();
    const assertWalk = (zooms: readonly number[]) => {
      const track = createSeaSignScaleTrack();
      for (const [index, zoom] of zooms.entries()) {
        const drawnScale = track.advance({
          deltaSeconds: index === 0 ? Number.POSITIVE_INFINITY : 1 / 60,
          zoom,
        });
        const camera = { offsetX: 720, offsetY: 430, zoom };
        const snapshot = createGardenObservatoryHitTargetSnapshot({
          camera,
          seaSignScale: track.scale,
          world,
        });
        const target = snapshot.targets.find((entry) => entry.kind === "sea-sign")!;
        const stele = seaSignSteles(world.areas).find((entry) => entry.detailId)!;
        expect(Math.abs(target.rect.width
          - Math.max(24, drawnSteleBounds(stele, drawnScale, camera).width)))
          .toBeLessThan(0.1);
      }
    };

    // Both resting zooms are inside the hysteresis band: the first walk keeps
    // the 2.6x overview rung and the reverse walk keeps the 1x inhabited rung.
    assertWalk([0.28, 0.41]);
    assertWalk([0.5, 0.39]);
  });

  it("centres the target on the drawn stele at every framing", () => {
    const world = denseWorld();
    for (const zoom of [0.4, 0.7776, 1.4]) {
      const camera = { offsetX: 720, offsetY: 430, zoom };
      const scale = seaSignScaleForZoom(zoom);
      const stele = seaSignSteles(world.areas).find((entry) => entry.detailId);
      const target = createGardenObservatoryHitTargetSnapshot({ camera, world })
        .targetsByDetailId.get(stele!.detailId!);

      const bounds = drawnSteleBounds(stele!, scale, camera);
      expect(Math.abs(target!.anchor!.x - (bounds.x + bounds.width / 2))).toBeLessThan(0.1);
      expect(Math.abs(target!.anchor!.y - (bounds.y + bounds.height / 2))).toBeLessThan(0.1);
      expect(Math.abs(target!.rect.width - Math.max(24, bounds.width))).toBeLessThan(0.1);
    }
  });

  it("stands the steles' duplicate targets down when a detail panel owns the frame", () => {
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

function drawnSteleBounds(
  stele: SeaSignStele,
  scale: number,
  camera: IsoCamera,
) {
  const matrix = new Matrix4().makeTranslation(stele.x, GARDEN_WATER_Y, stele.z)
    .multiply(new Matrix4().makeRotationY(SEA_SIGN_STELE.yaw))
    .multiply(new Matrix4().makeScale(scale, scale, scale));
  const corners = [];
  for (const x of [-SEA_SIGN_STELE.width / 2, SEA_SIGN_STELE.width / 2]) {
    for (const y of [-SEA_SIGN_STELE.height / 2, SEA_SIGN_STELE.height / 2]) {
      const world = new Vector3(x, SEA_SIGN_STELE.baseY + y, 0).applyMatrix4(matrix);
      corners.push(worldToScreen(world, camera, TEST_VIEWPORT));
    }
  }
  const x = Math.min(...corners.map((point) => point.x));
  const y = Math.min(...corners.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...corners.map((point) => point.x)) - x,
    height: Math.max(...corners.map((point) => point.y)) - y,
  };
}

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

function rectInsideViewport(
  rect: { height: number; width: number; x: number; y: number },
  viewport: { height: number; width: number },
): boolean {
  return rect.x >= 0
    && rect.y >= 0
    && rect.x + rect.width <= viewport.width
    && rect.y + rect.height <= viewport.height;
}
