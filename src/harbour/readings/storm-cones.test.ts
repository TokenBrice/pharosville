import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { KINDS, type LightsService } from "../lights/lights-service";
import { StormCones } from "./storm-cones";

describe("D11 the storm signal's lanterns", () => {
  it("glow as analytical lights: their state shows at once, never held back by the lamp round or the arrival beat", () => {
    const kinds: string[] = [];
    const lights: LightsService = { add: (kind) => kinds.push(kind) - 1, setOn: () => undefined, remove: () => undefined, setPosition: () => undefined };
    const rig = { slots: [[0, 12, 0], [0, 9, 0], [0, 6, 0], [0, 3, 0]] as const, foot: [0, 1, 0] as const, masthead: [0, 14, 0] as const };
    const kit = new THREE.MeshStandardMaterial(), lantern = new THREE.MeshStandardMaterial();
    const cones = new StormCones(new THREE.Group(), rig, kit, lantern, lights);
    expect(kinds).toEqual(["signal", "signal", "signal", "signal"]);
    expect(KINDS.signal.analytic).toBe(true);
    cones.dispose(); kit.dispose(); lantern.dispose();
  });

  it("go out at once when the stress evidence lapses, while the canvas still comes down, and re-light only with current evidence", () => {
    const on = new Map<number, boolean>();
    let ids = 0;
    const lights: LightsService = { add: () => ids++, setOn: (id, lit) => { on.set(id, lit); }, remove: () => undefined, setPosition: () => undefined };
    const rig = { slots: [[0, 12, 0], [0, 9, 0], [0, 6, 0], [0, 3, 0]] as const, foot: [0, 1, 0] as const, masthead: [0, 14, 0] as const };
    const kit = new THREE.MeshStandardMaterial(), lantern = new THREE.MeshStandardMaterial(), parent = new THREE.Group();
    const cones = new StormCones(parent, rig, kit, lantern, lights);
    const lanterns = parent.getObjectByName("storm_signal_lanterns") as THREE.InstancedMesh;
    const canvas = parent.getObjectByName("storm_signal") as THREE.Mesh;
    const camera = new THREE.Vector3(60, 20, 60);
    let time = 0;
    const frames = (count: number, reduced = false) => { for (let k = 0; k < count; k++) cones.update(1 / 60, time += 1 / 60, 0.5, reduced, camera); };
    const lit = () => [0, 1, 2, 3].map((id) => on.get(id) ?? false);
    // Warning on current evidence: three shapes up, three lanterns lit
    cones.setCount(3);
    frames(1, true);
    expect([lanterns.count, lanterns.visible]).toEqual([3, true]);
    expect(lit()).toEqual([true, true, true, false]);
    // the evidence lapses (stale or unavailable stress: readings → cones null): the canvas starts down, the lanterns are out
    cones.setCount(null);
    frames(1);
    expect(canvas.visible).toBe(true);
    expect([lanterns.count, lanterns.visible]).toEqual([0, false]);
    expect(lit()).toEqual([false, false, false, false]);
    frames(30); // half a second into the haul: shapes still aloft, still dark
    expect(canvas.visible).toBe(true);
    expect([lanterns.count, lit().some(Boolean)]).toEqual([0, false]);
    // current evidence returns: every shape of the signal that is aloft carries its lantern again at once
    cones.setCount(3);
    frames(1);
    expect([lanterns.count, lanterns.visible]).toEqual([3, true]);
    expect(lit()).toEqual([true, true, true, false]);
    // a lower band on current evidence: the struck shape comes down dark too
    cones.setCount(2);
    frames(1);
    expect(lanterns.count).toBe(2);
    expect(lit()).toEqual([true, true, false, false]);
    cones.dispose(); kit.dispose(); lantern.dispose();
  });

  it("place a first installed reading at once (every shape, lantern and the pennant on the first frame) and haul live changes", () => {
    const rig = { slots: [[0, 12, 0], [0, 9, 0], [0, 6, 0], [0, 3, 0]] as const, foot: [0, 1, 0] as const, masthead: [0, 14, 0] as const };
    const kit = new THREE.MeshStandardMaterial(), lantern = new THREE.MeshStandardMaterial(), parent = new THREE.Group();
    const cones = new StormCones(parent, rig, kit, lantern);
    const lanterns = parent.getObjectByName("storm_signal_lanterns") as THREE.InstancedMesh;
    const canvas = parent.getObjectByName("storm_signal") as THREE.Mesh;
    const camera = new THREE.Vector3(60, 20, 60);
    const top = () => { canvas.geometry.computeBoundingBox(); return canvas.geometry.boundingBox!.max.y; };
    const pennantOut = () => { const p = canvas.geometry.attributes.position.array as Float32Array; return p.slice(p.length - 6).some((v) => v !== 0); };
    // Danger on the first installed reading: on the very first (not reduced) frame, four shapes, four lanterns, the pennant
    cones.setCount(4, true, true);
    cones.update(1 / 60, 0, 0.5, false, camera);
    expect(lanterns.count).toBe(4);
    expect(top()).toBeGreaterThan(12); // the top cone at its slot, not climbing from the foot
    expect(pennantOut()).toBe(true);
    // a live change in view hauls: down to Alert (the struck drums still coming down, dark), then back up a shape at a time
    const p = (cones as unknown as { p: Float32Array }).p;
    cones.setCount(2, false);
    cones.update(1 / 60, 1 / 60, 0.5, false, camera);
    expect(lanterns.count).toBe(2);
    expect(p[3]).toBeGreaterThan(0.9);
    for (let k = 0; k < 900; k++) cones.update(1 / 60, k / 60, 0.5, false, camera);
    expect([p[2], p[3]]).toEqual([0, 0]);
    cones.setCount(4, true);
    cones.update(1 / 60, 15, 0.5, false, camera);
    expect(p[2]).toBeLessThan(0.1);
    expect(p[3]).toBe(0);
    cones.dispose(); kit.dispose(); lantern.dispose();
  });
});
