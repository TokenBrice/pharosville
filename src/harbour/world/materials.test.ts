import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createWorldUniforms } from "../engine/uniforms";
import { chainedKitMaterial } from "../life/figure-kit";
import { assembleShader } from "../engine/shader-recipes";
import {
  bareOf, evergreenOf, HarbourMaterials, ICICLE_WALL_PATTERNS, leafSnowKeepOf, PATTERN_LEAF, PATTERN_LEAF_EVERGREEN, patternIdOf, snowSlopeOf,
  windowKindOf, WINDOW_KIND, shaderFeatureDefines, shaderFeatureKey,
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
  it("uses one immutable descriptor for keys/defines, excluding animated uniforms", () => {
    const u = createWorldUniforms(), mats = new HarbourMaterials(u);
    const kit = mats.kit({ pattern: 8 }), depth = mats.kitDepth(), predepth = mats.kitDepth(true);
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), kit));
    const check = () => {
      const f = mats.featureIdentity(8);
      expect(Object.isFrozen(f)).toBe(true); expect(Object.isFrozen(f.cropStages)).toBe(true);
      expect(kit.customProgramCacheKey()).toBe(`hb_kit_${shaderFeatureKey(f)}`);
      const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {}, defines: {} };
      kit.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
      expect(shader.defines).toMatchObject(shaderFeatureDefines(f));
    };
    for (const lite of [true, false]) {
      const versions = [kit.version, depth.version, predepth.version];
      mats.setLite(lite); mats.setLite(lite); check();
      expect([kit.version, depth.version, predepth.version]).toEqual(versions.map((v) => v + 1));
    }
    let changes = 0, previous = mats.kitKey();
    const version = kit.version;
    for (let day = 0; day < 366; day++) {
      u.uSeasonPhase.value = day / 365;
      u.uFoliage.value.set(0, 1, 0, day > 320 ? 1 : 0);
      const next = mats.kitKey(); if (next !== previous) changes++;
      mats.invalidateSeason(scene); mats.invalidateSeason(scene); check(); previous = next;
    }
    expect(kit.version).toBe(version + changes);
    const identity = mats.featureIdentity(), key = mats.kitKey(), versions = [kit.version, depth.version, predepth.version];
    u.uTime.value++; u.uSnowCover.value = 0.7; u.uWetness.value = 0.4;
    mats.invalidateSeason(scene);
    expect(mats.featureIdentity()).toBe(identity); expect(mats.kitKey()).toBe(key);
    expect([kit.version, depth.version, predepth.version]).toEqual(versions);
    expect(mats.kit({ pattern: 0 }).customProgramCacheKey()).not.toBe(kit.customProgramCacheKey());
    mats.dispose(); (scene.children[0] as THREE.Mesh).geometry.dispose();
  });
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

describe("E09 overview lamps (uLampFar)", () => {
  it("lets the decorative lamps' pools and glass ease at the overview while a signal's lantern keeps its light", () => {
    const mats = new HarbourMaterials(createWorldUniforms());
    const kit = assembleShader(mats.kit());
    expect(kit.uniforms.uLampFar).toBe(mats.pool.uLampFar);
    expect(kit.fragmentShader).toContain("hbLampGlow(uWindowGlow, hbLampRank(worldPos, 0.5))) * uLampFar;");
    expect(kit.fragmentShader).toContain("smoothstep(0.02, 0.55, uWindowGlow) * uLampFar;   // (Low: no lamplighting wave)");
    // the GLB lamps' glass (apply) takes the share; a lantern built directly (the storm cones') does not
    const root = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: "hb_emissive.002", color: 0x3b3a33 }));
    root.add(glass);
    mats.apply(root);
    const lamp = glass.material as THREE.MeshStandardMaterial, signal = mats.emissive("#FF3A26", "#3A1712");
    expect(lamp).toBe(mats.emissive("#FFAE57", "#3b3a33", true));
    expect(lamp).not.toBe(mats.emissive("#FFAE57", "#3b3a33"));
    const lampShader = assembleShader(lamp), signalShader = assembleShader(signal);
    expect(lampShader.uniforms.uLampFar).toBe(mats.pool.uLampFar);
    mats.pool.uLampFar.value = 0.4;
    expect(signalShader.uniforms.uLampFar.value).toBe(1);
    expect(lampShader.fragmentShader).toContain("totalEmissiveRadiance *= uLamp * uLampFar;");
    expect(lamp.customProgramCacheKey()).toBe(signal.customProgramCacheKey()); // a binding, not a program variant
    mats.dispose(); glass.geometry.dispose();
  });
});
