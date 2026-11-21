import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import { FullscreenPass, NOISE_GLSL } from "../ocean/gpu-bake";

/**
 * Painterly Mediterranean cloud impostors. Each atlas cell (4:1) holds an asymmetrical, wind-sculpted cloud
 * bank (towering Aegean cumulus, sweeping trade-wind stratocumulus, or airy fair-weather puffs + detached
 * wisps), fused smoothly with two-stage domain warp, wispy frayed edges and a softly lifted/undulating base
 * so banks read as painted coastal vapor rather than flat-bottomed bread-rolls. The bake stores:
 *   RG = smooth macro + detail surface normal xy (card space),
 *   B  = optical translucency / thin-edge depth (1 = wispy backlit fringe, 0 = dense cloud heart),
 *   A  = soft painterly coverage.
 * The sky shader lights it every frame from the real sun/moon direction with Henyey-Greenstein Mie scattering.
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

/** kind 0 = asymmetric towering cumulus, 1 = sweeping wind-sheared stratocumulus, 2 = airy fair-weather puffs. */
export function cloudLobes(seed: number, kind: number): { lobes: Lobe[]; base: number } {
  const R = rng(seed * 7919 + 31);
  const base = kind === 2 ? 0.20 + R() * 0.05 : 0.14 + R() * 0.04;
  const lobes: Lobe[] = [];
  const push = (x: number, y: number, r: number, d: number) => {
    if (lobes.length >= MAX_LOBES) return;
    if (x - r < 0.08 || x + r > ASPECT - 0.08 || y + r > 0.96 || y - r < 0.04) return;
    lobes.push([x, y, r, d]);
  };
  // wind-shear asymmetry: main convective mass sits off-center and tapers into long trailing wisps downwind
  const dir = seed % 2 === 0 ? 1 : -1;
  const mid = ASPECT * 0.5;

  if (kind === 0) {
    // Towering Aegean cumulus: bold off-center convective head + stepped shoulder + sweeping trailing tail + detached wisps
    const mainX = mid - dir * (0.45 + R() * 0.45);
    const shX = mainX + dir * (0.65 + R() * 0.35);
    const tailEnd = mainX + dir * (1.75 + R() * 0.55);
    const noseEnd = mainX - dir * (0.72 + R() * 0.25);
    // primary billowing core masses (varied grand scales, fused smoothly in BAKE_FRAG)
    push(mainX, base + 0.24, 0.27 + R() * 0.05, 0.10);
    push(mainX + dir * 0.14, base + 0.44, 0.23 + R() * 0.05, 0.12);
    push(mainX - dir * 0.16, base + 0.31, 0.20 + R() * 0.04, 0.08);
    push(mainX + dir * 0.20, base + 0.58, 0.16 + R() * 0.04, 0.14);
    // stepped wind-sheared secondary shoulder turret
    push(shX, base + 0.21, 0.21 + R() * 0.04, 0.06);
    push(shX + dir * 0.12, base + 0.36, 0.17 + R() * 0.04, 0.08);
    push(shX + dir * 0.24, base + 0.45, 0.12 + R() * 0.03, 0.09);
    // upwind compact nose rising gently off the base
    push(noseEnd + dir * 0.24, base + 0.16, 0.15 + R() * 0.03, 0.04);
    push(noseEnd, base + 0.15, 0.10 + R() * 0.03, 0.02);
    // sweeping downwind tapering ridge with slight base lift
    for (let i = 0; i < 8; i++) {
      const f = (i + 1) / 9;
      const x = shX + (tailEnd - shX) * f + (R() - 0.5) * 0.12;
      const r = (0.16 - 0.08 * f) * (0.85 + 0.3 * R());
      const lift = f * f * 0.12;
      push(x, base + r * 0.65 + lift + R() * 0.08 * (1 - f), r, 0.03 + 0.04 * (1 - f));
    }
    // sculptural cauliflower crestlets concentrated around the upper windward & main crown
    const anchorCount = lobes.length;
    for (let i = 0; i < 24 && lobes.length < MAX_LOBES; i++) {
      const p = lobes[Math.floor(Math.pow(R(), 1.3) * anchorCount)];
      const ang = (0.12 + R() * 0.76) * Math.PI;
      const r = p[2] * (0.28 + R() * 0.32);
      push(p[0] + Math.cos(ang) * p[2] * 0.78 + dir * 0.04, p[1] + Math.sin(ang) * p[2] * 0.78, r, p[3] + 0.025);
    }
    // 2-3 small detached wind-torn fractocumulus puffs trailing downwind/upwind
    for (let i = 0; i < 3; i++) {
      const wx = tailEnd + dir * (0.18 + i * 0.22 + R() * 0.12);
      const wy = base + 0.16 + R() * 0.22;
      const wr = 0.06 + R() * 0.05;
      push(wx, wy, wr, 0.01);
      push(wx + dir * wr * 0.8, wy + wr * 0.25, wr * 0.68, 0.02);
    }
  } else if (kind === 1) {
    // Sweeping Mediterranean stratocumulus / trade-wind deck ribbon: asymmetrical swell + airy tapered wings
    const mainX = mid - dir * (0.35 + R() * 0.55);
    const wingA = 0.38 + R() * 0.22, wingB = ASPECT - 0.38 - R() * 0.22;
    const gapX = mid + dir * (0.72 + R() * 0.35);
    for (let i = 0; i < 16; i++) {
      const f = i / 15;
      const x = wingA + (wingB - wingA) * f;
      const dMain = (x - mainX) / 1.15;
      const dGap = Math.abs(x - gapX);
      if (dGap < 0.18 && R() < 0.75) continue; // airy coastal gap where sky breathes through
      const swell = Math.exp(-dMain * dMain * 1.4);
      const endFade = Math.sin(f * Math.PI);
      const r = (0.075 + 0.135 * swell) * (0.45 + 0.55 * endFade) * (0.85 + 0.3 * R());
      const lift = (1 - endFade) * 0.09 + 0.04 * Math.sin(f * Math.PI * 2.5 + seed);
      push(x, base + r * 0.6 + lift, r, 0.03 + 0.06 * swell);
      if (swell > 0.35 && R() < 0.8) {
        const cr = r * (0.58 + 0.28 * R());
        push(x + dir * r * 0.35, base + r * 1.15 + lift + 0.04 * swell, cr, 0.05 + 0.05 * swell);
      }
    }
    const anchorCount = lobes.length;
    for (let i = 0; i < 20 && lobes.length < MAX_LOBES; i++) {
      const p = lobes[Math.floor(R() * anchorCount)];
      const ang = (0.1 + R() * 0.8) * Math.PI;
      const r = p[2] * (0.32 + R() * 0.3);
      push(p[0] + Math.cos(ang) * p[2] * 0.85, p[1] + Math.sin(ang) * p[2] * 0.68, r, p[3] + 0.015);
    }
  } else {
    // Sweeping fair-weather Mediterranean cumulus pair: one sculpted asymmetric coastal bank + smaller trailing shoulder + wisp
    const leadX = mid - dir * (0.42 + R() * 0.32);
    const compX = mid + dir * (0.85 + R() * 0.35);
    const wispX = leadX - dir * (0.88 + R() * 0.22);
    // primary graceful low-slung Aegean cumulus with sculpted off-center crown (never a round cotton ball)
    push(leadX, base + 0.16, 0.22 + R() * 0.03, 0.08);
    push(leadX + dir * 0.24, base + 0.28, 0.19 + R() * 0.03, 0.11);
    push(leadX + dir * 0.44, base + 0.17, 0.16 + R() * 0.03, 0.07);
    push(leadX - dir * 0.30, base + 0.13, 0.15 + R() * 0.03, 0.05);
    push(leadX + dir * 0.66, base + 0.15, 0.11 + R() * 0.02, 0.04);
    push(leadX + dir * 0.28, base + 0.42, 0.12 + R() * 0.03, 0.13);
    // smaller trailing companion puff
    push(compX, base + 0.16 + R() * 0.05, 0.13 + R() * 0.02, 0.06);
    push(compX + dir * 0.18, base + 0.22 + R() * 0.04, 0.11 + R() * 0.02, 0.08);
    push(compX - dir * 0.18, base + 0.14 + R() * 0.04, 0.09 + R() * 0.02, 0.04);
    // delicate detached windward wisp
    push(wispX, base + 0.20 + R() * 0.06, 0.08 + R() * 0.02, 0.03);
    push(wispX - dir * 0.12, base + 0.19 + R() * 0.06, 0.06 + R() * 0.02, 0.02);
    const anchorCount = lobes.length;
    for (let i = 0; i < 20 && lobes.length < MAX_LOBES; i++) {
      const p = lobes[Math.floor(R() * anchorCount)];
      const ang = (0.10 + R() * 0.80) * Math.PI;
      const r = p[2] * (0.30 + R() * 0.34);
      push(p[0] + Math.cos(ang) * p[2] * 0.88 + dir * 0.03, p[1] + Math.sin(ang) * p[2] * 0.66, r, p[3] + 0.02);
    }
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
// returns (sculpted volumetric height, signed distance to the cloud silhouette)
vec2 field(vec2 p) {
  // two-stage wind-shear + convective billow warp erases sphere-lobe regularity into painterly vapor
  vec2 shear = vec2(fbm2(p * vec2(1.1, 2.0) + 2.7), fbm2(p * vec2(1.4, 1.8) + 8.3)) - 0.5;
  vec2 curl = vec2(fbm2(p * 3.4 + 5.1), fbm2(p * 3.4 + 11.9)) - 0.5;
  p += shear * vec2(0.14, 0.075) + curl * 0.042;
  float sd = 1e3, h = -1.0;
  for (int i = 0; i < ${MAX_LOBES}; i++) {
    if (i >= uCount) break;
    vec4 L = uLobes[i];
    // stretch lobes horizontally into sweeping wind-sculpted Mediterranean cumulus banks (never cotton balls)
    vec2 dp = (p - L.xy) * vec2(0.76, 1.12);
    float d = length(dp);
    sd = smin(sd, d - L.z, 0.072);
    float z2 = L.z * L.z - d * d;
    if (z2 > 0.0) h = smax(h, sqrt(z2) + L.w, 0.032);
  }
  float billow = (fbm2(p * 6.8 + 1.7) - 0.5) * 0.056 + (fbm2(p * 15.0 + 6.9) - 0.5) * 0.026;
  sd += billow;
  h += (fbm2(p * 5.5 + 5.3) - 0.5) * 0.048;
  // gently undulating, softly lifted outer cloud base (zero ruler-straight flat underside)
  float edgeT = abs(p.x / ASPECT - 0.5) * 2.0;
  float tailLift = pow(clamp(edgeT, 0.0, 1.0), 2.5) * 0.13;
  float b = uBase + tailLift + (fbm2(vec2(p.x * 2.1, 0.4)) - 0.5) * 0.075 + (fbm2(vec2(p.x * 5.8, 1.7)) - 0.5) * 0.032;
  sd = smax(sd, (b - p.y), 0.11);
  return vec2(h, sd);
}
void main() {
  vec2 p = vec2(vUv.x * ASPECT, vUv.y);
  vec2 f = field(p);
  // blend broad macro-volume normal with medium billow relief so lighting wraps grandly across the whole bank
  float em = 0.014, ef = 0.005;
  vec2 gMacro = vec2(
    field(p + vec2(em, 0.0)).x - field(p - vec2(em, 0.0)).x,
    field(p + vec2(0.0, em)).x - field(p - vec2(0.0, em)).x
  ) / (2.0 * em);
  vec2 gFine = vec2(
    field(p + vec2(ef, 0.0)).x - field(p - vec2(ef, 0.0)).x,
    field(p + vec2(0.0, ef)).x - field(p - vec2(0.0, ef)).x
  ) / (2.0 * ef);
  vec2 grad = mix(gMacro, gFine, 0.35);
  vec3 n = normalize(vec3(-grad.x, -grad.y, 1.05));
  // underside turns smoothly downward toward the base mist
  n = normalize(n + vec3(0.0, -1.25, 0.0) * (1.0 - smoothstep(0.0, 0.18, p.y - uBase)));
  // soft, wind-frayed wispy silhouette + feathery dissolved underside (no razor-sharp flat base)
  float ero1 = fbm2(p * vec2(7.5, 10.5) + 2.3) - 0.5;
  float ero2 = fbm2(p * 18.0 + 7.1) - 0.5;
  float ero = ero1 * 0.070 + ero2 * 0.032;
  float a = 1.0 - smoothstep(-0.064, 0.034, f.y + ero);
  a *= smoothstep(uBase - 0.07, uBase + 0.18, p.y + ero1 * 0.10);
  // keep cell frame borders completely clean (zero hard card clip; strictly ascending smoothstep edges)
  float edgeX = smoothstep(0.0, 0.05, vUv.x) * (1.0 - smoothstep(0.95, 1.0, vUv.x));
  float edgeY = smoothstep(0.0, 0.04, vUv.y) * (1.0 - smoothstep(0.94, 1.0, vUv.y));
  a *= edgeX * edgeY;
  // optical translucency (B): 1 = thin wispy edge/fringe catching Mie silver/gold lining, 0 = dense thick heart
  float thickness = clamp(-f.y / 0.16 + max(f.x, 0.0) * 0.65, 0.0, 1.6);
  float trans = clamp(exp(-thickness * 1.9) * 0.85 + (1.0 - a) * 0.32 + ero1 * 0.22, 0.0, 1.0);
  gl_FragColor = vec4(n.xy * 0.5 + 0.5, trans, a);
}`;

/** Bake the 8-bank atlas (2048 x 1024 RGBA8), generating its mip chain only after the last cell. */
export async function bakeCloudAtlas(ctx: EngineContext): Promise<THREE.WebGLRenderTarget> {
  const rt = new THREE.WebGLRenderTarget(CELL_W * CLOUD_COLS, CELL_H * CLOUD_ROWS, {
    type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: false,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
  });
  const lobeArr = Array.from({ length: MAX_LOBES }, () => new THREE.Vector4());
  const pass = new FullscreenPass(BAKE_FRAG, { uLobes: { value: lobeArr }, uCount: { value: 0 }, uBase: { value: 0.16 }, uSeed: { value: 0 } });
  const vp = new THREE.Vector4();
  const preparation = ctx.services.get("preparation")!;
  let batch;
  try {
    batch = await preparation.prepare([pass.preparationEntry(() => rt)], undefined, ctx.signal);
    for (let c = 0; c < CLOUD_CELLS; c++) {
      await preparation.submit(() => {
        const { lobes, base } = cloudLobes(c + 1, CLOUD_KINDS[c]);
        lobes.forEach((l, i) => lobeArr[i].set(l[0], l[1], l[2], l[3]));
        const u = pass.material.uniforms;
        u.uCount.value = lobes.length; u.uBase.value = base; u.uSeed.value = c * 13 + 5;
        vp.set((c % CLOUD_COLS) * CELL_W, Math.floor(c / CLOUD_COLS) * CELL_H, CELL_W, CELL_H);
        // No consumer can sample the atlas until it returns; only the complete base level needs mips.
        rt.texture.generateMipmaps = c === CLOUD_CELLS - 1;
        pass.render(ctx.renderer, rt, c === 0, vp);
      }, { signal: ctx.signal, nextFrame: true });
    }
    if (ctx.signal?.aborted) throw new DOMException("Bake cancelled", "AbortError");
    return rt;
  } catch (error) { rt.dispose(); throw error; }
  finally { batch?.dispose(); pass.dispose(); }
}
