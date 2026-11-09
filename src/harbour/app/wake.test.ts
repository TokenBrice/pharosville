// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraRig, type CameraPreset } from "../engine/camera-rig";
import type { Engine } from "../engine/engine";
import type { EngineContext } from "../engine/types";
import layout from "../data/layout.json";
import type { HarbourLayout } from "../layout/types";
import { toCameraPreset } from "../layout/layout-system";
import { lampWaveUniforms } from "../lights/lamp-wave";
import { ensureMotionService } from "../ui/services";
import {
  arrivalFade, beatAt, BEAT_FROM_S, BEAT_SETTLE_S, BEAT_TO_S, fitSimilarity, posterRegistration, startWake, wakeStart, wantsWake,
  WAKE_MS, WAKE_PULLBACK,
} from "./wake";

const arrive = lampWaveUniforms.uLampArrive;
let now = 0;
let frames: Array<() => void> = [];
/** Advance the clock and run one animation frame. */
const frame = (ms: number) => { now += ms; const run = frames; frames = []; for (const fn of run) fn(); };

beforeEach(() => {
  now = 1000; frames = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", vi.fn((fn: () => void) => { frames.push(fn); return frames.length; }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn(() => { frames = []; }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); arrive.value = 1; document.documentElement.removeAttribute("data-pv-hour"); document.body.innerHTML = ""; });

const HOME: CameraPreset = toCameraPreset((layout as unknown as HarbourLayout).camera.presets.heart);
const LANTERN = new THREE.Vector3(-257.39, 94, -107.48);

function harness(opts: { lantern?: THREE.Vector3; motion?: boolean } = {}) {
  const camera = new THREE.PerspectiveCamera(HOME.fovDeg, 1.6, 1, 20000);
  const rig = new CameraRig(camera);
  rig.applyPreset(HOME, true);
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 1000, right: 1600, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(canvas);
  const beam = { setIntroScale: vi.fn(), setReach: vi.fn(), setColor: vi.fn() };
  const lighthouse = { lanternPosition: opts.lantern ?? LANTERN, setSweep: vi.fn(), setLit: vi.fn(), hold: vi.fn() };
  const services = new Map<string, unknown>([["beam", beam], ["lighthouse", lighthouse], ["layout", layout]]);
  const ctx = { rig, camera, services, renderer: { domElement: canvas }, uniforms: { uNight: { value: 0 } } } as unknown as EngineContext;
  const motion = opts.motion === false ? null : ensureMotionService(ctx);
  return { ctx, rig, camera, canvas, beam, lighthouse, motion, engine: { ctx } as Engine };
}

function ndc(p: CameraPreset, point: THREE.Vector3, aspect = 1.6): THREE.Vector3 {
  const camera = new THREE.PerspectiveCamera(p.fovDeg, aspect, 1, 20000), rig = new CameraRig(camera);
  rig.applyPreset(p, true); camera.updateMatrixWorld(true);
  return point.clone().project(camera);
}

describe("the harbour wakes", () => {
  it("skips arrival motion under reduced motion even when forced", () => {
    vi.stubGlobal("location", { search: "?wake=1" });
    const engine = { ctx: { services: new Map([["motion", { reduced: true }]]) } } as unknown as Engine;
    expect(wantsWake(engine)).toBe(false);
    engine.ctx.services.set("motion", { reduced: false } as never);
    expect(wantsWake(engine)).toBe(true);
    vi.stubGlobal("location", { search: "?wake=0" });
    expect(wantsWake(engine)).toBe(false);
  });

  it("pulls back about the Pharos's lantern, so the fire holds still on screen while the harbour settles", () => {
    const start = wakeStart(HOME, [LANTERN.x, LANTERN.y, LANTERN.z]);
    expect(start.distance).toBeCloseTo(HOME.distance * (1 + WAKE_PULLBACK), 9);
    const a = ndc(HOME, LANTERN), b = ndc(start, LANTERN);
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
    // the harbour round it recedes: the mouth of the harbour moves toward the lantern
    const mouth = new THREE.Vector3(-137.89, 3, -153.44);
    expect(ndc(start, mouth).distanceTo(b)).toBeLessThan(ndc(HOME, mouth).distanceTo(a));
    // without a pivot it is the plain pull-back along the line of sight
    expect(wakeStart(HOME, null)).toEqual({ ...HOME, distance: HOME.distance * (1 + WAKE_PULLBACK) });
    // and along the glide the lantern stays within a pixel at 1600×1000
    for (const u of [0.25, 0.5, 0.75]) {
      const s = u * u * u * (10 + u * (6 * u - 15));
      const mid: CameraPreset = { ...HOME, target: [0, 1, 2].map((i) => start.target[i] + (HOME.target[i] - start.target[i]) * s) as [number, number, number],
        distance: Math.exp(Math.log(start.distance) + (Math.log(HOME.distance) - Math.log(start.distance)) * s) };
      const m = ndc(mid, LANTERN);
      expect(Math.abs(m.x - a.x) * 800).toBeLessThan(1);
      expect(Math.abs(m.y - a.y) * 500).toBeLessThan(1);
    }
  });

  it("drifts home over the wake and never touches the beam, the fire or the sweep (A16)", () => {
    const h = harness();
    const glideTo = vi.spyOn(h.rig, "glideTo");
    const stop = startWake(h.engine);
    expect(h.rig.distance).toBeCloseTo(HOME.distance * (1 + WAKE_PULLBACK), 6);
    expect(glideTo).toHaveBeenCalledWith(expect.objectContaining({ distance: HOME.distance }), { ms: WAKE_MS, lift: 0 });
    for (let t = 0; t < WAKE_MS + 200; t += 50) frame(50);
    stop();
    expect(h.beam.setIntroScale).not.toHaveBeenCalled();
    expect(h.beam.setReach).not.toHaveBeenCalled();
    expect(h.beam.setColor).not.toHaveBeenCalled();
    expect(h.lighthouse.setSweep).not.toHaveBeenCalled();
    expect(h.lighthouse.setLit).not.toHaveBeenCalled();
    expect(h.lighthouse.hold).not.toHaveBeenCalled();
  });
});

describe("E29 the arrival beat", () => {
  it("starts the decorative lamps dark, catches them 2.9–6 s after the reveal and rests on the clock's true state", () => {
    expect([BEAT_FROM_S, BEAT_TO_S]).toEqual([2.9, 6]);
    expect(beatAt(0)).toBe(0);
    expect(beatAt(BEAT_FROM_S)).toBe(0);
    expect(beatAt((BEAT_FROM_S + BEAT_TO_S) / 2)).toBeCloseTo(0.5, 9);
    expect(beatAt(BEAT_TO_S)).toBe(1);
    const h = harness();
    const stop = startWake(h.engine);
    expect(arrive.value).toBe(0);
    const seen: number[] = [];
    for (let t = 0; t <= WAKE_MS + 100; t += 100) { frame(100); seen.push(arrive.value); }
    expect(seen[Math.round(BEAT_FROM_S * 10) - 2]).toBe(0);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen.at(-1)).toBe(1);
    expect(frames).toHaveLength(0); // finished: no frame loop is left running
    stop();
    expect(arrive.value).toBe(1);
  });

  it("canvas camera input lets go of the drift and settles the beat over 0.4 s, never a cut", () => {
    const h = harness();
    const cancel = vi.spyOn(h.rig, "cancelGlide");
    startWake(h.engine);
    frame(100);
    h.canvas.dispatchEvent(new Event("pointerdown"));
    expect(cancel).toHaveBeenCalledOnce();
    const values: number[] = [];
    for (let t = 0; t <= BEAT_SETTLE_S * 1000 + 100; t += 50) { frame(50); values.push(arrive.value); }
    expect(values[0]).toBeGreaterThan(0);
    expect(values[0]).toBeLessThan(0.3);
    expect(values[Math.floor((BEAT_SETTLE_S * 1000) / 50) - 2]).toBeLessThan(1);
    expect(values.at(-1)).toBe(1);
    expect(frames).toHaveLength(0);
  });

  it("does not answer Tab, typing or a press on the chart's own controls", () => {
    const h = harness();
    const cancel = vi.spyOn(h.rig, "cancelGlide");
    startWake(h.engine);
    const button = document.createElement("button");
    document.body.appendChild(button);
    frame(100);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "/" }));
    button.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    for (let t = 0; t < 3500; t += 100) frame(100);
    expect(cancel).not.toHaveBeenCalled();
    expect(h.rig.gliding).toBe(true);
    expect(arrive.value).toBeCloseTo(beatAt(3.6), 6);
  });

  it("a pan or zoom from any device (the input epoch) settles the beat without cancelling the visitor's own move", () => {
    const h = harness();
    startWake(h.engine);
    frame(100);
    h.rig.zoom(0.9);
    const cancel = vi.spyOn(h.rig, "cancelGlide");
    frame(50);
    expect(cancel).not.toHaveBeenCalled();
    for (let t = 0; t <= 500; t += 50) frame(50);
    expect(arrive.value).toBe(1);
  });

  it("reduced motion mid-arrival stops the drift where it stands and cuts the lamps to the clock", () => {
    const h = harness();
    startWake(h.engine);
    frame(100);
    h.motion!.setStill(true);
    expect(h.rig.gliding).toBe(false);
    expect(arrive.value).toBe(1);
    expect(frames).toHaveLength(0);
  });

  it("an unmount mid-arrival leaves the true state and no listener behind", () => {
    const h = harness();
    const cancel = vi.spyOn(h.rig, "cancelGlide");
    const stop = startWake(h.engine);
    frame(100);
    stop();
    expect(arrive.value).toBe(1);
    h.canvas.dispatchEvent(new Event("pointerdown"));
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe("E28 poster registration", () => {
  it("fits one scale and a translation by weighted least squares", () => {
    const from: Array<[number, number]> = [[0, 0], [10, 0], [0, 20], [7, 3]];
    const to = from.map(([x, y]) => [0.8 * x + 12, 0.8 * y - 5] as [number, number]);
    expect(fitSimilarity(from, to, [1, 1, 1, 1])).toEqual({ s: expect.closeTo(0.8, 12), x: expect.closeTo(12, 9), y: expect.closeTo(-5, 9) });
    expect(fitSimilarity([[1, 1]], [[2, 2]], [1])).toBeNull();
    expect(fitSimilarity([[1, 1], [1, 1]], [[2, 2], [3, 3]], [1, 1])).toBeNull();
  });

  it("lays the poster exactly over a live frame at its own framing, even with the feathered margin", () => {
    const h = harness();
    // the poster box runs 32 px past a 1600×1000 window on every side (arrival-shell.css)
    const fit = posterRegistration(h.engine, { left: -32, top: -32, width: 1664, height: 1064 })!;
    const cover = Math.max(1664 / 1600, 1064 / 1000);
    expect(fit.s).toBeCloseTo(1 / cover, 6);
    // the poster's image point (u, v) lands on screen at box.left + fit.x + fit.s × (its place in the covered box)
    const place = (u: number, v: number) => [-32 + fit.x + fit.s * ((1664 - 1600 * cover) / 2 + u * cover), -32 + fit.y + fit.s * ((1064 - 1000 * cover) / 2 + v * cover)];
    expect(place(0, 0)[0]).toBeCloseTo(0, 4);
    expect(place(1600, 1000)[1]).toBeCloseTo(1000, 4);
  });

  it("registers the wake's first frame on the lantern: the poster shrinks about the fire", () => {
    const h = harness();
    startWake(h.engine);
    const box = { left: -32, top: -32, width: 1664, height: 1064 };
    const fit = posterRegistration(h.engine, box)!;
    const cover = Math.max(1664 / 1600, 1064 / 1000);
    expect(fit.s).toBeLessThan(1 / cover);
    expect(fit.s).toBeGreaterThan(0.75 / cover);
    // where the poster draws the lantern after the settle vs where the live frame draws it
    const poster = ndc(HOME, LANTERN), live = ndc(wakeStart(HOME, [LANTERN.x, LANTERN.y, LANTERN.z]), LANTERN);
    const px = (poster.x + 1) / 2 * 1600, py = (1 - poster.y) / 2 * 1000;
    const sx = box.left + fit.x + fit.s * ((box.width - 1600 * cover) / 2 + px * cover);
    const sy = box.top + fit.y + fit.s * ((box.height - 1000 * cover) / 2 + py * cover);
    expect(Math.abs(sx - (live.x + 1) / 2 * 1600)).toBeLessThan(6);
    expect(Math.abs(sy - (1 - live.y) / 2 * 1000)).toBeLessThan(6);
  });

  it("follows a refitted portrait frame, and declines a degenerate one", () => {
    const h = harness();
    h.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 834, height: 1112, right: 834, bottom: 1112, x: 0, y: 0, toJSON: () => ({}) });
    h.camera.aspect = 834 / 1112; h.camera.updateProjectionMatrix();
    h.rig.applyPreset({ ...HOME, target: [-84.8, 20, -124.5], distance: 1089 }, true);
    const fit = posterRegistration(h.engine, { left: -32, top: -32, width: 898, height: 1176 })!;
    expect(fit.s).toBeGreaterThan(0.4);
    expect(fit.s).toBeLessThan(0.8);
    expect(posterRegistration(h.engine, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
    h.ctx.services.delete("layout" as never);
    expect(posterRegistration(h.engine, { left: 0, top: 0, width: 834, height: 1112 })).toBeNull();
  });

  it("dims only day key art toward the live night, and fades in opacity only under reduced motion", () => {
    const h = harness();
    document.body.insertAdjacentHTML("afterbegin", '<div id="pv-poster"><img alt=""></div>');
    (h.ctx.uniforms.uNight as { value: number }).value = 0.9;
    expect(arrivalFade(h.engine).dip).toBeCloseTo(0.9, 9);
    document.documentElement.setAttribute("data-pv-hour", "night");
    expect(arrivalFade(h.engine).dip).toBe(0);
    h.motion!.setStill(true);
    expect(arrivalFade(h.engine)).toEqual({ reduced: true });
  });
});
