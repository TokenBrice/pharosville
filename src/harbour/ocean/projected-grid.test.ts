import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { FFT_PATCH_SIZES } from "./fft/spectrum";
import {
  computeProjectedGrid,
  evalProjectedGridXZ,
  PROJECTED_GRID_DIMS,
  PROJECTED_GRID_GLSL,
  PROJECTED_GRID_SNAP,
  ProjectedGrid,
} from "./projected-grid";

function makeHarbourCamera(
  target: THREE.Vector3,
  dist: number,
  pitchDeg: number,
  yawDeg: number,
  fov = 38,
  aspect = 16 / 9,
): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 1, 10000);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const horiz = dist * Math.cos(pitch);
  cam.position.set(
    target.x + horiz * Math.sin(yaw),
    target.y + dist * Math.sin(pitch),
    target.z + horiz * Math.cos(yaw),
  );
  cam.lookAt(target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

describe("ProjectedGrid (Phase 2 Workstream A, §5.3)", () => {
  it("builds 320×300 (Uint32) on High, 216×200 (Uint16) on Medium, and 0 geometries on Low", () => {
    const grid = new ProjectedGrid();
    expect(PROJECTED_GRID_DIMS.high).toEqual([320, 300]);
    expect(PROJECTED_GRID_DIMS.medium).toEqual([216, 200]);
    expect(PROJECTED_GRID_SNAP).toBeCloseTo(FFT_PATCH_SIZES[0] / 256, 10);
    expect(grid.uniforms.uProjGridOn.value).toBe(0);
    expect(grid.geometryFor("low")).toBeNull();

    grid.setTier("high");
    expect(grid.uniforms.uProjGridOn.value).toBe(1);
    const highGeo = grid.geometryFor("high")!;
    const highPos = highGeo.getAttribute("position") as THREE.BufferAttribute;
    const highIdx = highGeo.getIndex()!;
    expect(highPos.count).toBe(321 * 301);
    expect(highPos.count).toBeGreaterThan(65535);
    expect(highIdx.array).toBeInstanceOf(Uint32Array);
    expect(highIdx.count).toBe(320 * 300 * 6);
    expect([highPos.getX(0), highPos.getY(0), highPos.getZ(0)]).toEqual([0, 0, 0]);
    expect([highPos.getX(highPos.count - 1), highPos.getY(highPos.count - 1), highPos.getZ(highPos.count - 1)]).toEqual([
      1, 1, 0,
    ]);

    // Downgrading High → Medium disposes High geometry and allocates 216×200 Uint16 geometry
    const onHighDispose = vi.fn();
    highGeo.addEventListener("dispose", onHighDispose);
    grid.setTier("medium");
    expect(onHighDispose).toHaveBeenCalledOnce();
    const medGeo = grid.geometryFor("medium")!;
    const medPos = medGeo.getAttribute("position") as THREE.BufferAttribute;
    const medIdx = medGeo.getIndex()!;
    expect(medPos.count).toBe(217 * 201);
    expect(medPos.count).toBeLessThan(65535);
    expect(medIdx.array).toBeInstanceOf(Uint16Array);
    expect(medIdx.count).toBe(216 * 200 * 6);

    // Downgrading to Low disposes Medium geometry and disables uProjGridOn
    const onMedDispose = vi.fn();
    medGeo.addEventListener("dispose", onMedDispose);
    grid.setTier("low");
    expect(onMedDispose).toHaveBeenCalledOnce();
    expect(grid.uniforms.uProjGridOn.value).toBe(0);
    expect(grid.geometryFor("low")).toBeNull();

    grid.dispose();
  });

  it("projects cleanly without horizon singularities across heart, overview, grazing, and steep pitches", () => {
    const target = new THREE.Vector3(35, 0, -40);
    const horizonDist = 2500;
    const maxAllowedFwd = horizonDist * 1.05 + PROJECTED_GRID_SNAP * 2;
    const maxAllowedR = horizonDist * 1.05 * 1.6 + PROJECTED_GRID_SNAP * 2;
    const corners: THREE.Vector4[] = [];

    // Heart (26°), overview (30°), shallow grazing (6° — top rays aim ABOVE horizon!), steep (80°)
    for (const [dist, pitch, yaw] of [
      [650, 26, 45],
      [1300, 30, 45],
      [500, 6, 45],
      [450, 80, 125],
      [700, 18, 225],
    ]) {
      const cam = makeHarbourCamera(target, dist, pitch, yaw);
      const ok = computeProjectedGrid(cam, target, horizonDist, corners);
      expect(ok, `pitch=${pitch} yaw=${yaw}`).toBe(true);
      expect(corners).toHaveLength(4);

      for (const c of corners) {
        expect(Number.isFinite(c.x)).toBe(true);
        expect(Number.isFinite(c.z)).toBe(true);
        expect(Number.isFinite(c.w)).toBe(true);
        expect(c.y).toBe(0);
        expect(c.w).toBeGreaterThanOrEqual(5.0);
        expect(c.w).toBeLessThanOrEqual(maxAllowedFwd);
        const r = Math.hypot(c.x - cam.position.x, c.z - cam.position.z);
        expect(r).toBeLessThanOrEqual(maxAllowedR);
      }

      // Check upward (+Y) triangle winding: (BR - BL) × (TL - BL) has positive Y component (z1*x2 - x1*z2 > 0)
      const [bl, br, tl] = corners;
      const e1x = br.x - bl.x;
      const e1z = br.z - bl.z;
      const e2x = tl.x - bl.x;
      const e2z = tl.z - bl.z;
      const normalY = e1z * e2x - e1x * e2z;
      expect(normalY, `upward winding at pitch=${pitch} yaw=${yaw}`).toBeGreaterThan(0);
    }
  });

  it("handles upward-looking cameras gracefully without NaN or Infinity", () => {
    const cam = new THREE.PerspectiveCamera(45, 16 / 9, 1, 10000);
    cam.position.set(0, 50, 0);
    cam.lookAt(0, 500, -100); // all 4 frustum rays point well above horizon
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();

    const corners: THREE.Vector4[] = [];
    const ok = computeProjectedGrid(cam, new THREE.Vector3(0, 0, 0), 2500, corners);
    expect(ok).toBe(false);
    for (const c of corners) {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.z)).toBe(true);
      expect(Number.isFinite(c.w)).toBe(true);
    }
  });

  it("produces perspective-uniform screen-space density (harmonic 1/depth weighting) and covers the visible viewport", () => {
    const grid = new ProjectedGrid();
    grid.setTier("high");
    const target = new THREE.Vector3(0, 0, 0);
    const cam = makeHarbourCamera(target, 650, 26, 45);
    const ok = grid.update(cam, target, 2500);
    expect(ok).toBe(true);

    const { x: wNear, y: wFar, z: maxHoriz } = grid.uniforms.uGridWeights.value;
    expect(wNear).toBeGreaterThanOrEqual(5.0);
    expect(wFar).toBeGreaterThan(wNear);
    expect(maxHoriz).toBeCloseTo(2500 * 1.05, 5);

    // Project center-column samples v = 0, 0.25, 0.5, 0.75, 1.0 into NDC and verify monotonic, near-uniform spacing
    const ndcYs: number[] = [];
    const pt = new THREE.Vector3();
    const xz: [number, number] = [0, 0];
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      evalProjectedGridXZ(0.5, v, grid.uniforms, xz);
      pt.set(xz[0], 0, xz[1]).project(cam);
      ndcYs.push(pt.y);
    }
    // Expanded frustum covers entire [-1, 1] vertical viewport
    expect(ndcYs[0]).toBeLessThan(-1.0);
    expect(ndcYs[4]).toBeGreaterThan(1.0);

    // Steps in NDC Y are strictly uniform (exact clip-space w harmonic weighting: zero foreground/horizon bunching)
    const steps = [ndcYs[1] - ndcYs[0], ndcYs[2] - ndcYs[1], ndcYs[3] - ndcYs[2], ndcYs[4] - ndcYs[3]];
    const minStep = Math.min(...steps);
    const maxStep = Math.max(...steps);
    expect(minStep).toBeGreaterThan(0.45);
    expect(maxStep / minStep).toBeLessThan(1.01);

    // Check GLSL snippet exports the matching helper function
    expect(PROJECTED_GRID_GLSL).toContain("vec2 hbProjectedGridXZ(");
    grid.dispose();
  });

  it("snaps the near-edge anchor along the camera basis to L0/256 multiples to prevent vertex swimming", () => {
    const target = new THREE.Vector3(10, 0, -20);
    const camA = makeHarbourCamera(target, 650, 26, 45);
    const cornersA: THREE.Vector4[] = [];
    expect(computeProjectedGrid(camA, target, 2500, cornersA, PROJECTED_GRID_SNAP)).toBe(true);

    // Compute camera horizontal basis
    const fwd = new THREE.Vector3();
    camA.getWorldDirection(fwd);
    const fLen = Math.hypot(fwd.x, fwd.z);
    const fx = fwd.x / fLen;
    const fz = fwd.z / fLen;
    const rx = -fz;
    const rz = fx;

    const midAX = 0.5 * (cornersA[0].x + cornersA[1].x);
    const midAZ = 0.5 * (cornersA[0].z + cornersA[1].z);
    const projR = midAX * rx + midAZ * rz;
    const projF = midAX * fx + midAZ * fz;

    // Anchor projections land on exact multiples of PROJECTED_GRID_SNAP
    expect(Math.abs(projR / PROJECTED_GRID_SNAP - Math.round(projR / PROJECTED_GRID_SNAP))).toBeLessThan(1e-5);
    expect(Math.abs(projF / PROJECTED_GRID_SNAP - Math.round(projF / PROJECTED_GRID_SNAP))).toBeLessThan(1e-5);

    // Tiny sub-texel horizontal pan (< snap / 4) keeps snapped near anchor stationary
    const shift = PROJECTED_GRID_SNAP * 0.2;
    const targetB = target.clone().add(new THREE.Vector3(rx * shift, 0, rz * shift));
    const camB = makeHarbourCamera(targetB, 650, 26, 45);
    const cornersB: THREE.Vector4[] = [];
    expect(computeProjectedGrid(camB, targetB, 2500, cornersB, PROJECTED_GRID_SNAP)).toBe(true);
    const midBX = 0.5 * (cornersB[0].x + cornersB[1].x);
    const midBZ = 0.5 * (cornersB[0].z + cornersB[1].z);
    expect(Math.hypot(midBX - midAX, midBZ - midAZ)).toBeLessThan(1e-4);
  });
});
