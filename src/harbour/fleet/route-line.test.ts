import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { RouteLine, resample, ROUTE_STEP_M, type Itinerary } from "./route-line";

describe("route line resampling", () => {
  it("steps evenly along a bent path and keeps both ends", () => {
    const pts = Float32Array.of(0, 0, 10, 0, 10, 10);
    const out = resample(pts, 4);
    expect(out.slice(0, 2)).toEqual([0, 0]);
    expect(out.slice(-2)).toEqual([10, 10]);
    for (let i = 2; i < out.length - 2; i += 2) {
      const d = Math.hypot(out[i] - out[i - 2], out[i + 1] - out[i - 1]);
      expect(d).toBeLessThanOrEqual(4.0001);
      expect(d).toBeGreaterThan(2.5); // a corner cuts a step short, never to nothing
    }
  });
  it("keeps a 1.5 km leg within budget", () => {
    const pts = new Float32Array(3000);
    for (let i = 0; i < 1500; i++) { pts[i * 2] = i; pts[i * 2 + 1] = 0; }
    expect(resample(pts, ROUTE_STEP_M).length / 2).toBeLessThan(400);
  });
});

it("reuses unchanged itinerary geometry and rebuilds when an interior path changes", async () => {
  const scene = new THREE.Scene();
  const line = new RouteLine({ scene } as never, () => null);
  const internal = line as unknown as { rebuild(it: unknown): void; mesh: THREE.Mesh };
  const a = { legs: [{ pts: Float32Array.of(0, 0, 10, 0, 20, 0), current: true }], ports: [[20, 0]] };
  internal.rebuild(a); const first = internal.mesh.geometry;
  internal.rebuild(a); expect(internal.mesh.geometry).toBe(first);
  const b = { ...a, legs: [{ ...a.legs[0], pts: Float32Array.of(0, 0, 10, 10, 20, 0) }] };
  internal.rebuild(b); expect(internal.mesh.geometry).not.toBe(first);
  line.dispose();
});

describe("backing-line mode (selected tokenized fund -> backed core stablecoins)", () => {
  function mockCtx(night = 0) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1.6, 1, 5000);
    camera.position.set(0, 100, 100);
    return {
      scene,
      camera,
      rig: { target: new THREE.Vector3(0, 0, 0) },
      renderer: { domElement: { clientHeight: 800 } },
      uniforms: { uNight: { value: night } },
    };
  }

  it("radiates multiple disconnected arcs from s = 0 without cross-leg index bridges", () => {
    const ctx = mockCtx(0);
    const backingIt: Itinerary = {
      backing: true,
      legs: [
        { pts: Float32Array.of(0, 0, 60, 0), current: true },
        { pts: Float32Array.of(0, 0, 0, 100), current: true },
        { pts: Float32Array.of(0, 0, -40, 30), current: true },
      ],
      ports: [[60, 0], [0, 100], [-40, 30]],
    };
    const read = vi.fn(() => backingIt);
    const line = new RouteLine(ctx as never, read);
    line.show("buidl-blackrock");
    line.update(0.1, true, false, [0, 0]);

    const internal = line as unknown as {
      mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
      total: number;
      mat: THREE.ShaderMaterial;
    };
    const geo = internal.mesh.geometry;
    const aS = geo.getAttribute("aS") as THREE.BufferAttribute;
    const aSide = geo.getAttribute("aSide") as THREE.BufferAttribute;
    const idx = geo.getIndex()!;

    // Compute each leg's vertex index span: [start, end)
    const legSpans: Array<[number, number]> = [];
    let cursor = 0;
    for (const leg of backingIt.legs) {
      const n = resample(leg.pts, ROUTE_STEP_M).length >> 1;
      legSpans.push([cursor, cursor + n * 2]);
      // Every backing leg starts at s = 0 at the fund origin so all arcs radiate simultaneously
      expect(aS.getX(cursor)).toBe(0);
      expect(aS.getX(cursor + 1)).toBe(0);
      cursor += n * 2;
    }
    // total is max leg length (100 m), not the sum (210 m)
    expect(internal.total).toBeCloseTo(100, 3);

    // Every triangle's 3 vertices must stay strictly within one leg or one port tick (never bridge legs)
    for (let t = 0; t < idx.count; t += 3) {
      const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
      const isPort = aSide.getY(i0) > 1.5;
      if (isPort) {
        expect(aSide.getY(i1)).toBe(2);
        expect(aSide.getY(i2)).toBe(2);
      } else {
        const span = legSpans.find(([lo, hi]) => i0 >= lo && i0 < hi);
        expect(span).toBeDefined();
        expect(i1).toBeGreaterThanOrEqual(span![0]);
        expect(i1).toBeLessThan(span![1]);
        expect(i2).toBeGreaterThanOrEqual(span![0]);
        expect(i2).toBeLessThan(span![1]);
      }
    }

    // No behind-boat fade: uBoatS is pinned to -1e6
    expect(internal.mat.uniforms.uBoatS.value).toBe(-1e6);
    // Warm parchment-brass tint by day, scaled cleanly at night
    const col = internal.mat.uniforms.uColor.value as THREE.Color;
    expect([col.r, col.g, col.b]).toEqual([0.8, 0.64, 0.34]);
    ctx.uniforms.uNight.value = 1;
    line.update(0.1, true, false, [0, 0]);
    expect(col.r).toBeCloseTo(0.4, 5);
    expect(col.g).toBeCloseTo(0.32, 5);
    expect(col.b).toBeCloseTo(0.17, 5);

    // Faster 0.5s refresh cadence in backing mode (re-reads after 0.5s, whereas circuits wait 2s)
    expect(read).toHaveBeenCalledTimes(1);
    line.update(0.45, true, false, [0, 0]);
    expect(read).toHaveBeenCalledTimes(2);

    // Deselecting (show(null)) fades out smoothly without snapping uDraw to 0 or reverting backing color
    ctx.uniforms.uNight.value = 0;
    line.update(1.2, true, false, [0, 0]);
    expect(internal.mat.uniforms.uDraw.value).toBeGreaterThanOrEqual(100);
    line.show(null);
    line.update(0.05, true, false, [0, 0]);
    expect(internal.mat.uniforms.uDraw.value).toBeGreaterThanOrEqual(100);
    expect(internal.mat.uniforms.uBoatS.value).toBe(-1e6);
    expect([col.r, col.g, col.b]).toEqual([0.8, 0.64, 0.34]);
    expect(internal.mat.uniforms.uK.value).toBeGreaterThan(0.01);
    // Once faded out, geometry is disposed and backing flag resets cleanly
    line.update(2.0, true, false, null);
    expect(internal.mesh).toBeNull();
    line.dispose();
  });
});
