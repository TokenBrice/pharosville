import type { Vector3 } from "three";
import type { GroundLike } from "./services";

/** Height-field march only for a screen/ray hit candidate; keep visible mast tips accessible. */
export function terrainOccludes(ground: GroundLike | null, eye: Vector3, x: number, y: number, z: number): boolean {
  if (!ground) return false;
  let dx = eye.x - x, dy = eye.y - y, dz = eye.z - z;
  const len = Math.hypot(dx, dy, dz);
  dx /= len; dy /= len; dz /= len;
  if (dy <= 0 || !Number.isFinite(dy)) return false;
  const step = 1 / Math.max(1e-4, Math.hypot(dx, dz));
  const end = Math.min(len, (80 - y) / dy);
  for (let t = step * 2; t < end; t += step) {
    if (ground.heightAt(x + dx * t, z + dz * t) > y + dy * t + 0.3) return true;
  }
  return false;
}
