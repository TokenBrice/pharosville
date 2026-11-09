import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import type { HarbourLayout } from "../layout/types";

const BAND_FRAC = 0.2;               // pretend horizon sits this fraction of the frame below the top
const D2R = Math.PI / 180;

interface BackdropUniforms {
  uCam: THREE.IUniform<THREE.Vector3>;
  uFwdAzV: THREE.IUniform<number>; uR: THREE.IUniform<number>; uSpan: THREE.IUniform<number>;
  uYBot: THREE.IUniform<number>; uYTop: THREE.IUniform<number>; uPxDeg: THREE.IUniform<number>;
}

export class SkyCameraFrame {
  private landPts: Array<[number, number]> = [];
  private layout: HarbourLayout | undefined;
  private readonly cameraKey = {
    valid: false, matrix: new THREE.Matrix4(), projection: new THREE.Matrix4(), position: new THREE.Vector3(), target: new THREE.Vector3(),
    resolution: new THREE.Vector2(), fov: 0, aspect: 0,
  };
  readonly geometry = { fwdAz: 0, vfov: 0, halfH: 0, pitch: 0, R: 1500, depr: 0, rightX: 1, rightZ: 0, lateralDeg: 0 };
  private readonly tmp = new THREE.Vector3();

  syncLayout(layout: HarbourLayout | undefined): void {
    this.layout = layout;
    const pts: Array<[number, number]> = [];
    if (layout) {
      const coast = layout.island?.coast as unknown;
      const polys = Array.isArray(coast) && Array.isArray((coast as unknown[][])[0]?.[0]) ? (coast as Array<Array<[number, number]>>) : [coast as Array<[number, number]>];
      for (const poly of polys) if (Array.isArray(poly)) for (const p of poly) pts.push([p[0], p[1]]);
      for (const line of [layout.island?.breakwater, layout.island?.mole]) for (const p of line ?? []) pts.push([p[0], p[1]]);
      // Keep the Pharos islet inside the card as well as the main island.
      for (const poly of layout.island?.islets ?? []) for (const p of poly) pts.push([p[0], p[1]]);
    }
    this.landPts = pts;
    this.cameraKey.valid = false;
  }

  /** Geometry depends only on the immutable layout, camera frame, target and drawing size, not sky lighting/weather. */
  update(ctx: EngineContext, mesh: THREE.Mesh, bd: BackdropUniforms, parallax: THREE.IUniform<THREE.Vector4>): boolean {
    const { camera, rig, uniforms: W } = ctx;
    const layout = ctx.services.get("layout");
    if (layout !== this.layout) this.syncLayout(layout);
    const fwd = camera.getWorldDirection(this.tmp), key = this.cameraKey;
    if (key.valid && key.matrix.equals(camera.matrixWorld) && key.projection.equals(camera.projectionMatrix) && key.position.equals(camera.position)
      && key.target.equals(rig.target) && key.resolution.equals(W.uResolution.value)
      && key.fov === camera.fov && key.aspect === camera.aspect) return false;
    key.matrix.copy(camera.matrixWorld); key.projection.copy(camera.projectionMatrix);
    key.position.copy(camera.position); key.target.copy(rig.target);
    key.resolution.copy(W.uResolution.value); key.fov = camera.fov; key.aspect = camera.aspect; key.valid = true;
    const fwdAz = Math.atan2(fwd.x, -fwd.z);
    const vfov = camera.fov * D2R;
    const halfH = Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const pitch = Math.asin(THREE.MathUtils.clamp(-fwd.y, -1, 1));
    const camY = camera.position.y;
    const deprWanted = pitch - vfov / 2 + BAND_FRAC * vfov;
    let R = camY / Math.tan(Math.max(0.05, deprWanted));
    const cx = camera.position.x, cz = camera.position.z;
    const span = halfH + 0.25;
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    let far = 0;
    for (const [px, pz] of this.landPts) {
      const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
      const df = (dx * fwd.x + dz * fwd.z) / fl;
      if (df / d < Math.cos(span)) continue;
      far = Math.max(far, df);
    }
    if (far > 0) R = Math.max(R, far + 14);
    const depr = Math.atan(camY / R);
    const yTop = camY - R * Math.tan(Math.max(0.02, pitch - vfov / 2 - 0.06));
    bd.uCam.value.copy(camera.position);
    bd.uFwdAzV.value = fwdAz; bd.uR.value = R; bd.uSpan.value = span;
    bd.uYBot.value = -4; bd.uYTop.value = Math.max(yTop, 20);
    bd.uPxDeg.value = camera.fov / Math.max(1, W.uResolution.value.y);
    mesh.visible = yTop > 0;
    const rightX = Math.cos(fwdAz), rightZ = Math.sin(fwdAz);
    const lateral = rig.target.x * rightX + rig.target.z * rightZ;
    parallax.value.set((lateral / 9000) * (180 / Math.PI), (lateral / 5200) * (180 / Math.PI), (lateral / 3000) * (180 / Math.PI), (lateral / 7000) * (180 / Math.PI));
    const geometry = this.geometry;
    geometry.fwdAz = fwdAz; geometry.vfov = vfov; geometry.halfH = halfH; geometry.pitch = pitch;
    geometry.R = R; geometry.depr = depr; geometry.rightX = rightX; geometry.rightZ = rightZ;
    geometry.lateralDeg = (lateral / 1) * (180 / Math.PI);
    return true;
  }
}
