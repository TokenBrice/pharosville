import { HalfFloatType, OrthographicCamera, Scene, type WebGLRenderer } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGardenPost, type GardenPost } from "./garden-post";

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

    constructor(readonly bloomOptions: {
      intensity: number;
      luminanceSmoothing: number;
      luminanceThreshold: number;
    }) {
      super("BloomEffect");
      this.intensity = bloomOptions.intensity;
      this.luminanceMaterial = {
        smoothing: bloomOptions.luminanceSmoothing,
        threshold: bloomOptions.luminanceThreshold,
      };
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

function makePost(): {
  composer: FakeComposer;
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
  const post = createGardenPost(renderer, new Scene(), new OrthographicCamera());
  activePosts.push(post);
  return {
    composer: latest<FakeComposer>(postHarness.composers),
    n8ao: latest<FakeN8AOPass>(postHarness.n8aoPasses),
    post,
    renderer,
  };
}

function effectNamed(name: string): FakeEffect {
  const effect = postHarness.effects.find((candidate) => (
    (candidate as FakeEffect).name === name
  ));
  if (!effect) throw new Error(`Expected ${name} in post-processing harness`);
  return effect as FakeEffect;
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

beforeEach(() => {
  activePosts.length = 0;
  postHarness.blooms.length = 0;
  postHarness.composers.length = 0;
  postHarness.effects.length = 0;
  postHarness.n8aoPasses.length = 0;
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
    expect(bloom.bloomOptions).toMatchObject({
      blendFunction: "ADD",
      levels: 5,
      luminanceSmoothing: 0.01,
      mipmapBlur: true,
      radius: 0.6,
    });

    const passEffects = composer.passes.map((pass) => (
      pass.effects?.map((effect) => effect.name) ?? [pass.name]
    ));
    expect(passEffects).toEqual([
      ["RenderPass"],
      [undefined],
      ["BloomEffect"],
      ["GardenGrade", "ToneMappingEffect"],
      ["SMAAEffect"],
    ]);
    expect(post.getPassList()).toEqual([
      "render",
      "n8ao",
      "bloom",
      "grade",
      "output",
      "smaa",
    ]);

    const toneEffects = postHarness.effects.filter((candidate) => (
      (candidate as FakeEffect).name === "ToneMappingEffect"
    )) as FakeEffect[];
    expect(toneEffects).toHaveLength(1);
    expect(toneEffects[0]?.toneMappingOptions).toEqual({ mode: "AGX" });
    expect(composer.passes.at(-1)?.renderToScreen).toBe(true);
    expect(composer.passes.slice(0, -1).every((pass) => !pass.renderToScreen)).toBe(true);
    expect(effectNamed("SMAAEffect").attributes).toBe(2);
    expect(effectNamed("GardenGrade").fragmentShader).not.toMatch(/toneMapping|colorspace/i);
  });

  it("blends night, dusk, day, storm, lightning, bloom, and AO from one phase plan", () => {
    const { n8ao, post } = makePost();
    const bloom = latest<FakeBloom>(postHarness.blooms);
    const grade = effectNamed("GardenGrade");

    expect(colorUniform(grade, "lift")).toEqual([0.012, 0.016, 0.03]);
    expect(numberUniform(grade, "saturation")).toBe(1.1);
    expect(numberUniform(grade, "vignette")).toBe(0.36);
    expect(numberUniform(grade, "flash")).toBe(0);
    expect(bloom.intensity).toBe(0.55);
    expect(bloom.luminanceMaterial.threshold).toBe(0.95);
    expect(n8ao.configuration.intensity).toBe(5);

    post.setGrade(0, 1);
    expect(colorUniform(grade, "lift")).toEqual([0.006, 0.006, 0.008]);
    expect(numberUniform(grade, "saturation")).toBe(1.06);
    expect(bloom.intensity).toBe(0.78);
    expect(bloom.luminanceMaterial.threshold).toBe(0.9);
    expect(n8ao.configuration.intensity).toBe(4);

    post.setGrade(1, 0);
    expect(colorUniform(grade, "lift")[0]).toBeCloseTo(0.004);
    expect(colorUniform(grade, "lift")[1]).toBeCloseTo(0.004);
    expect(colorUniform(grade, "lift")[2]).toBeCloseTo(0.006);
    expect(numberUniform(grade, "saturation")).toBe(0.97);
    expect(numberUniform(grade, "vignette")).toBe(0.24);
    expect(bloom.intensity).toBe(0.92);
    expect(bloom.luminanceMaterial.threshold).toBe(0.95);
    expect(n8ao.configuration.intensity).toBe(3);

    post.setGrade(0.4, 0.25, 0.5, 0.65);
    expect(colorUniform(grade, "lift")[0]).toBeCloseTo(0.0101);
    expect(numberUniform(grade, "flash")).toBe(0.65);
    expect(bloom.intensity).toBeCloseTo(0.8615);
    expect(bloom.luminanceMaterial.threshold).toBeCloseTo(0.91275);
    expect(n8ao.configuration.intensity).toBeCloseTo(4.05);
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
