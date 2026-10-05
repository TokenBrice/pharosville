import { Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, ShaderLib, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { seasonalPhenology } from "../systems/garden-calendar";
import { hexToOklch } from "../systems/palette";
import type { PharosVilleWorld } from "../systems/world-types";
import { createSpeciesBatch, createSpeciesGeometry, deciduousLeafColor, GARDEN_LETS_GO_PAD_BAND, patchGardenFloraNight, setGardenFloraNightValue } from "./garden-flora";
import { createGardenIslets } from "./garden-islets";
import { createTerracedIsland } from "./garden-island";
import { createGardenRimMesh } from "./garden-rim-mesh";
import { applyGardenSurface } from "./garden-surfaces";
import { applyGardenPrintInksToTree } from "./garden-print-inks";

const NORTH = { latitudeRad: (35 * Math.PI) / 180, southern: false };
const world = { lighthouse: { tile: { x: 40, y: 40 }, detailId: "lighthouse" } } as unknown as PharosVilleWorld;

function triangles(root: Group): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof Mesh) count += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3 * (object instanceof InstancedMesh ? object.count : 1);
  });
  return count;
}

function size(species: Parameters<typeof createSpeciesGeometry>[0]): Vector3 {
  const geometry = createSpeciesGeometry(species);
  geometry.computeBoundingBox();
  const extent = geometry.boundingBox!.getSize(new Vector3());
  geometry.dispose();
  return extent;
}

function compileFloraNight(material: MeshStandardMaterial) {
  const standard = ShaderLib.standard!;
  const shader = {
    uniforms: { ...standard.uniforms },
    vertexShader: standard.vertexShader,
    fragmentShader: standard.fragmentShader,
  };
  material.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe("local garden night floors", () => {
  it("retains foliage, snow and wind patches when architecture preparation encounters planting", () => {
    const mesh = createSpeciesBatch("pine", [], { date: new Date("2026-01-05T12:00:00Z") });
    const material = mesh.material;
    const key = material.customProgramCacheKey();
    applyGardenSurface(material, { role: "gravel", mapping: "worldXZ", metresPerRepeat: 1, detailStrength: 1 });
    expect(material.userData.gardenSurfaceExemption).toBe("foliage");
    expect(material.userData.gardenSurface).toBeUndefined();
    expect(material.customProgramCacheKey()).toBe(key);
    applyGardenPrintInksToTree(mesh);
    const shader = compileFloraNight(material);
    expect(shader.uniforms).toHaveProperty("uGardenSnow");
    expect(shader.uniforms).toHaveProperty("uGardenWindDirection");
    expect(shader.fragmentShader).not.toContain("gardenSampleSurface");
    expect(material.customProgramCacheKey()).toContain("garden-print-inks");
    mesh.geometry.dispose(); material.dispose(); mesh.dispose();
  });
  it("preserves the default program identity through night and dawn", () => {
    const material = new MeshStandardMaterial();
    const originalKey = material.customProgramCacheKey();
    patchGardenFloraNight(material);
    const key = material.customProgramCacheKey();
    expect(key).toBe(`${originalKey}|garden-flora-night`);
    const mesh = new Mesh(undefined, material);
    const shader = compileFloraNight(material);
    expect(shader.uniforms.uGardenFloraNightFloor).toBeUndefined();
    for (const night of [1, 0.5, 0]) {
      setGardenFloraNightValue(mesh, night);
      expect(shader.uniforms.uNightValue!.value).toBe(night);
      expect(material.customProgramCacheKey()).toBe(key);
    }
    mesh.geometry.dispose();
    material.dispose();
  });

  it("shares the opt-in program without sharing material floors or night state", () => {
    const defaultMaterial = new MeshStandardMaterial();
    patchGardenFloraNight(defaultMaterial);
    const materials = [new MeshStandardMaterial(), new MeshStandardMaterial()];
    patchGardenFloraNight(materials[0]!, { nightFloor: 0.2 });
    patchGardenFloraNight(materials[1]!, { nightFloor: 0.7 });
    const key = materials[0]!.customProgramCacheKey();
    expect(key).not.toBe(defaultMaterial.customProgramCacheKey());
    expect(materials[1]!.customProgramCacheKey()).toBe(key);
    const meshes = materials.map((material) => new Mesh(undefined, material));
    const first = compileFloraNight(materials[0]!);
    setGardenFloraNightValue(meshes[0]!, 1);
    setGardenFloraNightValue(meshes[1]!, 0.5);
    const second = compileFloraNight(materials[1]!);
    expect(first.uniforms.uGardenFloraNightFloor!.value).toBe(0.2);
    expect(second.uniforms.uGardenFloraNightFloor!.value).toBe(0.7);
    expect(first.uniforms.uNightValue!.value).toBe(1);
    expect(second.uniforms.uNightValue!.value).toBe(0.5);
    second.uniforms.uGardenFloraNightFloor!.value = 0.4;
    setGardenFloraNightValue(meshes[1]!, 0);
    expect(first.uniforms.uGardenFloraNightFloor!.value).toBe(0.2);
    expect(first.uniforms.uNightValue!.value).toBe(1);
    expect(second.uniforms.uNightValue!.value).toBe(0);
    for (const material of materials) expect(material.customProgramCacheKey()).toBe(key);
    for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
    defaultMaterial.dispose();
  });

  it("accepts both floor boundaries and rejects non-finite or out-of-range floors before patching", () => {
    for (const floor of [0, 1]) {
      const material = new MeshStandardMaterial();
      patchGardenFloraNight(material, { nightFloor: floor });
      expect(compileFloraNight(material).uniforms.uGardenFloraNightFloor!.value).toBe(floor);
      material.dispose();
    }
    for (const floor of [NaN, Infinity, -Infinity, -0.01, 1.01]) {
      const material = new MeshStandardMaterial();
      const compile = material.onBeforeCompile;
      const key = material.customProgramCacheKey();
      expect(() => patchGardenFloraNight(material, { nightFloor: floor })).toThrow(RangeError);
      expect(material.onBeforeCompile).toBe(compile);
      expect(material.customProgramCacheKey()).toBe(key);
      expect(material.userData.uNightValue).toBeUndefined();
      expect(material.userData.uGardenFloraNightFloor).toBeUndefined();
      material.dispose();
    }
  });
});

describe("garden species", () => {
  it("keeps bamboo the one vertical, cherry broad and low, and karikomi a low wave", () => {
    const bamboo = size("bamboo");
    const pine = size("pine");
    const momiji = size("momiji");
    const cherry = size("cherry");
    const karikomi = size("karikomi");
    expect(bamboo.y).toBeGreaterThan(pine.y);
    expect(bamboo.y / bamboo.x).toBeGreaterThan(2.5);
    // Cloud-pruned: the pine is at least as wide as it is tall.
    expect(Math.max(pine.x, pine.z)).toBeGreaterThanOrEqual(pine.y);
    expect(Math.max(cherry.x, cherry.z)).toBeGreaterThan(Math.max(momiji.x, momiji.z));
    expect(cherry.y).toBeLessThan(momiji.y);
    expect(karikomi.y).toBeLessThan(karikomi.x * 0.25);
  });

  it("gives every pad a dark belly under a lit crown, and bark no foliage rank", () => {
    for (const species of ["pine", "momiji", "cherry", "karikomi"] as const) {
      const geometry = createSpeciesGeometry(species);
      const foliage = geometry.getAttribute("aGardenFoliage");
      const normal = geometry.getAttribute("normal");
      const color = geometry.getAttribute("color");
      let crown = 0;
      let crownCount = 0;
      let belly = 0;
      let bellyCount = 0;
      for (let vertex = 0; vertex < foliage.count; vertex += 1) {
        if (foliage.getX(vertex) <= 0) continue;
        expect(foliage.getX(vertex)).toBeLessThanOrEqual(1);
        const value = color.getX(vertex) + color.getY(vertex) + color.getZ(vertex);
        if (normal.getY(vertex) > 0.6) { crown += value; crownCount += 1; }
        if (normal.getY(vertex) < -0.3) { belly += value; bellyCount += 1; }
      }
      expect(crownCount, species).toBeGreaterThan(0);
      if (bellyCount > 0) expect(belly / bellyCount, species).toBeLessThan(crown / crownCount);
      geometry.dispose();
    }
  });

  it("dresses deciduous specimens from the calendar, one by one, and leaves pines alone", () => {
    const placements = [0, 1, 2, 3, 4].map((index) => ({ position: [index * 4, 0, 0] as [number, number, number], seed: `test.${index}` }));
    const leafOf = (mesh: InstancedMesh) => Array.from(mesh.geometry.getAttribute("aGardenLeaf").array as Float32Array);
    const summer = createSpeciesBatch("momiji", placements, { date: new Date("2026-07-01T12:00:00Z") });
    const winter = createSpeciesBatch("momiji", placements, { date: new Date("2027-01-20T12:00:00Z") });
    expect(leafOf(summer).every((leaf) => leaf === 1)).toBe(true);
    expect(leafOf(winter).every((leaf) => leaf === 0)).toBe(true);
    const pineSummer = createSpeciesBatch("pine", placements, { date: new Date("2026-07-01T12:00:00Z") });
    const pineWinter = createSpeciesBatch("pine", placements, { date: new Date("2027-01-20T12:00:00Z") });
    expect(leafOf(pineWinter)).toEqual(leafOf(pineSummer));
    expect(pineWinter.getColorAt(0, new Color()).getHex()).toBe(pineSummer.getColorAt(0, new Color()).getHex());
  });

  it("turns maples through derived tones, never vermillion or above the chroma ceiling", () => {
    const color = new Color();
    const finals = new Set<string>();
    for (let day = 0; day < 365; day += 3) {
      const date = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000);
      for (let specimen = 0; specimen < 12; specimen += 1) {
        for (const kind of ["momiji", "cherry"] as const) {
          const state = seasonalPhenology(`chroma.${specimen}`, date, kind, NORTH);
          const { c } = hexToOklch(`#${deciduousLeafColor(kind, `chroma.${specimen}`, state, color).getHexString()}`);
          // §1.1 rule 5: only vermillion and lantern_warm exceed C 0.12.
          expect(c).toBeLessThanOrEqual(0.12);
          if (kind === "momiji" && state.turn === 1) finals.add(color.getHexString());
        }
      }
    }
    // Neighbouring maples finish on different tones.
    expect(finals.size).toBeGreaterThan(1);
  });

  it("updates already compiled and not-yet-compiled vegetation through night and dawn", () => {
    const root = new Group();
    const pine = createSpeciesBatch("pine", [{ position: [0, 0, 0] }]);
    const cherry = createSpeciesBatch("cherry", [{ position: [3, 0, 0] }]);
    root.add(pine, cherry);
    const compile = (material: MeshStandardMaterial) => {
      const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: "#include <common>\n#include <color_vertex>\n#include <begin_vertex>", fragmentShader: "#include <common>\n#include <opaque_fragment>" };
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

  it("bares the island maple by the calendar through its let-go crown, never the pines", () => {
    const island = (iso: string) => createTerracedIsland(world, undefined, new Date(iso));
    const summer = island("2026-07-01T12:00:00Z");
    const winter = island("2027-01-20T12:00:00Z");
    expect(summer.letsGoTree.crown.value).toBe(1);
    expect(winter.letsGoTree.crown.value).toBe(0);
    // Only the maple's pads answer the crown: they carry −rank in [band, 1]
    // and their own centre; pine pads keep their positive month-record rank.
    const grove = summer.root.getObjectByName("island-niwaki-grove") as InstancedMesh;
    const foliage = grove.geometry.getAttribute("aGardenFoliage");
    const centres = grove.geometry.getAttribute("aGardenPadCentre");
    const position = grove.geometry.getAttribute("position");
    let maplePads = 0;
    let pinePads = 0;
    for (let vertex = 0; vertex < foliage.count; vertex += 1) {
      const rank = foliage.getX(vertex);
      if (rank > 0) pinePads += 1;
      if (rank >= 0) continue;
      maplePads += 1;
      expect(-rank).toBeGreaterThanOrEqual(GARDEN_LETS_GO_PAD_BAND);
      expect(-rank).toBeLessThanOrEqual(1);
      // A pad shrinks into a centre that sits inside it (within a pad's reach).
      expect(Math.hypot(
        position.getX(vertex) - centres.getX(vertex),
        position.getY(vertex) - centres.getY(vertex),
        position.getZ(vertex) - centres.getZ(vertex),
      )).toBeLessThan(2);
    }
    expect(maplePads).toBeGreaterThan(0);
    expect(pinePads).toBeGreaterThan(0);
  });

  it("keeps the replanted garden inside the W4 triangle ledger", () => {
    const rim = createGardenRimMesh();
    const islets = createGardenIslets();
    const island = createTerracedIsland(world);
    const niwaki = triangles(island.root.getObjectByName("island-niwaki") as Group);
    // G2 flora (rim + islets + island niwaki) was 121,394 triangles; the W4
    // ledger allows −10k … +20k for the craft wave. Land decimation (W8.2)
    // pays for the niwaki grammar everywhere.
    expect(rim.triangleCount + islets.triangleCount + niwaki).toBeLessThanOrEqual(141_394);
    rim.dispose(); islets.dispose();
  });
});
