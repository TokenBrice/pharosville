import { BufferAttribute, ShaderLib, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { fixtureStability, makeSourceStatuses } from "../__fixtures__/pharosville-world";
import { buildGardenMonthRecord } from "../systems/garden-month-record";
import { createGardenThreshold } from "./garden-threshold";
import { createGardenMonthTrace, GARDEN_MONTH_FURROW_WIDTH } from "./garden-month-record";

const NOW = Date.UTC(2026, 7, 13);
const DAY = 86_400_000;
function record(points: Array<{ ago: number; score: number; version?: string }>) {
  return buildGardenMonthRecord({ ...fixtureStability, history: points.map(({ ago, score, version = "v1" }) => ({
    date: NOW - ago * DAY, score, band: "STEADY", methodologyVersion: version,
  })) });
}

describe("dated gravel furrow", () => {
  it("draws at most 116 triangles in one non-emissive texture-free gravel mesh", () => {
    const threshold = createGardenThreshold();
    const trace = createGardenMonthTrace(threshold);
    trace.update(record(Array.from({ length: 30 }, (_, ago) => ({ ago, score: ago % 2 ? 0 : 100 }))));
    expect(trace.mesh.parent).toBe(threshold.root);
    expect(trace.mesh.geometry.drawRange.count / 3).toBe(116);
    expect(trace.mesh.material.userData.gardenSurface.role).toBe("gravel");
    expect(trace.mesh.material.userData.gardenSurfaceExemption).toBe("dataTrace");
    expect(trace.mesh.material.vertexColors).toBe(false);
    expect(trace.mesh.material.color.equals(threshold.gravelInset.pigment)).toBe(true);
    expect(trace.mesh.material.emissive.getHex()).toBe(0);
    expect(trace.mesh.material.emissiveIntensity).toBe(0);
    expect(trace.mesh.material.map).toBeNull();
    expect(trace.mesh.material.normalMap).toBeNull();
    expect(trace.mesh.material.roughness).toBe(0.97);
    expect(trace.mesh.castShadow).toBe(false);
    threshold.dispose();
  });

  it("places chronological centre samples on the root-local fixed 0–100 score axes without overshoot", () => {
    const threshold = createGardenThreshold();
    const trace = createGardenMonthTrace(threshold);
    trace.update(record([{ ago: 2, score: 0 }, { ago: 1, score: 100 }, { ago: 0, score: 25 }]));
    const { centre, right, forward, normal, width, depth } = threshold.gravelInset;
    const positions = trace.mesh.geometry.getAttribute("position");
    const delta = new Vector3();
    let priorX = -Infinity;
    for (let sample = 0; sample < 3; sample += 1) {
      const centreIndex = sample * 3 + 1;
      delta.fromBufferAttribute(positions, centreIndex).sub(centre);
      expect(delta.dot(right)).toBeGreaterThan(priorX);
      priorX = delta.dot(right);
      expect(delta.dot(forward)).toBeCloseTo(([0, 100, 25][sample]! / 100 - 0.5) * depth * 0.72, 5);
      expect(delta.dot(normal)).toBeCloseTo(0.002, 5);
      const left = new Vector3().fromBufferAttribute(positions, sample * 3);
      const rightEdge = new Vector3().fromBufferAttribute(positions, sample * 3 + 2);
      expect(left.distanceTo(rightEdge)).toBeCloseTo(GARDEN_MONTH_FURROW_WIDTH, 5);
    }
    for (let index = 0; index < 9; index += 1) {
      delta.fromBufferAttribute(positions, index).sub(centre);
      expect(Math.abs(delta.dot(right))).toBeLessThan(width / 2);
      expect(Math.abs(delta.dot(forward))).toBeLessThan(depth / 2);
    }
    const before = trace.mesh.getWorldPosition(new Vector3());
    threshold.root.position.add(new Vector3(0.1, 0.2, 0.3));
    expect(trace.mesh.getWorldPosition(new Vector3()).sub(before).distanceTo(new Vector3(0.1, 0.2, 0.3))).toBeLessThan(1e-6);
    threshold.dispose();
  });

  it("uses separate isolated marks at missing days and methodology edges, never bridge triangles", () => {
    const threshold = createGardenThreshold();
    const trace = createGardenMonthTrace(threshold);
    trace.update(record([{ ago: 4, score: 80 }, { ago: 3, score: 70, version: "v2" }, { ago: 0, score: 60, version: "v2" }]));
    expect(trace.mesh.geometry.drawRange.count).toBe(18);
    const indices = trace.mesh.geometry.index!;
    for (let triangle = 0; triangle < 6; triangle += 1) {
      const pointGroups = [0, 1, 2].map((corner) => Math.floor(indices.getX(triangle * 3 + corner) / 4));
      expect(new Set(pointGroups).size).toBe(1);
    }
    trace.update(record([{ ago: 0, score: 70 }]));
    expect(trace.mesh.visible).toBe(true);
    expect(trace.mesh.geometry.drawRange.count).toBe(6);
    trace.update(buildGardenMonthRecord(null));
    expect(trace.mesh.visible).toBe(false);
    expect(trace.mesh.geometry.drawRange.count).toBe(0);
    threshold.dispose();
  });

  it("keeps static buffers/materials resident, updating only changed dated content and not held evidence", () => {
    const threshold = createGardenThreshold();
    const trace = createGardenMonthTrace(threshold);
    const daily = record([{ ago: 1, score: 70 }, { ago: 0, score: 80 }]);
    expect(trace.update(daily)).toBe(true);
    const position = trace.mesh.geometry.getAttribute("position") as BufferAttribute;
    const version = position.version;
    const original = position.array.slice();
    const material = trace.mesh.material;
    expect(trace.update(daily)).toBe(false);
    expect(trace.update({ ...daily, evidence: makeSourceStatuses({ stability: { state: "stale", reason: "held" } }).stability })).toBe(false);
    expect(position.version).toBe(version);
    expect(position.array).toEqual(original);
    expect(trace.update(record([{ ago: 1, score: 70 }, { ago: 0, score: 81 }]))).toBe(true);
    expect(trace.mesh.geometry.getAttribute("position")).toBe(position);
    expect(trace.mesh.material).toBe(material);
    expect(position.version).toBe(version + 1);
    const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain("fwidth(vGardenFurrowSide)");
    expect(shader.fragmentShader).not.toMatch(/uTime|timeSeconds/);
    threshold.dispose();
  });

  it("disposes only its owned geometry/material once and detaches from the threshold", () => {
    const threshold = createGardenThreshold();
    const trace = createGardenMonthTrace(threshold);
    const geometryDispose = vi.spyOn(trace.mesh.geometry, "dispose");
    const materialDispose = vi.spyOn(trace.mesh.material, "dispose");
    trace.dispose(); trace.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(trace.mesh.parent).toBeNull();
    expect(trace.update(record([{ ago: 0, score: 80 }]))).toBe(false);
    threshold.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });
});
