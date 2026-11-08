import { PLUME_VERT, PLUME_FRAG } from "./shaders/plume";
export { PLUME_VERT, PLUME_FRAG } from "./shaders/plume";
import { GLOW_VERT, GLOW_FRAG } from "./shaders/glow";
export { GLOW_VERT, GLOW_FRAG } from "./shaders/glow";
import { EMBER_VERT, EMBER_FRAG } from "./shaders/ember";
export { EMBER_VERT, EMBER_FRAG } from "./shaders/ember";
import { FLAME_VERT, FLAME_FRAG } from "./shaders/flame";
export { FLAME_VERT, FLAME_FRAG } from "./shaders/flame";
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
  /** 0..1 the PSI is unlit (05-P4): the fire is banked, not erased: a thin grey wisp still rises. */
  banked?: number;
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
    uOpacity: { value: 0.3 }, uNoise: this.fu.uNoise, uPlumeScale: { value: 1 },
    // the beam's shared uniforms (bindBeam); placeholders keep the shader valid without a beam
    uBeamPos: { value: new THREE.Vector3(0, -1000, 0) }, uBeamAngle: { value: 0 }, uBeamLight: { value: new THREE.Color(0, 0, 0) },
  } as Record<string, THREE.IUniform>;
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

  /** Share the beam's uniforms with the plume (05-P7a): the shaft lights the smoke it passes under. */
  bindBeam(u: { uBeamPos: THREE.IUniform<THREE.Vector3>; uBeamAngle: THREE.IUniform<number>; uBeamLight: THREE.IUniform<THREE.Color> }): void {
    this.pu.uBeamPos = u.uBeamPos; this.pu.uBeamAngle = u.uBeamAngle; this.pu.uBeamLight = u.uBeamLight;
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
    // banked (05-P4): a thin grey wisp at about a third of the column's opacity, half its girth
    const banked = THREE.MathUtils.clamp(s.banked ?? 0, 0, 1) * (1 - lvl);
    this.pu.uOpacity.value = lvl * (0.42 - 0.2 * night) + banked * 0.13;
    this.pu.uPlumeScale.value = THREE.MathUtils.lerp(1, 0.5, banked / Math.max(banked + lvl, 1e-3));
    this.plume.visible = lvl > 0.01 || banked > 0.01;
  }

  dispose(): void {
    for (const o of [this.flames, this.embers, this.glow, this.plume]) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  }
}
