// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CameraRig } from "../engine/camera-rig";
import type { Engine } from "../engine/engine";
import type { EngineContext } from "../engine/types";
import { ensureMotionService } from "../ui/services";
import { startWake, wantsWake, WAKE_PULLBACK } from "./wake";

afterEach(() => vi.unstubAllGlobals());
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
  it("preserves camera drift without attenuating analytical light", () => {
    const beam = { setIntroScale: vi.fn() };
    const rig = { target: { x: 0, y: 0, z: 0 }, distance: 100, camera: { fov: 30 }, pitch: 1, yaw: 0, inputEpoch: 0, applyPreset: vi.fn(), glideTo: vi.fn(), cancelGlide: vi.fn() };
    let step = () => {};
    vi.stubGlobal("requestAnimationFrame", vi.fn((fn: () => void) => { step = fn; return 1; }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const stop = startWake({ ctx: { rig, services: new Map([["beam", beam]]) } } as unknown as Engine);
    expect(rig.applyPreset).toHaveBeenCalledWith(expect.objectContaining({ distance: 100 * (1 + WAKE_PULLBACK) }), true);
    expect(rig.glideTo).toHaveBeenCalledWith(expect.objectContaining({ distance: 100 }), { ms: 6500, lift: 0 });
    step();
    window.dispatchEvent(new Event("pointerdown"));
    stop();
    expect(rig.cancelGlide).toHaveBeenCalledOnce();
    expect(beam.setIntroScale).not.toHaveBeenCalled();
  });
});

it("cancels the active wake on reduction and never attenuates the beam (D13 + A16)", () => {
  vi.useFakeTimers();
  const rig = new CameraRig(new THREE.PerspectiveCamera());
  const setIntroScale = vi.fn();
  const ctx = { rig, services: new Map([["beam", { setIntroScale }]]) } as unknown as EngineContext;
  const motion = ensureMotionService(ctx), stop = startWake({ ctx } as Engine);
  expect(rig.gliding).toBe(true);
  motion.setStill(true);
  expect(rig.gliding).toBe(false);
  const at = rig.distance; rig.update(20); expect(rig.distance).toBe(at);
  expect(setIntroScale).not.toHaveBeenCalled();
  stop(); motion.dispose(); vi.useRealTimers();
});
