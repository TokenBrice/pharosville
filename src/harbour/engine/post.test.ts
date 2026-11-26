import * as THREE from "three";
import { BloomEffect, EdgeDetectionMaterial, type Pass, RenderPass, SMAAEffect, SMAAPreset, SMAAWeightsMaterial, TiltShiftEffect, VignetteEffect } from "postprocessing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fillGradeLUT, gradePixel, GtaoEffect, gtaoDirsFor, gtaoStepsFor, HarbourBloomEffect, LUT_SIZE, PostChain, SlicedGradeLUT, TILT_MARGIN, TILT_OPACITY, tiltBand } from "./post";
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

  it("PostChain: overview tilt-shift defaults OFF (opacity 0) and preserves E08 sharp band & heart fade-out when opted in", () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const { camera, rig } = rigAt("overview", 1.6);
    const tiltShift = new TiltShiftEffect({ focusArea: 0.6, feather: 0.38, offset: 0.06 });
    const vignette = new VignetteEffect();
    // (private fields set directly: the chain is built without a WebGL renderer)
    const chain = Object.create(PostChain.prototype) as PostChain;
    Object.assign(chain as unknown as Record<string, unknown>, {
      renderer: { toneMappingExposure: 1 }, bloom: new BloomEffect(), tiltShift, vignette,
      cam: camera, focusV: new THREE.Vector3(), band: { lo: 0, hi: 0 }, lutAge: 0, lutKey: new Float32Array(15),
      tiltNear: 715, tiltFar: 1000, tiltShiftEnabled: false,
      tiltFocus: [new THREE.Vector3(...heroPoints(L)[0]), lantern], tiltDock: dock,
    });
    // Decision A3: OFF by default at overview (0.00 ms GPU skip), while vignette still tracks z
    chain.update(0.016, new TimeOfDay(), rig);
    expect(tiltShift.blendMode.opacity.value).toBe(0);
    expect(vignette.darkness).toBeCloseTo(0.44, 6);

    // Opt-in (?tilt=1 or runtime toggle): sharp row spans lantern to docked rows and soft zone is capped
    chain.tiltShiftEnabled = true;
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

describe("PostChain pass order (Phase 2: legacy MirrorPass retired)", () => {
  it("seals depth prepass at index 0, RenderPass at index 1, StaleFog at index 2, beam, scrub, main, and SMAA", () => {
    const camera = new THREE.PerspectiveCamera();
    const render = new RenderPass(new THREE.Scene(), camera);
    const named = (name: string) => ({ name }) as unknown as Pass;
    const fog = named("fog"), beam = named("beam"), scrub = named("scrub"), main = named("main"), smaa = named("smaa"), depth = named("depth");
    const passes: Pass[] = [render, fog, scrub, beam, main, smaa];
    const chain = Object.create(PostChain.prototype) as PostChain;
    Object.assign(chain as unknown as Record<string, unknown>, {
      composer: { passes, addPass: (pass: Pass, index: number) => { passes.splice(index, 0, pass); } },
      scrub, main, depthPrepass: depth,
    });
    chain.seal();
    expect(passes.map((pass) => pass.name)).toEqual(["depth", "RenderPass", "fog", "beam", "scrub", "main", "smaa"]);
    expect(passes.findIndex((pass) => pass.name === "fog")).toBe(2);
  });

  it("keeps the beam pass predicate beam OR shimmer independent of water reflections", () => {
    expect(beamPassActive(0, 0)).toBe(false);
    expect(beamPassActive(0.01, 0)).toBe(true);
    expect(beamPassActive(0, 0.01)).toBe(true);
  });

  it("decouples render vs display DPR via manual composer sizing and atomic SMAA/FSR1 renderToScreen handoff", async () => {
    const { Fsr1Pass } = await import("./shaders/fsr1");
    const renderer = { setDrawingBufferSize: vi.fn() } as unknown as THREE.WebGLRenderer;
    const inputBuffer = { setSize: vi.fn() };
    const outputBuffer = { setSize: vi.fn() };
    const depthRenderTarget = { setSize: vi.fn() };
    const mainPass = { setSize: vi.fn(), renderToScreen: false };
    const smaaPass = { setSize: vi.fn(), renderToScreen: true };
    const fsrPass = new Fsr1Pass();
    const setResSpy = vi.spyOn(fsrPass, "setResolutions");
    const composer = { inputBuffer, outputBuffer, depthRenderTarget, passes: [mainPass, smaaPass, fsrPass] };
    const chain = Object.create(PostChain.prototype) as PostChain;
    Object.assign(chain as unknown as Record<string, unknown>, {
      renderer, composer, smaaPass, fsrPass, fsrReady: true, sealed: true, fsrActive: false,
    });

    // Sub-native render DPR (0.8) on 1.5 display DPR: manual composer sizing + atomic handoff to FSR1
    expect(chain.applyDisplayScaling(1600, 1000, 0.8, 1.5)).toBe(true);
    expect(renderer.setDrawingBufferSize).toHaveBeenCalledWith(1600, 1000, 1.5);
    expect(inputBuffer.setSize).toHaveBeenCalledWith(1280, 800);
    expect(outputBuffer.setSize).toHaveBeenCalledWith(1280, 800);
    expect(depthRenderTarget.setSize).toHaveBeenCalledWith(1280, 800);
    expect(mainPass.setSize).toHaveBeenCalledWith(1280, 800);
    expect(smaaPass.setSize).toHaveBeenCalledWith(1280, 800);
    expect(setResSpy).toHaveBeenCalledWith(1280, 800, 2400, 1500);
    expect(smaaPass.renderToScreen).toBe(false);
    expect(fsrPass.enabled).toBe(true);
    expect(fsrPass.renderToScreen).toBe(true);
    expect(chain.isFsrActive()).toBe(true);

    // Marginal upscale (1.5 vs 1.58, ratio >= 0.92): bypasses FSR cleanly
    expect(chain.applyDisplayScaling(1600, 1000, 1.5, 1.58)).toBe(false);
    expect(chain.isFsrActive()).toBe(false);

    // Native DPR bypass (1.5 >= 1.5): atomically hands screen output back to SMAA and keeps easuTarget at 1×1 across composer.setSize()
    expect(chain.applyDisplayScaling(1600, 1000, 1.5, 1.5)).toBe(false);
    expect(smaaPass.renderToScreen).toBe(true);
    expect(fsrPass.enabled).toBe(false);
    expect(fsrPass.renderToScreen).toBe(false);
    expect(chain.isFsrActive()).toBe(false);
    expect([fsrPass.easuTarget.width, fsrPass.easuTarget.height]).toEqual([1, 1]);

    // Subsequent composer.setSize() (which invokes pass.setSize() on disabled passes too) must NOT re-grow easuTarget
    for (const p of composer.passes) p.setSize(2400, 1500);
    expect([fsrPass.easuTarget.width, fsrPass.easuTarget.height]).toEqual([1, 1]);

    fsrPass.dispose();
  });

  it("keeps BeamPass before NanScrub/Main regardless of FSR1 load order, sizes all internal passes to render res, and owns renderToScreen", async () => {
    const camera = new THREE.PerspectiveCamera();
    const render = new RenderPass(new THREE.Scene(), camera);
    const makePass = (name: string) => ({ name, renderToScreen: false, enabled: true, setSize: vi.fn() }) as unknown as Pass & { setSize: ReturnType<typeof vi.fn> };
    const fog = makePass("fog"), beam = makePass("beam"), scrub = makePass("scrub"), main = makePass("main"), smaa = makePass("smaa"), depth = makePass("depth");
    smaa.renderToScreen = true;
    const passes: Pass[] = [render, scrub, main, smaa];
    const inputBuffer = { setSize: vi.fn() };
    const outputBuffer = { setSize: vi.fn() };
    const renderer = { setDrawingBufferSize: vi.fn() } as unknown as THREE.WebGLRenderer;
    const composer = {
      autoRenderToScreen: false,
      inputBuffer,
      outputBuffer,
      passes,
      addPass: (pass: Pass, index?: number) => {
        if (index === undefined) passes.push(pass);
        else passes.splice(index, 0, pass);
      },
    };
    const chain = Object.create(PostChain.prototype) as PostChain;
    Object.assign(chain as unknown as Record<string, unknown>, {
      renderer, composer, scrub, main, smaaPass: smaa, depthPrepass: depth,
      fsrPass: null, fsrLoad: null, fsrReady: false, fsrActive: false, fsrBatch: null,
      sealed: false, worldPrepared: false, disposed: false, unregFsrPrep: [],
    });

    // Order A: FSR loads during boot BEFORE StaleFog and BeamSystem.init()
    expect(await chain.ensureFsr(undefined, false)).toBe(true);
    // Not sealed yet -> FSR is held back from composer.passes and isFsrReady() is false until seal()
    expect(chain.isFsrReady()).toBe(false);
    expect(passes.map((p) => p.name)).toEqual(["RenderPass", "scrub", "main", "smaa"]);

    // Systems insert StaleFog at index 1 and BeamPass via insertBeforeMain
    composer.addPass(fog, 1);
    chain.insertBeforeMain(beam);
    chain.seal();

    expect(passes.map((p) => p.name)).toEqual(["depth", "RenderPass", "fog", "beam", "scrub", "main", "smaa", "Fsr1Pass"]);
    expect(passes.indexOf(beam)).toBeLessThan(passes.indexOf(scrub));
    expect(passes.indexOf(scrub)).toBeLessThan(passes.indexOf(main));
    expect(passes[passes.length - 1]!.name).toBe("Fsr1Pass");
    expect(smaa.renderToScreen).toBe(true);
    expect(passes[passes.length - 1]!.renderToScreen).toBe(false);

    // applyDisplayScaling after seal sizes ALL internal passes (including fog & beam) to render resolution
    expect(chain.isFsrReady()).toBe(true);
    expect(chain.applyDisplayScaling(1600, 1000, 0.8, 1.0)).toBe(true);
    expect(fog.setSize).toHaveBeenCalledWith(1280, 800);
    expect(beam.setSize).toHaveBeenCalledWith(1280, 800);
    expect(main.setSize).toHaveBeenCalledWith(1280, 800);
    expect(smaa.setSize).toHaveBeenCalledWith(1280, 800);
    expect(smaa.renderToScreen).toBe(false);
    expect(passes[passes.length - 1]!.renderToScreen).toBe(true);

    // Order B: BeamPass inserted when FSR is already appended after seal
    const lateBeam = makePass("late-beam");
    chain.insertBeforeMain(lateBeam);
    expect(passes.indexOf(lateBeam)).toBeLessThan(passes.indexOf(scrub));
    expect(passes.indexOf(scrub)).toBeLessThan(passes.indexOf(main));

    (passes[passes.length - 1] as unknown as { dispose(): void }).dispose();
  });

  it("precompiles EASU, RCAS, and offscreen SMAA variant on post-boot transition, retries supersession aborts, and rejects timed-out batches", async () => {
    let resolvePrep!: (batch: { status: string; dispose: ReturnType<typeof vi.fn> }) => void;
    const prepPromise = new Promise<{ status: string; dispose: ReturnType<typeof vi.fn> }>((r) => { resolvePrep = r; });
    const register = vi.fn(() => () => {});
    const smaaScene = new THREE.Scene();
    const smaaCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const outputBuffer = { setSize: vi.fn() };
    const smaa = { name: "smaa", renderToScreen: true, setSize: vi.fn(), scene: smaaScene, camera: smaaCam } as unknown as Pass;
    const passes: Pass[] = [smaa];
    const composer = {
      inputBuffer: { setSize: vi.fn() },
      outputBuffer,
      passes,
      addPass: (p: Pass) => { passes.push(p); p.setSize(1600, 1000); },
    };

    // Attempt 1: first prepare() throws Preparation superseded AbortError -> retries automatically -> resolves with timed-out batch -> stays unready & retryable!
    const timedOutBatch = { status: "timed-out", dispose: vi.fn() };
    const completeBatch = { status: "complete", dispose: vi.fn() };
    let call = 0;
    const prepare = vi.fn((_entries: unknown[]) => {
      call++;
      if (call === 1) return Promise.reject(new DOMException("Preparation superseded", "AbortError"));
      if (call === 2) return Promise.resolve(timedOutBatch);
      return prepPromise;
    });

    const chain = Object.create(PostChain.prototype) as PostChain;
    Object.assign(chain as unknown as Record<string, unknown>, {
      renderer: { setDrawingBufferSize: vi.fn() },
      composer, smaaPass: smaa, preparation: { register, prepare },
      fsrPass: null, fsrLoad: null, fsrReady: false, fsrActive: false, fsrPrepRegistered: false, fsrBatch: null,
      sealed: true, worldPrepared: true, disposed: false, unregFsrPrep: [],
    });

    // Timed-out batch must NOT mark FSR ready and must keep retry guard open (isFsrLoadingOrLoaded() === false)
    expect(await chain.ensureFsr(undefined, true)).toBe(false);
    expect(call).toBe(2);
    expect(timedOutBatch.dispose).toHaveBeenCalledTimes(1);
    expect(chain.isFsrReady()).toBe(false);
    expect(chain.isFsrLoadingOrLoaded()).toBe(false);

    // Prepare entries must include EASU, RCAS, AND offscreen linear SMAA composite targeting composer.outputBuffer
    const preparedEntries = prepare.mock.calls[0]![0] as Array<{ root: unknown; target: () => unknown }>;
    expect(preparedEntries).toHaveLength(3);
    expect(preparedEntries[2]!.root).toBe(smaaScene);
    expect(preparedEntries[2]!.target()).toBe(outputBuffer);

    // Attempt 2: retry succeeds cleanly; while in-flight FSR stays inactive, and on complete it enables
    const loadPromise = chain.ensureFsr(undefined, true);
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(3));
    expect(chain.isFsrReady()).toBe(false);
    expect(chain.isFsrLoadingOrLoaded()).toBe(true);
    expect(chain.applyDisplayScaling(1600, 1000, 0.8, 1.5)).toBe(false);
    expect(smaa.renderToScreen).toBe(true);

    resolvePrep(completeBatch);
    expect(await loadPromise).toBe(true);
    expect(chain.isFsrReady()).toBe(true);
    // Disabled addPass() must not pre-grow easuTarget past 1×1 before applyDisplayScaling()
    const addedFsr = passes[passes.length - 1] as unknown as { easuTarget: THREE.WebGLRenderTarget; dispose(): void };
    expect([addedFsr.easuTarget.width, addedFsr.easuTarget.height]).toEqual([1, 1]);

    expect(chain.applyDisplayScaling(1600, 1000, 0.8, 1.5)).toBe(true);
    expect(smaa.renderToScreen).toBe(false);
    expect(passes[passes.length - 1]!.renderToScreen).toBe(true);

    completeBatch.dispose();
    addedFsr.dispose();
  });

  it("prepares both on-screen (null) and offscreen (outputBuffer) SMAA variants when FSR1 is active at boot", async () => {
    const { Fsr1Pass } = await import("./shaders/fsr1");
    const smaaScene = new THREE.Scene();
    const smaaCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mainScene = new THREE.Scene();
    const outputBuffer = new THREE.WebGLRenderTarget(1280, 800);
    const mainPass = { name: "main", renderToScreen: false, scene: mainScene, camera: smaaCam } as unknown as Pass;
    const smaaPass = { name: "smaa", renderToScreen: false, scene: smaaScene, camera: smaaCam } as unknown as Pass;
    const fsrPass = new Fsr1Pass();
    fsrPass.enabled = true;
    fsrPass.renderToScreen = true;

    const dummyRt = new THREE.WebGLRenderTarget(1, 1);
    const dummyMat = new THREE.ShaderMaterial();
    const passStub = (rt: THREE.WebGLRenderTarget) => ({ scene: new THREE.Scene(), camera: smaaCam, renderTarget: rt, renderTargetA: rt });
    const bloom = {
      luminancePass: passStub(dummyRt),
      mipmapBlurPass: {
        scene: new THREE.Scene(), camera: smaaCam,
        downsamplingMaterial: dummyMat, upsamplingMaterial: dummyMat,
        downsamplingMipmaps: [dummyRt], upsamplingMipmaps: [dummyRt],
      },
    };
    const smaa = {
      edgeDetectionPass: passStub(dummyRt), weightsPass: passStub(dummyRt),
      edgeDetectionMaterial: dummyMat, weightsMaterial: dummyMat,
      renderTargetEdges: dummyRt, renderTargetWeights: dummyRt,
    };

    const chain = Object.create(PostChain.prototype) as PostChain;
    Object.assign(chain as unknown as Record<string, unknown>, {
      composer: { passes: [mainPass, smaaPass, fsrPass], outputBuffer },
      smaaPass, fsrPass, fsrActive: true, fsrReady: true, sealed: true,
      bloom, tiltShift: { blurPass: passStub(dummyRt) }, smaa,
    });

    const prep = chain.preparationEntries();
    const smaaTargets = prep.entries.filter((e) => e.root === smaaScene).map((e) => e.target());
    expect(smaaTargets).toContain(null);
    expect(smaaTargets).toContain(outputBuffer);
    // Ensure generic loop skipped Fsr1Pass's empty inherited scene while fsrPreparationEntries included EASU & RCAS
    expect(prep.entries.some((e) => e.root === fsrPass.easuScene)).toBe(true);
    expect(prep.entries.some((e) => e.root === fsrPass.rcasScene)).toBe(true);

    prep.dispose();
    fsrPass.dispose();
    outputBuffer.dispose();
    dummyRt.dispose();
    dummyMat.dispose();
  });
});

describe("half-res GTAO effect", () => {
  it("scales slice/step counts across quality tiers and skips GPU passes completely when off (low tier)", () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    const cam = new THREE.PerspectiveCamera(25, 1.6, 5, 9000);
    const gtao = new GtaoEffect(cam);
    const depth = new THREE.DepthTexture(1600, 1000);
    gtao.setDepthTexture(depth);
    gtao.setSize(1600, 1000);
    expect([gtao.aoTargetA.width, gtao.aoTargetA.height]).toEqual([800, 500]);
    expect([gtao.aoTargetB.width, gtao.aoTargetB.height]).toEqual([800, 500]);

    const renderer = {
      autoClear: true,
      getRenderTarget: () => null,
      setRenderTarget: vi.fn(),
      render: vi.fn(),
    } as unknown as THREE.WebGLRenderer;
    const input = new THREE.WebGLRenderTarget(1600, 1000);

    // High: 4 dirs × 3 steps, 3 half-res passes (AO + bilateral blur H + V)
    gtao.setQuality(TIERS.high.gtao);
    expect(gtao.active).toBe(true);
    expect(gtaoDirsFor("high")).toBe(4);
    expect(gtaoStepsFor("high")).toBe(3);
    expect(gtao.aoMat.uniforms.uDirs.value).toBe(4);
    expect(gtao.aoMat.uniforms.uSteps.value).toBe(3);
    gtao.update(renderer, input);
    expect(renderer.render).toHaveBeenCalledTimes(3);

    // Medium: 2 dirs × 2 steps, still half-res + bilateral blur
    vi.mocked(renderer.render).mockClear();
    gtao.setQuality(TIERS.medium.gtao);
    expect(gtao.active).toBe(true);
    expect(gtao.aoMat.uniforms.uDirs.value).toBe(2);
    expect(gtao.aoMat.uniforms.uSteps.value).toBe(2);
    gtao.update(renderer, input);
    expect(renderer.render).toHaveBeenCalledTimes(3);

    // Low: cleanly bypassed (zero renders, zero strength)
    vi.mocked(renderer.render).mockClear();
    gtao.setQuality(TIERS.low.gtao);
    expect(gtao.active).toBe(false);
    expect(gtao.uniforms.get("uAoStrength")!.value).toBe(0);
    gtao.update(renderer, input);
    expect(renderer.render).not.toHaveBeenCalled();

    // Time-of-day chromatic tinting keeps strength 0 on low and positive on high
    const tod = new TimeOfDay();
    tod.hour = 12;
    gtao.syncTimeOfDay(cam, tod);
    expect(gtao.uniforms.get("uAoStrength")!.value).toBe(0);
    gtao.setQuality(TIERS.high.gtao);
    gtao.syncTimeOfDay(cam, tod);
    expect(gtao.uniforms.get("uAoStrength")!.value).toBeGreaterThan(0.7);
    const noonPow = (gtao.uniforms.get("uAoPower")!.value as THREE.Vector3).clone();
    expect(noonPow.x).toBeGreaterThan(noonPow.z); // cool cerulean crevice tint in daylight

    input.dispose();
    depth.dispose();
    gtao.dispose();
  });
});
