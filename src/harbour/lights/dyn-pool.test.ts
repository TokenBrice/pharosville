import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { Services } from "../engine/services";
import type { EngineContext } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { CameraRig } from "../engine/camera-rig";
import { TIERS, type QualitySettings } from "../engine/quality";
import { DYN_POOL_RES, DynPool } from "./dyn-pool";
import { LightsSystem } from "./lights-system";

function fakeRenderer() {
  let target: THREE.WebGLRenderTarget | null = null;
  let clearColor = new THREE.Color(0x112233);
  let clearAlpha = 0.75;
  const renderer = {
    domElement: { height: 700 },
    autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: vi.fn((t: THREE.WebGLRenderTarget | null) => { target = t; }),
    getClearColor: (out: THREE.Color) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: vi.fn((c: THREE.Color | number, a = 1) => { clearColor = new THREE.Color(c); clearAlpha = a; }),
    clear: vi.fn(),
    render: vi.fn(),
  };
  return renderer;
}

describe("DynPool (§6.3.2, High-only D-7)", () => {
  it("allocates its 512×512 RGBA16F RT only on High and disposes it immediately on leaving High", () => {
    const pool = new DynPool([-400, -400, 400, 400]);
    expect(pool.enabled).toBe(false);
    expect(pool.target).toBeNull();
    expect(pool.texture).toBeNull();

    // Pushes while inactive are ignored
    pool.light(10, 20, 4, 12, 1.0, 0.7, 0.3);
    expect(pool.pendingCount).toBe(0);

    // Entering High allocates 512×512 RGBA16F
    pool.setActive(true);
    expect(pool.enabled).toBe(true);
    expect(pool.target).not.toBeNull();
    expect([pool.target!.width, pool.target!.height]).toEqual([DYN_POOL_RES, DYN_POOL_RES]);
    expect(pool.target!.texture.type).toBe(THREE.HalfFloatType);
    expect(pool.target!.texture.format).toBe(THREE.RGBAFormat);

    const disposed = vi.fn();
    pool.target!.addEventListener("dispose", disposed);
    pool.setActive(false);
    expect(disposed).toHaveBeenCalledOnce();
    expect(pool.target).toBeNull();
    expect(pool.texture).toBeNull();
    pool.dispose();
  });

  it("renders 1 instanced draw ONLY when active && windowGlow > 0.02 && count > 0, then clears lights", () => {
    const pool = new DynPool([-400, -400, 400, 400]);
    const r = fakeRenderer();
    const prev = new THREE.WebGLRenderTarget(1, 1);
    r.setRenderTarget(prev);
    r.setRenderTarget.mockClear();

    pool.setActive(true);
    // Day (windowGlow <= 0.02): zero draws and lights still cleared
    pool.light(10, 20, 4, 12, 1.0, 0.7, 0.3);
    expect(pool.pendingCount).toBe(1);
    const dayRes = pool.render(r as unknown as THREE.WebGLRenderer, 0.01);
    expect(dayRes).toEqual({ texture: null, intensity: 0 });
    expect(r.render).not.toHaveBeenCalled();
    expect(pool.pendingCount).toBe(0);

    // Night with 0 lights: zero draws
    const emptyRes = pool.render(r as unknown as THREE.WebGLRenderer, 1.0);
    expect(emptyRes).toEqual({ texture: null, intensity: 0 });
    expect(r.render).not.toHaveBeenCalled();

    // Night with pushed lights: 1 instanced draw, renderer state restored, lights cleared
    pool.light(10, 20, 4, 12, 1.0, 0.7, 0.3);
    pool.light(-50, 30, 8, 14, 1.2, 0.6, 0.2);
    const nightRes = pool.render(r as unknown as THREE.WebGLRenderer, 0.8);
    expect(nightRes.texture).toBe(pool.texture);
    expect(nightRes.intensity).toBe(1);
    expect(r.render).toHaveBeenCalledOnce();
    expect(r.clear).toHaveBeenCalledOnce();
    expect(r.getRenderTarget()).toBe(prev);
    expect(r.autoClear).toBe(true);
    expect(r.getClearAlpha()).toBe(0.75);
    expect(pool.pendingCount).toBe(0);

    prev.dispose();
    pool.dispose();
  });

  it("wires dynPool service in LightsSystem over wake bounds and binds/unbinds ocean uDynPoolTex by tier and glow", () => {
    const camera = new THREE.PerspectiveCamera();
    const scene = new THREE.Scene();
    let changed: ((settings: QualitySettings, dpr: number) => void) | undefined;
    const quality = { settings: TIERS.medium, onChange: (fn: typeof changed) => { changed = fn; return () => {}; } };
    const r = fakeRenderer();
    const bindDynPool = vi.fn();
    const wakeBounds = [-640, -640, 640, 640] as [number, number, number, number];
    const ctx = {
      camera,
      scene,
      renderer: r,
      rig: new CameraRig(camera),
      uniforms: createWorldUniforms(),
      services: new Map<string, unknown>([
        ["motion", { reduced: false }],
        ["quality", quality],
        ["wake", { bounds: wakeBounds }],
        ["ocean", { bindDynPool }],
        ["materials", { pool: { uPoolTex: { value: null }, uPoolBounds: { value: new THREE.Vector4() }, uLampFar: { value: 1 } } }],
      ]) as Services,
    } as unknown as EngineContext;

    const lights = new LightsSystem();
    lights.init(ctx);
    const svc = ctx.services.get("dynPool");
    expect(svc).toBeDefined();
    expect((svc as DynPool).bounds).toEqual(wakeBounds);

    // Warm up static poolRT bake once (frame 0), then check steady-state Medium tier: inactive, 0 dynPool draws
    lights.update({ elapsed: 0, delta: 0.016, nowMs: 16 }, ctx);
    ctx.uniforms.uWindowGlow.value = 1;
    svc!.light(0, 0, 4, 10, 1, 0.7, 0.3);
    r.render.mockClear();
    bindDynPool.mockClear();
    lights.update({ elapsed: 0.016, delta: 0.016, nowMs: 32 }, ctx);
    expect(r.render).not.toHaveBeenCalled();
    expect(bindDynPool).toHaveBeenLastCalledWith(null, 0);

    // High tier at night: draws 1 instanced pass and binds live texture to ocean
    quality.settings = TIERS.high;
    changed?.(TIERS.high, 1);
    svc!.light(12, -8, 6, 12, 1, 0.75, 0.35);
    r.render.mockClear();
    bindDynPool.mockClear();
    lights.update({ elapsed: 0.016, delta: 0.016, nowMs: 32 }, ctx);
    expect(r.render).toHaveBeenCalledOnce();
    expect(bindDynPool).toHaveBeenLastCalledWith((svc as DynPool).texture, 1);

    // Leaving High unbinds BEFORE disposing the RT
    bindDynPool.mockClear();
    quality.settings = TIERS.medium;
    changed?.(TIERS.medium, 1);
    expect(bindDynPool).toHaveBeenLastCalledWith(null, 0);
    expect((svc as DynPool).target).toBeNull();

    lights.dispose(ctx);
    expect(ctx.services.get("dynPool")).toBeUndefined();
  });
});
