import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { CameraRig } from "./camera-rig";

describe("camera rig exact dirty state", () => {
  it("does not resync an unchanged camera or rebuild projection for a pan", () => {
    const camera = new THREE.PerspectiveCamera(25, 1, 5, 9000);
    const rig = new CameraRig(camera);
    rig.update(0);
    const projection = vi.spyOn(camera, "updateProjectionMatrix");
    const look = vi.spyOn(camera, "lookAt");
    const before = camera.matrixWorld.clone();
    rig.update(0.016);
    expect(look).not.toHaveBeenCalled();
    expect(projection).not.toHaveBeenCalled();
    expect(camera.matrixWorld.equals(before)).toBe(true);
    rig.pan(10, 5);
    rig.update(0.016);
    expect(look).toHaveBeenCalledTimes(1);
    expect(projection).not.toHaveBeenCalled();
    rig.zoom(0.9);
    rig.update(0.016);
    expect(projection).toHaveBeenCalledTimes(1);
    expect(camera.near).toBe(Math.max(1, rig.distance * 0.05));
    expect(camera.far).toBe(rig.distance * 12);
  });

  it("retains the exact damped motion arithmetic, including zero delta", () => {
    const camera = new THREE.PerspectiveCamera();
    const rig = new CameraRig(camera);
    rig.pan(13, -7);
    rig.zoom(0.8);
    const target = new THREE.Vector3(), goal = new THREE.Vector3(13, 0, -7);
    let distance = 720;
    for (const delta of [0, 0.016, 0.1, 0.05, 0]) {
      const k = 1 - Math.exp(-delta * 6);
      target.lerp(goal, k);
      distance += (720 * 0.8 - distance) * k;
      rig.update(delta);
      expect(rig.target.equals(target)).toBe(true);
      expect(rig.distance).toBe(distance);
      const cp = Math.cos(rig.pitch);
      const offset = new THREE.Vector3(Math.sin(rig.yaw) * cp, Math.sin(rig.pitch), Math.cos(rig.yaw) * cp).multiplyScalar(distance);
      expect(camera.position.equals(target.clone().add(offset))).toBe(true);
    }
  });
});
