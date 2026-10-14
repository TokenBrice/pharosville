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

/** Amplitude scale per declared sea state 0 calm … 3 rough. */
export const SEA_STATES = [
  { amp: 0.1, chop: 0.35, caps: 0.0, bands: 0.8 },
  { amp: 0.24, chop: 0.55, caps: 0.0, bands: 1.0 },
  { amp: 0.5, chop: 0.8, caps: 0.85, bands: 1.15 },   // caps: whitecaps must read at the heart view (readings)
  { amp: 0.85, chop: 1.0, caps: 1.0, bands: 1.35 },
] as const;
