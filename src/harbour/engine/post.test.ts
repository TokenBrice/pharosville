import * as THREE from "three";
import { BloomEffect, EdgeDetectionMaterial, type Pass, RenderPass, SMAAEffect, SMAAPreset, SMAAWeightsMaterial, TiltShiftEffect, VignetteEffect } from "postprocessing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fillGradeLUT, gradePixel, HarbourBloomEffect, LUT_SIZE, PostChain, SlicedGradeLUT, TILT_MARGIN, TILT_OPACITY, tiltBand } from "./post";
import { PreparationQueue } from "./preparation-queue";
import type { PreparationService } from "./types";
import { DEFAULT_KEYFRAMES, styleCDirection, TimeOfDay } from "./time-of-day";
import { TIERS } from "./quality";
import { CameraRig } from "./camera-rig";
import layoutJson from "../data/layout.json";
import { dockedRows } from "../layout/docked-rows";
import { heroPoints } from "../layout/framing";
import { toCameraPreset } from "../layout/layout-system";
import type { HarbourLayout } from "../layout/types";
import { MIRROR_PASS_NAME, MirrorPass } from "../ocean/mirror-pass";
import { beamPassActive } from "../beam/beam-system";

import type { Grade } from "./time-of-day";

const neutral = (): Grade => ({ lift: [1, 1, 1], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, contrast: 1 });

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("grade LUT", () => {
  it.each([1, 4])("slices a 19.6 ms bake at CPU×%s within the shared allowance, keeping byte parity and coalescing easing", async (throttle) => {
    vi.useFakeTimers(); vi.stubGlobal("window", globalThis);
    const a = { ...neutral(), contrast: 1.3, blueSat: 0.8, warmSat: 1.1, shadowSat: 0.7 };
    const b = { ...neutral(), saturation: 0.5 }, c = { ...neutral(), gain: [1.1, 0.9, 1] as [number, number, number] };
    const expected = [a, c].map((g) => { const data = new Uint16Array(LUT_SIZE ** 3 * 4); fillGradeLUT(data, LUT_SIZE, g); return data; });
    let cpu = 0;
    vi.spyOn(performance, "now").mockImplementation(() => Date.now() + cpu);
    const toHalf = THREE.DataUtils.toHalfFloat;
    // O2-F2's measured bake cost, independent of the host CPU's speed.
    const halfMs = 19.6 * throttle / (LUT_SIZE ** 3 * 4);
    vi.spyOn(THREE.DataUtils, "toHalfFloat").mockImplementation((v) => { cpu += halfMs; return toHalf(v); });
    const queue = new PreparationQueue(), slices: number[] = [], uploaded = new Set<THREE.Texture>();
    const preparation: Pick<PreparationService, "submit" | "stageTexture"> = {
      submit: (work, options) => queue.submit((deadline) => { const start = cpu; const result = work(deadline); slices.push(cpu - start); return result; }, options),
      stageTexture: (texture, options) => queue.submit(() => { uploaded.add(texture); }, options),
    };
    const published: Uint16Array[] = [], textures = new Set<THREE.Data3DTexture>();
    const lut = new SlicedGradeLUT((texture) => {
      expect(uploaded.has(texture)).toBe(true);
      textures.add(texture); published.push((texture.image.data as Uint16Array).slice());
    });
    const pending = lut.request(a, preparation);
    await vi.advanceTimersByTimeAsync(16);
    expect(published).toHaveLength(0);
    lut.request(b, preparation); lut.request(c, preparation);
    a.contrast = 0.5; c.gain[0] = 0.1;
    await vi.advanceTimersByTimeAsync(3000); await pending;
    expect(published).toEqual(expected);
    expect(textures.size).toBe(2); expect((lut.texture.image.data as Uint16Array).byteLength).toBe(256 * 1024);
    expect(Math.max(...slices)).toBeLessThanOrEqual(2);
    expect(queue.stats.overruns).toBe(0);
    lut.dispose(); queue.dispose(); expect(vi.getTimerCount()).toBe(0);
  });

  it("does not upload or publish a partial generation after disposal", async () => {
    vi.useFakeTimers(); vi.stubGlobal("window", globalThis);
    const queue = new PreparationQueue(), publish = vi.fn(), upload = vi.fn();
    const lut = new SlicedGradeLUT(publish);
    const pending = lut.request(neutral(), { submit: queue.submit.bind(queue), stageTexture: upload });
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    lut.dispose(); await cancelled;
    expect(upload).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
    queue.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it("a neutral grade is the identity", () => {
    for (const v of [0, 0.18, 0.5, 0.9, 1]) {
      const o = gradePixel([v, v * 0.5, 1 - v], neutral());
      expect(o[0]).toBeCloseTo(v, 5);
      expect(o[1]).toBeCloseTo(v * 0.5, 5);
      expect(o[2]).toBeCloseTo(1 - v, 5);
    }
  });

  it("stays in [0, 1] and fills size³ RGBA texels", () => {
    const size = 4;
    const data = new Uint16Array(size ** 3 * 4);
    fillGradeLUT(data, size, { lift: [1.1, 1, 0.9], gamma: [0.9, 1, 1.1], gain: [1.2, 1, 0.8], saturation: 1.4, contrast: 1.3 });
    expect(data.every((h) => h !== 0x7e00)).toBe(true); // no NaN
    const g = gradePixel([1, 1, 1], { lift: [1, 1, 1], gamma: [1, 1, 1], gain: [1.5, 1.5, 1.5], saturation: 2, contrast: 1.4 });
    for (const c of g) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(1); }
  });
});

describe("time of day", () => {
  it("keyframes are ordered and wrap 0 → 24", () => {
    const hours = DEFAULT_KEYFRAMES.map((k) => k.hour);
    expect(hours[0]).toBe(0);
    expect(hours[hours.length - 1]).toBe(24);
    for (let i = 1; i < hours.length; i++) expect(hours[i]).toBeGreaterThan(hours[i - 1]);
  });

  it("style C light angles keep their relation to the camera (Blender cam az 225° ↔ runtime yaw 45°)", () => {
    // a light at the camera's own azimuth must point back toward the runtime camera (+x, +z)
    const d = styleCDirection(225, 0);
    expect(d.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(d.z).toBeCloseTo(Math.SQRT1_2, 5);
    // golden sun (az 288°, el 9°) sits 63° off the camera azimuth
    const g = styleCDirection(288, 9);
    const ang = Math.acos((g.x * Math.SQRT1_2 + g.z * Math.SQRT1_2) / Math.hypot(g.x, g.z)) * 180 / Math.PI;
    expect(ang).toBeCloseTo(63, 3);
    expect(Math.asin(g.y) * 180 / Math.PI).toBeCloseTo(9, 3);
  });
});

describe("bloom mip ownership", () => {
  it("resizes only targets through 8→6→8→7→8 without disposing blur materials", () => {
    const bloom = new HarbourBloomEffect({ mipmapBlur: true, levels: 8, radius: 0.72 });
    const pass = bloom.mipmapBlurPass;
    const luminance = bloom.luminancePass as typeof bloom.luminancePass & { renderTarget: THREE.WebGLRenderTarget };
    const mip = pass as typeof pass & {
      downsamplingMaterial: THREE.ShaderMaterial;
      upsamplingMaterial: THREE.ShaderMaterial;
      downsamplingMipmaps: THREE.WebGLRenderTarget[];
      upsamplingMipmaps: THREE.WebGLRenderTarget[];
    };
    const down = mip.downsamplingMaterial, up = mip.upsamplingMaterial;
    const disposed = vi.fn();
    down.addEventListener("dispose", disposed);
    up.addEventListener("dispose", disposed);
    bloom.setSize(1600, 1000);
    const chain = Object.assign(Object.create(PostChain.prototype) as PostChain, {
      bloom, smaa: { applyPreset: vi.fn() },
    });
    const output = pass.texture;
    for (const tier of ["low", "high", "medium", "high"] as const) {
      const oldTargets = [...mip.downsamplingMipmaps, ...mip.upsamplingMipmaps];
      const targetDisposed = vi.fn();
      for (const target of oldTargets) target.addEventListener("dispose", targetDisposed);
      chain.setQuality(TIERS[tier]);
      expect(targetDisposed.mock.calls.length).toBeGreaterThanOrEqual(oldTargets.length);
      // The output object is also sampled by BloomEffect's uniform: its identity must not change.
      expect(pass.texture).toBe(output);
      expect(pass.levels).toBe(TIERS[tier].bloomLevels);
      expect(pass.radius).toBe(0.72);
      expect(mip.downsamplingMaterial).toBe(down);
      expect(mip.upsamplingMaterial).toBe(up);
      expect(disposed).not.toHaveBeenCalled();
      let w = tier === "low" ? 800 : 1600, h = tier === "low" ? 500 : 1000;
      expect([luminance.renderTarget.width, luminance.renderTarget.height]).toEqual([w, h]);
      for (const target of mip.downsamplingMipmaps) {
        w = Math.round(w * 0.5); h = Math.round(h * 0.5);
        expect([target.width, target.height]).toEqual([w, h]);
      }
      const unchanged = vi.fn();
      for (const target of [...mip.downsamplingMipmaps, ...mip.upsamplingMipmaps]) target.addEventListener("dispose", unchanged);
      chain.setQuality(TIERS[tier]);
      expect(unchanged).not.toHaveBeenCalled();
    }
    bloom.dispose();
    expect(disposed).toHaveBeenCalled();
  });

  it("keeps half-source luminance and mips through canvas/DPR resizes, restoring full sources above Low", () => {
    const bloom = new HarbourBloomEffect({ mipmapBlur: true, levels: 6 });
    const luminance = bloom.luminancePass as typeof bloom.luminancePass & { renderTarget: THREE.WebGLRenderTarget };
    const source = luminance.renderTarget;
    const mips = bloom.mipmapBlurPass as typeof bloom.mipmapBlurPass & { downsamplingMipmaps: THREE.WebGLRenderTarget[] };
    const material = bloom.luminanceMaterial, version = material.version;
    for (const lite of [true, false, true]) {
      bloom.setLite(lite);
      for (const [w, h] of [[5120, 3200], [2559, 1599], [1, 1]]) {
        bloom.setSize(w, h);
        const sw = lite ? Math.max(1, Math.round(w / 2)) : w, sh = lite ? Math.max(1, Math.round(h / 2)) : h;
        expect([source.width, source.height]).toEqual([sw, sh]);
        expect([mips.downsamplingMipmaps[0].width, mips.downsamplingMipmaps[0].height]).toEqual([Math.round(sw / 2), Math.round(sh / 2)]);
        expect(luminance.renderTarget).toBe(source);
        expect(material.version).toBe(version);
      }
    }
    bloom.dispose();
  });
});

describe("quality preset preparation", () => {
  it("prepares only the two changing SMAA surfaces, preserving live defines and per-tier presets", () => {
    const edge = new EdgeDetectionMaterial(), weights = new SMAAWeightsMaterial();
    const scene = new THREE.Scene(), camera = new THREE.Camera();
    const smaa = {
      edgeDetectionMaterial: edge, weightsMaterial: weights,
      edgeDetectionPass: { scene, camera }, weightsPass: { scene, camera },
      renderTargetEdges: new THREE.WebGLRenderTarget(), renderTargetWeights: new THREE.WebGLRenderTarget(),
    };
    const chain = Object.assign(Object.create(PostChain.prototype) as PostChain, { smaa });
    const liveEdge = { ...edge.defines }, liveWeights = { ...weights.defines };
    for (const tier of ["low", "medium", "high"] as const) {
      const prepared = chain.preparationEntries(TIERS[tier]);
      expect(prepared.entries).toHaveLength(2);
      const expectedEdge = new EdgeDetectionMaterial(), expectedWeights = new SMAAWeightsMaterial();
      SMAAEffect.prototype.applyPreset.call({ edgeDetectionMaterial: expectedEdge, weightsMaterial: expectedWeights } as SMAAEffect,
        tier === "low" ? SMAAPreset.LOW : tier === "medium" ? SMAAPreset.MEDIUM : SMAAPreset.HIGH);
      const materials = prepared.entries.map((entry) => (entry.root as THREE.Mesh).material as THREE.ShaderMaterial);
      expect(materials[0].defines).toEqual(expectedEdge.defines);
      expect(materials[1].defines).toEqual(expectedWeights.defines);
      expect(edge.defines).toEqual(liveEdge);
      expect(weights.defines).toEqual(liveWeights);
      expect(prepared.entries.map((entry) => entry.target())).toEqual([smaa.renderTargetEdges, smaa.renderTargetWeights]);
      const disposed = vi.fn();
      for (const material of materials) material.addEventListener("dispose", disposed);
      prepared.dispose();
      expect(disposed).toHaveBeenCalledTimes(2);
      expectedEdge.dispose(); expectedWeights.dispose();
    }
    edge.dispose(); weights.dispose(); smaa.renderTargetEdges.dispose(); smaa.renderTargetWeights.dispose();
  });
});

describe("E08 overview focus", () => {
  const L = layoutJson as unknown as HarbourLayout;
  const lantern = new THREE.Vector3(...heroPoints(L)[1]);
  const dock = dockedRows(L).map((p) => new THREE.Vector3(...p));
  const ndc = (p: THREE.Vector3, camera: THREE.Camera) => p.clone().project(camera).y;
  const rigAt = (view: "overview" | "heart", aspect: number, pan: [number, number] = [0, 0], scale = 1) => {
    const camera = new THREE.PerspectiveCamera(25, aspect, 1, 20000), rig = new CameraRig(camera);
    const p = toCameraPreset(L.camera.presets[view]);
    p.target = [p.target[0] + pan[0], p.target[1], p.target[2] + pan[1]];
    p.distance *= scale;
    rig.applyPreset(p, true);
    camera.updateMatrixWorld(true);
    return { camera, rig };
  };

  it("bounds the docked rows of the inner harbour (inside the bay), not the outer coves", () => {
    const berths = L.piers.reduce((n, pier) => n + pier.berths.length, 0);
    expect(dock.length).toBeGreaterThan(100);
    expect(dock.length).toBeLessThan(berths);
  });

  it("the sharp band's projections contain both anchors, the lantern and every docked row, at any aspect and pan", () => {
    const band = { lo: 0, hi: 0 };
    for (const aspect of [1, 1.6, 2.4]) for (const pan of [[0, 0], [160, 0], [0, 160], [-160, -120]] as Array<[number, number]>) for (const scale of [0.8, 1, 1.15]) {
      const { camera } = rigAt("overview", aspect, pan, scale);
      expect(tiltBand(camera, lantern, dock, band)).toBe(true);
      const ys = [lantern, ...dock].map((p) => ndc(p, camera));
      expect(Math.min(...ys)).toBeCloseTo(band.lo + TILT_MARGIN, 9);
      expect(Math.max(...ys)).toBeCloseTo(band.hi - TILT_MARGIN, 9);
    }
  });

  it("PostChain: at the overview the sharp row is the harbour (lantern to docked rows) and the soft zone is capped", () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const { camera, rig } = rigAt("overview", 1.6);
    const tiltShift = new TiltShiftEffect({ focusArea: 0.6, feather: 0.38, offset: 0.06 });
    // (private fields set directly: the chain is built without a WebGL renderer)
    const chain = Object.create(PostChain.prototype) as PostChain;
    Object.assign(chain as unknown as Record<string, unknown>, {
      renderer: { toneMappingExposure: 1 }, bloom: new BloomEffect(), tiltShift, vignette: new VignetteEffect(),
      cam: camera, focusV: new THREE.Vector3(), band: { lo: 0, hi: 0 }, lutAge: 0, lutKey: new Float32Array(15),
      tiltNear: 715, tiltFar: 1000, tiltFocus: [new THREE.Vector3(...heroPoints(L)[0]), lantern], tiltDock: dock,
    });
    chain.update(0.016, new TimeOfDay(), rig);
    expect(tiltShift.blendMode.opacity.value).toBeCloseTo(TILT_OPACITY, 9);
    expect(TILT_OPACITY).toBeLessThanOrEqual(0.35);
    const sharp = tiltShift.focusArea - tiltShift.feather;
    for (const p of [lantern, ...dock]) expect(Math.abs(ndc(p, camera) - tiltShift.offset)).toBeLessThanOrEqual(sharp - TILT_MARGIN + 1e-9);
    // the miniature softness keeps the frame edges: the band is shorter than the frame
    expect(sharp).toBeLessThan(0.75);
    // at the landing (heart) the effect is faded out entirely
    const heart = rigAt("heart", 1.6);
    Object.assign(chain as unknown as Record<string, unknown>, { cam: heart.camera });
    chain.update(0.016, new TimeOfDay(), heart.rig);
    expect(tiltShift.blendMode.opacity.value).toBe(0);
  });
});

describe("E35 harbour mirror pass order", () => {
  it("seals the mirror right after the RenderPass, ahead of the stale fog and the beam, whatever the insertion order", () => {
    const camera = new THREE.PerspectiveCamera();
    const render = new RenderPass(new THREE.Scene(), camera), mirror = new MirrorPass(camera);
    const named = (name: string) => ({ name }) as unknown as Pass;
    const fog = named("fog"), beam = named("beam"), scrub = named("scrub"), main = named("main"), smaa = named("smaa"), depth = named("depth");
    // the readings system's fog went in at 1 after the mirror did, and the beam at length − 2
    const passes: Pass[] = [render, fog, mirror, scrub, beam, main, smaa];
    const composer = { passes, addPass: (pass: Pass, index: number) => { passes.splice(index, 0, pass); } };
    const chain = Object.create(PostChain.prototype) as PostChain;
    Object.assign(chain as unknown as Record<string, unknown>, { composer, scrub, main, depthPrepass: depth });
    chain.seal();
    expect(passes.map((pass) => pass.name)).toEqual(["depth", "RenderPass", MIRROR_PASS_NAME, "fog", "beam", "scrub", "main", "smaa"]);
    // and without the mirror (the default) the order is today's
    const plain: Pass[] = [render, fog, scrub, beam, main, smaa];
    const other = Object.create(PostChain.prototype) as PostChain;
    Object.assign(other as unknown as Record<string, unknown>, { composer: { passes: plain, addPass: (pass: Pass, index: number) => { plain.splice(index, 0, pass); } }, scrub, main, depthPrepass: depth });
    other.seal();
    expect(plain.map((pass) => pass.name)).toEqual(["depth", "RenderPass", "fog", "beam", "scrub", "main", "smaa"]);
    mirror.dispose();
  });

  it("keeps the beam pass predicate beam OR shimmer: the mirror is its own pass and runs by day with both at zero", () => {
    expect(beamPassActive(0, 0)).toBe(false);
    expect(beamPassActive(0.01, 0)).toBe(true);
    expect(beamPassActive(0, 0.01)).toBe(true);
    const mirror = new MirrorPass(new THREE.PerspectiveCamera());
    mirror.setActive(true);
    expect(mirror.enabled).toBe(true);
    mirror.dispose();
  });
});
