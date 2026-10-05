import {
  Color,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { rimShoreDistance } from "../systems/garden-rim";
import { PHAROSVILLE_MAP_WIDTH } from "../systems/world-layout";
import { GARDEN_SURFACE_GLSL, type GardenSurfaceAtlasLease, type GardenSurfaceAtlasOwner } from "./garden-surface-atlas";
import { shoreBeachWeight, writeGardenShoreSample, type GardenShoreSample } from "./garden-rim-mesh";
import {
  GARDEN_WATER_Y,
  GARDEN_ZONE_ROOT_Y,
} from "../systems/garden-observatory-slice";
import {
  GARDEN_DEFAULT_WIND_X,
  GARDEN_DEFAULT_WIND_Z,
} from "../systems/weather";
import {
  RISK_SURFACE_SIGNATURES,
  SEA_REGION_CHARACTER,
  SEA_REGION_FALLBACK_TINT,
  SEA_REGION_ID,
  SEA_REGION_SHORE_FULL_SCALE_TILES,
} from "../systems/garden-sea-regions";
import type { GardenWaterFrame } from "./garden-water";
import {
  createGardenWater,
  FRAGMENT_SHADER,
  GARDEN_RISK_SURFACE_GLSL,
  GARDEN_HERO_REFLECTION_FILTER,
  gardenHeroReflectionMipLod,
  gardenHeroReflectionSpreadTexels,
  GARDEN_WATER_GERSTNER,
  GARDEN_WATER_MAX_DISPLACEMENT,
  GARDEN_WATER_NORMAL_MAP_URL,
  sampleGardenGerstner,
  VERTEX_SHADER,
  type GardenGerstnerSampleInput,
  type GerstnerComponent,
} from "./garden-water";
import {
  GARDEN_WATER_BEACON_CLAMP,
  GARDEN_WATER_MOON_ROAD_GAIN,
  GARDEN_WATER_NIGHT_EMISSION,
  GARDEN_WATER_OPTICS,
  GARDEN_WATER_SUN_GLITTER_GAIN,
  GARDEN_WATER_MAX_RIPPLE_RINGS,
  GARDEN_WATER_MAX_LIGHT_LANES,
  GARDEN_WATER_PLATE_MARGIN_TILES,
  GARDEN_WATER_SHORE_LAP,
} from "./garden-water-contract";
import { dayCyclePhase } from "./garden-day-cycle";
/**
 * Shader-hygiene tripwire (2026-07-30): a `uXxx` identifier USED in a shader
 * body but never DECLARED there compiles to "undeclared identifier" on the
 * real driver, which then skips the mesh silently at draw time — the sea once
 * vanished while every perf counter stayed green. glslangValidator-clean
 * substrings did not catch it because the failure only exists in the final
 * composed source. These tests parse the final sources, so a fragment-stage
 * reference to a vertex-only uniform (or a typo) fails in `npm run test`,
 * not on the operator's GPU.
 */
const THREE_INJECTED_UNIFORMS = new Set([
  // three's prelude + the fog chunk (the shaders `#include` the fog pars
  // chunks, whose declarations arrive from three, not from this source).
  "viewMatrix",
  "isOrthographic",
  "cameraPosition",
  "fogColor",
  "fogNear",
  "fogFar",
  "fogDensity",
]);
const THREE_INJECTED_VERTEX_UNIFORMS = new Set([
  ...THREE_INJECTED_UNIFORMS,
  "modelMatrix",
  "modelViewMatrix",
  "normalMatrix",
  "projectionMatrix",
]);

function declaredUniforms(shaderSource: string): Set<string> {
  const names = new Set<string>();
  for (const match of shaderSource.matchAll(/uniform\s+\w+\s+(\w+)\s*(?:\[[^\]]*\])?\s*;/g)) {
    names.add(match[1]!);
  }
  return names;
}

function usedWaterUniforms(shaderSource: string): Set<string> {
  const names = new Set<string>();
  for (const match of shaderSource.matchAll(/\bu[A-Z]\w*/g)) {
    names.add(match[0]!);
  }
  return names;
}

describe("water shader uniform hygiene", () => {
  it("declares every uXxx uniform the fragment stage uses", () => {
    const declared = declaredUniforms(FRAGMENT_SHADER);
    const missing = [...usedWaterUniforms(FRAGMENT_SHADER)].filter(
      (name) => !declared.has(name) && !THREE_INJECTED_UNIFORMS.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("declares every uXxx uniform the vertex stage uses", () => {
    const declared = declaredUniforms(VERTEX_SHADER);
    const missing = [...usedWaterUniforms(VERTEX_SHADER)].filter(
      (name) => !declared.has(name) && !THREE_INJECTED_VERTEX_UNIFORMS.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("declares uStorm in the fragment stage (the 2026-07-30 regression)", () => {
    expect(declaredUniforms(FRAGMENT_SHADER).has("uStorm")).toBe(true);
  });

  it("masks peg-summary haze to existing risk regions in the water draw", () => {
    const water = createGardenWater(GARDEN_WATER_Y);
    expect(water.material.uniforms.uPegSummaryEpistemicHaze!.value).toBe(0);

    water.setPegSummaryEpistemicHaze(true);

    expect(water.material.uniforms.uPegSummaryEpistemicHaze!.value).toBe(1);
    expect(FRAGMENT_SHADER).toContain(`step(${SEA_REGION_ID.calm - 0.5}, epistemicRegionId)`);
    expect(FRAGMENT_SHADER).toContain(`step(${SEA_REGION_ID.danger + 0.5}, epistemicRegionId)`);
    expect(FRAGMENT_SHADER).toContain("gardenApplyLocalizedHeightFog(");
  });

});

describe("createGardenWater", () => {
  it("creates one WebGL1 surface that samples the normal map and lane texture", () => {
    const water = createGardenWater(-0.12);
    water.setIslandCenter(12, -7);

    expect(water.mesh.geometry).toBeInstanceOf(PlaneGeometry);
    expect(water.mesh.material).toBeInstanceOf(ShaderMaterial);
    // Kept on WebGL1 GLSL so the shader compiles without an upgrade path.
    expect(water.mesh.material.glslVersion).toBeNull();
    expect(water.mesh.material.fragmentShader).not.toContain("#version 300");
    expect(water.mesh.material.fragmentShader).toContain("sampler2D");
    expect(water.mesh.material.fragmentShader).toContain("uNormalMap");
    expect(water.mesh.material.fragmentShader).toContain("uLaneTexture");
    expect(water.mesh.geometry.index?.count).toBe(96 * 96 * 6);
    expect(water.mesh.position.y).toBe(-0.12);
    expect(water.mesh.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(water.material.uniforms.uIslandCenter!.value).toMatchObject({
      x: 12,
      y: 7,
    });
    water.setBeaconState(6, -4, 1.2, 3);
    expect(water.material.uniforms.uBeaconPosition!.value).toMatchObject({
      x: 6,
      y: 4,
    });
    expect(uniformNumber(water.material, "uBeaconAngle")).toBe(1.2);
    expect(uniformNumber(water.material, "uBeaconStrength")).toBe(1);
    // Flicker clamps at the public state boundary.
    expect(uniformNumber(water.material, "uBeaconFlicker")).toBe(0.5);
    water.setBeaconState(6, -4, 1.2, 0.8, 1.7);
    expect(uniformNumber(water.material, "uBeaconFlicker")).toBe(1);
  });

  it("covers only the map extent plus the finite plate margin", () => {
    // The plane keeps the full symmetric margin on all four sides: since the
    // camera-side land skirt (garden-rim-mesh) the south and east margins are
    // alpha-dissolved in the fragment shader rather than cut from the
    // geometry, so plate containment and camera fitting stay symmetric.
    const water = createGardenWater(GARDEN_WATER_Y);
    const geometry = water.mesh.geometry as PlaneGeometry;
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const mapSpan = 139 * Math.SQRT2;
    const margin = GARDEN_WATER_PLATE_MARGIN_TILES * Math.SQRT2;

    expect(geometry.parameters.width).toBeCloseTo(mapSpan + margin * 2);
    expect(geometry.parameters.height).toBeCloseTo(mapSpan + margin * 2);
    expect(bounds.min.x).toBeCloseTo(-margin);
    expect(bounds.max.x).toBeCloseTo(mapSpan + margin);
    expect(bounds.min.y).toBeCloseTo(-mapSpan - margin);
    expect(bounds.max.y).toBeCloseTo(margin);
  });

  it("constructs the surrounding sea with the plate's open-water colour, depth, reflection and swell", () => {
    const water = createGardenWater(GARDEN_WATER_Y);
    const annulus = water.mesh.getObjectByName("garden-sea-annulus") as Mesh<RingGeometry, ShaderMaterial>;
    const open = SEA_REGION_CHARACTER.open;
    const openId = SEA_REGION_ID.open;
    const expectedColor = new Color(SEA_REGION_FALLBACK_TINT.open);
    const expectedParams = new Vector3(open.depth, open.reflectivity, open.tintStrength);
    const expectedSwell = new Vector3(open.swell, open.chop, open.shallowShelf);

    for (const material of [water.material, annulus.material]) {
      expect(material.uniforms.uRegionColor!.value[openId]).toEqual(expectedColor);
      expect(material.uniforms.uRegionParams!.value[openId]).toEqual(expectedParams);
      expect(material.uniforms.uRegionSwell!.value[openId]).toEqual(expectedSwell);
    }
    expect(uniformNumber(annulus.material, "uWaveAmplitude"))
      .toBe(uniformNumber(water.material, "uWaveAmplitude"));
    expect(uniformNumber(annulus.material, "uTempo"))
      .toBe(uniformNumber(water.material, "uTempo"));
    water.dispose();
  });

  it("keeps plate, skirt and annulus on continuous air without the rectangular overview veil", () => {
    const water = createGardenWater(GARDEN_WATER_Y);
    const annulus = water.mesh.getObjectByName("garden-sea-annulus") as Mesh<RingGeometry, ShaderMaterial>;
    const skirt = annulus.getObjectByName("garden-sea-inner-skirt") as Mesh<RingGeometry, ShaderMaterial>;
    expect(water.material.defines.GARDEN_AIR_CONTINUOUS_WATER).toBe(1);
    expect(annulus.material.defines.GARDEN_AIR_CONTINUOUS_WATER).toBe(1);
    expect(skirt.material).toBe(annulus.material);
    expect(annulus.material.uniforms.uGardenAir).toBe(water.material.uniforms.uGardenAir);
    expect(FRAGMENT_SHADER).toContain("#ifndef GARDEN_AIR_CONTINUOUS_WATER");
    expect(FRAGMENT_SHADER).toContain("gardenAerial(gl_FragColor.rgb, vWorldPosition, cameraPosition)");
    expect(FRAGMENT_SHADER).toContain("distance(cameraPosition.xz, vWorldPosition.xz)");
    water.dispose();
  });

  it("keeps sea beneath and beyond the plate while following the render camera", () => {
    const water = createGardenWater(GARDEN_WATER_Y);
    const scene = new Scene();
    scene.add(water.mesh);
    const camera = new PerspectiveCamera();
    const annulus = water.mesh.getObjectByName("garden-sea-annulus") as Mesh<RingGeometry, ShaderMaterial>;
    expect(annulus).toBeInstanceOf(Mesh);
    expect(annulus.material).not.toBe(water.material);
    expect(uniformNumber(annulus.material, "uAnnulus")).toBe(1);
    const innerSea = annulus.getObjectByName("garden-sea-inner-skirt") as Mesh<RingGeometry, ShaderMaterial>;
    expect(innerSea.geometry.parameters.innerRadius).toBe(0);
    const triangleCount = (annulus.geometry.index!.count + innerSea.geometry.index!.count) / 3;
    expect(triangleCount).toBeLessThanOrEqual(4_000);
    expect(annulus.frustumCulled).toBe(false);
    expect(annulus.material.depthWrite).toBe(true);
    expect(annulus.renderOrder).toBeLessThan(water.mesh.renderOrder);
    expect(annulus.layers.isEnabled(7)).toBe(false);

    const draw = () => {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      annulus.onBeforeRender(
        {} as never, scene, camera, annulus.geometry, annulus.material, new Group(),
      );
    };
    camera.position.set(260, 75, 180);
    draw();
    const position = annulus.getWorldPosition(new Vector3());
    expect(position.x).toBeCloseTo(260);
    expect(position.y).toBeCloseTo(GARDEN_WATER_Y);
    expect(position.z).toBeCloseTo(180);
    camera.position.set(-45, 30, 320);
    draw();
    annulus.getWorldPosition(position);
    expect(position.x).toBeCloseTo(-45);
    expect(position.y).toBeCloseTo(GARDEN_WATER_Y);
    expect(position.z).toBeCloseTo(320);

    water.update(frame({ reducedMotion: true, timeSeconds: 70 }));
    expect(uniformNumber(annulus.material, "uTime")).toBe(0);
    water.update(frame({ reducedMotion: true, timeSeconds: 90 }));
    expect(uniformNumber(annulus.material, "uTime")).toBe(0);
    const disposeRing = vi.spyOn(annulus.geometry, "dispose");
    const disposeSkirt = vi.spyOn(innerSea.geometry, "dispose");
    const disposeSea = vi.spyOn(annulus.material, "dispose");
    water.dispose();
    expect(disposeRing).toHaveBeenCalledOnce();
    expect(disposeSkirt).toHaveBeenCalledOnce();
    expect(disposeSea).toHaveBeenCalledOnce();
  });

  it("binds the scene PMREM directly without a world-renderer wire", () => {
    const water = createGardenWater(0);
    const scene = new Scene();
    const probe = new Texture();
    scene.environment = probe;
    const versionBeforeProbe = water.material.version;

    water.mesh.onBeforeRender(
      { getPixelRatio: () => 2 } as never,
      scene,
      {} as never,
      water.mesh.geometry,
      water.material,
      new Group(),
    );

    expect(water.material.uniforms.envMap!.value).toBe(probe);
    expect((water.material as ShaderMaterial & { envMap: Texture | null }).envMap).toBe(probe);
    expect(water.material.version).toBeGreaterThan(versionBeforeProbe);
    expect(uniformNumber(water.material, "uSurfacePixelRatio")).toBe(2);

    const disposeProbe = vi.spyOn(probe, "dispose");
    water.dispose();
    expect(water.material.uniforms.envMap!.value).toBeNull();
    expect(disposeProbe).not.toHaveBeenCalled();
  });


  it("rises a one-shot ring once, ahead of the standing trains, then clears it", () => {
    const water = createGardenWater(0);
    const pulse = { center: { x: 4, z: 6 }, id: "fish-rise", periodSeconds: 5, radius: 3, strength: 0.2 };
    // A frozen (reduced-motion) clock refuses the pulse: no ring rises.
    water.update(frame({ reducedMotion: true }));
    water.rippleRings.pulseRing(pulse);
    expect(water.rippleRings.ringCount()).toBe(0);

    for (let index = 0; index < GARDEN_WATER_MAX_RIPPLE_RINGS + 2; index += 1) {
      water.rippleRings.setRing({
        bands: 2, center: { x: index, z: 0 }, id: `standing.${index}`, periodSeconds: 9, radius: 5, strength: 1,
      });
    }
    water.update(frame({ timeSeconds: 100 }));
    water.rippleRings.pulseRing(pulse);
    const params = water.material.uniforms.uRippleParams!.value as { x: number; y: number }[];
    const rings = water.material.uniforms.uRipple!.value as { w: number }[];
    // Weaker than every standing train, still first: an event outranks texture.
    expect(params[0]!.x).toBeLessThan(0);
    expect(rings[0]!.w).toBe(100);

    water.update(frame({ timeSeconds: 103 }));
    expect(water.rippleRings.ringCount()).toBe(GARDEN_WATER_MAX_RIPPLE_RINGS + 3);
    water.update(frame({ timeSeconds: 100 + 5 * 1.3 + 0.1 }));
    expect(water.rippleRings.ringCount()).toBe(GARDEN_WATER_MAX_RIPPLE_RINGS + 2);
    expect(params.slice(0, GARDEN_WATER_MAX_RIPPLE_RINGS).every((ring) => ring.x > 0)).toBe(true);
  });

  it("keeps the twelve loudest ripple rings, deterministically, when oversubscribed", () => {
    // T0.7 (2026-09-07): claimants exceed GARDEN_WATER_MAX_RIPPLE_RINGS, and
    // the uniform slots used to be filled in Map insertion order — so which
    // rings drew depended on registration timing. Rank by strength (id as
    // tie-break) and the same twelve win every run.
    const water = createGardenWater(0);
    for (let index = 0; index < GARDEN_WATER_MAX_RIPPLE_RINGS + 6; index += 1) {
      water.rippleRings.setRing({
        id: `garden.test.ring.${index}`,
        center: { x: index, z: 0 },
        radius: 5,
        bands: 2,
        periodSeconds: 8,
        // Later registrations are quieter, so insertion order and rank differ.
        strength: 1 - index * 0.05,
      });
    }
    expect(water.rippleRings.ringCount()).toBe(GARDEN_WATER_MAX_RIPPLE_RINGS + 6);
    expect(uniformNumber(water.material, "uRippleCount"))
      .toBe(GARDEN_WATER_MAX_RIPPLE_RINGS);
    const strengths = (water.material.uniforms.uRippleParams!.value as { z: number }[])
      .map((params) => params.z);
    expect(strengths[0]).toBeCloseTo(1);
    for (const [index, strength] of strengths.entries()) {
      if (index === 0) continue;
      expect(strength).toBeLessThanOrEqual(strengths[index - 1]!);
    }
  });


  it("disposes every owned GPU resource exactly once and releases external textures", () => {
    const normalMap = new Texture<HTMLImageElement>();
    const loadSpy = vi.spyOn(TextureLoader.prototype, "load").mockReturnValue(normalMap);
    vi.stubGlobal("document", {});
    try {
      const water = createGardenWater(0);
      const root = new Group();
      root.add(water.mesh);
      expect(loadSpy).toHaveBeenCalledWith(GARDEN_WATER_NORMAL_MAP_URL);
      expect(normalMap.colorSpace).toBe(NoColorSpace);
      expect(normalMap.generateMipmaps).toBe(true);
      expect(normalMap.minFilter).toBe(LinearMipmapLinearFilter);
      const externalLane = new DataTexture();
      const externalWake = new Texture();
      water.setLaneState(externalLane, 1);
      water.setWakeState(externalWake, 0, 0, 96);

      const disposals = [
        vi.spyOn(water.mesh.geometry, "dispose"),
        vi.spyOn(water.material, "dispose"),
        vi.spyOn(water.regionTextures.field, "dispose"),
        vi.spyOn(water.regionTextures.distance, "dispose"),
        vi.spyOn(water.cloudShadows.texture, "dispose"),
        vi.spyOn(normalMap, "dispose"),
      ];
      const laneDispose = vi.spyOn(externalLane, "dispose");
      const wakeDispose = vi.spyOn(externalWake, "dispose");

      water.dispose();
      water.dispose();

      expect(water.mesh.parent).toBeNull();
      for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
      expect(laneDispose).not.toHaveBeenCalled();
      expect(wakeDispose).not.toHaveBeenCalled();
      expect(water.material.uniforms.uLaneTexture!.value).toBeNull();
      expect(water.material.uniforms.uWakeMap!.value).toBeNull();
      expect(water.material.uniforms.uNormalMap!.value).toBeNull();
      expect(loadSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      loadSpy.mockRestore();
    }
  });

  it("shares renderer-owned atlas uniforms across all water draws and releases only its lease", () => {
    const textures = { albedo: new DataTexture(), normal: new DataTexture(), orm: new DataTexture() };
    const uniforms = {
      uGardenSurfaceAlbedo: { value: textures.albedo },
      uGardenSurfaceNormal: { value: textures.normal },
      uGardenSurfaceOrm: { value: textures.orm },
      uGardenSurfaceAtlasReady: { value: 1 },
    };
    const releases = [vi.fn(), vi.fn()];
    const leases = releases.map((release): GardenSurfaceAtlasLease => ({
      textures, uniforms, release, ready: Promise.resolve(true), error: null,
      detailSource: { key: "borrowed-test", glsl: GARDEN_SURFACE_GLSL, uniforms },
    }));
    const owner: GardenSurfaceAtlasOwner = { textures, lease: vi.fn(() => leases.shift() ?? null), release: vi.fn() };
    const mapsDisposed = Object.values(textures).map((texture) => vi.spyOn(texture, "dispose"));
    const first = createGardenWater(GARDEN_WATER_Y, owner);
    const second = createGardenWater(GARDEN_WATER_Y, owner);
    const annulus = first.mesh.getObjectByName("garden-sea-annulus") as Mesh<RingGeometry, ShaderMaterial>;
    for (const name of Object.keys(uniforms)) {
      expect(first.material.uniforms[name]).toBe(uniforms[name as keyof typeof uniforms]);
      expect(annulus.material.uniforms[name]).toBe(first.material.uniforms[name]);
      expect(second.material.uniforms[name]).toBe(first.material.uniforms[name]);
    }
    first.dispose();
    first.dispose();
    expect(releases[0]).toHaveBeenCalledOnce();
    expect(releases[1]).not.toHaveBeenCalled();
    expect(uniforms.uGardenSurfaceAtlasReady.value).toBe(1);
    expect(second.material.uniforms.uGardenSurfaceAlbedo!.value).toBe(textures.albedo);
    second.dispose();
    expect(releases[1]).toHaveBeenCalledOnce();
    expect(owner.release).not.toHaveBeenCalled();
    for (const disposed of mapsDisposed) expect(disposed).not.toHaveBeenCalled();
    for (const texture of Object.values(textures)) texture.dispose();
  });

  it("wires the shared lane texture and outlying islet shore centers", () => {
    const water = createGardenWater(0);
    const laneTexture = new DataTexture();

    water.setLaneState(laneTexture, 9);
    expect(water.material.uniforms.uLaneTexture!.value).toBe(laneTexture);
    expect(uniformNumber(water.material, "uLaneCount")).toBe(9);

    water.setIsletCenters({ x: 20, z: -8 }, { x: -14, z: 6 });
    expect(water.material.uniforms.uCemeteryCenter!.value).toMatchObject({
      x: 20,
      y: 8,
    });
    expect(water.material.uniforms.uPigeonnierCenter!.value).toMatchObject({
      x: -14,
      y: -6,
    });
  });

  it("routes each band's colour to its sea-region slot", () => {
    // W2 / D5: the six tinted ellipses are gone. Region GEOMETRY comes from
    // the terrain field the simulation already obeys; what still arrives via
    // setZoneState is each band's live day-blended colour, keyed by region id.
    const water = createGardenWater(0);
    water.setZoneState([
      {
        center: { x: 30, z: -12 },
        color: new Color("#ef4444"),
        radiusX: 8,
        radiusZ: 5,
        regionId: 5,
        strength: 0.44,
      },
    ]);
    expect(water.material.fragmentShader).toContain("uRegionField");
    expect(water.material.fragmentShader).not.toContain("uZoneEllipse");

    const danger = water.material.uniforms.uRegionColor!.value[5]!;
    expect(danger.getHexString()).toBe(
      new Color(SEA_REGION_CHARACTER.danger.tint).lerp(new Color("#ef4444"), 0.18).getHexString(),
    );
    expect(water.material.uniforms.uRegionParams!.value[5]!.z).toBeCloseTo(
      SEA_REGION_CHARACTER.danger.tintStrength,
    );
  });

  it("generates static categorical stroke constants from the shared codebook", () => {
    for (const [body, signature] of Object.entries(RISK_SURFACE_SIGNATURES)) {
      if (signature.kind !== "strokes") continue;
      const geometry = [signature.pitch, ...signature.length, signature.grouping]
        .map((value) => value.toFixed(7)).join(", ");
      expect(GARDEN_RISK_SURFACE_GLSL).toContain(`if (regionId == ${SEA_REGION_ID[body as keyof typeof RISK_SURFACE_SIGNATURES]})`);
      expect(GARDEN_RISK_SURFACE_GLSL).toContain(`geometry = vec4(${geometry})`);
      expect(GARDEN_RISK_SURFACE_GLSL).toContain(`bearing = ${signature.bearing.toFixed(7)}`);
    }
    expect(FRAGMENT_SHADER).toContain(GARDEN_RISK_SURFACE_GLSL);
    expect(FRAGMENT_SHADER).toContain("gardenRiskSurface(vWaterPosition, regionId)");
    expect(GARDEN_RISK_SURFACE_GLSL).toContain("gardenHash(cell");
    expect(GARDEN_RISK_SURFACE_GLSL).toContain("rotate2(worldPosition, bearing)");
    expect(GARDEN_RISK_SURFACE_GLSL).not.toMatch(/uTime|uWind|uDetail|regionBlend|inletCalm|uStorm/);
  });

  it("filters marks to bounded widths and analytically retained group coverage", () => {
    expect(GARDEN_RISK_SURFACE_GLSL).toContain("dFdx(worldPosition)");
    expect(GARDEN_RISK_SURFACE_GLSL).toContain("dFdy(worldPosition)");
    expect(GARDEN_RISK_SURFACE_GLSL).toContain("uSurfacePixelRatio");
    expect(GARDEN_RISK_SURFACE_GLSL).toContain("mix(meanCore, min(core, 1.0), resolved)");
    expect(GARDEN_RISK_SURFACE_GLSL).toContain("mix(meanCore, min(shoulder, 1.0), resolved)");
    expect(FRAGMENT_SHADER).toContain("waterColor *= 1.0 - riskSurface.x * riskSurface.z");
    expect(FRAGMENT_SHADER).toContain("waterColor = mix(waterColor, max(waterColor * 1.18, skySample),");
    expect(FRAGMENT_SHADER).not.toMatch(/signatureNormal|crestInk|crestPeriodPx|pockLife|capMaximum|regionFoam/);
    expect(FRAGMENT_SHADER).not.toMatch(/waterColor\s*\+=.*riskSurface/);
    expect(FRAGMENT_SHADER).not.toContain("quietBody");
    expect(VERTEX_SHADER).not.toContain("quietBody");
    expect(FRAGMENT_SHADER).toContain("float shelter = max(max(harborCalm, inletCalm), shoreCalm)");
    expect(GARDEN_RISK_SURFACE_GLSL).not.toMatch(/shelter|slickFlatten|wakeSlick/);
  });

  it("guards signature denominators and smoothstep widths before categorical helper-lane exits", () => {
    const source = GARDEN_RISK_SURFACE_GLSL;
    expect(source.indexOf("dFdx(worldPosition)")).toBeLessThan(source.indexOf("return vec3"));
    expect(source.indexOf("dFdy(worldPosition)")).toBeLessThan(source.indexOf("return vec3"));
    expect(source).not.toContain("fwidth(p)");
    expect(source).toContain("max(geometry.z + geometry.x, 1e-4)");
    expect(source).toContain("max(geometry.x, 1e-4)");
    expect(source).toContain("max(period * pitch, 1e-4)");
    expect(source).toContain("max(6.0 * geometry.z * geometry.w, 1e-4)");
    expect(source).toContain("max(footprint.y, 1e-4)");
    expect(source).toContain("max(footprint.x, 1e-4)");
    expect(source).toContain("float halfWidth = max(1e-4, min(");
    expect(source).toContain("max(1.0, uSurfacePixelRatio)");
    expect(source).not.toMatch(/normalize\(|pow\(|log\(|sqrt\(|inversesqrt\(|atan\(/);
    const water = createGardenWater(0);
    const annulus = water.mesh.getObjectByName("garden-sea-annulus") as Mesh<RingGeometry, ShaderMaterial>;
    expect(uniformNumber(water.material, "uSurfacePixelRatio")).toBe(1);
    expect(uniformNumber(annulus.material, "uSurfacePixelRatio")).toBe(1);
    expect(annulus.material.uniforms.uSurfacePixelRatio).toBe(water.material.uniforms.uSurfacePixelRatio);
    water.dispose();
  });

  it("uses one derivative-filtered complete normal and roughness across every optical consumer", () => {
    expect(FRAGMENT_SHADER).toContain("float broadMeanLength = clamp(length(broadMean)");
    expect(FRAGMENT_SHADER).toContain("1.0 - broadMeanLength * broadMeanLength");
    expect(FRAGMENT_SHADER).toContain("1.0 - fineMeanLength * fineMeanLength");
    expect(FRAGMENT_SHADER).toContain("1.0 - broadWeight * broadWeight");
    expect(FRAGMENT_SHADER).toContain("1.0 - fineWeight * fineWeight");
    expect(FRAGMENT_SHADER).toContain("dFdx(completeSlope)");
    expect(FRAGMENT_SHADER).toContain("dFdy(completeSlope)");
    expect(FRAGMENT_SHADER).toContain("probeRoughness * probeRoughness + normalVariance");
    expect(FRAGMENT_SHADER).toContain("reflect(-viewDirection, worldSurfaceNormal)");
    expect(FRAGMENT_SHADER).toContain("gardenEnvironmentReflection(worldSurfaceNormal, viewDirection, scalarSky, roughness)");
    expect(FRAGMENT_SHADER).toContain("dot(surfaceNormal.xy, bodyFlowDir)");
    expect(FRAGMENT_SHADER).toContain("dot(worldSurfaceNormal, sunHalf");
    expect(FRAGMENT_SHADER).toContain("dot(worldSurfaceNormal,");
    expect(FRAGMENT_SHADER).toContain("min(160.0, opticalLobeExponent)");
    expect(FRAGMENT_SHADER).not.toMatch(/glintNormal|sparkleNormal|fresnelNormal|crossedWeight|nMid/);
    expect(GARDEN_WATER_OPTICS.normalTileWorldUnits).toBe(40);
    expect(GARDEN_WATER_OPTICS.fineSlopeGain).toBeLessThanOrEqual(0.15);
    expect(GARDEN_WATER_OPTICS.gerstnerSlopeGain).toBeLessThanOrEqual(1);
    const water = createGardenWater(0);
    for (const [name, id] of Object.entries(SEA_REGION_ID)) {
      const character = SEA_REGION_CHARACTER[name as keyof typeof SEA_REGION_CHARACTER];
      expect(water.material.uniforms.uRegionSwell!.value[id]).toEqual(
        new Vector3(character.swell, character.chop, character.shallowShelf),
      );
    }
    water.dispose();
  });

  it("filters hero reflection monotonically with projected footprint and optical roughness", () => {
    const footprints = [0.125, 0.5, 1, 2, 4, 8];
    expect(footprints.map((footprint) => gardenHeroReflectionMipLod(footprint, 0)))
      .toEqual([0, 0, 0, 1, 2, 3]);
    let previousSpread = 0;
    let previousLod = 0;
    for (const roughness of [0.06, 0.12, 0.22, 0.4]) {
      const spread = gardenHeroReflectionSpreadTexels(roughness, 0);
      const lod = gardenHeroReflectionMipLod(0.5, spread);
      expect(spread).toBeGreaterThanOrEqual(previousSpread);
      expect(lod).toBeGreaterThanOrEqual(previousLod);
      expect(spread).toBeLessThanOrEqual(GARDEN_HERO_REFLECTION_FILTER.maximumSpreadTexels);
      previousSpread = spread;
      previousLod = lod;
    }
    expect(previousLod).toBeGreaterThan(0);
  });

  it("keeps calm contact at zero spread and guards non-finite CPU filter inputs", () => {
    expect(gardenHeroReflectionSpreadTexels(0.06, 0)).toBe(0);
    for (const roughness of [0.06, 0.12, 0.22, 0.4]) {
      expect(gardenHeroReflectionSpreadTexels(roughness, 1)).toBe(0);
      expect(gardenHeroReflectionSpreadTexels(roughness, 0.5))
        .toBeCloseTo(gardenHeroReflectionSpreadTexels(roughness, 0) * 0.5);
    }
    expect(gardenHeroReflectionMipLod(0.5, gardenHeroReflectionSpreadTexels(0.22, 1))).toBe(0);
    expect(gardenHeroReflectionSpreadTexels(NaN, 0)).toBe(0);
    expect(gardenHeroReflectionSpreadTexels(Infinity, NaN)).toBe(0);
    expect(gardenHeroReflectionMipLod(NaN, Infinity)).toBe(0);
  });

  it("samples at most three footprint-aware surface-axis taps with preserved coverage", () => {
    expect(VERTEX_SHADER).toContain("vHeroReflectionClip = uHeroReflectionMatrix * vec4(vWorldPosition, 1.0)");
    expect(FRAGMENT_SHADER).toContain("max(uHeroReflectionSize, vec2(1.0))");
    expect(FRAGMENT_SHADER).toContain("max(abs(vHeroReflectionClip.w), 1e-4)");
    expect(FRAGMENT_SHADER.indexOf("dFdx(heroBaseUv)"))
      .toBeLessThan(FRAGMENT_SHADER.indexOf("if (uAnnulus < 0.5 && uHeroReflectionStrength"));
    expect(FRAGMENT_SHADER).toContain("max(heroFootprint, heroSpread)");
    expect(FRAGMENT_SHADER).toContain("roughness * roughness - 0.0036000");
    expect(FRAGMENT_SHADER).toContain("heroAxisTexels * heroSpread / heroSize");
    expect(FRAGMENT_SHADER).toContain("heroAxisTexels * heroShift / heroSize");
    expect(FRAGMENT_SHADER.match(/textureLod\(uHeroReflection,/g)).toHaveLength(3);
    expect(FRAGMENT_SHADER).toContain("hero.rgb / max(hero.a, 1e-3)");
    expect(FRAGMENT_SHADER).toContain("heroColor / (1.0 + maxComponent(heroColor) * 0.8)");
    expect(FRAGMENT_SHADER).toContain("heroEdgeFade * heroContinuity");
    expect(FRAGMENT_SHADER).not.toMatch(/float below|3\.5 \* below|vec2\(0\.0, heroTap\)/);
    const water = createGardenWater(0);
    expect(water.material.uniforms.uHeroReflectionSize!.value.toArray()).toEqual([1, 1]);
    water.dispose();
  });

  it("maps the region field with the water plane's z-flip", () => {
    // A tile (tx, ty) lands at world (tx*sqrt2, _, ty*sqrt2), and the plane's
    // -90deg X rotation maps world +Z to local -Y — so V must be negated.
    // Getting this sign wrong mirrors every sea region about the equator.
    const water = createGardenWater(0);
    const transform = water.material.uniforms.uRegionTransform!.value;
    expect(transform.z).toBeGreaterThan(0);
    expect(transform.w).toBeCloseTo(-transform.z);
  });

  it("samples the region field with nearest filtering", () => {
    // Bilinear between region 1 and region 3 would synthesise region 2 and
    // paint a phantom band along every boundary.
    const water = createGardenWater(0);
    const field = water.material.uniforms.uRegionField!.value as { magFilter: number; minFilter: number };
    expect(field.magFilter).toBe(NearestFilter);
    expect(field.minFilter).toBe(NearestFilter);
  });

  it("samples the boundary distance with linear filtering and mipmaps", () => {
    // S5: the id and the distance need OPPOSITE filtering, and filtering is a
    // property of the texture, so they cannot share one. Point-sampling the
    // distance is what made the tide lines stair-step and crawl at overview
    // zoom, where one screen pixel covers several texels and the seam terms
    // read a 0.14-wide window of the field.
    const water = createGardenWater(0);
    const distance = water.material.uniforms.uRegionDistance!.value as {
      generateMipmaps: boolean;
      magFilter: number;
      minFilter: number;
    };
    expect(distance.magFilter).toBe(LinearFilter);
    expect(distance.minFilter).toBe(LinearMipmapLinearFilter);
    expect(distance.generateMipmaps).toBe(true);
    // ...and it must be a different texture, or the sampler state collides.
    expect(distance).not.toBe(water.material.uniforms.uRegionField!.value);
  });

  it("registers authored shore masks in the same unwarped world coordinates as the distance field", () => {
    const water = createGardenWater(GARDEN_WATER_Y);
    const field = water.regionTextures.field.image;
    const distance = water.regionTextures.distance.image;
    const fieldData = field.data;
    const distanceData = distance.data;
    if (fieldData === null || distanceData === null) throw new Error("Shore textures must contain CPU bake data.");
    const transform = water.material.uniforms.uRegionTransform!.value;
    const sample: GardenShoreSample = { segment: null, depth: 0, substrate: null, exposure: 0, state: "damp" };
    let sandSamples = 0;
    let isolatedMineralSamples = 0;
    for (let y = 0; y < field.height; y += 7) {
      for (let x = 0; x < field.width; x += 7) {
        const offset = (y * field.width + x) * 4;
        const worldX = x / field.width * PHAROSVILLE_MAP_WIDTH * Math.SQRT2;
        const worldZ = y / field.height * PHAROSVILLE_MAP_WIDTH * Math.SQRT2;
        writeGardenShoreSample(sample, worldX, 0, worldZ, 0);
        const shoreTiles = fieldData[offset + 2]! / 255 * SEA_REGION_SHORE_FULL_SCALE_TILES;
        const rimDelta = Math.max(0, rimShoreDistance(worldX / Math.SQRT2, worldZ / Math.SQRT2)) - shoreTiles;
        const t = Math.max(0, Math.min(1, (rimDelta - 0.25) / 0.75));
        const rimWeight = 1 - t * t * (3 - 2 * t);
        const sand = shoreBeachWeight(worldX, worldZ) * rimWeight;
        expect(distanceData[offset]).toBe(fieldData[offset + 1]);
        expect(distanceData[offset + 1]).toBe(fieldData[offset + 2]);
        expect(distanceData[offset + 2]).toBe(Math.round(sand * 255));
        // Keep canonical lerp arithmetic: equivalent rearrangements cross .5-byte ties.
        const exposure = (1 - rimWeight) * 0.2 + rimWeight * sample.exposure;
        expect(distanceData[offset + 3]).toBe(Math.round(exposure * 255));
        expect(worldX * transform.z).toBeCloseTo(x / field.width, 8);
        expect(-worldZ * transform.w).toBeCloseTo(y / field.height, 8);
        if (sand > 0.05) sandSamples++;
        if (sand > 0.05 && x + 1 < field.width) {
          expect(Math.abs(distanceData[offset + 2]! - distanceData[offset + 6]!)).toBeLessThan(128);
        }
        if (rimWeight === 0 && shoreTiles < 4) {
          isolatedMineralSamples++;
          expect(distanceData[offset + 2]).toBe(0);
          expect(distanceData[offset + 3]).toBe(51);
        }
      }
    }
    expect(sandSamples).toBeGreaterThan(0);
    expect(isolatedMineralSamples).toBeGreaterThan(0);
    expect(distance.width).toBe(field.width);
    expect(distance.height).toBe(field.height);
    water.dispose();
  });

  it("replaces the ellipse seabed and universal collar with masked atlas absorption and sparse exposed lap", () => {
    expect(FRAGMENT_SHADER).toContain(GARDEN_SURFACE_GLSL);
    expect(FRAGMENT_SHADER).toContain("bottomPosition.xz +=");
    expect(FRAGMENT_SHADER).toContain("clamp(regionDistanceSample.b, 0.0, 1.0)");
    expect(FRAGMENT_SHADER).toContain("exp(-bottomDepth * 1.25) * shoreMask");
    expect(FRAGMENT_SHADER).toContain("shoreEdge * exposedLap * shoreMask * (1.0 - contact)");
    expect(FRAGMENT_SHADER).not.toMatch(/shoreDelta|shelfA|shelfB|bathyGrain|isletShelf|SEABED_COLOR|shoreAdvect/);
    expect(FRAGMENT_SHADER).toContain("texture2D(uRegionField, vRegionUv)");
    expect(FRAGMENT_SHADER).toContain("texture2D(uRegionDistance, vRegionUv)");
    expect(FRAGMENT_SHADER).not.toMatch(/texture2D\(uRegion(?:Field|Distance),\s*bottom/);
    expect(GARDEN_WATER_SHORE_LAP.exposureStart).toBeGreaterThan(0.35);
    expect(GARDEN_WATER_SHORE_LAP.noiseStart).toBeGreaterThanOrEqual(0.75);
    expect(GARDEN_WATER_SHORE_LAP.maxMix).toBeLessThanOrEqual(0.055);
  });

  it("declares every substrate-path local before use in an accessible fragment scope", () => {
    const source = FRAGMENT_SHADER.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    const main = source.slice(source.indexOf("void main()"));
    const tracked: Record<string, true> = {
      fieldDepth: true, depth: true, bottomDepth: true, shoreMask: true, clearBottom: true,
      bottomPosition: true, stoneBottom: true, sandBottom: true, substrate: true, bandPosition: true,
    };
    const declarationTypes: Record<string, true> = { float: true, vec3: true, GardenSurfaceDetail: true };
    const scopes: Set<string>[] = [new Set()];
    let previous = "";
    for (const match of main.matchAll(/[A-Za-z_]\w*|[{}]/g)) {
      const token = match[0];
      if (token === "{") scopes.push(new Set());
      else if (token === "}") scopes.pop();
      else if (tracked[token]) {
        if (declarationTypes[previous]) scopes[scopes.length - 1]!.add(token);
        else expect(scopes.some((scope) => scope.has(token)), `${token} must be declared in scope`).toBe(true);
      }
      previous = token;
    }
    expect(main).toContain("float fieldDepth = smoothstep(0.0, 0.42, shoreField);");
    expect(main).toContain("mix(0.82, 1.0, fieldDepth)");
  });

  it("resolves every hard threshold against its own screen-space gradient", () => {
    // S3: MSAA antialiases geometry edges, not a discontinuity the shader
    // invents per fragment. Every bare step() on a spatial field crawled under
    // camera motion — the operator's "flickering". aaStep is the only threshold
    // helper; a raw step() on a varying-derived field is the regression.
    const source = createGardenWater(0).material.fragmentShader;
    expect(source).toContain("float aaStep(float edge, float value)");
    expect(source).toContain("fwidth(value)");
    // Match the complete callee: smoothstep and aaStep are filtered helpers,
    // not hard step calls merely because their names contain "step".
    const hardThresholds = [/\bstep\s*\(\s*0\.76\s*,/, /\bstep\s*\(\s*0\.35\s*,/,
      /\bstep\s*\(\s*-2\.0\s*,\s*along\s*\)/];
    for (const aliased of hardThresholds) expect(source).not.toMatch(aliased);
    expect("smoothstep(0.35, 0.8, footprint)").not.toMatch(hardThresholds[1]!);
    expect("aaStep(0.35, value)").not.toMatch(hardThresholds[1]!);
    expect("step(0.35, value)").toMatch(hardThresholds[1]!);
  });

  it("keeps lane AA gradients defined across spatial culling and zero-intensity daylight lanes", () => {
    const fieldGate = FRAGMENT_SHADER.indexOf("vec2 fieldDelta = vWaterPosition - uLaneField.xy;");
    expect(fieldGate).toBeGreaterThan(0);
    for (const gradient of [
      "vec2 laneWaterDx = dFdx(vWaterPosition);",
      "vec2 laneWaterDy = dFdy(vWaterPosition);",
      "vec2 laneNormalDx = dFdx(surfaceNormal.xy);",
      "vec2 laneNormalDy = dFdy(surfaceNormal.xy);",
    ]) {
      const position = FRAGMENT_SHADER.indexOf(gradient);
      expect(position).toBeGreaterThan(0);
      expect(position).toBeLessThan(fieldGate);
    }
    const culledLanes = FRAGMENT_SHADER.slice(fieldGate, FRAGMENT_SHADER.indexOf("float plateAlpha"));
    expect(culledLanes).toContain("if (distSq > 900.0) continue;");
    expect(culledLanes).not.toMatch(/\b(?:dFdx|dFdy|fwidth)\s*\(/);
    const thresholds = [...culledLanes.matchAll(/\baaStep\(([^)]*)\)/g)];
    expect(thresholds).toHaveLength(4);
    for (const threshold of thresholds) expect(threshold[1]!.split(",")).toHaveLength(3);
    expect(culledLanes).toContain("segmentCount + lanePhaseGradient");
    expect(culledLanes).toContain("laneAccum += body.rgb * intensity * verticalStroke * 0.72;");
  });

  it("freezes reduced motion and lowers decorative detail by quality tier", () => {
    const water = createGardenWater(0);

    water.update(frame({
      seaState: { swell: 2, tempo: -1 },
      timeSeconds: 17,
    }));
    expect(uniformNumber(water.material, "uTime")).toBe(17);
    expect(uniformNumber(water.material, "uDetail")).toBe(1);
    expect(uniformNumber(water.material, "uWaveAmplitude")).toBeCloseTo(
      GARDEN_WATER_MAX_DISPLACEMENT,
    );
    expect(GARDEN_WATER_MAX_DISPLACEMENT).toBeLessThan(
      GARDEN_ZONE_ROOT_Y - GARDEN_WATER_Y,
    );
    expect(uniformNumber(water.material, "uTempo")).toBe(0);

    // S1: a camera drag is not a load tier. `interaction` resolves through the
    // frozen load reading, so the water keeps full detail while the camera
    // moves — this is the operator's "goes bluish-pale on camera move" bug.
    settle(water, { renderScheduler: { tier: "interaction", loadTier: "full" } });
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(1, 3);

    settle(water, { renderScheduler: { tier: "recovery" } });
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(0.36, 3);

    // Reduced motion renders ONE static frame, so it must snap rather than ease
    // — a part-way value would read as an accidental pause.
    water.update(frame({
      reducedMotion: true,
      renderScheduler: { tier: "constrained" },
      timeSeconds: 99,
    }));
    expect(uniformNumber(water.material, "uDetail")).toBe(0.24);
    expect(uniformNumber(water.material, "uTime")).toBe(0);
  });

  it("keeps the sea's character through a camera drag", () => {
    // The reported bug, as a guard. On a drag the scheduler returns
    // `interaction` with no hysteresis and no load measurement behind it;
    // reading that as load pressure switched cloud shadows, glitter and every
    // ripple ring off in one frame and cost 41% of the surface's measured
    // luminance variance.
    const water = createGardenWater(0);
    settle(water, { renderScheduler: { tier: "full" } });
    const atRest = {
      detail: uniformNumber(water.material, "uDetail"),
      glitter: uniformNumber(water.material, "uGlitterStrength"),
      ripple: uniformNumber(water.material, "uRippleStrength"),
    };

    settle(water, { renderScheduler: { tier: "interaction", loadTier: "full" } });
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(atRest.detail, 5);
    expect(uniformNumber(water.material, "uGlitterStrength")).toBeCloseTo(atRest.glitter, 5);
    expect(uniformNumber(water.material, "uRippleStrength")).toBeCloseTo(atRest.ripple, 5);

    // A drag on a machine already shedding load still sheds — quality tracks
    // the machine, not the mouse.
    settle(water, { renderScheduler: { tier: "interaction", loadTier: "recovery" } });
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(0.36, 3);
  });

  it("eases a load-tier change instead of stepping it", () => {
    // S2: hysteresis stops the ladder flapping but cannot make a single
    // crossing invisible. One frame must not carry the whole swing.
    const water = createGardenWater(0);
    settle(water, { renderScheduler: { tier: "full" } });
    const before = uniformNumber(water.material, "uDetail");

    water.update(frame({ renderScheduler: { tier: "recovery" }, timeSeconds: 13.5 }));
    const afterOneFrame = uniformNumber(water.material, "uDetail");
    expect(afterOneFrame).toBeLessThan(before);
    expect(afterOneFrame).toBeGreaterThan(0.36);

    settle(water, { renderScheduler: { tier: "recovery" }, timeSeconds: 14 });
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(0.36, 3);
  });

  it("shares the C2 cloud-shadow uniforms with the water material", () => {
    const water = createGardenWater(0);

    expect(water.material.uniforms.uCloudShadow).toBe(water.cloudShadows.uniforms.uCloudShadow);
    expect(water.material.uniforms.uCloudShadowTransform).toBe(
      water.cloudShadows.uniforms.uCloudShadowTransform,
    );
    expect(water.material.uniforms.uCloudShadowStrength).toBe(
      water.cloudShadows.uniforms.uCloudShadowStrength,
    );
    expect(water.cloudShadows.texture.image.width).toBe(256);

    const transform = water.cloudShadows.uniforms.uCloudShadowTransform.value;
    water.cloudShadows.update({ reducedMotion: false, tier: "balanced", timeSeconds: 10 });
    const driftedX = transform[2];
    expect(driftedX).toBeGreaterThan(0);
    // Reduced motion resets to canonical time zero; lower tiers hold it.
    water.cloudShadows.update({ reducedMotion: true, tier: "full", timeSeconds: 40 });
    expect(transform[2]).toBe(0);
    water.cloudShadows.update({ reducedMotion: false, tier: "recovery", timeSeconds: 40 });
    expect(transform[2]).toBe(0);
  });

  it("advects cloud-shadow features toward the weather vector", () => {
    for (const [windDirX, windDirZ] of [[1, 0], [0, 1], [-1, 0]] as const) {
      const water = createGardenWater(0);
      const transform = water.cloudShadows.uniforms.uCloudShadowTransform.value;
      water.cloudShadows.update({
        reducedMotion: false,
        tier: "full",
        timeSeconds: 0.25,
        wind: { x: windDirX, y: windDirZ, speed: 0.4, gust: 0 },
        stormLevel: 0,
      });
      // A texture sampled at world*scale + offset moves opposite its offset.
      if (windDirX === 0) expect(transform[2]).toBeCloseTo(0);
      else expect(-transform[2] * windDirX).toBeGreaterThan(0);
      if (windDirZ === 0) expect(transform[3]).toBeCloseTo(0);
      else expect(-transform[3] * windDirZ).toBeGreaterThan(0);
    }
  });

  it("gates glitter and ripple rings to balanced+ tiers and casts no cloud shadow from an empty sky", () => {
    const water = createGardenWater(0);

    settle(water, { renderScheduler: { tier: "balanced" } });
    expect(water.cloudShadowsOn()).toBe(false);
    expect(uniformNumber(water.material, "uCloudShadowStrength")).toBe(0);
    expect(uniformNumber(water.material, "uGlitterStrength")).toBeCloseTo(1, 3);
    expect(uniformNumber(water.material, "uRippleStrength")).toBeCloseTo(1, 3);

    settle(water, { renderScheduler: { tier: "recovery" } });
    expect(water.cloudShadowsOn()).toBe(false);
    expect(uniformNumber(water.material, "uCloudShadowStrength")).toBe(0);
    expect(uniformNumber(water.material, "uGlitterStrength")).toBeCloseTo(0, 3);
    expect(uniformNumber(water.material, "uRippleStrength")).toBeCloseTo(0, 3);
  });

  it("registers karesansui ripple-ring emitters via the C2 API", () => {
    const water = createGardenWater(0);

    water.setIslandCenter(24, -16);
    expect(water.rippleRings.ringCount()).toBe(1);
    // Only the pigeonnier islet registers a shoreline ring train now: the
    // wreckyard is open water and its concentric ring read as a target decal.
    water.setIsletCenters({ x: 40, z: -20 }, { x: -10, z: 8 });
    expect(water.rippleRings.ringCount()).toBe(2);
    expect(uniformNumber(water.material, "uRippleCount")).toBe(2);

    water.rippleRings.setRing({
      id: "garden.dock.alpha",
      center: { x: 30, z: -4 },
      radius: 7,
      bands: 2,
      periodSeconds: 8,
      strength: 0.4,
    });
    expect(water.rippleRings.ringCount()).toBe(3);
    expect(uniformNumber(water.material, "uRippleCount")).toBe(3);
    const ring = water.material.uniforms.uRipple!.value[2]!;
    expect(ring).toMatchObject({ x: 30, y: 4, z: 7 });
    const params = water.material.uniforms.uRippleParams!.value[2]!;
    expect(params.x).toBe(2);
    expect(params.y).toBe(8);
    expect(params.z).toBeCloseTo(0.4);

    water.rippleRings.removeRing("garden.dock.alpha");
    expect(water.rippleRings.ringCount()).toBe(2);
  });

  it("keeps a default harbor-calm mask until Lane I overrides it", () => {
    const water = createGardenWater(0);

    water.setIslandCenter(24, -16);
    const ellipse = water.material.uniforms.uHarborEllipse!.value;
    expect(ellipse.x).toBe(42);
    expect(ellipse.y).toBe(2);

    water.setHarborCalmMask({
      center: { x: 10, z: -6 },
      radiusX: 8,
      radiusZ: 5,
      calmStrength: 2,
    });
    const overridden = water.material.uniforms.uHarborEllipse!.value;
    expect(overridden).toMatchObject({ x: 10, y: 6 });
    expect(overridden.z).toBeCloseTo(1 / 8);
    expect(uniformNumber(water.material, "uHarborCalm")).toBe(1);
    // A later island re-anchor must not clobber the explicit Lane I extents.
    water.setIslandCenter(1, 1);
    expect(water.material.uniforms.uHarborEllipse!.value).toMatchObject({ x: 10, y: 6 });
  });

  it("moves through distinct day, dusk, and night palettes", () => {
    const water = createGardenWater(0);
    const body = () => (water.material.uniforms.uBandColor!.value as Color[])[1]!.clone();

    water.update(frame({ wallClockHour: 12 }));
    const day = body();

    water.update(frame({ wallClockHour: 18 }));
    const dusk = body();

    water.update(frame({ wallClockHour: 0 }));
    const night = body();

    expect(day.equals(dusk)).toBe(false);
    expect(dusk.equals(night)).toBe(false);
    expect(day.equals(night)).toBe(false);
    expect(uniformNumber(water.material, "uNight")).toBe(1);
  });

  it("keeps the transmitted body a low-chroma ink that darkens with depth at every hour", () => {
    // W3.1 (water-1c): the sea's hue comes from the mirrored sky; the body
    // under it is an absorption ink (OKLCH C ≤ 0.04). A dyed body is what made
    // the golden sea slate-blue under an amber sky and calm a mint pool.
    const water = createGardenWater(0);
    for (const hour of [6, 12, 17.6, 18.8, 22]) {
      water.update(frame({ wallClockHour: hour }));
      const bands = water.material.uniforms.uBandColor!.value as Color[];
      for (const band of bands) {
        expect(oklchChroma(band), `hour ${hour}`).toBeLessThanOrEqual(0.045);
      }
      expect(luminance(bands[0]!), `hour ${hour}`).toBeGreaterThan(luminance(bands[3]!));
    }
    water.update(frame({ wallClockHour: 12 }));
    const noonDeep = luminance((water.material.uniforms.uBandColor!.value as Color[])[3]!);
    water.update(frame({ wallClockHour: 22 }));
    const nightDeep = luminance((water.material.uniforms.uBandColor!.value as Color[])[3]!);
    expect(nightDeep).toBeLessThan(noonDeep);
  });

  it("doses the sky in the sea by the light beats, never by the IBL intensity", () => {
    const water = createGardenWater(0);
    water.update(frame({ wallClockHour: 12 }));
    const noon = uniformNumber(water.material, "uSkyRadiance");
    water.update(frame({ wallClockHour: 23 }));
    const night = uniformNumber(water.material, "uSkyRadiance");
    expect(night).toBeLessThan(noon);
    // The open-night water stays quiet: the mirrored night sky is at most half.
    expect(night).toBeLessThanOrEqual(0.5);
  });

  it("lays no moon road by day, whatever the moon is doing", () => {
    const water = createGardenWater(0);
    water.update(frame({ wallClockHour: 12 }));
    expect(uniformNumber(water.material, "uMoonLight")).toBe(0);
  });

  it("bounds all open-night additive terms with a conservative unit-luminance occupancy proxy", () => {
    expect(Object.keys(GARDEN_WATER_NIGHT_EMISSION)).toEqual(["sunGlitter", "moonRoad", "beacon", "lanes"]);
    const meanProxy = Object.values(GARDEN_WATER_NIGHT_EMISSION)
      .reduce((sum, term) => sum + term.gain * term.occupancy, 0);
    expect(meanProxy).toBeCloseTo(0.01535, 8);
    expect(meanProxy).toBeLessThanOrEqual(0.016);
    expect(FRAGMENT_SHADER.match(/waterColor\s*\+=/g)).toHaveLength(4);
    expect(FRAGMENT_SHADER).toContain(`* ${GARDEN_WATER_MOON_ROAD_GAIN.toFixed(7)}`);
    expect(FRAGMENT_SHADER).toContain(`clamp(beaconReflection, 0.0, ${GARDEN_WATER_BEACON_CLAMP.toFixed(7)})`);
    expect(FRAGMENT_SHADER).toContain(`clamp(sunGlitter, 0.0, 1.0) * ${GARDEN_WATER_SUN_GLITTER_GAIN.toFixed(7)}`);
    // Sun glitter is absent at open night, not assigned a fractional support.
    expect(FRAGMENT_SHADER).toContain("uDaylight + uDusk > 0.001");
    expect(GARDEN_WATER_NIGHT_EMISSION.sunGlitter.occupancy).toBe(0);
  });

  it("thickens the height fog at dusk and in storms, thinnest at noon", () => {
    // W2.1: the shared density is strongest at dawn/dusk, faint at noon, and
    // closed in by weather without changing the phase-authored tint.
    const water = createGardenWater(0);
    expect(uniformNumber(water.material, "uWaterLevel")).toBe(0);
    expect(uniformNumber(water.material, "uGardenHeightFogSeaLevel")).toBe(0);

    water.update(frame({ wallClockHour: 12 }));
    const noon = uniformNumber(water.material, "uGardenHeightFogDensity");
    water.update(frame({ wallClockHour: 0 }));
    const night = uniformNumber(water.material, "uGardenHeightFogDensity");
    // Full dusk is wherever the day cycle puts it (the solar clock moves it),
    // so read the dusk preset at the evening hour of peak dusk weight.
    let duskHour = 17;
    for (let hour = 17; hour <= 21; hour += 0.05) {
      if (dayCyclePhase(hour).dusk > dayCyclePhase(duskHour).dusk) duskHour = hour;
    }
    water.update(frame({ wallClockHour: duskHour }));
    const dusk = uniformNumber(water.material, "uGardenHeightFogDensity");

    expect(noon).toBeGreaterThan(0);
    expect(night).toBeGreaterThan(noon);
    expect(dusk).toBeGreaterThanOrEqual(night);

    water.update(frame({ wallClockHour: 12 }), {
      wind: { x: -0.855, y: 0.519, speed: 0.5, gust: 0 },
      breath: 0.5,
      stormLevel: 1,
      lightning: 0,
    });
    expect(uniformNumber(water.material, "uGardenHeightFogDensity")).toBeCloseTo(noon * 2.2);
  });

  it("ships the Gerstner spectrum in the vertex shader, not the sine sum", () => {
    const water = createGardenWater(0);
    expect(water.material.vertexShader).toContain("gardenGerstner");
    expect(water.material.vertexShader).not.toContain("gardenWave");
    expect(water.material.vertexShader).toContain("vGerstnerJ");
    // The fragment consumes the analytic normal, the Jacobian crest factor
    // and the wake field.
    expect(water.material.fragmentShader).toContain("vGerstnerNormal");
    expect(water.material.fragmentShader).toContain("uWakeMap");
    expect(water.material.vertexShader).toContain("ampScale * regionChop");
    expect(water.material.vertexShader).toContain("vGerstnerJ = waveJ");
  });

  it("stores weather as a downwind vector in water-local coordinates", () => {
    const water = createGardenWater(0);
    const wind = water.material.uniforms.uWindDir!.value as { x: number; y: number };
    expect(wind.x).toBeCloseTo(GARDEN_DEFAULT_WIND_X, 4);
    expect(wind.y).toBeCloseTo(-GARDEN_DEFAULT_WIND_Z, 4);

    water.update(frame(), {
      wind: { x: 0, y: -1, speed: 0.5, gust: 0 },
      breath: 0.5,
      stormLevel: 0,
      lightning: 0,
    });
    expect(wind).toMatchObject({ x: 0, y: 1 });
  });

  it("eases the wake field in at balanced+ and out below it", () => {
    const water = createGardenWater(0);
    settle(water, { renderScheduler: { tier: "full" } });
    expect(uniformNumber(water.material, "uWakeStrength")).toBeCloseTo(1, 1);
    expect(water.wakeStrength()).toBe(uniformNumber(water.material, "uWakeStrength"));

    settle(water, { renderScheduler: { tier: "balanced" } });
    expect(uniformNumber(water.material, "uWakeStrength")).toBeCloseTo(1, 1);

    settle(water, { renderScheduler: { tier: "recovery" } });
    expect(uniformNumber(water.material, "uWakeStrength")).toBeCloseTo(0, 1);
  });

  it("snaps the wake gate under reduced motion, never eases", () => {
    const water = createGardenWater(0);
    // One static frame at full: the composition is complete immediately.
    water.update(frame({ reducedMotion: true, renderScheduler: { tier: "full" } }));
    expect(uniformNumber(water.material, "uWakeStrength")).toBe(1);
  });

  it("binds the wake window in water space via setWakeState", () => {
    const water = createGardenWater(0);
    water.setWakeState(null, 47.6, -38.9, 96);
    expect(water.material.uniforms.uWakeCenter!.value).toMatchObject({ x: 47.6, y: -38.9 });
    expect(uniformNumber(water.material, "uWakeInvSize")).toBeCloseTo(1 / 192);
    expect(uniformNumber(water.material, "uWakeTexel")).toBeCloseTo(1 / 512);
  });

  it("filters mover R/G by pixel footprint without thresholding or borrowing static contact B", () => {
    const derivative = FRAGMENT_SHADER.indexOf("vec2 wakeDx = dFdx(wakeUv)");
    expect(derivative).toBeGreaterThan(0);
    expect(derivative).toBeLessThan(FRAGMENT_SHADER.indexOf("if (wakeInside)"));
    expect(FRAGMENT_SHADER).toContain("wake = centerWake * 0.5 + (beforeWake + afterWake) * 0.25");
    expect(FRAGMENT_SHADER).toContain("float wakeFoam = wake.r * wakeResolution");
    expect(FRAGMENT_SHADER).toContain("float wakeSlick = wake.g * wakeResolution * uWakeStrength");
    expect(FRAGMENT_SHADER).not.toMatch(/smoothstep\([^;\n]*wake\.g/);
    // Reference the shader's positive linear transfer: each footprint preserves
    // raw intensity order, while unresolved history gets strictly quieter.
    for (const footprintTexels of [1, 2, 4, 8]) {
      const resolution = 1 / Math.max(1, footprintTexels);
      const values = [0, 0.1, 0.3, 0.6, 1].map((raw) => raw * resolution);
      expect(values[0]).toBe(0);
      for (let index = 1; index < values.length; index += 1) {
        expect(values[index]).toBeGreaterThan(values[index - 1]!);
      }
      expect(values.at(-1)).toBeCloseTo(resolution);
    }
  });

  it("beds contact continuously under the hull with short footprint-filtered optical reach", () => {
    expect(FRAGMENT_SHADER).toContain("contact = wake.b");
    expect(FRAGMENT_SHADER).toContain("min(0.75, horizontalDistance / (eyeHeight + 1.0) * 0.12) * wakeResolution");
    expect(FRAGMENT_SHADER).toContain("tap <= 2");
    expect(FRAGMENT_SHADER).not.toContain("clamp(horizontalDistance / (eyeHeight + 1.0), 0.8, 6.0)");
    for (const footprintTexels of [1, 2, 4, 8]) {
      for (const distance of [0, 10, 100, 1000]) {
        const reach = Math.min(0.75, distance / 2 * 0.12) / footprintTexels;
        expect(reach).toBeGreaterThanOrEqual(0);
        expect(reach).toBeLessThanOrEqual(0.75 / footprintTexels);
      }
    }
  });

  it("animates route pulses at balanced+, holds below it, and resets for reduced motion", () => {
    // Phase 4 (item 3): the pulse clock mirrors today's lane tier behavior —
    // full/balanced animate, recovery/constrained hold the lanes static, and
    // reduced motion renders the frozen static frame.
    const water = createGardenWater(0);
    settle(water, { renderScheduler: { tier: "full" }, timeSeconds: 12 });
    const animated = uniformNumber(water.material, "uPulseTime");
    expect(animated).toBeGreaterThan(0);

    settle(water, { renderScheduler: { tier: "recovery" }, timeSeconds: 20 });
    expect(uniformNumber(water.material, "uPulseTime")).toBe(animated);

    settle(water, { renderScheduler: { tier: "balanced" }, timeSeconds: 24 });
    expect(uniformNumber(water.material, "uPulseTime")).toBeGreaterThan(animated);

    water.update(frame({ reducedMotion: true, timeSeconds: 99 }));
    expect(uniformNumber(water.material, "uPulseTime")).toBe(0);
  });

  it("makes fresh-reduced and animated-then-reduced water clocks identical", () => {
    const fresh = createGardenWater(0);
    fresh.update(frame({ reducedMotion: true, timeSeconds: 99 }));
    const freshClock = {
      cloud: [...fresh.cloudShadows.uniforms.uCloudShadowTransform.value.slice(2)],
      pulse: uniformNumber(fresh.material, "uPulseTime"),
      time: uniformNumber(fresh.material, "uTime"),
    };

    const animated = createGardenWater(0);
    settle(animated, { renderScheduler: { tier: "full" }, timeSeconds: 12 });
    expect(uniformNumber(animated.material, "uPulseTime")).toBeGreaterThan(0);
    expect(
      animated.cloudShadows.uniforms.uCloudShadowTransform.value
        .slice(2)
        .some((offset) => Math.abs(offset) > 0),
    ).toBe(true);

    animated.update(frame({ reducedMotion: true, timeSeconds: 99 }));
    expect({
      cloud: [...animated.cloudShadows.uniforms.uCloudShadowTransform.value.slice(2)],
      pulse: uniformNumber(animated.material, "uPulseTime"),
      time: uniformNumber(animated.material, "uTime"),
    }).toEqual(freshClock);
  });

  it("shades route pulse lanes from the lane texture's third row", () => {
    const source = createGardenWater(0).material.fragmentShader;
    expect(source).toContain("uPulseTime");
    // Header and body rows moved to the 3-row layout's texel centers.
    expect(source).toContain("vec2(u, 1.0 / 6.0)");
    expect(source).toContain("vec2(u, 5.0 / 6.0)");
  });

  it("renders at most sixteen ember reflections as wind-bent broken vertical strokes", () => {
    const source = createGardenWater(0).material.fragmentShader;
    expect(GARDEN_WATER_MAX_LIGHT_LANES).toBe(16);
    expect(source).toContain("for (int i = 0; i < 16; i += 1)");
    expect(source).toContain("float strokeLength = mix(5.0, 18.0, sourceHeight)");
    expect(source).toContain("uWindSpeed * 0.28");
    expect(source).toContain("float segmentCount = floor(mix(3.0, 6.0, sourceHeight) + 0.5)");
    expect(source).toContain("surfaceNormal.x * 0.38");
    expect(source).toContain("body.rgb * intensity * verticalStroke");
    // Header, route metadata, route body and point body remain the only
    // lane-texture samples: breaking the point strokes is analytic and adds
    // no GPU texture fetch.
    expect(source.match(/texture2D\(uLaneTexture/g)).toHaveLength(4);
  });
});

/**
 * Phase 3 (item 1): the Gerstner component table is the single source of
 * truth the vertex shader is generated from — so its invariants are asserted
 * here, not eyeballed in a render.
 */
describe("GARDEN_WATER_GERSTNER", () => {
  it("is a 6-8 component spectrum whose amplitudes sum to the master scale", () => {
    expect(GARDEN_WATER_GERSTNER.length).toBeGreaterThanOrEqual(6);
    expect(GARDEN_WATER_GERSTNER.length).toBeLessThanOrEqual(8);
    const sum = GARDEN_WATER_GERSTNER.reduce((total, c) => total + c.amplitude, 0);
    // Sum 1.0: uWaveAmplitude (swell + storm, capped at MAX_DISPLACEMENT)
    // remains the sole master scale, so the zone-root plane contract holds.
    expect(sum).toBeCloseTo(1, 6);
  });

  it("keeps every wavelength honestly sampled by the 96×96 grid", () => {
    // The grid samples at ~9.4 world units; anything under ~30 aliases into
    // the vertex normals and the crest Jacobian.
    for (const component of GARDEN_WATER_GERSTNER) {
      expect(component.wavelength).toBeGreaterThanOrEqual(30);
      expect(component.steepness).toBeGreaterThan(0);
      expect(component.steepness).toBeLessThanOrEqual(1);
      expect(component.omega).toBeGreaterThan(0);
    }
  });

  it("spreads around the historical primary bearing, never opposite the wind", () => {
    // The windRot contract rotates the whole spectrum with the weather; the
    // spread stays within ±0.65 rad so default weather reads like the
    // pre-Gerstner sea and no component ever runs against the wind.
    for (const component of GARDEN_WATER_GERSTNER) {
      expect(Math.abs(component.dirOffset)).toBeLessThanOrEqual(0.65);
    }
    // Long components carry the energy (the sea is swell, not chop).
    const sorted = [...GARDEN_WATER_GERSTNER].sort((a, b) => b.wavelength - a.wavelength);
    expect(sorted[0]!.amplitude).toBeGreaterThan(sorted.at(-1)!.amplitude);
  });

  it("moves the default, quarter-turn, and opposite fields downwind", () => {
    const component: GerstnerComponent = {
      amplitude: 1,
      dirOffset: 0,
      omega: 0.23,
      steepness: 0.5,
      wavelength: 78,
    };
    const winds = [
      [GARDEN_DEFAULT_WIND_X, GARDEN_DEFAULT_WIND_Z],
      [-GARDEN_DEFAULT_WIND_Z, GARDEN_DEFAULT_WIND_X],
      [-GARDEN_DEFAULT_WIND_X, -GARDEN_DEFAULT_WIND_Z],
    ] as const;

    for (const [windDirX, windDirZ] of winds) {
      const input: GardenGerstnerSampleInput = {
        amplitudeScale: 0.03,
        phaseTime: 7.2,
        spatialScale: 1.3,
        waterX: 19,
        waterY: -8,
        windDirX,
        windDirZ,
      };
      const before = sampleGardenGerstner(input, [component]);
      const dt = 0.04;
      const k = (Math.PI * 2) / component.wavelength;
      const distance = (component.omega / (k * input.spatialScale)) * dt;
      const after = sampleGardenGerstner({
        ...input,
        phaseTime: input.phaseTime + dt,
        waterX: input.waterX + windDirX * distance,
        // Water local Y is -world Z.
        waterY: input.waterY - windDirZ * distance,
      }, [component]);
      expect(after.height).toBeCloseTo(before.height, 10);
      expect(after.displacementX).toBeCloseTo(before.displacementX, 10);
      expect(after.displacementY).toBeCloseTo(before.displacementY, 10);
    }
  });

  it("matches the exact rendered displacement Jacobian by finite differences", () => {
    const winds = [
      [GARDEN_DEFAULT_WIND_X, GARDEN_DEFAULT_WIND_Z],
      [-GARDEN_DEFAULT_WIND_Z, GARDEN_DEFAULT_WIND_X],
      [-GARDEN_DEFAULT_WIND_X, -GARDEN_DEFAULT_WIND_Z],
    ] as const;
    const epsilon = 1e-4;

    for (const component of GARDEN_WATER_GERSTNER) {
      for (const amplitudeScale of [0, 0.018, GARDEN_WATER_MAX_DISPLACEMENT]) {
        for (const spatialScale of [0.45, 1, 1.8]) {
          for (const [windDirX, windDirZ] of winds) {
            const input: GardenGerstnerSampleInput = {
              amplitudeScale,
              phaseTime: 13.7,
              spatialScale,
              waterX: 31.25,
              waterY: -17.75,
              windDirX,
              windDirZ,
            };
            const analytic = sampleGardenGerstner(input, [component]);
            const xMinus = sampleGardenGerstner(
              { ...input, waterX: input.waterX - epsilon },
              [component],
            );
            const xPlus = sampleGardenGerstner(
              { ...input, waterX: input.waterX + epsilon },
              [component],
            );
            const yMinus = sampleGardenGerstner(
              { ...input, waterY: input.waterY - epsilon },
              [component],
            );
            const yPlus = sampleGardenGerstner(
              { ...input, waterY: input.waterY + epsilon },
              [component],
            );
            const jxx = (
              input.waterX + epsilon + xPlus.displacementX
              - (input.waterX - epsilon + xMinus.displacementX)
            ) / (2 * epsilon);
            const jyx = (xPlus.displacementY - xMinus.displacementY) / (2 * epsilon);
            const jxy = (yPlus.displacementX - yMinus.displacementX) / (2 * epsilon);
            const jyy = (
              input.waterY + epsilon + yPlus.displacementY
              - (input.waterY - epsilon + yMinus.displacementY)
            ) / (2 * epsilon);

            expect(analytic.jxx).toBeCloseTo(jxx, 7);
            expect(analytic.jxy).toBeCloseTo(jxy, 7);
            expect(analytic.jyx).toBeCloseTo(jyx, 7);
            expect(analytic.jyy).toBeCloseTo(jyy, 7);
            expect(analytic.determinant).toBeCloseTo(jxx * jyy - jxy * jyx, 7);
          }
        }
      }
    }
  });
});

function frame(overrides: Partial<GardenWaterFrame> = {}): GardenWaterFrame {
  return {
    reducedMotion: false,
    renderScheduler: { tier: "full" },
    seaState: { swell: 0.18, tempo: 0.24 },
    timeSeconds: 12,
    wallClockHour: 12,
    ...overrides,
  };
}

/**
 * Drive enough advancing frames for S2's tier easing to settle.
 *
 * The tier-driven uniforms approach their target at `1 - e^(-12 dt)` per frame,
 * so a single `update` at a standing clock moves nothing — which is correct
 * (no time passed) but means a test asserting a tier's steady state has to run
 * a clock the way the render loop does.
 */
function settle(
  water: { update: (frame: GardenWaterFrame) => void },
  overrides: Partial<GardenWaterFrame> = {},
): void {
  const start = overrides.timeSeconds ?? 12;
  for (let step = 0; step < 30; step += 1) {
    water.update(frame({ ...overrides, timeSeconds: start + step * 0.05 }));
  }
}

function uniformNumber(material: ShaderMaterial, name: string): number {
  return material.uniforms[name]!.value as number;
}

/** OKLCH chroma of a linear working-space colour (Björn Ottosson's OKLab). */
function oklchChroma(color: Color): number {
  const l = Math.cbrt(0.4122214708 * color.r + 0.5363325363 * color.g + 0.0514459929 * color.b);
  const m = Math.cbrt(0.2119034982 * color.r + 0.6806995451 * color.g + 0.1073969566 * color.b);
  const s = Math.cbrt(0.0883024619 * color.r + 0.2817188376 * color.g + 0.6299787005 * color.b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return Math.hypot(a, b);
}

function luminance(color: Color): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}
