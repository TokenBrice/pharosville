import type { Services } from "../engine/services";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { LightsSystem, POINT_BUDGET, pointBudget } from "./lights-system";
import { getLightsStore } from "./lights-service";
import { CameraRig } from "../engine/camera-rig";
import { TIERS } from "../engine/quality";
import { createWorldUniforms } from "../engine/uniforms";
import type { EngineContext, PreparationEntry, PreparationService } from "../engine/types";
import type { QualitySettings } from "../engine/quality";

function lightContext(tier: keyof typeof TIERS = "medium") {
  const camera = new THREE.PerspectiveCamera();
  const scene = new THREE.Scene();
  let changed: ((settings: QualitySettings, dpr: number) => void) | undefined;
  const unsubscribe = vi.fn();
  const quality = { settings: TIERS[tier], onChange: (fn: typeof changed) => { changed = fn; return unsubscribe; } };
  const renderer = {
    domElement: { height: 700 }, getRenderTarget: () => null,
    getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    getClearColor: (out: THREE.Color) => out.setRGB(0, 0, 0), getClearAlpha: () => 1,
    setRenderTarget: vi.fn(), setClearColor: vi.fn(), clear: vi.fn(), render: vi.fn(),
  };
  const ctx = {
    camera, scene, renderer, rig: new CameraRig(camera), uniforms: createWorldUniforms(),
    services: new Map<string, unknown>([["motion", { reduced: false }], ["quality", quality], ["materials", { pool: { uPoolTex: { value: null }, uPoolBounds: { value: new THREE.Vector4() } } }]]) as Services,
  } as unknown as EngineContext;
  return { ctx, unsubscribe, publish: (settings: QualitySettings) => { quality.settings = settings; changed?.(settings, 1); } };
}

describe("light quality and zero glow visibility", () => {
  it("keeps sixteen shader slots while promoting only the tier budget with identical light values", () => {
    const { ctx, publish, unsubscribe } = lightContext();
    const lights = new LightsSystem();
    lights.init(ctx);
    ctx.rig.distance = 650; // the landing keeps the tier's whole budget (E09)
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

describe("B11 pool resizing", () => {
  const poolOf = (lights: LightsSystem) => (lights as unknown as { poolRT: THREE.WebGLRenderTarget }).poolRT;

  it("starts Low at 1024² and prepares the copy against the actual target", () => {
    const { ctx } = lightContext("low"), entries: PreparationEntry[] = [], off = vi.fn();
    ctx.services.set("preparation", { register: (entry: PreparationEntry) => { entries.push(entry); return off; } } as unknown as PreparationService);
    const lights = new LightsSystem(); lights.init(ctx);
    expect([poolOf(lights).width, poolOf(lights).height]).toEqual([1024, 1024]);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.target())).toEqual([poolOf(lights), poolOf(lights)]);
    const copy = (entries[1].root.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(copy.name).toBe("hb_pool_resize");
    lights.dispose(ctx); expect(off).toHaveBeenCalledTimes(2);
  });

  it("copies full RGBA pool contents and rebinds shared consumers before disposal, with no same-size churn", () => {
    const { ctx, publish } = lightContext(), lights = new LightsSystem(); lights.init(ctx);
    const pool = ctx.services.get("materials")!.pool.uPoolTex;
    const renderer = ctx.renderer as unknown as { render: ReturnType<typeof vi.fn> };
    for (const tier of ["low", "medium", "low", "high"] as const) {
      const previous = poolOf(lights), disposed = vi.fn(() => { expect(pool.value).toBe(poolOf(lights).texture); expect(pool.value).not.toBe(previous.texture); });
      previous.addEventListener("dispose", disposed);
      renderer.render.mockImplementationOnce((scene: THREE.Scene) => {
        const mat = (scene.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
        expect(mat.uniforms.uSource.value).toBe(previous.texture);
        expect(mat.fragmentShader).toContain("gl_FragColor = texture2D(uSource, vUv);");
        expect(pool.value).toBe(previous.texture); expect(disposed).not.toHaveBeenCalled();
      });
      publish(TIERS[tier]);
      expect(disposed).toHaveBeenCalledOnce();
      const target = poolOf(lights), size = tier === "low" ? 1024 : 2048;
      expect([target.width, target.height]).toEqual([size, size]);
      expect([target.texture.type, target.texture.format]).toEqual([THREE.HalfFloatType, THREE.RGBAFormat]);
      renderer.render.mockClear(); publish(TIERS[tier]);
      expect(renderer.render).not.toHaveBeenCalled(); expect(poolOf(lights)).toBe(target);
    }
    lights.dispose(ctx);
  });

  it("retains the old pool and renderer state if a resize copy fails", () => {
    const { ctx, publish } = lightContext(), lights = new LightsSystem(); lights.init(ctx);
    const previous = poolOf(lights), disposed = vi.fn(); previous.addEventListener("dispose", disposed);
    const renderer = ctx.renderer as unknown as { render: ReturnType<typeof vi.fn>; autoClear: boolean; setRenderTarget: ReturnType<typeof vi.fn> };
    renderer.autoClear = true;
    renderer.render.mockImplementationOnce(() => { throw new Error("copy failed"); });
    expect(() => publish(TIERS.low)).toThrow("copy failed");
    expect(disposed).not.toHaveBeenCalled();
    expect(poolOf(lights)).toBe(previous);
    expect(ctx.services.get("materials")!.pool.uPoolTex.value).toBe(previous.texture);
    expect(renderer.autoClear).toBe(true);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(null, 0, 0);
    lights.dispose(ctx);
  });
});

it("freezes the pillar's decorative clock after settling without sharing the live engine clock", () => {
  const { ctx } = lightContext(), lights = new LightsSystem();
  lights.init(ctx);
  const pillars = ctx.scene.getObjectByName("harbour-light-pillars") as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  const clock = pillars.material.uniforms.uTime;
  expect(clock).not.toBe(ctx.uniforms.uTime);
  lights.update({ delta: 1, elapsed: 1, nowMs: 1000 }, ctx);
  expect(clock.value).toBe(1);
  (ctx.services.get("motion") as { reduced: boolean }).reduced = true;
  for (let i = 0; i < 600; i++) lights.update({ delta: 1 / 60, elapsed: 1 + i / 60, nowMs: 1000 + i * 1000 / 60 }, ctx);
  const held = clock.value;
  for (let i = 0; i < 120; i++) { ctx.uniforms.uTime.value++; lights.update({ delta: 1 / 60, elapsed: 20 + i / 60, nowMs: 20000 + i * 1000 / 60 }, ctx); }
  expect(clock.value).toBe(held);
  lights.dispose(ctx);
});

describe("E09 lamp economy", () => {
  const lit = (ctx: EngineContext) => ctx.scene.children.filter((o): o is THREE.PointLight => o instanceof THREE.PointLight && o.intensity > 0);
  function night(tier: keyof typeof TIERS) {
    const { ctx, publish } = lightContext();
    const lights = new LightsSystem();
    lights.init(ctx);
    publish(TIERS[tier]);
    const store = getLightsStore(ctx);
    for (let i = 0; i < 20; i++) store.add("lamp", [i * 3, 4, i * 2]);
    ctx.uniforms.uWindowGlow.value = 1;
    const at = (distance: number) => { ctx.rig.distance = distance; lights.update({ elapsed: 0, delta: 0, nowMs: 0 }, ctx); return lit(ctx); };
    return { ctx, lights, at };
  }

  it("lights the tier's count to 800 m (the landing included), the nearest four to 900 m and none beyond", () => {
    const { ctx, lights, at } = night("high");
    for (const [distance, count] of [[90, 16], [650, 16], [799, 16], [800, 4], [899, 4], [900, 0], [1000, 0], [1150, 0]] as const) {
      expect(at(distance)).toHaveLength(count);
      expect(ctx.scene.children.filter((o) => o instanceof THREE.PointLight && o.visible)).toHaveLength(16); // no recompile
    }
    lights.dispose(ctx);
  });

  it("keeps the nearest four last and eases every limit, so a zoom never pops a facade dark", () => {
    const { ctx, lights, at } = night("medium");
    const near = at(120).map((p) => p.intensity);
    expect(near).toHaveLength(TIERS.medium.pointLights);
    const points = ctx.scene.children.filter((o): o is THREE.PointLight => o instanceof THREE.PointLight);
    const sweep = (from: number, to: number, slot: number) => {
      const values: number[] = [];
      for (let d = from; d <= to; d += 1) { at(d); values.push(points[slot].intensity); }
      return values;
    };
    for (const [slot, from, to] of [[5, 660, 810], [0, 750, 910]] as const) {
      const v = sweep(from, to, slot);
      expect(v[0]).toBeCloseTo(near[slot], 9);
      expect(v.at(-1)).toBe(0);
      for (let i = 1; i < v.length; i++) {
        expect(v[i]).toBeLessThanOrEqual(v[i - 1] + 1e-12); // monotonic fade out
        expect(v[i - 1] - v[i]).toBeLessThan(near[slot] * 0.06); // no step larger than 6 % per metre
      }
    }
    expect(at(650).map((p) => p.intensity)).toEqual(near); // the landing: nothing dimmed
    // past the full budget only the nearest four remain, easing out together
    expect(at(850).map((p) => p.intensity)).toEqual(near.slice(0, POINT_BUDGET.few).map((v) => v * pointBudget(0, 850)));
    lights.dispose(ctx);
  });

  it("never regresses the low tier at the landing distance", () => {
    const { ctx, lights, at } = night("low");
    expect(at(650)).toHaveLength(TIERS.low.pointLights);
    expect(pointBudget(TIERS.low.pointLights - 1, 650)).toBe(1);
    lights.dispose(ctx);
  });
});
