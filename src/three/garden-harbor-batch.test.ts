// @vitest-environment jsdom
import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorDock, type StationType } from "./garden-docks";
import { createGardenHarborBatch } from "./garden-harbor-batch";
import { gardenChainFlagAtlas, resetGardenChainFlagAtlas } from "./garden-chain-flag";
import { countDrawableObjects } from "./garden-util";
import { dockFixture, DISPLAY_TILES, ISLAND_TILE } from "./__fixtures__/harbor";

const CHAINS = ["ethereum", "base", "arbitrum", "polygon", "bsc", "tron", "solana", "hyperliquid", "aptos"];
const BATCH_STATION_TYPES: readonly StationType[] = [
  "boathouse-precinct", "annex-pavilion", "annex-pavilion", "annex-pavilion",
  "gate-landing", "tea-house-quay", "fishing-pier", "stepped-inlet", "reed-boathouse",
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

describe("createGardenHarborBatch", () => {
  it("keeps the station batch at 13 draws so the complete harbor ring stays within 20", () => {
    const batch = batchOfNine();
    expect(countDrawableObjects(batch.root)).toBeLessThanOrEqual(13);
    for (const dock of batch.docks) {
      expect(countDrawableObjects(dock.root)).toBe(0);
      expect(dock.root.name).toBe(`dock-anchor-${dock.recipe.dock.chainId}`);
    }
  });

  it("merges three covered precinct bridges into the existing timber and roof draws", () => {
    const recipes = CHAINS.map((id, index) => {
      const tile = { x: 14, y: 74 + Math.min(index, 3) * 6 };
      const node = {
        ...dockFixture(id, 3 + (index % 7)),
        station: { coveId: `cove.${id}`, shoreBearing: 0, type: BATCH_STATION_TYPES[index]! },
        tile,
      } as ReturnType<typeof dockFixture> & { station: { coveId: string; shoreBearing: number; type: StationType } };
      return authorDock(node, tile, ISLAND_TILE);
    });
    const withoutBridges = recipes.reduce((sum, recipe) => (
      sum + recipe.parts.filter((part) => part.bucket === "timber" || part.bucket === "roof").reduce(
        (partSum, part) => partSum + part.geometry.getAttribute("position").count,
        0,
      )
    ), 0);
    const batch = createGardenHarborBatch(recipes);
    const withBridges = [batch.bucketMeshes.timber, batch.bucketMeshes.roof].reduce(
      (sum, mesh) => sum + (mesh?.geometry.getAttribute("position").count ?? 0),
      0,
    );
    expect(withBridges).toBeGreaterThan(withoutBridges);
    expect(countDrawableObjects(batch.root)).toBeLessThanOrEqual(20);
    batch.dispose();
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

  it("recolours one dock's roofs in place without touching its neighbours", () => {
    const batch = batchOfNine();
    const roof = batch.bucketMeshes.roof as Mesh;
    const colors = roof.geometry.getAttribute("color");
    const before = Array.from(colors.array);
    batch.setDockAccent("solana", new Color("#ff0000"));
    const after = Array.from(colors.array);
    const changed = before.filter((value, index) => value !== after[index]).length;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(before.length / 4);
    expect(colors.needsUpdate || (colors as { version?: number }).version! > 0).toBeTruthy();
  });

  it("toggles fine detail as a whole and keeps the quay height-fog contract on every bucket material", () => {
    const batch = batchOfNine();
    batch.setFineDetailVisible(false);
    for (const mesh of Object.values(batch.fineDetailBucketMeshes)) if (mesh) expect(mesh.visible).toBe(false);
    for (const mesh of Object.values(batch.fineDetailPropMeshes)) if (mesh) expect(mesh.visible).toBe(false);
    for (const mesh of Object.values(batch.bucketMeshes)) {
      if (!mesh) continue;
      expect((mesh.material as { userData: { gardenHeightFog?: unknown } }).userData.gardenHeightFog).toBeTruthy();
    }
  });

  it("flies nine flags from one instanced cloth and turns one without turning the rest", () => {
    const batch = batchOfNine();
    expect(batch.flags.count).toBe(9);
    const matrix = new Matrix4();
    batch.flags.getMatrixAt(1, matrix);
    const beforeBase = matrix.clone();
    batch.setFlagPose("ethereum", 1.2, 0.08);
    batch.flags.getMatrixAt(1, matrix);
    expect(matrix.equals(beforeBase)).toBe(true);
    const shapes = batch.flags.geometry.getAttribute("aFlagShape");
    expect(new Set(Array.from(shapes.array)).size).toBeGreaterThan(4);
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
