import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { LightsSystem } from "./lights-system";
import { getLightsStore } from "./lights-service";
import { CameraRig } from "../engine/camera-rig";
import { TIERS } from "../engine/quality";
import { createWorldUniforms } from "../engine/uniforms";
import type { EngineContext } from "../engine/types";
import type { QualitySettings } from "../engine/quality";

function lightContext() {
  const camera = new THREE.PerspectiveCamera();
  const scene = new THREE.Scene();
  let changed: ((settings: QualitySettings, dpr: number) => void) | undefined;
  const unsubscribe = vi.fn();
  const quality = { settings: TIERS.medium, onChange: (fn: typeof changed) => { changed = fn; return unsubscribe; } };
  const renderer = {
    domElement: { height: 700 }, getRenderTarget: () => null,
    getClearColor: (out: THREE.Color) => out.setRGB(0, 0, 0), getClearAlpha: () => 1,
    setRenderTarget: vi.fn(), setClearColor: vi.fn(), clear: vi.fn(), render: vi.fn(),
  };
  const ctx = {
    camera, scene, renderer, rig: new CameraRig(camera), uniforms: createWorldUniforms(),
    services: new Map<string, unknown>([["quality", quality], ["materials", { pool: { uPoolTex: { value: null }, uPoolBounds: { value: new THREE.Vector4() } } }]]),
  } as unknown as EngineContext;
  return { ctx, unsubscribe, publish: (settings: QualitySettings) => { quality.settings = settings; changed?.(settings, 1); } };
}

describe("light quality and zero glow visibility", () => {
  it("keeps sixteen shader slots while promoting only the tier budget with identical light values", () => {
    const { ctx, publish, unsubscribe } = lightContext();
    const lights = new LightsSystem();
    lights.init(ctx);
    const points = ctx.scene.children.filter((object) => object instanceof THREE.PointLight);
    const store = getLightsStore(ctx);
    for (let i = 0; i < 20; i++) store.add("lamp", [i * 3, 4, i * 2]);
    ctx.uniforms.uWindowGlow.value = 1;
    lights.update({ elapsed: 0, delta: 0, nowMs: 0 }, ctx);
    expect(points).toHaveLength(16);
    expect(points.filter((point) => point.visible)).toHaveLength(16);
    expect(points.filter((point) => point.intensity > 0)).toHaveLength(8);
    const firstFour = points.slice(0, 4).map((point) => ({
      position: point.position.toArray(), color: point.color.toArray(), distance: point.distance, intensity: point.intensity,
    }));
    for (const tier of ["low", "high", "medium", "low"] as const) {
      publish(TIERS[tier]);
      // A direct render between publication and update must not retain out-of-budget light.
      expect(points.slice(TIERS[tier].pointLights).every((point) => point.intensity === 0)).toBe(true);
      lights.update({ elapsed: 0, delta: 0, nowMs: 0 }, ctx);
      expect(points.filter((point) => point.visible)).toHaveLength(16);
      expect(points.filter((point) => point.intensity > 0)).toHaveLength(TIERS[tier].pointLights);
      expect(points.slice(0, 4).map((point) => ({
        position: point.position.toArray(), color: point.color.toArray(), distance: point.distance, intensity: point.intensity,
      }))).toEqual(firstFour);
      expect(points.slice(TIERS[tier].pointLights).every((point) => point.userData.base === 0)).toBe(true);
    }
    lights.dispose(ctx);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("skips only exactly zero glow, retaining every nonzero dawn/dusk contribution", () => {
    const { ctx } = lightContext();
    const lights = new LightsSystem();
    lights.init(ctx);
    const sprites = ctx.scene.getObjectByName("harbour-light-sprites") as THREE.Mesh;
    const pillars = ctx.scene.getObjectByName("harbour-light-pillars") as THREE.Mesh;
    for (const glow of [0, 1e-12, 0.01, 0.55, 1, 0]) {
      ctx.uniforms.uWindowGlow.value = glow;
      lights.update({ elapsed: 0, delta: 0, nowMs: 0 }, ctx);
      expect(sprites.visible).toBe(glow !== 0);
      expect(pillars.visible).toBe(glow !== 0);
    }
    expect((sprites.material as THREE.Material).depthWrite).toBe(false);
    expect((pillars.material as THREE.Material).depthWrite).toBe(false);
    lights.dispose(ctx);
  });

  it("borrows the ground texture for pillar masking without disposing its owner's target", () => {
    const { ctx } = lightContext();
    const target = new THREE.WebGLRenderTarget(2, 2);
    const dispose = vi.fn(() => target.dispose());
    ctx.services.set("ground", {
      texture: target.texture, bounds: [0, 0, 2, 2], size: 2,
      heights: new Float32Array(4), heightAt: () => -8, dispose,
    });
    const lights = new LightsSystem();
    lights.init(ctx);
    const pillars = ctx.scene.getObjectByName("harbour-light-pillars") as THREE.Mesh;
    expect((pillars.material as THREE.ShaderMaterial).uniforms.uGround.value).toBe(target.texture);
    lights.dispose(ctx);
    expect(dispose).not.toHaveBeenCalled();
    dispose();
  });
});
