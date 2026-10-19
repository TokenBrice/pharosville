import * as THREE from "three";

export interface CameraPreset { target: [number, number, number]; distance: number; fovDeg: number; pitchDeg: number; yawDeg: number; }

/**
 * Bounded diorama camera: fixed pitch/yaw (isometric-like perspective), pan in the ground plane,
 * zoom by distance. Smoothly damped. Pointer, wheel and touch handling live in input.ts (CameraInput).
 */
export class CameraRig {
  readonly target = new THREE.Vector3();
  distance = 720;
  pitch = THREE.MathUtils.degToRad(35);
  yaw = THREE.MathUtils.degToRad(45);
  minDistance = 90;
  maxDistance = 900;
  /** Ground-plane pan bounds (x,z). */
  bounds = new THREE.Box2(new THREE.Vector2(-600, -600), new THREE.Vector2(600, 600));
  private readonly goalTarget = new THREE.Vector3();
  private goalDistance = 720;
  private readonly offset = new THREE.Vector3();
  private readonly syncedTarget = new THREE.Vector3(NaN, NaN, NaN);
  private syncedDistance = NaN;
  private syncedPitch = NaN;
  private syncedYaw = NaN;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  applyPreset(p: CameraPreset, immediate = false): void {
    this.goalTarget.set(...p.target);
    this.goalDistance = p.distance;
    this.pitch = THREE.MathUtils.degToRad(p.pitchDeg);
    this.yaw = THREE.MathUtils.degToRad(p.yawDeg);
    if (this.camera.fov !== p.fovDeg) { this.camera.fov = p.fovDeg; this.camera.updateProjectionMatrix(); }
    if (immediate) { this.target.copy(this.goalTarget); this.distance = this.goalDistance; this.sync(); }
  }

  pan(dxWorld: number, dzWorld: number): void {
    this.goalTarget.x = THREE.MathUtils.clamp(this.goalTarget.x + dxWorld, this.bounds.min.x, this.bounds.max.x);
    this.goalTarget.z = THREE.MathUtils.clamp(this.goalTarget.z + dzWorld, this.bounds.min.y, this.bounds.max.y);
  }

  zoom(factor: number): void {
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * factor, this.minDistance, this.maxDistance);
  }

  /**
   * Zoom about a screen point (px from the viewport centre): the ground under it stays put, as under
   * a pinch. The target moves by (1 − f) of the point's offset, f being the clamped distance ratio.
   */
  zoomAt(factor: number, dxPx: number, dyPx: number, viewportHeight: number): void {
    const before = this.goalDistance;
    this.zoom(factor);
    const f = this.goalDistance / before;
    if (f === 1) return;
    const [wx, wz] = this.dragToWorld(dxPx, dyPx, viewportHeight);
    // dragToWorld is the pan that drags content BY that offset: the point's own ground offset is its negative
    this.pan((f - 1) * wx, (f - 1) * wz);
  }

  /** Is the rig headed for (or resting at) this framing? */
  isAt(p: CameraPreset): boolean {
    return Math.abs(this.goalDistance - p.distance) < 0.5
      && Math.abs(this.goalTarget.x - p.target[0]) < 0.5 && Math.abs(this.goalTarget.z - p.target[2]) < 0.5;
  }

  /** World units per screen pixel at the target (for pan speed). */
  worldPerPixel(viewportHeight: number): number {
    return (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / viewportHeight;
  }

  /** Screen-space drag → ground-plane delta (content follows the cursor), honouring yaw/pitch. */
  dragToWorld(dxPx: number, dyPx: number, viewportHeight: number): [number, number] {
    const s = this.worldPerPixel(viewportHeight);
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const rightX = cosY, rightZ = -sinY;          // screen-right on the ground
    const fwdX = -sinY, fwdZ = -cosY;             // screen-up (away from camera) on the ground
    const fwd = (dyPx * s) / Math.sin(this.pitch);
    return [-dxPx * s * rightX + fwd * fwdX, -dxPx * s * rightZ + fwd * fwdZ];
  }

  update(delta: number): void {
    const k = 1 - Math.exp(-delta * 6);
    this.target.lerp(this.goalTarget, k);
    this.distance += (this.goalDistance - this.distance) * k;
    this.sync();
  }

  private sync(): void {
    if (this.syncedDistance === this.distance && this.syncedPitch === this.pitch
      && this.syncedYaw === this.yaw && this.syncedTarget.equals(this.target)) return;
    this.syncedDistance = this.distance;
    this.syncedPitch = this.pitch;
    this.syncedYaw = this.yaw;
    this.syncedTarget.copy(this.target);
    const cp = Math.cos(this.pitch);
    this.offset.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.distance);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
    const near = Math.max(1, this.distance * 0.05), far = this.distance * 12;
    if (this.camera.near !== near || this.camera.far !== far) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }
}
