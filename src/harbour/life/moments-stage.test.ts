import { describe, expect, it } from "vitest";
import { MOMENT_DURATION_MS } from "../model/moments";
import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import { MomentsStage, flareAt } from "./moments-stage";

describe("depeg moment: the reef beacon flares", () => {
  it("flares three times, then is dark, well inside the depeg moment", () => {
    const peaks = [0.55, 2.75, 4.95].map(flareAt);
    for (const p of peaks) expect(p).toBeGreaterThan(0.99);
    expect(flareAt(-1)).toBe(0);
    expect(flareAt(1.5)).toBe(0);
    expect(flareAt(6.7)).toBe(0);
    expect(6.6 * 1000).toBeLessThanOrEqual(MOMENT_DURATION_MS.depeg!);
  });
});

it("ends an active flare immediately on reduction and does not replay it on resume", () => {
  const stage = new MomentsStage(), material = new THREE.SpriteMaterial(), flare = new THREE.Sprite(material);
  const current = { event: { kind: "depeg" }, startMs: 0, endMs: 15000 };
  const motion = { reduced: false };
  const ctx = { services: new Map<string, unknown>([["motion", motion], ["events", { current }]]), uniforms: { uNight: { value: 1 } } } as unknown as EngineContext;
  Object.assign(stage, { flare, flareMat: material });
  stage.update({ delta: 0.1, elapsed: 0.55, nowMs: 550 }, ctx);
  expect(flare.visible).toBe(true); expect(material.opacity).toBeGreaterThan(0.8);
  motion.reduced = true; stage.update({ delta: 0.1, elapsed: 0.6, nowMs: 600 }, ctx);
  expect(flare.visible).toBe(false);
  motion.reduced = false; stage.update({ delta: 0.1, elapsed: 2.75, nowMs: 2750 }, ctx);
  expect(flare.visible).toBe(false);
  material.dispose();
});
