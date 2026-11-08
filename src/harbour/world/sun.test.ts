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
    const rig = new SunRig(2048), quality = { settings: TIERS.low };
    const renderer = { shadowMap: { needsUpdate: false, autoUpdate: false } };
    const ctx = { uniforms: createWorldUniforms(), services: new Map<string, unknown>([["quality", quality], ["ocean", {}]]), renderer, camera: new THREE.PerspectiveCamera() } as unknown as EngineContext;
    vi.spyOn(rig as unknown as { fitShadow(): boolean }, "fitShadow").mockReturnValue(false);
    const resolve = vi.spyOn(SeaShadowMask.prototype, "resolve").mockReturnValue(true);
    const map = new THREE.WebGLRenderTarget(2048, 2048); map.depthTexture = new THREE.DepthTexture(2048, 2048);
    rig.key.shadow.map = map;
    for (let i = 0; i < 5; i++) { renderer.shadowMap.needsUpdate = false; rig.update(ctx, 1 / 60); }
    expect(resolve).not.toHaveBeenCalled(); expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0);
    const mask = (rig as unknown as { seaMask: { rt: unknown } }).seaMask;
    expect(mask.rt).toBeNull();

    quality.settings = TIERS.medium;
    renderer.shadowMap.needsUpdate = true;
    rig.update(ctx, 0); // A pending map must not enable sampling an old mask.
    expect(resolve).not.toHaveBeenCalled(); expect(sunShadowUniforms.uKeyShadowP.value.x).toBe(0);
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
