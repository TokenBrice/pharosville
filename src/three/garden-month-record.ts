import { Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import type { GardenMonthRecord } from "../systems/world-types";

const matrix = new Matrix4();
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const neutral = new Color(1, 1, 1);
const blossom = new Color("#f1c8c1");
const green = new Color("#557149");
const dry = new Color("#806b49");

function growthOf(record?: GardenMonthRecord): number {
  return record?.unavailable ? 0.5 : Math.max(0, Math.min(1, record?.growth ?? 0.5));
}

function tintMaterial(material: MeshStandardMaterial, growth: number, strength: number): void {
  material.color.lerp(growth >= 0.5 ? green : dry, Math.abs(growth - 0.5) * 2 * strength);
}

function rescaleInstances(mesh: InstancedMesh, factor: number): void {
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, matrix);
    matrix.decompose(position, rotation, scale);
    scale.multiplyScalar(factor);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Reuses the garden's existing instance and vertex buffers: zero new draws. */
export function applyGardenMonthRecord(root: Group, record?: GardenMonthRecord): void {
  const growth = growthOf(record);
  root.traverse((object) => {
    if (object instanceof InstancedMesh && object.material instanceof MeshStandardMaterial) {
      if (object.name === "island-shrubs") {
        tintMaterial(object.material, growth, 0.72);
        rescaleInstances(object, 0.82 + growth * 0.28);
        const blossomShare = growth <= 0.6 ? 0 : (growth - 0.6) * 0.34;
        for (let index = 0; index < object.count; index += 1) {
          const opens = ((index * 37) % Math.max(1, object.count)) / Math.max(1, object.count) < blossomShare;
          object.setColorAt(index, opens ? blossom : neutral);
        }
        if (object.instanceColor) object.instanceColor.needsUpdate = true;
      } else if (object.name === "island-grass-tufts") {
        tintMaterial(object.material, growth, 0.82);
        rescaleInstances(object, 0.76 + growth * 0.32);
      }
      return;
    }
    if (!(object instanceof Mesh) || !object.name.startsWith("island-planted-shelf-")) return;
    const color = object.geometry.getAttribute("color");
    if (!color) return;
    const target = growth >= 0.5 ? green : dry;
    const amount = Math.abs(growth - 0.5) * 1.5;
    for (let index = 0; index < color.count; index += 1) {
      const r = color.getX(index);
      const g = color.getY(index);
      const b = color.getZ(index);
      if (!(g > b && g > r * 0.82)) continue;
      color.setXYZ(index, r + (target.r - r) * amount, g + (target.g - g) * amount, b + (target.b - b) * amount);
    }
    color.needsUpdate = true;
  });
}
