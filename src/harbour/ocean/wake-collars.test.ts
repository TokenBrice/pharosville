import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Services } from "../engine/services";
import type { EngineContext } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { TIERS, type QualitySettings } from "../engine/quality";
import { WAKE_COLLAR_FRAG, WAKE_COLLAR_VERT, WakeCollars } from "./wake-collars";
import { OceanSystem } from "./ocean-system";

vi.mock("../engine/extras", () => ({ extraEnabled: () => false }));
vi.mock("./textures", () => ({ acquireFxTextures: async () => ({ noise: new THREE.Texture(), ripple: new THREE.Texture(), release() {} }) }));
vi.mock("./sdf-image", () => ({ loadSdfImage: async () => ({ width: 1, height: 1, data: new Uint8Array(4), coast: new Uint8Array(1) }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function makeCollars(): WakeCollars {
  const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  return new WakeCollars({
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3(0, 120, 240) },
    uSea: { value: new THREE.Vector4(0.24, 0.55, 0, 1) },
    uSdfBounds: { value: new THREE.Vector4(-500, -500, 500, 500) },
    uSdf: { value: tex },
    uSceneCenter: { value: new THREE.Vector2(0, 0) },
    uNoise: { value: tex },
    uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.5).normalize() },
    uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uAmbient: { value: new THREE.Color(0.3, 0.35, 0.45) },
    uNight: { value: 0 },
  });
}

describe("WakeCollars (§6.2.2, High-only D-7)", () => {
  it("preserves the framebuffer water alpha mask, renders at renderOrder 61, and rides Gerstner + SDF damping", () => {
    const collars = makeCollars();
    const mat = collars.mesh.material;
    expect(collars.mesh.renderOrder).toBe(61);
    expect(collars.mesh.castShadow).toBe(false);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.side).toBe(THREE.FrontSide);
    expect(mat.blending).toBe(THREE.CustomBlending);
    expect(mat.blendSrc).toBe(THREE.SrcAlphaFactor);
    expect(mat.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    expect(mat.blendSrcAlpha).toBe(THREE.ZeroFactor);
    expect(mat.blendDstAlpha).toBe(THREE.OneFactor);
    expect(WAKE_COLLAR_VERT).toContain("hbShoreNormal(uSdf, suv, coast, inside)");
    expect(WAKE_COLLAR_VERT).toContain("hbOceanDisp(xz, uTime, amp, damp, camD, depth, coast, shoreN)");
    expect(WAKE_COLLAR_VERT).toContain("textureLod(uSdf, clamp(suv, 0.0, 1.0), 0.0)");
    expect(WAKE_COLLAR_FRAG).toContain("hbSwellPhase(vWorld.xz, uTime)");
    expect(WAKE_COLLAR_FRAG).toContain("vOarPhase + xOar * 0.18");
    collars.dispose();
  });

  it("ignores pushes and stays hidden on Medium/Low, uploads on flush in High, and clears per frame", () => {
    const collars = makeCollars();
    // Disabled by default (Medium/Low): push is a no-op with 0 draws
    collars.push(10, -20, 0.6, 0.8, 18, 4.8, 3.2, 0, 1.5);
    expect(collars.instances).toBe(0);
    expect(collars.mesh.visible).toBe(false);
    expect(collars.mesh.geometry.instanceCount).toBe(0);

    // Activate on High: push records hull + galley instances and flushes in onBeforeRender
    collars.setActive(true);
    collars.push(10, -20, 0.6, 0.8, 18, 4.8, 3.2, 0, 1.5);
    collars.push(30, 15, 0, 1, 22, 4.2, 2.4, 1, 4.1);
    expect(collars.instances).toBe(2);
    expect(collars.mesh.visible).toBe(true);
    collars.mesh.onBeforeRender({} as THREE.WebGLRenderer, new THREE.Scene(), new THREE.Camera(), collars.mesh.geometry, collars.mesh.material, {} as THREE.Group);
    expect(collars.mesh.geometry.instanceCount).toBe(2);
    const a = collars.mesh.geometry.getAttribute("aColA").array as Float32Array;
    const b = collars.mesh.geometry.getAttribute("aColB").array as Float32Array;
    const c = collars.mesh.geometry.getAttribute("aColC").array as Float32Array;
    expect(Array.from(a.slice(0, 4)).map((v) => +v.toFixed(3))).toEqual([10, -20, 0.6, 0.8]);
    expect(Array.from(b.slice(0, 4)).map((v) => +v.toFixed(3))).toEqual([9, 2.4, 3.2, 0]);
    expect(Array.from(b.slice(4, 8)).map((v) => +v.toFixed(3))).toEqual([11, 2.1, 2.4, 1]);
    expect(+c[1].toFixed(3)).toBe(4.1);

    // Cleared at frame start
    collars.beginFrame();
    expect(collars.instances).toBe(0);
    expect(collars.mesh.visible).toBe(false);
    expect(collars.mesh.geometry.instanceCount).toBe(0);

    // Leaving High clears and disables pushes immediately
    collars.push(0, 0, 1, 0, 12, 3, 1.5, 0, 0);
    expect(collars.instances).toBe(1);
    collars.setActive(false);
    expect(collars.instances).toBe(0);
    expect(collars.mesh.visible).toBe(false);
    collars.push(0, 0, 1, 0, 12, 3, 1.5, 0, 0);
    expect(collars.instances).toBe(0);
    collars.dispose();
  });

  it("registers the wakeCollars service in OceanSystem and gates it strictly to High tier", async () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const listeners = new Set<(q: QualitySettings) => void>();
    const quality = { tier: "medium", onChange: (fn: (q: QualitySettings) => void) => { listeners.add(fn); return () => listeners.delete(fn); } };
    const ctx = {
      scene: new THREE.Scene(),
      uniforms: createWorldUniforms(),
      services: new Map<string, unknown>([
        ["layout", { bounds: { min: [-10, 0, -10], max: [10, 10, 10] }, sea: { bounds: [-100, -100, 100, 100] } }],
        ["quality", quality],
      ]) as Services,
    } as unknown as EngineContext;
    const ocean = new OceanSystem();
    await ocean.init(ctx);
    const svc = ctx.services.get("wakeCollars");
    const mesh = ctx.scene.getObjectByName("ocean-wake-collars") as THREE.Mesh;
    expect(svc).toBeDefined();
    expect(mesh).toBeDefined();
    expect(mesh.renderOrder).toBe(61);

    // Medium tier: disabled (0 draws)
    svc!.push(0, 0, 0, 1, 14, 4, 2, 0, 0);
    expect(mesh.visible).toBe(false);

    // High tier: enabled
    quality.tier = "high";
    for (const fn of listeners) fn(TIERS.high);
    svc!.push(0, 0, 0, 1, 14, 4, 2, 0, 0);
    expect(mesh.visible).toBe(true);

    // Switching back to Medium disables and hides immediately
    quality.tier = "medium";
    for (const fn of listeners) fn(TIERS.medium);
    expect(mesh.visible).toBe(false);

    ocean.dispose(ctx);
    expect(ctx.services.get("wakeCollars")).toBeUndefined();
    expect(ctx.scene.getObjectByName("ocean-wake-collars")).toBeUndefined();
  });
});
