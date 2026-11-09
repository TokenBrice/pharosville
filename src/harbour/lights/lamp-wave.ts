import * as THREE from "three";

/**
 * THE LAMPLIGHTING WAVE (05-P3, decorative: time of day only). At dusk the lights come on in a slow wave
 * outward from the Pharos (its tower windows top-down first, then the mole, the quays, the town, the
 * riding lights) and at dawn they go out in reverse (the town edge first, the Pharos last). Each light has a
 * RANK 0..1 (distance from the Pharos + a little jitter). Each light SWITCHES ON over a short ramp
 * (`LAMP_RAMP` of glow) once the global uWindowGlow passes its own moment `LAMP_WAVE_START + spread × rank`,
 * then follows the global clock, so at dusk lit and unlit lamps stand apart along the moles while the front walks
 * outward, and full night is unchanged.
 *
 * E26 the visible lamp round: the wave starts at glow 0.45 and ends at 0.85, from about half an hour before sunset
 * into the early blue hour (glow 0.45 → 0.85 is the light the lamps are seen against), and each lamp ignites over
 * 0.002 of glow (seconds to a few tens of seconds of the real clock, so a visitor can watch one catch) instead of
 * fading over minutes. No overshoot and no lamplighter figure. GLSL constants are written with at least four decimals
 * (`glslFloat`): three would turn a smaller ramp into zero.
 *
 * E29 the arrival beat (`uLampArrive`, wake.ts): after the poster the decorative lamps start dark and catch outward
 * in the same rank order, then rest on the clock's true state (1). The Pharos's own fire and beam are analytical
 * light and never read this uniform.
 *
 * D11: the wave and the beat are decorative timing, so no analytical light takes either; each shows its state at once,
 * on the clock's glow alone, at every hour and at the arrival: the storm signal's lanterns (hb_emissive's
 * `uLampAnalytic`, world/materials.ts), the analytical lights' glows (`KindSpec.analytic`: the signal and the keeper's
 * vigil, lights-system.ts `iAna`) and the hulls' peg-reading stern and anchor lamps (fleet/riding-lights.ts `aInfo.w`).
 *
 * Unlit Pharos (PSI unknown): the wave starts from the town edge and reaches the dark tower last
 * (`fromEdge` → 1). Reduced motion: spread 0 → today's single global step.
 *
 * Module-level uniforms (like sky/cloud-shadow's): every consumer binds the same objects; the lights system
 * drives them. The CPU mirror (lampRank / lampGlow) lets other systems (a later lamplighter) read a light's
 * moment; LightsStore.rankOf(id) exposes it per light.
 */
export interface LampWaveParams {
  /** Pharos axis (world x, z) and its foot height. */
  x: number; z: number; footY: number;
  /** Inside this radius (m) a light is on the tower: ranked top-down by height. */
  rMin: number;
  /** Distance (m) at which the rank reaches 1. */
  rMax: number;
  /** Height of the tower top over its foot (m). */
  hTop: number;
  /** Wave length in glow units (0 = the old global step). */
  spread: number;
  /** 0 from the Pharos outward … 1 from the town edge inward (unlit Pharos). */
  fromEdge: number;
}

/** The whole wave in glow units (the first lamp at LAMP_WAVE_START, the last one this much later). */
export const LAMP_WAVE_SPREAD = 0.4;
/** Global glow at which the first (rank 0) lights switch on (E26: about half an hour before sunset). */
export const LAMP_WAVE_START = 0.45;
/** One light's own ignition (glow units): short enough to watch it catch, so lit and unlit read apart. */
export const LAMP_RAMP = 0.002;
/** Share of the rank range the tower's own windows take (they light first, top-down). */
export const TOWER_BAND = 0.06;
const JITTER = 0.04;
/** E29: one lamp's catch as a share of the arrival beat (the beat runs 0 → 1; a lamp of rank r catches at r × (1 − w)). */
export const LAMP_ARRIVE_WIDTH = 0.15;

/** A GLSL float literal with at least four decimals (and as many more as the value needs, up to eight). */
export function glslFloat(v: number): string {
  let digits = 4;
  while (digits < 8 && Number(v.toFixed(digits)) !== v) digits++;
  return v.toFixed(digits);
}

export const lampWaveUniforms = {
  /** x, z Pharos; z spread; w fromEdge */
  uLampWave: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** x rMin, y 1/(rMax - rMin), z foot y, w tower height */
  uLampWaveR: { value: new THREE.Vector4(20, 1 / 400, 0, 92) },
  /** E29 the arrival beat: 0 = every decorative lamp dark … 1 = the clock's true state (the default; wake.ts drives it). */
  uLampArrive: { value: 1 },
};

export function setLampWave(p: LampWaveParams): void {
  lampWaveUniforms.uLampWave.value.set(p.x, p.z, p.spread, p.fromEdge);
  lampWaveUniforms.uLampWaveR.value.set(p.rMin, 1 / Math.max(1, p.rMax - p.rMin), p.footY, p.hTop);
}

export const LAMP_WAVE_GLSL = /* glsl */ `
uniform vec4 uLampWave;
uniform vec4 uLampWaveR;
uniform float uLampArrive;
float hbLampJitter(vec2 xz) { return fract(sin(dot(floor(xz * 2.0), vec2(12.9898, 78.233))) * 43758.5453); }
float hbLampRank(vec3 p, float jitter) {
  float r = length(p.xz - uLampWave.xy);
  float rank = r < uLampWaveR.x
    ? ${glslFloat(TOWER_BAND)} * (1.0 - clamp((p.y - uLampWaveR.z) / max(uLampWaveR.w, 1.0), 0.0, 1.0))
    : ${glslFloat(TOWER_BAND)} + ${glslFloat(1 - TOWER_BAND)} * clamp((r - uLampWaveR.x) * uLampWaveR.y, 0.0, 1.0);
  rank = clamp(rank * ${glslFloat(1 - JITTER)} + jitter * ${glslFloat(JITTER)}, 0.0, 1.0);
  return mix(rank, 1.0 - rank, uLampWave.w);
}
// E29 the arrival beat: a light of this rank catches at its own moment of the beat (1 = the clock's true state)
float hbLampArrive(float rank) {
  if (uLampArrive >= 1.0) return 1.0;
  float a = rank * ${glslFloat(1 - LAMP_ARRIVE_WIDTH)};
  return smoothstep(a, a + ${glslFloat(LAMP_ARRIVE_WIDTH)}, uLampArrive);
}
// the global glow g as seen by a light of this rank: switched on at its own moment, then the global clock
float hbLampGlow(float g, float rank) {
  float arrive = hbLampArrive(rank);
  if (uLampWave.z <= 0.0) return g * arrive;
  float d = ${glslFloat(LAMP_WAVE_START)} + uLampWave.z * rank;
  return smoothstep(d, d + ${glslFloat(LAMP_RAMP)}, g) * g * arrive;
}
`;

const fract = (v: number) => v - Math.floor(v);
/** CPU mirror of hbLampJitter. */
export function lampJitter(x: number, z: number): number {
  return fract(Math.sin(Math.floor(x * 2) * 12.9898 + Math.floor(z * 2) * 78.233) * 43758.5453);
}

/** CPU mirror of hbLampRank. */
export function lampRank(x: number, y: number, z: number, jitter: number, p: LampWaveParams): number {
  const r = Math.hypot(x - p.x, z - p.z);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  let rank = r < p.rMin
    ? TOWER_BAND * (1 - clamp01((y - p.footY) / Math.max(p.hTop, 1)))
    : TOWER_BAND + (1 - TOWER_BAND) * clamp01((r - p.rMin) / Math.max(1, p.rMax - p.rMin));
  rank = clamp01(rank * (1 - JITTER) + jitter * JITTER);
  return rank + (1 - 2 * rank) * p.fromEdge;
}

/** CPU mirror of hbLampArrive. */
export function lampArrive(rank: number, arrive: number): number {
  if (arrive >= 1) return 1;
  const a = rank * (1 - LAMP_ARRIVE_WIDTH);
  const t = Math.min(1, Math.max(0, (arrive - a) / LAMP_ARRIVE_WIDTH));
  return t * t * (3 - 2 * t);
}

/** CPU mirror of hbLampGlow; `arrive` defaults to the live arrival beat, as the shaders read it. */
export function lampGlow(g: number, rank: number, spread: number, arrive = lampWaveUniforms.uLampArrive.value): number {
  const k = lampArrive(rank, arrive);
  if (spread <= 0) return g * k;
  const d = LAMP_WAVE_START + spread * rank;
  const t = Math.min(1, Math.max(0, (g - d) / LAMP_RAMP));
  return t * t * (3 - 2 * t) * g * k;
}
