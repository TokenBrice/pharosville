import { Group, InstancedMesh, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createSpeciesBatch, createSpeciesGeometry, setGardenFloraNightValue } from "./garden-flora";
import { createGardenRimMesh } from "./garden-rim-mesh";
import { createGardenIslets } from "./garden-islets";
import { createTerracedIsland } from "./garden-island";
import type { PharosVilleWorld } from "../systems/world-types";

function triangles(root: Group): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof Mesh) count += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3 * (object instanceof InstancedMesh ? object.count : 1);
  });
  return count;
}

describe("garden species", () => {
  it("keeps bamboo vertical, cherry broad and flat, and moss on the ground", () => {
    const dimensions = Object.fromEntries((["pine", "momiji", "cherry", "bamboo", "karikomi", "ground"] as const).map((species) => {
      const geometry = createSpeciesGeometry(species);
      geometry.computeBoundingBox();
      const size = geometry.boundingBox!.getSize(new Vector3());
      geometry.dispose();
      return [species, size];
    }));
    expect(dimensions.bamboo!.y).toBeGreaterThan(dimensions.pine!.y);
    expect(dimensions.bamboo!.y / dimensions.bamboo!.x).toBeGreaterThan(3);
    expect(dimensions.cherry!.x).toBeGreaterThan(dimensions.momiji!.x);
    expect(dimensions.cherry!.y).toBeLessThan(dimensions.momiji!.y);
    expect(dimensions.karikomi!.y).toBeGreaterThanOrEqual(1.2);
    expect(dimensions.karikomi!.y).toBeLessThanOrEqual(2.2);
    expect(dimensions.ground!.y).toBe(0);
  });

  it("drops deciduous umbrellas in winter and retains evergreen crowns", () => {
    for (const species of ["pine", "momiji", "cherry", "bamboo", "karikomi", "ground"] as const) {
      const summer = createSpeciesGeometry(species, "summer");
      const winter = createSpeciesGeometry(species, "winter");
      if (species === "momiji" || species === "cherry") expect(winter.index!.count).toBeLessThan(summer.index!.count / 2);
      else expect(winter.index!.count).toBe(summer.index!.count);
      summer.dispose();
      winter.dispose();
    }
    const spring = createSpeciesGeometry("cherry", "spring");
    const summer = createSpeciesGeometry("cherry", "summer");
    const autumn = createSpeciesGeometry("momiji", "autumn");
    const green = createSpeciesGeometry("momiji", "summer");
    const brightest = (geometry: typeof spring, channel: number) => Math.max(...Array.from(geometry.getAttribute("color").array).filter((_, i) => i % 3 === channel));
    expect(brightest(spring, 0)).toBeGreaterThan(brightest(summer, 0));
    expect(brightest(autumn, 0)).toBeGreaterThan(brightest(green, 0));
    for (const geometry of [spring, summer, autumn, green]) geometry.dispose();
  });

  it("updates already compiled and not-yet-compiled vegetation through night and dawn", () => {
    const root = new Group();
    const pine = createSpeciesBatch("pine", [{ position: [0, 0, 0] }]);
    const cherry = createSpeciesBatch("cherry", [{ position: [3, 0, 0] }]);
    root.add(pine, cherry);
    const compile = (material: MeshStandardMaterial) => {
      const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: "#include <common>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <opaque_fragment>" };
      material.onBeforeCompile(shader as never, null as never);
      return shader.uniforms;
    };
    const pineUniforms = compile(pine.material);
    setGardenFloraNightValue(root, 1);
    const cherryUniforms = compile(cherry.material);
    expect(pineUniforms.uNightValue!.value).toBe(1);
    expect(cherryUniforms.uNightValue!.value).toBe(1);
    setGardenFloraNightValue(root, 0);
    expect(pineUniforms.uNightValue!.value).toBe(0);
    expect(cherryUniforms.uNightValue!.value).toBe(0);
    for (const mesh of [pine, cherry]) { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
  });

  it("sheds the island maple without removing its winter branches or evergreen neighbours", () => {
    const world = { lighthouse: { tile: { x: 40, y: 40 }, detailId: "lighthouse" } } as unknown as PharosVilleWorld;
    const summer = createTerracedIsland(world, undefined, "summer").root;
    const winter = createTerracedIsland(world, undefined, "winter").root;
    const summerPads = summer.getObjectByName("island-niwaki-pads") as InstancedMesh;
    const winterPads = winter.getObjectByName("island-niwaki-pads") as InstancedMesh;
    expect(winterPads.count).toBe(summerPads.count - 5);
    expect((winter.getObjectByName("island-niwaki-trunks") as InstancedMesh).count)
      .toBe((summer.getObjectByName("island-niwaki-trunks") as InstancedMesh).count);
  });

  it("measures the species triangle delta against G1", () => {
    const world = { lighthouse: { tile: { x: 40, y: 40 }, detailId: "lighthouse" } } as unknown as PharosVilleWorld;
    const afterRim = createGardenRimMesh();
    const afterIslets = createGardenIslets();
    const afterIsland = createTerracedIsland(world);
    const afterNiwaki = triangles(afterIsland.root.getObjectByName("island-niwaki") as Group);
    // Measured from committed G1 builders in the same focused test run:
    // rim 90,426 + islets 2,132 + niwaki 4,168 = 96,726 triangles.
    // G2: 116,886 + 2,004 + 2,504 = 121,394; delta +24,668.
    const before = 96_726;
    const after = afterRim.triangleCount + afterIslets.triangleCount + afterNiwaki;
    expect(after - before).toBeLessThanOrEqual(25_000);
    afterRim.dispose(); afterIslets.dispose();
  });
});
