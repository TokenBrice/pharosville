import {
  InstancedMesh,
  Matrix4,
  Mesh,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import {
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

const LIGHTHOUSE_TILE = { x: 18, y: 28 };

describe("garden harbor districts", () => {
  it("batches live dock pads and merges the available Ethereum rollup links", () => {
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
    expect(districts.pads).toBeInstanceOf(InstancedMesh);
    expect(districts.pads?.count).toBe(docks.length);
    expect(districts.causeways).toBeInstanceOf(Mesh);
    expect(districts.causewayChainIds).toEqual([
      "base",
      "arbitrum",
      "polygon",
    ]);
    expect(objectCount(districts.root)).toBe(2);
    expect(districts.causeways?.geometry.index?.count).toBe(3 * 6 * 6);

    const basePosition = new Vector3().setFromMatrixPosition(
      instanceMatrix(districts.pads!, 1),
    );
    const baseDisplayTile = gardenDockDisplayTile(docks[1]!.tile);
    expect(basePosition.x).toBeCloseTo(baseDisplayTile.x * 2);
    expect(basePosition.z).toBeCloseTo(baseDisplayTile.y * 2);
  });

  it("omits the relationship mesh when no Ethereum hub is rendered", () => {
    const districts = createGardenHarborDistricts(
      [dock("base", 39, 38, 7), dock("solana", 25, 23, 4)],
      LIGHTHOUSE_TILE,
    );

    expect(districts.pads?.count).toBe(2);
    expect(districts.causeways).toBeNull();
    expect(districts.causewayChainIds).toEqual([]);
    expect(objectCount(districts.root)).toBe(1);
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

  it("wheels faster over the filling harbour than the draining one", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE, { docks: TEMPO_DOCKS });
    const swept = (index: number): number => {
      flock.update({ constrained: false, reducedMotion: false, timeSeconds: 0 });
      const from = quayAngle(flock, index);
      flock.update({ constrained: false, reducedMotion: false, timeSeconds: 8 });
      return angleDelta(from, quayAngle(flock, index));
    };

    expect(swept(FILLING)).toBeGreaterThan(swept(DRAINING));
  });

  it("keeps a still, deterministic tempo reading under reduced motion", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE, { docks: TEMPO_DOCKS });
    const still = { constrained: false, reducedMotion: true, timeSeconds: 0 };

    flock.update({ ...still, timeSeconds: 4 });
    const frozen = instanceMatrices(flock.gulls);
    flock.update({ ...still, timeSeconds: 900 });
    expect(instanceMatrices(flock.gulls)).toEqual(frozen);

    // Frozen, the tempo still reads: the filling harbour's gulls wheel wider
    // and higher than the draining harbour's.
    expect(quayRadius(flock, FILLING)).toBeGreaterThan(quayRadius(flock, DRAINING));
    expect(quayHeight(flock, FILLING)).toBeGreaterThan(quayHeight(flock, DRAINING));
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

/** The quay gull's bearing around its wheel, relative to its harbour. */
function quayAngle(flock: GardenGullFlock, index: number): number {
  const offset = quayOffset(flock, index);
  return Math.atan2(offset.z / 0.68, offset.x);
}

function quayRadius(flock: GardenGullFlock, index: number): number {
  const offset = quayOffset(flock, index);
  return Math.hypot(offset.x, offset.z / 0.68);
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

/** Shortest signed sweep from one bearing to the next, in radians. */
function angleDelta(from: number, to: number): number {
  const delta = (to - from) % (Math.PI * 2);
  return Math.abs(delta > Math.PI ? delta - Math.PI * 2 : delta);
}

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
