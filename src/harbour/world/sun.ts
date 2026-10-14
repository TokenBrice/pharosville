import * as THREE from "three";
import type { EngineContext } from "../engine/types";

/**
 * Key light (sun by day, moon by night) with ONE shadow map fitted to what the camera sees, a shadowless
 * fill sun and the world (hemisphere) light — all driven by the shared uniforms (TimeOfDay).
 *
 * Shadow fit: the view frustum's ground footprint (y = 0 and y = top) is clipped to the island bounds,
 * projected into light space, and the ortho box is quantised (extent steps + texel-snapped centre) so
 * panning/zooming never swims the shadow edges.
 */
export class SunRig {
  readonly key = new THREE.DirectionalLight(0xffffff, 1);
  readonly fill = new THREE.DirectionalLight(0xffffff, 1);
  /** World light at 0.85 × the Blender-equivalent π: the height-field AO only darkens, never adds back the EEVEE bounce. */
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, Math.PI * 0.85);
  readonly group = new THREE.Group();
  /** World-space region the shadow may cover: (minX, minZ, maxX, maxZ) and max structure height. */
  bounds = new THREE.Vector4(-400, -400, 400, 400);
  topY = 36;
  private readonly mapSize: number;
  private readonly lightView = new THREE.Matrix4();
  private readonly lightViewInv = new THREE.Matrix4();
  private readonly ray = new THREE.Ray();
  private readonly pts: THREE.Vector3[] = Array.from({ length: 32 }, () => new THREE.Vector3());
  private readonly tmp = new THREE.Vector3();
  private readonly ndc = new THREE.Vector3();

  constructor(mapSize = 4096) {
    this.mapSize = mapSize;
    const k = this.key;
    k.castShadow = true;
    k.shadow.mapSize.set(mapSize, mapSize);
    k.shadow.radius = 2.2;
    k.shadow.bias = -0.0004;
    k.shadow.camera.near = 1;
    k.shadow.camera.far = 2000;
    this.fill.castShadow = false;
    this.group.add(k, k.target, this.fill, this.fill.target, this.hemi);
    this.group.name = "harbour-sun-rig";
  }

  update(ctx: EngineContext): void {
    const u = ctx.uniforms;
    this.key.color.copy(u.uSunColor.value);
    this.fill.color.copy(u.uFillColor.value);
    this.hemi.color.copy(u.uHemiSky.value);
    this.hemi.groundColor.copy(u.uHemiGround.value);
    this.fill.position.copy(u.uFillDir.value).multiplyScalar(100);
    this.fill.target.position.set(0, 0, 0);
    // moonlight: softer, lighter shadows
    this.key.shadow.intensity = 1 - 0.3 * u.uNight.value;
    this.key.shadow.radius = 2.2 + 2.5 * u.uNight.value;
    this.fitShadow(ctx.camera, u.uSunDir.value);
  }

  private fitShadow(camera: THREE.PerspectiveCamera, sunDir: THREE.Vector3): void {
    // light basis (looking along -sunDir)
    const up = Math.abs(sunDir.y) > 0.98 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    this.lightView.lookAt(this.tmp.set(0, 0, 0), this.ndc.copy(sunDir).negate(), up);
    this.lightViewInv.copy(this.lightView).invert();

    // ground footprint of the view frustum at y = 0 and y = topY
    const b = this.bounds;
    let n = 0;
    const maxDist = camera.far * 0.9;
    for (const sy of [-1, 0, 1]) {
      for (const sx of [-1, 0, 1]) {
        if (sx === 0 && sy === 0) continue;
        this.ndc.set(sx, sy, 0.5).unproject(camera);
        this.ray.origin.copy(camera.position);
        this.ray.direction.copy(this.ndc).sub(camera.position).normalize();
        for (const h of [0, this.topY]) {
          const d = this.ray.direction.y < -1e-4 ? (h - this.ray.origin.y) / this.ray.direction.y : maxDist;
          const p = this.pts[n++].copy(this.ray.direction).multiplyScalar(Math.min(Math.max(d, 0), maxDist)).add(this.ray.origin);
          p.x = THREE.MathUtils.clamp(p.x, b.x, b.z);
          p.z = THREE.MathUtils.clamp(p.z, b.y, b.w);
          p.y = h;
        }
      }
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = this.tmp.copy(this.pts[i]).applyMatrix4(this.lightViewInv);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    // quantise the extent (16 m steps) and snap the centre to whole texels
    const step = 16;
    const half = Math.ceil((Math.max(maxX - minX, maxY - minY) * 0.5 + 6) / step) * step;
    const texel = (2 * half) / this.mapSize;
    const cx = Math.round((minX + maxX) * 0.5 / texel) * texel;
    const cy = Math.round((minY + maxY) * 0.5 / texel) * texel;

    // depth range: the island box in light space
    let minZ = Infinity, maxZ = -Infinity;
    for (const x of [b.x, b.z]) for (const z of [b.y, b.w]) for (const y of [-6, this.topY + 6]) {
      const p = this.tmp.set(x, y, z).applyMatrix4(this.lightViewInv);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const centre = this.tmp.set(cx, cy, maxZ + 20).applyMatrix4(this.lightView);
    const k = this.key;
    k.position.copy(centre);
    k.target.position.copy(centre).sub(sunDir);
    const cam = k.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.near = 1; cam.far = maxZ - minZ + 40;
    cam.updateProjectionMatrix();
    k.shadow.normalBias = texel * 1.6;
    k.target.updateMatrixWorld();
  }

  dispose(): void {
    this.key.shadow.dispose();
    this.group.removeFromParent();
  }
}
