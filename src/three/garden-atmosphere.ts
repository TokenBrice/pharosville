import { Color, Vector3 } from "three";

/** Compact Sky.js optical-length/phase model, in linear radiance: no LUT,
 * output transform, cloud field or independent colour authority. Twenty metres
 * per authored world unit keeps the inlet clear; kilometre-scale hills recede. */
export const GARDEN_ATMOSPHERE = {
  rayleigh: [0.000116090859925222, 0.000271258228396913, 0.000605318049376498],
  rayleighHeight: 420,
  mieHeight: 62.5,
  mieClear: 0.00004,
  mieVeiled: 0.00048,
  // Energy-normalized forward aerosol stays by the sun, including winter noon.
  g: 0.95,
  radiance: 12,
} as const;

export function writeGardenAtmosphereCoefficients(rayleigh: Vector3, mie: Vector3, clarity: number): void {
  rayleigh.set(...GARDEN_ATMOSPHERE.rayleigh);
  const accepted = Number.isFinite(clarity) ? Math.max(-1, Math.min(1, clarity)) : 0;
  mie.setScalar(GARDEN_ATMOSPHERE.mieClear + (GARDEN_ATMOSPHERE.mieVeiled - GARDEN_ATMOSPHERE.mieClear) * (1 - accepted) * 0.5);
}

export function gardenAtmosphereMean(a: number, b: number, scale: number): number {
  const k = 1 / Math.max(scale, 0.001);
  const dh = k * (b - a);
  if (Math.abs(dh) < 0.001) return Math.exp(-k * (a + b) * 0.5);
  return (Math.exp(-k * a) - Math.exp(-k * b)) / dh;
}

export function gardenAtmosphereOpticalLength(y: number): number {
  const up = Math.max(0, Math.min(1, y));
  const angle = Math.acos(up) * 180 / Math.PI;
  return 1 / Math.max(0.001, up + 0.15 * Math.pow(Math.max(0.001, 93.885 - angle), -1.253));
}

export function gardenAtmosphereRayleighPhase(mu: number): number {
  const m = Math.max(-1, Math.min(1, mu));
  return 0.05968310365946075 * (1 + m * m);
}

export function gardenAtmosphereMiePhase(mu: number): number {
  const g = GARDEN_ATMOSPHERE.g;
  return 0.07957747154594767 * (1 - g * g) / Math.pow(Math.max(0.001, 1 - 2 * g * Math.max(-1, Math.min(1, mu)) + g * g), 1.5);
}

/** Spectral single-scattering source term, evaluated identically per primary. */
function atmosphereSourceChannel(r: number, m: number, rp: number, mp: number, solarLength: number, radiance: number): number {
  return radiance * (r * rp + m * mp) / Math.max(r + m, 1e-8)
    * Math.exp(-(r * GARDEN_ATMOSPHERE.rayleighHeight + m * GARDEN_ATMOSPHERE.mieHeight) * solarLength);
}

/** Source radiance is the infinite eye leg; sky and finite air share it. */
export function writeGardenAtmosphereSource(out: Color, dir: Vector3, sun: Vector3, rayleigh: Vector3, mie: Vector3, radiance = GARDEN_ATMOSPHERE.radiance): Color {
  const mu = Math.max(-1, Math.min(1, dir.dot(sun)));
  const rp = gardenAtmosphereRayleighPhase(mu);
  const mp = gardenAtmosphereMiePhase(mu);
  const solarLength = gardenAtmosphereOpticalLength(sun.y);
  const t = Math.max(0, Math.min(1, (sun.y - 0.08) / 0.37));
  const low = 1 - t * t * (3 - 2 * t);
  return out.setRGB(
    atmosphereSourceChannel(rayleigh.x, mie.x, rp, mp, solarLength * low, radiance),
    atmosphereSourceChannel(rayleigh.y, mie.y, rp, mp, solarLength * low, radiance),
    atmosphereSourceChannel(rayleigh.z, mie.z, rp, mp, solarLength * low, radiance),
  );
}

/** Finite Beer–Lambert eye leg. Heights are clamped at sea level by callers. */
export function writeGardenAtmosphereTransmittance(out: Color, rayleigh: Vector3, mie: Vector3, distance: number, eyeHeight: number, pointHeight: number, veil = 1): Color {
  const path = Math.max(0, distance) * Math.max(0, veil);
  const r = path * gardenAtmosphereMean(Math.max(0, eyeHeight), Math.max(0, pointHeight), GARDEN_ATMOSPHERE.rayleighHeight);
  const m = path * gardenAtmosphereMean(Math.max(0, eyeHeight), Math.max(0, pointHeight), GARDEN_ATMOSPHERE.mieHeight);
  return out.setRGB(Math.exp(-rayleigh.x * r - mie.x * m), Math.exp(-rayleigh.y * r - mie.y * m), Math.exp(-rayleigh.z * r - mie.z * m));
}

export function writeGardenAtmosphereSky(out: Color, dir: Vector3, sun: Vector3, rayleigh: Vector3, mie: Vector3, radiance = GARDEN_ATMOSPHERE.radiance): Color {
  writeGardenAtmosphereSource(out, dir, sun, rayleigh, mie, radiance);
  const slant = gardenAtmosphereOpticalLength(dir.y);
  out.r *= 1 - Math.exp(-slant * (rayleigh.x * GARDEN_ATMOSPHERE.rayleighHeight + mie.x * GARDEN_ATMOSPHERE.mieHeight));
  out.g *= 1 - Math.exp(-slant * (rayleigh.y * GARDEN_ATMOSPHERE.rayleighHeight + mie.y * GARDEN_ATMOSPHERE.mieHeight));
  out.b *= 1 - Math.exp(-slant * (rayleigh.z * GARDEN_ATMOSPHERE.rayleighHeight + mie.z * GARDEN_ATMOSPHERE.mieHeight));
  return out;
}

export const GARDEN_ATMOSPHERE_GLSL = /* glsl */ `
#ifndef GARDEN_ATMOSPHERE_PARS
#define GARDEN_ATMOSPHERE_PARS
const float gardenRayleighHeight = ${GARDEN_ATMOSPHERE.rayleighHeight.toFixed(1)};
const float gardenMieHeight = ${GARDEN_ATMOSPHERE.mieHeight};
float gardenAtmosphereMean(float a, float b, float scale) {
  float k = 1.0 / max(scale, 0.001);
  float dh = k * (b - a);
  if (abs(dh) < 0.001) return exp(-k * (a + b) * 0.5);
  return (exp(-k * a) - exp(-k * b)) / dh;
}
float gardenAtmosphereOpticalLength(float y) {
  float up = clamp(y, 0.0, 1.0);
  float angle = acos(up) * 57.29577951308232;
  return 1.0 / max(0.001, up + 0.15 * pow(max(0.001, 93.885 - angle), -1.253));
}
float gardenAtmosphereRayleighPhase(float mu) {
  mu = clamp(mu, -1.0, 1.0);
  return 0.05968310365946075 * (1.0 + mu * mu);
}
float gardenAtmosphereMiePhase(float mu) {
  return 0.07957747154594767 * (1.0 - ${GARDEN_ATMOSPHERE.g ** 2})
    / pow(max(0.001, 1.0 - ${2 * GARDEN_ATMOSPHERE.g} * clamp(mu, -1.0, 1.0) + ${GARDEN_ATMOSPHERE.g ** 2}), 1.5);
}
vec3 gardenAtmosphereSource(vec3 dir, vec3 sun, vec3 r, vec3 m, float radiance) {
  float mu = clamp(dot(dir, sun), -1.0, 1.0);
  vec3 solarT = exp(-(r * gardenRayleighHeight + m * gardenMieHeight)
    * gardenAtmosphereOpticalLength(sun.y) * (1.0 - smoothstep(0.08, 0.45, sun.y)));
  return radiance * solarT * (r * gardenAtmosphereRayleighPhase(mu) + m * gardenAtmosphereMiePhase(mu)) / max(r + m, vec3(1e-8));
}
vec3 gardenAtmosphereTransmittance(vec3 r, vec3 m, float path, float hc, float hp) {
  return exp(-max(path, 0.0) * (r * gardenAtmosphereMean(max(hc, 0.0), max(hp, 0.0), gardenRayleighHeight)
    + m * gardenAtmosphereMean(max(hc, 0.0), max(hp, 0.0), gardenMieHeight)));
}
vec3 gardenAtmosphereSky(vec3 dir, vec3 sun, vec3 r, vec3 m, float radiance) {
  vec3 T = exp(-(r * gardenRayleighHeight + m * gardenMieHeight) * gardenAtmosphereOpticalLength(dir.y));
  return gardenAtmosphereSource(dir, sun, r, m, radiance) * (1.0 - T);
}
#endif
`;
