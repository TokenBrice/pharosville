import { Color, Mesh, PerspectiveCamera, Raycaster, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { defaultCamera } from "../systems/camera";
import { CAMERA_FAR, CAMERA_FOV_DEG, CAMERA_NEAR, CAMERA_PITCH_FAR_ZOOM, CAMERA_PITCH_NEAR_ZOOM, TILE_SCALE, cameraEye, cameraPoseFromIso, screenToGroundRay } from "../systems/projection";
import { buildPharosVilleMap } from "../systems/world-layout";
import { DAY_CYCLE_SKY_PRESETS, dayCyclePhase } from "./garden-day-cycle";
import { countDrawableObjects } from "./garden-util";
import { createGardenHorizon } from "./garden-horizon";

const FRAME = {
  targetX: 47.6,
  targetZ: 38.9,
  cameraPosition: { x: 123, y: 23, z: 114 },
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

  it("seats the softened profile endpoints on the live sea horizon at both viewport and zoom gates", () => {
    const horizon = createGardenHorizon();
    const map = buildPharosVilleMap();
    for (const viewport of [{ x: 900, y: 720 }, { x: 1200, y: 640 }]) {
      const rest = defaultCamera({ width: viewport.x, height: viewport.y, map });
      for (const zoom of [rest.zoom, CAMERA_PITCH_FAR_ZOOM, CAMERA_PITCH_NEAR_ZOOM]) {
        const isoCamera = { ...rest, zoom };
        const pose = cameraPoseFromIso(isoCamera, viewport);
        const eye = cameraEye(pose);
        const targetX = pose.targetTile.x * TILE_SCALE;
        const targetZ = pose.targetTile.y * TILE_SCALE;
        horizon.update(dayCyclePhase(12), { ...FRAME, cameraPosition: eye, targetX, targetZ });
        const camera = new PerspectiveCamera(CAMERA_FOV_DEG, viewport.x / viewport.y, CAMERA_NEAR, CAMERA_FAR);
        camera.position.set(eye.x, eye.y, eye.z);
        camera.lookAt(targetX, pose.targetHeight, targetZ);
        camera.updateMatrixWorld(true);
        horizon.root.updateMatrixWorld(true);
        const mesh = horizon.root.children[0] as Mesh;
        const positions = mesh.geometry.getAttribute("position");
        let top = 0;
        let bottom = viewport.y;
        for (let step = 0; step < 40; step += 1) {
          const y = (top + bottom) / 2;
          if (screenToGroundRay({ x: viewport.x / 2, y }, isoCamera, viewport).direction.y > 0) top = y;
          else bottom = y;
        }
        const horizonY = (top + bottom) / 2;
        expect(screenToGroundRay({ x: viewport.x / 2, y: horizonY }, isoCamera, viewport).direction.y).toBeCloseTo(0, 10);
        for (let layer = 0; layer < horizon.silhouetteCount; layer += 1) {
          for (const endpoint of [layer * 22 + 1, layer * 22 + 21]) {
            const projected = new Vector3().fromBufferAttribute(positions, endpoint)
              .applyMatrix4(mesh.matrixWorld).project(camera);
            expect(Math.abs((1 - projected.y) * viewport.y / 2 - horizonY)).toBeLessThan(viewport.y * 0.005);
            expect(projected.z).toBeLessThan(1);
          }
        }
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
