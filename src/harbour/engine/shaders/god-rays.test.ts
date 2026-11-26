import * as THREE from "three";
import { BlendFunction, EffectAttribute, EffectPass } from "postprocessing";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOD_RAYS_BLUR_FRAG,
  GOD_RAYS_COMPOSITE_FRAG,
  GOD_RAYS_MASK_FRAG,
  GOD_RAYS_MAX_GAIN,
  GOD_RAYS_VERT,
  GodRaysEffect,
  godRaysDawnDuskWeight,
  godRaysTapsFor,
} from "./god-rays";

/** Extract GLSL calls for B07/C04 verification matching shader-math.test.ts. */
function glslCalls(source: string, name: string): string[][] {
  const out: string[][] = [];
  const re = new RegExp(`(?<![\\w.])${name}\\s*\\(`, "g");
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const args: string[] = [];
    let depth = 0;
    let cur = "";
    for (let i = m.index + m[0].length; i < source.length; i++) {
      const c = source[i];
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") {
        if (depth === 0) break;
        depth--;
      }
      if (c === "," && depth === 0) {
        args.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    args.push(cur.trim());
    out.push(args);
  }
  return out;
}

function makeMockRenderer(opts: { initialTarget?: THREE.WebGLRenderTarget | null; failOnRender?: number; autoClear?: boolean } = {}) {
  let currentTarget: THREE.WebGLRenderTarget | null = opts.initialTarget ?? null;
  let renderCount = 0;
  const drawn: Array<{
    target: THREE.WebGLRenderTarget | null;
    matName: string;
    autoClear: boolean;
    taps?: number;
    stepScale?: number;
    jitter?: number;
    inputTex?: unknown;
  }> = [];

  const renderer = {
    autoClear: opts.autoClear ?? true,
    drawn,
    getRenderTarget: () => currentTarget,
    setRenderTarget: vi.fn((t: THREE.WebGLRenderTarget | null) => {
      currentTarget = t;
    }),
    render: vi.fn((scene: THREE.Scene, _camera: THREE.Camera) => {
      renderCount++;
      const mesh = scene.children[0] as THREE.Mesh;
      const mat = mesh.material as THREE.ShaderMaterial;
      const u = mat.uniforms;
      drawn.push({
        target: currentTarget,
        matName: mat.name,
        autoClear: renderer.autoClear,
        ...(u.uTaps ? { taps: u.uTaps.value as number } : {}),
        ...(u.uStepScale ? { stepScale: u.uStepScale.value as number } : {}),
        ...(u.uJitter ? { jitter: u.uJitter.value as number } : {}),
        ...(u.tInput ? { inputTex: u.tInput.value } : {}),
        ...(u.tColor ? { inputTex: u.tColor.value } : {}),
      });
      if (opts.failOnRender && renderCount === opts.failOnRender) {
        throw new Error("god rays gpu error");
      }
    }),
  };

  return renderer;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("godRaysDawnDuskWeight & B07/C04 GLSL compliance", () => {
  it("gates strictly to dawn/dusk sunY ∈ [-0.03, +0.26] with zero at noon and night", () => {
    expect(godRaysDawnDuskWeight(0.5)).toBe(0);
    expect(godRaysDawnDuskWeight(0.26)).toBe(0);
    expect(godRaysDawnDuskWeight(0.261)).toBe(0);
    expect(godRaysDawnDuskWeight(-0.2)).toBe(0);
    expect(godRaysDawnDuskWeight(-0.03)).toBe(0);
    expect(godRaysDawnDuskWeight(-0.031)).toBe(0);
    expect(godRaysDawnDuskWeight(Number.NaN)).toBe(0);

    // Golden hour peak (> 0.5)
    expect(godRaysDawnDuskWeight(0.08)).toBeGreaterThan(0.5);
    expect(godRaysDawnDuskWeight(0.08)).toBeCloseTo(1.0, 6);
    expect(godRaysDawnDuskWeight(0.14)).toBeCloseTo(1.0, 6);

    // Smooth monotonic edges inside [-0.03, 0.04] and [0.14, 0.26]
    expect(godRaysDawnDuskWeight(-0.01)).toBeGreaterThan(0);
    expect(godRaysDawnDuskWeight(0.01)).toBeGreaterThan(godRaysDawnDuskWeight(-0.01));
    expect(godRaysDawnDuskWeight(0.04)).toBeGreaterThan(godRaysDawnDuskWeight(0.01));

    expect(godRaysDawnDuskWeight(0.18)).toBeLessThan(1);
    expect(godRaysDawnDuskWeight(0.22)).toBeLessThan(godRaysDawnDuskWeight(0.18));
    expect(godRaysDawnDuskWeight(0.25)).toBeGreaterThan(0);
    expect(godRaysDawnDuskWeight(0.25)).toBeLessThan(godRaysDawnDuskWeight(0.22));
  });

  it("maps tap counts per tier cleanly", () => {
    expect(godRaysTapsFor("high")).toBe(20);
    expect(godRaysTapsFor("medium")).toBe(12);
    expect(godRaysTapsFor("off")).toBe(0);
  });

  it("strictly obeys B07/C04 GLSL math (ascending smoothstep only, zero pow(..., 2.0)) and integrates into EffectPass", () => {
    const shaders = [
      ["GOD_RAYS_VERT", GOD_RAYS_VERT],
      ["GOD_RAYS_MASK_FRAG", GOD_RAYS_MASK_FRAG],
      ["GOD_RAYS_BLUR_FRAG", GOD_RAYS_BLUR_FRAG],
      ["GOD_RAYS_COMPOSITE_FRAG", GOD_RAYS_COMPOSITE_FRAG],
    ] as const;

    for (const [label, src] of shaders) {
      for (const args of glslCalls(src, "smoothstep")) {
        const [e0, e1] = args.map(Number);
        if (Number.isFinite(e0) && Number.isFinite(e1)) {
          expect(e0 < e1, `${label}: smoothstep(${args.join(", ")})`).toBe(true);
        }
      }
      const squares = glslCalls(src, "pow").filter((args) => /^2(\.0*)?$/.test(args[1] ?? ""));
      expect(squares, `${label} must not use pow(..., 2.0)`).toEqual([]);
    }

    expect(GOD_RAYS_MASK_FRAG).toContain("smoothstep(0.45, 1.10, lum)");
    expect(GOD_RAYS_COMPOSITE_FRAG).toContain("uStrength <= 0.001");
    expect(GOD_RAYS_COMPOSITE_FRAG).toContain("uRaysTex");
    expect(GOD_RAYS_COMPOSITE_FRAG).toContain("uSunColor");

    // Verify zero-error integration into postprocessing EffectPass
    const effect = new GodRaysEffect();
    expect(effect.getAttributes() & EffectAttribute.DEPTH).toBe(EffectAttribute.DEPTH);
    expect(effect.blendMode.blendFunction).toBe(BlendFunction.SET);
    const pass = new EffectPass(new THREE.PerspectiveCamera(), effect);
    pass.recompile();
    expect(pass.fullscreenMaterial).toBeTruthy();
    pass.dispose();
  });
});

describe("GodRaysEffect bypass, ¼-res passes, sizing, state restore & disposal", () => {
  it("sizes targetA and targetB to ¼ resolution (Math.max(1, Math.round(dim * 0.25)))", () => {
    const effect = new GodRaysEffect();
    expect(effect.targetA.texture.type).toBe(THREE.HalfFloatType);
    expect(effect.targetB.texture.type).toBe(THREE.HalfFloatType);

    for (const [w, h] of [[1600, 1000], [1920, 1080], [1365, 767], [3, 2], [1, 1]]) {
      effect.setSize(w, h);
      const ew = Math.max(1, Math.round(w * 0.25));
      const eh = Math.max(1, Math.round(h * 0.25));
      expect([effect.targetA.width, effect.targetA.height]).toEqual([ew, eh]);
      expect([effect.targetB.width, effect.targetB.height]).toEqual([ew, eh]);
    }
    effect.dispose();
  });

  it("skips all GPU passes (0.00 ms bypass, uStrength=0) at noon, night, storm deck, off-screen, Low tier, disabled, or missing depth", () => {
    const effect = new GodRaysEffect("high");
    const depth = new THREE.DepthTexture(1600, 1000);
    const input = new THREE.WebGLRenderTarget(1600, 1000);
    const warmSun = new THREE.Color(1, 0.72, 0.42);
    const mock = makeMockRenderer();

    // Missing depth texture -> 0 draws, uStrength = 0
    effect.sync(new THREE.Vector4(0.6, 0.85, 1, 0.08), warmSun, 0.2, 0);
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    expect(mock.drawn).toHaveLength(0);
    expect(effect.uniforms.get("uStrength")!.value).toBe(0);

    effect.setDepthTexture(depth);

    // Noon (sunY = 0.5) -> 0 draws
    effect.sync(new THREE.Vector4(0.6, 0.85, 1, 0.5), warmSun, 0.2, 0);
    expect(effect.active).toBe(false);
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    expect(mock.drawn).toHaveLength(0);
    expect(effect.uniforms.get("uStrength")!.value).toBe(0);

    // Night (sunY = -0.2) -> 0 draws
    effect.sync(new THREE.Vector4(0.6, 0.85, 1, -0.2), warmSun, 0.2, 1);
    expect(effect.active).toBe(false);
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    expect(mock.drawn).toHaveLength(0);
    expect(effect.uniforms.get("uStrength")!.value).toBe(0);

    // Heavy storm deck (cloudCover = 0.95) -> 0 draws
    effect.sync(new THREE.Vector4(0.6, 0.85, 1, 0.08), warmSun, 0.95, 0);
    expect(effect.active).toBe(false);
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    expect(mock.drawn).toHaveLength(0);

    // Painted disc off-screen far past margin -> 0 draws
    effect.sync(new THREE.Vector4(1.6, 0.85, 1, 0.08), warmSun, 0.2, 0);
    expect(effect.active).toBe(false);
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    expect(mock.drawn).toHaveLength(0);

    // Painted disc hidden (vis = 0) -> 0 draws
    effect.sync(new THREE.Vector4(0.6, 0.85, 0, 0.08), warmSun, 0.2, 0);
    expect(effect.active).toBe(false);
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    expect(mock.drawn).toHaveLength(0);

    // Golden hour on Low tier ("off") -> 0 draws
    effect.sync(new THREE.Vector4(0.6, 0.85, 1, 0.08), warmSun, 0.2, 0);
    effect.setQuality("off");
    expect(effect.active).toBe(false);
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    expect(mock.drawn).toHaveLength(0);
    expect(effect.uniforms.get("uStrength")!.value).toBe(0);

    // Golden hour on High tier with &extras=-godrays (setEnabled(false)) -> 0 draws
    effect.setQuality("high");
    effect.setEnabled(false);
    expect(effect.active).toBe(false);
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    expect(mock.drawn).toHaveLength(0);
    expect(effect.uniforms.get("uStrength")!.value).toBe(0);

    input.dispose();
    depth.dispose();
    effect.dispose();
  });

  it("runs 1 mask + 2 radial blur passes (total 3 ¼-res renders) during dawn/dusk on High (20 taps) and Medium (12 taps)", () => {
    const effect = new GodRaysEffect("high");
    const depth = new THREE.DepthTexture(1600, 1000);
    const input = new THREE.WebGLRenderTarget(1600, 1000);
    const prevTarget = new THREE.WebGLRenderTarget(1600, 1000);
    const warmSun = new THREE.Color(1, 0.72, 0.42);
    effect.setDepthTexture(depth);

    const mock = makeMockRenderer({ initialTarget: prevTarget, autoClear: true });
    effect.sync(new THREE.Vector4(0.65, 0.82, 1, 0.08), warmSun, 0.2, 0);
    expect(effect.active).toBe(true);

    // High tier: 20 taps per blur pass
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    expect(mock.drawn).toHaveLength(3);
    expect([effect.targetA.width, effect.targetA.height]).toEqual([400, 250]);

    expect(mock.drawn[0].matName).toBe("hb_godrays_mask");
    expect(mock.drawn[0].target).toBe(effect.targetA);
    expect(mock.drawn[0].inputTex).toBe(input.texture);
    expect(mock.drawn[0].autoClear).toBe(false);

    expect(mock.drawn[1].matName).toBe("hb_godrays_blur");
    expect(mock.drawn[1].target).toBe(effect.targetB);
    expect(mock.drawn[1].inputTex).toBe(effect.targetA.texture);
    expect(mock.drawn[1].taps).toBe(20);
    expect(mock.drawn[1].stepScale).toBe(1.0);

    expect(mock.drawn[2].matName).toBe("hb_godrays_blur");
    expect(mock.drawn[2].target).toBe(effect.targetA);
    expect(mock.drawn[2].inputTex).toBe(effect.targetB.texture);
    expect(mock.drawn[2].taps).toBe(20);
    expect(mock.drawn[2].stepScale).toBe(0.45);
    expect(mock.drawn[2].jitter).not.toBe(mock.drawn[1].jitter);

    // Reduced motion holds IGN jitter phase constant across frames
    effect.setReducedMotion(true);
    mock.drawn.length = 0;
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    const j1 = mock.drawn[1].jitter;
    mock.drawn.length = 0;
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    expect(mock.drawn[1].jitter).toBe(j1);
    effect.setReducedMotion(false);

    // Restores previous target and autoClear, composite strength bounded <= GOD_RAYS_MAX_GAIN
    expect(mock.getRenderTarget()).toBe(prevTarget);
    expect(mock.autoClear).toBe(true);
    const strength = effect.uniforms.get("uStrength")!.value as number;
    expect(strength).toBeGreaterThan(0);
    expect(strength).toBeLessThanOrEqual(GOD_RAYS_MAX_GAIN);

    // Medium tier: 12 taps per blur pass
    mock.drawn.length = 0;
    effect.setQuality("medium");
    expect(effect.blurMat.uniforms.uTaps.value).toBe(12);
    effect.update(mock as unknown as THREE.WebGLRenderer, input);
    expect(mock.drawn).toHaveLength(3);
    expect(mock.drawn[1].taps).toBe(12);
    expect(mock.drawn[2].taps).toBe(12);
    expect(mock.getRenderTarget()).toBe(prevTarget);
    expect(mock.autoClear).toBe(true);

    prevTarget.dispose();
    input.dispose();
    depth.dispose();
    effect.dispose();
  });

  it("restores previous renderTarget and autoClear even if a ¼-res pass throws", () => {
    const effect = new GodRaysEffect("high");
    const depth = new THREE.DepthTexture(800, 500);
    const input = new THREE.WebGLRenderTarget(800, 500);
    const prevTarget = new THREE.WebGLRenderTarget(800, 500);
    effect.setDepthTexture(depth);
    effect.sync(new THREE.Vector4(0.5, 0.85, 1, 0.08), new THREE.Color(1, 0.8, 0.5), 0.1, 0);

    const mock = makeMockRenderer({ initialTarget: prevTarget, failOnRender: 2, autoClear: true });
    expect(() => effect.update(mock as unknown as THREE.WebGLRenderer, input)).toThrow("god rays gpu error");
    expect(mock.getRenderTarget()).toBe(prevTarget);
    expect(mock.autoClear).toBe(true);

    prevTarget.dispose();
    input.dispose();
    depth.dispose();
    effect.dispose();
  });

  it("exposes hb_godrays_mask and hb_godrays_blur in preparationEntries() and disposes all GPU resources cleanly", () => {
    const effect = new GodRaysEffect();
    const entries = effect.preparationEntries();
    expect(entries).toHaveLength(2);

    const matNames = entries.map((e) => (((e.root as THREE.Scene).children[0] as THREE.Mesh).material as THREE.ShaderMaterial).name);
    expect(matNames).toEqual(["hb_godrays_mask", "hb_godrays_blur"]);
    expect(entries[0].target()).toBe(effect.targetA);
    expect(entries[1].target()).toBe(effect.targetB);
    expect(entries[0].camera).toBe(effect.passCamera);
    expect(entries[1].camera).toBe(effect.passCamera);

    const onADispose = vi.fn();
    const onBDispose = vi.fn();
    const onMaskDispose = vi.fn();
    const onBlurDispose = vi.fn();
    const quadGeo = (effect.maskScene.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry;
    const onGeoDispose = vi.fn();

    effect.targetA.addEventListener("dispose", onADispose);
    effect.targetB.addEventListener("dispose", onBDispose);
    effect.maskMat.addEventListener("dispose", onMaskDispose);
    effect.blurMat.addEventListener("dispose", onBlurDispose);
    quadGeo.addEventListener("dispose", onGeoDispose);

    effect.dispose();
    // Second dispose is a safe no-op
    effect.dispose();

    expect(onADispose).toHaveBeenCalledTimes(1);
    expect(onBDispose).toHaveBeenCalledTimes(1);
    expect(onMaskDispose).toHaveBeenCalledTimes(1);
    expect(onBlurDispose).toHaveBeenCalledTimes(1);
    expect(onGeoDispose).toHaveBeenCalledTimes(1);
  });
});
