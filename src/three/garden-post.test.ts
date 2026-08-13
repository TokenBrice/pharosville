// @vitest-environment jsdom
//
// The post chain owns two of its own textures (the phase LUT strip and the
// blue-noise dither mask) and loads them through three's TextureLoader, which
// needs a document. Under the default `node` environment the loader is skipped
// by design and half the W1.1/W1.2 contract would be untestable.
import {
  ClampToEdgeWrapping,
  DirectionalLight,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  NoColorSpace,
  OrthographicCamera,
  RepeatWrapping,
  Scene,
  Texture as ThreeTexture,
  type Texture,
  type WebGLRenderer,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayCyclePhase } from "./garden-day-cycle";
import { createGardenPost, gardenGodRayLowSunGate, type GardenPost } from "./garden-post";
import { gardenKeyLightPose } from "./garden-sun";

const postHarness = vi.hoisted(() => {
  const makeDisposable = (name: string) => ({
    dispose: vi.fn(),
    name,
  });
  return {
    blooms: [] as unknown[],
    composers: [] as unknown[],
    effects: [] as unknown[],
    makeDisposable,
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
    depthDownsampleQuad = quad("depth-downsample");
    depthDownsampleTarget = postHarness.makeDisposable("depth-downsample-target");
    effectCompositerQuad = quad("compositer");
    effectShaderQuad = quad("ao");
    enabled = true;
    inheritedDispose = vi.fn();
    neuralDenoiseMaterial = postHarness.makeDisposable("neural-denoise-material");
    outputTargetInternal = postHarness.makeDisposable("output-target");
    poissonBlurQuad: ReturnType<typeof quad>;
    qualityMode = "";
    qualityModeCalls: string[] = [];
    readTargetInternal = postHarness.makeDisposable("read-target");
    standardDenoiseMaterial = postHarness.makeDisposable("standard-denoise-material");
    transparencyRenderTargetDWFalse = postHarness.makeDisposable("transparency-false-target");
    transparencyRenderTargetDWTrue = postHarness.makeDisposable("transparency-true-target");
    writeTargetInternal = postHarness.makeDisposable("write-target");

    constructor(
      readonly scene: Scene,
      readonly camera: OrthographicCamera,
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
  const ToneMappingMode = { AGX: "AGX" };

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
    mipmapBlurPass: { radius: number };

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
      this.mipmapBlurPass = { radius: bloomOptions.radius };
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
      readonly camera: OrthographicCamera,
      ...effects: FakeEffect[]
    ) {
      this.effects = effects;
    }

    readonly effects: readonly FakeEffect[];

    dispose(): void {
      for (const effect of this.effects) effect.dispose();
    }
  }

  // W2.3/W2.4 own off-screen helper passes (the half-res blur chain and the
  // shadow-map raymarch). They never enter the composer — the hero effects
  // drive them from `update()` — so the harness only has to record them.
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
      readonly camera: OrthographicCamera,
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
  mipmapBlurPass: {
    radius: number;
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
  outputTargetInternal: MockDisposable;
  poissonBlurQuad: FakeQuad;
  qualityMode: string;
  qualityModeCalls: string[];
  readTargetInternal: MockDisposable;
  standardDenoiseMaterial: MockDisposable;
  transparencyRenderTargetDWFalse: MockDisposable;
  transparencyRenderTargetDWTrue: MockDisposable;
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
 * The shipped vantage, reproduced: `world-renderer.ts` parks the camera at a
 * fixed 110-unit offset raked 30° down (`CAMERA_DISTANCE`, `updateCamera`) and
 * sizes the frustum from `gardenCameraViewHeight`, which is 62.5 units at the
 * 1000 px preview height. W2.3's focus band is derived from exactly this pose,
 * so a default `new OrthographicCamera()` would test a band that never ships.
 */
const CAMERA_DISTANCE = 110;
const VIEW_HEIGHT = 62.5;
/** `gardenKeyLightPose` returns a unit direction; the rig stands this far off. */
const LIGHT_DISTANCE = 120;

function makeGardenCamera(): OrthographicCamera {
  const viewWidth = VIEW_HEIGHT * 1.6;
  const camera = new OrthographicCamera(
    -viewWidth / 2,
    viewWidth / 2,
    VIEW_HEIGHT / 2,
    -VIEW_HEIGHT / 2,
    0.1,
    500,
  );
  camera.position.set(CAMERA_DISTANCE, CAMERA_DISTANCE * Math.sqrt(2 / 3), CAMERA_DISTANCE);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return camera;
}

function makePost(options: { withShadowLight?: boolean } = {}): {
  composer: FakeComposer;
  light: DirectionalLight | null;
  n8ao: FakeN8AOPass;
  post: GardenPost;
  renderer: WebGLRenderer;
} {
  const renderer = {
    clear: vi.fn(),
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
  };
}

/** Point the rig at the pose the shipped arc gives for a wall-clock hour. */
function aimLightAtHour(light: DirectionalLight, hour: number): void {
  const pose = gardenKeyLightPose(hour, dayCyclePhase(hour));
  light.target.position.set(0, 0, 0);
  light.position.copy(pose.direction).multiplyScalar(LIGHT_DISTANCE);
}

function effectNamed(name: string): FakeEffect {
  const effect = postHarness.effects.find((candidate) => (
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

function lutWeights(): [number, number, number] {
  const value = effectNamed("GardenLut").uniforms.get("lutWeights")?.value as
    | { x: number; y: number; z: number }
    | undefined;
  if (!value) throw new Error("Expected the GardenLut lutWeights uniform");
  return [value.x, value.y, value.z];
}

function lutTexture(name: "ditherNoise" | "lutStrip"): Texture {
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
    // Constructed with the NIGHT row, which is the base of the day-cycle blend
    // — the same convention the grade and AO values follow.
    expect(bloom.bloomOptions).toMatchObject({
      blendFunction: "ADD",
      levels: 5,
      luminanceSmoothing: 0.45,
      mipmapBlur: true,
      radius: 0.72,
    });

    const passEffects = composer.passes.map((pass) => (
      pass.effects?.map((effect) => effect.name) ?? [pass.name]
    ));
    // W1.1: the authored cube is the LAST effect of the grade pass, not a
    // fourth pass. Its position after ToneMappingEffect is the contract — a LUT
    // ahead of AgX would be graded on values it has no entries for.
    // W2.3/W2.4: the two hero atmosphere stages join the SAME pass, ahead of
    // the grade, so the softened pixels and the shafts are graded and
    // tone-mapped with the rest of the frame instead of painted over it — and
    // so neither adds a full-screen draw to the main chain.
    expect(passEffects).toEqual([
      ["RenderPass"],
      [undefined],
      ["BloomEffect"],
      ["GardenTiltShift", "GardenGodRays", "GardenGrade", "ToneMappingEffect", "GardenLut"],
      ["SMAAEffect"],
    ]);
    expect(post.getPassList()).toEqual([
      "render",
      "n8ao",
      "bloom",
      // No "godrays": the harness scene has no shadow-casting light, and the
      // construction blend is night, where the window is shut either way.
      "dof",
      "grade",
      "output",
      "lut",
      "smaa",
    ]);
    // Both hero stages read the depth texture N8AO already forces the composer
    // to carry; neither may drag a convolution attribute into the fused pass,
    // which would make the merge illegal.
    expect(effectNamed("GardenTiltShift").attributes).toBe(1);
    expect(effectNamed("GardenGodRays").attributes).toBe(1);

    const toneEffects = postHarness.effects.filter((candidate) => (
      (candidate as FakeEffect).name === "ToneMappingEffect"
    )) as FakeEffect[];
    expect(toneEffects).toHaveLength(1);
    expect(toneEffects[0]?.toneMappingOptions).toEqual({ mode: "AGX" });
    expect(composer.passes.at(-1)?.renderToScreen).toBe(true);
    expect(composer.passes.slice(0, -1).every((pass) => !pass.renderToScreen)).toBe(true);
    expect(effectNamed("SMAAEffect").attributes).toBe(2);
    expect(effectNamed("GardenGrade").fragmentShader).not.toMatch(/toneMapping|colorspace/i);
    // The grade stays parametric and pre-tone-map; every lookup lives in the
    // one effect that runs on the display signal.
    expect(effectNamed("GardenGrade").fragmentShader).not.toMatch(/lutStrip|ditherNoise/);
  });

  it("applies the authored cube and the dither on the display signal, in one fused pass", () => {
    makePost();
    const lut = effectNamed("GardenLut");

    // The sRGB round trip is what makes "post-tone-map" mean "in display
    // space": the composer's intermediate buffer is linear half-float, so the
    // effect has to encode, look up, dither, and decode.
    expect(lut.fragmentShader).toMatch(/gardenLinearToDisplay\(clamp\(inputColor\.rgb/);
    expect(lut.fragmentShader).toMatch(/outputColor = vec4\(gardenDisplayToLinear/);
    // W1.2: one output code of blue noise, addressed in device pixels so the
    // mask tiles 1:1 with the pixels that quantize.
    expect(lut.fragmentShader).toMatch(/gl_FragCoord\.xy \/ DITHER_TILE/);
    expect(lut.fragmentShader).toMatch(/\(noise - 0\.5\) \* ditherMix \/ 255\.0/);
    // Manual trilinear: the blue axis is lerped by hand between two slices so
    // hardware filtering never crosses a slice or a phase-band boundary.
    expect(lut.fragmentShader).toMatch(/mix\(nearSlice, farSlice, slice - low\)/);
  });

  it("loads the LUT and dither textures as raw, unfiltered look-up data", () => {
    makePost();
    const strip = lutTexture("lutStrip");
    const noise = lutTexture("ditherNoise");

    for (const texture of [strip, noise]) {
      // A transfer function on read, a mipmap chain, or a Y flip each silently
      // corrupts a packed cube; none of them can be caught by looking at it.
      expect(texture.colorSpace).toBe(NoColorSpace);
      expect(texture.generateMipmaps).toBe(false);
      expect(texture.flipY).toBe(false);
    }
    // The cube interpolates (that is the point) and clamps at the cube edges;
    // the dither mask must not interpolate at all, and it tiles the frame.
    expect([strip.minFilter, strip.magFilter]).toEqual([LinearFilter, LinearFilter]);
    expect([strip.wrapS, strip.wrapT]).toEqual([ClampToEdgeWrapping, ClampToEdgeWrapping]);
    expect([noise.minFilter, noise.magFilter]).toEqual([NearestFilter, NearestFilter]);
    expect([noise.wrapS, noise.wrapT]).toEqual([RepeatWrapping, RepeatWrapping]);
  });

  it("blends the three LUT bands by the same law the parametric tables use", () => {
    const { post } = makePost();
    const lut = effectNamed("GardenLut");

    expect([...lut.uniforms.keys()].sort()).toEqual([
      "ditherMix",
      "ditherNoise",
      "grain",
      "lutMix",
      "lutStrip",
      "lutWeights",
    ]);
    // Paper grain A/B'd and dropped; the term stays behind a zeroed dial.
    expect(numberUniform(lut, "grain")).toBe(0);

    // Night is the base of the blend, exactly as in the grade tables.
    expect(lutWeights()).toEqual([1, 0, 0]);
    post.setGrade(0, 1);
    expect(lutWeights()).toEqual([0, 1, 0]);
    post.setGrade(1, 0);
    expect(lutWeights()).toEqual([0, 0, 1]);
    post.setGrade(1, 1);
    expect(lutWeights()).toEqual([0, 0, 1]);

    // The mid-blend weights are the expansion of
    // lerp(lerp(night, dusk, duskMix), day, dayMix), and they sum to 1.
    post.setGrade(0.4, 0.25);
    const [night, dusk, day] = lutWeights();
    expect(day).toBeCloseTo(0.4);
    expect(dusk).toBeCloseTo(0.15);
    expect(night).toBeCloseTo(0.45);
    expect(night + dusk + day).toBeCloseTo(1);

    // A caller outside [0, 1] must never produce a negative band weight — the
    // parametric lerps extrapolate, but a LUT sampled in reverse is not a look.
    post.setGrade(1.5, -0.4);
    expect(lutWeights()).toEqual([0, 0, 1]);
    post.setGrade(-0.2, 1.4);
    expect(lutWeights()).toEqual([0, 1, 0]);
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
    expect(post.getPassList()).toEqual(["render", "grade", "output", "lut", "smaa"]);
    post.setAOZoomDetail(0);
    expect(post.getPassList()).toContain("lut");
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
      expect.stringMatching(/^\/pharosville\/textures\/garden-blue-noise\.png\?v=[0-9a-f]{12}$/),
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

  it("blends night, dusk, day, storm, lightning, bloom, and AO from one phase plan", () => {
    const { n8ao, post } = makePost();
    const bloom = latest<FakeBloom>(postHarness.blooms);
    const grade = effectNamed("GardenGrade");

    expect(colorUniform(grade, "lift")).toEqual([0.012, 0.016, 0.03]);
    expect(numberUniform(grade, "saturation")).toBe(1.1);
    expect(numberUniform(grade, "vignette")).toBe(0.36);
    // W1.4: the vignette's weight leans up the frame, hardest by day where the
    // haze band is brightest and gentlest at night, which has little sky to
    // spare. The `vignette` amounts themselves are untouched — the bias
    // redistributes the shipped darkening rather than adding to it.
    expect(numberUniform(grade, "vignetteBias")).toBe(0.25);
    expect(numberUniform(grade, "flash")).toBe(0);
    // W1.3: the night knee clears the lantern pool ring (~1.0 luminance) that
    // used to smear the whole water plane, so only the beacon and the top of
    // the moon road survive it — with the wash gone, night's strength can rise.
    expect(bloom.intensity).toBe(0.8);
    expect(bloom.luminanceMaterial.threshold).toBe(1.55);
    expect(bloom.luminanceMaterial.smoothing).toBe(0.45);
    expect(bloom.mipmapBlurPass.radius).toBe(0.72);
    expect(n8ao.configuration.intensity).toBe(5);

    post.setGrade(0, 1);
    expect(colorUniform(grade, "lift")).toEqual([0.006, 0.006, 0.008]);
    expect(numberUniform(grade, "saturation")).toBe(1.06);
    expect(numberUniform(grade, "vignetteBias")).toBe(0.35);
    expect(bloom.intensity).toBe(0.85);
    expect(bloom.luminanceMaterial.threshold).toBe(1.15);
    expect(bloom.luminanceMaterial.smoothing).toBe(0.3);
    expect(bloom.mipmapBlurPass.radius).toBe(0.64);
    expect(n8ao.configuration.intensity).toBe(4);

    post.setGrade(1, 0);
    expect(colorUniform(grade, "lift")[0]).toBeCloseTo(0.004);
    expect(colorUniform(grade, "lift")[1]).toBeCloseTo(0.004);
    expect(colorUniform(grade, "lift")[2]).toBeCloseTo(0.006);
    expect(numberUniform(grade, "saturation")).toBe(0.97);
    // 0.32 since 2026-08-13, up from 0.24 — the day was the outlier against
    // dusk and night at 0.36, and with real haze in the far field the frame has
    // the range to carry it.
    expect(numberUniform(grade, "vignette")).toBe(0.32);
    expect(numberUniform(grade, "vignetteBias")).toBe(0.45);
    expect(bloom.intensity).toBe(0.92);
    // W1.3: 50 % of margin over the bokashi haze band (~0.7–0.8) instead of the
    // old 19 %, so the day sky cannot bloom even if the wipe drifts brighter —
    // and still under the sun glitter (~1.4–1.7), which is what may sparkle.
    expect(bloom.luminanceMaterial.threshold).toBe(1.2);
    expect(bloom.luminanceMaterial.smoothing).toBe(0.2);
    expect(bloom.mipmapBlurPass.radius).toBe(0.5);
    expect(n8ao.configuration.intensity).toBe(3);

    post.setGrade(0.4, 0.25, 0.5, 0.65);
    expect(colorUniform(grade, "lift")[0]).toBeCloseTo(0.0101);
    expect(numberUniform(grade, "flash")).toBe(0.65);
    // W0.3: a stroke lifts bloom intensity on the same envelope as the grade's
    // flash add — the grade pass runs after the bloom pass, so this is the only
    // road a strike has into the glow. Phase blend 0.8555, storm adds 0.129.
    expect(bloom.intensity).toBeCloseTo(0.9845 + 0.65 * 0.35);
    // Knee 1.35 by the phase blend, less 0.5 * 0.2845 of storm wet-glow.
    expect(bloom.luminanceMaterial.threshold).toBeCloseTo(1.20775);
    expect(bloom.luminanceMaterial.smoothing).toBeCloseTo(0.3275);
    expect(bloom.mipmapBlurPass.radius).toBeCloseTo(0.62);
    expect(n8ao.configuration.intensity).toBeCloseTo(4.05);

    // The envelope's double stroke can sum past 1; bloom sees it clamped so a
    // strike widens the glow but can never blow the frame out.
    post.setGrade(0.4, 0.25, 0.5, 1.4);
    expect(numberUniform(grade, "flash")).toBe(1.4);
    expect(bloom.intensity).toBeCloseTo(0.9845 + 1 * 0.35);

    // No storm at any phase blend may open the knee onto the plain day sky:
    // the floor sits above the bokashi haze band, and the shipped rows land
    // well clear of it (0.90 at the worst, which is dusk under a full storm).
    for (const [dayMix, duskMix] of [[0, 0], [0, 1], [1, 0], [0.5, 0.5]] as const) {
      post.setGrade(dayMix, duskMix, 1);
      expect(bloom.luminanceMaterial.threshold).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("applies winter as a small desaturation on top of the existing phase grade", () => {
    const { post } = makePost();
    const grade = effectNamed("GardenGrade");
    post.setGrade(1, 0, 0, 0, 0);
    const summer = numberUniform(grade, "saturation");
    post.setGrade(1, 0, 0, 0, 1);
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

    post.setGrade(1, 0);
    expect(n8ao.configuration.intensity).toBeCloseTo(0.51);
    post.setGrade(0, 0);
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

  it("eases the idle profile across AO, DoF, and god rays without changing colour or passes", () => {
    const { composer, light, n8ao, post } = makePost({ withShadowLight: true });
    const tiltShift = effectNamed("GardenTiltShift");
    const godRays = effectNamed("GardenGodRays");
    const grade = effectNamed("GardenGrade");
    if (!light) throw new Error("Expected a shadow-casting light");

    const phase = dayCyclePhase(19);
    aimLightAtHour(light, 19);
    post.setGrade(phase.daylight, phase.dusk);
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
    expect(numberUniform(tiltShift, "strength")).toBeLessThan(0.72);
    expect(numberUniform(tiltShift, "strength")).toBeGreaterThan(0);
    expect(numberUniform(godRays, "rayWeight")).toBeLessThan(0.02);
    expect(numberUniform(godRays, "rayWeight")).toBeGreaterThan(0);

    for (let frame = 0; frame < 90; frame += 1) post.render(1 / 60);
    expect(n8ao.configuration.intensity).toBeCloseTo(performanceAOIntensity);
    expect(n8ao.configuration.aoRadius).toBeCloseTo(1.4);
    expect(numberUniform(tiltShift, "strength")).toBe(0);
    expect(numberUniform(godRays, "rayWeight")).toBe(0);
    expect(post.getPassList()).not.toContain("dof");
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
    expect(numberUniform(tiltShift, "strength")).toBeGreaterThan(0);
    expect(numberUniform(tiltShift, "strength")).toBeLessThan(0.72);
    expect(numberUniform(godRays, "rayWeight")).toBeGreaterThan(0);
    expect(numberUniform(godRays, "rayWeight")).toBeLessThan(0.02);
    for (let frame = 0; frame < 90; frame += 1) post.render(1 / 60);
    expect(n8ao.configuration.intensity).toBe(awakeAOIntensity);
    expect(n8ao.configuration.aoRadius).toBe(2);
    expect(numberUniform(tiltShift, "strength")).toBeCloseTo(0.72);
    expect(numberUniform(godRays, "rayWeight")).toBeCloseTo(0.02, 3);

    // A reduced-motion repaint is a complete static composition even if it
    // arrives directly after an idle frame; it does not wait out a fade.
    post.setIdleProfile?.(true);
    for (let frame = 0; frame < 90; frame += 1) post.render(1 / 60);
    post.setIdleProfile?.(false, true);
    post.render(0);
    expect(n8ao.configuration.intensity).toBe(awakeAOIntensity);
    expect(n8ao.configuration.aoRadius).toBe(2);
    expect(numberUniform(tiltShift, "strength")).toBeCloseTo(0.72);
    expect(numberUniform(godRays, "rayWeight")).toBeCloseTo(0.02, 3);
  });

  it("fades the tilt-shift on the shared tier weight and never on zoom or hue", () => {
    const { post } = makePost();
    const tiltShift = effectNamed("GardenTiltShift");
    const grade = effectNamed("GardenGrade");

    // W2.3 rides the SAME eased weight the AO does, because it is the same
    // tier decision — full/balanced on, below off, over a 180 ms ease driven
    // by world-renderer. It is a fidelity, not a colour.
    expect(numberUniform(tiltShift, "strength")).toBeCloseTo(0.72);
    post.setAOTierWeight(0.5);
    expect(numberUniform(tiltShift, "strength")).toBeCloseTo(0.36);
    post.setAOTierWeight(0);
    expect(numberUniform(tiltShift, "strength")).toBe(0);
    post.setAOTierWeight(1);

    // Unlike AO, the band is expressed in view heights, so it says the same
    // thing at overview zoom as at detail zoom and must NOT ride the LOD fade.
    post.setAOZoomDetail(0);
    expect(numberUniform(tiltShift, "strength")).toBeCloseTo(0.72);
    post.setAOZoomDetail(1);

    // Tier invariance: shedding the softening may not move a single grade
    // value, and the AO exponent stays the AO's business.
    const saturation = numberUniform(grade, "saturation");
    const vignette = numberUniform(grade, "vignette");
    post.setAOQuality("balanced");
    post.setAOTierWeight(0);
    expect(numberUniform(grade, "saturation")).toBe(saturation);
    expect(numberUniform(grade, "vignette")).toBe(vignette);

    post.setEnabled(false);
    expect(numberUniform(tiltShift, "strength")).toBe(0);
  });

  it("derives the tilt-shift band from the camera and leaves its centre driveable", () => {
    const { post } = makePost();
    const tiltShift = effectNamed("GardenTiltShift");

    post.render(1 / 60);
    // The sharp band centres on where the locked vantage looks at the sea:
    // the camera's drop to the water plane along its own view ray. At the
    // shipped 30° rake from y = 110·sqrt(2/3) that is (89.81 + 1.45) / 0.5.
    expect(numberUniform(tiltShift, "focusCenter")).toBeCloseTo(182.53, 1);
    // ... and the widths are view heights, not world units, so a zoom cannot
    // put the whole map out of focus or the whole detail framing into it.
    expect(numberUniform(tiltShift, "focusRange")).toBeCloseTo(62.5 * 0.55);
    expect(numberUniform(tiltShift, "farFalloff")).toBeCloseTo(62.5 * 0.5);
    expect(numberUniform(tiltShift, "nearFalloff")).toBeCloseTo(62.5 * 0.45);

    // W4.6 seam: the centre is a plain uniform, so a focus pull toward a
    // selected ship is an ease, never a pass-list change.
    post.setFocusBandDistance(140);
    post.render(1 / 60);
    expect(numberUniform(tiltShift, "focusCenter")).toBe(140);
    expect(numberUniform(tiltShift, "focusRange")).toBeCloseTo(62.5 * 0.55);
    post.setFocusBandDistance(null);
    post.render(1 / 60);
    expect(numberUniform(tiltShift, "focusCenter")).toBeCloseTo(182.53, 1);
  });

  it("opens the god-ray window only for a sun that is both low and still up", () => {
    // The gate is pure, so the whole curve can be locked without a GPU.
    // Monotone in elevation: a lower sun never buys fewer rays.
    let previous = -1;
    for (const elevation of [0.9, 0.7, 0.55, 0.45, 0.35, 0.25, 0.16, 0.1]) {
      const gate = gardenGodRayLowSunGate(elevation, 0);
      expect(gate).toBeGreaterThanOrEqual(previous);
      previous = gate;
    }
    expect(gardenGodRayLowSunGate(0.12, 0)).toBe(1);
    expect(gardenGodRayLowSunGate(0.8, 0)).toBe(0);
    // Night closes it whatever the pose says, which is the half elevation
    // cannot do: the key light crosses back down through the low band on its
    // way to the moon.
    expect(gardenGodRayLowSunGate(0.12, 1)).toBe(0);
    expect(gardenGodRayLowSunGate(0.12, 0.5)).toBeCloseTo(0.5);
    expect(gardenGodRayLowSunGate(Number.NaN, 0)).toBe(0);
  });

  it("drives the god rays from the shipped arc, dusk brightest and night dark", () => {
    const { light, post } = makePost({ withShadowLight: true });
    const godRays = effectNamed("GardenGodRays");
    if (!light) throw new Error("Expected a shadow-casting light");

    const rayWeightAt = (hour: number): number => {
      const phase = dayCyclePhase(hour);
      aimLightAtHour(light, hour);
      post.setGrade(phase.daylight, phase.dusk);
      post.render(1 / 60);
      return numberUniform(godRays, "rayWeight");
    };

    const dusk = rayWeightAt(19);
    const dawn = rayWeightAt(7);
    const lateAfternoon = rayWeightAt(17);
    const emberEvening = rayWeightAt(20);

    // Dusk is the money shot: the arc floors the key light at 0.12 rad there,
    // the window is wide open, and the dusk row is the densest.
    expect(dusk).toBeCloseTo(0.02, 3);
    // Dawn is the same window from the other side, but the sun is already
    // ~19° up: present and deliberately paler.
    expect(dawn).toBeGreaterThan(0.006);
    expect(dawn).toBeLessThan(dusk * 0.6);
    expect(lateAfternoon).toBeGreaterThan(0);
    expect(lateAfternoon).toBeLessThan(dawn);
    expect(emberEvening).toBeGreaterThan(0);
    expect(emberEvening).toBeLessThan(dusk);

    // Shut at high day and at night proper — no shafts without a low sun.
    expect(rayWeightAt(12)).toBe(0);
    expect(rayWeightAt(22)).toBe(0);
    expect(rayWeightAt(2)).toBe(0);
  });

  it("colours the shafts from the hour and never from the tier", () => {
    const { light, post } = makePost({ withShadowLight: true });
    if (!light) throw new Error("Expected a shadow-casting light");
    const march = marchUniforms();

    // Evening: dusk = 1 with daylight 0, so the shafts take the ember row.
    post.setGrade(0, 1);
    const evening = [...(march.rayColor!.value as { toArray: () => number[] }).toArray()];
    expect(evening[0]).toBeCloseTo(1);
    expect(evening[2]).toBeCloseTo(0.3);
    // Dawn: the same dusk = 1 window, but daylight is already climbing, which
    // is the one scalar that separates the two low-sun windows.
    post.setGrade(0.65, 1);
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
    const phase = dayCyclePhase(19);
    aimLightAtHour(light, 19);
    post.setGrade(phase.daylight, phase.dusk);
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
      "GardenTiltShift",
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
    const phase = dayCyclePhase(19);
    aimLightAtHour(light, 19);
    post.setGrade(phase.daylight, phase.dusk);

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

  it("sizes composer targets from CSS dimensions after renderer DPR setup", () => {
    const { composer, post } = makePost();

    post.setSize(800, 600, 1);
    post.setSize(800, 600, 2);

    expect(composer.setSize).toHaveBeenNthCalledWith(1, 800, 600);
    expect(composer.setSize).toHaveBeenNthCalledWith(2, 800, 600);
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
