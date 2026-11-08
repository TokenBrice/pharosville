// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HarbourUIStore } from "./store";
import { CameraInput } from "../engine/input";
import { CameraRig } from "../engine/camera-rig";
import { createWorldUniforms } from "../engine/uniforms";
import type { Engine } from "../engine/engine";
import type { EngineContext, WorldSystem } from "../engine/types";

const cleanups: Array<() => void> = [];
function fixture() {
  const canvas = document.createElement("canvas"), camera = new THREE.PerspectiveCamera(25, 1.6), rig = new CameraRig(camera);
  Object.defineProperties(canvas, { clientHeight: { value: 1000 }, clientWidth: { value: 1600 } });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 1000 }) as DOMRect;
  const ctx = { camera, rig, scene: new THREE.Scene(), uniforms: createWorldUniforms(), services: new Map(), renderer: { domElement: canvas } } as unknown as EngineContext;
  rig.applyPreset({ target: [0, 0, 0], distance: 300, fovDeg: 25, pitchDeg: 26, yawDeg: 0 }, true);
  let system!: WorldSystem;
  const engine = { ctx, add: (s: WorldSystem) => { system = s; } } as unknown as Engine;
  const store = new HarbourUIStore(engine), input = new CameraInput(canvas, rig, store.motion);
  cleanups.push(() => { input.dispose(); store.dispose(); store.motion.dispose(); });
  const hit = { kind: "boat" as const, id: "coin" };
  const pick = vi.spyOn(store.picking, "pick").mockReturnValue(hit);
  vi.spyOn(store.picking, "setHover").mockImplementation(() => {});
  vi.spyOn(store.picking, "setSelected").mockImplementation(() => {});
  vi.spyOn(store.picking, "choices").mockReturnValue([]);
  const pointer = (type: string, x = 100, id = 1, pointerType = "touch") => canvas.dispatchEvent(Object.assign(new Event(type), { pointerId: id, pointerType, button: 0, clientX: x, clientY: 100 }));
  const frame = (dt = 1 / 60) => system.update({ delta: dt, elapsed: 1, nowMs: Date.now() }, ctx);
  return { store, input, rig, hit, pick, pointer, frame };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("selection shares gesture commitment", () => {
  it("holds at 480ms, treats 10px jitter as a tap, and never selects a committed drag", () => {
    const f = fixture(); f.pointer("pointerdown"); f.pointer("pointermove", 110);
    vi.advanceTimersByTime(479); expect(f.store.getSnapshot().hover).toBeNull();
    vi.advanceTimersByTime(1); expect(f.store.getSnapshot().hover).toEqual(f.hit);
    f.pointer("pointerup", 110); expect(f.store.getSnapshot().selected).toBeNull();
    f.pointer("pointerdown"); f.pointer("pointermove", 110); f.pointer("pointerup", 110);
    expect(f.store.getSnapshot().selected).toEqual(f.hit);
    f.store.select(null); f.pointer("pointerdown"); f.pointer("pointermove", 111); f.pointer("pointerup", 111);
    expect(f.store.getSnapshot().selected).toBeNull();
  });

  it("suppresses taps through 1→2→1 and a third contact until every contact lifts", () => {
    const f = fixture();
    f.pointer("pointerdown"); f.pointer("pointerdown", 110, 2); f.pointer("pointerdown", 120, 3);
    f.pointer("pointerup", 120, 3); f.pointer("pointerup", 110, 2); f.pointer("pointerup");
    expect(f.store.getSnapshot().selected).toBeNull();
    f.pointer("pointerdown"); f.pointer("pointerup"); expect(f.store.getSnapshot().selected).toEqual(f.hit);
  });

  it.each(["pointercancel", "lostpointercapture"])("%s cancels the pending tap and hold", (type) => {
    const f = fixture(); f.pointer("pointerdown"); f.pointer(type); vi.advanceTimersByTime(1000); f.pointer("pointerup");
    expect(f.store.getSnapshot()).toMatchObject({ selected: null, hover: null });
  });

  it("suspends an old hybrid cursor until new hover-capable motion", () => {
    const f = fixture(); f.pointer("pointermove", 100, 1, "mouse"); f.pointer("pointermove", 110, 1, "mouse"); f.frame();
    expect(f.store.getSnapshot().hover).toEqual(f.hit);
    f.pointer("pointerdown"); f.pick.mockClear(); f.frame();
    expect(f.pick).not.toHaveBeenCalled(); expect(f.store.getSnapshot().hover).toBeNull();
    f.pointer("pointerup"); f.store.dismissHover(); f.pick.mockClear(); f.frame(); expect(f.pick).not.toHaveBeenCalled();
    f.pointer("pointermove", 120, 1, "pen"); f.pointer("pointermove", 130, 1, "pen"); f.frame();
    expect(f.pick).toHaveBeenCalled();
  });

  it("opens choices for expanded touch and pen targets, and selection clears them", () => {
    const f = fixture(), choices = [f.hit, { kind: "boat" as const, id: "other" }];
    vi.mocked(f.store.picking.choices!).mockReturnValue(choices);
    for (const pointerType of ["touch", "pen"]) {
      f.pointer("pointerdown", 100, 1, pointerType); f.pointer("pointerup", 100, 1, pointerType);
      expect(f.store.getSnapshot().shipChoices).toEqual(choices);
      f.store.select(f.hit); expect(f.store.getSnapshot().shipChoices).toEqual([]);
    }
  });
});

describe("camera ownership and keyboard", () => {
  it("accumulates rapid 1.25× steps with a 150ms chase and cuts under reduction", () => {
    const f = fixture(); f.store.keyZoom(1); f.store.keyZoom(1);
    expect(f.rig.pendingDistance).toBeCloseTo(192); expect(f.rig.gliding).toBe(false);
    f.rig.update(0.15); expect(f.rig.distance).toBeCloseTo(192 + (300 - 192) / Math.E);
    f.store.motion.setStill(true); f.store.keyZoom(-1); expect(f.rig.distance).toBeCloseTo(f.rig.pendingDistance);
  });

  it("Home and Stop end watch/follow/glide, and reduction also stops the damped chase", () => {
    const f = fixture();
    const preset = { target: [100, 0, 100] as [number, number, number], distance: 240, fovDeg: 25, pitchDeg: 26, yawDeg: 0 };
    f.store.set({ watch: { symbol: "X", line: "test" }, follow: "coin" });
    f.rig.glideTo(preset); f.store.goHome();
    expect(f.store.getSnapshot()).toMatchObject({ watch: null, follow: null });
    f.store.stopAutomation(); expect(f.rig.gliding).toBe(false);
    f.rig.pan(100, 20); f.rig.update(0.1); f.store.motion.setStill(true);
    const at = f.rig.target.clone(); f.rig.update(10); expect(f.rig.target).toEqual(at);
  });

  it("normalizes diagonal pan to 520px/s and integrates the same displacement across refresh rates", () => {
    const travel = (hz: number, diagonal: boolean) => {
      const f = fixture(), drag = vi.spyOn(f.rig, "dragToWorld").mockImplementation((x, y) => [x, y]);
      f.store.keyPan("up", true); if (diagonal) f.store.keyPan("left", true);
      for (let i = 0; i < hz; i++) f.frame(1 / hz);
      const x = drag.mock.calls.reduce((n, [x]) => n + x, 0), y = drag.mock.calls.reduce((n, [, y]) => n + y, 0);
      return Math.hypot(x, y);
    };
    const baseline = travel(60, false);
    for (const hz of [15, 30, 60, 120, 144]) expect(travel(hz, true)).toBeCloseTo(baseline, 8);
    expect(baseline).toBeCloseTo(520 * (1 - (1 - Math.exp(-8)) / 8));
  });
});

it("a manual wheel/pan takeover ends Watch without discarding the visitor's pending movement", () => {
  const f = fixture();
  Object.assign(f.store, { watchRun: { stops: [], i: 0, dwell: 0, epoch: f.rig.inputEpoch, spring: { x: 0, z: 0, vx: 0, vz: 0 } } });
  f.store.set({ watch: { symbol: "X", line: "test" } });
  f.rig.zoom(0.8); f.rig.update(1 / 60); f.frame();
  expect(f.store.getSnapshot().watch).toBeNull();
  expect(f.rig.pendingDistance).toBe(240);
});
