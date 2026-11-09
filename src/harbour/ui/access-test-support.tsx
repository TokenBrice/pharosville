import * as THREE from "three";
import "./DetailPanels";
import { CameraRig } from "../engine/camera-rig";
import { createWorldUniforms } from "../engine/uniforms";
import type { Engine } from "../engine/engine";
import type { EngineContext, WorldSystem } from "../engine/types";
import { buildHarbourModel } from "../model/build";
import { projectedFixtures, TRUTH_NOW } from "../__fixtures__/projection";
import type { HarbourPayloads } from "../model/types";
import layout from "../data/layout.json";
import type { HarbourLayout } from "../layout/types";
import { HarbourUIStore } from "./store";

/** Actual UI store and projected readings, with no renderer, requests or running world. */
export function accessFixture() {
  const canvas = document.createElement("canvas"), camera = new THREE.PerspectiveCamera(25, 1.6), rig = new CameraRig(camera);
  const payloads = Object.fromEntries(Object.entries(projectedFixtures()).map(([key, data]) => [key, {
    data, meta: { updatedAt: TRUTH_NOW / 1000 - 60, ageSeconds: 60, status: "fresh" }, fetchedAtMs: TRUTH_NOW,
  }])) as HarbourPayloads;
  const model = buildHarbourModel(payloads, TRUTH_NOW);
  const ctx = { camera, rig, scene: new THREE.Scene(), uniforms: createWorldUniforms(), timeOfDay: { hour: 12 },
    services: new Map(), renderer: { domElement: canvas } } as unknown as EngineContext;
  ctx.services.set("layout", layout as unknown as HarbourLayout);
  ctx.services.set("model", model);
  rig.applyPreset({ target: [0, 0, 0], distance: 300, fovDeg: 25, pitchDeg: 26, yawDeg: 0 }, true);
  let system!: WorldSystem;
  const store = new HarbourUIStore({ ctx, add: (s: WorldSystem) => { system = s; } } as unknown as Engine);
  return { store, model, canvas, payloads, frame: () => system.update({ delta: 1 / 60, elapsed: 1, nowMs: Date.now() }, ctx),
    dispose: () => { store.dispose(); store.motion.dispose(); ctx.services.get("sound")?.dispose(); } };
}
