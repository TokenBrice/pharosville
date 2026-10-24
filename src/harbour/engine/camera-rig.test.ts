import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CameraRig, craneLift, glidePose, glideSeconds, minJerk } from "./camera-rig";

const preset = (x: number, z: number, d: number) => ({ target: [x, 0, z] as [number, number, number], distance: d, fovDeg: 30, pitchDeg: 35, yawDeg: 45 });

describe("minimum-jerk glide", () => {
  it("eases from rest to rest", () => {
    expect(minJerk(0)).toBe(0);
    expect(minJerk(1)).toBe(1);
    expect(minJerk(0.5)).toBeCloseTo(0.5);
    // zero velocity at the ends: a tiny step barely moves
    expect(minJerk(0.01)).toBeLessThan(1e-4);
    expect(1 - minJerk(0.99)).toBeLessThan(1e-4);
    // monotone
    let prev = 0;
    for (let u = 0.01; u <= 1; u += 0.01) { const s = minJerk(u); expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
  });
  it("takes longer for longer hops, within 0.9–2.4 s", () => {
    expect(glideSeconds(0)).toBe(0.9);
    expect(glideSeconds(300)).toBeCloseTo(1.44);
    expect(glideSeconds(5000)).toBe(2.4);
  });
  it("lifts the crane only on long hops, at most 12 %", () => {
    expect(craneLift(200)).toBe(0);
    expect(craneLift(500)).toBeGreaterThan(0);
    expect(craneLift(2000)).toBeCloseTo(0.12);
  });
  it("starts and ends exactly on the poses, with the lift peaking mid-flight", () => {
    const a = { x: 0, y: 0, z: 0, d: 200 }, b = { x: 400, y: 0, z: -100, d: 400 };
    const o = { x: 0, y: 0, z: 0, d: 0 };
    glidePose(a, b, 0, 0.1, o);
    expect(o.x).toBe(0); expect(o.d).toBeCloseTo(200);
    glidePose(a, b, 1, 0.1, o);
    expect(o.x).toBeCloseTo(400); expect(o.z).toBeCloseTo(-100); expect(o.d).toBeCloseTo(400);
    glidePose(a, b, 0.5, 0.1, o);
    expect(o.d).toBeCloseTo(Math.sqrt(200 * 400) * 1.1);
  });
});

describe("CameraRig.glideTo", () => {
  const rig = () => { const r = new CameraRig(new THREE.PerspectiveCamera(30, 1.6, 1, 10000)); r.applyPreset(preset(0, 0, 300), true); return r; };
  it("arrives at the goal and reads isAt from the start", () => {
    const r = rig();
    r.glideTo(preset(200, 50, 250));
    expect(r.isAt(preset(200, 50, 250))).toBe(true);
    for (let i = 0; i < 300; i++) r.update(1 / 60);
    expect(r.gliding).toBe(false);
    expect(r.target.x).toBeCloseTo(200); expect(r.distance).toBeCloseTo(250);
  });
  it("is cancelled by a pan, where it stands", () => {
    const r = rig();
    r.glideTo(preset(400, 0, 300));
    for (let i = 0; i < 30; i++) r.update(1 / 60);
    const x = r.target.x;
    const epoch = r.inputEpoch;
    r.pan(0, 0);
    expect(r.gliding).toBe(false);
    expect(r.inputEpoch).toBe(epoch + 1);
    for (let i = 0; i < 300; i++) r.update(1 / 60);
    expect(r.target.x).toBeCloseTo(x, 0);
  });
  it("a negative lift on the spot is a push-in and return", () => {
    const r = rig();
    r.glideTo(preset(0, 0, 300), { ms: 1600, lift: -0.04 });
    let min = 300;
    for (let i = 0; i < 120; i++) { r.update(1 / 60); min = Math.min(min, r.distance); }
    expect(min).toBeCloseTo(288, 0);
    expect(r.distance).toBeCloseTo(300);
  });
});
