import { describe, expect, it } from "vitest";
import { FOLLOW_OMEGA, springStep } from "./store";

describe("follow spring", () => {
  it("trails a steadily sailing boat by about 1.2 s, without overshoot on arrival", () => {
    const p = { x: 0, z: 0, vx: 0, vz: 0 };
    const v = 4, dt = 1 / 60;
    for (let t = 0; t < 20; t += dt) springStep(p, v * t, 0, FOLLOW_OMEGA, dt);
    const lagS = (v * 20 - p.x) / v;
    expect(lagS).toBeGreaterThan(1.0);
    expect(lagS).toBeLessThan(1.4);
    // the boat stops: the view settles onto her without swinging past
    const goal = v * 20;
    let max = p.x;
    for (let t = 0; t < 10; t += dt) { springStep(p, goal, 0, FOLLOW_OMEGA, dt); max = Math.max(max, p.x); }
    expect(max).toBeLessThanOrEqual(goal + 0.05);
    expect(p.x).toBeCloseTo(goal, 1);
  });
});

it("integrates follow identically at 15/30/60/120/144Hz for fixed targets", () => {
  const ends = [15, 30, 60, 120, 144].map((hz) => {
    const p = { x: 0, z: 0, vx: 0, vz: 0 };
    for (let i = 0; i < hz * 3; i++) springStep(p, 20, -10, FOLLOW_OMEGA, 1 / hz);
    return p;
  });
  for (const p of ends) for (const key of ["x", "z", "vx", "vz"] as const) expect(p[key]).toBeCloseTo(ends[0][key], 10);
});

it("keeps a sailing follow endpoint within 1 CSS pixel across refresh rates", () => {
  const endpoints = [15, 30, 60, 120, 144].map((hz) => {
    const p = { x: 0, z: 0, vx: 0, vz: 0 };
    for (let i = 0; i < hz * 20; i++) springStep(p, 4 * (i + 1) / hz, 0, FOLLOW_OMEGA, 1 / hz);
    return p.x;
  });
  const metresPerPixel = 2 * 300 * Math.tan(30 * Math.PI / 360) / 1000;
  for (const x of endpoints) expect(Math.abs(x - endpoints[0]) / metresPerPixel).toBeLessThan(1);
});

import * as THREE from "three";
import { CameraRig } from "../engine/camera-rig";
import { footprintBounds, frameSubject, usableSpace } from "./camera-moves";

describe("measured selection framing", () => {
  it.each([[1600, 1000], [900, 720], [834, 1112], [1112, 834], [720, 600]])("fits the full Pharos with 24px padding at %s×%s", (width, height) => {
    const overlays = width < 900 ? [{ left: 0, right: width, top: height / 2, bottom: height }]
      : [{ left: width - 378, right: width - 14, top: 14, bottom: height - 14 }];
    const space = usableSpace(width, height, overlays);
    const subject = { center: [30, 45, -20] as [number, number, number], radius: 62 };
    const pose = frameSubject(subject, space, width, height, { target: [0, 0, 0], distance: 300, fovDeg: 25, pitchDeg: 26, yawDeg: 30 });
    const camera = new THREE.PerspectiveCamera(25, width / height), rig = new CameraRig(camera);
    rig.applyPreset(pose, true); camera.updateMatrixWorld();
    for (let i = 0; i <= 18; i++) for (let j = 0; j < 36; j++) {
      const theta = i * Math.PI / 18, phi = j * Math.PI / 18;
      const p = new THREE.Vector3(30 + 62 * Math.sin(theta) * Math.cos(phi), 45 + 62 * Math.cos(theta), -20 + 62 * Math.sin(theta) * Math.sin(phi)).project(camera);
      const x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2;
      expect(x).toBeGreaterThanOrEqual(space.left); expect(x).toBeLessThanOrEqual(space.right);
      expect(y).toBeGreaterThanOrEqual(space.top); expect(y).toBeLessThanOrEqual(space.bottom);
    }
  });
  it("keeps simultaneous panes outside the usable rectangle", () => {
    expect(usableSpace(1600, 1000, [{ left: 14, right: 714, top: 14, bottom: 986 }, { left: 1222, right: 1586, top: 14, bottom: 986 }])).toEqual({ left: 738, right: 1198, top: 24, bottom: 976 });
  });
});

it("fits the whole selected pier footprint and ignores an absent footprint", () => {
  expect(footprintBounds([], 16)).toBeNull();
  expect(footprintBounds([[-80, -20], [120, 60]], 16)).toEqual({ center: [20, 8, 20], radius: Math.hypot(100, 8, 40) });
});
