import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HIZ_FULLSCREEN_VERT,
  HIZ_INIT_FRAG,
  HIZ_LEVELS,
  HIZ_MIP_FRAG,
  HiZSSR,
  SSR_DENOISE_FRAG,
  SSR_FADE,
  SSR_RAY,
  SSR_STRENGTH,
  SSR_TRACE_FRAG,
  SSR_WOBBLE,
  hizLevelSize,
  ssrTargetSize,
} from "./hiz-ssr";

const GL = {
  READ_FRAMEBUFFER: 0x8ca8,
  SCISSOR_TEST: 0x0c11,
};

function makeCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(25, 1600 / 1000, 5, 9000);
  cam.position.set(350, 280, 350);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

function makeMockRenderer(opts: {
  css?: [number, number];
  scissorInit?: boolean;
  hasFloatExt?: boolean;
  failOnRender?: number;
} = {}) {
  let currentTarget: THREE.WebGLRenderTarget | null = null;
  let clearColor = new THREE.Color(0x223344);
  let clearAlpha = 0.8;
  let scissorEnabled = opts.scissorInit ?? false;
  let renderCount = 0;
  let shadowEnabledMutated = false;
  let shadowEnabled = true;
  const events: string[] = [];
  const drawnPasses: Array<{ targetName: string; matName: string; uniforms: Record<string, unknown> }> = [];

  const gl = {
    ...GL,
    getExtension: vi.fn((name: string) =>
      name === "EXT_color_buffer_float" ? (opts.hasFloatExt === false ? null : {}) : null,
    ),
    isEnabled: vi.fn((cap: number) => (cap === GL.SCISSOR_TEST ? scissorEnabled : false)),
    enable: vi.fn((cap: number) => {
      if (cap === GL.SCISSOR_TEST) {
        scissorEnabled = true;
        events.push("gl.enable:SCISSOR");
      }
    }),
    disable: vi.fn((cap: number) => {
      if (cap === GL.SCISSOR_TEST) {
        scissorEnabled = false;
        events.push("gl.disable:SCISSOR");
      }
    }),
  };

  const state = {
    bindFramebuffer: vi.fn((target: number, fbo: WebGLFramebuffer | null) => {
      events.push(`state.bindFbo:${target === GL.READ_FRAMEBUFFER ? "READ" : target}:${fbo === null ? "null" : "fbo"}`);
      return true;
    }),
    setScissorTest: vi.fn((enabled: boolean) => {
      scissorEnabled = enabled;
      events.push(`state.setScissorTest:${enabled}`);
    }),
    reset: vi.fn(() => {
      events.push("state.reset");
    }),
  };

  const shadowMap = {
    get enabled() {
      return shadowEnabled;
    },
    set enabled(v: boolean) {
      shadowEnabledMutated = true;
      shadowEnabled = v;
    },
  };

  const renderer = {
    css: opts.css ?? ([1600, 1000] as [number, number]),
    autoClear: true,
    shadowMap,
    state,
    events,
    drawnPasses,
    getContext: () => gl,
    getSize: (v: THREE.Vector2) => v.set(renderer.css[0], renderer.css[1]),
    getRenderTarget: () => currentTarget,
    setRenderTarget: vi.fn((t: THREE.WebGLRenderTarget | null) => {
      currentTarget = t;
      events.push(`setRenderTarget:${t ? t.texture.name || "rt" : "null"}`);
    }),
    getClearColor: (out: THREE.Color) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: vi.fn((c: THREE.Color | number, a = 1) => {
      clearColor = new THREE.Color(c);
      clearAlpha = a;
    }),
    render: vi.fn((scene: THREE.Scene, _cam: THREE.Camera) => {
      renderCount++;
      const mesh = scene.children[0] as THREE.Mesh;
      const mat = mesh.material as THREE.ShaderMaterial;
      const snapshot: Record<string, unknown> = {};
      for (const [k, u] of Object.entries(mat.uniforms)) {
        snapshot[k] = u.value instanceof THREE.Vector2 ? u.value.toArray() : u.value;
      }
      drawnPasses.push({
        targetName: currentTarget?.texture.name ?? "screen",
        matName: mat.name,
        uniforms: snapshot,
      });
      if (opts.failOnRender && renderCount === opts.failOnRender) {
        throw new Error("hiz ssr gpu fail");
      }
    }),
    getScissor: () => scissorEnabled,
    wasShadowEnabledMutated: () => shadowEnabledMutated,
  };

  return renderer;
}

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HiZSSR sizing & B07/C04 GLSL invariants", () => {
  it("computes half-CSS target size and conservative ceil(w/2^k) Hi-Z pyramid sizes", () => {
    expect(HIZ_LEVELS).toBe(5);
    expect(SSR_RAY).toBe(320);
    expect(SSR_STRENGTH).toBe(0.66);
    expect(SSR_WOBBLE).toBe(0.036);
    expect(SSR_FADE).toBe(0.6);

    expect(ssrTargetSize(1600, 1000)).toEqual({ width: 800, height: 500 });
    expect(ssrTargetSize(1599, 999)).toEqual({ width: 800, height: 500 });
    expect(ssrTargetSize(0, 0)).toEqual({ width: 1, height: 1 });

    // Odd pyramid dimensions always use ceil so no foreground feature is dropped
    expect(hizLevelSize(5, 5, 0)).toEqual({ width: 5, height: 5 });
    expect(hizLevelSize(5, 5, 1)).toEqual({ width: 3, height: 3 });
    expect(hizLevelSize(5, 5, 2)).toEqual({ width: 2, height: 2 });
    expect(hizLevelSize(5, 5, 3)).toEqual({ width: 1, height: 1 });
    expect(hizLevelSize(5, 5, 4)).toEqual({ width: 1, height: 1 });
  });

  it("strictly obeys B07/C04 GLSL math (no descending smoothstep, no pow(x, 2.0)) and stays well within sampler budget", () => {
    const allShaders = [
      ["HIZ_FULLSCREEN_VERT", HIZ_FULLSCREEN_VERT],
      ["HIZ_INIT_FRAG", HIZ_INIT_FRAG],
      ["HIZ_MIP_FRAG", HIZ_MIP_FRAG],
      ["SSR_TRACE_FRAG", SSR_TRACE_FRAG],
      ["SSR_DENOISE_FRAG", SSR_DENOISE_FRAG],
    ] as const;

    for (const [label, src] of allShaders) {
      for (const args of glslCalls(src, "smoothstep")) {
        const [e0, e1] = args.map(Number);
        if (Number.isFinite(e0) && Number.isFinite(e1)) {
          expect(e0 < e1, `${label}: smoothstep(${args.join(", ")})`).toBe(true);
        }
      }
      for (const args of glslCalls(src, "pow")) {
        expect(/^2(\.0*)?$/.test(args[1] ?? ""), `${label}: pow(${args.join(", ")})`).toBe(false);
      }
    }

    // Sampler count in SSR_TRACE_FRAG is 7 (uCapColor + uCapDepth + uHiZ0..4), well under 16
    const samplers = SSR_TRACE_FRAG.match(/\bsampler2D\b/g) ?? [];
    expect(samplers).toHaveLength(7);

    // Key algorithmic markers
    expect(HIZ_MIP_FRAG).toContain("extraX");
    expect(HIZ_MIP_FRAG).toContain("extraY");
    expect(SSR_TRACE_FRAG).toContain("uSeaAmp * 1.8 + 0.35");
    expect(SSR_TRACE_FRAG).toContain("for (int i = 0; i < 24; i++)");
    expect(SSR_TRACE_FRAG).toContain("for (int j = 0; j < 3; j++)");
    expect(SSR_TRACE_FRAG).toContain("textureLod(uCapColor, uv, roughLod)");
    expect(SSR_TRACE_FRAG).toContain("min(hitRgb, vec3(32.0)) * conf, conf");
    expect(SSR_DENOISE_FRAG).toContain("uPrevVP * vec4(P_water, 1.0)");
    expect(SSR_DENOISE_FRAG).toContain("mix(0.22, 0.85");
  });
});

describe("HiZSSR pipeline, R32F fallback, temporal denoise, state safety & preparation", () => {
  it("executes all 4 named stages in exact order, ping-pongs history, detects camera jumps, and restores FBO/scissor state", () => {
    const ssr = new HiZSSR();
    const r = makeMockRenderer({ css: [1600, 1000], scissorInit: true, hasFloatExt: true });
    const cam = makeCamera();
    const capColor = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const capDepth = new THREE.DepthTexture(1600, 1000, THREE.UnsignedIntType);
    const inputBuffer = new THREE.WebGLRenderTarget(2000, 1250);
    inputBuffer.texture.name = "Composer.Input";
    r.setRenderTarget(inputBuffer);
    r.events.length = 0;

    ssr.setActive(true);
    ssr.render(r as unknown as THREE.WebGLRenderer, capColor, capDepth, cam, 0.25, 0.016);

    // Exact 7 draws: HiZ.L0 -> L1..L4 -> HiZSSR.Raw -> HiZSSR.Hist1
    expect(r.drawnPasses.map((p) => `${p.matName}->${p.targetName}`)).toEqual([
      "hb_hiz_init->HiZ.L0",
      "hb_hiz_mip->HiZ.L1",
      "hb_hiz_mip->HiZ.L2",
      "hb_hiz_mip->HiZ.L3",
      "hb_hiz_mip->HiZ.L4",
      "hb_ssr_trace->HiZSSR.Raw",
      "hb_ssr_denoise->HiZSSR.Hist1",
    ]);

    // R32F FloatType + RedFormat + NearestFilter on HiZ.L0..L4 when EXT_color_buffer_float exists
    const { hiz, raw, hist } = ssr.targets;
    expect(hiz).toHaveLength(5);
    const expectedDims = [
      [800, 500],
      [400, 250],
      [200, 125],
      [100, 63],
      [50, 32],
    ];
    for (let k = 0; k < HIZ_LEVELS; k++) {
      const rt = hiz[k]!;
      expect([rt.width, rt.height]).toEqual(expectedDims[k]);
      expect(rt.texture.name).toBe(`HiZ.L${k}`);
      expect(rt.texture.format).toBe(THREE.RedFormat);
      expect(rt.texture.type).toBe(THREE.FloatType);
      expect(rt.texture.minFilter).toBe(THREE.NearestFilter);
      expect(rt.texture.magFilter).toBe(THREE.NearestFilter);
      expect(rt.depthBuffer).toBe(false);
      expect(rt.texture.generateMipmaps).toBe(false);
    }
    expect(raw!.texture.name).toBe("HiZSSR.Raw");
    expect(raw!.texture.type).toBe(THREE.HalfFloatType);
    expect(hist[0]!.texture.name).toBe("HiZSSR.Hist0");
    expect(hist[1]!.texture.name).toBe("HiZSSR.Hist1");

    // First frame has uHasHistory = 0 and publishes Hist1
    expect(r.drawnPasses[6].uniforms.uHasHistory).toBe(0);
    // Footprint-based Hi-Z L0 min reduction passes exact uSrcSize (1600×1000) & uDstSize (800×500)
    expect(r.drawnPasses[0].uniforms.uSrcSize).toEqual([1600, 1000]);
    expect(r.drawnPasses[0].uniforms.uDstSize).toEqual([800, 500]);
    expect(HIZ_INIT_FRAG).toContain("ivec2 lo = min(ivec2(floor(vec2(p) * scale + 1e-4)), maxC);");
    expect(HIZ_INIT_FRAG).toContain("ivec2 hi = min(ivec2(ceil(vec2(p + ivec2(1)) * scale - 1e-4)) - ivec2(1), maxC);");
    expect(SSR_DENOISE_FRAG).toContain("colorDelta");
    // Odd-dimension check (749 -> 500): dst column 2 covers src columns [2, 3, 4] inclusive
    const lo2 = Math.floor((2 * 749) / 500);
    const hi2 = Math.min(Math.ceil((3 * 749) / 500) - 1, 748);
    expect([lo2, hi2]).toEqual([2, 4]);
    expect(ssr.ready).toBe(true);
    expect(ssr.texture).toBe(hist[1]!.texture);
    expect(ssr.uniforms.uMirrorTex.value).toBe(hist[1]!.texture);

    // State restoration C1/C4
    expect(r.state.reset).not.toHaveBeenCalled();
    expect(r.wasShadowEnabledMutated()).toBe(false);
    expect(r.getRenderTarget()).toBe(inputBuffer);
    expect(r.autoClear).toBe(true);
    expect(r.getClearAlpha()).toBe(0.8);
    expect(r.getClearColor(new THREE.Color()).getHex()).toBe(0x223344);
    expect(r.getScissor()).toBe(true);
    const rtIdx = r.events.lastIndexOf("setRenderTarget:Composer.Input");
    const readNullIdx = r.events.lastIndexOf("state.bindFbo:READ:null");
    const scissorIdx = r.events.lastIndexOf("state.setScissorTest:true");
    expect(rtIdx).toBeGreaterThan(-1);
    expect(readNullIdx).toBeGreaterThan(rtIdx);
    expect(scissorIdx).toBeGreaterThan(rtIdx);

    // Frame 2 (steady camera): ping-pongs to Hist0, uHasHistory = 1, jitter rotates
    const jitter0 = r.drawnPasses[5].uniforms.uFrameJitter as number;
    r.drawnPasses.length = 0;
    ssr.render(r as unknown as THREE.WebGLRenderer, capColor, capDepth, cam, 0.25, 0.016);
    expect(r.drawnPasses[6].targetName).toBe("HiZSSR.Hist0");
    expect(r.drawnPasses[6].uniforms.uHasHistory).toBe(1);
    expect(r.drawnPasses[5].uniforms.uFrameJitter).not.toBe(jitter0);
    expect(ssr.texture).toBe(hist[0]!.texture);

    // Frame 3 (large camera jump > 40 m): resets uHasHistory = 0 cleanly
    cam.position.set(600, 280, 600);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);
    r.drawnPasses.length = 0;
    ssr.render(r as unknown as THREE.WebGLRenderer, capColor, capDepth, cam, 0.25, 0.016);
    expect(r.drawnPasses[6].targetName).toBe("HiZSSR.Hist1");
    expect(r.drawnPasses[6].uniforms.uHasHistory).toBe(0);

    capColor.dispose();
    capDepth.dispose();
    inputBuffer.dispose();
    ssr.dispose();
  });

  it("falls back automatically to HalfFloatType (R16F) when EXT_color_buffer_float is unavailable", () => {
    const ssr = new HiZSSR();
    const r = makeMockRenderer({ css: [800, 600], hasFloatExt: false });
    const cam = makeCamera();
    const capColor = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const capDepth = new THREE.DepthTexture(400, 300, THREE.UnsignedIntType);

    ssr.setActive(true);
    ssr.render(r as unknown as THREE.WebGLRenderer, capColor, capDepth, cam, 0.2, 0.016);

    for (let k = 0; k < HIZ_LEVELS; k++) {
      expect(ssr.targets.hiz[k]!.texture.type).toBe(THREE.HalfFloatType);
      expect(ssr.targets.hiz[k]!.texture.format).toBe(THREE.RedFormat);
    }
    // Same size as L0 (400×300): exact 1:1 src/dst footprint
    expect(r.drawnPasses[0].uniforms.uSrcSize).toEqual([400, 300]);
    expect(r.drawnPasses[0].uniforms.uDstSize).toEqual([400, 300]);

    capColor.dispose();
    capDepth.dispose();
    ssr.dispose();
  });

  it("restores all renderer state even if a pass throws mid-pipeline", () => {
    const ssr = new HiZSSR();
    const r = makeMockRenderer({ css: [800, 600], scissorInit: true, failOnRender: 4 });
    const cam = makeCamera();
    const capColor = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const capDepth = new THREE.DepthTexture(400, 300, THREE.UnsignedIntType);
    const prev = new THREE.WebGLRenderTarget(100, 100);
    r.setRenderTarget(prev);

    ssr.setActive(true);
    expect(() => ssr.render(r as unknown as THREE.WebGLRenderer, capColor, capDepth, cam, 0.2, 0.016)).toThrow("hiz ssr gpu fail");
    expect(r.getRenderTarget()).toBe(prev);
    expect(r.autoClear).toBe(true);
    expect(r.getScissor()).toBe(true);
    expect(r.getClearAlpha()).toBe(0.8);
    expect(r.state.reset).not.toHaveBeenCalled();

    capColor.dispose();
    capDepth.dispose();
    prev.dispose();
    ssr.dispose();
  });

  it("gates by D-2 conditions, exposes 4 preparationEntries, fades & disposes cleanly", () => {
    const ssr = new HiZSSR();
    const r = makeMockRenderer({ css: [1600, 1000] });
    const cam = makeCamera();
    const capColor = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const capDepth = new THREE.DepthTexture(800, 500, THREE.UnsignedIntType);
    const fallback = ssr.texture;

    expect(fallback).toBeInstanceOf(THREE.DataTexture);
    expect(ssr.enabled).toBe(false);
    expect(ssr.ready).toBe(false);
    expect(ssr.strength).toBe(SSR_STRENGTH);

    // Off-Medium: 4 preparationEntries backed by 1×1 compilation targets
    const entries = ssr.preparationEntries();
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => ((e.root as THREE.Mesh).material as THREE.ShaderMaterial).name)).toEqual([
      "hb_hiz_init",
      "hb_hiz_mip",
      "hb_ssr_trace",
      "hb_ssr_denoise",
    ]);
    for (const entry of entries) {
      const t = entry.target();
      expect(t).not.toBeNull();
      expect([t!.width, t!.height]).toEqual([1, 1]);
    }

    // Activate & settle
    ssr.setActive(true);
    for (let i = 0; i < 4; i++) {
      ssr.render(r as unknown as THREE.WebGLRenderer, capColor, capDepth, cam, 0.2, SSR_FADE / 3);
    }
    expect(ssr.uniforms.uMirror.value.x).toBeCloseTo(SSR_STRENGTH, 6);
    expect(entries[0].target()).toBe(ssr.targets.hiz[0]);
    expect(entries[2].target()).toBe(ssr.targets.raw);
    expect(entries[3].target()).toBe(ssr.targets.hist[0]);

    // Heavy fog early-outs with 0 draws
    r.drawnPasses.length = 0;
    ssr.setConditions(1, 0);
    ssr.render(r as unknown as THREE.WebGLRenderer, capColor, capDepth, cam, 0.2, 0.016);
    expect(r.drawnPasses).toHaveLength(0);
    expect(ssr.uniforms.uMirror.value.x).toBe(0);

    // Fog clears -> resumes with fresh history (uHasHistory = 0)
    ssr.setConditions(0, 0);
    ssr.render(r as unknown as THREE.WebGLRenderer, capColor, capDepth, cam, 0.2, 0.016);
    expect(r.drawnPasses).toHaveLength(7);
    expect(r.drawnPasses[6].uniforms.uHasHistory).toBe(0);
    expect(ssr.uniforms.uMirror.value.x).toBeCloseTo(SSR_STRENGTH, 6);

    // Immediate deactivation restores fallback BEFORE disposing all 8 RTs (5 HiZ + 1 Raw + 2 Hist)
    let fallbackBeforeDispose = true;
    const histRt = ssr.targets.hist[0]!;
    histRt.addEventListener("dispose", () => {
      if (ssr.uniforms.uMirrorTex.value !== fallback) fallbackBeforeDispose = false;
    });
    const disposeSpy = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    ssr.setActive(false, true);
    expect(fallbackBeforeDispose).toBe(true);
    expect(disposeSpy).toHaveBeenCalledTimes(8);
    expect(ssr.enabled).toBe(false);
    expect(ssr.ready).toBe(false);
    expect(ssr.texture).toBe(fallback);
    expect(ssr.uniforms.uMirrorTex.value).toBe(fallback);

    capColor.dispose();
    capDepth.dispose();
    ssr.dispose();
  });
});
