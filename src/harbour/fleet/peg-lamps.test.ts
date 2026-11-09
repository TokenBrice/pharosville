// @vitest-environment jsdom
import type { Services } from "../engine/services";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { EngineContext, FrameState } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { PH_ANCHORED } from "../sim/sim";
import { FleetSystem } from "./fleet-system";
import { RidingLights } from "./riding-lights";
import { FLEET_DATA_TEXELS } from "./shaders/pose";

const frame: FrameState = { delta: 1 / 60, elapsed: 2, nowMs: 0 };
const truth = (peg: string) => ({ stablecoins: { state: "current" }, pegSummary: { state: peg } });

/** One hull at anchor with a peg reading, in view, at night: her anchor lamp and lantern glass are analytical (D11). */
function anchoredAtNight() {
  const system = new FleetSystem();
  const mesh = { castShadow: false, setVisibleAt: vi.fn(), setGeometryIdAt: vi.fn(), setMatrixAt: vi.fn() };
  const camera = new THREE.PerspectiveCamera(45, 1.5, 1, 20000);
  camera.position.set(0, 50, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const variant = { masthead: new THREE.Vector3(0, 6, 0), bowCleat: new THREE.Vector3(4, 1, 0), sternCleat: new THREE.Vector3(-4, 1, 0), sternLantern: new THREE.Vector3(-4.5, 2.5, 0), beam: 2 };
  const boat = {
    id: "coin", inst: 0, variant, scale: 1, loa: 10, beam: 2, geomFull: 0, geomLod: 0, geomWreck: 0, geomCur: 0,
    wrecked: false, swing: 0, heel: 0, hi: 0, px: 0, pz: 0, vx: 0, vz: 0, seen: true, phi: 0.5, slot: -1,
    brand: new THREE.Color("#5588AA"), visible: false, posed: false, visualRadius: 6, dist: 0, reading: true, lit: false,
    flag: 1, struck: false, mastK: 0, titan: false, cx: 0, cy: 0, cz: 0, r: 5, top: 10, swell: new Float64Array(30),
    dead: false, flog: 0, row: 0, brail: 0, dox: 0, doz: 0, gyaw: 0,
  };
  const model = { boats: [{ id: "coin" }], truth: truth("current") };
  const ocean = { hullHeights: vi.fn((_x: number, _z: number, _bx: number, _bz: number, _px: number, _pz: number, out: Float64Array) => { out.fill(0); }) };
  const sim = {
    resumeHolding: false, slotOf: () => null, wind: { fromRad: -1, strength: 0.35 }, layout: { slots: [] },
    pose: { count: 1, ids: ["coin"], position: [0, 0, 0], heading: [0], phase: [PH_ANCHORED], sailState: [0], heel: [0], slot: [-1], lines: [0], event: [0], drift: [0, 0], pitch: [0], outing: [0] },
  };
  const uniforms = createWorldUniforms();
  uniforms.uWindowGlow.value = 1; // night
  const context = {
    camera, renderer: { domElement: { clientHeight: 600 }, getPixelRatio: () => 1 }, rig: { distance: 1000 }, uniforms,
    services: new Map<string, unknown>([["model", model], ["sim", sim], ["ocean", ocean], ["wake", { stamp: vi.fn() }], ["readiness", { revision: 7, boats: 1, prepared: true }]]) as Services,
  } as unknown as EngineContext;
  const riding = new RidingLights(createWorldUniforms(), 16);
  Object.assign(system, { mesh, model, modelRevision: 7, boats: [boat], byId: new Map([[boat.id, boat]]), logosAsked: true, coveState: "done", lines: { begin() {}, end() {} }, riding });
  const fleet = system as unknown as { ensureData(n: number): void; data: Float32Array; uniforms: { uFleetData: { value: THREE.DataTexture } } };
  fleet.ensureData(1);
  const color = riding.object.geometry.getAttribute("aColor") as THREE.BufferAttribute;
  const info = riding.object.geometry.getAttribute("aInfo") as THREE.BufferAttribute;
  return {
    system, mesh, sim, model, riding, context,
    texture: () => fleet.uniforms.uFleetData.value,
    lantern: () => fleet.data[(boat.inst * FLEET_DATA_TEXELS + 2) * 4 + 2],
    /** Brightness of the submitted analytical riding sprites (her anchor lamp and its streak). */
    anchorLamp: () => {
      let sum = 0, count = 0;
      for (let k = 0; k < riding.count; k++) if (info.getW(k) >= 0.5) { count++; sum += color.getX(k) + color.getY(k) + color.getZ(k); }
      return { count, sum };
    },
  };
}

describe("D11 a lapsed peg reading puts out the stern / anchor lamps at once", () => {
  it("clears the held fleet's lantern glass and analytical riding sprites before the resume hold returns, once per change", () => {
    const f = anchoredAtNight();
    f.system.update(frame, f.context);
    expect(f.lantern()).toBe(1);
    expect(f.anchorLamp().count).toBe(2); // lamp + streak
    expect(f.anchorLamp().sum).toBeGreaterThan(0);
    // a night tab return with expired readings: the model ages at once, the sim holds the last fleet through its path wait
    f.sim.resumeHolding = true;
    f.model.truth = truth("stale");
    f.mesh.setMatrixAt.mockClear();
    const version = f.texture().version;
    const douse = vi.spyOn(f.riding, "douseAnalytic");
    f.system.update(frame, f.context);
    expect(f.mesh.setMatrixAt).not.toHaveBeenCalled(); // still holding: nothing re-posed
    expect(f.lantern()).toBe(0);
    expect(f.texture().version).toBeGreaterThan(version); // uploaded now, not at the hold's end
    expect(f.anchorLamp()).toEqual({ count: 2, sum: 0 });
    // change-detected: a held frame with the same evidence costs nothing more
    f.system.update(frame, f.context);
    f.system.update(frame, f.context);
    expect(douse).toHaveBeenCalledTimes(1);
    // current evidence again: the next full frame re-lights them from it (never the held, dark sprites)
    f.model.truth = truth("current");
    f.sim.resumeHolding = false;
    f.system.update(frame, f.context);
    expect(f.lantern()).toBe(1);
    expect(f.anchorLamp().sum).toBeGreaterThan(0);
    for (const state of ["unknown", "unavailable"]) {
      f.sim.resumeHolding = true;
      f.model.truth = truth(state);
      f.system.update(frame, f.context);
      expect([f.lantern(), f.anchorLamp().sum], state).toEqual([0, 0]);
      f.model.truth = truth("current");
      f.sim.resumeHolding = false;
      f.system.update(frame, f.context);
    }
    f.riding.dispose();
  });
});
