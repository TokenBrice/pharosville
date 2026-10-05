import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { GardenMonthRecord } from "../systems/world-types";
import { gardenMonthRecordContentSignature } from "../systems/garden-month-record";
import type { GardenThreshold } from "./garden-threshold";
import { applyGardenSurface } from "./garden-surfaces";
import { chainGardenMaterialPatch } from "./garden-aerial";

export const GARDEN_MONTH_FURROW_WIDTH = 0.024;
const MAX_VERTICES = 120;
const MAX_INDICES = 128 * 3;
const DAY_MS = 86_400_000;

export interface GardenMonthTrace {
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  update(record?: GardenMonthRecord): boolean;
  dispose(): void;
}

/** One passive, fixed-width shallow furrow, root-local on the reserved gravel.
 * No statistical smoothing, decorative stripes, texture or frame animation. */
export function createGardenMonthTrace(threshold: Pick<GardenThreshold, "root" | "gravelInset">): GardenMonthTrace {
  const ground = threshold.root.getObjectByName("garden-threshold-land");
  if (!(ground instanceof Mesh) || !(ground.material instanceof MeshStandardMaterial)) {
    throw new Error("Garden month trace requires the threshold's gravel-role ground material");
  }
  const material = ground.material.clone();
  material.name = "garden-month-record-gravel";
  material.vertexColors = false;
  material.color.copy(threshold.gravelInset.pigment);
  material.emissive.setHex(0);
  material.emissiveIntensity = 0;
  material.transparent = true;
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  applyGardenSurface(material, { role: "gravel", mapping: "worldXZ", metresPerRepeat: 0.45, detailStrength: 0 });
  material.userData.gardenSurfaceExemption = "dataTrace";
  chainGardenMaterialPatch(material, {
    key: "garden-month-furrow-aa-v1", slot: "garden-month-furrow", stage: "surface",
    compile(shader) {
      shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float gardenFurrowSide; varying float vGardenFurrowSide;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGardenFurrowSide = gardenFurrowSide;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vGardenFurrowSide;")
        .replace("#include <color_fragment>", `#include <color_fragment>
  float furrowEdge = abs(vGardenFurrowSide);
  float furrowPixel = max(fwidth(vGardenFurrowSide), 0.001);
  diffuseColor.a *= (1.0 - smoothstep(1.0 - furrowPixel, 1.0 + furrowPixel, furrowEdge)) * min(1.0, 2.0 / furrowPixel);
  diffuseColor.rgb *= mix(0.42, 0.9, smoothstep(0.0, 1.0, furrowEdge));`);
    },
  });
  const geometry = new BufferGeometry();
  const positions = new BufferAttribute(new Float32Array(MAX_VERTICES * 3), 3).setUsage(DynamicDrawUsage);
  const side = new BufferAttribute(new Float32Array(MAX_VERTICES), 1).setUsage(DynamicDrawUsage);
  const indices = new BufferAttribute(new Uint16Array(MAX_INDICES), 1).setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", positions);
  geometry.setAttribute("gardenFurrowSide", side);
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const mesh = new Mesh(geometry, material);
  mesh.name = "garden-month-record-trace";
  mesh.visible = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.raycast = () => {};
  threshold.root.add(mesh);
  const inset = threshold.gravelInset;
  const point = new Vector3();
  const offset = new Vector3();
  let appliedKey: string | undefined;
  let disposed = false;
  return {
    mesh,
    update(record) {
      if (disposed) return false;
      const key = gardenMonthRecordContentSignature(record);
      if (key === appliedKey) return false;
      appliedKey = key;
      let vertex = 0, index = 0;
      const emit = (x: number, y: number, acrossX: number, acrossY: number, flank: number) => {
        point.copy(inset.centre).addScaledVector(inset.right, x + acrossX * flank * GARDEN_MONTH_FURROW_WIDTH / 2)
          .addScaledVector(inset.forward, y + acrossY * flank * GARDEN_MONTH_FURROW_WIDTH / 2)
          .addScaledVector(inset.normal, flank === 0 ? 0.002 : 0.008);
        positions.setXYZ(vertex, point.x, point.y, point.z);
        side.setX(vertex, flank);
        return vertex++;
      };
      const triangle = (a: number, b: number, c: number) => {
        // The inset basis need not assume a particular world-axis handedness.
        const ax = positions.getX(b) - positions.getX(a), ay = positions.getY(b) - positions.getY(a), az = positions.getZ(b) - positions.getZ(a);
        offset.set(positions.getX(c) - positions.getX(a), positions.getY(c) - positions.getY(a), positions.getZ(c) - positions.getZ(a));
        const facing = (ay * offset.z - az * offset.y) * inset.normal.x + (az * offset.x - ax * offset.z) * inset.normal.y + (ax * offset.y - ay * offset.x) * inset.normal.z;
        indices.setX(index++, a); indices.setX(index++, facing >= 0 ? b : c); indices.setX(index++, facing >= 0 ? c : b);
      };
      if (record && !record.unavailable && record.windowStartDay) {
        const start = Date.parse(record.windowStartDay);
        const xOf = (day: string) => ((Date.parse(day) - start) / DAY_MS / 29 - 0.5) * inset.width * 0.88;
        const yOf = (score: number) => (Math.min(100, Math.max(0, score)) / 100 - 0.5) * inset.depth * 0.72;
        for (const segment of record.segments) {
          if (segment.length === 1) {
            const close = segment[0]!;
            const x = xOf(close.day), y = yOf(close.score);
            const a = emit(x - GARDEN_MONTH_FURROW_WIDTH, y, 0, 1, -1);
            const b = emit(x + GARDEN_MONTH_FURROW_WIDTH, y, 0, 1, -1);
            const c = emit(x - GARDEN_MONTH_FURROW_WIDTH, y, 0, 1, 1);
            const d = emit(x + GARDEN_MONTH_FURROW_WIDTH, y, 0, 1, 1);
            triangle(a, b, c); triangle(c, b, d);
            continue;
          }
          const first = vertex;
          for (let sample = 0; sample < segment.length; sample += 1) {
            const close = segment[sample]!;
            const prior = segment[Math.max(0, sample - 1)]!;
            const next = segment[Math.min(segment.length - 1, sample + 1)]!;
            const dx = xOf(next.day) - xOf(prior.day), dy = yOf(next.score) - yOf(prior.score);
            const length = Math.hypot(dx, dy) || 1;
            emit(xOf(close.day), yOf(close.score), -dy / length, dx / length, -1);
            emit(xOf(close.day), yOf(close.score), -dy / length, dx / length, 0);
            emit(xOf(close.day), yOf(close.score), -dy / length, dx / length, 1);
            if (sample > 0) {
              const a = first + (sample - 1) * 3, b = a + 3;
              triangle(a, b, a + 1); triangle(a + 1, b, b + 1);
              triangle(a + 1, b + 1, a + 2); triangle(a + 2, b + 1, b + 2);
            }
          }
        }
      }
      indices.array.fill(0, index);
      for (let unused = vertex; unused < MAX_VERTICES; unused += 1) positions.setXYZ(unused, positions.getX(0), positions.getY(0), positions.getZ(0));
      positions.needsUpdate = true; side.needsUpdate = true; indices.needsUpdate = true;
      geometry.setDrawRange(0, index);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      mesh.visible = index > 0;
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent(); geometry.dispose(); material.dispose();
    },
  };
}
