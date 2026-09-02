import { Color, InstancedMesh, Matrix4, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { authorDock } from "./garden-docks";
import { createGardenHarborBatch } from "./garden-harbor-batch";
import { countDrawableObjects } from "./garden-util";
import { dockFixture, DISPLAY_TILES, ISLAND_TILE } from "./__fixtures__/harbor";

const CHAINS = ["ethereum", "base", "arbitrum", "polygon", "bsc", "tron", "solana", "hyperliquid", "aptos"];

function batchOfNine() {
  return createGardenHarborBatch(CHAINS.map((id, index) => (
    authorDock(dockFixture(id, 3 + (index % 7)), DISPLAY_TILES[index]!, ISLAND_TILE)
  )));
}

describe("createGardenHarborBatch", () => {
  it("draws nine harbours in at most 20 drawables and leaves every dock anchor empty", () => {
    const batch = batchOfNine();
    expect(countDrawableObjects(batch.root)).toBeLessThanOrEqual(20);
    for (const dock of batch.docks) {
      expect(countDrawableObjects(dock.root)).toBe(0);
      expect(dock.root.name).toBe(`dock-anchor-${dock.recipe.dock.chainId}`);
    }
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
    batch.dispose();
  });
});
