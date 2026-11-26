import { SWELL_DIR, WAVES } from "../waves";

/**
 * 3-cascade WebGL2 ocean wave spectrum (Phase 2 Workstream A, §5.1).
 *
 * Implements JONSWAP peak-enhanced frequency spectrum (Hasselmann 1973, γ = 3.3, σ = 0.07/0.09,
 * Mediterranean fetch F = 85 km) × Mitsuyasu/Hasselmann directional spreading + capillary high-k
 * cutoff + soft 2D Gaussian notch around phase-locked WAVES[0] on C0 so energy never double-counts.
 *
 * Mutually coprime cascade patch lengths [509, 97, 17.3] m eliminate spatial tiling while cleanly
 * partitioning wavenumber space with complementary smoothstep transitions (zero band overlap).
 *
 * Bit-exact 32-bit integer hashing (`hashU32`) keyed by signed integer wavenumber `(kxIdx, kzIdx)`
 * guarantees identical complex Gaussian Fourier seeds across GPU High (256²), GPU Medium (128²),
 * and the CPU 64² buoyancy mirror (`cpu-mirror.ts`), locking boat heave/pitch/roll to GPU swells.
 *
 * Spectrum packing for the 2× RGBA MRT Stockham butterfly pass (8 real spatial fields in 4 complex channels):
 * - `out0.rg`: c0 = A_dy  + i * A_dx  → IFFT Re = dy,  Im = dx
 * - `out0.ba`: c1 = A_dz  + i * A_sx  → IFFT Re = dz,  Im = ∂y/∂x
 * - `out1.rg`: c2 = A_sz  + i * A_dxx → IFFT Re = ∂y/∂z, Im = ∂(dx)/∂x
 * - `out1.ba`: c3 = A_dzz + i * A_dxz → IFFT Re = ∂(dz)/∂z, Im = ∂(dx)/∂z
 *
 * Gerstner/Tessendorf sign convention (matches `waves.ts`):
 * - `A_dx = +i (kx/|k|) H`, `A_dz = +i (kz/|k|) H` pulls water toward wave crests (sharpening crests).
 * - `A_dxx = -(kx²/|k|) H`, `A_dzz = -(kz²/|k|) H`, `A_dxz = -(kx·kz/|k|) H` are negative on crests,
 *   so horizontal Jacobian `J_det = (1 + chop·dxx)(1 + chop·dzz) - (chop·dxz)²` drops below 1 at
 *   steep crests (< 0.55 = physical crest folding / breaking foam) and exceeds 1 in troughs.
 */

export const FFT_PATCH_SIZES = [509, 97, 17.3] as const;
export const FFT_W0_K = (2 * Math.PI) / 62;
export const FFT_GRAVITY = 9.81;
export const FFT_KM = 370.0;
export const FFT_FETCH_M = 85_000.0;
/** Periodic phase loop (s) keeping float32 `omega * uTime` crisp over multi-day sessions. */
export const FFT_TIME_LOOP_S = 3600.0;

/**
 * Strictly complementary wavenumber bands `[kLow, kHigh]` (rad/m) for C0 / C1 / C2.
 * Adjacent bands crossfade symmetrically (`smoothstep(0.85b, 1.15b, k)` + `1 - smoothstep(0.85b, 1.15b, k) === 1`),
 * conserving total spectral variance without double-counting across boundaries.
 */
export const FFT_CASCADE_BANDS: readonly (readonly [number, number])[] = [
  [0.008, 0.50],
  [0.50, 3.0],
  [3.0, 52.0],
] as const;

export const FFT_CASCADE_SEEDS = [0x13579bdf, 0x2468ace1, 0x369cf258] as const;

const W0_K_GLSL = FFT_W0_K.toFixed(6);
const W0_DIR_X_GLSL = SWELL_DIR[0].toFixed(6);
const W0_DIR_Z_GLSL = SWELL_DIR[1].toFixed(6);

/** Shared GLSL3 fullscreen-triangle vertex shader for all internal FFT passes. */
export const FFT_FULLSCREEN_VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Pass 1 (`hb_fft_h0`, GLSL3 single RGBA target): bakes time-invariant `h0(k)` and `conj(h0(-k))`
 * into `(h0.re, h0.im, h0_neg_conj.re, h0_neg_conj.im)`. Regenerated only on wind/resolution change.
 */
export const FFT_H0_FRAG = /* glsl */ `
uniform int uSize;
uniform float uPatchSize;
uniform float uWindSpeed;
uniform vec2 uWindDir;
uniform vec2 uBandK;
uniform float uNotchStrength;
uniform uint uSeed;

layout(location = 0) out vec4 out0;

const float PI = 3.1415926535897932;
const float TWO_PI = 6.2831853071795865;
const float GRAV = 9.81;
const float KM = 370.0;
const float FETCH_M = 85000.0;
const float W0_K = ${W0_K_GLSL};
const vec2 W0_DIR = vec2(${W0_DIR_X_GLSL}, ${W0_DIR_Z_GLSL});

uint hashU32(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

vec2 gaussRand(int kxi, int kzi, uint seed) {
  uint packed = (uint(kxi) & 0xffffu) | ((uint(kzi) & 0xffffu) << 16u);
  uint h0 = hashU32(packed ^ (seed * 0x9e3779b1u));
  uint h1 = hashU32(h0 ^ 0x27d4eb2du);
  float u1 = max((float(h0 >> 8u) + 0.5) / 16777216.0, 1e-7);
  float u2 = (float(h1 >> 8u) + 0.5) / 16777216.0;
  float mag = sqrt(-2.0 * log(u1));
  float ang = TWO_PI * u2;
  return vec2(mag * cos(ang), mag * sin(ang));
}

float spectrumPsi(vec2 kVec, float kNyq) {
  float k = length(kVec);
  if (k < 1e-5) return 0.0;

  float kRatio = k / KM;
  float kRatio2 = kRatio * kRatio;
  float omega = sqrt(GRAV * k * (1.0 + kRatio2));
  float dOmegaDk = GRAV * (1.0 + 3.0 * kRatio2) / max(2.0 * omega, 1e-5);

  float u10 = clamp(uWindSpeed, 2.5, 28.0);
  float fDim = GRAV * FETCH_M / (u10 * u10);
  float alpha = 0.076 * pow(max(fDim, 1.0), -0.22);
  float omegaP = 22.0 * pow(max((GRAV * GRAV) / (u10 * FETCH_M), 1e-9), 0.33333333);

  float mu = omega / max(omegaP, 1e-4);
  float invMu = 1.0 / max(mu, 1e-3);
  float invMu2 = invMu * invMu;
  float invMu4 = invMu2 * invMu2;
  float sigma = omega <= omegaP ? 0.07 : 0.09;
  float dr = (omega - omegaP) / max(sigma * omegaP, 1e-5);
  float peakExp = exp(-0.5 * dr * dr);
  float omega2 = omega * omega;
  float omega5 = omega2 * omega2 * omega;
  float sJonswap = (alpha * GRAV * GRAV / max(omega5, 1e-8)) * exp(-1.25 * invMu4) * pow(3.3, peakExp);

  vec2 kDir = kVec / k;
  float cosT = clamp(dot(kDir, uWindDir), -1.0, 1.0);
  float halfCos = sqrt(max(0.5 * (1.0 + cosT), 0.0));
  float sParam;
  if (mu <= 1.0) {
    sParam = 6.97 * pow(max(mu, 0.05), 4.06);
  } else {
    float expHigh = -2.33 - 1.45 * (u10 * omegaP / GRAV - 1.17);
    sParam = 9.77 * pow(mu, expHigh);
  }
  sParam = clamp(sParam, 1.0, 16.0);
  float qNorm = 0.28209479 * sqrt(sParam + 0.25 + 1.0 / (32.0 * (sParam + 0.25)));
  float dSpread = qNorm * pow(max(halfCos, 0.0), 2.0 * sParam);
  float dirWeight = mix(dSpread, 0.15915494, 0.06);

  float capCut = exp(-k * k * 0.0016);
  float bandLo = smoothstep(uBandK.x * 0.85, uBandK.x * 1.15, k);
  float bandHi = 1.0 - smoothstep(uBandK.y * 0.85, uBandK.y * 1.15, k);
  float nyqCut = 1.0 - smoothstep(kNyq * 0.78, kNyq * 0.96, k);

  float notch = 1.0;
  if (uNotchStrength > 0.001) {
    float kr = (k - W0_K) / (0.38 * W0_K);
    float angCos = clamp(dot(kDir, W0_DIR), -1.0, 1.0);
    float dAng = acos(angCos) / 0.42;
    notch = 1.0 - 0.88 * uNotchStrength * exp(-(kr * kr + dAng * dAng));
  }

  return max(sJonswap * dOmegaDk / k * dirWeight * capCut * bandLo * bandHi * nyqCut * notch, 0.0);
}

vec2 sampleH0(int kxi, int kzi, float dk, float kNyq) {
  int halfN = uSize >> 1;
  if ((kxi == 0 && kzi == 0) || kxi == -halfN || kzi == -halfN || kxi == halfN || kzi == halfN) {
    return vec2(0.0);
  }
  vec2 kVec = vec2(float(kxi), float(kzi)) * dk;
  float psi = spectrumPsi(kVec, kNyq);
  float amp = 0.5 * sqrt(psi * dk * dk);
  return gaussRand(kxi, kzi, uSeed) * amp;
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  int halfN = uSize >> 1;
  int kxi = coord.x < halfN ? coord.x : coord.x - uSize;
  int kzi = coord.y < halfN ? coord.y : coord.y - uSize;
  float dk = TWO_PI / uPatchSize;
  float kNyq = PI * float(uSize) / uPatchSize;

  vec2 h0Pos = sampleH0(kxi, kzi, dk, kNyq);
  vec2 h0Neg = sampleH0(-kxi, -kzi, dk, kNyq);
  out0 = vec4(h0Pos, h0Neg.x, -h0Neg.y);
}
`;

/**
 * Pass 2 (`hb_fft_spec`, GLSL3 2× RGBA MRT): advances `h(k, t)` by gravity-capillary dispersion
 * and packs all 8 real spatial derivative fields into 4 complex channels across `out0` & `out1`.
 */
export const FFT_SPEC_FRAG = /* glsl */ `
uniform sampler2D uH0Tex;
uniform int uSize;
uniform float uPatchSize;
uniform float uTime;
uniform float uSeaAmp;

layout(location = 0) out vec4 out0;
layout(location = 1) out vec4 out1;

const float TWO_PI = 6.2831853071795865;
const float GRAV = 9.81;
const float KM = 370.0;

vec2 packComplex(vec2 a, vec2 b) {
  return vec2(a.x - b.y, a.y + b.x);
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  int halfN = uSize >> 1;
  int kxi = coord.x < halfN ? coord.x : coord.x - uSize;
  int kzi = coord.y < halfN ? coord.y : coord.y - uSize;

  if ((kxi == 0 && kzi == 0) || kxi == -halfN || kzi == -halfN || uSeaAmp <= 1e-6) {
    out0 = vec4(0.0);
    out1 = vec4(0.0);
    return;
  }

  float dk = TWO_PI / uPatchSize;
  vec2 kVec = vec2(float(kxi), float(kzi)) * dk;
  float k = length(kVec);
  float kRatio = k / KM;
  float omegaRaw = sqrt(GRAV * k * (1.0 + kRatio * kRatio));
  const float W_BASE = TWO_PI / 3600.0;
  float omega = max(floor(omegaRaw / W_BASE + 0.5), 1.0) * W_BASE;

  vec4 h0Data = texelFetch(uH0Tex, coord, 0);
  vec2 h0k = h0Data.xy;
  vec2 h0mkConj = h0Data.zw;
  float wt = omega * mod(uTime, 3600.0);
  float c = cos(wt);
  float s = sin(wt);

  vec2 H = vec2(
    h0k.x * c + h0k.y * s + h0mkConj.x * c - h0mkConj.y * s,
    h0k.y * c - h0k.x * s + h0mkConj.y * c + h0mkConj.x * s
  ) * uSeaAmp;

  float invK = 1.0 / k;
  float kxN = kVec.x * invK;
  float kzN = kVec.y * invK;

  vec2 iH = vec2(-H.y, H.x);
  vec2 aDy = H;
  vec2 aDx = iH * kxN;
  vec2 aDz = iH * kzN;
  vec2 aSx = iH * kVec.x;
  vec2 aSz = iH * kVec.y;
  vec2 aDxx = H * (-(kVec.x * kxN));
  vec2 aDzz = H * (-(kVec.y * kzN));
  vec2 aDxz = H * (-(kVec.x * kzN));

  out0 = vec4(packComplex(aDy, aDx), packComplex(aDz, aSx));
  out1 = vec4(packComplex(aSz, aDxx), packComplex(aDzz, aDxz));
}
`;

/** Bit-exact 32-bit unsigned integer hash shared between GLSL3 `FFT_H0_FRAG` and CPU mirror. */
export function hashU32(x: number): number {
  let h = x >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/**
 * CPU twin of `gaussRand` in `FFT_H0_FRAG`: writes two standard normal variates `(xiR, xiI)`
 * into `out[offset], out[offset + 1]` bit-identically to the GPU hash.
 */
export function gaussRandAt(kxi: number, kzi: number, seed: number, out: [number, number]): void {
  const packed = ((kxi & 0xffff) | ((kzi & 0xffff) << 16)) >>> 0;
  const h0 = hashU32((packed ^ Math.imul(seed >>> 0, 0x9e3779b1)) >>> 0);
  const h1 = hashU32((h0 ^ 0x27d4eb2d) >>> 0);
  const u1 = Math.max(((h0 >>> 8) + 0.5) / 16777216.0, 1e-7);
  const u2 = ((h1 >>> 8) + 0.5) / 16777216.0;
  const mag = Math.sqrt(-2.0 * Math.log(u1));
  const ang = 2.0 * Math.PI * u2;
  out[0] = mag * Math.cos(ang);
  out[1] = mag * Math.sin(ang);
}

/** Gravity-capillary deep-water dispersion angular frequency ω(k) (rad/s). */
export function dispersionOmega(k: number): number {
  const kr = k / FFT_KM;
  return Math.sqrt(FFT_GRAVITY * k * (1.0 + kr * kr));
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * CPU twin of `spectrumPsi` in `FFT_H0_FRAG`: evaluates 2D directional JONSWAP spectral density
 * Ψ(kx, kz) including capillary cutoff, cascade band-pass, Nyquist taper, and `WAVES[0]` soft notch.
 */
export function evaluateSpectrumPsi(
  kx: number,
  kz: number,
  windSpeed: number,
  windDirX: number,
  windDirZ: number,
  bandLow: number,
  bandHigh: number,
  kNyq: number,
  notchStrength: number,
): number {
  const k = Math.hypot(kx, kz);
  if (k < 1e-5) return 0;

  const kRatio = k / FFT_KM;
  const kRatio2 = kRatio * kRatio;
  const omega = Math.sqrt(FFT_GRAVITY * k * (1.0 + kRatio2));
  const dOmegaDk = (FFT_GRAVITY * (1.0 + 3.0 * kRatio2)) / Math.max(2.0 * omega, 1e-5);

  const u10 = clamp(windSpeed, 2.5, 28.0);
  const fDim = (FFT_GRAVITY * FFT_FETCH_M) / (u10 * u10);
  const alpha = 0.076 * Math.pow(Math.max(fDim, 1.0), -0.22);
  const omegaP = 22.0 * Math.pow(Math.max((FFT_GRAVITY * FFT_GRAVITY) / (u10 * FFT_FETCH_M), 1e-9), 1 / 3);

  const mu = omega / Math.max(omegaP, 1e-4);
  const invMu = 1.0 / Math.max(mu, 1e-3);
  const invMu2 = invMu * invMu;
  const invMu4 = invMu2 * invMu2;
  const sigma = omega <= omegaP ? 0.07 : 0.09;
  const dr = (omega - omegaP) / Math.max(sigma * omegaP, 1e-5);
  const peakExp = Math.exp(-0.5 * dr * dr);
  const omega2 = omega * omega;
  const omega5 = omega2 * omega2 * omega;
  const sJonswap =
    ((alpha * FFT_GRAVITY * FFT_GRAVITY) / Math.max(omega5, 1e-8)) *
    Math.exp(-1.25 * invMu4) *
    Math.pow(3.3, peakExp);

  const invK = 1.0 / k;
  const kDirX = kx * invK;
  const kDirZ = kz * invK;
  const cosT = clamp(kDirX * windDirX + kDirZ * windDirZ, -1.0, 1.0);
  const halfCos = Math.sqrt(Math.max(0.5 * (1.0 + cosT), 0.0));
  let sParam: number;
  if (mu <= 1.0) {
    sParam = 6.97 * Math.pow(Math.max(mu, 0.05), 4.06);
  } else {
    const expHigh = -2.33 - 1.45 * ((u10 * omegaP) / FFT_GRAVITY - 1.17);
    sParam = 9.77 * Math.pow(mu, expHigh);
  }
  sParam = clamp(sParam, 1.0, 16.0);
  const qNorm = 0.28209479 * Math.sqrt(sParam + 0.25 + 1.0 / (32.0 * (sParam + 0.25)));
  const dSpread = qNorm * Math.pow(Math.max(halfCos, 0.0), 2.0 * sParam);
  const dirWeight = dSpread * 0.94 + 0.15915494 * 0.06;

  const capCut = Math.exp(-k * k * 0.0016);
  const bandLo = smoothstep(bandLow * 0.85, bandLow * 1.15, k);
  const bandHi = 1.0 - smoothstep(bandHigh * 0.85, bandHigh * 1.15, k);
  const nyqCut = 1.0 - smoothstep(kNyq * 0.78, kNyq * 0.96, k);

  let notch = 1.0;
  if (notchStrength > 0.001) {
    const kr = (k - FFT_W0_K) / (0.38 * FFT_W0_K);
    const angCos = clamp(kDirX * SWELL_DIR[0] + kDirZ * SWELL_DIR[1], -1.0, 1.0);
    const dAng = Math.acos(angCos) / 0.42;
    notch = 1.0 - 0.88 * notchStrength * Math.exp(-(kr * kr + dAng * dAng));
  }

  const val = ((sJonswap * dOmegaDk) / k) * dirWeight * capCut * bandLo * bandHi * nyqCut * notch;
  return val > 0 ? val : 0;
}

/** Check `WAVES[0].k` matches `FFT_W0_K` (keeps module import live and verified). */
export const FFT_W0_WAVELENGTH = WAVES[0].length;
