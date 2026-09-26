// @vitest-environment jsdom
import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
  type Group,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HARBOR_DERIVED_PALETTE } from "../systems/palette";
import { authorDock, type StationType } from "./garden-docks";
import { createGardenHarborBatch, HARBOR_WINDOW_EMBER_INTENSITY } from "./garden-harbor-batch";
import { gardenChainFlagAtlas, resetGardenChainFlagAtlas } from "./garden-chain-flag";
import { countDrawableObjects } from "./garden-util";
import { dockFixture, DISPLAY_TILES, ISLAND_TILE } from "./__fixtures__/harbor";
import { EVM_BAY_STATION_SLOTS, OUTER_HARBOR_STATION_SLOTS, PIGEONNIER_STATION_SLOT } from "../systems/world-layout";

const CHAINS = ["ethereum", "base", "arbitrum", "polygon", "bsc", "tron", "solana", "hyperliquid", "aptos"];
// The nine-dock set pairs each chain with its slot archetype (aptos stands
// in for the pigeonnier so the ninth berth's form is batched too); the
// all-archetype set flies one flag per surviving station type.
const BATCH_STATION_TYPES: readonly StationType[] = [
  "ethereum-mole", "hatago-wharf", "storm-mole", "reed-boathouse",
  "tea-house-quay", "stepped-inlet", "fishing-pier", "uogashi", "pigeonnier-islet",
];
const ALL_STATION_TYPES: readonly StationType[] = [
  "ethereum-mole", "hatago-wharf", "uogashi", "stepped-inlet", "fishing-pier",
  "tea-house-quay", "reed-boathouse", "storm-mole", "pigeonnier-islet",
];

const EXPECTED_HARBOR_DRAWABLE_NAMES = [
  "dock-chain-flag",
  "dock-lamp-heads",
  "dock-posts",
  "harbor-accent",
  "harbor-fine-bollard",
  "harbor-fine-metal",
  "harbor-fine-plank",
  "harbor-metal",
  "harbor-netRack",
  "harbor-piling",
  "harbor-reedClump",
  "harbor-roof",
  "harbor-stone",
  "harbor-timber",
  "harbor-wall",
  "station-lit-screens",
] as const;

beforeEach(() => {
  resetGardenChainFlagAtlas();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: vi.fn(() => fakeCanvasContext()),
  });
});

afterEach(() => {
  resetGardenChainFlagAtlas();
});

function batchOfNine() {
  return createGardenHarborBatch(CHAINS.map((id, index) => (
    authorDock({
      ...dockFixture(id, 3 + (index % 7)),
      station: {
        coveId: `batch-${id}`,
        shoreBearing: (index / CHAINS.length) * Math.PI * 2,
        type: BATCH_STATION_TYPES[index]!,
      },
    }, DISPLAY_TILES[index]!, ISLAND_TILE)
  )));
}

function batchOfAllStationTypes() {
  return createGardenHarborBatch(ALL_STATION_TYPES.map((type, index) => {
    const id = `flag-${type}`;
    return authorDock({
      ...dockFixture(id, 6),
      station: {
        coveId: `batch-${id}`,
        shoreBearing: (index / ALL_STATION_TYPES.length) * Math.PI * 2,
        type,
      },
    }, DISPLAY_TILES[index % DISPLAY_TILES.length]!, ISLAND_TILE);
  }));
}

describe("createGardenHarborBatch", () => {
  it("pins the complete 9-type harbor ring to its 16 shared drawables", () => {
    const batch = batchOfNine();
    const drawableNames = namedDrawables(batch.root);
    expect(drawableNames).toEqual(EXPECTED_HARBOR_DRAWABLE_NAMES);
    expect(drawableNames).toHaveLength(16);
    expect(countDrawableObjects(batch.root)).toBe(16);
    expect(countDrawableObjects(batch.root)).toBeLessThanOrEqual(20);
    for (const dock of batch.docks) {
      expect(countDrawableObjects(dock.root)).toBe(0);
      expect(dock.root.name).toBe(`dock-anchor-${dock.recipe.dock.chainId}`);
    }
    const completeTypeBatch = batchOfAllStationTypes();
    const completeTypeDrawableNames = namedDrawables(completeTypeBatch.root);
    expect(completeTypeDrawableNames).toEqual(EXPECTED_HARBOR_DRAWABLE_NAMES);
    expect(completeTypeDrawableNames).toHaveLength(16);
    expect(countDrawableObjects(completeTypeBatch.root)).toBe(16);
    expect(countDrawableObjects(completeTypeBatch.root)).toBeLessThanOrEqual(20);
    completeTypeBatch.dispose();
  });

  it("places every prop of every kind in one instanced mesh per kind", () => {
    const batch = batchOfNine();
    const expected = new Map<string, number>();
    for (const dock of batch.docks) for (const prop of dock.recipe.props) {
      if (prop.fineDetail) continue;
      expected.set(prop.kind, (expected.get(prop.kind) ?? 0) + 1);
    }
    for (const [kind, count] of expected) {
      const mesh = batch.propMeshes[kind as keyof typeof batch.propMeshes];
      expect(mesh, kind).toBeInstanceOf(InstancedMesh);
      expect(mesh!.count).toBe(count);
    }
  });

  it("bakes each architectural accent into its own range and recolours only the selected station", () => {
    const batch = batchOfNine();
    const roof = batch.bucketMeshes.roof as Mesh;
    const accent = batch.bucketMeshes.accent as Mesh;
    const roofBefore = Array.from(roof.geometry.getAttribute("color").array);
    const accentBefore = Array.from(accent.geometry.getAttribute("color").array);
    let vertexStart = 0;
    for (const dock of batch.docks) {
      const part = dock.recipe.parts.find((candidate) => candidate.bucket === "accent")!;
      const baked = accent.geometry.getAttribute("color");
      const expected = part.color;
      expect(baked.getX(vertexStart)).toBeCloseTo(expected.r, 6);
      expect(baked.getY(vertexStart)).toBeCloseTo(expected.g, 6);
      expect(baked.getZ(vertexStart)).toBeCloseTo(expected.b, 6);
      vertexStart += part.geometry.getAttribute("position").count;
    }
    const targetIndex = CHAINS.indexOf("solana");
    const targetStart = batch.docks.slice(0, targetIndex).reduce((sum, dock) => (
      sum + dock.recipe.parts.find((part) => part.bucket === "accent")!.geometry.getAttribute("position").count * 3
    ), 0);
    const targetCount = batch.docks[targetIndex]!.recipe.parts
      .find((part) => part.bucket === "accent")!.geometry.getAttribute("position").count * 3;
    batch.setDockAccent("solana", new Color("#ff0000"));
    const roofAfter = Array.from(roof.geometry.getAttribute("color").array);
    const accentAfter = Array.from(accent.geometry.getAttribute("color").array);
    const changed = accentBefore.flatMap((value, index) => value === accentAfter[index] ? [] : [index]);
    expect(roofBefore.filter((value, index) => value !== roofAfter[index])).toHaveLength(0);
    expect(changed).toEqual(Array.from({ length: targetCount }, (_, index) => targetStart + index));
    expect(batch.docks.find((dock) => dock.recipe.dock.chainId === "solana")?.recipe.accentColor)
      .toEqual(new Color("#ff0000"));
  });

  it("toggles fine detail as a whole and keeps the quay height-fog contract on every bucket material", () => {
    const batch = batchOfNine();
    for (const mesh of Object.values(batch.fineDetailBucketMeshes)) if (mesh) expect(mesh.visible).toBe(false);
    for (const mesh of Object.values(batch.fineDetailPropMeshes)) if (mesh) expect(mesh.visible).toBe(false);
    batch.setFineDetailVisible(true);
    for (const mesh of Object.values(batch.fineDetailBucketMeshes)) if (mesh) expect(mesh.visible).toBe(true);
    for (const mesh of Object.values(batch.fineDetailPropMeshes)) if (mesh) expect(mesh.visible).toBe(true);
    batch.setFineDetailVisible(false);
    for (const mesh of Object.values(batch.fineDetailBucketMeshes)) if (mesh) expect(mesh.visible).toBe(false);
    for (const mesh of Object.values(batch.fineDetailPropMeshes)) if (mesh) expect(mesh.visible).toBe(false);
    for (const mesh of Object.values(batch.bucketMeshes)) {
      if (!mesh) continue;
      expect((mesh.material as { userData: { gardenHeightFog?: unknown } }).userData.gardenHeightFog).toBeTruthy();
    }
  });

  it("keeps every station window and lit quay edge in one day-cycle-driven ember draw", () => {
    // T0.2 (2026-09-07): HARBOR_WINDOW_EMBER_INTENSITY is now only the value
    // the bucket is BORN with — `updateDayCycle` overwrites it every frame
    // (0.35 day / 1.75 dusk / 2.10 night) via `content.harborBatch`. Before
    // that fix it was a constant, so the harbour was as lit at noon as at
    // midnight. What this test pins is the SHARE: one material, one draw, so
    // the whole quay lights on a single write.
    const batch = batchOfAllStationTypes();
    const windows = batch.bucketMeshes.window as Mesh;
    expect(windows.name).toBe("station-lit-screens");
    expect(windows.material).toMatchObject({
      emissiveIntensity: HARBOR_WINDOW_EMBER_INTENSITY,
      toneMapped: false,
      vertexColors: true,
    });
    expect(batch.docks.every((dock) => dock.recipe.features.warmWindowCount > 0)).toBe(true);
    expect(batch.docks.every((dock) => dock.recipe.features.quayPlatform.litEdge)).toBe(true);
    batch.dispose();
  });

  it("holds per-station and whole-layer fidelity triangle ceilings", () => {
    for (const type of ALL_STATION_TYPES) {
      const batch = createGardenHarborBatch([
        authorDock({
          ...dockFixture(`budget-${type}`, 6),
          station: { coveId: `budget-${type}`, shoreBearing: 0, type },
        }, DISPLAY_TILES[0]!, ISLAND_TILE),
      ]);
      const coarse = [
        ...Object.values(batch.bucketMeshes),
        ...Object.values(batch.propMeshes),
        batch.flags,
      ].filter((mesh): mesh is Mesh | InstancedMesh => mesh !== null);
      const fine = [
        ...Object.values(batch.fineDetailBucketMeshes),
        ...Object.values(batch.fineDetailPropMeshes),
      ].filter((mesh): mesh is Mesh | InstancedMesh => mesh !== null);
      // W3.9 spends at most 468 added triangles per station on its approach.
      expect(coarse.reduce((sum, mesh) => sum + triangleCount(mesh), 0), `${type} coarse`).toBeLessThanOrEqual(6_500);
      expect(fine.reduce((sum, mesh) => sum + triangleCount(mesh), 0), `${type} fine`).toBeLessThanOrEqual(6_000);
      batch.dispose();
    }
    const layer = batchOfAllStationTypes();
    const layerTriangles = [
      ...Object.values(layer.bucketMeshes),
      ...Object.values(layer.propMeshes),
      layer.flags,
    ].filter((mesh): mesh is Mesh | InstancedMesh => mesh !== null)
      .reduce((sum, mesh) => sum + triangleCount(mesh), 0);
    expect(layerTriangles).toBeLessThanOrEqual(60_000);
    expect(countDrawableObjects(layer.root)).toBeLessThanOrEqual(20);
    layer.dispose();
  });

  it("flies every station's nobori from one instanced cloth and turns a chain's banners without turning the rest", () => {
    const batch = batchOfAllStationTypes();
    // The Mole flies a pair; every other station one banner.
    expect(batch.flags.count).toBe(ALL_STATION_TYPES.length + 1);
    const matrix = new Matrix4();
    const before = Array.from({ length: batch.flags.count }, (_, index) => {
      batch.flags.getMatrixAt(index, matrix);
      return matrix.clone();
    });
    batch.setFlagPose("flag-ethereum-mole", 1.2, 0.08);
    const moved = before.map((previous, index) => {
      batch.flags.getMatrixAt(index, matrix);
      return !matrix.equals(previous);
    });
    expect(moved.filter(Boolean)).toHaveLength(2);
    expect(moved.slice(0, 2)).toEqual([true, true]);
    batch.dispose();
  });

  it("flies plain kinari cloth when a chain has no atlas cell", () => {
    const recipe = authorDock(dockFixture("unassigned", 5), DISPLAY_TILES[0]!, ISLAND_TILE);
    recipe.flag.atlasCell = -1;
    const batch = createGardenHarborBatch([recipe]);
    expect(batch.flags.geometry.getAttribute("aFlagCell").getX(0)).toBe(-1);
    const cloth = new Color();
    batch.flags.getColorAt(0, cloth);
    expect(cloth.getHexString()).toBe(new Color(HARBOR_DERIVED_PALETTE.flag_kinari).getHexString());
    batch.dispose();
  });

  // The nobori sites are authored per station form, at the bearing of the one
  // mouth that form stands at, against geometry that grows with supply (quays,
  // approaches) and frontage (halls). A pole that lands in mid-air, or cloth
  // that swings through a roof or tower in the wind, is the failure this
  // guards, across the supply space a real feed produces.
  it("stands every nobori on its station's eave or landing with pole and cloth clear", () => {
    const bearingByType = new Map([...EVM_BAY_STATION_SLOTS, ...OUTER_HARBOR_STATION_SLOTS, PIGEONNIER_STATION_SLOT]
      .map((slot) => [slot.type, slot.cove.seawardBearing]));
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const ray = new Raycaster();
    const down = new Vector3(0, -1, 0);
    const supplies = [
      { size: 2, totalUsd: 3e7 }, { size: 5, totalUsd: 3e7 },
      { size: 5, totalUsd: 1.5e9 }, { size: 8, totalUsd: 1.5e9 },
      { size: 10, totalUsd: 2e11 },
    ];
    for (const type of ALL_STATION_TYPES) for (const supply of supplies) for (const frontageShare of [0.01, 1, 100]) {
      const recipe = authorDock({
        ...dockFixture(`site-${type}`, supply.size, null, supply.totalUsd),
        frontageMedianShare: 1,
        frontageShare,
        station: { coveId: `site-${type}`, shoreBearing: bearingByType.get(type)!, type },
      }, DISPLAY_TILES[0]!, ISLAND_TILE);
      const meshes = recipe.parts.map((part) => new Mesh(part.geometry, material));
      const firstHit = (from: Vector3, far: number) => {
        ray.set(from, down);
        ray.far = far;
        return ray.intersectObjects(meshes, false)[0] ?? null;
      };
      const { banners, yaw } = recipe.flag.placement;
      const label = `${type} ${supply.totalUsd}/${supply.size}/${frontageShare}`;
      for (const banner of banners) {
        // The pole rises from structure at its foot (a sloped roof may stand
        // above the foot, never above the hem), and nothing crosses the pole
        // or the cloth above the hem.
        const surface = firstHit(new Vector3(banner.x, 60, banner.z), 100)?.point.y ?? -Infinity;
        expect(surface, `${label} foot`).toBeGreaterThan(banner.footY - 0.12);
        expect(surface, `${label} foot`).toBeLessThan(banner.clothBottomY - 0.2);
        for (const swing of [-0.28, 0, 0.28]) for (const u of [0, 0.1, 0.4, 0.7, 1]) {
          const probe = new Vector3(
            banner.x + Math.cos(yaw + swing) * banner.clothWidth * u,
            banner.poleTopY,
            banner.z - Math.sin(yaw + swing) * banner.clothWidth * u,
          );
          expect(firstHit(probe, banner.poleTopY - banner.clothBottomY), `${label} cloth u${u} swing ${swing}`).toBeNull();
        }
      }
    }
    material.dispose();
  });

  it("disposes its merged geometry, instance buffers, and materials but keeps the shared flag atlas", () => {
    const batch = batchOfNine();
    const meshes = [
      ...Object.values(batch.bucketMeshes),
      ...Object.values(batch.fineDetailBucketMeshes),
      ...Object.values(batch.propMeshes),
      ...Object.values(batch.fineDetailPropMeshes),
      batch.flags,
    ].filter((mesh): mesh is Mesh | InstancedMesh => mesh !== null);
    const geometries = new Set(meshes.map((mesh) => mesh.geometry));
    const materials = new Set(meshes.flatMap((mesh) => (
      Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    )));
    const instanceAttributes = new Set<InstancedBufferAttribute>();
    for (const mesh of meshes) {
      if (!(mesh instanceof InstancedMesh)) continue;
      instanceAttributes.add(mesh.instanceMatrix);
      if (mesh.instanceColor) instanceAttributes.add(mesh.instanceColor);
      for (const attribute of Object.values(mesh.geometry.attributes)) {
        if (attribute instanceof InstancedBufferAttribute) instanceAttributes.add(attribute);
      }
    }
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, "dispose"));
    const materialDisposals = [...materials].map((material) => vi.spyOn(material, "dispose"));
    const attributeDisposals = [...instanceAttributes].map((attribute) => vi.spyOn(attribute, "dispose"));
    const atlasTexture = gardenChainFlagAtlas().texture!;
    const atlasDisposal = vi.spyOn(atlasTexture, "dispose");
    expect((batch.flags.material as { map: unknown }).map).toBe(atlasTexture);

    batch.dispose();

    for (const dispose of geometryDisposals) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of materialDisposals) expect(dispose).toHaveBeenCalledTimes(1);
    for (const dispose of attributeDisposals) expect(dispose).toHaveBeenCalledTimes(1);
    expect(atlasDisposal).not.toHaveBeenCalled();
  });
});

function namedDrawables(root: Group): string[] {
  const names: string[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) names.push(object.name);
  });
  return names.sort();
}

function triangleCount(mesh: Mesh | InstancedMesh): number {
  const triangles = (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
  return triangles * (mesh instanceof InstancedMesh ? mesh.count : 1);
}

function fakeCanvasContext(): CanvasRenderingContext2D {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
