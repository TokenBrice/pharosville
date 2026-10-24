import * as THREE from "three";

/**
 * THE LAMPLIGHTING WAVE (05-P3, decorative: time of day only). At dusk the lights come on in a slow wave
 * outward from the Pharos (its tower windows top-down first, then the mole, the quays, the town, the
 * riding lights) and at dawn they go out in reverse (the town edge first, the Pharos last). Each light has a
 * RANK 0..1 (distance from the Pharos + a little jitter). Each light SWITCHES ON over a short ramp
 * (`LAMP_RAMP` of glow) once the global uWindowGlow passes its own moment `LAMP_WAVE_START + spread × rank`,
 * then follows the global clock, so at dusk lit and unlit lamps stand apart along the moles while the front walks
 * outward, and full night is unchanged. The wave sits where dusk is seen: uWindowGlow climbs ~0.3 → 0.7 over the
 * ~45 min around sunset (the glow already creeps up through the afternoon, where a wave would go unseen).
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
/** Global glow at which the first (rank 0) lights switch on. */
export const LAMP_WAVE_START = 0.3;
/** One light's own switch-on ramp (glow units): short, so lit and unlit read apart. */
export const LAMP_RAMP = 0.04;
/** Share of the rank range the tower's own windows take (they light first, top-down). */
export const TOWER_BAND = 0.06;
const JITTER = 0.04;

export const lampWaveUniforms = {
  /** x, z Pharos; z spread; w fromEdge */
  uLampWave: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** x rMin, y 1/(rMax - rMin), z foot y, w tower height */
  uLampWaveR: { value: new THREE.Vector4(20, 1 / 400, 0, 92) },
};

export function setLampWave(p: LampWaveParams): void {
  lampWaveUniforms.uLampWave.value.set(p.x, p.z, p.spread, p.fromEdge);
  lampWaveUniforms.uLampWaveR.value.set(p.rMin, 1 / Math.max(1, p.rMax - p.rMin), p.footY, p.hTop);
}

export const LAMP_WAVE_GLSL = /* glsl */ `
uniform vec4 uLampWave;
uniform vec4 uLampWaveR;
float hbLampJitter(vec2 xz) { return fract(sin(dot(floor(xz * 2.0), vec2(12.9898, 78.233))) * 43758.5453); }
float hbLampRank(vec3 p, float jitter) {
  float r = length(p.xz - uLampWave.xy);
  float rank = r < uLampWaveR.x
    ? ${TOWER_BAND.toFixed(3)} * (1.0 - clamp((p.y - uLampWaveR.z) / max(uLampWaveR.w, 1.0), 0.0, 1.0))
    : ${TOWER_BAND.toFixed(3)} + ${(1 - TOWER_BAND).toFixed(3)} * clamp((r - uLampWaveR.x) * uLampWaveR.y, 0.0, 1.0);
  rank = clamp(rank * ${(1 - JITTER).toFixed(3)} + jitter * ${JITTER.toFixed(3)}, 0.0, 1.0);
  return mix(rank, 1.0 - rank, uLampWave.w);
}
// the global glow g as seen by a light of this rank: switched on at its own moment, then the global clock
float hbLampGlow(float g, float rank) {
  if (uLampWave.z <= 0.0) return g;
  float d = ${LAMP_WAVE_START.toFixed(3)} + uLampWave.z * rank;
  return smoothstep(d, d + ${LAMP_RAMP.toFixed(3)}, g) * g;
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

/** CPU mirror of hbLampGlow. */
export function lampGlow(g: number, rank: number, spread: number): number {
  if (spread <= 0) return g;
  const d = LAMP_WAVE_START + spread * rank;
  const t = Math.min(1, Math.max(0, (g - d) / LAMP_RAMP));
  return t * t * (3 - 2 * t) * g;
}
