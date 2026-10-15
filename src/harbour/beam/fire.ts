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

const FLAMES = 16;
const EMBERS = 160;
const PUFFS = 30;

const FLAME_VERT = /* glsl */ `
attribute vec4 aCard;        // x, z offset (m), width, height
attribute vec3 aSeed;        // x phase, y rand, z yaw off the camera (crossed sheets)
uniform vec3 uOrigin;
uniform float uFireT;
uniform float uLevel;
uniform vec4 uWind;          // xy downwind (x, z), z strength
varying vec2 vUv;
varying vec3 vSeed;
void main() {
  // cylindrical billboard turned a little off the camera, so the tongues cross in depth instead of stacking
  vec3 c = uOrigin + vec3(aCard.x, 0.0, aCard.y);
  vec3 toCam = cameraPosition - c; toCam.y = 0.0;
  vec3 fwd = normalize(toCam + vec3(1e-4, 0.0, 0.0));
  float cy = cos(aSeed.z), sy = sin(aSeed.z);
  vec3 f2 = vec3(fwd.x * cy - fwd.z * sy, 0.0, fwd.x * sy + fwd.z * cy);
  vec3 right = vec3(f2.z, 0.0, -f2.x);
  float ph = aSeed.x * 6.28;
  // each tongue breathes on its own clock: it leaps, gutters and leaps again
  float leap = 0.68 + 0.2 * sin(uFireT * (2.1 + aSeed.y * 1.6) + ph) + 0.12 * sin(uFireT * (5.3 + aSeed.y * 2.0) + ph * 3.1);
  float h = aCard.w * leap * mix(0.25, 1.0, uLevel);
  vec2 q = position.xy;                         // x -0.5..0.5, y 0..1
  float sway = (sin(uFireT * (1.9 + aSeed.y) + ph) * 0.22 + sin(uFireT * 4.7 + ph * 2.0) * 0.08) * q.y * q.y;
  vec3 p = c + right * (q.x * aCard.z + sway * aCard.z) + vec3(0.0, q.y * h, 0.0);
  // the tips lean downwind
  p.xz += uWind.xy * (0.3 + 1.2 * uWind.z) * q.y * q.y * h * 0.12;
  p += fwd * 0.6;                               // a little toward the viewer so the brazier rim never clips the base
  vUv = vec2(q.x + 0.5, q.y);
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

// premultiplied "over-additive" blending (ONE, ONE_MINUS_SRC_ALPHA): overlapping tongues keep their colour
// instead of summing to an electric white; only the low core runs white-gold
const FLAME_FRAG = /* glsl */ `
uniform sampler2D uNoise;
uniform float uFireT;
uniform float uLevel;
uniform float uGain;
uniform vec3 uTint;
varying vec2 vUv;
varying vec3 vSeed;
void main() {
  float u = vUv.x - 0.5, v = vUv.y;
  float sp = 0.55 + 0.35 * vSeed.y;
  // the tongue's outline wanders with low-frequency noise and tapers to a point
  float wob = texture2D(uNoise, vec2(v * 0.35 + vSeed.x, uFireT * 0.23 * sp + vSeed.y)).r - 0.5;
  float hw = mix(0.46, 0.05, pow(max(v, 0.0), 0.75));
  float body = 1.0 - smoothstep(hw * 0.55, hw, abs(u - wob * 0.32 * v));
  // vertically stretched scrolling noise tears the upper half into licks
  vec2 nuv = vec2(u * 0.9 + vSeed.x, v * 0.38 - uFireT * (0.62 * sp + 0.15));
  float n = texture2D(uNoise, nuv).g * 0.62 + texture2D(uNoise, nuv * 2.3 + 0.37).b * 0.42;
  float a = body * smoothstep(v * 1.05 - 0.08, v * 1.05 + 0.18, n * 1.25 + 0.16) * smoothstep(0.0, 0.07, v);
  if (a < 0.01) discard;
  // heat: white-gold low in the core, orange body, deep red torn tips that darken toward soot
  float core = (1.0 - smoothstep(0.0, 0.4, abs(u) / max(hw, 0.05))) * (1.0 - smoothstep(0.05, 0.55, v));
  float heat = clamp((1.0 - v) * 0.85 * a + core * 0.55 - 0.08, 0.0, 1.0);
  vec3 tip = vec3(0.62, 0.05, 0.01), body2 = vec3(1.0, 0.34, 0.04), gold = vec3(1.0, 0.66, 0.18), white = vec3(1.0, 0.9, 0.62);
  vec3 col = heat < 0.35 ? mix(tip, body2, heat / 0.35) : heat < 0.7 ? mix(body2, gold, (heat - 0.35) / 0.35) : mix(gold, white, (heat - 0.7) / 0.3);
  col *= mix(0.5, 1.0, smoothstep(0.1, 0.45, heat));          // the torn tips are dim, not glowing
  col *= uTint;
  float k = a * uLevel;
  gl_FragColor = vec4(col * k * uGain * (0.6 + 0.9 * heat), k * 0.75);
}`;

// two populations: sparks spat out of the brazier between the columns, and a tall column of embers carried up
// out of the dome's vent on the hot air, cooling from gold to red as they rise and drift downwind
const EMBER_VERT = /* glsl */ `
attribute vec4 aSeed;        // x phase, y rand, z rand, w rand (< 0.4: brazier spark, else the vent column)
uniform vec3 uOrigin;
uniform vec3 uVent;
uniform float uFireT;
uniform float uLevel;
uniform vec4 uWind;          // xy downwind (x, z), z strength
uniform float uPx;           // projection scale (px per metre at 1 m)
varying float vA;
varying float vLife;
void main() {
  bool spark = aSeed.w < 0.4;
  float life = fract(uFireT * (spark ? 0.16 + 0.1 * aSeed.y : 0.055 + 0.04 * aSeed.y) + aSeed.x);
  float ang = aSeed.z * 6.2831;
  vec3 p;
  if (spark) {
    float r = 0.6 + 6.0 * life * (0.4 + aSeed.w);
    p = uOrigin + vec3(cos(ang + life * 2.5) * r, 1.5 + life * (9.0 + 10.0 * aSeed.y), sin(ang + life * 2.5) * r);
    p.xz += uWind.xy * (2.0 + 14.0 * uWind.z) * life * life;
  } else {
    // a loose rising column: a slow helix that widens and leans downwind as it climbs
    float rise = life * (26.0 + 30.0 * aSeed.y);
    float r = 0.5 + 1.2 * aSeed.z + 4.5 * life;
    float sw = uFireT * (0.7 + 0.6 * aSeed.y) + ang;
    p = uVent + vec3(cos(sw) * r, rise, sin(sw) * r);
    p.xz += uWind.xy * (4.0 + 26.0 * uWind.z) * life * life;
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float flick = 0.55 + 0.45 * sin(uFireT * (9.0 + 8.0 * aSeed.y) + aSeed.w * 40.0);
  vA = uLevel * (1.0 - smoothstep(0.55, 1.0, life)) * smoothstep(0.0, 0.05, life) * flick;
  vLife = life;
  float sz = spark ? 0.34 : 0.42 * (1.0 - 0.5 * life);
  gl_PointSize = clamp(sz * uPx / -mv.z, 1.2, 5.0);
}`;

const EMBER_FRAG = /* glsl */ `
uniform vec3 uTint;
uniform float uGain;
varying float vA;
varying float vLife;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  vec3 c = mix(vec3(1.0, 0.72, 0.3), vec3(0.85, 0.16, 0.03), smoothstep(0.0, 0.7, vLife));
  gl_FragColor = vec4(c * uTint * (1.0 - d) * vA * uGain, 1.0);
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
  // a tall soft glow round the flames (no hot pinpoint: that read as an electric bulb)
  vec2 e = vec2(vQ.x, (vQ.y + 0.12) * 0.62);
  float r2 = dot(e, e);
  float g = exp(-r2 * 11.0) * 0.42 + exp(-r2 * 4.0) * 0.15;
  gl_FragColor = vec4(uCol * g * uK * (1.0 - smoothstep(0.35, 1.0, dot(vQ, vQ))), 1.0);
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
  float a = pow(max(1.0 - r * r, 0.0), 1.5) * smoothstep(0.15, 0.75, n * 1.25 - r * 0.35 + 0.2);
  vec3 col = mix(uShade, uLit, clamp(0.65 + 0.5 * vUv.y, 0.0, 1.0));
  // the fire lights the smoke from below (the night read: a glowing column over the lantern, the underside
  // of each puff warm, fading as the column climbs out of the firelight)
  col += uFireUnder * (1.0 - smoothstep(0.0, 0.5, vLife)) * clamp(0.75 - 0.65 * vUv.y, 0.0, 1.0);
  gl_FragColor = vec4(col, a * vAlpha * uOpacity * (1.0 - 0.5 * vLife));
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
    uOrigin: { value: new THREE.Vector3() }, uVent: { value: new THREE.Vector3() }, uFireT: { value: 0 }, uLevel: { value: 1 }, uGain: { value: 6 },
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
  private readonly tmp = new THREE.Color();
  private readonly lightBase = new THREE.Vector3();

  /** `light` is created by the caller before the first frame (a light added later recompiles every material). */
  constructor(emitter: THREE.Vector3, smoke: THREE.Vector3, glowAt: THREE.Vector3, noise: THREE.Texture, light: THREE.PointLight) {
    this.fu.uNoise.value = noise;
    this.fu.uOrigin.value.copy(emitter);
    this.pu.uOrigin.value.copy(smoke);
    this.fu.uVent.value.copy(smoke);
    let a = 977;
    const rnd = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };

    // ---- flames: crossed tongue cards round the brazier
    const card = new THREE.InstancedBufferGeometry();
    card.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    card.setIndex([0, 1, 2, 0, 2, 3]);
    // 5 great body tongues, 7 licks round the brazier rim, 4 low hot core sheets
    const cardA = new Float32Array(FLAMES * 4), seedA = new Float32Array(FLAMES * 3);
    for (let i = 0; i < FLAMES; i++) {
      const kind = i < 5 ? 0 : i < 12 ? 1 : 2;
      const th = rnd() * Math.PI * 2;
      const r = kind === 0 ? 0.3 + rnd() * 0.7 : kind === 1 ? 0.9 + rnd() * 0.8 : rnd() * 0.5;
      const w = kind === 0 ? 3.0 + rnd() * 1.2 : kind === 1 ? 1.3 + rnd() * 0.9 : 2.4 + rnd() * 0.8;
      const h = kind === 0 ? 5.2 + rnd() * 2.0 : kind === 1 ? 3.2 + rnd() * 2.2 : 2.2 + rnd() * 1.0;
      cardA.set([Math.cos(th) * r, Math.sin(th) * r, w, h], i * 4);
      seedA.set([rnd(), rnd(), (rnd() - 0.5) * (kind === 1 ? 1.4 : 0.9)], i * 3);
    }
    card.setAttribute("aCard", new THREE.InstancedBufferAttribute(cardA, 4));
    card.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seedA, 3));
    card.instanceCount = FLAMES;
    const flameMat = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, uniforms: this.fu,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
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

    this.group.name = "pharos-fire";
    this.group.add(this.flames, this.embers, this.glow, this.plume);
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
    // flames: bright enough to read in sunlight, hot by night (the core goes white-gold, the body stays orange)
    this.fu.uGain.value = (1.1 + 0.9 * night) * fl;
    this.fu.uWind.value.set(s.windTo[0], s.windTo[1], s.wind, 0);
    this.fu.uPx.value = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.flames.visible = lvl > 0.01;
    this.embers.visible = lvl > 0.01 && !s.reduced;

    // glow halo: constant-ish screen size, mostly a night read
    const dist = camera.position.distanceTo(this.glow.position);
    this.gu.uSize.value = THREE.MathUtils.clamp(dist * 0.085, 14, 80);
    this.gu.uCol.value.setRGB(1.0, 0.55, 0.2).multiply(this.tint);
    // close up the flames carry the light themselves: the halo eases off so it never reads as a bulb
    this.gu.uK.value = lvl * fl * (0.03 + 0.75 * night) * (0.3 + 0.7 * THREE.MathUtils.smoothstep(dist, 60, 260));
    this.glow.visible = lvl > 0.01;

    // the light: warm on the stone, stronger at night (by day the sun washes it out)
    this.light.color.setRGB(1.0, 0.6, 0.26).multiply(this.tint);
    // firelight gutters on the colonnade, the dome and the statue (the flicker squared: it reads on the stone)
    this.light.intensity = lvl * fl * fl * (6 + 16 * night);
    if (!s.reduced) this.light.position.set(this.lightBase.x + Math.sin(t * 5.1) * 0.4, this.lightBase.y + Math.sin(t * 3.7) * 0.3, this.lightBase.z + Math.cos(t * 4.3) * 0.4);

    // plume: white wood smoke by day, a dark column lit from below by night
    this.pu.uSmokeT.value = this.smokeT;
    const lit = this.pu.uLit.value, shade = this.pu.uShade.value, tc = this.tmp;
    lit.copy(u.uHemiSky.value).add(tc.copy(u.uSunColor.value).multiplyScalar(0.22)).multiply(tc.setRGB(0.9, 0.89, 0.88));
    shade.copy(u.uHemiSky.value).multiplyScalar(0.55).add(tc.copy(u.uHemiGround.value).multiplyScalar(0.35)).multiply(tc.setRGB(0.78, 0.76, 0.76));
    this.pu.uFireUnder.value.setRGB(1.0, 0.42, 0.12).multiply(this.tint).multiplyScalar(lvl * fl * night * 1.25);
    this.pu.uOpacity.value = lvl * (0.42 - 0.2 * night);
    this.plume.visible = lvl > 0.01;
  }

  dispose(): void {
    for (const o of [this.flames, this.embers, this.glow, this.plume]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
}
