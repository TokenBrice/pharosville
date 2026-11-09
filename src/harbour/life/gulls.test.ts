import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { HarbourMaterials } from "../world/materials";
import { CRANES, DOVES, Gulls, STARLINGS, type GullSites } from "./gulls";

const mats = { kit: () => new THREE.MeshStandardMaterial(), track: () => undefined } as unknown as HarbourMaterials;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function sites(score = true): GullSites {
  return {
    circles: [V(0, 20, 0)], perches: [V(5, 3, 5), V(-5, 3, -5)], squares: [V(10, 2, 10)],
    roost: score ? V(-60, 26.5, -201.5) : null,
    skies: score ? { cranes: V(3, 70, 14), murmur: V(-195, 40, 100), murmurFrom: V(-365, 148, -160), murmurTo: V(-195, 2, 100) } : null,
  };
}
const fly = (g: Gulls, seconds: number, moving = true) => { for (let k = 0; k < seconds * 60; k++) g.update(1 / 60, moving, 1); };

describe("the score's birds in the gull draw", () => {
  it("adds no instance to draw while nothing flies (and none at all with the score off)", () => {
    const on = new Gulls(sites(), mats, 14), off = new Gulls(sites(false), mats, 14);
    fly(on, 1); fly(off, 1);
    expect(on.mesh.count).toBe(off.mesh.count);
    expect(off.mesh.instanceMatrix.count).toBe(off.mesh.count);
    expect(on.mesh.instanceMatrix.count).toBe(off.mesh.count + DOVES + CRANES + STARLINGS);
    on.liftDoves(); on.fly(-Math.PI / 4); on.murmur(); off.liftDoves(); off.fly(0); off.murmur();
    fly(off, 1);
    expect(off.dovesOut || off.skyOut).toBe(false);
    expect(off.mesh.count).toBe(on.mesh.count);
  });

  it("the doves fly about half a minute from the tower and come home", () => {
    const g = new Gulls(sites(), mats, 14), base = g.mesh.count;
    g.liftDoves(); fly(g, 10);
    expect(g.dovesOut).toBe(true);
    expect(g.mesh.count).toBe(base + DOVES);
    // circling the tower within ~30 m, above it
    const e = g.mesh.instanceMatrix.array as Float32Array;
    for (let k = 0; k < DOVES; k++) {
      const o = (base + k) * 16;
      expect(Math.hypot(e[o + 12] + 60, e[o + 14] + 201.5)).toBeLessThan(30);
      expect(e[o + 13]).toBeGreaterThan(26.5);
    }
    fly(g, 25);
    expect(g.dovesOut).toBe(false);
    expect(g.mesh.count).toBe(base);
  });

  it("nothing flies under reduced motion / Still world: the doves are home and the skies clear at once", () => {
    const g = new Gulls(sites(), mats, 14), base = g.mesh.count;
    g.liftDoves(); g.fly(-Math.PI / 4); g.murmur(); fly(g, 5);
    expect(g.mesh.count).toBe(base + DOVES + CRANES + STARLINGS);
    fly(g, 0.1, false);
    expect(g.dovesOut || g.skyOut).toBe(false);
    expect(g.mesh.count).toBe(base);
  });

  it("the crane V and the murmuration each run their course and end", () => {
    const g = new Gulls(sites(), mats, 14), base = g.mesh.count;
    g.fly(-Math.PI / 4); fly(g, 30);
    expect(g.skyOut).toBe(true);
    expect(g.mesh.count).toBe(base + DOVES + CRANES);      // the resting doves below are collapsed
    const e = g.mesh.instanceMatrix.array as Float32Array;
    for (let k = 0; k < DOVES * 16; k++) expect(e[base * 16 + k]).toBe(0);
    fly(g, 70);
    expect(g.skyOut).toBe(false);
    g.murmur(); fly(g, 101);
    expect(g.skyOut).toBe(false);
    expect(g.mesh.count).toBe(base);
  });
});
