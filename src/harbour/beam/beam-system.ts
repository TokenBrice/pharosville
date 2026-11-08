import { HALO_VERT, HALO_FRAG } from "./shaders/halo";
export { HALO_VERT, HALO_FRAG } from "./shaders/halo";
import { ShimmerEffect } from "./shaders/shimmer";
export { SHIMMER_FRAG, ShimmerEffect } from "./shaders/shimmer";
import { BeamEffect } from "./shaders/shaft";
export { BEAM_FRAG, BeamEffect } from "./shaders/shaft";
import * as THREE from "three";
import { EffectPass } from "postprocessing";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import { acquireFxTextures, type FxTextures } from "../ocean/textures";
import { getBeamUniforms, type BeamUniforms } from "./uniforms";

/**
 * BEAM: the Pharos's mirror-thrown firelight (D16). A depth-aware post effect (scene-linear, before bloom /
 * AgX) that integrates ONE warm shaft along each view ray, stopping at the scene depth, so the beam ends on
 * the hills, the town and the water instead of painting over them. It is born at the bronze mirror (as wide
 * as the mirror), is brightest there and thins over the sea; a broad faint sheath of scattered firelight
 * wraps a golden core, drifting sea-mist breaks it up, and it breathes with the fire's flicker. Faded near
 * the camera and when the shaft points along the view, with a soft optical-depth cap so it never blows out.
 * The fire itself (beam/fire.ts) carries the lantern glow; this system's sprite is the mirror's GLINT, a
 * sharp star when the mirror swings to face the viewer (by day: the sun glint on rhythm). The shared uniforms
 * make the sea glint where the beam sweeps.
 *
 * Reads the 'lighthouse' service ({ lanternPosition, sweepAngle(), period }) when present, else the
 * layout's pharos landmark + 30 m and a 12 s sweep. Service 'beam': setReach(0..1), setColor(0|1|2 | colour).
 * Reduced motion (the lighthouse holds the beam still): the PSI rhythm becomes a slow lamp swell at the
 * same period, so the band still reads without movement.
 */
export interface BeamService {
  setReach(v: number): void;
  /** 0 steady (warm white), 1 caution (amber), 2 alarm (red), or an explicit colour. */
  setColor(step: 0 | 1 | 2 | THREE.ColorRepresentation): void;
  /** 0..1 caution lamp by day (readings: PSI TREMOR and worse): a steady lantern + a broader rhythm flash. */
  setDayPresence?(v: number): void;
  /** DA-09: PSI computed without early-warning data → a horn shutter narrows the beam (eased). */
  setQualified?(q: boolean): void;
  /** Arrival kindling (camera lane): 0..1 multiplier on the fire and the beam up to their true value. */
  setIntroScale?(k: number): void;
  /** The current kindling multiplier (the lighthouse's fire reads it). */
  readonly introScale?: number;
  /** The beam's eased reach 0..1 as shown (× lit × kindling): audio's beam breath follows it. */
  reach?(): number;
}

interface LighthouseLike {
  lanternPosition?: THREE.Vector3 | [number, number, number];
  /** Layout heading convention: the beam points along (sin h, 0, cos h). */
  sweepAngle?: () => number;
  readonly period?: number;
  readonly lit?: boolean;
  /** The fire's flicker (≈0.75..1.2). */
  readonly flicker?: number;
}

export const LAMP_COLORS = ["#FFE0A8", "#FFB45A", "#FF6A4A"] as const;
/** Firelight, not an electric lamp: every lamp colour is warmed toward the flame (golden / amber / red stay apart). */
const FIRE_WARM = new THREE.Color(1.0, 0.86, 0.6);
const R0 = 2.3;            // beam radius at the mirror (m) = the bronze disc
const HALF = 0.05;         // cone half-angle (rad), ~2.9 deg
const TILT = 0.028;        // down-tilt (rad)
const MIRROR_BACK = 3.3;   // the mirror face sits this far behind the fire (m)
/** The beam's light on the world (05-P1): kept below the quay-lamp pools so it never reads as a searchlight. */
const BEAM_LIGHT_GAIN = 0.8;
/** The daylight heliograph coin (05-P2): × the sun colour; a dappled patch, not a spotlight. */
const HELIO_GAIN = 0.2;

/**
 * E07 the heat shimmer's strength: a close-range read, full inside 140 m of the lantern and gone by 520 m (the
 * lantern must be big enough on screen to bend), only while the fire burns and the lantern is on screen; never
 * under reduced motion (the distortion IS movement). `breath` is the fire's damped flicker.
 */
export function shimmerAmount(dCam: number, lit: boolean, onScreen: boolean, breath: number, reduced: boolean): number {
  if (!lit || !onScreen || reduced) return 0;
  return (1 - THREE.MathUtils.smoothstep(dCam, 140, 520)) * (0.7 + 0.3 * breath);
}

/** The shared effect pass (shimmer + shaft) runs only while either has something to draw. */
export const beamPassActive = (intensity: number, shimmer: number): boolean => intensity > 0.002 || shimmer > 0.001;

export class BeamSystem implements WorldSystem {
  readonly name = "beam";
  private effect!: BeamEffect;
  private shimmer!: ShimmerEffect;
  private readonly SH = {
    uShC: new THREE.Uniform(new THREE.Vector2(0.5, 0.5)),
    uShR: new THREE.Uniform(new THREE.Vector2(0.02, 0.03)),
    uShAmt: new THREE.Uniform(0),
    uShT: new THREE.Uniform(0),
    uShNoise: new THREE.Uniform(null as THREE.Texture | null),
  };
  private readonly ndc = new THREE.Vector3();
  private pass!: EffectPass;
  private halo!: THREE.Mesh;
  private haloMat!: THREE.ShaderMaterial;
  private fx!: FxTextures;
  private bu!: BeamUniforms;
  private reach = 0.85;
  private reachS = 0.85;
  private readonly color = new THREE.Color(LAMP_COLORS[0]);
  private readonly colorS = new THREE.Color(LAMP_COLORS[0]);
  private lantern = new THREE.Vector3();
  private readonly mirror = new THREE.Vector3();
  private lighthouse: LighthouseLike | undefined;
  private lastAngle = NaN;
  private stillFor = 0;
  private dayPresence = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly fireTint = new THREE.Color();
  private readonly U = {
    uCamWorld: new THREE.Uniform(new THREE.Matrix4()),
    uInvProj: new THREE.Uniform(new THREE.Matrix4()),
    uBeamPos: new THREE.Uniform(new THREE.Vector3()),
    uColor: new THREE.Uniform(new THREE.Color()),
    uAx0: new THREE.Uniform(new THREE.Vector3(1, 0, 0)),
    uTime: new THREE.Uniform(0),
    uIntensity: new THREE.Uniform(0),
    uL: new THREE.Uniform(500),
    uWind: new THREE.Uniform(0.3),
    uNear: new THREE.Uniform(100),
    uNoise: new THREE.Uniform(null as THREE.Texture | null),
    uSkyRef: new THREE.Uniform(new THREE.Color()),
    uSkyT: new THREE.Uniform(1e9),
    R0: new THREE.Uniform(R0),
    TANA: new THREE.Uniform(Math.tan(HALF)),
  };
  /** DA-09 horn shutter target / eased 0..1. */
  private qualified = 0;
  private shutterS = 0;
  private intro = 1;
  private shown = 0;

  async init(ctx: EngineContext): Promise<void> {
    this.fx = await acquireFxTextures(ctx);
    this.bu = getBeamUniforms(ctx);
    this.lighthouse = ctx.services.get("lighthouse");
    const layout = ctx.services.get("layout");
    const pharos = layout?.landmarks?.find((l) => l.id === "pharos");
    this.lantern.set(pharos?.position[0] ?? 0, (pharos?.position[1] ?? 0) + 30, pharos?.position[2] ?? 0);

    // Inserted at init (before the first composer.render) just ahead of the bloom/AgX pass, after the
    // stale-fog pass when present, so the shaft lights the fog it crosses.
    this.U.uNoise.value = this.fx.noise;
    this.effect = new BeamEffect(new Map(Object.entries(this.U)) as Map<string, THREE.Uniform>);
    this.SH.uShNoise.value = this.fx.noise;
    this.shimmer = new ShimmerEffect(new Map(Object.entries(this.SH)) as Map<string, THREE.Uniform>);
    this.pass = new EffectPass(ctx.camera, this.shimmer, this.effect);
    this.pass.enabled = false;
    ctx.composer.addPass(this.pass, Math.max(1, ctx.composer.passes.length - 2));

    this.haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
      uniforms: { uColor: { value: new THREE.Color() }, uSize: { value: 30 }, uCore: { value: 1 }, uGlow: { value: 1 }, uStreak: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.haloMat);
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 21;
    this.halo.name = "beam-halo";
    ctx.scene.add(this.halo);

    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the introScale getter reads live state
    const sys = this;
    const svc: BeamService = {
      setReach: (v) => { this.reach = THREE.MathUtils.clamp(v, 0, 1); },
      setColor: (c) => { this.color.set(typeof c === "number" && c >= 0 && c <= 2 && Number.isInteger(c) ? LAMP_COLORS[c] : (c as THREE.ColorRepresentation)).multiply(FIRE_WARM); },
      setDayPresence: (v) => { this.dayPresence = THREE.MathUtils.clamp(v, 0, 1); },
      setQualified: (q) => { this.qualified = q ? 1 : 0; },
      setIntroScale: (k) => { this.intro = Number.isFinite(k) ? THREE.MathUtils.clamp(k, 0, 1) : 1; },
      get introScale() { return sys.intro; },
      reach: () => this.shown,
    };
    ctx.services.set("beam", svc);
    const p = new URLSearchParams(location.search);
    if (p.has("reach")) svc.setReach(Number(p.get("reach")));
    if (p.has("lamp")) svc.setColor(Number(p.get("lamp")) as 0 | 1 | 2);
    else svc.setColor(0);
    this.reachS = this.reach; this.colorS.copy(this.color);
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const dt = frame.delta;
    this.lighthouse ??= ctx.services.get("lighthouse");
    const lp = this.lighthouse?.lanternPosition;
    if (Array.isArray(lp)) this.lantern.set(lp[0], lp[1], lp[2]);
    else if (lp) this.lantern.copy(lp);
    // internal convention: the beam points along (cos a, 0, sin a)
    const angle = this.lighthouse?.sweepAngle ? Math.PI / 2 - this.lighthouse.sweepAngle() : (frame.elapsed * 2 * Math.PI) / 12;
    const lit = this.lighthouse?.lit ?? true;
    const flicker = this.lighthouse?.flicker ?? 1;
    this.reachS += (this.reach - this.reachS) * (1 - Math.exp(-dt));
    this.colorS.lerp(this.color, 1 - Math.exp(-dt * 1.5));
    // held beam (reduced motion): the rhythm becomes a slow lamp swell at the sweep period
    this.stillFor = Math.abs(angle - this.lastAngle) < 1e-5 ? this.stillFor + dt : 0;
    this.lastAngle = angle;
    const period = Math.max(2, this.lighthouse?.period ?? 12);
    const swell = this.stillFor > 0.5 ? 0.4 + 0.6 * (0.5 + 0.5 * Math.cos((frame.elapsed * 2 * Math.PI) / period)) : 1;
    // the firelight breathes (damped: the mirror gathers the whole fire)
    const breath = 0.7 + 0.3 * flicker;

    const L = 240 + 420 * this.reachS;
    const night = ctx.uniforms.uNight.value;
    const nightK = THREE.MathUtils.smoothstep(night, 0.2, 0.9);
    // DA-09 horn shutter: eases in over a few seconds; narrows the cone and dims it a touch (still sweeps)
    this.shutterS += (this.qualified - this.shutterS) * (1 - Math.exp(-dt / 2.5));
    const narrow = 1 - 0.45 * this.shutterS;
    const intro = this.intro;
    this.shown = this.reachS * (lit ? 1 : 0) * intro;
    const vis = nightK * (0.35 + 0.65 * this.reachS) * (lit ? 1 : 0) * swell * breath * (1 - 0.15 * this.shutterS) * intro;

    // glint: the mirror swinging to face the camera's azimuth (once per revolution: one mirror, one beam)
    const cam = ctx.camera.position;
    const toCam = this.tmp.set(cam.x - this.lantern.x, 0, cam.z - this.lantern.z).normalize();
    const c0 = Math.cos(angle) * toCam.x + Math.sin(angle) * toCam.z;
    const day = 1 - nightK;
    // caution by day (readings): the glint widens so the rhythm reads at a glance
    const dayAlert = this.dayPresence * day * (lit ? 1 : 0);
    // the day glint is a little wider than the night flash so the once-per-revolution rhythm is caught
    const flash = lit ? Math.pow(Math.max(0, c0), 60 - 28 * day - 18 * dayAlert) : 0;

    // fog thickens the shaft (more to scatter from)
    const fog = ctx.services.get("readings")?.fog ?? 0;
    const U = this.U;
    const ct = Math.cos(TILT), st = Math.sin(TILT);
    U.uAx0.value.set(Math.cos(angle) * ct, -st, Math.sin(angle) * ct);
    // the shaft is born at the mirror face, behind the fire
    this.mirror.copy(this.lantern).addScaledVector(U.uAx0.value, -MIRROR_BACK);
    U.uBeamPos.value.copy(this.mirror);
    // firelight: the shaft warms toward orange as the fire gutters, whitens a touch as it leaps
    U.uColor.value.copy(this.colorS).multiply(this.fireTint.setRGB(1, 0.94 + 0.06 * flicker, 0.84 + 0.16 * flicker));
    U.uIntensity.value = vis * 1.05 * (1 + 0.8 * fog);
    U.uL.value = L;
    U.R0.value = R0 * narrow;
    U.TANA.value = Math.tan(HALF * narrow);
    U.uTime.value = frame.elapsed;
    U.uSkyRef.value.copy(ctx.uniforms.uHorizon.value);
    const skyH = ctx.services.get("sky")?.horizonDistance?.();
    U.uSkyT.value = skyH && skyH > 0 ? skyH * 0.9 : 1e9;
    // the shaft fades out before it reaches the camera (never a smear across the foreground)
    U.uNear.value = THREE.MathUtils.clamp(this.lantern.distanceTo(cam) * 0.55, 40, 320);
    const sky = ctx.services.get("sky");
    U.uWind.value = sky?.shared?.uWeatherSea.value.y ?? 0.3;
    U.uCamWorld.value.copy(ctx.camera.matrixWorld);
    U.uInvProj.value.copy(ctx.camera.projectionMatrixInverse);
    // heat shimmer: a close-range read (the lantern must be big enough on screen to bend)
    const lp2 = this.ndc.copy(this.lantern).project(ctx.camera);
    const dCam = this.lantern.distanceTo(cam);
    const pxPerM = 1 / (2 * dCam * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2));
    this.SH.uShC.value.set(lp2.x * 0.5 + 0.5, lp2.y * 0.5 + 0.5 + 6 * pxPerM);
    this.SH.uShR.value.set(5.5 * pxPerM / ctx.camera.aspect, 5.5 * pxPerM);
    const onScreen = lp2.z < 1 && Math.abs(lp2.x) < 1.3 && lp2.y > -1.3 && lp2.y < 1.6;
    const reduced = ctx.services.get("motion")?.reduced ?? false;
    this.SH.uShAmt.value = shimmerAmount(dCam, lit, onScreen, breath, reduced);
    this.SH.uShT.value = frame.elapsed;
    this.pass.enabled = beamPassActive(U.uIntensity.value, this.SH.uShAmt.value);

    // the mirror's glint: a sharp warm star when it faces the viewer (by day the sun glint, on rhythm); between
    // flashes only a faint ember of it remains, so the lantern reads as fire, not a lamp bulb
    const dist = this.lantern.distanceTo(cam);
    this.halo.position.copy(this.lantern);
    const hu = this.haloMat.uniforms;
    hu.uColor.value.copy(this.colorS);
    hu.uSize.value = dist * (0.04 + 0.05 * flash);
    const near = THREE.MathUtils.smoothstep(dist, 60, 220);       // close-up: let the colonnade read
    hu.uCore.value = (0.1 * nightK * swell + (3.0 + 5 * day) * flash + 3.0 * dayAlert) * (0.35 + 0.65 * near) * breath;
    hu.uGlow.value = (0.12 * nightK * swell + (1.4 + 1.5 * day) * flash + 7.0 * dayAlert) * (0.3 + 0.7 * near);
    hu.uStreak.value = ((1.1 + 0.6 * day) * flash) * (0.5 + 0.5 * near);
    this.halo.visible = lit && intro > 0.01;
    if (intro < 1) { hu.uCore.value *= intro; hu.uGlow.value *= intro; hu.uStreak.value *= intro; }

    // shared with the sea (one beam: no back foot)
    this.bu.uBeamPos.value.copy(this.lantern);
    this.bu.uBeamAngle.value = angle;
    this.bu.uBeamCol.value.copy(this.colorS).multiplyScalar((0.1 + 0.15 * dayAlert + 0.9 * nightK) * (0.4 + 0.6 * this.reachS) * 1.3 * (lit ? 1 : 0) * swell * breath * intro);
    this.bu.uBeamShape.value.set(L, HALF * narrow, TILT, flash * (1.5 + 2.5 * day) * intro);
    this.bu.uBeamFall.value.set(L * 0.22, R0 * narrow, Math.tan(HALF * narrow), this.reachS);
    // 05-P1: the shaft's scattered light on what it passes over (night only; kit, fleet, sprites, plume)
    const litK = (lit ? 1 : 0) * swell * breath * intro * (1 - 0.15 * this.shutterS);
    this.bu.uBeamLight.value.copy(this.colorS).multiplyScalar(BEAM_LIGHT_GAIN * nightK * (0.4 + 0.6 * this.reachS) * litK);
    // 05-P2: by day the mirror throws the sun, dimmed by the DEWS cloud (no sun, no heliograph)
    const cloud = sky?.shared?.uWeatherSea.value.x ?? 0.3;
    const sunK = HELIO_GAIN * day * (0.5 + 0.5 * this.reachS) * litK * THREE.MathUtils.clamp(1 - 1.1 * cloud, 0, 1);
    const sc = ctx.uniforms.uSunColor.value;
    this.bu.uBeamSun.value.set(sc.r * sunK, sc.g * 0.88 * sunK, sc.b * 0.66 * sunK, L * 0.35);
  }

  dispose(ctx: EngineContext): void {
    ctx.composer.removePass(this.pass);
    this.pass.dispose();
    ctx.scene.remove(this.halo);
    this.halo.geometry.dispose();
    this.haloMat.dispose();
    this.fx.release();
    ctx.services.delete("beam");
  }
}
