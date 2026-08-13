import {
  Color,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
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
import type { GardenWaterFrame } from "./garden-water";
import {
  createGardenWater,
  FRAGMENT_SHADER,
  GARDEN_ISLAND_ROCK_RADIUS,
  GARDEN_WATER_GERSTNER,
  GARDEN_WATER_MAX_DISPLACEMENT,
  sampleGardenGerstner,
  VERTEX_SHADER,
  type GardenGerstnerSampleInput,
  type GerstnerComponent,
} from "./garden-water";

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

  /**
   * W1.4: the bokashi bands are the only sky this world has, and the water
   * draws them. The shader has TWO exit paths — the open-ocean early-out and
   * the end of main — and at wide framings the early-out draws most of the far
   * water in the upper frame. Applying the wipe to one path only would step the
   * ramp at exactly the map boundary L1 spent its effort erasing.
   */
  it("wipes the bokashi bands on BOTH of the shader's exit paths", () => {
    expect(FRAGMENT_SHADER).toContain("float gardenBokashiShade(");
    const calls = FRAGMENT_SHADER.match(/gl_FragColor\.rgb \*= gardenBokashiShade\(/g);
    expect(calls).toHaveLength(2);
  });
});

describe("createGardenWater", () => {
  it("creates one WebGL1 surface that samples the normal map and lane texture", () => {
    const water = createGardenWater(-0.12);
    water.setIslandCenter(12, -7);

    expect(water.mesh.children).toHaveLength(0);
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
    // W6: flicker defaults to a calm mid-glow when the caller omits it, and
    // the island anchor carries the rock radius for the shore SDF.
    expect(uniformNumber(water.material, "uBeaconFlicker")).toBe(0.5);
    expect(uniformNumber(water.material, "uRockRadius")).toBe(
      GARDEN_ISLAND_ROCK_RADIUS,
    );
    water.setBeaconState(6, -4, 1.2, 0.8, 1.7);
    expect(uniformNumber(water.material, "uBeaconFlicker")).toBe(1);
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
    expect(danger.getHexString()).toBe("ef4444");
    expect(water.material.uniforms.uRegionParams!.value[5]!.w).toBeCloseTo(0.44);
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

  it("closes the open-ocean early-out with the same encoding as the main path", () => {
    // Three only compiles tone mapping and an encoding `linearToOutputTexel`
    // in when a material draws to the default framebuffer, so both chunks are
    // no-ops under the post composer and go live the frame it is shed at the
    // `constrained` tier. An early-out that returns without them writes linear
    // values into the sRGB canvas, and the open sea outside the map snaps to a
    // near-black void behind a hard diamond seam.
    const water = createGardenWater(0);
    const source = water.mesh.material.fragmentShader;
    const earlyOut = source.slice(0, source.indexOf("return;"));
    for (const chunk of ["tonemapping_fragment", "colorspace_fragment", "fog_fragment"]) {
      expect(source.split(`#include <${chunk}>`)).toHaveLength(3);
      expect(earlyOut).toContain(`#include <${chunk}>`);
    }
    // W2.1 is part of that close too: most upper-frame water takes this branch,
    // so omitting the analytic term would reveal the rounded map boundary.
    expect(source.split("gl_FragColor.rgb = gardenApplyHeightFog(")).toHaveLength(3);
    expect(earlyOut).toContain("gl_FragColor.rgb = gardenApplyHeightFog(");
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
      "step(0.86, sin(",
      "step(0.0, shoreWorld)",
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
      cloud: uniformNumber(water.material, "uCloudShadowStrength"),
      detail: uniformNumber(water.material, "uDetail"),
      glitter: uniformNumber(water.material, "uGlitterStrength"),
      ripple: uniformNumber(water.material, "uRippleStrength"),
    };

    settle(water, { renderScheduler: { tier: "interaction", loadTier: "full" } });
    expect(uniformNumber(water.material, "uCloudShadowStrength")).toBeCloseTo(atRest.cloud, 5);
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(atRest.detail, 5);
    expect(uniformNumber(water.material, "uGlitterStrength")).toBeCloseTo(atRest.glitter, 5);
    expect(uniformNumber(water.material, "uRippleStrength")).toBeCloseTo(atRest.ripple, 5);
    expect(water.cloudShadowsOn()).toBe(true);

    // A drag on a machine already shedding load still sheds — quality tracks
    // the machine, not the mouse.
    settle(water, { renderScheduler: { tier: "interaction", loadTier: "recovery" } });
    expect(uniformNumber(water.material, "uDetail")).toBeCloseTo(0.36, 3);
    expect(water.cloudShadowsOn()).toBe(false);
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
        wind: { stormLevel: 0, windDirX, windDirZ, windSpeed: 0.4 },
      });
      // A texture sampled at world*scale + offset moves opposite its offset.
      if (windDirX === 0) expect(transform[2]).toBeCloseTo(0);
      else expect(-transform[2] * windDirX).toBeGreaterThan(0);
      if (windDirZ === 0) expect(transform[3]).toBeCloseTo(0);
      else expect(-transform[3] * windDirZ).toBeGreaterThan(0);
    }
  });

  it("gates cloud shadows and glitter to balanced+ tiers", () => {
    const water = createGardenWater(0);

    settle(water, { renderScheduler: { tier: "balanced" } });
    expect(water.cloudShadowsOn()).toBe(true);
    expect(uniformNumber(water.material, "uCloudShadowStrength")).toBeGreaterThan(0);
    expect(uniformNumber(water.material, "uGlitterStrength")).toBeCloseTo(1, 3);
    expect(uniformNumber(water.material, "uRippleStrength")).toBeCloseTo(1, 3);

    settle(water, { renderScheduler: { tier: "recovery" } });
    expect(water.cloudShadowsOn()).toBe(false);
    expect(uniformNumber(water.material, "uCloudShadowStrength")).toBeCloseTo(0, 3);
    expect(uniformNumber(water.material, "uGlitterStrength")).toBeCloseTo(0, 3);
    expect(uniformNumber(water.material, "uRippleStrength")).toBeCloseTo(0, 3);
  });

  it("registers karesansui ripple-ring emitters via the C2 API", () => {
    const water = createGardenWater(0);

    water.setIslandCenter(24, -16);
    expect(water.rippleRings.ringCount()).toBe(1);
    water.setIsletCenters({ x: 40, z: -20 }, { x: -10, z: 8 });
    expect(water.rippleRings.ringCount()).toBe(3);
    expect(uniformNumber(water.material, "uRippleCount")).toBe(3);

    water.rippleRings.setRing({
      id: "garden.dock.alpha",
      center: { x: 30, z: -4 },
      radius: 7,
      bands: 2,
      periodSeconds: 8,
      strength: 0.4,
    });
    expect(water.rippleRings.ringCount()).toBe(4);
    expect(uniformNumber(water.material, "uRippleCount")).toBe(4);
    const ring = water.material.uniforms.uRipple!.value[3]!;
    expect(ring).toMatchObject({ x: 30, y: 4, z: 7 });
    const params = water.material.uniforms.uRippleParams!.value[3]!;
    expect(params.x).toBe(2);
    expect(params.y).toBe(8);
    expect(params.z).toBeCloseTo(0.4);

    water.rippleRings.removeRing("garden.dock.alpha");
    expect(water.rippleRings.ringCount()).toBe(3);
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

    water.update(frame({ wallClockHour: 12 }));
    const day = uniformColor(water.material, "uBaseColor").clone();

    water.update(frame({ wallClockHour: 18 }));
    const dusk = uniformColor(water.material, "uBaseColor").clone();

    water.update(frame({ wallClockHour: 0 }));
    const night = uniformColor(water.material, "uBaseColor").clone();

    expect(day.equals(dusk)).toBe(false);
    expect(dusk.equals(night)).toBe(false);
    expect(day.equals(night)).toBe(false);
    expect(uniformNumber(water.material, "uNight")).toBe(1);
  });

  it("keeps the dusk sea out of the pink-mauve wedge", () => {
    // W1.6 regression. The dusk ramp used to tint an indigo body with lantern
    // gold and ember, and every intermediate step between a warm neutral and an
    // indigo is violet — the shipped frame sampled hue 270-291 across the open
    // sea and read as lilac paint. The ramp now descends nando-iro -> ai ->
    // kachi-iro, so it arrives at indigo from the blue-green side.
    //
    // This asserts the SHAPE, not three hex literals: the shelf must be cooler
    // than violet and the descent must stay monotonic in value. Tuning the
    // exact dye is still free; re-introducing the mauve is not.
    const water = createGardenWater(0);
    water.update(frame({ wallClockHour: 19 }));

    const shallow = uniformColor(water.material, "uShallowColor").clone();
    const mid = uniformColor(water.material, "uBaseColor").clone();
    const deep = uniformColor(water.material, "uDeepColor").clone();

    // The shelf and the body are where the mauve lived; the deep is allowed to
    // stay kachi-iro, which is a legitimately indigo-violet traditional colour.
    for (const [name, color] of [["shallow", shallow], ["mid", mid]] as const) {
      const hue = hslHue(color);
      expect(hue, `${name} must not sit in the mauve/pink wedge`)
        .toBeGreaterThan(150);
      expect(hue, `${name} must not sit in the mauve/pink wedge`)
        .toBeLessThan(250);
    }

    // Value has to carry the depth read, hue-blind or not.
    expect(luminance(shallow)).toBeGreaterThan(luminance(mid));
    expect(luminance(mid)).toBeGreaterThan(luminance(deep));

    // The gold did not vanish — it moved to the sun path, where dusk warmth
    // belongs, and the highlight has to stay warmer than the body it lights.
    const highlight = uniformColor(water.material, "uHighlightColor").clone();
    expect(highlight.r).toBeGreaterThan(highlight.b);
    expect(luminance(highlight)).toBeGreaterThan(luminance(shallow));
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
    water.update(frame({ wallClockHour: 18 }));
    const dusk = uniformNumber(water.material, "uGardenHeightFogDensity");

    expect(noon).toBeGreaterThan(0);
    expect(night).toBeGreaterThan(noon);
    expect(dusk).toBeGreaterThan(night);

    water.update(frame({ wallClockHour: 12 }), {
      windDirX: -0.855,
      windDirZ: 0.519,
      windAngle: 2.592,
      windSpeed: 0.5,
      gust: 0,
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
    // The fragment consumes the analytic normal, the Jacobian crest factor,
    // the wake field and the caustic web.
    expect(water.material.fragmentShader).toContain("vGerstnerNormal");
    expect(water.material.fragmentShader).toContain("uWakeMap");
    expect(water.material.fragmentShader).toContain("uCausticStrength");
    expect(water.material.vertexShader).toContain("ampScale * regionChop");
    expect(water.material.vertexShader).toContain("vGerstnerJ = waveJ");
  });

  it("stores weather as a downwind vector in water-local coordinates", () => {
    const water = createGardenWater(0);
    const wind = water.material.uniforms.uWindDir!.value as { x: number; y: number };
    expect(wind.x).toBeCloseTo(GARDEN_DEFAULT_WIND_X, 4);
    expect(wind.y).toBeCloseTo(-GARDEN_DEFAULT_WIND_Z, 4);

    water.update(frame(), {
      windDirX: 0,
      windDirZ: -1,
      windAngle: -Math.PI / 2,
      windSpeed: 0.5,
      gust: 0,
      stormLevel: 0,
      lightning: 0,
    });
    expect(wind).toMatchObject({ x: 0, y: 1 });
  });

  it("eases the wake field in at balanced+ and the caustic web at full only", () => {
    const water = createGardenWater(0);
    settle(water, { renderScheduler: { tier: "full" } });
    expect(uniformNumber(water.material, "uWakeStrength")).toBeCloseTo(1, 1);
    expect(water.wakeStrength()).toBe(uniformNumber(water.material, "uWakeStrength"));
    expect(uniformNumber(water.material, "uCausticStrength")).toBeCloseTo(1, 1);

    settle(water, { renderScheduler: { tier: "balanced" } });
    expect(uniformNumber(water.material, "uWakeStrength")).toBeCloseTo(1, 1);
    expect(uniformNumber(water.material, "uCausticStrength")).toBeCloseTo(0, 1);

    settle(water, { renderScheduler: { tier: "recovery" } });
    expect(uniformNumber(water.material, "uWakeStrength")).toBeCloseTo(0, 1);
    expect(uniformNumber(water.material, "uCausticStrength")).toBeCloseTo(0, 1);
  });

  it("snaps the wake and caustic gates under reduced motion, never eases", () => {
    const water = createGardenWater(0);
    // One static frame at full: the composition is complete immediately.
    water.update(frame({ reducedMotion: true, renderScheduler: { tier: "full" } }));
    expect(uniformNumber(water.material, "uWakeStrength")).toBe(1);
    expect(uniformNumber(water.material, "uCausticStrength")).toBe(1);
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

function uniformColor(material: ShaderMaterial, name: string): Color {
  return material.uniforms[name]!.value as Color;
}

/**
 * Hue in degrees off the DISPLAY colour, not the working one.
 *
 * Uniform colours are in the linear working space; `getHSL(target, SRGBColorSpace)`
 * is what asks the question a viewer would — "what hue is this on screen".
 */
function hslHue(color: Color): number {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl, SRGBColorSpace);
  return hsl.h * 360;
}

function luminance(color: Color): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}
