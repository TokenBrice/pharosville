import * as THREE from "three";
import { vi } from "vitest";
import { CameraRig } from "../../engine/camera-rig";
import { createWorldUniforms } from "../../engine/uniforms";
import type { Engine } from "../../engine/engine";
import type { EngineContext, WorldSystem } from "../../engine/types";
import { buildHarbourModel } from "../../model/build";
import type { HarbourPayloads } from "../../model/types";
import { projectedFixtures, TRUTH_NOW } from "../../__fixtures__/projection";
import { HarbourUIStore } from "../store";
import { newLedgerContext } from "../ledger-state";
import layout from "../../data/layout.json";
import type { HarbourLayout } from "../../layout/types";

export function panelFixture(width = 1600, height = 1000, opts: { restore?: boolean; current?: boolean } = {}) {
  if (!opts.restore) history.replaceState(null, "", "/");
  const payloads = Object.fromEntries(Object.entries(projectedFixtures()).map(([key, data]) => [key, { data, meta: (data as { _meta?: unknown })._meta, fetchedAtMs: TRUTH_NOW }])) as HarbourPayloads;
  const model = buildHarbourModel(payloads, TRUTH_NOW);
  if (opts.current === false) model.truth.stablecoins.state = "unknown";
  const canvas = document.createElement("canvas"), camera = new THREE.PerspectiveCamera(25, width / height), rig = new CameraRig(camera);
  let w = width, h = height;
  Object.defineProperties(canvas, { clientWidth: { get: () => w }, clientHeight: { get: () => h }, offsetWidth: { get: () => w }, offsetHeight: { get: () => h } });
  const ctx = { camera, rig, scene: new THREE.Scene(), uniforms: createWorldUniforms(), services: new Map<string, unknown>([["model", model], ["feed", { payloads }], ["layout", layout as unknown as HarbourLayout]]), renderer: { domElement: canvas } } as unknown as EngineContext;
  rig.applyPreset({ target: [0, 0, 0], distance: 300, fovDeg: 25, pitchDeg: 26, yawDeg: 0 }, true);
  let system!: WorldSystem;
  const store = new HarbourUIStore({ ctx, add: (s: WorldSystem) => { system = s; } } as unknown as Engine);
  // Consume any prior fixture's handoff before establishing this test's independent state.
  system.update({ delta: 0, elapsed: 0, nowMs: TRUTH_NOW }, ctx);
  if (!opts.restore) store.set({ selected: null, ledger: newLedgerContext(), ledgerOpen: false, ledgerOrigin: false });
  vi.spyOn(store.picking, "worldPosition").mockReturnValue([0, 0, 0]);
  vi.spyOn(store.picking, "setHover").mockImplementation(() => {});
  vi.spyOn(store.picking, "setSelected").mockImplementation(() => {});
  return { store, model, rig, ctx,
    frame: (delta = 1 / 60) => system.update({ delta, elapsed: 1, nowMs: Date.now() }, ctx),
    resize: (width: number, height: number) => { w = width; h = height; camera.aspect = w / h; camera.updateProjectionMatrix(); window.innerWidth = w; window.innerHeight = h; dispatchEvent(new Event("resize")); },
    dispose: () => { store.dispose(); store.motion.dispose(); },
  };
}
