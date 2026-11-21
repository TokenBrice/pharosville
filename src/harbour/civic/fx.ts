import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";

/**
 * Civic effects, all motion in the shaders (the CPU sets a handful of uniforms per frame):
 *  - Smoke:  camera-facing puffs from N emitters sharing one look (rate, rise, size, density, darkness)
 *  - Flames: crossed tongue cards, cylindrically billboarded, HDR so they bloom
 *  - Embers: points spat up from a fire, curling downwind
 *  - Glints: additive sprites that flash and decay (the coin struck by a press)
 *  - glowMaterial: furnace mouths / fire beds, emissive × an own level (not the lamp clock: a furnace burns by day)
 */

const QUAD = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
}

// ------------------------------------------------------------------ smoke

const SMOKE_VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute vec4 aSeed;          // x slot 0..1, y rand, z rand, w emitter rand
uniform float uT;
uniform float uRate;           // puff cycles per second
uniform float uRise;           // metres risen over a life
uniform float uSize0;
uniform float uSize1;
uniform float uDrift;          // downwind travel (m) at full wind
uniform vec4 uWind;            // xy downwind (x, z), z strength 0..1
uniform float uBend;           // extra early lean (0 = a column that bends only late)
varying vec2 vUv;
varying float vAlpha;
varying float vLife;
varying vec2 vSeed;
void main() {
  vSeed = aSeed.yz;
  float life = fract(uT * uRate * (0.85 + 0.3 * aSeed.w) + aSeed.x);
  float w = uWind.z;
  float rise = uRise * (1.0 - 0.35 * w) * (1.0 - exp(-life * 2.4)) * 1.1;
  float drift = (0.25 + w) * uDrift * life * life + (0.08 + uBend) * uDrift * life;
  vec3 c = aOrigin + vec3(uWind.x * drift, rise, uWind.y * drift);
  float ph = uT * 0.24 + aSeed.y * 6.2831 + life * 3.6;
  // organic horizontal curl & downwind dispersion (turns stiff flue rods into graceful drifting wisps)
  c.xz += vec2(sin(ph), cos(ph * 0.79)) * (0.65 + 0.28 * uSize1 * life) + (aSeed.zw - 0.5) * (1.1 + uSize1 * 0.72) * life;
  float size = mix(uSize0, uSize1, life) * (0.78 + 0.44 * aSeed.z);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = c + (right * position.x + up * position.y) * size;
  vUv = position.xy;
  vLife = life;
  vAlpha = smoothstep(0.0, 0.08, life) * pow(max(1.0 - smoothstep(0.32, 0.98, life), 0.0), 1.05);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const SMOKE_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uRim;
uniform vec3 uUnder;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
varying float vLife;
varying vec2 vSeed;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = vSeed.x * 6.2831 + vLife * 0.65;
  float ca = cos(ang), sa = sin(ang);
  vec2 rUv = mat2(ca, -sa, sa, ca) * vUv;
  float n1 = texture2D(uNoise, rUv * 0.30 + vSeed + vLife * 0.22).r;
  float n2 = texture2D(uNoise, rUv * 0.70 - vSeed * 1.3 + vec2(0.25, vLife * 0.36)).g;
  float billow = n1 * 0.64 + n2 * 0.36;
  // airy gossamer erosion: billows gracefully from the emitter and drifts out as translucent silver-incense mist
  float a = pow(max(1.0 - r * r, 0.0), 1.45) * smoothstep(0.18, 0.72, billow * 1.26 - r * 0.36 + 0.18);
  if (a < 0.005) discard;
  float topShade = clamp(0.55 + 0.45 * vUv.y + (billow - 0.5) * 0.38, 0.0, 1.0);
  vec3 col = mix(uShade, uLit, topShade);
  // delicate silver-warm sunlit windward edge by day (never opaque peach cotton)
  float rimEdge = smoothstep(0.28, 0.78, r) * (1.0 - smoothstep(0.78, 1.0, r)) * smoothstep(-0.1, 0.75, vUv.y);
  col += uRim * (rimEdge * 0.46 + smoothstep(0.54, 0.90, billow) * smoothstep(0.05, 0.8, vUv.y) * 0.20);
  // fire under the stack glows warmly up through the young smoke column at dusk/night
  col += uUnder * (1.0 - smoothstep(0.0, 0.46, vLife)) * clamp(0.76 - 0.65 * vUv.y + (0.5 - billow) * 0.22, 0.0, 1.0);
  gl_FragColor = vec4(col, a * vAlpha * uOpacity * (1.0 - 0.36 * vLife));
}`;

export interface SmokeLook {
  rate: number; rise: number; size0: number; size1: number; drift: number;
  /** Lean from the start (0 default: the column rises, then bends downwind). */
  bend?: number;
  opacity: number;
  /** 0 white wood smoke … 1 black coal / burn smoke. */
  darkness: number;
  /** Fire light from below (linear rgb, × night by the caller). */
  under?: THREE.Color;
}

export class Smoke {
  readonly mesh: THREE.Mesh;
  readonly u = {
    uT: { value: 0 }, uRate: { value: 0.06 }, uRise: { value: 20 }, uSize0: { value: 1.5 }, uSize1: { value: 8 },
    uDrift: { value: 30 }, uWind: { value: new THREE.Vector4(0.8, -0.55, 0.3, 0) }, uBend: { value: 0 },
    uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uUnder: { value: new THREE.Color(0, 0, 0) },
    uOpacity: { value: 0.3 }, uNoise: { value: null as THREE.Texture | null },
  };
  private t = 0;
  private readonly tmp = new THREE.Color();

  constructor(origins: readonly THREE.Vector3[], puffs: number, noise: THREE.Texture, seed = 11) {
    this.u.uNoise.value = noise;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(QUAD, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const n = origins.length * puffs;
    const o = new Float32Array(n * 3), s = new Float32Array(n * 4);
    const r = rng(seed);
    origins.forEach((p, e) => {
      const er = r();
      for (let k = 0; k < puffs; k++) {
        const i = e * puffs + k;
        o.set([p.x, p.y, p.z], i * 3);
        s.set([k / puffs + er * 0.13, r(), r(), er], i * 4);
      }
    });
    g.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(o, 3));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(s, 4));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, uniforms: this.u, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    m.name = "hb_civic_smoke";
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  update(dt: number, look: SmokeLook, windTo: readonly [number, number], wind: number, u: WorldUniforms): void {
    this.t += dt;
    const U = this.u;
    U.uT.value = this.t;
    U.uRate.value = look.rate; U.uRise.value = look.rise; U.uSize0.value = look.size0; U.uSize1.value = look.size1;
    U.uDrift.value = look.drift; U.uOpacity.value = look.opacity * 0.96; U.uBend.value = look.bend ?? 0;
    U.uWind.value.set(windTo[0], windTo[1], wind, 0);
    const lit = U.uLit.value, shade = U.uShade.value, rim = U.uRim.value, t = this.tmp;
    // Desaturate sunlit smoke scatter toward neutral silver-pearl so golden/dawn plumes stay airy incense, never pink cotton
    const sun = u.uSunColor.value;
    const sunL = 0.2126 * sun.r + 0.7152 * sun.g + 0.0722 * sun.b;
    const sr = sun.r * 0.36 + sunL * 0.64, sg = sun.g * 0.36 + sunL * 0.64, sb = sun.b * 0.36 + sunL * 0.64;
    lit.copy(u.uHemiSky.value).add(t.setRGB(sr, sg, sb).multiplyScalar(0.16)).multiply(t.setRGB(0.92, 0.92, 0.93));
    shade.copy(u.uHemiSky.value).multiplyScalar(0.54).add(t.copy(u.uHemiGround.value).multiplyScalar(0.26)).multiply(t.setRGB(0.76, 0.78, 0.84));
    rim.setRGB(sr, sg, sb).multiplyScalar(0.14 * (1 - u.uNight.value));
    // coal / burn smoke: soft cool-ash charcoal in the shade, gently warmed rather than salmon-orange
    const d = THREE.MathUtils.clamp(look.darkness, 0, 1);
    lit.multiplyScalar(1 - 0.56 * d).multiply(t.setRGB(1, 1 - 0.03 * d, 1 - 0.05 * d));
    shade.multiplyScalar(1 - 0.74 * d);
    rim.multiplyScalar(1 - 0.55 * d);
    U.uUnder.value.copy(look.under ?? t.setRGB(0, 0, 0));
    this.mesh.visible = look.opacity > 0.005;
  }

  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

// ------------------------------------------------------------------ flames

const FLAME_VERT = /* glsl */ `
attribute vec4 aCard;        // x, z offset (m, unscaled), width, height
attribute vec3 aSeed;        // x phase, y rand, z yaw offset (crossed sheets)
uniform vec3 uOrigin;
uniform float uFireT;
uniform float uLevel;
uniform float uScale;
varying vec2 vUv;
varying vec3 vSeed;
void main() {
  vec3 c = uOrigin + vec3(aCard.x, 0.0, aCard.y) * uScale;
  vec3 toCam = cameraPosition - c; toCam.y = 0.0;
  vec3 fwd = normalize(toCam + vec3(1e-4, 0.0, 0.0));
  float cy = cos(aSeed.z), sy = sin(aSeed.z);
  vec3 f2 = vec3(fwd.x * cy - fwd.z * sy, 0.0, fwd.x * sy + fwd.z * cy);
  vec3 right = vec3(f2.z, 0.0, -f2.x);
  float lv = clamp(uLevel, 0.0, 1.6);
  float ph = aSeed.x * 6.2831;
  float sway = (sin(uFireT * (1.8 + aSeed.y) + ph) * 0.2 + sin(uFireT * 4.6 + ph * 2.1) * 0.07);
  float leap = 0.72 + 0.18 * sin(uFireT * (2.4 + aSeed.y * 1.5) + ph * 1.7) + 0.1 * sin(uFireT * 5.7 + ph * 3.1);
  float h = aCard.w * uScale * leap * mix(0.2, 1.0, lv);
  float wdt = aCard.z * uScale * mix(0.6, 1.0, min(lv, 1.0));
  vec2 q = position.xy;
  vec3 p = c + right * (q.x * wdt + sway * q.y * q.y * wdt) + vec3(0.0, q.y * h, 0.0);
  p += fwd * 0.3 * uScale;
  vUv = vec2(q.x + 0.5, q.y);
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

// premultiplied over-additive blending preserves sculpted molten-gold/orange/crimson tongues instead of whiteout
const FLAME_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uFireT;
uniform float uLevel;
uniform float uGain;
varying vec2 vUv;
varying vec3 vSeed;
void main() {
  float u = vUv.x - 0.5, v = vUv.y;
  float sp = 0.56 + 0.34 * vSeed.y;
  float wob = texture2D(uNoise, vec2(v * 0.38 + vSeed.x, uFireT * 0.25 * sp + vSeed.y)).r - 0.5;
  float hw = mix(0.47, 0.05, pow(max(v, 0.0), 0.74));
  float uShift = u - wob * 0.32 * v;
  float env = 1.0 - smoothstep(hw * 0.45, hw, abs(uShift));
  vec2 nuv = vec2(uShift * 1.05 + vSeed.x, v * 0.38 - uFireT * (0.58 * sp + 0.18));
  float n = texture2D(uNoise, nuv).g * 0.58 + texture2D(uNoise, nuv * 2.2 + vec2(0.37, -uFireT * 0.18)).b * 0.44;
  float a = env * smoothstep(v * 1.06 - 0.07, v * 1.06 + 0.16, n * 1.28 + 0.14) * smoothstep(0.0, 0.06, v);
  if (a < 0.01) discard;
  float core = (1.0 - smoothstep(0.0, 0.42, abs(uShift) / max(hw, 0.05))) * (1.0 - smoothstep(0.05, 0.56, v));
  float heat = clamp(a * pow(clamp(1.0 - v, 0.0, 1.0), 0.78) * 0.8 + core * 0.58 - 0.05, 0.0, 1.0);
  vec3 soot = vec3(0.55, 0.04, 0.008), tip = vec3(0.95, 0.2, 0.02), body2 = vec3(1.0, 0.45, 0.06), gold = vec3(1.0, 0.78, 0.28), white = vec3(1.0, 0.94, 0.72);
  vec3 col = heat < 0.25 ? mix(soot, tip, heat / 0.25)
    : heat < 0.55 ? mix(tip, body2, (heat - 0.25) / 0.3)
    : heat < 0.8 ? mix(body2, gold, (heat - 0.55) / 0.25)
    : mix(gold, white, (heat - 0.8) / 0.2);
  float k = a * min(uLevel, 1.0);
  gl_FragColor = vec4(col * k * uGain * (0.65 + 0.95 * heat), k * 0.76);
}`;

export class Flames {
  readonly mesh: THREE.Mesh;
  readonly u = {
    uOrigin: { value: new THREE.Vector3() }, uFireT: { value: 0 }, uLevel: { value: 1 }, uGain: { value: 3 },
    uScale: { value: 1 }, uNoise: { value: null as THREE.Texture | null },
  };
  private t = 0;

  /** Cards sized for a ~1 m-radius fire at scale 1. */
  constructor(origin: THREE.Vector3, noise: THREE.Texture, cards = 7, seed = 41) {
    this.u.uNoise.value = noise;
    this.u.uOrigin.value.copy(origin);
    const r = rng(seed);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const ca = new Float32Array(cards * 4), sa = new Float32Array(cards * 3);
    for (let i = 0; i < cards; i++) {
      const core = i < Math.max(3, Math.floor(cards * 0.35));
      const rr = i === 0 ? 0 : core ? 0.12 + r() * 0.35 : 0.35 + r() * 0.55;
      const th = r() * Math.PI * 2;
      ca.set([Math.cos(th) * rr, Math.sin(th) * rr, core ? 1.35 + r() * 0.45 : 0.75 + r() * 0.5, core ? 2.65 + r() * 0.65 : 1.45 + r() * 0.9], i * 4);
      sa.set([r(), r(), (r() - 0.5) * (core ? 0.95 : 1.45)], i * 3);
    }
    g.setAttribute("aCard", new THREE.InstancedBufferAttribute(ca, 4));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(sa, 3));
    g.instanceCount = cards;
    const m = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, uniforms: this.u,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    m.name = "hb_civic_flames";
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
  }

  update(dt: number, level: number, scale: number, night: number, moving: boolean): void {
    if (moving) this.t += dt;
    this.u.uFireT.value = this.t;
    this.u.uLevel.value = level;
    this.u.uScale.value = scale;
    this.u.uGain.value = 1.15 + 1.45 * night;
    this.mesh.visible = level > 0.02;
  }

  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

// ------------------------------------------------------------------ embers

const EMBER_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uOrigin;
uniform float uT;
uniform float uLevel;
uniform float uRadius;
uniform float uHeight;
uniform vec4 uWind;
uniform float uPx;
varying float vA;
varying float vLife;
void main() {
  float life = fract(uT * (0.15 + 0.12 * aSeed.y) + aSeed.x);
  float ang = aSeed.z * 6.2831;
  float r = uRadius * (0.28 + 1.75 * life * (0.38 + aSeed.w));
  float swirl = ang + life * (2.6 + 1.2 * aSeed.y);
  vec3 p = uOrigin + vec3(cos(swirl) * r, 0.5 + life * uHeight * (0.58 + 0.85 * aSeed.y), sin(swirl) * r);
  p.xz += uWind.xy * (1.2 + 11.0 * uWind.z) * life * life;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float on = step(aSeed.w, clamp(uLevel, 0.0, 1.0) * 0.85 + 0.15);
  float flick = 0.54 + 0.46 * sin(uT * (11.0 + 7.0 * aSeed.y) + aSeed.w * 40.0);
  vA = on * min(uLevel, 1.2) * (1.0 - smoothstep(0.48, 1.0, life)) * smoothstep(0.0, 0.05, life) * flick;
  vLife = life;
  float sz = (0.20 + 0.14 * aSeed.y) * (1.0 - 0.35 * life);
  gl_PointSize = clamp(sz * uPx / max(-mv.z, 1.0), 1.2, 4.5);
}`;

const EMBER_FRAG = /* glsl */ `
uniform float uGain;
uniform vec3 uColor;
varying float vA;
varying float vLife;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  float glow = exp(-d * 3.6) * (1.0 - d);
  vec3 hot = mix(uColor, vec3(1.0, 0.88, 0.52), 0.65);
  vec3 cool = vec3(0.85, 0.14, 0.02);
  vec3 c = mix(hot, cool, smoothstep(0.0, 0.72, vLife));
  gl_FragColor = vec4(c * glow * vA * uGain * 1.35, 1.0);
}`;

export class Embers {
  readonly points: THREE.Points;
  readonly u = {
    uOrigin: { value: new THREE.Vector3() }, uT: { value: 0 }, uLevel: { value: 1 }, uRadius: { value: 1 }, uHeight: { value: 10 },
    uWind: { value: new THREE.Vector4(0.8, -0.5, 0.3, 0) }, uPx: { value: 800 }, uGain: { value: 4 },
    uColor: { value: new THREE.Color(1.0, 0.42, 0.09) },
  };
  private t = 0;

  constructor(origin: THREE.Vector3, count: number, seed = 73) {
    this.u.uOrigin.value.copy(origin);
    const r = rng(seed);
    const g = new THREE.BufferGeometry();
    const s = new Float32Array(count * 4);
    for (let i = 0; i < s.length; i++) s[i] = r();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(s, 4));
    const m = new THREE.ShaderMaterial({
      vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, uniforms: this.u, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    m.name = "hb_civic_embers";
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 11;
  }

  update(dt: number, level: number, radius: number, height: number, windTo: readonly [number, number], wind: number, camera: THREE.PerspectiveCamera, viewportH: number, night: number, moving: boolean): void {
    if (moving) this.t += dt;
    const U = this.u;
    U.uT.value = this.t; U.uLevel.value = level; U.uRadius.value = radius; U.uHeight.value = height;
    U.uWind.value.set(windTo[0], windTo[1], wind, 0);
    U.uPx.value = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    U.uGain.value = 1.6 + 3.5 * night;
    this.points.visible = level > 0.02 && moving;
  }

  dispose(): void { this.points.geometry.dispose(); (this.points.material as THREE.Material).dispose(); }
}

// ------------------------------------------------------------------ glints

const GLINT_VERT = /* glsl */ `
attribute vec3 aAt;
attribute float aK;
uniform float uSize;
varying vec2 vQ;
varying float vK;
void main() {
  vQ = position.xy;
  vK = aK;
  vec4 mv = viewMatrix * vec4(aAt, 1.0);
  mv.xyz += normalize(-mv.xyz) * 0.8;
  mv.xy += position.xy * uSize * (0.4 + 0.6 * aK);
  gl_Position = projectionMatrix * mv;
}`;

const GLINT_FRAG = /* glsl */ `
uniform vec3 uCol;
varying vec2 vQ;
varying float vK;
void main() {
  float r2 = dot(vQ, vQ);
  // a soft core + a four-point star: struck gold catching the light
  float star = exp(-abs(vQ.x) * 22.0) * exp(-abs(vQ.y) * 2.5) + exp(-abs(vQ.y) * 22.0) * exp(-abs(vQ.x) * 2.5);
  float g = exp(-r2 * 16.0) + 0.55 * star;
  gl_FragColor = vec4(uCol * g * vK * (1.0 - smoothstep(0.6, 1.0, r2)), 1.0);
}`;

export class Glints {
  readonly mesh: THREE.Mesh;
  private readonly k: THREE.InstancedBufferAttribute;
  readonly u = { uSize: { value: 1.6 }, uCol: { value: new THREE.Color(1.0, 0.72, 0.28) } };

  constructor(at: readonly THREE.Vector3[]) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(QUAD, 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const a = new Float32Array(at.length * 3);
    at.forEach((p, i) => a.set([p.x, p.y, p.z], i * 3));
    g.setAttribute("aAt", new THREE.InstancedBufferAttribute(a, 3));
    this.k = new THREE.InstancedBufferAttribute(new Float32Array(at.length), 1);
    this.k.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aK", this.k);
    g.instanceCount = at.length;
    const m = new THREE.ShaderMaterial({
      vertexShader: GLINT_VERT, fragmentShader: GLINT_FRAG, uniforms: this.u, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    m.name = "hb_civic_glints";
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
  }

  set(i: number, k: number): void { this.k.array[i] = k; }
  commit(sizeM: number, gain: number): void { this.k.needsUpdate = true; this.u.uSize.value = sizeM; this.u.uCol.value.setRGB(1.0, 0.72, 0.28).multiplyScalar(gain); }

  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

// ------------------------------------------------------------------ glow material

/** Furnace mouths, coal beds, the fire bowl: emissive × level (own uniform; a furnace burns by day too). */
export function glowMaterial(level: THREE.IUniform<number>, glowHex = "#FF8A3A", baseHex = "#2A1A12"): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(baseHex), roughness: 0.6, metalness: 0, emissive: new THREE.Color(glowHex) });
  m.name = "hb_civic_glow";
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowLevel = level;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uGlowLevel;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uGlowLevel;");
  };
  m.customProgramCacheKey = () => "hb_civic_glow";
  return m;
}
