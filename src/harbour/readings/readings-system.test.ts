// @vitest-environment jsdom
import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { ReadingsSystem, type ReadingsService } from "./readings-system";
import { buildHarbourModel } from "../model/build";
import { createWorldUniforms } from "../engine/uniforms";
import { ensureMotionService } from "../ui/services";
import type { EngineContext } from "../engine/types";
import type { HarbourPayloads } from "../model/types";

it("holds fog/cone decoration while source ages and installed readings keep updating", async () => {
  const now = 1_790_000_000_000, camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 100, 200); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const services = new Map<string, unknown>([["fx:textures", { refs: 1, noise: new THREE.Texture(), ripple: new THREE.Texture(), release() {} }]]);
  const ctx = { camera, services, scene: new THREE.Scene(), uniforms: createWorldUniforms(), composer: { addPass: vi.fn(), removePass: vi.fn() } } as unknown as EngineContext;
  const motion = ensureMotionService(ctx); motion.setStill(true);
  const readings = new ReadingsSystem(); await readings.init(ctx);
  const payloads: HarbourPayloads = { stability: { data: { current: { score: 91, band: "BEDROCK" } }, meta: { updatedAt: now / 1000 - 60, ageSeconds: 60, status: "fresh" }, fetchedAtMs: now } };
  const update = (time: number) => {
    services.set("model", buildHarbourModel(payloads, time));
    readings.update({ delta: 1, elapsed: (time - now) / 1000, nowMs: time }, ctx);
  };
  update(now);
  const svc = services.get("readings") as ReadingsService;
  expect(svc.psi.score).toBe(91);
  const before = svc.landmarks.pharos.ageSec;
  update(now + 60_000);
  expect(svc.landmarks.pharos.ageSec).toBe((before ?? 0) + 60);
  payloads.stability = { ...payloads.stability!, data: { current: { score: 75, band: "STEADY" } } };
  update(now + 61_000);
  expect(svc.psi.score).toBe(75); expect(svc.asOfMs).toBe(now + 61_000);
  const h = readings as unknown as { decorativeTime: THREE.Uniform<number> };
  expect(h.decorativeTime.value).toBe(0);
  readings.dispose(ctx); motion.dispose();
});
