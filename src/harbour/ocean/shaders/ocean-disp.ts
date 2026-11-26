import { WAVES, wavesGLSL } from "../waves";

/**
 * Shared water-riding wave displacement & bathymetric shoaling GLSL (`ocean-disp.ts`, Phase 2 §5.1 / §5.2 / H11).
 *
 * Included by `OCEAN_VERT`, `WakeCollars`, `ChartLettering`, and `CausticsPass` so every water-riding surface
 * tracks the exact same hybrid displacement:
 * - On High/Medium (`uFftOn > 0.5`, `#ifndef HB_LITE`): phase-locked `WAVES[0]` swell + 3-cascade WebGL2 FFT
 *   displacement from `uFftAtlas` layers `0..2`, with shallow-water dispersion shoaling (`c_ratio = sqrt(tanh(k*d))`),
 *   wavelength compression along `-shoreN`, Snell wave-front wrapping around the Pharos islet / Wreck Cove / Shoals,
 *   and crest steepening that damps cleanly to 0 before dry beach/quays.
 * - On Low (`#ifdef HB_LITE`) or `&extras=-fft` (`uFftOn <= 0.5`): falls back seamlessly to full 5-wave `gerstnerDisp`.
 *
 * Strictly B07 / C04 compliant: ascending `smoothstep` edges only, squaring by multiplication.
 */

const w0 = WAVES[0]!;
const f = (v: number) => v.toFixed(6);
const QA0 = (w0.steep / (w0.k * WAVES.length)).toFixed(6);

/** Uniform declarations shared by every shader that reads `uFftAtlas`. */
export const FFT_UNIFORMS_GLSL = /* glsl */ `
#ifndef HB_LITE
uniform highp sampler2DArray uFftAtlas;
#endif
uniform float uFftOn;
uniform vec4 uFftScales;
uniform vec4 uFftWeights;
`;

export function shoalCoordsCpu(
  x: number,
  z: number,
  depth: number,
  coast: number,
  snx: number,
  snz: number,
  out: [number, number, number],
): [number, number, number] {
  const kd = Math.max(depth, 0.35) * 0.14;
  const e2 = Math.exp(-2 * Math.min(Math.max(kd, 0), 10));
  const cRatio = Math.sqrt(Math.max((1 - e2) / (1 + e2), 0.04));
  const s0 = Math.min(1, Math.max(0, (coast + 0.5) / 14.5));
  const s1 = Math.min(1, Math.max(0, (coast - 18) / 38));
  const shoalK = (1 - cRatio) * (s0 * s0 * (3 - 2 * s0)) * (1 - s1 * s1 * (3 - 2 * s1));
  let sx = x;
  let sz = z;
  const snLen = Math.hypot(snx, snz);
  if (shoalK > 0 && snLen > 1e-4) {
    const ux = snx / snLen;
    const uz = snz / snLen;
    const cLoc = Math.min(28, Math.max(0, coast));
    const uShift = Math.max(28 - cLoc, 0) * shoalK * Math.min(snLen, 1);
    const mx = w0.dirX + (-ux - w0.dirX) * 0.42;
    const mz = w0.dirZ + (-uz - w0.dirZ) * 0.42;
    const ml = Math.hypot(mx, mz) || 1;
    const rpx = mx / ml - w0.dirX;
    const rpz = mz / ml - w0.dirZ;
    sx = x + ux * (-0.28 * uShift) + rpx * (0.20 * uShift);
    sz = z + uz * (-0.28 * uShift) + rpz * (0.20 * uShift);
  }
  out[0] = sx;
  out[1] = sz;
  out[2] = shoalK;
  return out;
}

/** Bathymetric shoaling + hybrid FFT/WAVES[0]/Gerstner displacement helpers. */
export const OCEAN_DISP_GLSL = /* glsl */ `
${wavesGLSL()}
${FFT_UNIFORMS_GLSL}
vec3 hbSwell0Disp(vec2 p, float t, float amp) {
  float ph = ${f(w0.k)} * dot(vec2(${f(w0.dirX)}, ${f(w0.dirZ)}), p) - ${f(w0.w)} * t;
  float c = cos(ph), s = sin(ph);
  return vec3(${QA0} * ${f(w0.dirX)} * c * amp, ${f(w0.amp)} * s * amp, ${QA0} * ${f(w0.dirZ)} * c * amp);
}
float hbTanhPos(float x) {
  float e2 = exp(-2.0 * min(max(x, 0.0), 10.0));
  return (1.0 - e2) / (1.0 + e2);
}
vec2 hbShoreNormal(sampler2D sdfTex, vec2 suv, float coast, float inside) {
  vec2 n = vec2(0.0);
  if (coast < 56.0 && inside > 0.5) {
    const float eS = 0.004;
    float gx = textureLod(sdfTex, clamp(suv + vec2(eS, 0.0), 0.0, 1.0), 2.0).r - textureLod(sdfTex, clamp(suv - vec2(eS, 0.0), 0.0, 1.0), 2.0).r;
    float gz = textureLod(sdfTex, clamp(suv + vec2(0.0, eS), 0.0, 1.0), 2.0).r - textureLod(sdfTex, clamp(suv - vec2(0.0, eS), 0.0, 1.0), 2.0).r;
    float gl = length(vec2(gx, gz));
    if (gl > 1e-4) n = (vec2(gx, gz) / gl) * smoothstep(0.002, 0.008, gl);
  }
  return n;
}
void hbShoalCoords(vec2 xz, float depth, float coast, vec2 shoreN, out vec2 xzShoal, out float shoalK) {
  float kd = max(depth, 0.35) * 0.14;
  float cRatio = sqrt(max(hbTanhPos(kd), 0.04));
  shoalK = (1.0 - cRatio) * smoothstep(-0.5, 14.0, coast) * (1.0 - smoothstep(18.0, 56.0, coast));
  xzShoal = xz;
  float snLen = length(shoreN);
  if (shoalK > 0.0 && snLen > 1e-4) {
    vec2 snDir = shoreN / snLen;
    float uShift = max(28.0 - clamp(coast, 0.0, 28.0), 0.0) * shoalK * min(snLen, 1.0);
    vec2 swDir = vec2(${f(w0.dirX)}, ${f(w0.dirZ)});
    vec2 refrPull = normalize(mix(swDir, -snDir, 0.42)) - swDir;
    xzShoal = xz + snDir * (-0.28 * uShift) + refrPull * (0.20 * uShift);
  }
}
vec3 hbOceanDisp(vec2 xz, float t, float amp, float damp, float camD, float depth, float coast, vec2 shoreN) {
  #ifndef HB_LITE
  if (uFftOn > 0.5) {
    vec2 xzS;
    float shoalK;
    hbShoalCoords(xz, depth, coast, shoreN, xzS, shoalK);
    float farFade = 1.0 - smoothstep(2400.0, 5200.0, camD);
    float c1Fade = 1.0 - smoothstep(420.0, 1450.0, camD);
    float c2Fade = 1.0 - smoothstep(120.0, 360.0, camD);
    float vLod = clamp(log2(max(camD / 280.0, 1.0)), 0.0, 3.0);
    float shoreDamp = damp * smoothstep(0.0, 2.8, max(coast, 0.0));
    float steepBoost = mix(1.0, 1.32, shoalK);
    vec3 d0 = textureLod(uFftAtlas, vec3(xzS * uFftScales.x, 0.0), vLod).xyz * uFftWeights.x * farFade;
    vec3 d1 = c1Fade > 0.002 ? textureLod(uFftAtlas, vec3(xzS * uFftScales.y, 1.0), vLod).xyz * uFftWeights.y * c1Fade : vec3(0.0);
    vec3 d2 = c2Fade > 0.002 ? textureLod(uFftAtlas, vec3(xz * uFftScales.z, 2.0), 0.0).xyz * uFftWeights.z * c2Fade : vec3(0.0);
    vec3 fftD = (d0 + d1 + d2) * shoreDamp;
    fftD.y *= steepBoost;
    vec3 sw0 = hbSwell0Disp(xzS, t, amp * uFftWeights.w);
    sw0.y *= mix(1.0, 1.24, shoalK);
    return sw0 + fftD;
  }
  #endif
  return gerstnerDisp(xz, t, amp);
}
`;
