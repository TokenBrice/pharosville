import type { Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { preparationMaterial } from "../engine/prepare";
import { TIERS, type QualitySettings } from "../engine/quality";
import { MIRROR_STRENGTH, MirrorPass, mirrorTargetSize, OCEAN_FRAG_MIRROR } from "./mirror-pass";
import { OCEAN_FRAG } from "./ocean-material";
import { OceanSystem } from "./ocean-system";

vi.mock("../engine/extras", () => ({ extraEnabled: (name: string) => name === "mirror" }));
vi.mock("./textures", () => ({ acquireFxTextures: async () => ({ noise: new THREE.Texture(), ripple: new THREE.Texture(), release() {} }) }));
vi.mock("./sdf-image", () => ({ loadSdfImage: async () => ({ width: 1, height: 1, data: new Uint8Array(4), coast: new Uint8Array(1) }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** A renderer whose CSS size and drawing buffer differ by `dpr` (DPR, the B25 clamp or supersampling). */
function fakeRenderer(css: [number, number], dpr: number) {
  const calls: Array<THREE.WebGLRenderTarget | null> = [];
  let current: THREE.WebGLRenderTarget | null = null;
  const renderer = {
    css, dpr, calls, fail: false,
    getSize: (v: THREE.Vector2) => v.set(renderer.css[0], renderer.css[1]),
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(Math.floor(renderer.css[0] * renderer.dpr), Math.floor(renderer.css[1] * renderer.dpr)),
    getRenderTarget: () => current,
    setRenderTarget: (target: THREE.WebGLRenderTarget | null) => { current = target; calls.push(target); },
    render: () => { if (renderer.fail) throw new Error("lost"); },
  };
  return renderer;
}

function pass(css: [number, number], dpr: number) {
  const camera = new THREE.PerspectiveCamera(25, css[0] / css[1], 5, 9000);
  camera.position.set(100, 140, 260); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const mirror = new MirrorPass(camera), renderer = fakeRenderer(css, dpr);
  (mirror as unknown as { renderer: unknown }).renderer = renderer;
  return { mirror, renderer, camera };
}

/** Frames until the fade has run its course (MIRROR_FADE). */
const settle = (p: MirrorPass, renderer: unknown, input = new THREE.WebGLRenderTarget(1, 1)) => {
  for (let i = 0; i < 4; i++) p.render(renderer as THREE.WebGLRenderer, input, null, 0.25);
};
const size = (p: MirrorPass) => { const t = p.texture as THREE.Texture & { image: { width: number; height: number } }; return [t.image.width, t.image.height]; };

describe("E35 mirror target", () => {
  it("is half the CSS size, never the drawing buffer", () => {
    expect(mirrorTargetSize(1600, 1000)).toEqual({ width: 800, height: 500 });
    expect(mirrorTargetSize(1599, 999)).toEqual({ width: 800, height: 500 });
    expect(mirrorTargetSize(0, 0)).toEqual({ width: 1, height: 1 });
  });

  // DPR 1 and 2; a 2560×1600 @2 display under the B25 4 MP backing clamp (≈ 1.25); a 1× screen supersampled to 2
  it.each([[[1600, 1000], 1], [[1600, 1000], 2], [[2560, 1600], 1.25], [[1920, 1080], 2]] as const)("CSS %j at backing ×%s", (css, dpr) => {
    const { mirror, renderer } = pass([css[0], css[1]], dpr);
    mirror.setActive(true);
    const want = [Math.ceil(css[0] / 2), Math.ceil(css[1] / 2)];
    expect(size(mirror)).toEqual(want);
    // the composer hands every pass the drawing buffer: ignored
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    mirror.setSize(buffer.x, buffer.y);
    expect(size(mirror)).toEqual(want);
    // a backing change alone (governor DPR rung) leaves the target as it is
    renderer.dpr = dpr * 1.5;
    mirror.setSize(Math.floor(css[0] * renderer.dpr), Math.floor(css[1] * renderer.dpr));
    expect(size(mirror)).toEqual(want);
    mirror.dispose();
  });

  it("follows a CSS resize and drops the stale reflection until the next march", () => {
    const { mirror, renderer } = pass([1600, 1000], 1);
    mirror.setActive(true);
    settle(mirror, renderer);
    expect(mirror.uniforms.uMirror.value.x).toBe(MIRROR_STRENGTH);
    renderer.css = [1200, 900];
    mirror.setSize(1200, 900);
    expect(size(mirror)).toEqual([600, 450]);
    expect(mirror.uniforms.uMirror.value.x).toBe(0);
    mirror.dispose();
  });
});

describe("E35 mirror pass", () => {
  it("never swaps the frame, needs the composer's depth and stays off until High", () => {
    const { mirror } = pass([1600, 1000], 1);
    expect(mirror.needsSwap).toBe(false);
    expect(mirror.needsDepthTexture).toBe(true);
    expect(mirror.enabled).toBe(false);
    expect(mirror.texture).toBeNull();
    const depth = new THREE.DepthTexture(1, 1);
    mirror.setDepthTexture(depth);
    expect((mirror.fullscreenMaterial as THREE.ShaderMaterial).uniforms.depthBuffer.value).toBe(depth);
    mirror.dispose();
  });

  it("publishes its reflection with the view-projection it was marched in, and restores the target", () => {
    const { mirror, renderer, camera } = pass([1600, 1000], 2);
    const before = new THREE.WebGLRenderTarget(1, 1), input = new THREE.WebGLRenderTarget(3200, 2000);
    renderer.setRenderTarget(before);
    mirror.render(renderer as unknown as THREE.WebGLRenderer, input);
    expect(renderer.calls).toEqual([before]);     // inactive: nothing drawn
    mirror.setActive(true);
    expect(mirror.uniforms.uMirror.value.x).toBe(0);  // no reflection exists yet: the ocean only writes its mask
    expect(mirror.uniforms.uMirror.value.z).toBe(1);
    mirror.render(renderer as unknown as THREE.WebGLRenderer, input);
    expect(renderer.calls.slice(1)).toEqual([expect.objectContaining({ texture: mirror.texture }), before]);
    const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    expect(mirror.uniforms.uMirrorVP.value.elements).toEqual(vp.elements);
    // the first reflection eases in (no pop on a tier switch), then holds the strength
    expect(mirror.uniforms.uMirror.value.x).toBeGreaterThan(0);
    expect(mirror.uniforms.uMirror.value.x).toBeLessThan(0.01);
    settle(mirror, renderer, input);
    expect(mirror.uniforms.uMirror.value.x).toBe(MIRROR_STRENGTH);
    const up = (mirror.fullscreenMaterial as THREE.ShaderMaterial).uniforms.uUp.value as THREE.Vector3;
    expect(up.clone().transformDirection(camera.matrixWorld).y).toBeCloseTo(1, 6);
    // a failure mid-pass (lost context, cancelled frame) still restores the caller's target
    renderer.fail = true;
    expect(() => mirror.render(renderer as unknown as THREE.WebGLRenderer, input)).toThrow("lost");
    expect(renderer.getRenderTarget()).toBe(before);
    mirror.dispose();
  });

  it("fades out on leaving High, then disposes its target; Low cuts at once; it re-creates the target on return", () => {
    const { mirror, renderer } = pass([1600, 1000], 1);
    const disposed = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    mirror.setActive(true);
    const first = mirror.texture!;
    settle(mirror, renderer);
    mirror.setActive(false);
    // still marching while the reflection eases out (Medium shares the mirror's ocean)
    const strengths: number[] = [];
    for (let i = 0; i < 2; i++) { mirror.render(renderer as unknown as THREE.WebGLRenderer, new THREE.WebGLRenderTarget(1, 1), null, 0.2); strengths.push(mirror.uniforms.uMirror.value.x); }
    expect(mirror.enabled).toBe(true); expect(mirror.texture).toBe(first);
    expect(strengths[0]).toBeLessThan(MIRROR_STRENGTH); expect(strengths[1]).toBeLessThan(strengths[0]); expect(strengths[1]).toBeGreaterThan(0);
    // back to High mid-fade keeps the target and eases in again
    mirror.setActive(true); expect(mirror.texture).toBe(first);
    mirror.setActive(false);
    settle(mirror, renderer);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(mirror.texture).toBeNull();
    expect(mirror.uniforms.uMirrorTex.value).toBeNull();
    expect(mirror.uniforms.uMirror.value.x).toBe(0);
    expect(mirror.uniforms.uMirror.value.z).toBe(0);
    expect(mirror.enabled).toBe(false);
    mirror.setActive(true);
    expect(mirror.texture).not.toBe(first);
    expect(mirror.uniforms.uMirrorTex.value).toBe(mirror.texture);
    // Low: the lite ocean has no mirror, so the target goes at once
    mirror.setActive(false, true);
    expect(mirror.texture).toBeNull(); expect(mirror.enabled).toBe(false);
    expect(disposed).toHaveBeenCalledTimes(2);
    mirror.setActive(true);
    const material = mirror.fullscreenMaterial as THREE.Material, gone = vi.fn();
    material.addEventListener("dispose", gone);
    mirror.dispose();
    expect(disposed).toHaveBeenCalledTimes(3);
    expect(gone).toHaveBeenCalled();
  });
});

describe("E35 the mirror's ocean", () => {
  it("patches the ocean (uniforms, mix, glint, mask) and leaves the shared text alone", () => {
    expect(OCEAN_FRAG_MIRROR).not.toBe(OCEAN_FRAG);
    for (const s of ["uniform sampler2D uMirrorTex;", "uMirrorVP * vec4(vWorld, 1.0)", "(1.0 - 0.85 * mirrorCov)", "0.05 + 0.45 * clamp(mirrorW"]) {
      expect(OCEAN_FRAG_MIRROR).toContain(s);
      expect(OCEAN_FRAG).not.toContain(s);
    }
  });

  it("is one program for Medium and High (no compile on the switch); Low keeps the lite ocean and the target goes", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const listeners = new Set<(q: QualitySettings) => void>();
    const quality = { tier: "medium", onChange: (fn: (q: QualitySettings) => void) => { listeners.add(fn); return () => listeners.delete(fn); } };
    const passes: unknown[] = [];
    const composer = { addPass: vi.fn((p: unknown, i: number) => passes.splice(i, 0, p)), removePass: vi.fn() };
    const ctx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), composer, uniforms: createWorldUniforms(), services: new Map<string, unknown>([
      ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-10, -10, 10, 10] } }], ["quality", quality],
    ]) as Services } as unknown as EngineContext;
    ctx.uniforms.uFoliage.value.y = 0;
    const system = new OceanSystem(); await system.init(ctx);
    expect(composer.addPass).toHaveBeenCalledWith(expect.any(MirrorPass), 1);
    const mirror = passes[0] as MirrorPass;
    const material = (ctx.scene.getObjectByName("ocean") as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(material.uniforms.uMirror).toBe(mirror.uniforms.uMirror);
    expect(material.customProgramCacheKey()).toBe("hb_ocean_0_0_m");
    expect(mirror.enabled).toBe(false);
    const version = material.version;
    const tier = (name: "low" | "medium" | "high") => { quality.tier = name; for (const fn of listeners) fn(TIERS[name]); };
    tier("high");
    expect(mirror.enabled).toBe(true); expect(mirror.texture).not.toBeNull();
    expect(material.version).toBe(version);
    tier("medium");
    // Medium keeps the same ocean program while the reflection fades out, then the target goes
    expect(mirror.enabled).toBe(true);
    settle(mirror, { getRenderTarget: () => null, setRenderTarget() {}, render() {} });
    expect(mirror.enabled).toBe(false); expect(mirror.texture).toBeNull();
    expect(material.version).toBe(version);
    tier("high"); expect(mirror.texture).not.toBeNull();
    tier("low");
    expect(mirror.enabled).toBe(false); expect(mirror.texture).toBeNull();
    expect(material.customProgramCacheKey()).toBe("hb_ocean_0_1");
    expect(material.version).toBe(version + 1);
    // the tier preparation for Medium/High compiles the mirror's ocean from Low
    const restore = ctx.services.get("ocean")!.preparationScope(false), owned = preparationMaterial(material);
    const shader = { ...THREE.ShaderLib.basic, fragmentShader: material.fragmentShader, uniforms: {}, defines: {} } as THREE.WebGLProgramParametersWithUniforms;
    owned.onBeforeCompile(shader, {} as THREE.WebGLRenderer); restore();
    expect(shader.fragmentShader).toBe(OCEAN_FRAG_MIRROR);
    expect(owned.customProgramCacheKey()).toBe("hb_ocean_0_0_m");
    owned.dispose();
    system.dispose(ctx);
    expect(composer.removePass).toHaveBeenCalledWith(mirror);
  });
});
