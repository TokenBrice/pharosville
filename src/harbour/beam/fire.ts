import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";

/**
 * THE BEACON FIRE of the Pharos (D16): living flames in the lantern, embers, a day smoke plume, a warm glow
 * and a flickering point light on the colonnade and the statue. All motion runs in the shaders; the CPU sets
 * a handful of uniforms per frame.
 *
 *  - flames: crossed tongue cards, cylindrically billboarded, a scrolling-noise tongue mask, HDR (blooms)
 *  - embers: points spat up from the brazier, curling out between the columns and downwind
 *  - glow:   a soft warm atmospheric halo round the lantern (night), flickering with the fire
 *  - plume:  a tall smoke column from the dome, bent downwind; white by day, lit from below by night
 *  - light:  one PointLight, owned by the caller (added before the first frame: no recompiles)
 *
 * The fire carries the PSI reading with the beam: its colour is the 3-step lamp colour (golden / amber /
 * red), and an unlit Pharos (no PSI reading) has no fire, no embers and no plume.
 */

const FLAMES = 7;
const EMBERS = 70;
const PUFFS = 30;

const FLAME_VERT = /* glsl */ `
attribute vec4 aCard;        // x, z offset (m), width, height
attribute vec2 aSeed;        // x phase, y rand
uniform vec3 uOrigin;
uniform float uFireT;
uniform float uLevel;
varying vec2 vUv;
varying vec2 vSeed;
void main() {
  // cylindrical billboard: the card turns about the vertical to face the camera
  vec3 c = uOrigin + vec3(aCard.x, 0.0, aCard.y);
  vec3 toCam = cameraPosition - c; toCam.y = 0.0;
  vec3 fwd = normalize(toCam + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(fwd.z, 0.0, -fwd.x);
  float sway = sin(uFireT * (1.7 + aSeed.y) + aSeed.x * 6.28) * 0.18;
  float h = aCard.w * (0.75 + 0.25 * sin(uFireT * (2.3 + aSeed.y * 1.4) + aSeed.x * 11.0)) * mix(0.25, 1.0, uLevel);
  vec2 q = position.xy;                         // x -0.5..0.5, y 0..1
  vec3 p = c + right * (q.x * aCard.z + sway * q.y * q.y * aCard.z) + vec3(0.0, q.y * h, 0.0);
  p += fwd * 0.6;                               // a little toward the viewer so the brazier rim never clips the base
  vUv = vec2(q.x + 0.5, q.y);
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FLAME_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uFireT;
uniform float uLevel;
uniform float uGain;
uniform vec3 uTint;
varying vec2 vUv;
varying vec2 vSeed;
void main() {
  float u = vUv.x, v = vUv.y;
  // vertically stretched scrolling noise: licking tongues that tear at the top
  vec2 nuv = vec2(u * 1.1 + vSeed.x, v * 0.42 - uFireT * (0.5 + 0.25 * vSeed.y));
  float n = texture2D(uNoise, nuv).g * 0.62 + texture2D(uNoise, nuv * 2.1 + 0.37).b * 0.42;
  float env = 1.0 - smoothstep(0.08, 0.5, abs(u - 0.5));
  float cut = v * 1.12 + (1.0 - env) * 0.95;
  float a = smoothstep(cut - 0.06, cut + 0.14, n * 1.3 + 0.12) * smoothstep(0.0, 0.06, v);
  if (a < 0.01) discard;
  // colour by heat: white-gold low in the core, orange body, deep red torn tips
  float heat = clamp(a * pow(1.0 - v, 0.8) * (0.55 + 0.45 * env), 0.0, 1.0);
  vec3 tip = vec3(0.75, 0.07, 0.01), body2 = vec3(1.0, 0.36, 0.04), core = vec3(1.0, 0.78, 0.36);
  vec3 col = heat < 0.45 ? mix(tip, body2, heat / 0.45) : mix(body2, core, (heat - 0.45) / 0.55);
  col *= uTint;
  gl_FragColor = vec4(col * a * uGain * uLevel, 1.0);
}`;

const EMBER_VERT = /* glsl */ `
attribute vec4 aSeed;        // x phase, y rand, z rand, w rand
uniform vec3 uOrigin;
uniform float uFireT;
uniform float uLevel;
uniform vec4 uWind;          // xy downwind (x, z), z strength
uniform float uPx;           // projection scale (px per metre at 1 m)
varying float vA;
void main() {
  float life = fract(uFireT * (0.12 + 0.08 * aSeed.y) + aSeed.x);
  float ang = aSeed.z * 6.2831;
  float r = 0.8 + 6.0 * life * (0.4 + aSeed.w);
  vec3 p = uOrigin + vec3(cos(ang + life * 2.5) * r, 2.0 + life * (14.0 + 16.0 * aSeed.y), sin(ang + life * 2.5) * r);
  p.xz += uWind.xy * (2.0 + 22.0 * uWind.z) * life * life;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float flick = 0.6 + 0.4 * sin(uFireT * 13.0 + aSeed.w * 40.0);
  vA = uLevel * (1.0 - life) * smoothstep(0.0, 0.05, life) * flick;
  gl_PointSize = clamp(0.32 * uPx / -mv.z, 1.4, 5.0);
}`;

const EMBER_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform float uGain;
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  gl_FragColor = vec4(vec3(1.0, 0.45, 0.1) * uTint * (1.0 - d) * vA * uGain, 1.0);
}`;

const GLOW_VERT = /* glsl */ `
uniform float uSize;
varying vec2 vQ;
void main() {
  vQ = position.xy * 2.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xyz += normalize(-mv.xyz) * 9.0;           // in front of the colonnade
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}`;

const GLOW_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform float uK;
varying vec2 vQ;
void main() {
  float r2 = dot(vQ, vQ);
  float g = exp(-r2 * 14.0) * 0.5 + exp(-r2 * 5.0) * 0.16 + exp(-r2 * 70.0) * 0.45;
  gl_FragColor = vec4(uCol * g * uK * (1.0 - smoothstep(0.35, 1.0, r2)), 1.0);
}`;

const PLUME_VERT = /* glsl */ `
attribute vec4 aSeed;        // x slot 0..1, y rand, z rand, w rand
uniform vec3 uOrigin;
uniform float uSmokeT;
uniform vec4 uWind;
varying vec2 vUv;
varying float vAlpha;
varying float vLife;
varying vec2 vSeed;
void main() {
  vSeed = aSeed.yw;
  float life = fract(uSmokeT * 0.028 + aSeed.x);
  float w = uWind.z;
  float rise = (58.0 - 24.0 * w) * (1.0 - exp(-life * 2.0)) * 1.15;
  float drift = (10.0 + 80.0 * w) * life * life + 5.0 * life;
  vec3 c = uOrigin + vec3(uWind.x * drift, rise, uWind.y * drift);
  // each puff wanders off the axis: a billowing column, not a rod
  float ph = uSmokeT * 0.1 + aSeed.y * 6.28 + life * 2.4;
  vec2 off = vec2(sin(ph), cos(ph * 0.83)) * (1.2 + 7.0 * life) + (aSeed.zw - 0.5) * 6.0 * life;
  c.xz += off;
  float size = (3.2 + 19.0 * life) * (0.75 + 0.5 * aSeed.z);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = c + (right * position.x + up * position.y) * size;
  vUv = position.xy;
  vLife = life;
  vAlpha = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.35, 1.0, life));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const PLUME_FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uFireUnder;
uniform float uOpacity;
uniform sampler2D uNoise;
varying vec2 vUv;
varying float vAlpha;
varying float vLife;
varying vec2 vSeed;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  // billowy edge: a soft ball eroded by noise that slowly turns with the puff's age
  float n = texture2D(uNoise, vUv * 0.32 + vSeed + vLife * 0.25).r;
  float a = pow(1.0 - r * r, 1.5) * smoothstep(0.15, 0.75, n * 1.25 - r * 0.35 + 0.2);
  vec3 col = mix(uShade, uLit, clamp(0.65 + 0.5 * vUv.y, 0.0, 1.0));
  // the fire lights the young smoke from below (the night read: a glowing column over the lantern)
  col += uFireUnder * (1.0 - smoothstep(0.0, 0.35, vLife)) * clamp(0.6 - 0.6 * vUv.y, 0.0, 1.0);
  gl_FragColor = vec4(col, a * vAlpha * uOpacity * (1.0 - 0.5 * vLife));
}`;

/** The fire on the sea: a glitter streak on a sea-level quad (depth-tested, so land and hulls hide it). */
const REFLECT_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const REFLECT_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform vec3 uLantern;
uniform vec3 uCol;
uniform float uT;
varying vec3 vW;
void main() {
  vec3 V = normalize(vW - cameraPosition);
  vec2 n1 = texture2D(uNoise, vW.xz * 0.011 + vec2(uT * 0.004, uT * 0.007)).rg - 0.5;
  vec2 n2 = texture2D(uNoise, vW.xz * 0.043 - vec2(uT * 0.011, -uT * 0.006)).ba - 0.5;
  vec3 N = normalize(vec3((n1.x + n2.x * 0.7) * 0.42, 1.0, (n1.y + n2.y * 0.7) * 0.42));
  vec3 R = reflect(V, N);
  vec3 L = normalize(uLantern - vW);
  float lr = max(dot(R, L), 0.0);
  float glit = pow(lr, 320.0) * 4.0 + pow(lr, 70.0) * 0.16;
  // fade out at the quad's rim
  vec2 d = (vW.xz - uLantern.xz) / 520.0;
  float rim = 1.0 - smoothstep(0.6, 1.0, length(d));
  gl_FragColor = vec4(uCol * glit * rim, 1.0);
}`;

export interface FireState {
  /** 0..1 the lantern level (PSI lit, eased). */
  level: number;
  /** Lamp colour (PSI 3-step), linear-ish multipliers. */
  lamp: THREE.Color;
  /** Downwind unit vector (x, z) and strength 0..1. */
  windTo: readonly [number, number];
  wind: number;
  /** Reduced motion: the fire holds still. */
  reduced: boolean;
}

export class PharosFire {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  /** Current flicker 0.75..1.15 (the beam and the mirror follow it). */
  flicker = 1;
  private t = 0;
  private smokeT = 0;
  private readonly tint = new THREE.Color(1, 1, 1);
  private readonly base = new THREE.Color(1.0, 0.86, 0.62);
  private readonly fu = {
    uOrigin: { value: new THREE.Vector3() }, uFireT: { value: 0 }, uLevel: { value: 1 }, uGain: { value: 6 },
    uTint: { value: new THREE.Color(1, 1, 1) }, uNoise: { value: null as THREE.Texture | null },
    uWind: { value: new THREE.Vector4(0.8, -0.5, 0.3, 0) }, uPx: { value: 800 },
  };
  private readonly gu = { uSize: { value: 30 }, uCol: { value: new THREE.Color() }, uK: { value: 0 } };
  private readonly pu = {
    uOrigin: { value: new THREE.Vector3() }, uSmokeT: { value: 0 }, uWind: this.fu.uWind,
    uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uFireUnder: { value: new THREE.Color() },
    uOpacity: { value: 0.3 }, uNoise: this.fu.uNoise,
  };
  private readonly flames: THREE.Mesh;
  private readonly embers: THREE.Points;
  private readonly glow: THREE.Mesh;
  private readonly plume: THREE.Mesh;
  private readonly reflect: THREE.Mesh;
  private readonly ru = { uNoise: this.fu.uNoise, uLantern: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color() }, uT: this.fu.uFireT };
  private readonly tmp = new THREE.Color();
  private readonly lightBase = new THREE.Vector3();

  /** `light` is created by the caller before the first frame (a light added later recompiles every material). */
  constructor(emitter: THREE.Vector3, smoke: THREE.Vector3, glowAt: THREE.Vector3, noise: THREE.Texture, light: THREE.PointLight, seaY = 0) {
    this.fu.uNoise.value = noise;
    this.fu.uOrigin.value.copy(emitter);
    this.pu.uOrigin.value.copy(smoke);
    let a = 977;
    const rnd = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };

    // ---- flames: crossed tongue cards round the brazier
    const card = new THREE.InstancedBufferGeometry();
    card.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    card.setIndex([0, 1, 2, 0, 2, 3]);
    const cardA = new Float32Array(FLAMES * 4), seedA = new Float32Array(FLAMES * 2);
    for (let i = 0; i < FLAMES; i++) {
      const r = i === 0 ? 0 : 0.5 + rnd() * 1.1, th = rnd() * Math.PI * 2;
      const big = i < 3;
      cardA.set([Math.cos(th) * r, Math.sin(th) * r, big ? 2.8 + rnd() * 0.8 : 1.4 + rnd() * 1.0, big ? 5.2 + rnd() * 1.0 : 2.8 + rnd() * 1.6], i * 4);
      seedA.set([rnd(), rnd()], i * 2);
    }
    card.setAttribute("aCard", new THREE.InstancedBufferAttribute(cardA, 4));
    card.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seedA, 2));
    card.instanceCount = FLAMES;
    const flameMat = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, uniforms: this.fu,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    flameMat.name = "hb_pharos_flames";
    this.flames = new THREE.Mesh(card, flameMat);
    this.flames.frustumCulled = false;
    this.flames.renderOrder = 11;
    this.flames.name = "pharos-flames";

    // ---- embers
    const eg = new THREE.BufferGeometry();
    const eSeed = new Float32Array(EMBERS * 4);
    for (let i = 0; i < EMBERS * 4; i++) eSeed[i] = rnd();
    eg.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(EMBERS * 3), 3));
    eg.setAttribute("aSeed", new THREE.Float32BufferAttribute(eSeed, 4));
    const emberMat = new THREE.ShaderMaterial({
      vertexShader: EMBER_VERT, fragmentShader: EMBER_FRAG, uniforms: this.fu,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    emberMat.name = "hb_pharos_embers";
    this.embers = new THREE.Points(eg, emberMat);
    this.embers.frustumCulled = false;
    this.embers.renderOrder = 11;

    // ---- glow halo
    const glowMat = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: this.gu,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    glowMat.name = "hb_pharos_glow";
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat);
    this.glow.position.copy(glowAt);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 12;

    // ---- plume
    const pg = new THREE.InstancedBufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    pg.setIndex([0, 1, 2, 0, 2, 3]);
    const ps = new Float32Array(PUFFS * 4);
    for (let i = 0; i < PUFFS; i++) ps.set([i / PUFFS, rnd(), rnd(), rnd()], i * 4);
    pg.setAttribute("aSeed", new THREE.InstancedBufferAttribute(ps, 4));
    pg.instanceCount = PUFFS;
    const plumeMat = new THREE.ShaderMaterial({
      vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG, uniforms: this.pu,
      transparent: true, depthWrite: false, depthTest: true,
    });
    plumeMat.name = "hb_pharos_plume";
    this.plume = new THREE.Mesh(pg, plumeMat);
    this.plume.frustumCulled = false;
    this.plume.renderOrder = 3;

    // ---- the fire's light on the lantern, the colonnade and the statue
    this.light = light;
    this.light.position.copy(emitter).add(new THREE.Vector3(0, 2.5, 0));
    this.lightBase.copy(this.light.position);

    // ---- the fire's reflection on the sea (night)
    this.ru.uLantern.value.copy(glowAt);
    const rg = new THREE.PlaneGeometry(1040, 1040, 1, 1).rotateX(-Math.PI / 2);
    const reflectMat = new THREE.ShaderMaterial({
      vertexShader: REFLECT_VERT, fragmentShader: REFLECT_FRAG, uniforms: this.ru,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    reflectMat.name = "hb_pharos_reflection";
    this.reflect = new THREE.Mesh(rg, reflectMat);
    this.reflect.position.set(glowAt.x, seaY + 0.35, glowAt.z);
    this.reflect.renderOrder = 4;
    this.reflect.name = "pharos-fire-reflection";

    this.group.name = "pharos-fire";
    this.group.add(this.flames, this.embers, this.glow, this.plume, this.reflect);
  }

  /** Per frame. Returns nothing; read `flicker` after. */
  update(dt: number, s: FireState, u: WorldUniforms, camera: THREE.PerspectiveCamera, viewportH: number): void {
    if (!s.reduced) { this.t += dt; this.smokeT += dt; }
    const t = this.t;
    // layered flicker (no randomness: deterministic, smooth)
    const fl = s.reduced ? 1 : 1 + 0.09 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.1 + 1.3) + 0.05 * Math.sin(t * 2.9 + 0.4) + 0.04 * Math.sin(t * 23.7);
    this.flicker = fl;
    const lvl = THREE.MathUtils.clamp(s.level, 0, 1);
    const night = u.uNight.value;
    // tint relative to the steady lamp: golden → amber → red flames
    this.tint.setRGB(s.lamp.r / this.base.r, s.lamp.g / this.base.g, s.lamp.b / this.base.b);
    this.fu.uTint.value.copy(this.tint);
    this.fu.uFireT.value = t;
    this.fu.uLevel.value = lvl;
    // flames: bright enough to read in sunlight, white-hot by night
    this.fu.uGain.value = (0.9 + 1.1 * night) * fl;
    this.fu.uWind.value.set(s.windTo[0], s.windTo[1], s.wind, 0);
    this.fu.uPx.value = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.flames.visible = lvl > 0.01;
    this.embers.visible = lvl > 0.01 && !s.reduced;

    // glow halo: constant-ish screen size, mostly a night read
    const dist = camera.position.distanceTo(this.glow.position);
    this.gu.uSize.value = THREE.MathUtils.clamp(dist * 0.085, 14, 80);
    this.gu.uCol.value.setRGB(1.0, 0.55, 0.2).multiply(this.tint);
    this.gu.uK.value = lvl * fl * (0.04 + 1.1 * night);
    this.glow.visible = lvl > 0.01;

    // the light: warm on the stone, stronger at night (by day the sun washes it out)
    this.light.color.setRGB(1.0, 0.6, 0.26).multiply(this.tint);
    this.light.intensity = lvl * fl * (6 + 16 * night);
    if (!s.reduced) this.light.position.set(this.lightBase.x + Math.sin(t * 5.1) * 0.4, this.lightBase.y + Math.sin(t * 3.7) * 0.3, this.lightBase.z + Math.cos(t * 4.3) * 0.4);

    // plume: white wood smoke by day, a dark column lit from below by night
    this.pu.uSmokeT.value = this.smokeT;
    const lit = this.pu.uLit.value, shade = this.pu.uShade.value, tc = this.tmp;
    lit.copy(u.uHemiSky.value).add(tc.copy(u.uSunColor.value).multiplyScalar(0.22)).multiply(tc.setRGB(0.9, 0.89, 0.88));
    shade.copy(u.uHemiSky.value).multiplyScalar(0.55).add(tc.copy(u.uHemiGround.value).multiplyScalar(0.35)).multiply(tc.setRGB(0.78, 0.76, 0.76));
    this.pu.uFireUnder.value.setRGB(1.0, 0.42, 0.12).multiply(this.tint).multiplyScalar(lvl * fl * night * 0.9);
    this.pu.uOpacity.value = lvl * (0.42 - 0.2 * night);
    this.plume.visible = lvl > 0.01;

    // the fire on the water: a night read (by day the sun glitter owns the sea)
    this.ru.uCol.value.setRGB(1.0, 0.5, 0.16).multiply(this.tint).multiplyScalar(lvl * fl * night * 1.1);
    this.reflect.visible = lvl * night > 0.02;
  }

  dispose(): void {
    for (const o of [this.flames, this.embers, this.glow, this.plume, this.reflect]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
}
