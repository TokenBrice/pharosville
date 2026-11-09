// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CameraInput } from "./input";
import { CameraRig } from "./camera-rig";
import { ensureMotionService } from "../ui/services";
import type { EngineContext } from "./types";

let now = 0;
const inputs: CameraInput[] = [];
function fixture() {
  const el = document.createElement("canvas");
  Object.defineProperties(el, { clientWidth: { value: 1600 }, clientHeight: { value: 1000 } });
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 1000 }) as DOMRect;
  const rig = new CameraRig(new THREE.PerspectiveCamera(25, 1.6));
  rig.applyPreset({ target: [0, 0, 0], distance: 300, fovDeg: 25, pitchDeg: 26, yawDeg: 0 }, true);
  const motion = ensureMotionService({ services: new Map() } as unknown as EngineContext);
  const input = new CameraInput(el, rig, motion); inputs.push(input);
  const pan = vi.spyOn(rig, "pan");
  const pointer = (type: string, x: number, y = 0, id = 1, pointerType = "touch", button = 0) => {
    now += 20;
    el.dispatchEvent(Object.assign(new Event(type), { pointerId: id, pointerType, button, clientX: x, clientY: y }));
  };
  const wheel = (deltaY = 10, deltaMode = 0, ctrlKey = false) => el.dispatchEvent(Object.assign(new Event("wheel", { cancelable: true }), { deltaY, deltaMode, ctrlKey, clientX: 800, clientY: 500 }));
  return { rig, motion, input, pointer, wheel, pan };
}
beforeEach(() => { now = 0; vi.spyOn(performance, "now").mockImplementation(() => now); });
afterEach(() => { for (const input of inputs.splice(0)) input.dispose(); vi.restoreAllMocks(); });

describe("shared touch commitment", () => {
  it("keeps jitter still and consumes the accumulated drag once at 10px", () => {
    const f = fixture(); f.pointer("pointerdown", 0);
    f.pointer("pointermove", 5); f.pointer("pointermove", 10);
    expect(f.rig.inputEpoch).toBe(0); expect(f.pan).not.toHaveBeenCalled();
    f.pointer("pointermove", 11);
    expect(f.pan).toHaveBeenCalledTimes(1);
    expect(f.pan.mock.calls[0]).toEqual(f.rig.dragToWorld(11, 0, 1000));
    f.pointer("pointermove", 13);
    expect(f.pan.mock.calls[1]).toEqual(f.rig.dragToWorld(2, 0, 1000));
  });

  it("rebases 1→2→1 and a third contact without camera jumps", () => {
    const f = fixture(); f.pointer("pointerdown", 0); f.pointer("pointerdown", 30, 0, 2);
    f.pointer("pointermove", 5); expect(f.pan).not.toHaveBeenCalled();
    f.pointer("pointermove", 15); expect(f.pan).toHaveBeenCalledTimes(1);
    f.pointer("pointerdown", 90, 0, 3); f.pointer("pointermove", 100, 0, 3);
    expect(f.pan).toHaveBeenCalledTimes(1);
    f.pointer("pointerup", 100, 0, 3); f.pointer("pointermove", 16);
    expect(f.pan).toHaveBeenCalledTimes(2);
    f.pointer("pointerup", 30, 0, 2); f.pointer("pointermove", 17);
    expect(f.pan.mock.calls.at(-1)).toEqual(f.rig.dragToWorld(1, 0, 1000));
  });

  it.each(["pointercancel", "lostpointercapture", "blur", "wheel", "reduction", "stop"])("%s clears an active fling", (cancel) => {
    const f = fixture(); f.pointer("pointerdown", 0); f.pointer("pointermove", 50); f.pointer("pointerup", 50);
    f.input.update(1 / 60); expect(f.pan.mock.calls.length).toBeGreaterThan(1);
    if (cancel === "blur") window.dispatchEvent(new Event("blur"));
    else if (cancel === "wheel") f.wheel();
    else if (cancel === "reduction") f.motion.setStill(true);
    else if (cancel === "stop") f.rig.stop();
    else { f.pointer("pointerdown", 0); f.pointer(cancel, 0); }
    f.pan.mockClear(); f.input.update(0.1); expect(f.pan).not.toHaveBeenCalled();
    f.motion.dispose();
  });

  it.each(["pointercancel", "lostpointercapture"])("%s during contact never flings", (type) => {
    const f = fixture(); f.pointer("pointerdown", 0); f.pointer("pointermove", 50); f.pointer(type, 50); f.pointer("pointerup", 50);
    f.pan.mockClear(); f.input.update(1); expect(f.pan).not.toHaveBeenCalled();
  });

  it("accepts primary mouse/pen only and never flings them or reduced touches", () => {
    for (const type of ["mouse", "pen"]) {
      const f = fixture(); f.pointer("pointerdown", 0, 0, 1, type, 2); f.pointer("pointermove", 50, 0, 1, type, 2);
      expect(f.pan).not.toHaveBeenCalled();
      f.pointer("pointerdown", 0, 0, 2, type); f.pointer("pointermove", 50, 0, 2, type); f.pointer("pointerup", 50, 0, 2, type);
      expect(f.pan).toHaveBeenCalledTimes(1); f.pan.mockClear(); f.input.update(1); expect(f.pan).not.toHaveBeenCalled();
    }
    const f = fixture(); f.motion.setStill(true); f.pointer("pointerdown", 0); f.pointer("pointermove", 50); f.pointer("pointerup", 50);
    f.pan.mockClear(); f.input.update(1); expect(f.pan).not.toHaveBeenCalled();
  });
});

describe("consistent wheel and fling", () => {
  it("normalizes lines/pages, keeps ctrl-pinch policy, and caps each event", () => {
    const px = fixture(), line = fixture(), page = fixture(), pinch = fixture();
    px.wheel(48); line.wheel(3, 1); page.wheel(0.048, 2); pinch.wheel(48, 0, true);
    for (const f of [line, page, pinch]) expect(f.rig.pendingDistance).toBeCloseTo(px.rig.pendingDistance);
    const repeated = fixture(); repeated.wheel(10); repeated.wheel(10);
    expect(repeated.rig.pendingDistance).toBeCloseTo(300 * Math.exp(20 * 0.0012));
    const f = fixture(); f.wheel(1e6); expect(f.rig.pendingDistance).toBe(375);
    f.wheel(-1e6); expect(f.rig.pendingDistance).toBe(300);
  });

  it("integrates equal fling travel at 15/30/60/120/144Hz, including the stop threshold", () => {
    const travels = [15, 30, 60, 120, 144].map((hz) => {
      const f = fixture(); f.pointer("pointerdown", 0); f.pointer("pointermove", 50); f.pointer("pointerup", 50); f.pan.mockClear();
      for (let i = 0; i < hz * 5; i++) f.input.update(1 / hz);
      return f.pan.mock.calls.reduce((sum, [x]) => sum + x, 0);
    });
    for (const travel of travels) expect(travel).toBeCloseTo(travels[0], 9);
  });
});
