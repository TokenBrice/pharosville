import { Color, Mesh, PerspectiveCamera, Raycaster, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GARDEN_DEFAULT_CAMERA_ZOOM } from "../systems/camera";
import { CAMERA_FAR, CAMERA_FOV_DEG, CAMERA_NEAR, CAMERA_PITCH_RAD, CAMERA_YAW, TILE_SCALE, cameraDistanceForZoom, cameraEye } from "../systems/projection";
import { DAY_CYCLE_SKY_PRESETS, dayCyclePhase } from "./garden-day-cycle";
import { countDrawableObjects } from "./garden-util";
import { createGardenHorizon } from "./garden-horizon";

const FRAME = {
  targetX: 47.6,
  targetZ: 38.9,
  fogColor: DAY_CYCLE_SKY_PRESETS.day.fog,
  tier: "full" as const,
};

describe("garden horizon", () => {
  it("keeps three partial headlands beyond the plate in one non-selectable draw under the triangle cap", () => {
    const horizon = createGardenHorizon();
    horizon.update(dayCyclePhase(12), FRAME);
    expect(horizon.silhouetteCount).toBe(3);
    expect(horizon.triangleCount).toBeLessThanOrEqual(2_000);
    expect(countDrawableObjects(horizon.root)).toBe(1);
    const mesh = horizon.root.children[0] as Mesh;
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    const positions = mesh.geometry.getAttribute("position");
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      expect(positions.getX(vertex)).toBeLessThan(-40);
      expect(positions.getZ(vertex)).toBeLessThan(-40);
    }
    horizon.root.updateMatrixWorld(true);
    const faceCentre = new Vector3();
    for (let index = 0; index < 3; index += 1) {
      faceCentre.add(new Vector3().fromBufferAttribute(positions, mesh.geometry.index!.getX(index)));
    }
    faceCentre.multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
    const origin = faceCentre.clone().add(new Vector3(10, 0, 10));
    const raycaster = new Raycaster(origin, faceCentre.clone().sub(origin).normalize());
    expect(raycaster.intersectObject(horizon.root, true)).toEqual([]);
    horizon.dispose();
  });

  it("seats the softened profile endpoints on the sea horizon at reference rest", () => {
    const horizon = createGardenHorizon();
    horizon.update(dayCyclePhase(12), FRAME);
    const eye = cameraEye({
      targetTile: { x: FRAME.targetX / TILE_SCALE, y: FRAME.targetZ / TILE_SCALE },
      distance: cameraDistanceForZoom(1000, GARDEN_DEFAULT_CAMERA_ZOOM),
      pitch: CAMERA_PITCH_RAD,
      yaw: CAMERA_YAW,
    });
    const camera = new PerspectiveCamera(CAMERA_FOV_DEG, 1.6, CAMERA_NEAR, CAMERA_FAR);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.lookAt(FRAME.targetX, 0, FRAME.targetZ);
    camera.updateMatrixWorld(true);
    horizon.root.updateMatrixWorld(true);
    const mesh = horizon.root.children[0] as Mesh;
    const positions = mesh.geometry.getAttribute("position");
    const horizonY = 0.5 - Math.tan(CAMERA_PITCH_RAD) / (2 * Math.tan(CAMERA_FOV_DEG * Math.PI / 360));
    for (let layer = 0; layer < horizon.silhouetteCount; layer += 1) {
      for (const endpoint of [layer * 22 + 1, layer * 22 + 21]) {
        const projected = new Vector3().fromBufferAttribute(positions, endpoint)
          .applyMatrix4(mesh.matrixWorld).project(camera);
        expect((1 - projected.y) / 2).toBeCloseTo(horizonY, 5);
        expect(projected.z).toBeLessThan(1);
      }
    }
    horizon.dispose();
  });

  it("follows the live fog through phase and storm changes and sheds only on the constrained tier", () => {
    const horizon = createGardenHorizon();
    const material = (horizon.root.children[0] as Mesh).material as ShaderMaterial;
    for (const fogColor of [DAY_CYCLE_SKY_PRESETS.day.fog, DAY_CYCLE_SKY_PRESETS.night.fog, new Color(0x283644)]) {
      horizon.update(dayCyclePhase(12), { ...FRAME, fogColor });
      expect((material.uniforms.uFogColor.value as Color).getHex()).toBe(fogColor.getHex());
      expect(horizon.root.visible).toBe(true);
    }
    horizon.update(dayCyclePhase(12), { ...FRAME, tier: "constrained" });
    expect(horizon.root.visible).toBe(false);
    horizon.dispose();
  });
});
