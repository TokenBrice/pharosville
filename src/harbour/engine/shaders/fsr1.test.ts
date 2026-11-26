import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FSR_DEFAULT_SHARPNESS,
  FSR_EASU_FRAG,
  FSR_RCAS_FRAG,
  FSR_VERT,
  Fsr1Pass,
  fsrRcasSharpnessGain,
} from "./fsr1";

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

function makeMockRenderer(opts: { failOnRender?: number; autoClear?: boolean } = {}) {
  let currentTarget: THREE.WebGLRenderTarget | null = null;
  let renderCount = 0;
  const drawn: Array<{
    target: THREE.WebGLRenderTarget | null;
    matName: string;
    autoClear: boolean;
    inputTex: unknown;
    inputSize?: [number, number];
    outputSize?: [number, number];
    texelSize?: [number, number];
    sharpness?: number;
    outputLinear?: number;
  }> = [];

  const state = {
    reset: vi.fn(),
  };

  const renderer = {
    autoClear: opts.autoClear ?? true,
    state,
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
        inputTex: u.uInput?.value,
        ...(u.uInputSize ? { inputSize: (u.uInputSize.value as THREE.Vector2).toArray() as [number, number] } : {}),
        ...(u.uOutputSize ? { outputSize: (u.uOutputSize.value as THREE.Vector2).toArray() as [number, number] } : {}),
        ...(u.uTexelSize ? { texelSize: (u.uTexelSize.value as THREE.Vector2).toArray() as [number, number] } : {}),
        ...(u.uSharpness ? { sharpness: u.uSharpness.value as number } : {}),
        ...(u.uOutputLinear ? { outputLinear: u.uOutputLinear.value as number } : {}),
      });
      if (opts.failOnRender && renderCount === opts.failOnRender) {
        throw new Error("fsr1 gpu error");
      }
    }),
  };

  return renderer;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FSR 1.0 shaders (B07/C04 & AMD contract)", () => {
  it("exports expected defaults and monotonic exp2(-stops) sharpness gain", () => {
    expect(FSR_DEFAULT_SHARPNESS).toBe(0.30);
    expect(fsrRcasSharpnessGain(0)).toBe(0);
    expect(fsrRcasSharpnessGain(-0.5)).toBe(0);
    expect(fsrRcasSharpnessGain(0.30)).toBeCloseTo(Math.pow(2, -1.4), 6);
    expect(fsrRcasSharpnessGain(1.0)).toBeCloseTo(1.0, 6);
    expect(fsrRcasSharpnessGain(2.0)).toBeCloseTo(1.0, 6);
    expect(fsrRcasSharpnessGain(0.6)).toBeGreaterThan(fsrRcasSharpnessGain(0.3));
  });

  it("strictly obeys B07/C04 GLSL math (ascending smoothstep only, zero pow(x, 2.0), required uniforms)", () => {
    const shaders = [
      ["FSR_VERT", FSR_VERT],
      ["FSR_EASU_FRAG", FSR_EASU_FRAG],
      ["FSR_RCAS_FRAG", FSR_RCAS_FRAG],
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

    // EASU contract: 12 taps, uniforms, anti-ringing clamp
    expect(FSR_EASU_FRAG).toContain("uniform sampler2D uInput;");
    expect(FSR_EASU_FRAG).toContain("uniform vec2 uInputSize;");
    expect(FSR_EASU_FRAG).toContain("uniform vec2 uOutputSize;");
    expect(FSR_EASU_FRAG).toContain("clamp(aC / max(aW, 1e-5), min4, max4)");
    const tapCalls = glslCalls(FSR_EASU_FRAG, "easuTap").filter((args) => !args[0].startsWith("inout"));
    expect(tapCalls).toHaveLength(12);

    // RCAS contract: 5-tap cross, uniforms, exp2(-stops) attenuation, lobe clamp
    expect(FSR_RCAS_FRAG).toContain("uniform sampler2D uInput;");
    expect(FSR_RCAS_FRAG).toContain("uniform vec2 uTexelSize;");
    expect(FSR_RCAS_FRAG).toContain("uniform float uSharpness;");
    expect(FSR_RCAS_FRAG).toContain("exp2(-stops)");
  });
});

describe("Fsr1Pass lifecycle, resolutions, render routing & preparation", () => {
  it("sizes easuTarget to display resolution via setResolutions and preserves separation across setSize", () => {
    const pass = new Fsr1Pass();
    expect(pass.needsSwap).toBe(false);
    expect(pass.easuMat.name).toBe("hb_fsr_easu");
    expect(pass.rcasMat.name).toBe("hb_fsr_rcas");
    expect(pass.easuTarget.texture.type).toBe(THREE.HalfFloatType);
    expect(pass.sharpness).toBe(FSR_DEFAULT_SHARPNESS);

    // Explicit render (1280x720) -> display (1920x1080) separation
    pass.setResolutions(1280, 720, 1920, 1080);
    expect([pass.easuTarget.width, pass.easuTarget.height]).toEqual([1920, 1080]);
    expect((pass.easuMat.uniforms.uInputSize.value as THREE.Vector2).toArray()).toEqual([1280, 720]);
    expect((pass.easuMat.uniforms.uOutputSize.value as THREE.Vector2).toArray()).toEqual([1920, 1080]);
    expect((pass.rcasMat.uniforms.uTexelSize.value as THREE.Vector2).toArray()).toEqual([1 / 1920, 1 / 1080]);

    // Subsequent EffectComposer setSize(renderW, renderH) must NOT shrink easuTarget or display output
    pass.setSize(960, 540);
    expect([pass.easuTarget.width, pass.easuTarget.height]).toEqual([1920, 1080]);
    expect((pass.easuMat.uniforms.uInputSize.value as THREE.Vector2).toArray()).toEqual([960, 540]);
    expect((pass.easuMat.uniforms.uOutputSize.value as THREE.Vector2).toArray()).toEqual([1920, 1080]);
    expect((pass.rcasMat.uniforms.uTexelSize.value as THREE.Vector2).toArray()).toEqual([1 / 1920, 1 / 1080]);

    // Reuniting resolutions allows setSize to track display size normally again
    pass.setResolutions(1600, 1000, 1600, 1000);
    pass.setSize(1440, 900);
    expect([pass.easuTarget.width, pass.easuTarget.height]).toEqual([1440, 900]);
    expect((pass.easuMat.uniforms.uOutputSize.value as THREE.Vector2).toArray()).toEqual([1440, 900]);
    expect((pass.rcasMat.uniforms.uTexelSize.value as THREE.Vector2).toArray()).toEqual([1 / 1440, 1 / 900]);

    // When bypassed (enabled = false), resetResolutions() shrinks easuTarget to 1×1 and setSize() keeps it at 1×1
    pass.enabled = false;
    pass.resetResolutions();
    expect([pass.easuTarget.width, pass.easuTarget.height]).toEqual([1, 1]);
    pass.setSize(2400, 1500);
    expect([pass.easuTarget.width, pass.easuTarget.height]).toEqual([1, 1]);

    pass.dispose();
  });

  it("renders EASU -> easuTarget and RCAS -> screen (null) when renderToScreen=true, or outputBuffer when false", () => {
    const pass = new Fsr1Pass();
    pass.setResolutions(960, 600, 1920, 1200);
    pass.setSharpness(0.35);
    expect(pass.sharpness).toBe(0.35);

    const input = new THREE.WebGLRenderTarget(800, 500);
    const output = new THREE.WebGLRenderTarget(1920, 1200);
    const mock = makeMockRenderer({ autoClear: true });

    // renderToScreen = true -> RCAS renders to null (screen), actual inputBuffer size propagates to uInputSize
    pass.renderToScreen = true;
    pass.render(mock as unknown as THREE.WebGLRenderer, input, output);

    expect(mock.drawn).toHaveLength(2);
    expect(mock.drawn[0].matName).toBe("hb_fsr_easu");
    expect(mock.drawn[0].target).toBe(pass.easuTarget);
    expect(mock.drawn[0].inputTex).toBe(input.texture);
    expect(mock.drawn[0].inputSize).toEqual([800, 500]);
    expect(mock.drawn[0].outputSize).toEqual([1920, 1200]);
    expect(mock.drawn[0].autoClear).toBe(false);

    expect(mock.drawn[1].matName).toBe("hb_fsr_rcas");
    expect(mock.drawn[1].target).toBeNull();
    expect(mock.drawn[1].inputTex).toBe(pass.easuTarget.texture);
    expect(mock.drawn[1].texelSize).toEqual([1 / 1920, 1 / 1200]);
    expect(mock.drawn[1].sharpness).toBe(0.35);
    expect(mock.drawn[1].outputLinear).toBe(0);
    expect(mock.drawn[1].autoClear).toBe(false);

    // autoClear restored, state.reset() never invoked
    expect(mock.autoClear).toBe(true);
    expect(mock.state.reset).not.toHaveBeenCalled();

    // renderToScreen = false -> RCAS renders to outputBuffer and converts back to linear
    mock.drawn.length = 0;
    pass.renderToScreen = false;
    pass.render(mock as unknown as THREE.WebGLRenderer, input, output);
    expect(mock.drawn).toHaveLength(2);
    expect(mock.drawn[0].target).toBe(pass.easuTarget);
    expect(mock.drawn[1].target).toBe(output);
    expect(mock.drawn[1].outputLinear).toBe(1);
    expect(mock.autoClear).toBe(true);

    // Null inputBuffer is a safe no-op
    mock.drawn.length = 0;
    pass.render(mock as unknown as THREE.WebGLRenderer, null, output);
    expect(mock.drawn).toHaveLength(0);

    input.dispose();
    output.dispose();
    pass.dispose();
  });

  it("restores renderer.autoClear even when a pass render throws and clamps setSharpness", () => {
    const pass = new Fsr1Pass();
    pass.setSharpness(-2);
    expect(pass.sharpness).toBe(0);
    pass.setSharpness(5);
    expect(pass.sharpness).toBe(1);
    pass.setSharpness(Number.NaN);
    expect(pass.sharpness).toBe(FSR_DEFAULT_SHARPNESS);

    const input = new THREE.WebGLRenderTarget(640, 400);
    const mock = makeMockRenderer({ failOnRender: 1, autoClear: true });
    expect(() => pass.render(mock as unknown as THREE.WebGLRenderer, input, null)).toThrow("fsr1 gpu error");
    expect(mock.autoClear).toBe(true);
    expect(mock.state.reset).not.toHaveBeenCalled();

    input.dispose();
    pass.dispose();
  });

  it("exposes hb_fsr_easu and hb_fsr_rcas in preparationEntries() and disposes all GPU resources cleanly", () => {
    const pass = new Fsr1Pass();
    const entries = pass.preparationEntries();
    expect(entries).toHaveLength(2);

    const matNames = entries.map((e) => (((e.root as THREE.Scene).children[0] as THREE.Mesh).material as THREE.ShaderMaterial).name);
    expect(matNames).toEqual(["hb_fsr_easu", "hb_fsr_rcas"]);
    expect(entries[0].target()).toBe(pass.easuTarget);
    expect(entries[1].target()).toBeNull();
    expect(entries[0].camera).toBe(pass.passCamera);
    expect(entries[1].camera).toBe(pass.passCamera);

    const onTargetDispose = vi.fn();
    const onEasuDispose = vi.fn();
    const onRcasDispose = vi.fn();
    const quadGeo = ((pass.easuScene.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry);
    const onGeoDispose = vi.fn();

    pass.easuTarget.addEventListener("dispose", onTargetDispose);
    pass.easuMat.addEventListener("dispose", onEasuDispose);
    pass.rcasMat.addEventListener("dispose", onRcasDispose);
    quadGeo.addEventListener("dispose", onGeoDispose);

    pass.dispose();
    // Second dispose is a safe no-op
    pass.dispose();

    expect(onTargetDispose).toHaveBeenCalledTimes(1);
    expect(onEasuDispose).toHaveBeenCalledTimes(1);
    expect(onRcasDispose).toHaveBeenCalledTimes(1);
    expect(onGeoDispose).toHaveBeenCalledTimes(1);
  });
});
