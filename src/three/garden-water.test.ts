import {
  Color,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector3,
  Vector4,
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  GARDEN_WATER_Y,
  GARDEN_ZONE_ROOT_Y,
} from "../systems/garden-observatory-slice";
import {
  GARDEN_DEFAULT_WIND_X,
  GARDEN_DEFAULT_WIND_Z,
} from "../systems/weather";
import {
  SEA_REGION_CHARACTER,
  SEA_REGION_FALLBACK_TINT,
  SEA_REGION_ID,
} from "../systems/garden-sea-regions";
import type { GardenWaterFrame } from "./garden-water";
import {
  createGardenWater,
  FRAGMENT_SHADER,
  GARDEN_WATER_GERSTNER,
  GARDEN_WATER_MAX_DISPLACEMENT,
  sampleGardenGerstner,
  VERTEX_SHADER,
  type GardenGerstnerSampleInput,
  type GerstnerComponent,
} from "./garden-water";
import {
  GARDEN_WATER_MAX_RIPPLE_RINGS,
  GARDEN_WATER_MAX_LIGHT_LANES,
  GARDEN_WATER_PLATE_MARGIN_TILES,
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
    const expectedParams = new Vector4(open.depth, open.foam, open.reflectivity, open.tintStrength);
    const expectedSwell = new Vector4(open.swell, open.chop, open.crossedNormal, open.shallowShelf);

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
      {} as never,
      scene,
      {} as never,
      water.mesh.geometry,
      water.material,
      new Group(),
    );

    expect(water.material.uniforms.envMap!.value).toBe(probe);
    expect((water.material as ShaderMaterial & { envMap: Texture | null }).envMap).toBe(probe);
    expect(water.material.version).toBeGreaterThan(versionBeforeProbe);

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
    expect(water.material.uniforms.uRegionParams!.value[5]!.w).toBeCloseTo(
      SEA_REGION_CHARACTER.danger.tintStrength,
    );
  });

  it("wires the seven directional characters into the existing normal vocabulary", () => {
    const water = createGardenWater(0);
    const flows = water.material.uniforms.uRegionFlow!.value;
    const waves = water.material.uniforms.uRegionSwell!.value;
    for (const [name, id] of Object.entries(SEA_REGION_ID)) {
      const character = SEA_REGION_CHARACTER[name as keyof typeof SEA_REGION_CHARACTER];
      expect(flows[id]!.x).toBeCloseTo(Math.cos(character.flowBearing));
      expect(flows[id]!.y).toBeCloseTo(-Math.sin(character.flowBearing));
      expect(flows[id]!.z).toBe(character.flowHold);
      expect(flows[id]!.w).toBe(character.normalDetail);
      expect(waves[id]!.z).toBe(character.crossedNormal);
      expect(waves[id]!.w).toBe(character.shallowShelf);
    }
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

  it("resolves every hard threshold against its own screen-space gradient", () => {
    // S3: MSAA antialiases geometry edges, not a discontinuity the shader
    // invents per fragment. Every bare step() on a spatial field crawled under
    // camera motion — the operator's "flickering". aaStep is the only threshold
    // helper; a raw step() on a varying-derived field is the regression.
    const source = createGardenWater(0).material.fragmentShader;
    expect(source).toContain("float aaStep(float edge, float value)");
    expect(source).toContain("fwidth(value)");
    for (const aliased of [
      "step(0.76,",
      "step(0.35,",
      "step(-2.0, along)",
    ]) {
      // `aaStep(0.76,` contains `Step(0.76,` but not `step(0.76,` — the check
      // is case-sensitive on purpose.
      expect(source).not.toContain(aliased);
    }
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
