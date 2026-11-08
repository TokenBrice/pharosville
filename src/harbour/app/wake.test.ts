// @vitest-environment jsdom
import * as THREE from "three";
import { CameraRig } from "../engine/camera-rig";
import type { Engine } from "../engine/engine";
import type { EngineContext } from "../engine/types";
import { ensureMotionService } from "../ui/services";
import { describe, expect, it, vi } from "vitest";
import { kindle, startWake, WAKE_PULLBACK } from "./wake";

describe("the harbour wakes", () => {
  it("kindles the fire from dark to exactly its live value", () => {
    expect(kindle(0)).toBe(0);
    expect(kindle(0.3)).toBe(0);
    expect(kindle(1.6)).toBeGreaterThan(0.3);
    expect(kindle(2.9)).toBe(1);
    expect(kindle(60)).toBe(1);
  });
  it("starts only a little further out", () => expect(WAKE_PULLBACK).toBeLessThanOrEqual(0.14));
});

it("cancels the active wake on reduction and restores the live beam immediately", () => {
  vi.useFakeTimers();
  const rig = new CameraRig(new THREE.PerspectiveCamera());
  const setIntroScale = vi.fn();
  const ctx = { rig, services: new Map([["beam", { setIntroScale }]]) } as unknown as EngineContext;
  const motion = ensureMotionService(ctx), stop = startWake({ ctx } as Engine);
  expect(rig.gliding).toBe(true); expect(setIntroScale).toHaveBeenLastCalledWith(0);
  motion.setStill(true);
  expect(rig.gliding).toBe(false); expect(setIntroScale).toHaveBeenLastCalledWith(1);
  const at = rig.distance; rig.update(20); expect(rig.distance).toBe(at);
  stop(); motion.dispose(); vi.useRealTimers();
});
