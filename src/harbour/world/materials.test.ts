import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createWorldUniforms } from "../engine/uniforms";
import { chainedKitMaterial } from "../life/figure-kit";
import {
  bareOf, evergreenOf, HarbourMaterials, ICICLE_WALL_PATTERNS, leafSnowKeepOf, PATTERN_LEAF, PATTERN_LEAF_EVERGREEN, patternIdOf, snowSlopeOf,
  windowKindOf, WINDOW_KIND,
} from "./materials";

// linear vertex albedos: today's spruce (dark blue-green), round deciduous and birch greens
const SPRUCE: [number, number, number] = [0.02, 0.06, 0.035];
const DECIDUOUS: [number, number, number] = [0.09, 0.2, 0.03];
const BRIGHT: [number, number, number] = [0.25, 0.4, 0.05];
const unorm8 = (x: number) => Math.round(x * 255) / 255;

describe("window kind (hb_window COLOR_0.b)", () => {
  it("reads every existing writer (b = 0) as the framed window", () => {
    expect(windowKindOf(0)).toBe(WINDOW_KIND.framed);
    expect(windowKindOf(unorm8(0.1))).toBe(WINDOW_KIND.framed);
  });
  it("reads b = 1 as the plain lit opening, through 8-bit quantization", () => {
    expect(windowKindOf(1)).toBe(WINDOW_KIND.plain);
    expect(windowKindOf(unorm8(0.9))).toBe(WINDOW_KIND.plain);
  });
});

describe("evergreen classifier", () => {
  it("round-trips pattern ids through 8-bit COLOR_0.a", () => {
    for (const pid of [PATTERN_LEAF, PATTERN_LEAF_EVERGREEN]) expect(patternIdOf(unorm8(pid / 16))).toBe(pid);
  });
  it("leaf_evergreen keeps its leaves whatever its colour", () => {
    for (const vc of [SPRUCE, DECIDUOUS, BRIGHT]) {
      expect(evergreenOf(PATTERN_LEAF_EVERGREEN, vc)).toBe(1);
      expect(bareOf(PATTERN_LEAF_EVERGREEN, vc, 1)).toBe(0);
    }
  });
  it("pattern 8 keeps today's colour heuristic", () => {
    expect(evergreenOf(PATTERN_LEAF, SPRUCE)).toBe(1);
    expect(evergreenOf(PATTERN_LEAF, DECIDUOUS)).toBe(0);
    expect(bareOf(PATTERN_LEAF, DECIDUOUS, 1)).toBe(1);
    expect(bareOf(PATTERN_LEAF, SPRUCE, 1)).toBe(0);
  });
  it("only leaf patterns lose anything to the leaf fall", () => {
    for (const pid of [0, 6, 7, 10, 13]) expect(bareOf(pid, DECIDUOUS, 1)).toBe(0);
  });
});

describe("snow by slope", () => {
  const up = (deg: number) => Math.cos((deg * Math.PI) / 180);
  it("flat terraces and low-pitch tiled roofs (18-24°) take full cover in a full winter", () => {
    for (const deg of [0, 18, 24]) expect(snowSlopeOf(up(deg), 1, false)).toBe(1);
  });
  it("low-pitch roofs hold at least as much as today's steeper roofs at every snow level", () => {
    for (const cover of [0.2, 0.5, 1]) expect(snowSlopeOf(up(22), cover, false)).toBeGreaterThanOrEqual(snowSlopeOf(up(40), cover, false));
  });
  it("walls shed it, flat crowns are snowed", () => {
    expect(snowSlopeOf(0, 1, false)).toBe(0);
    expect(snowSlopeOf(1, 1, true)).toBe(1);
  });
  it("leaves keep less snow than ground, flat evergreen crowns less again (a winter wood stays dark)", () => {
    expect(leafSnowKeepOf(0)).toBe(1);
    expect(leafSnowKeepOf(PATTERN_LEAF)).toBeLessThan(1);
    expect(leafSnowKeepOf(PATTERN_LEAF_EVERGREEN)).toBeGreaterThan(0);
    expect(leafSnowKeepOf(PATTERN_LEAF_EVERGREEN)).toBeLessThan(leafSnowKeepOf(PATTERN_LEAF));
  });
  it("icicles grow under eaves on stucco, marble and plain walls, not on ashlar quays or terraces", () => {
    expect(ICICLE_WALL_PATTERNS).toEqual(expect.arrayContaining([0, 10]));
    expect(ICICLE_WALL_PATTERNS).not.toContain(2);
  });
});

describe("seasonal colour/depth publication", () => {
  it("keys derived life materials by the same bare classification and invalidates both twins", () => {
    const uniforms = createWorldUniforms();
    uniforms.uFoliage.value.set(0, 1, 0, 0);
    const materials = new HarbourMaterials(uniforms);
    const kit = materials.kit();
    const life = chainedKitMaterial(materials, "test", { vertexHead: "", vertexPose: "", uniforms: {} });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), kit); mesh.castShadow = true;
    const actor = new THREE.Mesh(mesh.geometry, life); actor.customDepthMaterial = new THREE.MeshDepthMaterial();
    const scene = new THREE.Scene(); scene.add(mesh, actor);
    materials.prepareSeasonDepth(scene);
    const depth = mesh.customDepthMaterial!;
    expect(depth).toBe(materials.kitDepth());
    const leaf = [kit.customProgramCacheKey(), life.customProgramCacheKey(), depth.customProgramCacheKey()];
    const versions = [kit.version, life.version, depth.version, actor.customDepthMaterial.version];
    uniforms.uFoliage.value.set(0, 0, 0, 1);
    expect([kit.customProgramCacheKey(), life.customProgramCacheKey(), depth.customProgramCacheKey()]).not.toEqual(leaf);
    expect(kit.version).toBe(versions[0]);
    materials.invalidateSeason(scene);
    expect([kit.version, life.version, depth.version, actor.customDepthMaterial.version]).toEqual(versions.map((version) => version + 1));
    uniforms.uFoliage.value.set(0, 1, 0, 0);
    expect([kit.customProgramCacheKey(), life.customProgramCacheKey(), depth.customProgramCacheKey()]).toEqual(leaf);
    materials.dispose(); life.dispose(); actor.customDepthMaterial.dispose(); mesh.geometry.dispose();
  });
});
