import { Mesh, MeshStandardMaterial, Texture, Vector3, type Material, type WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";
import { CEMETERY_ENTRIES } from "@shared/lib/cemetery-merged";
import { graveNodesFromEntries } from "../systems/world-layout";
import {
  createGardenStoneGarden,
  STONE_GARDEN_LANTERN_NAME,
  STONE_GARDEN_STONES_NAME,
} from "./garden-stone-garden";

const graves = graveNodesFromEntries(CEMETERY_ENTRIES);

/** Runs the lamp's shader chain on a stub and returns the anniversary uniform it binds. */
function lanternLit(root: Mesh["parent"]): { value: number } {
  const lamp = root!.getObjectByName(STONE_GARDEN_LANTERN_NAME) as Mesh<never, MeshStandardMaterial>;
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader: "#include <common>\n#include <emissivemap_fragment>",
  };
  lamp.material.onBeforeCompile(shader as never, {} as WebGLRenderer);
  return shader.uniforms.uAnniversaryLit as { value: number };
}

describe("garden stone garden", () => {
  it("gives every grave one selectable anchor at its own stone", () => {
    const garden = createGardenStoneGarden(graves);
    expect(garden.anchors.size).toBe(graves.length);
    for (const grave of graves) {
      const anchor = garden.anchors.get(grave.detailId)!;
      expect(anchor.userData.kind).toBe("grave");
      const world = anchor.getWorldPosition(new Vector3());
      expect(world.x).toBeCloseTo(grave.tile.x * Math.SQRT2, 5);
      expect(world.z).toBeCloseTo(grave.tile.y * Math.SQRT2, 5);
    }
    garden.dispose();
  });

  it("draws the whole garden in three untextured draws", () => {
    const garden = createGardenStoneGarden(graves);
    const meshes: Mesh[] = [];
    garden.root.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    expect(meshes).toHaveLength(3);
    const materials = meshes.flatMap((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]);
    expect(materials.some((material) => Object.values(material).some((value) => value instanceof Texture))).toBe(false);
    expect((garden.root.getObjectByName(STONE_GARDEN_STONES_NAME) as Mesh).castShadow).toBe(true);
    garden.dispose();
  });

  it("lights the lantern only on an anniversary evening", () => {
    const garden = createGardenStoneGarden(graves);
    const lit = lanternLit(garden.root);
    // Every month holds a fall in the ledger; the 1st evening keeps it.
    garden.update({ date: new Date(2026, 4, 1), deltaSeconds: 0.016, hour: 21, reducedMotion: false });
    expect(lit.value).toBe(1);
    garden.update({ date: new Date(2026, 4, 2), deltaSeconds: 0.016, hour: 3, reducedMotion: false });
    expect(lit.value).toBe(1);
    garden.update({ date: new Date(2026, 4, 2), deltaSeconds: 0.016, hour: 21, reducedMotion: false });
    expect(lit.value).toBe(0);
    garden.dispose();
  });

  it("stays dark when the ritual is forced on an ordinary evening", () => {
    const garden = createGardenStoneGarden(graves);
    const lit = lanternLit(garden.root);
    garden.update({ date: new Date(2026, 4, 9), deltaSeconds: 0.016, hour: 20, reducedMotion: true });
    garden.ritual.start(100);
    garden.update({ date: new Date(2026, 4, 9), deltaSeconds: 0.016, hour: 20, reducedMotion: true });
    expect(lit.value).toBe(0);
    expect(garden.ritual.update(146, 0.016)).toBe(true);
    garden.dispose();
  });
});
