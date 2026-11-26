import * as THREE from "three";
import { GUST_GLSL } from "./gust";
import type { BeamUniforms } from "../beam/uniforms";
import { extraEnabled } from "../engine/extras";
import { SWELL_DIR } from "../ocean/waves";
import { OCEAN_DISP_GLSL } from "../ocean/shaders/ocean-disp";
import type { OceanService } from "../ocean/ocean-system";

/**
 * Precipitation, two GPU-instanced draws (no per-particle CPU work):
 *
 *  1. FALL: rain streaks (velocity-stretched, wind-slanted, a constant ~1.3 px wide in screen space) and
 *     snowflakes (soft discs drifting and swirling), mixed in ONE instanced draw: an instance is snow when
 *     its seed falls under the snow share. Particles live on a world-space lattice wrapped into a camera-
 *     relative box that scales with the zoom (quantised, so a zoom does not reshuffle every frame), and fade
 *     at the box faces so nothing pops. The draw count is the intensity (instanceCount), not an alpha.
 *     Lit by the sky (ambient), the town's light pools (rain glints under the lamps), the Pharos beam
 *     (the beam cuts through the rain) and the lightning flash.
 *  2. GROUND: rain splashes (expanding rings on water, quays and roofs: the island height field) and, in
 *     storms, spray plumes torn off the breaking surf along the outer coast, the breakwater and the Shoals.
 */

export interface PrecipBudget { fall: number; splash: number }
export const PRECIP_BUDGET: Record<"high" | "medium" | "low", PrecipBudget> = {
  high: { fall: 22000, splash: 2600 },
  medium: { fall: 14000, splash: 1600 },
  low: { fall: 8000, splash: 900 },
};
const MAX_FALL = PRECIP_BUDGET.high.fall;
const MAX_SPLASH = PRECIP_BUDGET.high.splash;
export const MAX_SPRAY = 520;
/** E24: the lightning's lift on falling drops (was 2.2: every drop flashed with the strike). */
export const RAIN_FLASH_LIFT = extraEnabled("storm") ? 1.2 : 2.2;

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COMMON = /* glsl */ `
uniform vec3 uBoxMin, uBoxSize;
uniform float uPTime;
uniform vec3 uAmbRain;        // sky-side light on a drop (linear)
uniform float uFlashK;        // lightning flash 0..1
uniform float uFlashLift;     // E24: how far a flash lifts the drops (2.2 → 1.2: the strike, not the rain, flashes)
uniform sampler2D uPoolTex;
uniform vec4 uPoolBounds;
uniform float uWindowGlow;
uniform vec3 uBeamPos, uBeamCol;
uniform float uBeamAngle;
uniform vec4 uBeamShape;
uniform sampler2D uAOTex;
uniform vec4 uAOBounds;
float pHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// light reaching a drop at p: sky, lamp pools (night), the Pharos beam, the lightning
vec3 dropLight(vec3 p) {
  vec3 L = uAmbRain + vec3(0.72, 0.78, 1.0) * uFlashK * uFlashLift;
  vec2 uv = (p.xz - uPoolBounds.xy) * uPoolBounds.zw;
  if (uWindowGlow > 0.02 && uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) {
    vec4 pool = texture2D(uPoolTex, uv);
    float near = exp(-max(p.y - pool.a, 0.0) / 14.0);
    L += pool.rgb * near * 5.0 * smoothstep(0.02, 0.5, uWindowGlow);
  }
  if (uBeamPos.y > -100.0) {
    float ct = cos(uBeamShape.z);
    vec3 bd = vec3(cos(uBeamAngle) * ct, -sin(uBeamShape.z), sin(uBeamAngle) * ct);
    vec3 rel = p - uBeamPos;
    float along = dot(rel, bd);
    float lat = length(rel - bd * along);
    float w = 1.5 + max(along, 0.0) * tan(uBeamShape.y) * 1.3;
    float k = exp(-pow(lat / w, 2.0) * 1.4) * smoothstep(0.0, 25.0, along) * exp(-max(along, 0.0) / max(uBeamShape.x * 0.7, 1.0));
    L += uBeamCol * k * 3.0;
  }
  return L;
}
float groundAt(vec2 xz) {
  if (uAOBounds.z <= 0.0) return 0.0;
  vec2 uv = vec2((xz.x - uAOBounds.x) * uAOBounds.z, (uAOBounds.y - xz.y) * uAOBounds.w);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return max(texture2D(uAOTex, uv).r, 0.0);
}
`;

/**
 * E25 precipitation depth: past FAR_FADE[0]·D of view depth the drops fade toward FAR_FLOOR and draw FAR_STREAK of
 * their streak (D = the rig distance); the near fade and the DEWS instance count are untouched. TS twins for tests.
 */
export const FAR_FADE = [0.75, 1.35] as const, FAR_FLOOR = 0.45, FAR_STREAK = 0.55;
const smooth01 = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function farDepthAlpha(depth: number, D: number): number { return 1 - smooth01(FAR_FADE[0] * D, FAR_FADE[1] * D, depth) * (1 - FAR_FLOOR); }
export function farStreakShare(depth: number, D: number): number { return 1 + (FAR_STREAK - 1) * smooth01(FAR_FADE[0] * D, FAR_FADE[1] * D, depth); }

const FALL_VERT = /* glsl */ `
${COMMON}
${GUST_GLSL}
uniform vec4 uDepthK;         // E25: far fade start, end (m view depth), far alpha floor, far streak share
uniform vec4 uSheets;         // E25 (M+): gust downwind x, z, gust clock (s), sheet strength 0..1
attribute vec4 aSeed;
uniform float uSnowFrac;      // share of the drawn instances that are snow
uniform vec3 uFall;           // rain fall (m/s), snow fall (m/s), streak exposure (s)
uniform vec2 uWindV;          // drift (m/s) on xz
uniform vec2 uSize;           // rain width (px), flake radius (m)
uniform vec2 uViewport;
uniform vec3 uCam;
uniform float uNearFade;      // view depth (m) under which drops fade (no giant streaks at the lens)
uniform float uRainAlpha;
uniform float uDownpour;      // 0 drizzle … 1 downpour: the drizzle's soft curtains give way to the storm's sheets
uniform float uSnowDrive;     // 0 drifting … 1 driven (wind)
varying vec2 vUv;
varying float vSnow;
varying float vA;
varying vec3 vLight;
varying float vSeed;
vec3 wrapBox(vec3 p) { return uBoxMin + mod(p - uBoxMin, uBoxSize); }
float faceFade(vec3 p) {
  vec3 q = (p - uBoxMin) / uBoxSize;
  vec3 f = smoothstep(vec3(0.0), vec3(0.07), q) * (1.0 - smoothstep(vec3(0.93), vec3(1.0), q));
  return f.x * f.z * (1.0 - smoothstep(0.9, 1.0, q.y));
}
void main() {
  float snow = step(aSeed.w, uSnowFrac);
  float h = fract(aSeed.w * 13.17 + aSeed.x * 7.3);
  vec3 base = aSeed.xyz * uBoxSize * 9.0;
  vec3 p, vel;
  if (snow > 0.5) {
    vel = vec3(uWindV.x * 1.1, -uFall.y * (0.65 + 0.7 * h), uWindV.y * 1.1);
    float sw = uBoxSize.y * 0.006 * (0.5 + h);
    vec3 swirl = vec3(sin(uPTime * (0.7 + h) + aSeed.x * 40.0), 0.0, cos(uPTime * (0.55 + 0.6 * h) + aSeed.z * 40.0)) * sw;
    p = wrapBox(base + vel * uPTime + swirl);
  } else {
    vel = vec3(uWindV.x, -uFall.x * (0.8 + 0.4 * h), uWindV.y);
    p = wrapBox(base + vel * uPTime);
  }
  float fade = faceFade(p);
  float depth = dot(p - uCam, normalize(-vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])));
  fade *= smoothstep(uNearFade, uNearFade * 1.8, depth);
  // E25: far drops fade toward a floor and draw shorter streaks; on M+ the rain comes in sheets with the shared gust
  //      field (density by alpha, the drawn count stays DEWS)
  float far = smoothstep(uDepthK.x, uDepthK.y, depth);
  fade *= 1.0 - far * (1.0 - uDepthK.z);
  if (uSheets.w > 0.0) fade *= mix(1.0, 0.55 + 1.5 * hbGust(p.xz, uSheets.z, uSheets.xy), uSheets.w);
  vLight = dropLight(p);
  vSnow = snow;
  vSeed = h;
  vec2 corner = position.xy;               // x -1..1 across, y 0..1 tail→head
  if (snow > 0.5) {
    // a soft, ragged flake drawn along its screen-space motion: a little drawn out even in light air (the eye
    // smears a falling flake), a longer smear when the wind drives it. Its size on screen is capped softly (a flake
    // by the lens would be a big flat disc), and the ones that close fade out.
    vec4 cc = projectionMatrix * viewMatrix * vec4(p, 1.0);
    vec4 cv = projectionMatrix * viewMatrix * vec4(p + vel * 0.05, 1.0);
    vec2 sd = cv.xy / cv.w * uViewport - cc.xy / cc.w * uViewport;
    float sl = length(sd);
    vec2 dir = sl > 1e-3 ? sd / sl : vec2(0.0, -1.0);
    vec2 n = vec2(-dir.y, dir.x);
    float rRaw = uSize.y * (0.55 + 0.9 * h * h) * projectionMatrix[1][1] * uViewport.y / max(cc.w, 1.0);
    float cap = 3.4 * uViewport.y / 500.0;           // ~3.4 px at a 1000 px tall frame, scaled with the resolution
    float rPx = max(0.7, rRaw * cap / pow(rRaw * rRaw * rRaw + cap * cap * cap, 1.0 / 3.0));   // a soft knee at the cap
    float stretch = 1.25 + clamp(sl * (0.06 + 0.3 * uSnowDrive), 0.0, 2.2);
    vec2 v2 = vec2(corner.x, corner.y * 2.0 - 1.0);
    vec2 off = n * v2.x * rPx + dir * v2.y * rPx * stretch;
    gl_Position = cc + vec4(off / uViewport * cc.w, 0.0, 0.0);
    vUv = v2;
    vA = fade * (0.5 + 0.5 * h) * smoothstep(0.6, 1.6, rPx) * (1.0 - smoothstep(cap * 2.5, cap * 8.0, rRaw));
  } else {
    vec3 tail = p - vel * uFall.z * mix(1.0, uDepthK.w, far) * (0.78 + 0.42 * h);
    vec4 c0 = projectionMatrix * viewMatrix * vec4(tail, 1.0);
    vec4 c1 = projectionMatrix * viewMatrix * vec4(p, 1.0);
    vec2 s0 = c0.xy / c0.w * uViewport, s1 = c1.xy / c1.w * uViewport;
    vec2 d = s1 - s0;
    float len = length(d);
    vec2 dir = len > 1e-3 ? d / len : vec2(0.0, -1.0);
    vec2 n = vec2(-dir.y, dir.x);
    vec4 c = mix(c0, c1, corner.y);
    float depthFrac = clamp((depth - uNearFade) / max(uBoxSize.x * 1.1, 1.0), 0.0, 1.0);
    vec2 wDir = length(uWindV) > 1e-3 ? normalize(uWindV) : vec2(0.8, -0.6);
    vec2 wPerp = vec2(-wDir.y, wDir.x);
    float curtain = 0.45 + 0.55 * (0.5 + 0.5 * sin(dot(p.xz, wPerp) * 0.017 + dot(p.xz, wDir) * 0.006 - uPTime * 0.42));
    curtain = mix(curtain, 0.62 + 0.38 * curtain, uDownpour);
    float nearSoft = smoothstep(0.0, mix(0.18, 0.12, uDownpour), depthFrac);
    float farSoft = 1.0 - smoothstep(0.66, 1.0, depthFrac) * mix(0.55, 0.32, uDownpour);
    float layerFade = nearSoft * farSoft;
    float w = uSize.x * (0.72 + 0.48 * h) * mix(0.85, 1.15, depthFrac);
    c.xy += n * corner.x * w / uViewport * c.w;
    gl_Position = c;
    vUv = corner;
    vA = fade * layerFade * curtain * uRainAlpha * (0.42 + 0.58 * h) * smoothstep(1.2, 7.5, len);
  }
}`;

const FALL_FRAG = /* glsl */ `
uniform float uDownpour;
varying vec2 vUv;
varying float vSnow;
varying float vA;
varying vec3 vLight;
varying float vSeed;
void main() {
  float a;
  vec3 c;
  if (vSnow > 0.5) {
    // a ragged clump of crystals, not a disc: a few lobes, turned per flake, a soft core
    float ang = atan(vUv.y, vUv.x);
    float lob = 1.0 + 0.2 * sin(ang * 5.0 + vSeed * 37.0) + 0.12 * sin(ang * 3.0 - vSeed * 23.0);
    float d = length(vUv) * 1.1 / lob;
    float body = 1.0 - smoothstep(0.0, 1.0, d);
    a = pow(body, 1.4) * vA;
    c = vLight * 1.3 + 0.05;
  } else {
    float across = exp(-vUv.x * vUv.x * mix(4.4, 5.2, uDownpour));
    float along = smoothstep(0.0, 0.68, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
    a = across * along * vA * mix(1.0, 0.86, uDownpour);
    vec3 softL = vLight / (1.0 + vLight * mix(0.48, 0.34, uDownpour));
    c = softL * mix(vec3(0.88, 0.93, 1.0), vec3(0.84, 0.90, 0.98), uDownpour) * (0.74 + 0.26 * vSeed);
  }
  if (a < 0.002) discard;
  gl_FragColor = vec4(c, a);
}`;

const GROUND_VERT = /* glsl */ `
${COMMON}
${OCEAN_DISP_GLSL}
const vec2 SPRAY_SWELL_DIR = vec2(${SWELL_DIR[0].toFixed(5)}, ${SWELL_DIR[1].toFixed(5)});
attribute vec4 aSeed;          // splash: xz seed, phase (>= 0), size | spray: phase, rand, -1, size
attribute vec4 aAnchor;        // spray: x, z, outward nx, nz | splash: unused
uniform float uSplashRate;     // splash cycles per second
uniform float uSplashSize;     // ring radius (m)
uniform float uDownpour;       // 0 drizzle .. 1 downpour
uniform float uSpray;          // spray strength 0..1
uniform vec2 uWindV;
uniform float uSprayScale;     // plume size (m)
uniform vec3 uCam;
uniform float uOceanOn;
uniform float uTime;
uniform vec4 uSea;
uniform vec4 uSdfBounds;
uniform sampler2D uSdf;
uniform vec2 uSceneCenter;
varying vec2 vUv;
varying float vA;
varying float vKind;
varying float vLife;
varying vec3 vLight;
void main() {
  vec2 corner = position.xy * 2.0 - 1.0;
  if (aSeed.z < 0.0) {
    // ---- §6.3.3 swell-synced ballistic foam-jet + downwind spindrift plumes on exposed breakwater / Pharos headlands
    vec2 outN = normalize(aAnchor.zw + 1e-4);
    vec2 wdir = uWindV / max(length(uWindV), 1e-3);
    float exposure = smoothstep(-0.35, 0.85, dot(outN, -SPRAY_SWELL_DIR));
    float impScale = mix(0.55, 1.25, exposure);
    // Lock plume eruptions to arriving 62 m swell crests (hbSwellPhase) + staggered steep-chop harmonic
    float swCyc = (-hbSwellPhase(aAnchor.xy, uPTime) + 1.5707963) / 6.2831853;
    float cyc = swCyc * (1.0 + step(0.52, aSeed.y)) + (aSeed.x - 0.5) * 0.18;
    float rawLife = fract(cyc);
    float waveId = floor(cyc);
    float burstSpan = 0.64;
    float life = clamp(rawLife / burstSpan, 0.0, 1.0);
    float on = step(rawLife, burstSpan) * step(pHash(vec2(waveId, aSeed.x * 91.0)), uSpray * (0.64 + 0.34 * exposure));
    // Towering 8-16 m waterline-anchored ballistic foam-jet apex on outer breakwater/headlands in DANGER storms
    float jetH = (7.6 + 8.4 * aSeed.w) * impScale * (0.42 + 0.58 * uSpray) * clamp(uSprayScale / 3.1, 0.85, 1.30);
    float grow = 0.52 + 0.48 * sin(min(life / 0.52, 1.0) * 1.5707963);
    float shearMix = smoothstep(0.28, 0.82, life);
    float halfH = jetH * grow * mix(0.54, 0.40, shearMix);
    float halfW = jetH * mix(0.32, 0.82, life) * (0.76 + 0.46 * aSeed.w);
    // Base stays anchored in the breaking surf while the crest erupts 8-16 m high, then lifts slightly as spindrift
    float rise = halfH * 0.82 + life * life * jetH * 0.24;
    // Launch seaward along outward normal first (never inland!), then shear seaward/along-wall into spindrift
    vec2 base = aAnchor.xy + outN * 2.0;
    float seawardKick = (2.2 + 3.8 * aSeed.w) * impScale * smoothstep(0.0, 0.48, life);
    vec2 shearDir = normalize(wdir + outN * max(0.0, -dot(wdir, outN) + 0.45));
    vec2 xz = base + outN * seawardKick + shearDir * (life * life * jetH * 1.35);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 wind3 = vec3(shearDir.x, 0.10, shearDir.y);
    vec3 streakAxis = normalize(mix(right, wind3, 0.22 + 0.55 * shearMix));
    vec3 c = vec3(xz.x, rise, xz.y);
    vec3 wp = c + (streakAxis * corner.x * halfW + up * corner.y * halfH) * on;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vUv = corner;
    vA = smoothstep(0.0, 0.11, life) * pow(max(1.0 - life, 0.0), 1.30) * uSpray * on;
    vKind = 1.0;
    vLife = life;
    vLight = dropLight(c);
  } else {
    // ---- delicate realistically-scaled concentric rain ripple ring (~0.25-0.45 m)
    float cyc = uPTime * uSplashRate * (0.8 + 0.45 * aSeed.w) + aSeed.z;
    float life = fract(cyc);
    float id = floor(cyc);
    vec2 q = vec2(pHash(aSeed.xy * 97.0 + id * 1.37), pHash(aSeed.yx * 89.0 + id * 2.11));
    vec2 xz = uBoxMin.xz + q * uBoxSize.xz;
    float gH = groundAt(xz);
    float y = gH + 0.05;
    if (gH <= 0.02 && uOceanOn > 0.5) {
      vec2 suv = (xz - uSdfBounds.xy) / max(uSdfBounds.zw - uSdfBounds.xy, vec2(1.0));
      float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
      float mf = smoothstep(470.0, 560.0, length(xz - uSceneCenter));
      vec4 sd = textureLod(uSdf, clamp(suv, 0.0, 1.0), 0.0);
      float coast = mix(200.0, (mix(sd.r, 1.0, mf) - 0.5) * 128.0, inside);
      float depth = mix(40.0, mix(sd.g, 1.0, mf) * 40.0, inside);
      float damp = smoothstep(0.0, 34.0, coast) * 0.9 + 0.1 * smoothstep(-2.0, 2.0, coast);
      float camD0 = length(xz - uCam.xz);
      float amp = uSea.x * damp * (1.0 - smoothstep(2500.0, 5000.0, camD0));
      vec2 sn = uFftOn > 0.5 ? hbShoreNormal(uSdf, suv, coast, inside) : vec2(0.0);
      y += hbOceanDisp(xz, uTime, amp, damp, camD0, depth, coast, sn).y;
    }
    float r = min(uSplashSize * (0.20 + 0.88 * life) * (0.76 + 0.44 * aSeed.w), 0.24);
    vec3 wp = vec3(xz.x + corner.x * r, y, xz.y + corner.y * r);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vUv = corner;
    vec3 qb = (vec3(xz.x, 0.0, xz.y) - uBoxMin) / uBoxSize;
    float edge = smoothstep(0.0, 0.08, qb.x) * (1.0 - smoothstep(0.92, 1.0, qb.x)) * smoothstep(0.0, 0.08, qb.z) * (1.0 - smoothstep(0.92, 1.0, qb.z));
    float camDist = length(vec3(xz.x, y, xz.y) - uCam);
    float distFade = 1.0 - smoothstep(180.0, 440.0, camDist);
    vA = mix((1.0 - life) * (1.0 - life), 1.0 - life, uDownpour) * smoothstep(0.0, 0.10, life) * edge * distFade;
    vKind = 0.0;
    vLife = life;
    vLight = dropLight(vec3(xz.x, y + 1.0, xz.y));
  }
}`;

const GROUND_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uSplashAlpha;
uniform float uDownpour;
varying vec2 vUv;
varying float vA;
varying float vKind;
varying float vLife;
varying vec3 vLight;
void main() {
  float d = length(vUv);
  float a;
  vec3 c;
  if (vKind > 0.5) {
    float y01 = vUv.y * 0.5 + 0.5;
    vec2 nUv1 = vUv * mix(vec2(0.52, 0.22), vec2(0.22, 0.40), vLife) + vec2(vLife * 0.18, -vLife * 0.30) + 0.31;
    vec2 nUv2 = vUv * mix(vec2(1.22, 0.48), vec2(0.52, 0.92), vLife) - vec2(vLife * 0.26, vLife * 0.44);
    float n = texture2D(uNoise, nUv1).r * 0.62 + texture2D(uNoise, nUv2).g * 0.54;
    // Waterline-anchored tapered ballistic splash silhouette -> wind-shredded spindrift veil
    float xProf = abs(vUv.x) / mix(0.62, 1.02, clamp(y01 * 0.85 + vLife * 0.45, 0.0, 1.0));
    float yProf = smoothstep(0.0, 0.15, y01) * (1.0 - smoothstep(0.30, 1.0, y01));
    float shape = (1.0 - smoothstep(0.14, 1.0, xProf + (n - 0.50) * 0.88)) * yProf;
    float jetCore = (1.0 - smoothstep(0.16, 0.62, vLife)) * exp(-xProf * xProf * 3.8) * smoothstep(0.0, 0.12, y01) * (1.0 - smoothstep(0.22, 0.86, y01));
    a = clamp(shape * smoothstep(0.26, 0.78, n + 0.24 * (1.0 - y01)) * 0.42 + jetCore * smoothstep(0.24, 0.74, n + 0.18) * 0.44, 0.0, 0.66) * vA;
    vec3 softL = vLight / (1.0 + vLight * 0.34);
    vec3 jetTint = mix(vec3(0.92, 0.96, 1.02), vec3(0.98, 1.0, 1.02), jetCore);
    c = softL * jetTint + mix(0.025, 0.055, jetCore);
  } else {
    float rw = mix(0.058, 0.095, uDownpour);
    float rd1 = (d - 0.84) / rw;
    float rd2 = (d - 0.52) / 0.072;
    float ring1 = exp(-rd1 * rd1);
    float ring2 = exp(-rd2 * rd2) * smoothstep(0.14, 0.45, vLife) * 0.52;
    float drop = (1.0 - smoothstep(0.0, 0.15, d)) * (1.0 - smoothstep(0.0, 0.20, vLife)) * 0.85;
    a = (ring1 * 0.78 + ring2 + drop) * vA * uSplashAlpha * step(d, 1.0);
    vec3 softL = vLight / (1.0 + vLight * 0.52);
    c = mix(softL * vec3(0.90, 0.95, 1.02) + 0.015, softL * vec3(0.96, 0.99, 1.04) + 0.02, uDownpour);
  }
  if (a < 0.002) discard;
  gl_FragColor = vec4(c, a);
}`;

export interface PrecipShared {
  uAOTex: THREE.IUniform<THREE.Texture>;
  uAOBounds: THREE.IUniform<THREE.Vector4>;
  uPoolTex: THREE.IUniform<THREE.Texture>;
  uPoolBounds: THREE.IUniform<THREE.Vector4>;
  uWindowGlow: THREE.IUniform<number>;
  beam: BeamUniforms;
  noise: THREE.Texture;
  ocean?: OceanService["shared"] | undefined;
}

export interface PrecipFrame {
  camera: THREE.PerspectiveCamera;
  /** Rig distance (m): the box, the speeds and the sizes scale with it. */
  distance: number;
  /** Ground-plane point the camera looks at. */
  target: THREE.Vector3;
  rain: number;
  snow: number;
  /** Wind vector on xz (0..~1 each). */
  wind: THREE.Vector2;
  /** Spray strength 0..1 (storm surf). */
  spray: number;
  flash: number;
  ambient: THREE.Color;
  /** Precip clock (s): frozen under reduced motion. */
  time: number;
  viewport: THREE.Vector2;
  budget: PrecipBudget;
  /** E25 (M+): the shared gust field (dir x, dir z, -, clock) the rain sheets follow, and their strength (0 = none). */
  gust?: THREE.Vector4;
  sheets?: number;
}

export class Precipitation {
  readonly fall: THREE.Mesh;
  readonly ground: THREE.Mesh;
  private readonly fallGeo: THREE.InstancedBufferGeometry;
  private readonly groundGeo: THREE.InstancedBufferGeometry;
  private readonly fallMat: THREE.ShaderMaterial;
  private readonly groundMat: THREE.ShaderMaterial;
  private readonly common: Record<string, THREE.IUniform>;
  private fallbackFft: THREE.DataArrayTexture | null = null;
  private fallbackSdf: THREE.DataTexture | null = null;
  private sprayCount = 0;
  private boxScale = 0;

  constructor(shared: PrecipShared) {
    const quad = (y0: number) => {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, y0, 0, 1, y0, 0, -1, 1, 0, 1, 1, 0]), 3));
      g.setIndex([0, 1, 2, 2, 1, 3]);
      return g;
    };
    this.common = {
      uBoxMin: { value: new THREE.Vector3() }, uBoxSize: { value: new THREE.Vector3(1, 1, 1) }, uPTime: { value: 0 },
      uAmbRain: { value: new THREE.Color() }, uFlashK: { value: 0 }, uFlashLift: { value: RAIN_FLASH_LIFT }, uCam: { value: new THREE.Vector3() },
      uPoolTex: shared.uPoolTex, uPoolBounds: shared.uPoolBounds, uWindowGlow: shared.uWindowGlow,
      uAOTex: shared.uAOTex, uAOBounds: shared.uAOBounds,
      uBeamPos: shared.beam.uBeamPos, uBeamCol: shared.beam.uBeamCol, uBeamAngle: shared.beam.uBeamAngle, uBeamShape: shared.beam.uBeamShape,
      uWindV: { value: new THREE.Vector2() }, uDownpour: { value: 0 },
    };

    // ---- falling rain + snow
    const R = rng(0x5eed);
    const seeds = new Float32Array(MAX_FALL * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = R();
    this.fallGeo = quad(0);
    this.fallGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    this.fallGeo.instanceCount = 0;
    this.fallMat = new THREE.ShaderMaterial({
      name: "hb_weather_fall", vertexShader: FALL_VERT, fragmentShader: FALL_FRAG,
      uniforms: {
        ...this.common,
        uSnowFrac: { value: 0 }, uFall: { value: new THREE.Vector3(60, 6, 0.036) }, uSize: { value: new THREE.Vector2(0.7, 0.6) },
        uViewport: { value: new THREE.Vector2(800, 500) }, uNearFade: { value: 100 },
        uRainAlpha: { value: 0.16 }, uSnowDrive: { value: 0 },
        uDepthK: { value: new THREE.Vector4(1e9, 2e9, 1, 1) }, uSheets: { value: new THREE.Vector4() },
      },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.fall = new THREE.Mesh(this.fallGeo, this.fallMat);
    this.fall.frustumCulled = false;
    this.fall.renderOrder = 80;
    this.fall.name = "weather-fall";
    this.fall.visible = false;

    // ---- splashes + spray
    this.groundGeo = quad(-1);
    const gs = new Float32Array((MAX_SPRAY + MAX_SPLASH) * 4);
    for (let i = 0; i < gs.length; i++) gs[i] = R();
    this.groundGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(gs, 4));
    this.groundGeo.setAttribute("aAnchor", new THREE.InstancedBufferAttribute(new Float32Array((MAX_SPRAY + MAX_SPLASH) * 4), 4));
    this.groundGeo.instanceCount = 0;
    const oc = shared.ocean;
    if (!oc) {
      const fd = new Uint8Array(6 * 4);
      for (let i = 0; i < 3; i++) fd[i * 4 + 3] = 255;
      this.fallbackFft = Object.assign(new THREE.DataArrayTexture(fd, 1, 1, 6), { needsUpdate: true });
      this.fallbackSdf = Object.assign(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), { needsUpdate: true });
    }
    this.groundMat = new THREE.ShaderMaterial({
      name: "hb_weather_ground", vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG,
      uniforms: {
        ...this.common,
        uSplashRate: { value: 2.5 }, uSplashSize: { value: 0.36 }, uSpray: { value: 0 }, uSprayScale: { value: 6 },
        uNoise: { value: shared.noise }, uSplashAlpha: { value: 0.24 },
        uOceanOn: { value: oc ? 1 : 0 },
        uTime: oc?.uTime ?? { value: 0 },
        uSea: oc?.uSea ?? { value: new THREE.Vector4() },
        uSdfBounds: oc?.uSdfBounds ?? { value: new THREE.Vector4(-1, -1, 1, 1) },
        uSdf: oc?.uSdf ?? { value: this.fallbackSdf },
        uSceneCenter: oc?.uSceneCenter ?? { value: new THREE.Vector2() },
        uFftAtlas: { value: null },
        uFftOn: oc?.uFftOn ?? { value: 0 },
        uFftScales: oc?.uFftScales ?? { value: new THREE.Vector4(1 / 509, 1 / 97, 1 / 17.3, 0.55) },
        uFftWeights: oc?.uFftWeights ?? { value: new THREE.Vector4(1, 1, 1, 1) },
      },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.groundMat.uniforms.uFftAtlas = oc?.uFftAtlas ?? { value: this.fallbackFft };
    this.ground = new THREE.Mesh(this.groundGeo, this.groundMat);
    this.ground.frustumCulled = false;
    this.ground.renderOrder = 79;
    this.ground.name = "weather-ground";
    this.ground.visible = false;
  }

  /** Bind ocean shared uniforms lazily when OceanSystem initializes after WeatherSystem (systems.ts order). */
  bindOcean(oc: OceanService["shared"]): void {
    const u = this.groundMat.uniforms;
    u.uOceanOn.value = 1;
    u.uTime = oc.uTime;
    u.uSea = oc.uSea;
    u.uSdfBounds = oc.uSdfBounds;
    u.uSdf = oc.uSdf;
    u.uSceneCenter = oc.uSceneCenter;
    u.uFftAtlas = oc.uFftAtlas;
    u.uFftOn = oc.uFftOn;
    u.uFftScales = oc.uFftScales;
    u.uFftWeights = oc.uFftWeights;
  }

  /** Spray anchors: points just off the surf line (x, z, outward normal). Instances [0, n) of the ground draw. */
  setSprayAnchors(points: ReadonlyArray<readonly [number, number, number, number]>): void {
    const n = Math.min(MAX_SPRAY, points.length);
    const a = this.groundGeo.getAttribute("aAnchor") as THREE.InstancedBufferAttribute;
    const s = this.groundGeo.getAttribute("aSeed") as THREE.InstancedBufferAttribute;
    const arr = a.array as Float32Array, sArr = s.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      arr.set([p[0], p[1], p[2], p[3]], i * 4);
      // Flag spray via negative aSeed.z so aAnchor.zw preserves the outward normal (nx, nz).
      sArr[i * 4 + 2] = -Math.max(1e-4, Math.abs(sArr[i * 4 + 2]));
    }
    for (let i = n; i < MAX_SPRAY + MAX_SPLASH; i++) sArr[i * 4 + 2] = Math.abs(sArr[i * 4 + 2]);
    a.needsUpdate = true;
    s.needsUpdate = true;
    this.sprayCount = n;
  }

  update(f: PrecipFrame): void {
    const D = f.distance;
    // the box: quantised to √2 steps of the zoom so the lattice only reshuffles at a few thresholds
    const scale = Math.pow(Math.SQRT2, Math.round(Math.log(D / 650) / Math.log(Math.SQRT2)));
    this.boxScale = scale;
    const S = 650 * scale;
    const cam = f.camera.position;
    const cx = cam.x + (f.target.x - cam.x) * 0.72, cz = cam.z + (f.target.z - cam.z) * 0.72;
    const size = this.common.uBoxSize.value.set(S * 1.25, Math.max(cam.y * 0.95, 40), S * 1.25);
    this.common.uBoxMin.value.set(cx - size.x / 2, 0, cz - size.z / 2);
    this.common.uPTime.value = f.time;
    this.common.uAmbRain.value.copy(f.ambient);
    this.common.uFlashK.value = f.flash;
    this.common.uCam.value.copy(cam);
    const windSpeed = 0.11 * S;            // stylised: the drift reads at diorama scale
    this.common.uWindV.value.set(f.wind.x * windSpeed, f.wind.y * windSpeed);

    const precip = f.rain + f.snow;
    const rain01 = Math.min(1, Math.max(0, f.rain));
    const fu = this.fallMat.uniforms;
    const nFall = Math.round(f.budget.fall * Math.min(1, precip));
    this.fallGeo.instanceCount = nFall;
    this.fall.visible = nFall > 0;
    fu.uSnowFrac.value = precip > 1e-4 ? f.snow / precip : 0;
    fu.uFall.value.set(0.13 * S, 0.016 * S, 0.029 + 0.015 * rain01);
    fu.uSize.value.set(0.56 + 0.44 * rain01, 0.0006 * S);
    fu.uSnowDrive.value = Math.min(1, Math.max(0, (f.wind.length() - 0.5) / 0.5));
    fu.uViewport.value.set(f.viewport.x / 2, f.viewport.y / 2);
    fu.uNearFade.value = D * 0.28;
    if (extraEnabled("precip")) fu.uDepthK.value.set(FAR_FADE[0] * D, FAR_FADE[1] * D, FAR_FLOOR, FAR_STREAK);
    fu.uSheets.value.set(f.gust?.x ?? 0, f.gust?.y ?? 0, f.gust?.w ?? 0, extraEnabled("precip") ? f.sheets ?? 0 : 0);
    // barely a whisper in WATCH drizzle, heavy slate-silver curtains in WARNING/DANGER
    fu.uRainAlpha.value = 0.036 + 0.44 * Math.pow(rain01, 1.35);
    const downpour = Math.max(0, (rain01 - 0.3) / 0.7);
    this.common.uDownpour.value = downpour;

    const gu = this.groundMat.uniforms;
    const nSplash = Math.round(f.budget.splash * Math.min(1, rain01 * 1.15));
    const spray = f.spray > 0.01 ? this.sprayCount : 0;
    // instances [0, sprayCount) are spray anchors: draw them only when there is spray, splashes after them
    this.groundGeo.instanceCount = nSplash > 0 ? this.sprayCount + nSplash : spray;
    this.ground.visible = this.groundGeo.instanceCount > 0;
    gu.uSpray.value = f.spray;
    gu.uSprayScale.value = 0.0048 * S;
    // realistically scaled concentric ripple radii (shader hard-caps rendered radius <= 0.24 m, diameter <= 0.48 m)
    gu.uSplashSize.value = Math.min(0.21, Math.max(0.14, 0.00030 * S)) * (1 + 0.14 * downpour);
    gu.uSplashAlpha.value = 0.09 + 0.6 * Math.pow(rain01, 1.1);
  }

  /** Current box scale (tests / debug). */
  get scale(): number { return this.boxScale; }

  dispose(): void {
    this.fall.removeFromParent();
    this.ground.removeFromParent();
    this.fallGeo.dispose();
    this.groundGeo.dispose();
    this.fallMat.dispose();
    this.groundMat.dispose();
    this.fallbackFft?.dispose();
    this.fallbackSdf?.dispose();
  }
}
