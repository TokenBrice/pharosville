import type { Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { TIERS } from "../engine/quality";
import { SeaShadowMask, sunShadowUniforms } from "./sun-shadow";
import { SunRig } from "./sun";

afterEach(() => vi.restoreAllMocks());

describe("sea-shadow consumer ownership", () => {
  it("does no low-tier allocation/resolve/mips and resumes only with a completed matching map", () => {
    const rig = new SunRig(1024), quality = { settings: TIERS.low };
    const renderer = { shadowMap: { needsUpdate: false, autoUpdate: false } };
    const ctx = { uniforms: createWorldUniforms(), services: new Map<string, unknown>([["quality", quality], ["ocean", {}]]) as Services, renderer, camera: new THREE.PerspectiveCamera() } as unknown as EngineContext;
    vi.spyOn(rig as unknown as { fitShadow(): boolean }, "fitShadow").mockReturnValue(false);
    const resolve = vi.spyOn(SeaShadowMask.prototype, "resolve").mockReturnValue(true);
    const lowMap = new THREE.WebGLRenderTarget(1024, 1024); lowMap.depthTexture = new THREE.DepthTexture(1024, 1024);
    rig.key.shadow.map = lowMap;
    for (let i = 0; i < 5; i++) { renderer.shadowMap.needsUpdate = false; rig.update(ctx, 1 / 60); }
    expect(resolve).not.toHaveBeenCalled(); expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0);
    const mask = (rig as unknown as { seaMask: { rt: unknown } }).seaMask;
    expect(mask.rt).toBeNull();

    quality.settings = TIERS.medium;
    renderer.shadowMap.needsUpdate = true;
    rig.update(ctx, 0); // A pending map must not enable sampling an old mask.
    expect(resolve).not.toHaveBeenCalled(); expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0);
    const map = new THREE.WebGLRenderTarget(2048, 2048); map.depthTexture = new THREE.DepthTexture(2048, 2048);
    rig.key.shadow.map = map;
    const matching = rig.key.shadow.matrix.clone().makeTranslation(3, 4, 5);
    rig.key.shadow.matrix.copy(matching);
    renderer.shadowMap.needsUpdate = false;
    rig.update(ctx, 0);
    expect(resolve).toHaveBeenLastCalledWith(ctx.renderer, map.depthTexture, 2048, matching);
    expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(1);

    quality.settings = TIERS.low; rig.update(ctx, 0);
    expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0); expect(mask.rt).toBeNull();
    const count = resolve.mock.calls.length;
    quality.settings = TIERS.high; rig.update(ctx, 0); // New map size destroys the old depth attachment.
    expect(resolve).toHaveBeenCalledTimes(count); expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0);
    const richer = new THREE.WebGLRenderTarget(4096, 4096); richer.depthTexture = new THREE.DepthTexture(4096, 4096);
    rig.key.shadow.map = richer; renderer.shadowMap.needsUpdate = false;
    rig.update(ctx, 0);
    expect(resolve).toHaveBeenLastCalledWith(ctx.renderer, richer.depthTexture, 4096, rig.key.shadow.matrix);
    expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(1);
    ctx.services.delete("ocean"); rig.update(ctx, 0);
    expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0);
    rig.dispose();
  });
});

describe("B10 shadow cadence", () => {
  it.each(["medium", "low"] as const)("keeps %s cadence/minimum frames, with immediate fit and tier invalidation", (tier) => {
    const rig = new SunRig(TIERS[tier].shadowMapSize), quality = { settings: TIERS[tier] };
    const renderer = { shadowMap: { needsUpdate: false, autoUpdate: true } };
    const ctx = { uniforms: createWorldUniforms(), services: new Map([["quality", quality]]) as unknown as Services,
      renderer, camera: new THREE.PerspectiveCamera() } as unknown as EngineContext;
    const fit = vi.spyOn(rig as unknown as { fitShadow(): boolean }, "fitShadow").mockReturnValue(false);
    const tick = (dt: number) => { renderer.shadowMap.needsUpdate = false; rig.update(ctx, dt); return renderer.shadowMap.needsUpdate; };
    expect(tick(0)).toBe(true);
    expect(tick(1)).toBe(false); // Even a one-second frame cannot bypass the two-frame interval guard.
    expect(tick(0)).toBe(true);
    expect(tick(0)).toBe(false);
    expect(tick(TIERS[tier].shadowInterval - 1e-6)).toBe(false);
    expect(tick(2e-6)).toBe(true);
    fit.mockReturnValueOnce(true);
    expect(tick(0)).toBe(true); // A fit change bypasses the interval and minimum-frame guards.
    quality.settings = TIERS.high;
    expect(tick(0)).toBe(true);
    expect(rig.key.shadow.mapSize.toArray()).toEqual([4096, 4096]);
    expect(tick(0)).toBe(true);
    expect(renderer.shadowMap.autoUpdate).toBe(false);
    rig.dispose();
  });
});
