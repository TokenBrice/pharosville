/**
 * F-wind: ONE gust field for the whole world (07-M4 cat's-paws, 04-W08, 06-F2, 08-T3, 11 audio).
 *
 * gust(x, z, t, dirX, dirZ) is a 0..1 field of travelling "cat's-paws": patches a hundred-odd metres across,
 * mostly zero between them, drifting DOWNWIND at GUST_SPEED m/s. The same formula is exported as GLSL
 * (GUST_GLSL: `float hbGust(vec2 xz, float t, vec2 dir)`), so the water a patch darkens and the hulls it heels
 * agree to the metre. It is pure and cheap (two sine products, ~20 flops): call it per hull per frame.
 *
 * DECORATIVE: the field's shape carries no data. Consumers scale its EFFECT by the DEWS wind strength they
 * already read (no re-map); `amp` in the service is that strength, for convenience.
 *
 * The 'gust' service (ensureGustService) holds the shared uniform `uGust = (dir x, dir z, amp, time)`:
 * dir = unit DOWNWIND on the ground plane (x, z) from the weather's render wind (uWindVec, the veered wind),
 * amp = DEWS wind strength 0..1, time = a clock that eases to a stop under reduced motion (the field then
 * holds still). tick(ctx, frame) advances it at most once per frame; every consumer calls it first.
 */
import * as THREE from "three";
import type { EngineContext, FrameState } from "../engine/types";
import { ensureMotionService, MotionClock } from "../ui/services";

/** How fast the paws travel downwind (m/s): a breeze's cat's-paws run at roughly half the wind speed. */
export const GUST_SPEED = 6;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The gust field at (x, z) and time t (s): 0 in the lulls … 1 in the heart of a paw. dir = unit downwind. */
export function gust(x: number, z: number, t: number, dirX: number, dirZ: number): number {
  const u = x * dirX + z * dirZ - GUST_SPEED * t;
  const v = -x * dirZ + z * dirX;
  const n = 0.6 * Math.sin(u * 0.021 + 1.6 * Math.sin(v * 0.0093 + 0.4)) * Math.sin(v * 0.017 + 1.1 * Math.sin(u * 0.012))
    + 0.4 * Math.sin(u * 0.034 - v * 0.013 + 2.1) * Math.sin(v * 0.027 + u * 0.008);
  return smooth(0.12, 0.6, n);
}

/** GLSL twin of gust(): identical constants (keep them in step; gust.test.ts guards the CPU side). */
export const GUST_GLSL = /* glsl */ `
float hbGust(vec2 xz, float t, vec2 dir) {
  float u = dot(xz, dir) - ${GUST_SPEED.toFixed(1)} * t;
  float v = -xz.x * dir.y + xz.y * dir.x;
  float n = 0.6 * sin(u * 0.021 + 1.6 * sin(v * 0.0093 + 0.4)) * sin(v * 0.017 + 1.1 * sin(u * 0.012))
          + 0.4 * sin(u * 0.034 - v * 0.013 + 2.1) * sin(v * 0.027 + u * 0.008);
  return smoothstep(0.12, 0.6, n);
}
`;

export interface GustService {
  /** (dir x, dir z, amp, time): bind it into any material that includes GUST_GLSL. */
  readonly uniform: THREE.IUniform<THREE.Vector4>;
  /** Advance once per frame (idempotent within a frame). */
  tick(ctx: EngineContext, frame: FrameState): void;
  /** The field now, with the service's direction and time (0..1, NOT scaled by amp). */
  at(x: number, z: number): number;
  readonly dirX: number;
  readonly dirZ: number;
  /** DEWS wind strength 0..1 (the sim's), for scaling effects. */
  readonly amp: number;
  readonly time: number;
}

interface WindSource { wind?: { fromRad: number; strength: number } }

export function ensureGustService(ctx: EngineContext): GustService {
  const hit = ctx.services.get("gust") as GustService | undefined;
  if (hit) return hit;
  const clock = new MotionClock(ensureMotionService(ctx));
  const u = { value: new THREE.Vector4(0.6, 0.8, 0.35, 0) };
  let last = -1;
  const svc = {
    uniform: u, dirX: 0.6, dirZ: 0.8, amp: 0.35, time: 0,
    tick(c: EngineContext, frame: FrameState) {
      if (frame.elapsed === last) return;
      last = frame.elapsed;
      const sim = c.services.get("sim") as WindSource | undefined;
      const wv = c.uniforms.uWindVec?.value;
      let dx: number, dz: number;
      if (wv && Math.hypot(wv.x, wv.y) > 1e-3) { const l = Math.hypot(wv.x, wv.y); dx = wv.x / l; dz = wv.y / l; }
      else { const to = (sim?.wind?.fromRad ?? -2.35) + Math.PI; dx = Math.sin(to); dz = Math.cos(to); }
      svc.dirX = dx; svc.dirZ = dz;
      svc.amp = sim?.wind?.strength ?? 0.35;
      svc.time = clock.step(Math.max(0, frame.delta));
      u.value.set(dx, dz, svc.amp, svc.time);
    },
    at(x: number, z: number) { return gust(x, z, svc.time, svc.dirX, svc.dirZ); },
  };
  ctx.services.set("gust", svc);
  return svc;
}
