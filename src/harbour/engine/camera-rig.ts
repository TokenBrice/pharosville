import * as THREE from "three";

export interface CameraPreset { target: [number, number, number]; distance: number; fovDeg: number; pitchDeg: number; yawDeg: number; }

/** Minimum-jerk (quintic) ease: zero velocity and acceleration at both ends. */
export const minJerk = (u: number): number => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * t * (10 + t * (6 * t - 15));
};

/** Glide time (s) for a hop of `travel` metres: short moves stay brisk, long ones take their time. */
export const glideSeconds = (travel: number): number => Math.min(2.4, Math.max(0.9, 0.9 + 0.0018 * travel));

/** Crane lift for a hop: none up to ~250 m, rising to a 12 % stand-off on the longest flights. */
export const craneLift = (travel: number): number => 0.12 * THREE.MathUtils.smoothstep(travel, 250, 700);

/** Ground travel plus zoom change (m): how far a glide "feels". */
export const glideTravel = (ax: number, az: number, ad: number, bx: number, bz: number, bd: number): number =>
  Math.hypot(bx - ax, bz - az, bd - ad);

export interface GlideOptions {
  /** Duration override (ms); default grows with travel (glideSeconds). */
  ms?: number;
  /** Mid-flight distance bump as a share (0.12 = 12 % further out); default craneLift(travel). Negative pushes in. */
  lift?: number;
}

/**
 * The glide pose at time share u ∈ [0, 1]: the ground target eases on the minimum-jerk curve, the
 * distance eases in log space (a zoom reads evenly) and is lifted by `lift`·sin²(πu), which is itself
 * zero-velocity at both ends, so the crane rises and settles without a kink.
 */
export function glidePose(
  from: { x: number; y: number; z: number; d: number }, to: { x: number; y: number; z: number; d: number },
  u: number, lift: number, out: { x: number; y: number; z: number; d: number },
): typeof out {
  const s = minJerk(u);
  out.x = from.x + (to.x - from.x) * s;
  out.y = from.y + (to.y - from.y) * s;
  out.z = from.z + (to.z - from.z) * s;
  const bump = Math.sin(Math.PI * Math.min(1, Math.max(0, u))) ** 2;
  out.d = Math.exp(Math.log(from.d) + (Math.log(to.d) - Math.log(from.d)) * s) * (1 + lift * bump);
  return out;
}

interface Glide { from: { x: number; y: number; z: number; d: number }; to: { x: number; y: number; z: number; d: number }; t: number; dur: number; lift: number }

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
  private glide: Glide | null = null;
  private readonly gp = { x: 0, y: 0, z: 0, d: 0 };
  /**
   * A render-only breath on top of the pose (idle breath, home "here you are"): distance share and a
   * ground offset (m). It never moves the goal, so isAt() and the pan clamp are unaffected.
   */
  readonly breath = { k: 0, dx: 0, dz: 0 };
  /** Bumped by every user pan or zoom (not by glides): follow / watch / idle read it to let go. */
  inputEpoch = 0;
  private readonly syncedTarget = new THREE.Vector3(NaN, NaN, NaN);
  private readonly syncedBreath = { k: NaN, dx: NaN, dz: NaN };
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
    this.glide = null;
    if (immediate) { this.target.copy(this.goalTarget); this.distance = this.goalDistance; this.sync(); }
  }

  /**
   * Glide to a framing: minimum-jerk ease from the current pose, a duration that grows with the
   * travel, and a soft crane lift on long hops. The goal is set at once (isAt reads it). A user pan or
   * zoom cancels the glide where it stands; a later glideTo or applyPreset replaces it.
   */
  glideTo(p: CameraPreset, opts: GlideOptions = {}): void {
    this.applyPreset(p);
    const from = { x: this.target.x, y: this.target.y, z: this.target.z, d: this.distance };
    const to = { x: this.goalTarget.x, y: this.goalTarget.y, z: this.goalTarget.z, d: this.goalDistance };
    const travel = glideTravel(from.x, from.z, from.d, to.x, to.z, to.d);
    const lift = opts.lift ?? craneLift(travel);
    if (travel < 0.05 && !lift) return;
    this.glide = { from, to, t: 0, dur: (opts.ms ?? glideSeconds(travel) * 1000) / 1000, lift };
  }

  /** True while a glide is running. */
  get gliding(): boolean { return this.glide !== null; }

  /** Stop a running glide where it stands (the chase then rests there). */
  cancelGlide(): void {
    if (!this.glide) return;
    this.glide = null;
    this.goalTarget.copy(this.target);
    this.goalDistance = this.distance;
  }

  /**
   * Steer the goal's ground point without counting as user input (follow mode). Clamped like a pan;
   * cancels a glide.
   */
  steer(x: number, z: number): void {
    this.cancelGlide();
    this.goalTarget.x = THREE.MathUtils.clamp(x, this.bounds.min.x, this.bounds.max.x);
    this.goalTarget.z = THREE.MathUtils.clamp(z, this.bounds.min.y, this.bounds.max.y);
  }

  pan(dxWorld: number, dzWorld: number): void {
    this.cancelGlide();
    this.inputEpoch++;
    this.goalTarget.x = THREE.MathUtils.clamp(this.goalTarget.x + dxWorld, this.bounds.min.x, this.bounds.max.x);
    this.goalTarget.z = THREE.MathUtils.clamp(this.goalTarget.z + dzWorld, this.bounds.min.y, this.bounds.max.y);
  }

  zoom(factor: number): void {
    this.cancelGlide();
    this.inputEpoch++;
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * factor, this.minDistance, this.maxDistance);
  }

  /**
   * Zoom about a screen point (px from the viewport centre): the ground under it stays put, as under
   * a pinch. The target moves by (1 − f) of the point's offset, f being the clamped distance ratio.
   */
  zoomAt(factor: number, dxPx: number, dyPx: number, viewportHeight: number): void {
    this.cancelGlide();
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
    const g = this.glide;
    if (g) {
      g.t += delta;
      const u = g.dur > 0 ? g.t / g.dur : 1;
      glidePose(g.from, g.to, u, g.lift, this.gp);
      this.target.set(this.gp.x, this.gp.y, this.gp.z);
      this.distance = this.gp.d;
      if (u >= 1) this.glide = null;
      this.sync();
      return;
    }
    const k = 1 - Math.exp(-delta * 6);
    this.target.lerp(this.goalTarget, k);
    this.distance += (this.goalDistance - this.distance) * k;
    this.sync();
  }

  private sync(): void {
    const sb = this.syncedBreath, b0 = this.breath;
    if (this.syncedDistance === this.distance && this.syncedPitch === this.pitch
      && this.syncedYaw === this.yaw && this.syncedTarget.equals(this.target)
      && sb.k === b0.k && sb.dx === b0.dx && sb.dz === b0.dz) return;
    sb.k = b0.k; sb.dx = b0.dx; sb.dz = b0.dz;
    this.syncedDistance = this.distance;
    this.syncedPitch = this.pitch;
    this.syncedYaw = this.yaw;
    this.syncedTarget.copy(this.target);
    const cp = Math.cos(this.pitch);
    const b = this.breath;
    const dist = this.distance * (1 + b.k);
    this.offset.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(dist);
    this.camera.position.set(this.target.x + b.dx, this.target.y, this.target.z + b.dz).add(this.offset);
    this.camera.lookAt(this.target.x + b.dx, this.target.y, this.target.z + b.dz);
    const near = Math.max(1, dist * 0.05), far = dist * 12;
    if (this.camera.near !== near || this.camera.far !== far) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
  }
}
