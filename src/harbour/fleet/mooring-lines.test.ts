import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LINE_FADE, MooringLines } from "./mooring-lines";

describe("CPU mooring curves", () => {
  it("uploads eight indexed ribbon segments and only the active range", () => {
    const lines = new MooringLines({ value: new THREE.Vector2(1600, 1000) }, 3);
    lines.begin();
    lines.add(0, 1, 2, 8, 3, 4, 0.5);
    lines.throwLine(8, 3, 4, 0, 1, 2, 1);
    lines.end(new THREE.Color(1, 1, 1));
    const g = lines.object.geometry;
    expect(g.drawRange).toEqual({ start: 0, count: 2 * 8 * 6 });
    expect(g.index!.count).toBe(3 * 8 * 6);
    expect(g.getAttribute("position").count).toBe(3 * 8 * 4);
    for (const name of ["aA", "aB"]) {
      const attribute = g.getAttribute(name) as THREE.BufferAttribute;
      expect(attribute.updateRanges).toEqual([{ start: 0, count: 2 * 8 * 12 }]);
    }
    const q = g.getAttribute("aQ");
    expect(Array.from(q.array.slice(0, 8))).toEqual([-1, 0, 1, 0, -1, 1, 1, 1]);
    lines.begin(); lines.end(new THREE.Color(1, 1, 1));
    expect(g.drawRange.count).toBe(0);
    lines.dispose();
  });

  it("rounds the original JS parabola only after evaluating each segment endpoint", () => {
    const lines = new MooringLines({ value: new THREE.Vector2(1600, 1000) });
    // Non-Float32 endpoints catch the old GPU path's premature endpoint/coefficient rounding.
    const ax = 8.123456789, ay = 3.987654321, az = 4.246813579;
    const bx = -0.135792468, by = 1.864209753, bz = 2.123456789;
    const len = Math.hypot(ax - bx, ay - by, az - bz), sag = 0.05 * len + 0.12;
    for (const k of [0.03123456789, 0.5123456789, 1]) for (const thrown of [false, true]) {
      lines.begin();
      if (thrown) lines.throwLine(ax, ay, az, bx, by, bz, k);
      else lines.add(ax, ay, az, bx, by, bz, k);
      const a = lines.object.geometry.getAttribute("aA"), b = lines.object.geometry.getAttribute("aB");
      let previous = [ax, ay, az];
      for (let segment = 1; segment <= 8; segment++) {
        const u = segment / 8, t = u * k;
        const lift = (0.35 + 0.18 * len) * 4 * k * (1 - k);
        const y = thrown
          ? ay + (by - ay) * t + lift * u * (1.6 - 0.6 * u) * 0.75 - sag * 4 * t * (1 - t) * k * k
          : ay + (by - ay) * t - sag * 4 * t * (1 - t) * (1 + (1 - k) * 0.8);
        const point = [ax + (bx - ax) * t, y, az + (bz - az) * t];
        for (let vertex = 0; vertex < 4; vertex++) {
          const offset = ((segment - 1) * 4 + vertex) * 3;
          expect(Array.from(a.array.slice(offset, offset + 3))).toEqual(previous.map(Math.fround));
          expect(Array.from(b.array.slice(offset, offset + 3))).toEqual(point.map(Math.fround));
        }
        previous = point;
      }
    }
    lines.dispose();
  });

  it("keeps the existing paid-out cutoff and capacity semantics", () => {
    const lines = new MooringLines({ value: new THREE.Vector2(1600, 1000) }, 1);
    lines.add(0, 0, 0, 1, 1, 1, 0.01);
    lines.throwLine(0, 0, 0, 1, 1, 1, 0.01);
    expect(lines.lines).toBe(0);
    lines.add(0, 0, 0, 1, 1, 1, 1);
    lines.throwLine(0, 0, 0, 1, 1, 1, 1);
    expect(lines.lines).toBe(1);
    lines.dispose();
  });
});

// E27 calm ropes (O7-I9): edge coverage and a range fade, so lines neither stair-step nor pop at the line range
describe("calm mooring ropes", () => {
  it("draws the ribbon half a pixel wider each side and fades its edge by coverage, the frame's alpha untouched", () => {
    const lines = new MooringLines({ value: new THREE.Vector2(1600, 1000) });
    const m = lines.object.material as THREE.ShaderMaterial;
    expect(m.vertexShader).toContain("c.xy += n * aQ.x * (hw + 0.5) * 2.0 / uResolution * c.w;");
    expect(m.vertexShader).toContain("vSide = aQ.x * (hw + 0.5);");
    expect(m.fragmentShader).toContain("clamp(vHalf + 0.5 - abs(vSide), 0.0, 1.0) * vFade");
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect([m.blendSrcAlpha, m.blendDstAlpha]).toEqual([THREE.ZeroFactor, THREE.OneFactor]);
    // coverage across the ribbon integrates to its width: core 1 inside hw - 0.5, a linear 1 px fall-off at the edges
    const cover = (side: number, hw: number) => Math.min(1, Math.max(0, hw + 0.5 - Math.abs(side)));
    for (const hw of [0.7, 1.5, 3]) {
      let sum = 0;
      for (let s = -(hw + 0.5); s <= hw + 0.5; s += 0.001) sum += cover(s, hw) * 0.001;
      expect(sum).toBeCloseTo(2 * hw, 2);
    }
    lines.dispose();
  });

  it("fades the ropes out over the last 15 % of the line range, which the fleet passes each frame", () => {
    const lines = new MooringLines({ value: new THREE.Vector2(1600, 1000) });
    const m = lines.object.material as THREE.ShaderMaterial;
    expect(LINE_FADE).toBe(0.15);
    expect(m.vertexShader).toContain("vFade = 1.0 - smoothstep(0.85 * uRange, uRange, distance(cameraPosition, aQ.y < 0.5 ? aA : aB));");
    expect(m.uniforms.uRange.value).toBe(650);
    lines.begin(); lines.end(new THREE.Color(1, 1, 1), 460);
    expect(m.uniforms.uRange.value).toBe(460);
    lines.end(new THREE.Color(1, 1, 1));
    expect(m.uniforms.uRange.value).toBe(460);
    lines.dispose();
  });
});
