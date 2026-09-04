// @vitest-environment jsdom
import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorDock, type StationType } from "./garden-docks";
import { createGardenHarborBatch, HARBOR_WINDOW_EMBER_INTENSITY } from "./garden-harbor-batch";
import { gardenChainFlagAtlas, resetGardenChainFlagAtlas } from "./garden-chain-flag";
import { countDrawableObjects } from "./garden-util";
import { dockFixture, DISPLAY_TILES, ISLAND_TILE } from "./__fixtures__/harbor";

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
  it("keeps every bucket shared so the complete 9-type harbor ring stays within 20 draws", () => {
    const batch = batchOfNine();
    expect(countDrawableObjects(batch.root)).toBeLessThanOrEqual(20);
    for (const dock of batch.docks) {
      expect(countDrawableObjects(dock.root)).toBe(0);
      expect(dock.root.name).toBe(`dock-anchor-${dock.recipe.dock.chainId}`);
    }
    const completeTypeBatch = batchOfAllStationTypes();
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

  it("keeps every station window and lit quay edge in one warm ember draw", () => {
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
      expect(coarse.reduce((sum, mesh) => sum + triangleCount(mesh), 0), `${type} coarse`).toBeLessThanOrEqual(6_000);
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

  it("flies every station flag shape from one instanced cloth and turns one without turning the rest", () => {
    const batch = batchOfAllStationTypes();
    expect(batch.flags.count).toBe(ALL_STATION_TYPES.length);
    const matrix = new Matrix4();
    batch.flags.getMatrixAt(1, matrix);
    const beforeBase = matrix.clone();
    batch.setFlagPose("flag-ethereum-mole", 1.2, 0.08);
    batch.flags.getMatrixAt(1, matrix);
    expect(matrix.equals(beforeBase)).toBe(true);
    const shapes = batch.flags.geometry.getAttribute("aFlagShape");
    expect(new Set(Array.from(shapes.array)).size).toBe(ALL_STATION_TYPES.length);
  });

  it("keeps an unassigned atlas cell on a plain accent cloth", () => {
    const recipe = authorDock(dockFixture("unassigned", 5), DISPLAY_TILES[0]!, ISLAND_TILE);
    recipe.flag.atlasCell = -1;
    const batch = createGardenHarborBatch([recipe]);
    const cell = batch.flags.geometry.getAttribute("aFlagCell");
    expect(cell.getX(0)).toBe(-1);
    const shader = {
      fragmentShader: "#include <common>\n#include <map_fragment>",
      uniforms: {},
      vertexShader: "#include <common>\n#include <uv_vertex>",
    };
    (batch.flags.material as { onBeforeCompile(shader: unknown, renderer: unknown): void })
      .onBeforeCompile(shader, null);
    expect(shader.fragmentShader).toContain("vFlagCell >= 0.0");
    expect(shader.fragmentShader).toContain("cutFlag");
    batch.dispose();
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

function triangleCount(mesh: Mesh | InstancedMesh): number {
  const triangles = (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
  return triangles * (mesh instanceof InstancedMesh ? mesh.count : 1);
}

function fakeCanvasContext(): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
