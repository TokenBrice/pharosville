// @vitest-environment jsdom
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { EngineContext, FrameState } from "../engine/types";
import { PH_DOCKED, PH_SAILING } from "../sim/sim";
import { FleetSystem, type FleetFrameState } from "./fleet-system";
import { fleetShadowFrustum, rigRadius } from "./visibility";

const frame: FrameState = { delta: 1 / 60, elapsed: 2, nowMs: 0 };

function fixture(shadows: boolean) {
  const system = new FleetSystem();
  const mesh = { castShadow: false, setVisibleAt: vi.fn(), setGeometryIdAt: vi.fn(), setMatrixAt: vi.fn<(inst: number, matrix: THREE.Matrix4) => void>() };
  const camera = new THREE.PerspectiveCamera(45, 1.5, 1, 2000000);
  camera.position.set(0, 50, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const sun = { key: new THREE.DirectionalLight() };
  sun.key.position.set(1000000, 100, 0); sun.key.target.position.set(1000000, 0, 0);
  Object.assign(sun.key.shadow.camera, { left: -30, right: 30, bottom: -30, top: 30, near: 1, far: 500 });
  sun.key.shadow.camera.updateProjectionMatrix();
  const boat = {
    id: "coin", inst: 0, variant: {}, scale: 1, loa: 10, beam: 2, geomFull: 0, geomLod: 0, geomWreck: 0, geomCur: 0,
    wrecked: false, swing: 0, heel: 0, hi: 0, px: 1000000, pz: 0, vx: 0, vz: 0, seen: true, phi: 0.5, slot: 0,
    brand: new THREE.Color("#5588AA"), visible: false, posed: true, visualRadius: 20, dist: 0, reading: true, lit: false,
    flag: 1, struck: false, mastK: 0, titan: false, cx: 0, cy: 0, cz: 0, r: 5, top: 10, swell: new Float64Array(30),
    // Living Harbour motion state (07-M2/M6/M8)
    dead: false, flog: 0, row: 0, brail: 0, dox: 0, doz: 0, gyaw: 0,
  };
  const model = { boats: [{ id: "coin" }] };
  const ocean = { hullHeights: vi.fn((_x: number, _z: number, _bx: number, _bz: number, _px: number, _pz: number, out: Float64Array) => { out.set([0.1, 0.2, 0.3, 0.4, 0.5]); }) };
  const wake = { stamp: vi.fn() };
  const sim = { pose: { count: 1, ids: ["coin"], position: [1000000, 0, 0], heading: [0], phase: [PH_DOCKED], sailState: [0], heel: [0.1], slot: [-1], lines: [0], event: [0], drift: [0, 0], pitch: [0], outing: [0] }, wind: { fromRad: -1, strength: 0.35 }, layout: { slots: [] } };
  const context = {
    camera, renderer: { domElement: { clientHeight: 600 } }, rig: { distance: shadows ? 100 : 1000 },
    services: new Map<string, unknown>([["model", model], ["sim", sim], ["ocean", ocean], ["wake", wake], ["sun", sun], ["readiness", { revision: 7, boats: 1, prepared: true }]]),
    uniforms: { uWindowGlow: { value: 0 }, uWindVec: { value: new THREE.Vector2() }, uHemiSky: { value: new THREE.Color(1, 1, 1) }, uSunColor: { value: new THREE.Color(1, 1, 1) }, uNight: { value: 0 } },
  } as unknown as EngineContext;
  Object.assign(system, { mesh, model, modelRevision: 7, boats: [boat], byId: new Map([[boat.id, boat]]), logosAsked: true, coveState: "done", lines: { begin() {}, end() {} }, riding: { begin() {}, end() {} } });
  // Test-only access to the private texture allocator; no renderer / kit setup is needed.
  const data = system as unknown as { ensureData(n: number): void };
  data.ensureData(1);
  return { system, mesh, camera, sun, sim, model, boat, ocean, wake, context };
}

describe("conservative fleet visual culling", () => {
  it("bounds furl, mirror and arbitrary pivot rotation without assuming a boom angle", () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([3, 4, 0], 3));
    g.setAttribute("aFurl", new THREE.Float32BufferAttribute([0, 0, 2], 3));
    g.setAttribute("aPivot", new THREE.Float32BufferAttribute([0, 3, 4], 3));
    expect(rigRadius(g)).toBe(17);
    g.dispose();
  });

  it("keeps offscreen shadow contributors fully posed", () => {
    const f = fixture(true);
    f.system.update(frame, f.context);
    expect(f.boat.visible).toBe(false);
    expect(f.boat.posed).toBe(true);
    expect(f.mesh.setMatrixAt).toHaveBeenCalledTimes(1);
    expect(f.wake.stamp).toHaveBeenCalledTimes(1);
  });

  it("skips hull matrices outside both frusta even while production shadows are enabled", () => {
    const f = fixture(true);
    f.sun.key.position.x = 0; f.sun.key.target.position.x = 0;
    f.system.update(frame, f.context);
    expect(f.mesh.castShadow).toBe(true);
    expect(f.boat.posed).toBe(false);
    expect(f.mesh.setVisibleAt).toHaveBeenCalledWith(0, false);
    expect(f.mesh.setMatrixAt).not.toHaveBeenCalled();
    expect(f.ocean.hullHeights).toHaveBeenCalledTimes(1);
    expect(f.wake.stamp).toHaveBeenCalledTimes(1);
  });

  it("uses this frame's light fit rather than the preceding rendered shadow frustum", () => {
    const f = fixture(true);
    const old = fleetShadowFrustum(f.sun.key).clone();
    const sphere = new THREE.Sphere(new THREE.Vector3(1000000, 4, 0), 25);
    expect(old.intersectsSphere(sphere)).toBe(true);
    f.sun.key.position.x = 0; f.sun.key.target.position.x = 0;
    f.system.update(frame, f.context);
    expect(f.boat.posed).toBe(false);
    // Shift back without updating any world/camera matrices: the current frame must catch the caster.
    f.sun.key.position.x = 1000000; f.sun.key.target.position.x = 1000000;
    f.system.update(frame, f.context);
    expect(f.boat.posed).toBe(true);
    expect(f.mesh.setMatrixAt).toHaveBeenCalledTimes(1);
  });

  it("keeps a rig sphere grazing the shadow box, not just centres inside it", () => {
    const f = fixture(true);
    f.sun.key.position.x += 50; f.sun.key.target.position.x += 50;
    f.system.update(frame, f.context);
    expect(f.boat.visible).toBe(false);
    expect(f.boat.posed).toBe(true);
  });

  it("does not pose a shadow-only boat beyond the existing shadow zoom distance", () => {
    const f = fixture(false);
    f.system.update(frame, f.context);
    expect(f.mesh.castShadow).toBe(false);
    expect(f.boat.posed).toBe(false);
  });

  it.each(["selected", "hover", "highlighted", "wrecked", "debug"])("keeps offscreen %s hulls exact", (reason) => {
    const f = fixture(false);
    if (reason === "highlighted") f.boat.hi = 0.5;
    else if (reason === "wrecked") { f.boat.wrecked = true; f.boat.dead = true; } // dead: the coin's state, wrecked: drawn this frame (07-M6)
    else if (reason === "debug") Object.assign(f.system, { debug: {}, updateDebug: vi.fn() });
    else Object.assign(f.system, { [reason]: f.boat.id });
    f.system.update(frame, f.context);
    expect(f.boat.posed).toBe(true);
    expect(f.mesh.setMatrixAt).toHaveBeenCalledTimes(1);
  });

  it("keeps exact picking/history/contact updates offscreen and fully recomputes on fast reentry", () => {
    const f = fixture(false), reference = fixture(false);
    reference.boat.visualRadius = 2000000; // always pose the reference without changing temporal state
    f.system.update(frame, f.context); reference.system.update(frame, reference.context);
    expect(f.boat.posed).toBe(false);
    expect(f.mesh.setVisibleAt).toHaveBeenCalledWith(0, false);
    expect(f.mesh.setMatrixAt).not.toHaveBeenCalled();
    expect(f.ocean.hullHeights).toHaveBeenCalledTimes(1);
    expect(f.wake.stamp.mock.calls).toEqual(reference.wake.stamp.mock.calls);
    expect([f.boat.cx, f.boat.cy, f.boat.cz, f.boat.swing, f.boat.heel]).toEqual([reference.boat.cx, reference.boat.cy, reference.boat.cz, reference.boat.swing, reference.boat.heel]);
    for (const world of [f, reference]) {
      world.sim.pose.position[0] += 1;
      world.sim.pose.phase[0] = PH_SAILING;
      world.system.update({ ...frame, elapsed: 2.5 }, world.context);
    }
    expect(f.boat.posed).toBe(false);
    expect(f.wake.stamp.mock.calls).toEqual(reference.wake.stamp.mock.calls);
    expect([f.boat.px, f.boat.pz, f.boat.vx, f.boat.vz, f.boat.swing, f.boat.heel]).toEqual([reference.boat.px, reference.boat.pz, reference.boat.vx, reference.boat.vz, reference.boat.swing, reference.boat.heel]);
    for (const world of [f, reference]) {
      world.camera.position.set(1000000, 50, 100); world.camera.lookAt(1000000, 0, 0); world.camera.updateMatrixWorld(true);
      world.system.update({ ...frame, elapsed: 3 }, world.context);
    }
    expect(f.boat.visible).toBe(true);
    expect(f.mesh.setVisibleAt).toHaveBeenLastCalledWith(0, true);
    const actual = f.mesh.setMatrixAt.mock.lastCall![1] as THREE.Matrix4;
    const expected = reference.mesh.setMatrixAt.mock.lastCall![1] as THREE.Matrix4;
    expect(actual.elements).toEqual(expected.elements);
  });
});

describe("fleet-frame submission evidence", () => {
  it("publishes an entire first revision pose, then the actual culled count in the same service", () => {
    const f = fixture(false);
    Object.assign(f.system, { needsFullPose: true });
    expect(f.context.services.has("fleet-frame")).toBe(false);
    f.system.update(frame, f.context);
    const submitted = f.context.services.get("fleet-frame") as FleetFrameState;
    expect(submitted).toEqual({ revision: 7, boats: 1 });
    expect(f.mesh.setMatrixAt).toHaveBeenCalledTimes(1);
    f.system.update(frame, f.context);
    expect(f.context.services.get("fleet-frame")).toBe(submitted);
    expect(submitted).toEqual({ revision: 7, boats: 0 });
    expect(f.mesh.setMatrixAt).toHaveBeenCalledTimes(1);
  });

  it("does not copy readiness counts/revisions when no matching sim pose was submitted", () => {
    const f = fixture(true);
    f.context.services.set("readiness", { revision: 8, boats: 123, prepared: true });
    f.sim.pose.ids[0] = "not-installed";
    f.system.update(frame, f.context);
    expect(f.context.services.get("fleet-frame")).toEqual({ revision: 7, boats: 0 });
    expect(f.mesh.setMatrixAt).not.toHaveBeenCalled();
  });

  it("reports no submitted boats for a pose-count mismatch or a missing kit hull", () => {
    for (const missing of ["pose", "kit"]) {
      const f = fixture(true);
      if (missing === "pose") f.sim.pose.count = 2;
      else Object.assign(f.system, { boats: [] });
      f.system.update(frame, f.context);
      expect(f.context.services.get("fleet-frame")).toEqual({ revision: 7, boats: 0 });
      expect(f.mesh.setMatrixAt).not.toHaveBeenCalled();
    }
  });

  it("does not publish a frame until its data upload finishes", () => {
    const f = fixture(true);
    Object.assign(f.system, { uploadData: () => { throw new Error("upload failed"); } });
    expect(() => f.system.update(frame, f.context)).toThrow("upload failed");
    expect(f.context.services.has("fleet-frame")).toBe(false);
  });
});
