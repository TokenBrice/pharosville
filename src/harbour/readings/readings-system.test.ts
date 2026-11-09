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

it("flies the storm signal's first installed reading at once, on a fresh load and after a tab return, and hauls live changes", async () => {
  const now = 1_790_000_000_000, camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 100, 200); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const rig = { slots: [[0, 12, 0], [0, 9, 0], [0, 6, 0], [0, 3, 0]], foot: [0, 1, 0], masthead: [0, 14, 0] };
  const station = { kind: "stormstation", root: new THREE.Group(), anchors: { signal: rig } };
  const services = new Map<string, unknown>([
    ["fx:textures", { refs: 1, noise: new THREE.Texture(), ripple: new THREE.Texture(), release() {} }],
    ["civic", { plots: new Map([["stormstation", station]]) }],
  ]);
  const ctx = { camera, services, scene: new THREE.Scene(), uniforms: createWorldUniforms(), composer: { addPass: vi.fn(), removePass: vi.fn() } } as unknown as EngineContext;
  const motion = ensureMotionService(ctx); // live motion (not reduced): only an installed reading may skip the haul
  window.history.replaceState(null, "", "/?dews=DANGER");
  let tabHidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => tabHidden });
  const readings = new ReadingsSystem();
  try {
    await readings.init(ctx);
    const payloads: HarbourPayloads = { stability: { data: { current: { score: 91, band: "BEDROCK" } }, meta: { updatedAt: now / 1000 - 60, ageSeconds: 60, status: "fresh" }, fetchedAtMs: now } };
    let time = now;
    const frame = (model = false) => {
      if (model) services.set("model", buildHarbourModel(payloads, time));
      time += 1000 / 60;
      readings.update({ delta: 1 / 60, elapsed: (time - now) / 1000, nowMs: time }, ctx);
    };
    const q = (readings as unknown as { q: URLSearchParams }).q;
    const lanterns = () => (station.root.getObjectByName("storm_signal_lanterns") as THREE.InstancedMesh).count;
    const p = () => Array.from((readings as unknown as { cones: { p: Float32Array } }).cones.p);
    // a fresh load reading Danger: the first frame flies all four shapes and their lanterns, not a lone hauled cone
    frame(true);
    expect((services.get("readings") as ReadingsService).cones).toBe(4);
    expect(lanterns()).toBe(4);
    expect(p()).toEqual([1, 1, 1, 1]);
    // a live change in view (Alert) hauls the struck drums down, dark at once
    q.set("dews", "ALERT");
    frame(true);
    expect(lanterns()).toBe(2);
    expect(p()[3]).toBeGreaterThan(0.9);
    // the tab hides; the reading moves on unseen (Warning); on its return the signal flies it at once
    tabHidden = true;
    document.dispatchEvent(new Event("visibilitychange"));
    q.set("dews", "WARNING");
    tabHidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    frame(true);
    expect(lanterns()).toBe(3);
    expect(p()).toEqual([1, 1, 1, 0]);
    // and live again afterwards: Danger hauls its last drum up
    q.set("dews", "DANGER");
    frame(true);
    expect(p()[3]).toBeLessThan(0.1);
  } finally {
    readings.dispose(ctx); motion.dispose();
    delete (document as { hidden?: boolean }).hidden; // back to the prototype's
    window.history.replaceState(null, "", "/");
  }
});
