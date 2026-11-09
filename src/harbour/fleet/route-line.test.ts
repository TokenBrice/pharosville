import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { RouteLine, resample, ROUTE_STEP_M } from "./route-line";

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
