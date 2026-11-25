import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createWorldUniforms } from "../engine/uniforms";
import { chainedKitMaterial } from "../life/figure-kit";
import { assembleShader } from "../engine/shader-recipes";
import { lampWaveUniforms } from "../lights/lamp-wave";
import {
  bareOf, evergreenOf, HarbourMaterials, ICICLE_WALL_PATTERNS, leafSnowKeepOf, materialKindFor,
  PATTERN_LEAF, PATTERN_LEAF_EVERGREEN, patternIdOf, snowSlopeOf,
  windowKindOf, WINDOW_KIND, shaderFeatureDefines, shaderFeatureKey, terrainFeatureDefines, terrainFeatureKey,
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

  it("wires procedural bump perturbation, foliage SSS, warm bounce fill & verdigris bronze into the kit shader", () => {
    const u = createWorldUniforms(), mats = new HarbourMaterials(u);
    const kit = mats.kit();
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {}, defines: {} } as THREE.WebGLProgramParametersWithUniforms;
    kit.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain("hbPattern(hbPid, hbRough, hbBumpH)");
    expect(shader.fragmentShader).toContain("normal = hbApplyBump(normal, hbBumpH, hbPid, vHbLocalN);");
    expect(shader.fragmentShader).toContain("hbSmoothGrassNormal(vHbWorld, inverseTransformDirection(normal, viewMatrix))");
    expect(shader.fragmentShader).toContain("hbBounceFill(diffuseColor.rgb, hbNw, uHbSunDir, uHbSunColor, hbOcc, uNight)");
    expect(shader.fragmentShader).toContain("hbFoliageSSS(diffuseColor.rgb, hbNw, hbVw, uHbSunDir, uHbSunColor, hbOcc, hbCs, hbSnow, uNight)");
    expect(shader.fragmentShader).toContain("hbMetalLight(metalnessFactor, diffuseColor.rgb, hbNw, hbVw, roughnessFactor, reflectedLight.directSpecular, hbFire)");
    // Round 2 & 3: restrained foliage wrap (0.28), blue-floor dawn SSS guard, winter canopy hoarfrost,
    // macro canopy needle-clump dappling & macro coastal sand swash ripples
    expect(shader.fragmentShader).toContain("(ndl + 0.28) / 1.28");
    expect(shader.fragmentShader).toContain("calmHue.b = max(calmHue.b, 0.74 * hueL);");
    expect(shader.fragmentShader).toContain("float crownCap = uSnowCover * crownUp");
    expect(shader.fragmentShader).toContain("float wetSand = (1.0 - smoothstep(0.18, 1.48");
    expect(shader.fragmentShader).toContain("hbBumpFade(dW, 3.2)");
    expect(shader.fragmentShader).toContain("hbBumpFade(dPleaf, 2.0)");
    // Phase 0: dead-matte grass roughness (0.91-0.96), attenuated dry grass env f0 (0.012),
    // and instanced vegetation procedural bark strictly gated behind HB_VEG_INSTANCED
    expect(shader.fragmentShader).toContain("rough = 0.96 - 0.05 * smoothstep(0.35, 0.65, g1);");
    expect(shader.fragmentShader).toContain("float hbEnvF0 = mix(0.03, 0.012, hbIs(hbPid, 6.0) * (1.0 - max(hbWetSheen, hbSnow)));");
    expect(shader.fragmentShader).toContain("#ifdef HB_VEG_INSTANCED");
    expect(shader.fragmentShader).toContain("hbFbm(vec3(P.xy * 6.5, P.z * 1.1))");
    // HB_LITE skips procedural bump math completely
    expect(shader.fragmentShader).toContain("#ifndef HB_LITE\n// Mikkelsen");
    mats.dispose();
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

describe("D11 analytical emissives (uLampAnalytic)", () => {
  it("lets a signal's lantern skip the lamp round and the arrival beat while the GLB lamps' glass keeps both, in one program", () => {
    const mats = new HarbourMaterials(createWorldUniforms());
    const root = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: "hb_emissive.002", color: 0x3b3a33 }));
    root.add(glass);
    mats.apply(root);
    const lamp = glass.material as THREE.MeshStandardMaterial, signal = mats.emissive("#FF3A26", "#3A1712");
    const lampShader = assembleShader(lamp), signalShader = assembleShader(signal);
    // per-material switch: the decorative glass 0, the storm signal's lantern 1; never shared, and the same program
    expect(lampShader.uniforms.uLampAnalytic.value).toBe(0);
    expect(signalShader.uniforms.uLampAnalytic.value).toBe(1);
    expect(signalShader.uniforms.uLampAnalytic).not.toBe(lampShader.uniforms.uLampAnalytic);
    expect(signalShader.fragmentShader).toBe(lampShader.fragmentShader);
    expect(signal.customProgramCacheKey()).toBe(lamp.customProgramCacheKey());
    // both bind the live beat and wave, so a decorative lamp follows them; the one line that reads them (the lamp's rank
    // moment and uLampArrive, through hbLampGlow) runs only for a decorative lamp, after the clock's own uLamp
    for (const s of [lampShader, signalShader]) {
      expect(s.uniforms.uLampArrive).toBe(lampWaveUniforms.uLampArrive);
      expect(s.uniforms.uLampWave).toBe(lampWaveUniforms.uLampWave);
    }
    const emission = signalShader.fragmentShader.slice(signalShader.fragmentShader.indexOf("totalEmissiveRadiance *= uLamp * uLampFar;"));
    const reads = emission.split("\n").filter((line) => /hbLampGlow|hbLampRank|uLampArrive/.test(line));
    expect(reads).toEqual([
      "if (uWindowGlow > 1e-3 && uLampAnalytic < 0.5) totalEmissiveRadiance *= mix(1.0, hbLampGlow(uWindowGlow, hbLampRank(vHbLw, hbLampJitter(vHbLw.xz))) / uWindowGlow, smoothstep(0.0, 0.05, uWindowGlow));",
    ]);
    mats.dispose(); glass.geometry.dispose();
  });
});

describe("Phase 2A dedicated hb_terrain material", () => {
  it("maps hb_terrain* names, binds neutral fallbacks + setTerrainMaps, and compiles full & lite without HB_BARE", async () => {
    expect(materialKindFor("hb_terrain")).toBe("terrain");
    expect(materialKindFor("hb_terrain.001")).toBe("terrain");
    expect(materialKindFor("hb_opaque")).toBe("kit");

    const u = createWorldUniforms(), mats = new HarbourMaterials(u);
    await mats.loadTerrainShader();
    const terrain = mats.terrain();
    const depth = mats.terrainDepth();
    const predepth = mats.terrainDepth(true);

    expect(terrain.name).toBe("hb_terrain");
    expect(depth.name).toBe("hb_terrain_depth");
    expect(predepth.name).toBe("hb_terrain_predepth");
    expect(predepth.colorWrite).toBe(false);
    expect(mats.terrainMaps.uTerrainDetail.value).toBeInstanceOf(THREE.DataArrayTexture);
    expect(mats.terrainMaps.uTerrainBounds.value.z).toBe(0);

    // Full tier compiles detail array + biplanar rock, zero bare-crown discard
    u.uFoliage.value.set(0, 0, 0, 1); // winter (bare=true for kit, irrelevant for terrain)
    const full = assembleShader(terrain);
    expect(full.defines).toMatchObject(terrainFeatureDefines(mats.terrainFeatureIdentity()));
    expect("HB_BARE" in (full.defines ?? {})).toBe(false);
    expect("HB_LITE" in (full.defines ?? {})).toBe(false);
    expect(full.fragmentShader).toContain("uniform sampler2DArray uTerrainDetail;");
    expect(full.fragmentShader).toContain("hbSampleBiplanarRock");
    expect(full.fragmentShader).toContain("hbHeightBlend5");
    expect(full.fragmentShader).not.toContain("discard;");
    expect(full.uniforms.uTerrainSplat).toBe(mats.terrainMaps.uTerrainSplat);
    expect(full.uniforms.uTerrainTopo).toBe(mats.terrainMaps.uTerrainTopo);
    expect(full.uniforms.uTerrainDetail).toBe(mats.terrainMaps.uTerrainDetail);

    // Depth twins have zero discard and stay season-invariant
    const depthShader = assembleShader(depth);
    expect(depthShader.fragmentShader).not.toContain("discard");
    expect(depth.customProgramCacheKey()).toBe("hb_terrain_depth_v1");
    expect(predepth.customProgramCacheKey()).toBe("hb_terrain_predepth_v1");

    // Switching bare on/off without changing crop stages does NOT invalidate hb_terrain
    const verBefore = terrain.version;
    const keyBefore = terrain.customProgramCacheKey();
    u.uFoliage.value.set(0, 1, 0, 0);
    mats.invalidateSeason();
    expect(terrain.version).toBe(verBefore);
    expect(terrain.customProgramCacheKey()).toBe(keyBefore);

    // Switching to Low tier invalidates hb_terrain cleanly and enables HB_LITE + HB_BEAM_VERT
    mats.setLite(true);
    expect(terrain.version).toBe(verBefore + 1);
    expect(terrain.customProgramCacheKey()).toBe(`hb_terrain_${terrainFeatureKey(mats.terrainFeatureIdentity())}`);
    const lite = assembleShader(terrain);
    expect("HB_LITE" in (lite.defines ?? {})).toBe(true);
    expect("HB_BEAM_VERT" in (lite.defines ?? {})).toBe(true);
    expect(lite.vertexShader).toContain("hbBeamVert(vHbWorld);");

    // setTerrainMaps binds splat/topo and updates uTerrainBounds
    const splat = new THREE.DataTexture(new Uint8Array([10, 20, 255, 30]), 1, 1);
    const topo = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    mats.setTerrainMaps(splat, topo, [-334.8, -316.8, 357.2, 359.7]);
    expect(mats.terrainMaps.uTerrainSplat.value).toBe(splat);
    expect(mats.terrainMaps.uTerrainTopo.value).toBe(topo);
    expect(mats.terrainMaps.uTerrainBounds.value.x).toBeCloseTo(-334.8, 4);
    expect(mats.terrainMaps.uTerrainBounds.value.y).toBeCloseTo(359.7, 4);
    expect(mats.terrainMaps.uTerrainBounds.value.z).toBeCloseTo(1 / 692.0, 6);

    // apply() binds hb_terrain meshes with shadow casting and prepareSeasonDepth assigns terrainDepth()
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: "hb_terrain" }));
    root.add(mesh);
    mats.apply(root);
    expect(mesh.material).toBe(terrain);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    mats.prepareSeasonDepth(root);
    expect(mesh.customDepthMaterial).toBe(depth);

    splat.dispose(); topo.dispose(); mesh.geometry.dispose(); mats.dispose();
  });
});

describe("Phase 1B instanced vegetation material (vegSolid / vegDepth)", () => {
  it("caches vegSolid/vegDepth, includes veg-instanced in cache keys, binds prepareSeasonDepth, and invalidates across seasons", () => {
    const u = createWorldUniforms();
    u.uFoliage.value.set(0, 1, 0, 0);
    const mats = new HarbourMaterials(u);
    const solid = mats.vegSolid();
    const depth = mats.vegDepth(false);
    const predepth = mats.vegDepth(true);
    expect(mats.vegSolid()).toBe(solid);
    expect(mats.vegDepth()).toBe(depth);
    expect(mats.vegDepth(true)).toBe(predepth);
    expect(solid.name).toBe("hb_veg_solid");
    expect(depth.name).toBe("hb_veg_depth");
    expect(predepth.name).toBe("hb_veg_predepth");
    expect(predepth.colorWrite).toBe(false);
    expect(solid.customProgramCacheKey()).toContain("veg-instanced");
    expect(depth.customProgramCacheKey()).toContain("veg-instanced");
    expect(predepth.customProgramCacheKey()).toContain("veg-instanced");

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), solid);
    mesh.castShadow = true;
    const scene = new THREE.Scene();
    scene.add(mesh);
    mats.prepareSeasonDepth(scene);
    expect(mesh.customDepthMaterial).toBe(depth);

    const v0 = [solid.version, depth.version, predepth.version];
    const k0 = [solid.customProgramCacheKey(), depth.customProgramCacheKey(), predepth.customProgramCacheKey()];
    u.uFoliage.value.set(0, 0, 0, 1); // winter
    mats.invalidateSeason(scene);
    expect([solid.version, depth.version, predepth.version]).toEqual(v0.map((v) => v + 1));
    expect([solid.customProgramCacheKey(), depth.customProgramCacheKey(), predepth.customProgramCacheKey()]).not.toEqual(k0);

    // Retuned autumn deciduous bands keep ~18% holdout (t >= 0.82) and distinct Mediterranean warm ochre/sienna/terracotta/olive-ochre hues
    const assembled = assembleShader(solid);
    expect(assembled.fragmentShader).toContain("t < 0.82 ?");
    expect(assembled.fragmentShader).toContain("vec3(0.46, 0.21, 0.085)");
    expect(assembled.fragmentShader).toContain("vec3(0.38, 0.125, 0.075)");

    mesh.geometry.dispose();
    mats.dispose();
  });
});
