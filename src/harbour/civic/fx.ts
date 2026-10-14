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
varying vec2 vUv;
varying float vAlpha;
varying float vLife;
varying vec2 vSeed;
void main() {
  vSeed = aSeed.yz;
  float life = fract(uT * uRate * (0.85 + 0.3 * aSeed.w) + aSeed.x);
  float w = uWind.z;
  float rise = uRise * (1.0 - 0.35 * w) * (1.0 - exp(-life * 2.4)) * 1.1;
  float drift = (0.25 + w) * uDrift * life * life + 0.08 * uDrift * life;
  vec3 c = aOrigin + vec3(uWind.x * drift, rise, uWind.y * drift);
  float ph = uT * 0.22 + aSeed.y * 6.28 + life * 3.0;
  c.xz += vec2(sin(ph), cos(ph * 0.83)) * (0.3 + 0.12 * uSize1 * life) + (aSeed.zw - 0.5) * uSize1 * 0.5 * life;
  float size = mix(uSize0, uSize1, life) * (0.8 + 0.4 * aSeed.z);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = c + (right * position.x + up * position.y) * size;
  vUv = position.xy;
  vLife = life;
  vAlpha = smoothstep(0.0, 0.07, life) * (1.0 - smoothstep(0.4, 1.0, life));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const SMOKE_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uUnder;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
varying float vLife;
varying vec2 vSeed;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float n = texture2D(uNoise, vUv * 0.3 + vSeed + vLife * 0.2).r;
  float a = pow(1.0 - r * r, 1.4) * smoothstep(0.12, 0.7, n * 1.25 - r * 0.3 + 0.22);
  vec3 col = mix(uShade, uLit, clamp(0.62 + 0.5 * vUv.y, 0.0, 1.0));
  // a fire under the stack lights the young smoke from below
  col += uUnder * (1.0 - smoothstep(0.0, 0.3, vLife)) * clamp(0.6 - 0.6 * vUv.y, 0.0, 1.0);
  gl_FragColor = vec4(col, a * vAlpha * uOpacity * (1.0 - 0.45 * vLife));
}`;

export interface SmokeLook {
  rate: number; rise: number; size0: number; size1: number; drift: number;
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
    uDrift: { value: 30 }, uWind: { value: new THREE.Vector4(0.8, -0.55, 0.3, 0) },
    uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uUnder: { value: new THREE.Color(0, 0, 0) },
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
    const m = new THREE.ShaderMaterial({ vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG, uniforms: this.u, transparent: true, depthWrite: false });
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
    U.uDrift.value = look.drift; U.uOpacity.value = look.opacity;
    U.uWind.value.set(windTo[0], windTo[1], wind, 0);
    const lit = U.uLit.value, shade = U.uShade.value, t = this.tmp;
    lit.copy(u.uHemiSky.value).add(t.copy(u.uSunColor.value).multiplyScalar(0.26)).multiply(t.setRGB(0.92, 0.9, 0.88));
    shade.copy(u.uHemiSky.value).multiplyScalar(0.55).add(t.copy(u.uHemiGround.value).multiplyScalar(0.32)).multiply(t.setRGB(0.8, 0.79, 0.8));
    // coal / burn smoke: a sooty brown-grey, darkest in the shade
    const d = THREE.MathUtils.clamp(look.darkness, 0, 1);
    lit.multiplyScalar(1 - 0.62 * d).multiply(t.setRGB(1, 1 - 0.06 * d, 1 - 0.12 * d));
    shade.multiplyScalar(1 - 0.8 * d);
    U.uUnder.value.copy(look.under ?? t.setRGB(0, 0, 0));
    this.mesh.visible = look.opacity > 0.005;
  }

  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

// ------------------------------------------------------------------ flames

const FLAME_VERT = /* glsl */ `
attribute vec4 aCard;        // x, z offset (m, unscaled), width, height
attribute vec2 aSeed;
uniform vec3 uOrigin;
uniform float uFireT;
uniform float uLevel;
uniform float uScale;
varying vec2 vUv;
varying vec2 vSeed;
void main() {
  vec3 c = uOrigin + vec3(aCard.x, 0.0, aCard.y) * uScale;
  vec3 toCam = cameraPosition - c; toCam.y = 0.0;
  vec3 fwd = normalize(toCam + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(fwd.z, 0.0, -fwd.x);
  float lv = clamp(uLevel, 0.0, 1.6);
  float sway = sin(uFireT * (1.7 + aSeed.y) + aSeed.x * 6.28) * 0.18;
  float h = aCard.w * uScale * (0.75 + 0.25 * sin(uFireT * (2.3 + aSeed.y * 1.4) + aSeed.x * 11.0)) * mix(0.18, 1.0, lv);
  float wdt = aCard.z * uScale * mix(0.6, 1.0, min(lv, 1.0));
  vec2 q = position.xy;
  vec3 p = c + right * (q.x * wdt + sway * q.y * q.y * wdt) + vec3(0.0, q.y * h, 0.0);
  p += fwd * 0.3 * uScale;
  vUv = vec2(q.x + 0.5, q.y);
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FLAME_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uFireT;
uniform float uLevel;
uniform float uGain;
varying vec2 vUv;
varying vec2 vSeed;
void main() {
  float u = vUv.x, v = vUv.y;
  vec2 nuv = vec2(u * 1.1 + vSeed.x, v * 0.42 - uFireT * (0.55 + 0.25 * vSeed.y));
  float n = texture2D(uNoise, nuv).g * 0.62 + texture2D(uNoise, nuv * 2.1 + 0.37).b * 0.42;
  float env = 1.0 - smoothstep(0.08, 0.5, abs(u - 0.5));
  float cut = v * 1.12 + (1.0 - env) * 0.95;
  float a = smoothstep(cut - 0.06, cut + 0.14, n * 1.3 + 0.12) * smoothstep(0.0, 0.06, v);
  if (a < 0.01) discard;
  float heat = clamp(a * pow(1.0 - v, 0.8) * (0.55 + 0.45 * env), 0.0, 1.0);
  vec3 tip = vec3(0.75, 0.07, 0.01), body2 = vec3(1.0, 0.36, 0.04), core = vec3(1.0, 0.78, 0.36);
  vec3 col = heat < 0.45 ? mix(tip, body2, heat / 0.45) : mix(body2, core, (heat - 0.45) / 0.55);
  gl_FragColor = vec4(col * a * uGain * min(uLevel, 1.0), 1.0);
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
    const ca = new Float32Array(cards * 4), sa = new Float32Array(cards * 2);
    for (let i = 0; i < cards; i++) {
      const rr = i === 0 ? 0 : 0.25 + r() * 0.6, th = r() * Math.PI * 2, big = i < 3;
      ca.set([Math.cos(th) * rr, Math.sin(th) * rr, big ? 1.4 + r() * 0.4 : 0.7 + r() * 0.5, big ? 2.6 + r() * 0.5 : 1.4 + r() * 0.8], i * 4);
      sa.set([r(), r()], i * 2);
    }
    g.setAttribute("aCard", new THREE.InstancedBufferAttribute(ca, 4));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(sa, 2));
    g.instanceCount = cards;
    const m = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, uniforms: this.u,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
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
    this.u.uGain.value = 1.1 + 1.6 * night;
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
void main() {
  float life = fract(uT * (0.16 + 0.1 * aSeed.y) + aSeed.x);
  float ang = aSeed.z * 6.2831;
  float r = uRadius * (0.3 + 1.6 * life * (0.4 + aSeed.w));
  vec3 p = uOrigin + vec3(cos(ang + life * 2.5) * r, 0.5 + life * uHeight * (0.6 + 0.8 * aSeed.y), sin(ang + life * 2.5) * r);
  p.xz += uWind.xy * (1.0 + 10.0 * uWind.z) * life * life;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float on = step(aSeed.w, clamp(uLevel, 0.0, 1.0) * 0.85 + 0.15);
  float flick = 0.6 + 0.4 * sin(uT * 13.0 + aSeed.w * 40.0);
  vA = on * min(uLevel, 1.2) * (1.0 - life) * smoothstep(0.0, 0.05, life) * flick;
  gl_PointSize = clamp(0.22 * uPx / -mv.z, 1.2, 4.0);
}`;

const EMBER_FRAG = /* glsl */ `
uniform float uGain;
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  gl_FragColor = vec4(uColor * (1.0 - d) * vA * uGain, 1.0);
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
    const m = new THREE.ShaderMaterial({ vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
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
    const m = new THREE.ShaderMaterial({ vertexShader: GLINT_VERT, fragmentShader: GLINT_FRAG, uniforms: this.u, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending });
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
