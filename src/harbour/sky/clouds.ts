import * as THREE from "three";
import { FullscreenPass, NOISE_GLSL } from "../ocean/gpu-bake";

/**
 * Painted cumulus impostors. Each atlas cell (4:1) holds one cloud bank authored as a deterministic
 * cluster of sphere lobes (flat base, towering crown, cauliflower crown lobes), domain-warped and
 * detail-billowed so it reads painted, not CG. The bake stores lighting-independent data:
 *   RG = surface normal xy (card space), B = silhouette proximity (rim), A = coverage.
 * The sky shader lights it every frame from the real sun/moon direction.
 */
export const CLOUD_COLS = 2;
export const CLOUD_ROWS = 4;
export const CLOUD_CELLS = CLOUD_COLS * CLOUD_ROWS;
const CELL_W = 1024, CELL_H = 256, ASPECT = CELL_W / CELL_H;
const MAX_LOBES = 64;
/** Bank kind per atlas cell (see cloudLobes). */
export const CLOUD_KINDS = [0, 1, 0, 2, 1, 0, 2, 1];

type Lobe = [number, number, number, number]; // x, y, r, depth bias

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** kind 0 = towering bank, 1 = long low bank, 2 = small fair-weather pair. */
export function cloudLobes(seed: number, kind: number): { lobes: Lobe[]; base: number } {
  const R = rng(seed * 7919 + 13);
  const base = 0.16;
  const lobes: Lobe[] = [];
  const x0 = kind === 2 ? 0.9 + R() * 0.4 : 0.35, x1 = kind === 2 ? x0 + 1.6 + R() * 0.5 : ASPECT - 0.35;
  const peakX = x0 + (x1 - x0) * (0.3 + R() * 0.4);
  const peakH = kind === 0 ? 0.62 + R() * 0.2 : kind === 1 ? 0.34 + R() * 0.1 : 0.42 + R() * 0.12;
  const profile = (x: number) => {
    const t = (x - peakX) / ((x1 - x0) * (kind === 1 ? 0.75 : 0.42));
    const bell = Math.exp(-t * t * 1.6);
    return base + 0.1 + (peakH - 0.1) * bell * (0.85 + 0.3 * R());
  };
  // base row: wide, overlapping, sitting on the flat base
  let x = x0;
  while (x < x1) {
    const r = 0.1 + R() * 0.07 + (profile(x) - base) * 0.18;
    lobes.push([x, base + r * 0.55, r, 0.06 + R() * 0.02]);
    x += r * (0.95 + R() * 0.5);
  }
  // body: stack up to the profile with decreasing radius
  const nBody = kind === 1 ? 14 : 20;
  for (let i = 0; i < nBody; i++) {
    const bx = x0 + 0.15 + R() * (x1 - x0 - 0.3);
    const top = profile(bx);
    const r = 0.09 + R() * 0.1 + (top - base) * 0.14;
    const by = base + r * 0.6 + R() * Math.max(0, top - base - r * 1.1);
    lobes.push([bx, by, r, R() * 0.05]);
  }
  // crown: small cauliflower lobes riding the top silhouette
  const nCrown = kind === 1 ? 14 : 22;
  for (let i = 0; i < nCrown && lobes.length < MAX_LOBES; i++) {
    const p = lobes[Math.floor(R() * lobes.length)];
    const ang = (0.15 + R() * 0.7) * Math.PI;
    const r = p[2] * (0.32 + R() * 0.3);
    const cx = p[0] + Math.cos(ang) * p[2] * 0.85, cy = p[1] + Math.sin(ang) * p[2] * 0.85;
    if (cy + r > 0.97 || cy - r < base) continue;
    lobes.push([cx, cy, r, p[3] + 0.02]);
  }
  return { lobes: lobes.slice(0, MAX_LOBES), base };
}

const BAKE_FRAG = /* glsl */ `
${NOISE_GLSL}
uniform vec4 uLobes[${MAX_LOBES}];
uniform int uCount;
uniform float uBase, uSeed;
varying vec2 vUv;
const float ASPECT = ${ASPECT.toFixed(1)};
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float fbm2(vec2 p) { return pfbm(p / 16.0, 16.0, uSeed, 4); }
// returns (height, signed distance to the silhouette)
vec2 field(vec2 p) {
  vec2 w = vec2(fbm2(p * 2.2 + 3.1), fbm2(p * 2.2 + 9.7)) - 0.5;
  p += w * 0.07;
  float sd = 1e3, h = -1.0;
  for (int i = 0; i < ${MAX_LOBES}; i++) {
    if (i >= uCount) break;
    vec4 L = uLobes[i];
    float d = length(p - L.xy);
    sd = smin(sd, d - L.z, 0.025);
    float z2 = L.z * L.z - d * d;
    if (z2 > 0.0) h = smax(h, sqrt(z2) + L.w, 0.012);
  }
  float billow = fbm2(p * 9.0 + 1.7) - 0.5;
  sd += billow * 0.035;
  h += (fbm2(p * 7.0 + 5.3) - 0.5) * 0.05;
  // flat, slightly ragged base
  float b = uBase + (fbm2(vec2(p.x * 3.0, 0.5)) - 0.5) * 0.03;
  sd = max(sd, (b - p.y) * 1.0);
  return vec2(h, sd);
}
void main() {
  vec2 p = vec2(vUv.x * ASPECT, vUv.y);
  vec2 f = field(p);
  float e = 0.004;
  float hx = field(p + vec2(e, 0.0)).x - field(p - vec2(e, 0.0)).x;
  float hy = field(p + vec2(0.0, e)).x - field(p - vec2(0.0, e)).x;
  vec3 n = normalize(vec3(-hx / (2.0 * e), -hy / (2.0 * e), 1.0));
  // near the flat base the surface turns under
  n = normalize(n + vec3(0.0, -1.4, 0.0) * (1.0 - smoothstep(0.0, 0.07, p.y - uBase)));
  float a = 1.0 - smoothstep(-0.006, 0.004, f.y);
  float rim = 1.0 - smoothstep(0.0, 0.026, -f.y);
  gl_FragColor = vec4(n.xy * 0.5 + 0.5, rim, a);
}`;

/** Bake the 8-bank atlas (2048 x 1024 RGBA8, mipmapped; three regenerates mips after each cell). */
export function bakeCloudAtlas(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(CELL_W * CLOUD_COLS, CELL_H * CLOUD_ROWS, {
    type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
  });
  const lobeArr = Array.from({ length: MAX_LOBES }, () => new THREE.Vector4());
  const pass = new FullscreenPass(BAKE_FRAG, { uLobes: { value: lobeArr }, uCount: { value: 0 }, uBase: { value: 0.16 }, uSeed: { value: 0 } });
  const vp = new THREE.Vector4();
  for (let c = 0; c < CLOUD_CELLS; c++) {
    const { lobes, base } = cloudLobes(c + 1, CLOUD_KINDS[c]);
    lobes.forEach((l, i) => lobeArr[i].set(l[0], l[1], l[2], l[3]));
    const u = pass.material.uniforms;
    u.uCount.value = lobes.length; u.uBase.value = base; u.uSeed.value = c * 13 + 5;
    vp.set((c % CLOUD_COLS) * CELL_W, Math.floor(c / CLOUD_COLS) * CELL_H, CELL_W, CELL_H);
    pass.render(renderer, rt, c === 0, vp);
  }
  pass.dispose();
  return rt;
}
