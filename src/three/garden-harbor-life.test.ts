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
    expect(drawableCount(districts.root)).toBe(2);
    expect(districts.causeways?.geometry.index?.count).toBe(3 * 6 * 6);

    const basePosition = new Vector3().setFromMatrixPosition(
      instanceMatrix(districts.pads!, 1),
    );
    const baseDisplayTile = gardenDockDisplayTile(docks[1]!.tile, 1);
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
    expect(drawableCount(districts.root)).toBe(1);
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
    expect(drawableCount(flock.root)).toBe(1);
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

function dock(
  chainId: string,
  x: number,
  y: number,
  size: number,
): DockNode {
  return {
    assetId: `dock.${chainId}`,
    chainId,
    concentration: null,
    detailId: `dock.${chainId}`,
    harboredStablecoins: [],
    healthBand: "healthy",
    id: `dock.${chainId}`,
    kind: "dock",
    label: chainId,
    logoSrc: null,
    size,
    stablecoinCount: 1,
    tile: { x, y },
    totalUsd: size * 1_000_000,
  };
}

function drawableCount(root: import("three").Object3D): number {
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
