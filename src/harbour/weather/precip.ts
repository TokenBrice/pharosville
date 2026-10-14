import * as THREE from "three";
import type { BeamUniforms } from "../beam/uniforms";

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
  vec3 L = uAmbRain + vec3(0.72, 0.78, 1.0) * uFlashK * 2.2;
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

const FALL_VERT = /* glsl */ `
${COMMON}
attribute vec4 aSeed;
uniform float uSnowFrac;      // share of the drawn instances that are snow
uniform vec3 uFall;           // rain fall (m/s), snow fall (m/s), streak exposure (s)
uniform vec2 uWindV;          // drift (m/s) on xz
uniform vec2 uSize;           // rain width (px), flake radius (m)
uniform vec2 uViewport;
uniform vec3 uCam;
uniform float uNearFade;      // view depth (m) under which drops fade (no giant streaks at the lens)
uniform float uRainAlpha;
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
    vec3 tail = p - vel * uFall.z;
    vec4 c0 = projectionMatrix * viewMatrix * vec4(tail, 1.0);
    vec4 c1 = projectionMatrix * viewMatrix * vec4(p, 1.0);
    vec2 s0 = c0.xy / c0.w * uViewport, s1 = c1.xy / c1.w * uViewport;
    vec2 d = s1 - s0;
    float len = length(d);
    vec2 dir = len > 1e-3 ? d / len : vec2(0.0, -1.0);
    vec2 n = vec2(-dir.y, dir.x);
    vec4 c = mix(c0, c1, corner.y);
    float w = uSize.x * (0.8 + 0.5 * h);
    c.xy += n * corner.x * w / uViewport * c.w;
    gl_Position = c;
    vUv = corner;
    // thin far drops stay faint; a short streak (seen end-on) does not flash bright
    vA = fade * uRainAlpha * (0.45 + 0.55 * h) * smoothstep(1.0, 6.0, len);
  }
}`;

const FALL_FRAG = /* glsl */ `
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
    float across = 1.0 - abs(vUv.x);
    a = across * across * smoothstep(0.0, 0.55, vUv.y) * vA;
    c = vLight;
  }
  if (a < 0.003) discard;
  gl_FragColor = vec4(c, a);
}`;

const GROUND_VERT = /* glsl */ `
${COMMON}
attribute vec4 aSeed;          // splash: xz seed, phase, size | spray: phase, -, -, size
attribute vec4 aAnchor;        // spray: x, z, outward nx, nz (w = 1) | splash: w = 0
uniform float uSplashRate;     // splash cycles per second
uniform float uSplashSize;     // ring radius (m)
uniform float uSpray;          // spray strength 0..1
uniform vec2 uWindV;
uniform float uSprayScale;     // plume size (m)
varying vec2 vUv;
varying float vA;
varying float vKind;
varying float vLife;
varying vec3 vLight;
void main() {
  vec2 corner = position.xy * 2.0 - 1.0;
  if (aAnchor.w > 0.5) {
    // ---- spray plume: bursts off the surf, blown downwind, rising and thinning
    float cyc = uPTime / (2.2 + aSeed.y * 1.6) + aSeed.x;
    float life = fract(cyc);
    float on = step(pHash(vec2(floor(cyc), aSeed.x * 91.0)), uSpray * 0.45);
    vec2 wdir = uWindV / max(length(uWindV), 1e-3);
    vec2 base = aAnchor.xy + aAnchor.zw * 2.0;
    vec2 xz = base + wdir * life * uSprayScale * 1.6 + aAnchor.zw * life * uSprayScale * 0.3;
    float rise = uSprayScale * (0.2 + 1.1 * life) * (0.6 + 0.6 * aSeed.w);
    float r = uSprayScale * (0.35 + 0.9 * life) * (0.7 + 0.6 * aSeed.w);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 c = vec3(xz.x, rise, xz.y);
    vec3 wp = c + (right * corner.x + up * corner.y) * r * on;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vUv = corner;
    vA = sin(3.14159 * life) * smoothstep(0.0, 0.12, life) * uSpray * on;
    vKind = 1.0;
    vLife = life;
    vLight = dropLight(c);
  } else {
    // ---- rain splash: a ring spreading on whatever the drop hit, at a new spot every cycle
    float cyc = uPTime * uSplashRate * (0.8 + 0.4 * aSeed.w) + aSeed.z;
    float life = fract(cyc);
    float id = floor(cyc);
    vec2 q = vec2(pHash(aSeed.xy * 97.0 + id * 1.37), pHash(aSeed.yx * 89.0 + id * 2.11));
    vec2 xz = uBoxMin.xz + q * uBoxSize.xz;
    float y = groundAt(xz) + 0.06;
    float r = uSplashSize * (0.25 + 0.95 * life) * (0.7 + 0.6 * aSeed.w);
    vec3 wp = vec3(xz.x + corner.x * r, y, xz.y + corner.y * r);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vUv = corner;
    vec3 qb = (vec3(xz.x, 0.0, xz.y) - uBoxMin) / uBoxSize;
    float edge = smoothstep(0.0, 0.08, qb.x) * (1.0 - smoothstep(0.92, 1.0, qb.x)) * smoothstep(0.0, 0.08, qb.z) * (1.0 - smoothstep(0.92, 1.0, qb.z));
    vA = (1.0 - life) * edge;
    vKind = 0.0;
    vLife = life;
    vLight = dropLight(vec3(xz.x, y + 1.0, xz.y));
  }
}`;

const GROUND_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uSplashAlpha;
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
    float n = texture2D(uNoise, vUv * 0.22 + vLife * 0.13 + 0.31).r * 0.7 + texture2D(uNoise, vUv * 0.5 - vLife * 0.21).g * 0.5;
    // torn mist, not a puff: noise eats most of the disc, the core thins as it rises
    float m = 1.0 - smoothstep(0.15, 1.0, d + (n - 0.55) * 0.9);
    a = m * smoothstep(0.4, 0.8, n + 0.25 * (1.0 - d)) * vA * 0.38;
    c = vLight * 1.15 + 0.03;
  } else {
    float ring = exp(-pow((d - 0.78) / 0.11, 2.0));
    float drop = (1.0 - smoothstep(0.0, 0.22, d)) * (1.0 - smoothstep(0.0, 0.25, vLife));
    a = (ring * 0.8 + drop) * vA * uSplashAlpha * step(d, 1.0);
    c = vLight * 1.3 + 0.02;
  }
  if (a < 0.003) discard;
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
}

export class Precipitation {
  readonly fall: THREE.Mesh;
  readonly ground: THREE.Mesh;
  private readonly fallGeo: THREE.InstancedBufferGeometry;
  private readonly groundGeo: THREE.InstancedBufferGeometry;
  private readonly fallMat: THREE.ShaderMaterial;
  private readonly groundMat: THREE.ShaderMaterial;
  private readonly common: Record<string, THREE.IUniform>;
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
      uAmbRain: { value: new THREE.Color() }, uFlashK: { value: 0 },
      uPoolTex: shared.uPoolTex, uPoolBounds: shared.uPoolBounds, uWindowGlow: shared.uWindowGlow,
      uAOTex: shared.uAOTex, uAOBounds: shared.uAOBounds,
      uBeamPos: shared.beam.uBeamPos, uBeamCol: shared.beam.uBeamCol, uBeamAngle: shared.beam.uBeamAngle, uBeamShape: shared.beam.uBeamShape,
      uWindV: { value: new THREE.Vector2() },
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
        uSnowFrac: { value: 0 }, uFall: { value: new THREE.Vector3(60, 6, 0.04) }, uSize: { value: new THREE.Vector2(1.3, 0.6) },
        uViewport: { value: new THREE.Vector2(800, 500) }, uCam: { value: new THREE.Vector3() }, uNearFade: { value: 100 },
        uRainAlpha: { value: 0.4 }, uSnowDrive: { value: 0 },
      },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
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
    this.groundMat = new THREE.ShaderMaterial({
      name: "hb_weather_ground", vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG,
      uniforms: {
        ...this.common,
        uSplashRate: { value: 2.2 }, uSplashSize: { value: 1.2 }, uSpray: { value: 0 }, uSprayScale: { value: 6 },
        uNoise: { value: shared.noise }, uSplashAlpha: { value: 0.5 },
      },
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    });
    this.ground = new THREE.Mesh(this.groundGeo, this.groundMat);
    this.ground.frustumCulled = false;
    this.ground.renderOrder = 79;
    this.ground.name = "weather-ground";
    this.ground.visible = false;
  }

  /** Spray anchors: points just off the surf line (x, z, outward normal). Instances [0, n) of the ground draw. */
  setSprayAnchors(points: ReadonlyArray<readonly [number, number, number, number]>): void {
    const n = Math.min(MAX_SPRAY, points.length);
    const a = this.groundGeo.getAttribute("aAnchor") as THREE.InstancedBufferAttribute;
    const arr = a.array as Float32Array;
    for (let i = 0; i < n; i++) { const p = points[i]; arr.set([p[0], p[1], p[2], p[3]], i * 4); }
    for (let i = n; i < MAX_SPRAY + MAX_SPLASH; i++) arr[i * 4 + 3] = 0;
    // splashes sit after the anchors; their anchor.w stays 0
    for (let i = 0; i < n; i++) arr[i * 4 + 3] = 1;
    a.needsUpdate = true;
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
    const windSpeed = 0.11 * S;            // stylised: the drift reads at diorama scale
    this.common.uWindV.value.set(f.wind.x * windSpeed, f.wind.y * windSpeed);

    const precip = f.rain + f.snow;
    const fu = this.fallMat.uniforms;
    const nFall = Math.round(f.budget.fall * Math.min(1, precip));
    this.fallGeo.instanceCount = nFall;
    this.fall.visible = nFall > 0;
    fu.uSnowFrac.value = precip > 1e-4 ? f.snow / precip : 0;
    fu.uFall.value.set(0.13 * S, 0.016 * S, 0.042);
    fu.uSize.value.set(0.95, 0.0006 * S);
    fu.uSnowDrive.value = Math.min(1, Math.max(0, (f.wind.length() - 0.5) / 0.5));
    fu.uViewport.value.set(f.viewport.x / 2, f.viewport.y / 2);
    fu.uCam.value.copy(cam);
    fu.uNearFade.value = D * 0.22;
    // drizzle is fine and faint, a storm's sheets denser and brighter
    fu.uRainAlpha.value = 0.2 + 0.24 * Math.min(1, f.rain * 1.3);

    const gu = this.groundMat.uniforms;
    const nSplash = Math.round(f.budget.splash * Math.min(1, f.rain * 1.2));
    const spray = f.spray > 0.01 ? this.sprayCount : 0;
    // instances [0, sprayCount) are spray anchors: draw them only when there is spray, splashes after them
    this.groundGeo.instanceCount = nSplash > 0 ? this.sprayCount + nSplash : spray;
    this.ground.visible = this.groundGeo.instanceCount > 0;
    gu.uSpray.value = f.spray;
    gu.uSprayScale.value = 0.0042 * S;
    gu.uSplashSize.value = 0.0021 * S;
    gu.uSplashAlpha.value = 0.35 + 0.35 * Math.min(1, f.rain);
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
  }
}
