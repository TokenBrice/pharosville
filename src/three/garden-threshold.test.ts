import { InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { defaultCamera } from "../systems/camera";
import { isGardenShipWater } from "../systems/garden-water-exclusion";
import { cameraView } from "../systems/projection";
import { REST_SEAT_EYE_HEIGHT } from "../systems/rest-seat";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH } from "../systems/world-layout";
import { createGardenThreshold, type GardenThreshold } from "./garden-threshold";
import { gardenRimDecorativeLandAt } from "./garden-rim-mesh";
import { TILE_SCALE } from "./garden-util";

const GATES = [
  { width: 1600, height: 1000 },
  { width: 1200, height: 640 },
  { width: 900, height: 720 },
  { width: 720, height: 900 },
] as const;
const MAP = { width: PHAROSVILLE_MAP_WIDTH, height: PHAROSVILLE_MAP_HEIGHT };

function restCamera(gate: { width: number; height: number }): PerspectiveCamera {
  const viewport = { x: gate.width, y: gate.height };
  const view = cameraView(defaultCamera({ ...gate, map: MAP }), viewport);
  const camera = new PerspectiveCamera(view.vFovDeg, gate.width / gate.height, 0.1, 4000);
  camera.position.set(view.eye.x, view.eye.y, view.eye.z);
  camera.lookAt(view.target.x, view.target.y, view.target.z);
  camera.updateMatrixWorld(true);
  return camera;
}

/** Coverage mask of the threshold on a W×H grid over the frame (clipped at the near plane). */
function coverage(threshold: GardenThreshold, camera: PerspectiveCamera, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const view = camera.matrixWorldInverse;
  const instance = new Matrix4();
  threshold.root.updateMatrixWorld(true);
  threshold.root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const matrix = object.matrixWorld.clone();
    if (object instanceof InstancedMesh) {
      object.getMatrixAt(0, instance);
      matrix.multiply(instance);
    }
    matrix.premultiply(view);
    const position = object.geometry.getAttribute("position");
    const index = object.geometry.index!;
    const local = Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix));
    for (let t = 0; t < index.count; t += 3) {
      let polygon = [local[index.getX(t)]!, local[index.getX(t + 1)]!, local[index.getX(t + 2)]!];
      if (polygon.every((p) => p.z > -0.1)) continue;
      const clipped: Vector3[] = [];
      for (let i = 0; i < 3; i += 1) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % 3]!;
        if (a.z <= -0.1) clipped.push(a);
        if ((a.z <= -0.1) !== (b.z <= -0.1)) clipped.push(a.clone().lerp(b, (-0.1 - a.z) / (b.z - a.z)));
      }
      polygon = clipped.map((p) => p.clone().applyMatrix4(camera.projectionMatrix)).map((p) => new Vector3((p.x + 1) / 2 * width, (1 - p.y) / 2 * height, 0));
      for (let k = 1; k + 1 < polygon.length; k += 1) {
        const [a, b, c] = [polygon[0]!, polygon[k]!, polygon[k + 1]!];
        const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        if (Math.abs(area) < 1e-9) continue;
        for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))); y <= Math.min(height - 1, Math.ceil(Math.max(a.y, b.y, c.y))); y += 1) {
          for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))); x <= Math.min(width - 1, Math.ceil(Math.max(a.x, b.x, c.x))); x += 1) {
            const w0 = ((b.x - x - 0.5) * (c.y - y - 0.5) - (b.y - y - 0.5) * (c.x - x - 0.5)) / area;
            const w1 = ((c.x - x - 0.5) * (a.y - y - 0.5) - (c.y - y - 0.5) * (a.x - x - 0.5)) / area;
            if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) mask[y * width + x] = 1;
          }
        }
      }
    }
  });
  return mask;
}

describe("garden threshold (seat C)", () => {
  const threshold = createGardenThreshold();

  it("covers no navigable water and leaves no outer ocean in the bottom quarter at every gate", () => {
    for (const gate of GATES) {
      const camera = restCamera(gate);
      const width = 240;
      const height = Math.round(width * gate.height / gate.width);
      const mask = coverage(threshold, camera, width, height);
      const hidden: string[] = [];
      for (let y = 0; y < 140; y += 1) {
        for (let x = 0; x < 140; x += 1) {
          if (!isGardenShipWater({ x, y }, 0)) continue;
          for (const hull of [0, 1.5]) {
            const screen = new Vector3(x * TILE_SCALE, hull, y * TILE_SCALE).project(camera);
            if (screen.z >= 1 || Math.abs(screen.x) >= 1 || Math.abs(screen.y) >= 1) continue;
            const px = Math.floor((screen.x + 1) / 2 * width);
            const py = Math.floor((1 - screen.y) / 2 * height);
            if (mask[py * width + px]) hidden.push(`${x},${y}@${hull}`);
          }
        }
      }
      expect(hidden, `${gate.width}x${gate.height} hull positions behind the threshold`).toEqual([]);

      const ray = new Raycaster();
      let outer = 0;
      for (let py = Math.ceil(height * 0.75); py < height; py += 1) {
        for (let px = 0; px < width; px += 1) {
          if (mask[py * width + px]) continue;
          ray.setFromCamera(new Vector2((px + 0.5) / width * 2 - 1, 1 - (py + 0.5) / height * 2), camera);
          const k = -ray.ray.origin.y / ray.ray.direction.y;
          const tile = { x: (ray.ray.origin.x + ray.ray.direction.x * k) / TILE_SCALE, y: (ray.ray.origin.z + ray.ray.direction.z * k) / TILE_SCALE };
          const inMap = tile.x >= 0 && tile.y >= 0 && tile.x <= 139 && tile.y <= 139;
          if (!inMap && !gardenRimDecorativeLandAt(tile.x, tile.y)) outer += 1;
        }
      }
      expect(outer, `${gate.width}x${gate.height} outer-ocean pixels in the bottom quarter`).toBe(0);
    }
  });

  it("shows the hero's lowest limb pad from below across the upper-left edge (landscape)", () => {
    const camera = restCamera(GATES[0]);
    const pad = threshold.heroLimbPadCentres[threshold.heroLimbPadCentres.length - 1]!;
    expect(pad.y).toBeGreaterThan(REST_SEAT_EYE_HEIGHT);
    const screen = pad.clone().project(camera);
    const u = (screen.x + 1) / 2;
    const v = (1 - screen.y) / 2;
    expect(u).toBeGreaterThanOrEqual(0);
    expect(u).toBeLessThan(0.15);
    expect(v).toBeGreaterThan(0.1);
    expect(v).toBeLessThan(0.26);
  });

  it("keeps to three smooth-shaded, textureless, unpickable draws within 15k triangles", () => {
    expect(threshold.drawCallCount).toBe(3);
    expect(threshold.triangleCount).toBeLessThanOrEqual(15_000);
    const meshes: Mesh[] = [];
    threshold.root.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    expect(meshes).toHaveLength(3);
    for (const mesh of meshes) {
      const material = mesh.material as MeshStandardMaterial;
      expect(material.map, mesh.name).toBeNull();
      expect(material.flatShading, mesh.name).toBe(false);
      expect(mesh.castShadow && mesh.receiveShadow, mesh.name).toBe(true);
    }
    const eye = new Vector3(threshold.heroLimbPadCentres[0]!.x, 40, threshold.heroLimbPadCentres[0]!.z);
    expect(new Raycaster(eye, new Vector3(0, -1, 0)).intersectObject(threshold.root, true)).toEqual([]);
  });
});
