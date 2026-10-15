/**
 * Gerstner swell table shared by the GPU (generated GLSL) and the CPU (heightAt for hull bobbing).
 * Amplitudes are nominal metres at sea state 3 (rough); the live amplitude scale is uSea.x in [0, 1].
 */
export interface Wave { dirX: number; dirZ: number; length: number; amp: number; steep: number; k: number; w: number }

const G = 9.81;
const BASE_DIR = Math.atan2(-0.62, 0.78); // swell runs roughly from the south-west toward the bay mouth

const SPEC: Array<[number, number, number, number]> = [
  // dir offset (rad), wavelength (m), amplitude (m @ rough), steepness
  [0.0, 62, 1.25, 0.55],
  [0.42, 39, 0.75, 0.5],
  [-0.5, 24, 0.42, 0.45],
  [1.05, 15, 0.22, 0.4],
  [-1.2, 9.5, 0.12, 0.35],
];

export const WAVES: Wave[] = SPEC.map(([off, length, amp, steep]) => {
  const a = BASE_DIR + off, k = (2 * Math.PI) / length;
  return { dirX: Math.cos(a), dirZ: Math.sin(a), length, amp, steep, k, w: Math.sqrt(G * k) * 0.75 };
});

/** Main swell direction (unit x, z) for stylised crest lines. */
export const SWELL_DIR: [number, number] = [WAVES[0].dirX, WAVES[0].dirZ];

const f = (v: number) => v.toFixed(6);

export function wavesGLSL(): string {
  let disp = "", nrm = "", hgt = "";
  const n = WAVES.length;
  for (const wv of WAVES) {
    const QA = wv.steep / (wv.k * n);
    const ph = `(${f(wv.k)} * dot(vec2(${f(wv.dirX)}, ${f(wv.dirZ)}), p) - ${f(wv.w)} * t)`;
    disp += `  { float ph = ${ph}; float c = cos(ph), s = sin(ph); d.xz += ${f(QA)} * vec2(${f(wv.dirX)}, ${f(wv.dirZ)}) * c * amp; d.y += ${f(wv.amp)} * s * amp; }\n`;
    nrm += `  { float ph = ${ph}; float c = cos(ph), s = sin(ph); float wa = ${f(wv.k * wv.amp)} * amp; nn.x -= ${f(wv.dirX)} * wa * c; nn.z -= ${f(wv.dirZ)} * wa * c; nn.y -= ${f(wv.steep / n)} * s * amp; }\n`;
    hgt += `  h += ${f(wv.amp)} * sin(${ph});\n`;
  }
  return `
vec3 gerstnerDisp(vec2 p, float t, float amp) { vec3 d = vec3(0.0);
${disp}  return d; }
vec3 gerstnerNormal(vec2 p, float t, float amp) { vec3 nn = vec3(0.0, 1.0, 0.0);
${nrm}  return normalize(nn); }
float gerstnerCrest(vec2 p, float t) { float h = 0.0;
${hgt}  return h / ${f(WAVES.reduce((s, w) => s + w.amp, 0))}; }
`;
}

/** CPU height (m) at (x, z), time t, amplitude scale amp (ignores the small horizontal drift). */
export function waveHeight(x: number, z: number, t: number, amp: number): number {
  let h = 0;
  for (const wv of WAVES) h += wv.amp * Math.sin(wv.k * (wv.dirX * x + wv.dirZ * z) - wv.w * t);
  return h * amp;
}

/** A hull's hullSwell cache: per wave, the bow and beam offset phases (a, b) last taken through sin / cos, and those (NaN: none yet). */
export const hullSwellCache = (): Float64Array => new Float64Array(WAVES.length * 6).fill(NaN);
/** A cached offset phase is reused while the live one is within this (rad): the series below stays exact (< 1e-14). */
const DRIFT_MAX = 0.1;

/**
 * waveHeight (undamped, × amp) at a hull's centre (x, z), bow / stern (x, z) ± (bx, bz) and port / starboard
 * (x, z) ± (px, pz), into out[0..4]. Without a cache: the reference formula at each point (25 sin). With one
 * (a hull lying alongside, moored or at anchor): each wave's centre phase φ once (sin, cos) and the four
 * offsets by angle addition, sin(φ ± a) = sin φ cos a ± cos φ sin a, where a = k·(dir·Δ) is near-constant for
 * a hull that only yaws a little: sin / cos of a come from the cached a₀ plus a short series in a − a₀, and
 * are re-taken (4 trig) only when the hull has swung more than DRIFT_MAX of phase. 10 trig instead of 25.
 */
export function hullSwell(x: number, z: number, bx: number, bz: number, px: number, pz: number, t: number, amp: number, out: Float64Array, cache: Float64Array | null): void {
  let h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const wv = WAVES[i], k = wv.k, dx = wv.dirX, dz = wv.dirZ, wt = wv.w * t, A = wv.amp;
    if (!cache) {
      h0 += A * Math.sin(k * (dx * x + dz * z) - wt);
      h1 += A * Math.sin(k * (dx * (x + bx) + dz * (z + bz)) - wt);
      h2 += A * Math.sin(k * (dx * (x - bx) + dz * (z - bz)) - wt);
      h3 += A * Math.sin(k * (dx * (x + px) + dz * (z + pz)) - wt);
      h4 += A * Math.sin(k * (dx * (x - px) + dz * (z - pz)) - wt);
      continue;
    }
    const ph = k * (dx * x + dz * z) - wt, s = Math.sin(ph), c = Math.cos(ph);
    const j = i * 6;
    const a = k * (dx * bx + dz * bz), b = k * (dx * px + dz * pz);
    if (!(Math.abs(a - cache[j]) <= DRIFT_MAX)) { cache[j] = a; cache[j + 1] = Math.sin(a); cache[j + 2] = Math.cos(a); }
    if (!(Math.abs(b - cache[j + 3]) <= DRIFT_MAX)) { cache[j + 3] = b; cache[j + 4] = Math.sin(b); cache[j + 5] = Math.cos(b); }
    let d = a - cache[j], d2 = d * d;
    let sd = d * (1 - d2 / 6 * (1 - d2 / 20 * (1 - d2 / 42))), cd = 1 - d2 / 2 * (1 - d2 / 12 * (1 - d2 / 30));
    const sa = cache[j + 1] * cd + cache[j + 2] * sd, ca = cache[j + 2] * cd - cache[j + 1] * sd;
    d = b - cache[j + 3]; d2 = d * d;
    sd = d * (1 - d2 / 6 * (1 - d2 / 20 * (1 - d2 / 42))); cd = 1 - d2 / 2 * (1 - d2 / 12 * (1 - d2 / 30));
    const sb = cache[j + 4] * cd + cache[j + 5] * sd, cb = cache[j + 5] * cd - cache[j + 4] * sd;
    const sca = s * ca, csa = c * sa, scb = s * cb, csb = c * sb;
    h0 += A * s;
    h1 += A * (sca + csa); h2 += A * (sca - csa);
    h3 += A * (scb + csb); h4 += A * (scb - csb);
  }
  out[0] = h0 * amp; out[1] = h1 * amp; out[2] = h2 * amp; out[3] = h3 * amp; out[4] = h4 * amp;
}

/** Amplitude scale per declared sea state 0 calm … 3 rough. */
export const SEA_STATES = [
  { amp: 0.1, chop: 0.35, caps: 0.0, bands: 0.8 },
  { amp: 0.24, chop: 0.55, caps: 0.0, bands: 1.0 },
  { amp: 0.5, chop: 0.8, caps: 0.85, bands: 1.15 },   // caps: whitecaps must read at the heart view (readings)
  { amp: 0.85, chop: 1.0, caps: 1.0, bands: 1.35 },
] as const;
