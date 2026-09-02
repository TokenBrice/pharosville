import {
  BoxGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import {
  GARDEN_DOCK_ROOT_Y,
  gardenDockDisplayTile,
  gardenIslandDisplayTile,
} from "../systems/garden-observatory-slice";
import type { DockNode } from "../systems/world-types";
import {
  createGardenGullFlock,
  createGardenHarborDistricts,
  GARDEN_GULL_COUNT,
  GARDEN_QUAY_GULL_COUNT,
  type GardenGullFlock,
} from "./garden-harbor-life";
import {
  createGardenLaneRegistry,
  MAX_GARDEN_LIGHT_LANES,
} from "./garden-lanterns";

const LIGHTHOUSE_TILE = { x: 18, y: 28 };

describe("garden harbor districts", () => {
  it("builds broken instanced stonework for the available Ethereum rollup links", () => {
    const laneRegistry = createGardenLaneRegistry();
    const docks = [
      dock("ethereum", 39, 31, 10),
      dock("base", 39, 38, 7),
      dock("arbitrum", 33, 41, 6),
      dock("polygon", 28, 41, 5),
      dock("solana", 25, 23, 4),
    ];

    const districts = createGardenHarborDistricts(
      docks,
      LIGHTHOUSE_TILE,
      { tileScale: 2 },
    );

    expect(districts.root.name).toBe("garden-harbor-districts");
    expect(districts.pads).toBeNull();
    expect(districts.causeways).toBeInstanceOf(InstancedMesh);
    expect(districts.causeways?.geometry).toBeInstanceOf(BoxGeometry);
    expect(districts.causewayChainIds).toEqual([
      "base",
      "arbitrum",
      "polygon",
    ]);
    expect(objectCount(districts.root)).toBe(2);
    expect(districts.causewaySegmentCount).toBe(3 * 6);
    expect(districts.causeways?.count).toBe(3 * (6 + 2));
    expect(districts.lanternCount).toBe(3 * 2);
    expect(districts.lanterns?.count).toBe(3 * 2);

    const firstStone = new Vector3().setFromMatrixPosition(
      instanceMatrix(districts.causeways!, 0),
    );
    const ethereumTile = gardenDockDisplayTile(docks[0]!.tile);
    expect(firstStone.distanceTo(new Vector3(
      ethereumTile.x * 2,
      firstStone.y,
      ethereumTile.y * 2,
    ))).toBeGreaterThan(0.2);

    expect(laneRegistry.sync("full")).toBe(3);
    const laneData = laneRegistry.texture.image.data as Float32Array;
    expect(Array.from({ length: 3 }, (_, index) => laneData[index * 4 + 3]))
      .toEqual([3, 3, 3]);
    const routeRow = MAX_GARDEN_LIGHT_LANES * 2 * 4;
    const endpointXs = Array.from(
      { length: 3 },
      (_, index) => laneData[routeRow + index * 4],
    );
    expect(endpointXs).toContainEqual(expect.closeTo(
      gardenDockDisplayTile(docks[1]!.tile).x * 2,
    ));
    laneRegistry.clear();
    expect(laneRegistry.sync("full")).toBe(3);
    laneRegistry.dispose();
  });

  it("omits the relationship mesh when no Ethereum hub is rendered", () => {
    const districts = createGardenHarborDistricts(
      [dock("base", 39, 38, 7), dock("solana", 25, 23, 4)],
      LIGHTHOUSE_TILE,
    );

    expect(districts.pads).toBeNull();
    expect(districts.causeways).toBeNull();
    expect(districts.lanterns).toBeNull();
    expect(districts.causewaySegmentCount).toBe(0);
    expect(districts.lanternCount).toBe(0);
    expect(districts.causewayChainIds).toEqual([]);
    expect(objectCount(districts.root)).toBe(0);
  });
});

describe("garden gull flock", () => {
  it("is one nine-instance batch anchored to the displayed island", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE, { tileScale: 2 });
    const islandTile = gardenIslandDisplayTile(LIGHTHOUSE_TILE);

    expect(flock.root.name).toBe("garden-harbor-gull-flock");
    expect(flock.root.position.toArray()).toEqual([
      islandTile.x * 2,
      0,
      islandTile.y * 2,
    ]);
    expect(flock.gulls).toBeInstanceOf(InstancedMesh);
    expect(flock.gulls.count).toBe(GARDEN_GULL_COUNT);
    expect(objectCount(flock.root)).toBe(1);
  });

  it("moves deterministically, freezes for reduced motion, and hides when constrained", () => {
    const first = createGardenGullFlock(LIGHTHOUSE_TILE);
    const second = createGardenGullFlock(LIGHTHOUSE_TILE);

    first.update({
      constrained: false,
      reducedMotion: false,
      timeSeconds: 2,
    });
    second.update({
      constrained: false,
      reducedMotion: false,
      timeSeconds: 2,
    });
    expect(instanceMatrices(first.gulls)).toEqual(instanceMatrices(second.gulls));

    const moving = instanceMatrices(first.gulls);
    first.update({
      constrained: false,
      reducedMotion: false,
      timeSeconds: 12,
    });
    expect(instanceMatrices(first.gulls)).not.toEqual(moving);

    first.update({
      constrained: false,
      reducedMotion: true,
      timeSeconds: 3,
    });
    const reduced = instanceMatrices(first.gulls);
    first.update({
      constrained: false,
      reducedMotion: true,
      timeSeconds: 300,
    });
    expect(instanceMatrices(first.gulls)).toEqual(reduced);

    first.update({
      constrained: true,
      reducedMotion: false,
      timeSeconds: 301,
    });
    expect(first.root.visible).toBe(false);
    first.update({
      constrained: false,
      reducedMotion: false,
      timeSeconds: 302,
    });
    expect(first.root.visible).toBe(true);
  });
});

describe("harbour tempo", () => {
  // A filling harbour and a draining one, everything else equal.
  const TEMPO_DOCKS = [
    dock("filling", 39, 31, 6, 4),
    dock("draining", 25, 23, 6, -4),
  ];
  const FILLING = GARDEN_GULL_COUNT;
  const DRAINING = GARDEN_GULL_COUNT + GARDEN_QUAY_GULL_COUNT;

  it("adds quay gulls as instances of the one existing batch", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE, { docks: TEMPO_DOCKS });

    expect(flock.gulls.count).toBe(
      GARDEN_GULL_COUNT + TEMPO_DOCKS.length * GARDEN_QUAY_GULL_COUNT,
    );
    // The whole layer is still one mesh, so still one draw call.
    expect(objectCount(flock.root)).toBe(1);
    expect(flock.root.children).toEqual([flock.gulls]);
  });

  it("takes its turns more often, wider and higher over the filling harbour", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE, { docks: TEMPO_DOCKS });
    // W3.4 keeps every tempo channel it ever had — the gulls simply spend most
    // of their time sitting between turns. Rate now reads as how OFTEN a bird
    // takes a turn (the share of time she is up is the same at every harbour,
    // by design: it is the frequency that carries the reading).
    const survey = (index: number) => {
      let sorties = 0;
      let wasUp = false;
      let reach = 0;
      let ceiling = -Infinity;
      let perched = 0;
      let samples = 0;
      for (let seconds = 0; seconds <= 600; seconds += 2) {
        flock.update({ constrained: false, reducedMotion: false, timeSeconds: seconds });
        const height = quayHeight(flock, index);
        const up = height > QUAY_DECK_Y + 0.2;
        if (up && !wasUp) sorties += 1;
        wasUp = up;
        if (!up) perched += 1;
        reach = Math.max(reach, quayRadius(flock, index));
        ceiling = Math.max(ceiling, height);
        samples += 1;
      }
      return { ceiling, perched: perched / samples, reach, sorties };
    };

    const filling = survey(FILLING);
    const draining = survey(DRAINING);
    expect(filling.sorties).toBeGreaterThan(draining.sorties);
    expect(filling.reach).toBeGreaterThan(draining.reach);
    expect(filling.ceiling).toBeGreaterThan(draining.ceiling);
    // And whichever harbour it is, the bird is on the quay most of the time.
    expect(filling.perched).toBeGreaterThan(0.6);
    expect(draining.perched).toBeGreaterThan(0.6);
  });

  it("stands every gull on the quay under reduced motion, tempo still reading", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE, { docks: TEMPO_DOCKS });
    const still = { constrained: false, reducedMotion: true, timeSeconds: 0 };

    flock.update({ ...still, timeSeconds: 4 });
    const frozen = instanceMatrices(flock.gulls);
    flock.update({ ...still, timeSeconds: 900 });
    expect(instanceMatrices(flock.gulls)).toEqual(frozen);

    // Not a freeze mid-wheel: both harbours' birds are sitting on their pier
    // decks, at the deck's own constant height.
    expect(quayHeight(flock, FILLING)).toBeCloseTo(QUAY_DECK_Y, 6);
    expect(quayHeight(flock, DRAINING)).toBeCloseTo(QUAY_DECK_Y, 6);

    // The tempo survives the freeze as static geometry, in the channel a still
    // frame can still carry: the filling harbour's gulls sit further out along
    // the pier head, the draining harbour's tuck in at its root.
    expect(quayRadius(flock, FILLING)).toBeGreaterThan(quayRadius(flock, DRAINING));
  });

  it("perches the island flock on the island, and lifts about a quarter of it", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE);
    const heights: number[][] = Array.from({ length: GARDEN_GULL_COUNT }, () => []);
    for (let seconds = 0; seconds <= 900; seconds += 3) {
      flock.update({ constrained: false, reducedMotion: false, timeSeconds: seconds });
      for (let index = 0; index < GARDEN_GULL_COUNT; index += 1) {
        heights[index]!.push(
          new Vector3().setFromMatrixPosition(instanceMatrix(flock.gulls, index)).y,
        );
      }
    }
    // A bird's own floor over a long sweep IS her perch — she returns to the
    // exact spot she left. Clear of it means up.
    let airborne = 0;
    let samples = 0;
    for (const track of heights) {
      const perch = Math.min(...track);
      for (const height of track) {
        if (height > perch + 0.5) airborne += 1;
        samples += 1;
      }
    }
    const share = airborne / samples;
    expect(share).toBeGreaterThan(0.12);
    expect(share).toBeLessThan(0.35);
    // Nine birds, nine different perches: no two share a roost.
    const perches = heights.map((track) => Math.min(...track).toFixed(3));
    expect(new Set(perches).size).toBeGreaterThan(4);

    // And under reduced motion none of them are up at all: the still frame is
    // the flock at rest on real island geometry, not a freeze in mid-air.
    flock.update({ constrained: false, reducedMotion: true, timeSeconds: 0 });
    for (let index = 0; index < GARDEN_GULL_COUNT; index += 1) {
      const position = new Vector3()
        .setFromMatrixPosition(instanceMatrix(flock.gulls, index));
      expect(position.y).toBeLessThan(7);
      // On the island, not out over the water: the sea wall's own ellipse is
      // 17.2 x 12.9, and every perch is inside it.
      expect(Math.hypot(position.x, position.z)).toBeLessThan(19);
    }
  });

  it("gives a harbour with no supply reading the resting tempo", () => {
    const unknown = createGardenGullFlock(LIGHTHOUSE_TILE, {
      docks: [dock("filling", 39, 31, 6, null)],
    });
    const flat = createGardenGullFlock(LIGHTHOUSE_TILE, {
      docks: [dock("filling", 39, 31, 6, 0)],
    });
    const still = { constrained: false, reducedMotion: false, timeSeconds: 7 };

    unknown.update(still);
    flat.update(still);
    expect(instanceMatrices(unknown.gulls)).toEqual(instanceMatrices(flat.gulls));
  });
});

/** How far off its harbour's centre a quay gull sits, on the water plane. */
function quayRadius(flock: GardenGullFlock, index: number): number {
  const offset = quayOffset(flock, index);
  return Math.hypot(offset.x, offset.z);
}

function quayHeight(flock: GardenGullFlock, index: number): number {
  return new Vector3().setFromMatrixPosition(instanceMatrix(flock.gulls, index)).y;
}

function quayOffset(
  flock: GardenGullFlock,
  index: number,
): { x: number; z: number } {
  const quay = Math.floor((index - GARDEN_GULL_COUNT) / GARDEN_QUAY_GULL_COUNT);
  const islandTile = gardenIslandDisplayTile(LIGHTHOUSE_TILE);
  const dockTile = gardenDockDisplayTile(TEMPO_DOCK_TILES[quay]!);
  const position = new Vector3().setFromMatrixPosition(
    instanceMatrix(flock.gulls, index),
  );
  return {
    x: position.x - (dockTile.x - islandTile.x) * Math.SQRT2,
    z: position.z - (dockTile.y - islandTile.y) * Math.SQRT2,
  };
}

const TEMPO_DOCK_TILES = [{ x: 39, y: 31 }, { x: 25, y: 23 }];

/**
 * The pier deck a resting quay gull stands on, in the flock's own space: the
 * deck's constant top (0.21 above the harbour root, `garden-docks.ts`) plus the
 * hair of clearance the flock leaves, taken down to the dock root's own height.
 */
const QUAY_DECK_Y = 0.21 + 0.04 + GARDEN_DOCK_ROOT_Y;

function dock(
  chainId: string,
  x: number,
  y: number,
  size: number,
  change24hPct: number | null = null,
): DockNode {
  return {
    chainId,
    change24hPct,
    concentration: null,
    detailId: `dock.${chainId}`,
    harboredStablecoins: [],
    healthBand: "healthy",
    id: `dock.${chainId}`,
    kind: "dock",
    station: { coveId: "fixture-cove", type: "tea-house-quay", shoreBearing: 0 },
    label: chainId,
    size,
    stablecoinCount: 1,
    tile: { x, y },
    totalUsd: size * 1_000_000,
  };
}

function objectCount(root: import("three").Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof Mesh) count += 1;
  });
  return count;
}

function instanceMatrices(mesh: InstancedMesh): number[][] {
  return Array.from({ length: mesh.count }, (_, index) => (
    instanceMatrix(mesh, index).toArray()
  ));
}

function instanceMatrix(mesh: InstancedMesh, index: number): Matrix4 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix;
}
