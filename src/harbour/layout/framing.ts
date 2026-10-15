import * as THREE from "three";
import type { CameraPreset } from "../engine/camera-rig";
import type { HarbourLayout, Vec3 } from "./types";

/**
 * Aspect-aware framing for squarer and portrait screens (unfolded foldables, tablets).
 *
 * The layout's camera presets are composed for ~16:10. Narrower than FIT_BELOW_ASPECT the preset is
 * refitted so the hero composition (the Pharos with its statue, the harbour mouth, the Customs House
 * and the Mint) keeps the horizontal room it has at FIT_BELOW_ASPECT: the camera backs off along its
 * own line of sight and, the narrower the screen, the more the hero is centred. At or above
 * FIT_BELOW_ASPECT the preset is returned untouched, so the 16:10 framing never changes, and the fit
 * is continuous at the threshold.
 */
export const FIT_BELOW_ASPECT = 1.4;
/** Fully centred at or below this aspect (squarer than ~6:5: unfolded foldables, portrait tablets). */
const CENTRE_AT_ASPECT = 1.2;
/** Centred, the hero keeps this much of the half-width (NDC) clear of the edges. */
const MARGIN_X = 0.7;
/** The Pharos stands ≈100 m to its statue. */
const PHAROS_HEIGHT = 100;

/** The hero composition's anchor points, from the layout. */
export function heroPoints(layout: HarbourLayout): Vec3[] {
  const lm = (id: string) => layout.landmarks.find((l) => l.id === id)?.position;
  const civic = (layout as { civic?: Array<{ kind: string; position: Vec3 }> }).civic ?? [];
  const pts: Vec3[] = [];
  const pharos = lm("pharos"), mouth = lm("breakwater"), customs = lm("customs-house");
  const mint = civic.find((c) => c.kind === "mint")?.position;
  if (pharos) pts.push([pharos[0], pharos[1], pharos[2]], [pharos[0], pharos[1] + PHAROS_HEIGHT, pharos[2]]);
  if (mouth) pts.push([mouth[0], mouth[1], mouth[2]]);
  if (pharos && mouth) pts.push([(pharos[0] + mouth[0]) / 2, 0, (pharos[2] + mouth[2]) / 2]);
  if (customs) pts.push([customs[0], customs[1] + 20, customs[2]]);
  if (mint) pts.push([mint[0], mint[1] + 12, mint[2]]);
  return pts;
}

const cam = new THREE.PerspectiveCamera();
const v = new THREE.Vector3();

/** NDC bounds of `pts` seen from preset `p` at `aspect`. */
function bounds(p: CameraPreset, aspect: number, pts: readonly Vec3[]): { x0: number; x1: number; y0: number; y1: number } {
  const yaw = THREE.MathUtils.degToRad(p.yawDeg), pitch = THREE.MathUtils.degToRad(p.pitchDeg);
  cam.fov = p.fovDeg; cam.aspect = aspect; cam.near = 1; cam.far = 20000;
  cam.updateProjectionMatrix();
  cam.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    .multiplyScalar(p.distance).add(v.set(...p.target));
  cam.lookAt(v.set(...p.target));
  cam.updateMatrixWorld(true);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const q of pts) {
    v.set(q[0], q[1], q[2]).project(cam);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  return { x0, x1, y0, y1 };
}

/** The preset refitted for `aspect` (see the module note); the preset itself when no fit is needed. */
export function fitPresetToAspect(p: CameraPreset, aspect: number, pts: readonly Vec3[]): CameraPreset {
  if (!(aspect > 0) || aspect >= FIT_BELOW_ASPECT || pts.length < 2) return p;
  const ref = bounds(p, FIT_BELOW_ASPECT, pts);
  const centre = THREE.MathUtils.clamp((FIT_BELOW_ASPECT - aspect) / (FIT_BELOW_ASPECT - CENTRE_AT_ASPECT), 0, 1);
  // the hero's horizontal room at the threshold, eased toward a margin as it is centred
  const refX = Math.max(Math.abs(ref.x0), Math.abs(ref.x1));
  const roomX = refX + (Math.min(refX, MARGIN_X) - refX) * centre;
  const roomY = Math.max(0.9, Math.abs(ref.y0), Math.abs(ref.y1));
  const yaw = THREE.MathUtils.degToRad(p.yawDeg);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(p.fovDeg) / 2);

  // at distance d: shift the target along screen-right toward the hero's centre, then measure
  const at = (d: number): { preset: CameraPreset; fits: boolean } => {
    const q: CameraPreset = { ...p, target: [...p.target], distance: d };
    for (let i = 0; i < 3; i++) {
      const b = bounds(q, aspect, pts);
      const shift = centre * ((b.x0 + b.x1) / 2) * d * tanHalf * aspect;
      q.target = [q.target[0] + Math.cos(yaw) * shift, q.target[1], q.target[2] - Math.sin(yaw) * shift];
    }
    const b = bounds(q, aspect, pts);
    return { preset: q, fits: Math.max(Math.abs(b.x0), Math.abs(b.x1)) <= roomX + 1e-3 && Math.max(Math.abs(b.y0), Math.abs(b.y1)) <= roomY + 1e-3 };
  };

  const near = at(p.distance);
  if (near.fits) return near.preset;
  let lo = p.distance, hi = p.distance * 3;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid).fits) hi = mid; else lo = mid;
  }
  const out = at(hi).preset;
  out.distance = Math.round(out.distance);
  return out;
}
