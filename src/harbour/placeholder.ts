import * as THREE from "three";
import type { EngineContext, WorldSystem } from "./engine/types";

/** Temporary: a grey disc + light so the engine renders something. Remove once real systems land. */
export class PlaceholderSystem implements WorldSystem {
  readonly name = "placeholder";
  private group = new THREE.Group();
  init(ctx: EngineContext): void {
    ctx.rig.applyPreset({ target: [0, 0, 0], distance: 720, fovDeg: 25, pitchDeg: 35, yawDeg: 45 }, true);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(220, 240, 12, 48), new THREE.MeshStandardMaterial({ color: "#8a9a7a" }));
    disc.position.y = 2;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#1d4a66" }));
    const sun = new THREE.DirectionalLight("#ffffff", 2.5); sun.position.set(300, 400, 200);
    this.group.add(disc, sea, sun, new THREE.HemisphereLight("#bcd", "#223", 0.8));
    ctx.scene.add(this.group);
    ctx.scene.background = new THREE.Color("#9fb6c8");
  }
  update(): void {}
  dispose(ctx: EngineContext): void { ctx.scene.remove(this.group); }
}
