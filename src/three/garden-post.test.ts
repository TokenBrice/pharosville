// @vitest-environment jsdom
//
// The post chain owns two of its own textures (the phase LUT strip and the
// blue-noise dither mask) and loads them through three's TextureLoader, which
// needs a document. Under the default `node` environment the loader is skipped
// by design and half the W1.1/W1.2 contract would be untestable.
import {
  ClampToEdgeWrapping,
  DirectionalLight,
  Fog,
  HalfFloatType,
  LinearFilter,
  NoColorSpace,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  Texture as ThreeTexture,
  type Texture,
  type WebGLRenderer,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayCycleBeats, dayCyclePhase } from "./garden-day-cycle";
import {
  createGardenPost,
  gardenGodRayLowSunGate,
  GARDEN_BLOOM_PRACTICAL_THRESHOLD,
  GARDEN_TONE_MAPPING,
  type GardenPost,
} from "./garden-post";
import { gardenKeyLightPose } from "./garden-sun";
import {
  CAMERA_FOV_DEG,
  cameraEye,
  cameraPoseFromIso,
} from "../systems/projection";
import { DAY_CYCLE_ELEVATION_EDGES } from "../systems/day-cycle-beats";
import { gardenSkyToday, gardenSolarElevationAt } from "../systems/sky-almanac";

const postHarness = vi.hoisted(() => {
  const makeDisposable = (name: string) => ({
    dispose: vi.fn(),
    name,
  });
  const makeResizable = (name: string) => ({
    ...makeDisposable(name),
    setSize: vi.fn(),
  });
  // The two n8ao materials whose normal reconstruction the post chain
  // re-addresses (W8.1), cut down to the lines the patch has to find.
  const makeNormalShader = (name: string) => ({
    ...makeDisposable(name),
    fragmentShader: [
      "uniform vec2 resolution;",
      "vec3 computeNormal(vec3 worldPos, vec2 vUv) {",
      "  ivec2 p = ivec2(vUv * resolution);",
      "  vec3 dpdx = getWorldPos(l1, (vUv - vec2(1.0 / resolution.x, 0.0))).xyz;",
      "  vec3 dpdy = getWorldPos(b1, (vUv - vec2(0.0, 1.0 / resolution.y))).xyz;",
      "  return normalize(cross(dpdx, dpdy));",
      "}",
      "void main() { vec2 texel = vUv * resolution * 0.5; }",
    ].join("\n"),
    needsUpdate: false,
  });
  return {
    blooms: [] as unknown[],
    composers: [] as unknown[],
    effects: [] as unknown[],
    makeDisposable,
    makeNormalShader,
    makeResizable,
    n8aoPasses: [] as unknown[],
    shaderPasses: [] as unknown[],
    sharedN8AOGeometry: makeDisposable("n8ao-shared-geometry"),
  };
});

vi.mock("n8ao", () => {
  const quad = (name: string, material = postHarness.makeDisposable(`${name}-material`)) => ({
    _mesh: {
      geometry: postHarness.sharedN8AOGeometry,
      material,
    },
    material,
  });

  class FakeN8AOPostPass {
    accumulationQuad = quad("accumulation");
    accumulationRenderTarget = postHarness.makeDisposable("accumulation-target");
    autoDetectTransparency = true;
    bluenoise = postHarness.makeDisposable("bluenoise");
    configuration = {
      aoRadius: 5,
      aoSamples: 16,
      denoiseSamples: 8,
      distanceFalloff: 1,
      halfRes: false,
      intensity: 5,
      transparencyAware: false,
    };
    copyQuad = quad("copy");
    depthCopyPass = quad("depth-copy");
    depthDownsampleQuad = quad("depth-downsample", postHarness.makeNormalShader("depth-downsample-material"));
    depthDownsampleTarget = postHarness.makeDisposable("depth-downsample-target");
    effectCompositerQuad = quad("compositer", postHarness.makeNormalShader("compositer-material"));
    effectShaderQuad = quad("ao");
    enabled = true;
    inheritedDispose = vi.fn();
    neuralDenoiseMaterial = postHarness.makeDisposable("neural-denoise-material");
    outputTargetInternal = postHarness.makeResizable("output-target");
    poissonBlurQuad: ReturnType<typeof quad>;
    qualityMode = "";
    qualityModeCalls: string[] = [];
    readTargetInternal = postHarness.makeDisposable("read-target");
    standardDenoiseMaterial = postHarness.makeDisposable("standard-denoise-material");
    transparencyRenderTargetDWFalse = postHarness.makeDisposable("transparency-false-target");
    transparencyRenderTargetDWTrue = postHarness.makeDisposable("transparency-true-target");
    writeTargetInternal = postHarness.makeDisposable("write-target");
    setSize = vi.fn();

    constructor(
      readonly scene: Scene,
      readonly camera: PerspectiveCamera,
      readonly width: number,
      readonly height: number,
    ) {
      this.poissonBlurQuad = quad("poisson", this.standardDenoiseMaterial);
      postHarness.n8aoPasses.push(this);
    }

    dispose(): void {
      this.inheritedDispose();
    }

    setQualityMode(mode: string): void {
      this.qualityMode = mode;
      this.qualityModeCalls.push(mode);
      if (mode === "Performance") {
        this.configuration.aoSamples = 8;
        this.configuration.denoiseSamples = 4;
      }
    }
  }

  return { N8AOPostPass: FakeN8AOPostPass };
});

vi.mock("postprocessing", () => {
  const BlendFunction = { ADD: "ADD", SRC: "SRC" };
  const EffectAttribute = { CONVOLUTION: 2, DEPTH: 1 };
  const ToneMappingMode = { AGX: "AGX", NEUTRAL: "NEUTRAL" };

  class FakeEffect {
    attributes: number;
    dispose = vi.fn();
    uniforms: Map<string, unknown>;

    constructor(
      readonly name: string,
      readonly fragmentShader = "",
      readonly options: {
        attributes?: number;
        uniforms?: Map<string, unknown>;
      } = {},
    ) {
      this.attributes = options.attributes ?? 0;
      this.uniforms = options.uniforms ?? new Map();
      postHarness.effects.push(this);
    }
  }

  class FakeBloomEffect extends FakeEffect {
    intensity: number;
    luminanceMaterial: { smoothing: number; threshold: number };
    luminancePass = { setSize: vi.fn() };
    mipmapBlurPass: { radius: number; setSize: ReturnType<typeof vi.fn> };

    constructor(readonly bloomOptions: {
      intensity: number;
      luminanceSmoothing: number;
      luminanceThreshold: number;
      radius: number;
    }) {
      super("BloomEffect");
      this.intensity = bloomOptions.intensity;
      this.luminanceMaterial = {
        smoothing: bloomOptions.luminanceSmoothing,
        threshold: bloomOptions.luminanceThreshold,
      };
      // The blur spread is a uniform on the upsample material, not a define,
      // which is what makes a per-phase radius free of shader recompiles.
      this.mipmapBlurPass = { radius: bloomOptions.radius, setSize: vi.fn() };
      postHarness.blooms.push(this);
    }
  }

  class FakeToneMappingEffect extends FakeEffect {
    constructor(readonly toneMappingOptions: { mode: string }) {
      super("ToneMappingEffect");
    }
  }

  class FakeSMAAEffect extends FakeEffect {
    constructor() {
      super("SMAAEffect", "", {
        attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
      });
    }
  }

  class FakeEffectPass {
    enabled = true;
    name = "EffectPass";
    renderToScreen = false;

    constructor(
      readonly camera: PerspectiveCamera,
      ...effects: FakeEffect[]
    ) {
      this.effects = effects;
    }

    readonly effects: readonly FakeEffect[];

    dispose(): void {
      for (const effect of this.effects) effect.dispose();
    }
  }

  // W2.4 owns an off-screen helper pass (the shadow-map raymarch). It never
  // enters the composer — the god-ray effect drives it from `update()` — so
  // the harness only has to record it.
  class FakeShaderPass {
    dispose = vi.fn();
    render = vi.fn();

    constructor(
      readonly fullscreenMaterial: { uniforms: Record<string, { value: unknown }> },
      readonly input = "inputBuffer",
    ) {
      postHarness.shaderPasses.push(this);
    }
  }

  class FakeRenderPass {
    enabled = true;
    name = "RenderPass";
    renderToScreen = false;

    constructor(
      readonly scene: Scene,
      readonly camera: PerspectiveCamera,
    ) {}

    dispose = vi.fn();
  }

  class FakeEffectComposer {
    disposeCount = 0;
    passes: Array<{ dispose: () => void; renderToScreen: boolean }> = [];
    render = vi.fn();
    setSize = vi.fn();

    constructor(
      readonly renderer: WebGLRenderer,
      readonly options: {
        frameBufferType: number;
        multisampling: number;
      },
    ) {
      postHarness.composers.push(this);
    }

    addPass(pass: { dispose: () => void; renderToScreen: boolean }): void {
      const previous = this.passes.at(-1);
      if (previous) previous.renderToScreen = false;
      pass.renderToScreen = true;
      this.passes.push(pass);
    }

    removePass(pass: { dispose: () => void; renderToScreen: boolean }): void {
      const index = this.passes.indexOf(pass);
      if (index < 0) return;
      this.passes.splice(index, 1);
      if (index === this.passes.length) {
        pass.renderToScreen = false;
        const last = this.passes.at(-1);
        if (last) last.renderToScreen = true;
      }
    }

    dispose(): void {
      this.disposeCount += 1;
      for (const pass of this.passes) pass.dispose();
      this.passes = [];
    }
  }

  return {
    BlendFunction,
    BloomEffect: FakeBloomEffect,
    Effect: FakeEffect,
    EffectAttribute,
    EffectComposer: FakeEffectComposer,
    EffectPass: FakeEffectPass,
    RenderPass: FakeRenderPass,
    ShaderPass: FakeShaderPass,
    SMAAEffect: FakeSMAAEffect,
    ToneMappingEffect: FakeToneMappingEffect,
    ToneMappingMode,
  };
});

interface FakeComposer {
  disposeCount: number;
  options: {
    frameBufferType: number;
    multisampling: number;
  };
  passes: FakePass[];
  render: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
}

interface FakeEffect {
  attributes: number;
  dispose: ReturnType<typeof vi.fn>;
  fragmentShader: string;
  name: string;
  options?: {
    blendFunction?: string;
  };
  toneMappingOptions?: {
    mode: string;
  };
  uniforms: Map<string, { value: unknown }>;
}

interface FakePass {
  effects?: FakeEffect[];
  enabled: boolean;
  name?: string;
  renderToScreen: boolean;
}

interface FakeBloom {
  bloomOptions: {
    blendFunction: string;
    levels: number;
    luminanceSmoothing: number;
    mipmapBlur: boolean;
    radius: number;
  };
  intensity: number;
  luminanceMaterial: {
    smoothing: number;
    threshold: number;
  };
  luminancePass: {
    setSize: ReturnType<typeof vi.fn>;
  };
  mipmapBlurPass: {
    radius: number;
    setSize: ReturnType<typeof vi.fn>;
  };
}

interface MockDisposable {
  dispose: ReturnType<typeof vi.fn>;
  name: string;
}

interface FakeN8AOPass extends FakePass {
  accumulationQuad: FakeQuad;
  accumulationRenderTarget: MockDisposable;
  autoDetectTransparency: boolean;
  bluenoise: MockDisposable;
  configuration: {
    aoRadius: number;
    aoSamples: number;
    denoiseSamples: number;
    distanceFalloff: number;
    halfRes: boolean;
    intensity: number;
    transparencyAware: boolean;
  };
  copyQuad: FakeQuad;
  depthCopyPass: FakeQuad;
  depthDownsampleQuad: FakeQuad;
  depthDownsampleTarget: MockDisposable;
  effectCompositerQuad: FakeQuad;
  effectShaderQuad: FakeQuad;
  height: number;
  inheritedDispose: ReturnType<typeof vi.fn>;
  neuralDenoiseMaterial: MockDisposable;
  outputTargetInternal: MockDisposable & { setSize: ReturnType<typeof vi.fn> };
  poissonBlurQuad: FakeQuad;
  qualityMode: string;
  qualityModeCalls: string[];
  readTargetInternal: MockDisposable;
  standardDenoiseMaterial: MockDisposable;
  transparencyRenderTargetDWFalse: MockDisposable;
  transparencyRenderTargetDWTrue: MockDisposable;
  setSize: ReturnType<typeof vi.fn>;
  width: number;
  writeTargetInternal: MockDisposable;
}

interface FakeShaderPass {
  fullscreenMaterial: {
    name: string;
    uniforms: Record<string, { value: unknown }>;
  };
}

interface FakeQuad {
  _mesh: {
    geometry: MockDisposable;
    material: MockDisposable;
  };
  material: MockDisposable;
}

const activePosts: GardenPost[] = [];

function latest<T>(entries: unknown[]): T {
  const entry = entries.at(-1);
  if (!entry) throw new Error("Expected a post-processing harness entry");
  return entry as T;
}

/**
 * The shipped perspective rig, reproduced from the abstract pose used by
 * `world-renderer.ts`, with the target at the viewport centre.
 */
const VIEWPORT = { x: 1600, y: 1000 };
const ISO_CAMERA = {
  offsetX: VIEWPORT.x / 2,
  offsetY: VIEWPORT.y / 2,
  zoom: 1,
};
/** `gardenKeyLightPose` returns a unit direction; the rig stands this far off. */
const LIGHT_DISTANCE = 120;

function makeGardenCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    CAMERA_FOV_DEG,
    VIEWPORT.x / VIEWPORT.y,
    1,
    600,
  );
  const pose = cameraPoseFromIso(ISO_CAMERA, VIEWPORT);
  const eye = cameraEye(pose);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(0, pose.targetHeight, 0);
  camera.updateProjectionMatrix();
  return camera;
}

function makePost(options: { withShadowLight?: boolean } = {}): {
  composer: FakeComposer;
  light: DirectionalLight | null;
  n8ao: FakeN8AOPass;
  post: GardenPost;
  renderer: WebGLRenderer;
  scene: Scene;
} {
  const renderer = {
    clear: vi.fn(),
    getContext: vi.fn(() => ({ getExtension: vi.fn(() => null) })),
    getDrawingBufferSize: vi.fn((target: { set: (width: number, height: number) => unknown }) => (
      target.set(1600, 1000)
    )),
    render: vi.fn(),
    setRenderTarget: vi.fn(),
  } as unknown as WebGLRenderer;
  const scene = new Scene();
  let light: DirectionalLight | null = null;
  if (options.withShadowLight) {
    light = new DirectionalLight();
    light.castShadow = true;
    scene.add(light, light.target);
    // three allocates `shadow.map` on the first shadow render, which needs a
    // GL context. The post chain only ever reads `map.depthTexture`, so a
    // stand-in is enough to exercise the gating without one.
    (light.shadow as unknown as { map: { depthTexture: Texture } }).map = {
      depthTexture: new ThreeTexture(),
    };
  }
  const post = createGardenPost(renderer, scene, makeGardenCamera());
  activePosts.push(post);
  return {
    composer: latest<FakeComposer>(postHarness.composers),
    light,
    n8ao: latest<FakeN8AOPass>(postHarness.n8aoPasses),
    post,
    renderer,
    scene,
  };
}

/**
 * The beats follow the true sun of the pinned sky day (test-setup: 26 Sep 2026,
 * 35° N, sunrise ≈ 07:06, sunset ≈ 18:54), so the hours below are read off that
 * day: plateau hours inside a beat, and the blue beat's single peak where the
 * sun sits at the golden→blue / blue→night seam.
 */
const DAWN_HOUR = 7.25;
const NOON_HOUR = 12;
const GOLDEN_HOUR = 18.5;
const NIGHT_HOUR = 23;

/** The first hour in (lo, hi] where `after` holds, by bisection. */
function crossingHour(after: (hour: number) => boolean, lo: number, hi: number): number {
  let low = lo;
  let high = hi;
  for (let step = 0; step < 60; step += 1) {
    const mid = (low + high) / 2;
    if (after(mid)) high = mid;
    else low = mid;
  }
  return high;
}

const BLUE_HOUR = crossingHour(
  (hour) => gardenSolarElevationAt(gardenSkyToday(), hour) * (180 / Math.PI)
    <= DAY_CYCLE_ELEVATION_EDGES.evening.blueNight[0],
  GOLDEN_HOUR,
  21,
);
/** Mid-crossfade from day into golden: both beats at one half. */
const DAY_GOLDEN_HOUR = crossingHour((hour) => dayCycleBeats(hour).golden >= 0.5, NOON_HOUR, GOLDEN_HOUR);

/** Point the rig at the pose the shipped arc gives for a wall-clock hour. */
function aimLightAtHour(light: DirectionalLight, hour: number): void {
  const pose = gardenKeyLightPose(hour, dayCyclePhase(hour));
  light.target.position.set(0, 0, 0);
  light.position.copy(pose.direction).multiplyScalar(LIGHT_DISTANCE);
}

function effectNamed(name: string): FakeEffect {
  const effect = postHarness.effects.findLast((candidate) => (
    (candidate as FakeEffect).name === name
  ));
  if (!effect) throw new Error(`Expected ${name} in post-processing harness`);
  return effect as FakeEffect;
}

/**
 * The god-ray raymarch runs in its own off-screen ShaderPass, so its uniforms
 * live on that pass's material rather than on the fused effect.
 */
function marchUniforms(): Record<string, { value: unknown }> {
  const pass = postHarness.shaderPasses.find((candidate) => (
    (candidate as FakeShaderPass).fullscreenMaterial.name === "GardenGodRayMarchMaterial"
  ));
  if (!pass) throw new Error("Expected the god-ray march pass in the harness");
  return (pass as FakeShaderPass).fullscreenMaterial.uniforms;
}

function colorUniform(effect: FakeEffect, name: string): [number, number, number] {
  const color = effect.uniforms.get(name)?.value as { b: number; g: number; r: number } | undefined;
  if (!color) throw new Error(`Expected ${name} color uniform`);
  return [color.r, color.g, color.b];
}

function numberUniform(effect: FakeEffect, name: string): number {
  const value = effect.uniforms.get(name)?.value;
  if (typeof value !== "number") throw new Error(`Expected ${name} number uniform`);
  return value;
}

function lutWeights(): number[] {
  const value = effectNamed("GardenLut").uniforms.get("lutWeights")?.value as
    | number[]
    | undefined;
  if (!value) throw new Error("Expected the GardenLut lutWeights uniform");
  return Array.from(value);
}

function lutTexture(name: "gardenNoise" | "lutStrip"): Texture {
  const value = effectNamed("GardenLut").uniforms.get(name)?.value as Texture | null | undefined;
  if (!value) throw new Error(`Expected the GardenLut ${name} texture`);
  return value;
}

beforeEach(() => {
  activePosts.length = 0;
  postHarness.blooms.length = 0;
  postHarness.composers.length = 0;
  postHarness.effects.length = 0;
  postHarness.n8aoPasses.length = 0;
  postHarness.shaderPasses.length = 0;
  postHarness.sharedN8AOGeometry.dispose.mockClear();
});

afterEach(() => {
  for (const post of activePosts) post.dispose();
});

describe("garden post-processing contracts", () => {
  it("builds the HDR pipeline in the intended order with one output conversion", () => {
    const { composer, n8ao, post } = makePost();
    const bloom = latest<FakeBloom>(postHarness.blooms);

    expect(composer.options).toEqual({
      frameBufferType: HalfFloatType,
      multisampling: 4,
    });
    expect([n8ao.width, n8ao.height]).toEqual([1600, 1000]);
    expect(n8ao.autoDetectTransparency).toBe(false);
    expect(n8ao.qualityMode).toBe("Performance");
    expect(n8ao.configuration).toMatchObject({
      aoRadius: 2,
      aoSamples: 8,
      denoiseSamples: 4,
      distanceFalloff: 1,
      halfRes: true,
      transparencyAware: false,
    });
    // Bloom adds practical-source radiance before the single output conversion.
    expect(bloom.bloomOptions.blendFunction).toBe("ADD");

    const passEffects = composer.passes.map((pass) => (
      pass.effects?.map((effect) => effect.name) ?? [pass.name]
    ));
    // W1.1: the authored cube is the LAST effect of the grade pass, not a
    // fourth pass. Its position after ToneMappingEffect is the contract — a LUT
    // ahead of the tone mapper would be graded on values it has no entries for.
    // W2.4: the god rays join the SAME pass, ahead of the grade, so the shafts
    // are graded and tone-mapped with the rest of the frame instead of painted
    // over it — and so they add no full-screen draw to the main chain.
    // W2.15: the sky-contact keyline leads that pass, so its ink is graded,
    // tone-mapped and antialiased like any other paint.
    expect(passEffects).toEqual([
      ["RenderPass"],
      [undefined],
      ["BloomEffect"],
      ["GardenKeyline", "GardenGodRays", "GardenGrade", "ToneMappingEffect", "GardenLut"],
      ["SMAAEffect"],
    ]);
    expect(post.getPassList()).toEqual([
      "render",
      "n8ao",
      "bloom",
      "keyline",
      // This harness has no shadow-casting light, so no god rays.
      "grade",
      "output",
      "lut",
      "smaa",
    ]);

    const toneEffects = postHarness.effects.filter((candidate) => (
      (candidate as FakeEffect).name === "ToneMappingEffect"
    )) as FakeEffect[];
    expect(toneEffects).toHaveLength(1);
    // B5 (2026-09-05): the mode follows the ONE exported switch — the same
    // constant world-renderer feeds renderer.toneMapping — so the A/B cannot
    // leave the post chain and the renderer on different curves.
    expect(toneEffects[0]?.toneMappingOptions).toEqual({
      mode: GARDEN_TONE_MAPPING === "neutral" ? "NEUTRAL" : "AGX",
    });
    expect(composer.passes.at(-1)?.renderToScreen).toBe(true);
    expect(composer.passes.slice(0, -1).every((pass) => !pass.renderToScreen)).toBe(true);
  });

  it("applies the authored cube and the dither on the display signal, in one fused pass", () => {
    makePost();
    const lut = effectNamed("GardenLut");

    // The sRGB round trip is what makes "post-tone-map" mean "in display
    // space": the composer's intermediate buffer is linear half-float, so the
    // effect has to encode, look up, dither, and decode.
    expect(lut.fragmentShader).toMatch(/gardenLinearToDisplay\(clamp\(inputColor\.rgb/);
    expect(lut.fragmentShader).toMatch(/outputColor = vec4\(gardenDisplayToLinear/);
    // Manual trilinear: the blue axis is lerped by hand between two slices so
    // hardware filtering never crosses a slice or a phase-band boundary.
    expect(lut.fragmentShader).toMatch(/mix\(nearSlice, farSlice, slice - low\)/);
  });

  it("loads the LUT and the garden-noise pack as raw look-up data", () => {
    makePost();
    const strip = lutTexture("lutStrip");
    const noise = lutTexture("gardenNoise");

    for (const texture of [strip, noise]) {
      // A transfer function on read, a mipmap chain, or a Y flip each silently
      // corrupts a packed cube; none of them can be caught by looking at it.
      expect(texture.colorSpace).toBe(NoColorSpace);
      expect(texture.generateMipmaps).toBe(false);
      expect(texture.flipY).toBe(false);
    }
    // The cube interpolates (that is the point) and clamps at the cube edges.
    // The pack tiles the frame; its dither is fetched on texel centres, where
    // linear filtering returns the mask value exactly, and its smooth channels
    // need the filtering.
    expect([strip.minFilter, strip.magFilter]).toEqual([LinearFilter, LinearFilter]);
    expect([strip.wrapS, strip.wrapT]).toEqual([ClampToEdgeWrapping, ClampToEdgeWrapping]);
    expect([noise.minFilter, noise.magFilter]).toEqual([LinearFilter, LinearFilter]);
    expect([noise.wrapS, noise.wrapT]).toEqual([RepeatWrapping, RepeatWrapping]);
  });

  it("selects all five LUT bands and crossfades adjacent beats without changing exposure", () => {
    const { post } = makePost();
    const expectWeights = (expected: readonly number[]): void => {
      lutWeights().forEach((weight, band) => expect(weight, `band ${band}`).toBeCloseTo(expected[band]!, 6));
    };
    const bands: [number, number][] = [[DAWN_HOUR, 0], [NOON_HOUR, 1], [GOLDEN_HOUR, 2], [BLUE_HOUR, 3], [0, 4]];
    for (const [hour, band] of bands) {
      post.setGrade(hour);
      expectWeights(Array.from({ length: 5 }, (_, index) => Number(index === band)));
    }
    for (const hour of [DAY_GOLDEN_HOUR, DAY_GOLDEN_HOUR + 24, DAY_GOLDEN_HOUR - 24]) {
      post.setGrade(hour);
      expectWeights([0, 0.5, 0.5, 0, 0]);
    }
  });

  it("keeps the LUT on at every tier and inert until its texture decodes", () => {
    const { post } = makePost();
    const lut = effectNamed("GardenLut");

    // Nothing is graded through an undecoded texture: the effect passes the
    // tone-mapped frame straight through until the PNG arrives.
    expect(numberUniform(lut, "lutMix")).toBe(0);
    expect(numberUniform(lut, "ditherMix")).toBe(0);

    // Tier invariance: no tier may change hue, so every tier the scheduler can
    // reach still lists the grade/tone-map/LUT stage.
    post.setBloomEnabled(false);
    post.setAOTierWeight(0);
    expect(post.getPassList()).toEqual(["render", "keyline", "grade", "output", "lut", "smaa"]);
    post.setAOZoomDetail(0);
    expect(post.getPassList()).toContain("lut");
  });

  it("inks the sky contact at every beat and keeps it off the fogged far field", () => {
    const { post, scene } = makePost();
    const keyline = effectNamed("GardenKeyline");
    const ink = (hour: number): number => {
      post.setGrade(hour);
      return numberUniform(keyline, "keylineInk");
    };

    // O15 rung 3: a line at EVERY beat, heaviest where the sky is closest in
    // value to the silhouettes (golden, blue) and lightest by day.
    const noon = ink(NOON_HOUR);
    expect(noon).toBeGreaterThan(0);
    for (const hour of [DAWN_HOUR, GOLDEN_HOUR, BLUE_HOUR, NIGHT_HOUR]) expect(ink(hour)).toBeGreaterThan(noon);
    // A crossfade between beats never drops the line out.
    for (let hour = 0; hour < 24; hour += 0.25) expect(ink(hour)).toBeGreaterThan(0);

    // The reach follows the fog the sky re-fits each frame, and ends well short
    // of the fog's far edge, so the sea horizon and far fleet stay unlined.
    scene.fog = new Fog(0x000000, 100, 300);
    post.render(1 / 60);
    const fade = keyline.uniforms.get("keylineFade")?.value as { x: number; y: number };
    expect(fade.x).toBeGreaterThan(100);
    expect(fade.y).toBeGreaterThan(fade.x);
    expect(fade.y).toBeLessThan(300);
    (scene.fog as Fog).near = 200;
    (scene.fog as Fog).far = 400;
    post.render(1 / 60);
    expect(fade.x).toBeGreaterThan(200);
    expect(fade.y).toBeLessThan(400);
  });

  it("fades the authored cube in rather than snapping the frame when it decodes", () => {
    const images: Element[] = [];
    const createElement = document.createElementNS.bind(document);
    vi.spyOn(document, "createElementNS").mockImplementation(((namespace: string, name: string) => {
      const element = createElement(namespace, name) as Element;
      images.push(element);
      return element;
    }) as typeof document.createElementNS);

    const { post } = makePost();
    const lut = effectNamed("GardenLut");
    // Both textures are same-origin and cache-busted by content hash, which is
    // what `npm run check:garden-luts` verifies against the generated pixels.
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      expect.stringMatching(/^\/pharosville\/textures\/garden-grade-lut\.png\?v=[0-9a-f]{12}$/),
      expect.stringMatching(/^\/pharosville\/textures\/garden-noise-pack\.png\?v=[0-9a-f]{12}$/),
    ]);

    for (const image of images) image.dispatchEvent(new Event("load"));
    // Still nothing this frame: the fade is driven by the render clock.
    expect(numberUniform(lut, "lutMix")).toBe(0);

    post.render(1 / 60);
    const firstStep = numberUniform(lut, "lutMix");
    expect(firstStep).toBeGreaterThan(0);
    expect(firstStep).toBeLessThan(0.2);
    expect(numberUniform(lut, "ditherMix")).toBeCloseTo(firstStep);

    // 95 % of the way inside half a second, fully settled inside 1.5 s, and
    // then it stays settled rather than creeping.
    for (let frame = 0; frame < 30; frame += 1) post.render(1 / 60);
    expect(numberUniform(lut, "lutMix")).toBeGreaterThan(0.9);
    for (let frame = 0; frame < 60; frame += 1) post.render(1 / 60);
    expect(numberUniform(lut, "lutMix")).toBe(1);
    expect(numberUniform(lut, "ditherMix")).toBe(1);
    post.render(1 / 60);
    expect(numberUniform(lut, "lutMix")).toBe(1);

    vi.restoreAllMocks();
  });

  it("keeps noon neutral and night dark without opening bloom onto non-emissives", () => {
    const { post } = makePost();
    const bloom = latest<FakeBloom>(postHarness.blooms);
    const grade = effectNamed("GardenGrade");

    post.setGrade(12);
    expect(colorUniform(grade, "gain")).toEqual([1, 1, 1]);
    expect(colorUniform(grade, "gamma")).toEqual([1, 1, 1]);
    expect(colorUniform(grade, "shadowTint")).toEqual([1, 1, 1]);
    expect(colorUniform(grade, "lift")).toEqual([0, 0, 0]);

    for (const hour of [0, 6, 12, 16.75, 18, 19]) {
      for (const storm of [0, 1]) {
        post.setGrade(hour, storm);
        expect(colorUniform(grade, "lift")).toEqual([0, 0, 0]);
        expect(bloom.luminanceMaterial.threshold).toBe(GARDEN_BLOOM_PRACTICAL_THRESHOLD);
        // The brightest non-emissive cloth is capped at 2.2 HDR.
        expect(bloom.luminanceMaterial.threshold).toBeGreaterThan(2.2);
      }
    }
  });

  it("lets lightning widen practical glow without lowering its threshold or lifting darks", () => {
    const { post } = makePost();
    const bloom = latest<FakeBloom>(postHarness.blooms);
    const grade = effectNamed("GardenGrade");
    post.setGrade(18);
    const clear = bloom.intensity;
    post.setGrade(18, 0.5);
    const storm = bloom.intensity;
    expect(storm).toBeGreaterThan(clear);
    post.setGrade(18, 0.5, 0.65);
    expect(bloom.intensity).toBeGreaterThan(storm);
    expect(numberUniform(grade, "flash")).toBe(0.65);
    post.setGrade(18, 0.5, 1);
    const peak = bloom.intensity;
    post.setGrade(18, 0.5, 1.4);
    expect(bloom.intensity).toBe(peak);
    expect(numberUniform(grade, "flash")).toBe(1.4);
    expect(colorUniform(grade, "lift")).toEqual([0, 0, 0]);
    expect(bloom.luminanceMaterial.threshold).toBe(GARDEN_BLOOM_PRACTICAL_THRESHOLD);
  });

  it("applies winter as a small desaturation on top of the existing phase grade", () => {
    const { post } = makePost();
    const grade = effectNamed("GardenGrade");
    post.setGrade(12, 0, 0, 0);
    const summer = numberUniform(grade, "saturation");
    post.setGrade(12, 0, 0, 1);
    expect(numberUniform(grade, "saturation")).toBeCloseTo(summer * 0.92, 8);
  });

  it("multiplies AO quality, zoom, and continuous tier weights without recompiling quality", () => {
    const { n8ao, post } = makePost();

    expect(n8ao.enabled).toBe(true);
    expect(n8ao.configuration.intensity).toBe(5);
    expect(n8ao.configuration.aoRadius).toBe(2);
    expect(n8ao.qualityModeCalls).toEqual(["Performance"]);

    post.setAOQuality("balanced");
    expect(n8ao.qualityMode).toBe("Performance");
    expect(n8ao.qualityModeCalls).toEqual(["Performance"]);
    expect(n8ao.configuration.intensity).toBeCloseTo(4.25);
    expect(n8ao.configuration.aoRadius).toBeCloseTo(1.4);

    post.setAOZoomDetail(0.5);
    expect(n8ao.enabled).toBe(true);
    expect(n8ao.configuration.intensity).toBeCloseTo(2.125);

    post.setAOTierWeight(0.4);
    expect(n8ao.enabled).toBe(true);
    expect(n8ao.configuration.intensity).toBeCloseTo(0.85);
    expect(n8ao.qualityModeCalls).toEqual(["Performance"]);

    post.setGrade(12);
    expect(n8ao.configuration.intensity).toBeCloseTo(0.51);
    post.setGrade(0);
    expect(n8ao.configuration.intensity).toBeCloseTo(0.85);

    post.setAOTierWeight(2);
    expect(n8ao.configuration.intensity).toBeCloseTo(2.125);

    post.setAOTierWeight(0);
    expect(n8ao.enabled).toBe(false);
    expect(n8ao.configuration.intensity).toBe(0);
    expect(post.getPassList()).not.toContain("n8ao");

    post.setAOTierWeight(1);
    post.setAOZoomDetail(0);
    expect(n8ao.enabled).toBe(false);
    expect(n8ao.configuration.intensity).toBe(0);
    expect(post.getPassList()).not.toContain("n8ao");

    post.setAOZoomDetail(0.25);
    post.setAOEnabled(false);
    expect(n8ao.enabled).toBe(false);
    post.setAOEnabled(true);
    expect(n8ao.enabled).toBe(true);
    expect(n8ao.qualityModeCalls).toEqual(["Performance"]);

    post.setEnabled(false);
    expect(n8ao.enabled).toBe(false);
    expect(post.getPassList()).toEqual([]);
    post.setEnabled(true);
    expect(n8ao.enabled).toBe(true);
  });

  it("releases only N8AO texture resources at settled overview and reuses the pass", () => {
    const { composer, n8ao, post } = makePost();
    const textureKeys = [
      "accumulationRenderTarget",
      "bluenoise",
      "depthDownsampleTarget",
      "outputTargetInternal",
      "readTargetInternal",
      "writeTargetInternal",
    ] as const;

    post.render(1 / 60);
    post.setAOZoomDetail(0);
    for (const key of textureKeys) {
      expect(n8ao[key].dispose, key).toHaveBeenCalledOnce();
    }
    expect(n8ao.standardDenoiseMaterial.dispose).not.toHaveBeenCalled();
    expect(postHarness.sharedN8AOGeometry.dispose).not.toHaveBeenCalled();

    post.setAOZoomDetail(0.25);
    post.render(1 / 60);
    expect(composer.render).toHaveBeenCalledTimes(2);
    expect(n8ao.enabled).toBe(true);

    post.setAOZoomDetail(0);
    for (const key of textureKeys) {
      expect(n8ao[key].dispose, key).toHaveBeenCalledTimes(2);
    }
  });

  it("eases the idle profile across AO and god rays without changing colour or passes", () => {
    const { composer, light, n8ao, post } = makePost({ withShadowLight: true });
    const godRays = effectNamed("GardenGodRays");
    const grade = effectNamed("GardenGrade");
    if (!light) throw new Error("Expected a shadow-casting light");

    aimLightAtHour(light, GOLDEN_HOUR);
    post.setGrade(GOLDEN_HOUR);
    post.render(1 / 60);
    const awakeAOIntensity = n8ao.configuration.intensity;
    const performanceAOIntensity = awakeAOIntensity * 0.85;

    const passes = composer.passes;
    const effects = passes.map((pass) => pass.effects);
    const colourBefore = {
      saturation: numberUniform(grade, "saturation"),
      vignette: numberUniform(grade, "vignette"),
      flash: numberUniform(grade, "flash"),
    };

    // A full-tier idle frame does not toggle a load tier. The dedicated idle
    // weight eases the existing uniform scales toward the Performance profile.
    post.setIdleProfile?.(true);
    post.render(1 / 60);
    expect(n8ao.configuration.intensity).toBeLessThan(awakeAOIntensity);
    expect(n8ao.configuration.intensity).toBeGreaterThan(performanceAOIntensity);
    expect(n8ao.configuration.aoRadius).toBeLessThan(2);
    expect(n8ao.configuration.aoRadius).toBeGreaterThan(1.4);
    expect(numberUniform(godRays, "rayWeight")).toBeLessThan(0.02);
    expect(numberUniform(godRays, "rayWeight")).toBeGreaterThan(0);

    for (let frame = 0; frame < 90; frame += 1) post.render(1 / 60);
    expect(n8ao.configuration.intensity).toBeCloseTo(performanceAOIntensity);
    expect(n8ao.configuration.aoRadius).toBeCloseTo(1.4);
    expect(numberUniform(godRays, "rayWeight")).toBe(0);
    expect(post.getPassList()).not.toContain("godrays");
    expect(composer.passes).toBe(passes);
    expect(composer.passes.map((pass) => pass.effects)).toEqual(effects);
    expect(numberUniform(grade, "saturation")).toBe(colourBefore.saturation);
    expect(numberUniform(grade, "vignette")).toBe(colourBefore.vignette);
    expect(numberUniform(grade, "flash")).toBe(colourBefore.flash);

    // Wake takes the same curve in reverse; neither contribution pops back.
    post.setIdleProfile?.(false);
    post.render(1 / 60);
    expect(n8ao.configuration.intensity).toBeGreaterThan(performanceAOIntensity);
    expect(n8ao.configuration.intensity).toBeLessThan(awakeAOIntensity);
    expect(numberUniform(godRays, "rayWeight")).toBeGreaterThan(0);
    expect(numberUniform(godRays, "rayWeight")).toBeLessThan(0.02);
    for (let frame = 0; frame < 90; frame += 1) post.render(1 / 60);
    expect(n8ao.configuration.intensity).toBe(awakeAOIntensity);
    expect(n8ao.configuration.aoRadius).toBe(2);
    expect(numberUniform(godRays, "rayWeight")).toBeCloseTo(0.02, 3);

    // A reduced-motion repaint is a complete static composition even if it
    // arrives directly after an idle frame; it does not wait out a fade.
    post.setIdleProfile?.(true);
    for (let frame = 0; frame < 90; frame += 1) post.render(1 / 60);
    post.setIdleProfile?.(false, true);
    post.render(0);
    expect(n8ao.configuration.intensity).toBe(awakeAOIntensity);
    expect(n8ao.configuration.aoRadius).toBe(2);
    expect(numberUniform(godRays, "rayWeight")).toBeCloseTo(0.02, 3);
  });

  it("never changes colour with the load tier", () => {
    const { post } = makePost();
    const grade = effectNamed("GardenGrade");
    const saturation = numberUniform(grade, "saturation");
    const vignette = numberUniform(grade, "vignette");
    post.setAOQuality("balanced");
    post.setAOTierWeight(0);
    expect(numberUniform(grade, "saturation")).toBe(saturation);
    expect(numberUniform(grade, "vignette")).toBe(vignette);
  });

  it("opens rays only at dawn and golden hour, with smooth boundary fades", () => {
    expect(gardenGodRayLowSunGate(DAWN_HOUR)).toBe(1);
    expect(gardenGodRayLowSunGate(GOLDEN_HOUR)).toBe(1);
    for (const hour of [0, NOON_HOUR, BLUE_HOUR, 22]) {
      expect(gardenGodRayLowSunGate(hour)).toBe(0);
    }
    // Four fades (night→dawn, dawn→day, day→golden, golden→blue), each a
    // minute-by-minute ramp through one half rather than a step.
    let halfCrossings = 0;
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      const gate = gardenGodRayLowSunGate(minute / 60);
      const next = gardenGodRayLowSunGate((minute + 1) / 60);
      expect(Math.abs(next - gate)).toBeLessThan(0.05);
      if ((gate - 0.5) * (next - 0.5) < 0) halfCrossings += 1;
    }
    expect(halfCrossings).toBe(4);
  });

  it("renders dawn and golden rays but skips day, blue hour and night", () => {
    const { light, post } = makePost({ withShadowLight: true });
    const godRays = effectNamed("GardenGodRays");
    if (!light) throw new Error("Expected a shadow-casting light");
    const rayWeightAt = (hour: number): number => {
      aimLightAtHour(light, hour);
      post.setGrade(hour);
      post.render(1 / 60);
      return numberUniform(godRays, "rayWeight");
    };
    const golden = rayWeightAt(GOLDEN_HOUR);
    const dawn = rayWeightAt(DAWN_HOUR);
    expect(golden).toBeGreaterThan(0);
    expect(dawn).toBeGreaterThan(0);
    expect(dawn).toBeLessThan(golden);
    expect(rayWeightAt(DAY_GOLDEN_HOUR)).toBeCloseTo(golden * 0.5);
    for (const hour of [NOON_HOUR, BLUE_HOUR, 22, 2]) {
      expect(rayWeightAt(hour)).toBe(0);
      expect(post.getPassList()).not.toContain("godrays");
    }
  });

  it("colours the shafts from the hour and never from the tier", () => {
    const { light, post } = makePost({ withShadowLight: true });
    if (!light) throw new Error("Expected a shadow-casting light");
    const march = marchUniforms();

    // Golden and dawn own distinct warm and pale shaft colours.
    post.setGrade(GOLDEN_HOUR);
    const evening = [...(march.rayColor!.value as { toArray: () => number[] }).toArray()];
    expect(evening[0]).toBeCloseTo(1);
    expect(evening[2]).toBeCloseTo(0.3);
    post.setGrade(DAWN_HOUR);
    const morning = [...(march.rayColor!.value as { toArray: () => number[] }).toArray()];
    expect(morning[2]).toBeGreaterThan(evening[2]!);
    expect(morning[0]).toBeLessThan(evening[0]!);

    // Tier may scale the shafts to nothing; it may never touch their hue.
    post.setAOQuality("balanced");
    post.setAOTierWeight(0.2);
    post.render(1 / 60);
    const afterTier = [...(march.rayColor!.value as { toArray: () => number[] }).toArray()];
    expect(afterTier).toEqual(morning);
  });

  it("eases the god rays out below full tier instead of touching the pass list", () => {
    const { light, post } = makePost({ withShadowLight: true });
    if (!light) throw new Error("Expected a shadow-casting light");
    const godRays = effectNamed("GardenGodRays");
    aimLightAtHour(light, GOLDEN_HOUR);
    post.setGrade(GOLDEN_HOUR);
    post.render(1 / 60);
    expect(numberUniform(godRays, "rayWeight")).toBeCloseTo(0.02, 3);
    expect(post.getPassList()).toContain("godrays");

    // The tier drops to balanced. The pass stays registered; only the weight
    // moves, and it moves over ~180 ms rather than in one frame.
    post.setAOQuality("balanced");
    post.render(1 / 60);
    const firstStep = numberUniform(godRays, "rayWeight");
    expect(firstStep).toBeLessThan(0.02);
    expect(firstStep).toBeGreaterThan(0.014);
    // One time constant (the AO fade's 180 ms) takes it to 1/e of the way; it
    // then settles exactly on zero, rather than creeping, once the remaining
    // ease is inside a thousandth — ~1.3 s in.
    for (let frame = 0; frame < 10; frame += 1) post.render(1 / 60);
    const oneTimeConstant = numberUniform(godRays, "rayWeight");
    expect(oneTimeConstant).toBeLessThan(0.02 * 0.42);
    expect(oneTimeConstant).toBeGreaterThan(0.02 * 0.3);
    for (let frame = 0; frame < 90; frame += 1) post.render(1 / 60);
    expect(numberUniform(godRays, "rayWeight")).toBe(0);
    // Still one pass, still the same effect chain — the shed is a uniform.
    const composer = latest<FakeComposer>(postHarness.composers);
    expect(composer.passes.at(-2)?.effects?.map((effect) => effect.name)).toEqual([
      "GardenKeyline",
      "GardenGodRays",
      "GardenGrade",
      "ToneMappingEffect",
      "GardenLut",
    ]);
    expect(post.getPassList()).not.toContain("godrays");
  });

  it("keeps the shafts dark until the world has a shadow map to agree with", () => {
    const { light, post } = makePost({ withShadowLight: true });
    const godRays = effectNamed("GardenGodRays");
    if (!light) throw new Error("Expected a shadow-casting light");
    aimLightAtHour(light, 18);
    post.setGrade(18);

    // Before the first shadow render (and at any tier that sheds shadows
    // outright) there is nothing to break the shafts against, so nothing is
    // drawn rather than an unbroken wash.
    (light.shadow as unknown as { map: null }).map = null;
    post.render(1 / 60);
    expect(numberUniform(godRays, "rayWeight")).toBe(0);
    expect(post.getPassList()).not.toContain("godrays");

    (light.shadow as unknown as { map: { depthTexture: Texture } }).map = {
      depthTexture: new ThreeTexture(),
    };
    post.render(1 / 60);
    expect(numberUniform(godRays, "rayWeight")).toBeGreaterThan(0);
    // The march reads the SAME matrix the world's receiving materials do, so
    // a shaft cannot disagree with the shadow it is cast through.
    expect(marchUniforms().shadowMatrix!.value).toBe(light.shadow.matrix);
    expect(marchUniforms().shadowMap!.value).toBe(light.shadow.map?.depthTexture);
  });

  it("sizes AO, bloom and god rays in CSS pixels while the composite stays at device resolution", () => {
    const { composer, n8ao, post } = makePost();
    const bloom = latest<FakeBloom>(postHarness.blooms);
    const godRays = effectNamed("GardenGodRays") as unknown as { rayTarget: { height: number; width: number } };

    // The harness drawing buffer is 1600×1000: an 800×500 CSS canvas at DPR 2.
    post.setSize(800, 500, 2);

    expect(composer.setSize).toHaveBeenLastCalledWith(800, 500);
    expect(n8ao.setSize).toHaveBeenLastCalledWith(800, 500);
    // The AO composite writes the whole frame; a CSS-sized output would
    // resample every pixel of it.
    expect(n8ao.outputTargetInternal.setSize).toHaveBeenLastCalledWith(1600, 1000);
    expect(bloom.luminancePass.setSize).toHaveBeenLastCalledWith(800, 500);
    expect(bloom.mipmapBlurPass.setSize).toHaveBeenLastCalledWith(800, 500);
    expect([godRays.rayTarget.width, godRays.rayTarget.height]).toEqual([400, 250]);
  });

  it("runs SMAA below DPR 1.75 only and hands the screen to the grade pass above it", () => {
    const { composer, post } = makePost();
    const smaaPass = composer.passes.at(-1);
    const gradePass = composer.passes.at(-2);

    post.setSize(800, 500, 2);
    expect(post.getPassList()).not.toContain("smaa");
    expect(composer.passes.at(-1)).toBe(gradePass);
    expect(gradePass?.renderToScreen).toBe(true);

    // A governor step below the threshold brings it back as the final pass.
    post.setSize(800, 500, 1.625);
    expect(post.getPassList().at(-1)).toBe("smaa");
    expect(composer.passes.at(-1)).toBe(smaaPass);
    expect(composer.passes.slice(0, -1).every((pass) => !pass.renderToScreen)).toBe(true);

    // Parked again, it is outside the composer's list but still disposed.
    post.setSize(800, 500, 2);
    post.dispose();
    expect(effectNamed("SMAAEffect").dispose).toHaveBeenCalled();
  });

  it("uses the composer when enabled and an explicitly cleared direct render otherwise", () => {
    const { composer, post, renderer } = makePost();

    post.render(1 / 60);
    expect(composer.render).toHaveBeenCalledWith(1 / 60);
    expect(renderer.render).not.toHaveBeenCalled();

    post.setEnabled(false);
    post.render(1 / 30);
    expect(renderer.setRenderTarget).toHaveBeenCalledWith(null);
    expect(renderer.clear).toHaveBeenCalledOnce();
    expect(renderer.render).toHaveBeenCalledOnce();
  });

  it("disposes all N8AO-owned internals once and keeps shared geometry until the last owner", () => {
    const first = makePost();
    const second = makePost();
    const directKeys = [
      "accumulationRenderTarget",
      "bluenoise",
      "depthDownsampleTarget",
      "neuralDenoiseMaterial",
      "outputTargetInternal",
      "readTargetInternal",
      "standardDenoiseMaterial",
      "transparencyRenderTargetDWFalse",
      "transparencyRenderTargetDWTrue",
      "writeTargetInternal",
    ] as const;
    const quadKeys = [
      "accumulationQuad",
      "copyQuad",
      "depthCopyPass",
      "depthDownsampleQuad",
      "effectCompositerQuad",
      "effectShaderQuad",
      "poissonBlurQuad",
    ] as const;

    first.post.dispose();
    expect(first.composer.disposeCount).toBe(1);
    expect(first.n8ao.inheritedDispose).not.toHaveBeenCalled();
    for (const key of directKeys) {
      expect(first.n8ao[key].dispose, key).toHaveBeenCalledOnce();
    }
    const firstQuadMaterials = new Set(quadKeys.map((key) => first.n8ao[key].material));
    for (const material of firstQuadMaterials) {
      expect(material.dispose, material.name).toHaveBeenCalledOnce();
    }
    expect(postHarness.sharedN8AOGeometry.dispose).not.toHaveBeenCalled();

    first.post.dispose();
    expect(first.composer.disposeCount).toBe(2);
    for (const key of directKeys) {
      expect(first.n8ao[key].dispose, key).toHaveBeenCalledOnce();
    }

    second.post.dispose();
    expect(postHarness.sharedN8AOGeometry.dispose).toHaveBeenCalledOnce();
  });
});
