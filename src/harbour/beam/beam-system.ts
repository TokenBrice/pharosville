import * as THREE from "three";
import { Effect, EffectAttribute, EffectPass, BlendFunction } from "postprocessing";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import { acquireFxTextures, type FxTextures } from "../ocean/textures";
import { getBeamUniforms, type BeamUniforms } from "./uniforms";

/**
 * BEAM: the hero lighthouse beam. A depth-aware post effect (scene-linear, before bloom / AgX) that
 * integrates two opposed light shafts along each view ray, stopping at the scene depth, so the beam
 * ends on the hills, the town and the water instead of painting over them. Gaussian cross-section with
 * a soft edge, brightest at the lantern and thinning out over the sea, drifting mist breakup, faded
 * near the camera and when the shaft points along the view, and a soft optical-depth cap so it never
 * blows out. A star-flare lantern sprite carries the brightness; by day only the rhythm flash and the
 * sea glint read. The shared uniforms make the sea glint where the beam sweeps.
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
}

interface LighthouseLike {
  lanternPosition?: THREE.Vector3 | [number, number, number];
  /** Layout heading convention: the beam points along (sin h, 0, cos h). */
  sweepAngle?: () => number;
  readonly period?: number;
  readonly lit?: boolean;
}

export const LAMP_COLORS = ["#FFE0A8", "#FFB45A", "#FF6A4A"] as const;
const R0 = 0.9;            // beam radius at the lens (m)
const HALF = 0.042;        // cone half-angle (rad), ~2.4 deg
const TILT = 0.024;        // down-tilt (rad)

const BEAM_FRAG = /* glsl */ `
uniform mat4 uCamWorld;
uniform mat4 uInvProj;
uniform vec3 uBeamPos, uColor, uAx0, uAx1;
uniform float uTime, uIntensity, uL, uWind, uNear;
uniform sampler2D uNoise;
const float R0 = ${R0.toFixed(3)};
const float TANA = ${Math.tan(HALF).toFixed(5)};

float bmHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

float beamDensity(vec3 p, vec3 ax, float L) {
  vec3 q = p - uBeamPos;
  float s = dot(q, ax);
  float r = length(q - ax * s);
  float Rn = R0 + max(s, 0.0) * TANA;
  float x2 = (r * r) / (Rn * Rn);
  // soft edge + a brighter core
  float prof = exp(-x2 * 2.6) * 0.7 + exp(-x2 * 12.0) * 0.45;
  // brightest at the lantern, thinning over the water, gone well before the reach
  float fall = smoothstep(0.0, 5.0, s) * (0.07 + 0.93 * exp(-s / (L * 0.2))) * (1.0 - smoothstep(L * 0.5, L, s));
  // light spreads as the shaft widens
  float spread = pow(3.2 / (Rn + 2.2), 1.7);
  // drifting sea-mist breakup (world space, does not rotate with the beam)
  vec2 drift = vec2(uTime * (0.6 + 2.0 * uWind), uTime * 0.25);
  float n1 = texture2D(uNoise, (p.xz + drift) * 0.0045 + p.y * 0.0021).r;
  float n2 = texture2D(uNoise, (p.xz - drift * 0.6) * 0.016 + vec2(p.y * 0.013, 0.0)).g;
  float mist = 0.18 + 1.6 * smoothstep(0.3, 0.85, n1 * 0.7 + n2 * 0.55);
  return prof * fall * spread * mist;
}

// integrate one shaft along the ray [0, tMax]
float shaft(vec3 ro, vec3 rd, float tMax, vec3 ax, float jitter) {
  vec3 w0 = uBeamPos - ro;
  float b = dot(ax, rd);
  float d = dot(ax, w0), e = dot(rd, w0);
  float den = max(1.0 - b * b, 1e-4);
  float sc = clamp((b * e - d) / den, 0.0, uL);
  vec3 pa = uBeamPos + ax * sc;
  float tc = dot(pa - ro, rd);
  float dist = length(pa - (ro + rd * tc));
  float Rn = R0 + sc * TANA;
  if (dist > Rn * 2.4) return 0.0;
  float sinT = sqrt(den);
  float chord = min(Rn * 2.6 / max(sinT, 0.05), uL * 0.45);
  float t0 = max(tc - chord, 0.0), t1 = min(tc + chord, tMax);
  if (t1 <= t0) return 0.0;
  const int N = 18;
  float dt = (t1 - t0) / float(N);
  float acc = 0.0;
  for (int i = 0; i < N; i++) {
    float t = t0 + (float(i) + jitter) * dt;
    acc += beamDensity(ro + rd * t, ax, uL) * smoothstep(uNear * 0.35, uNear, t);
  }
  // a shaft seen end-on, or swinging toward the viewer, would wash the frame: the lantern flare carries
  // that read instead
  vec2 toCam = normalize(ro.xz - uBeamPos.xz);
  float toward = dot(normalize(ax.xz), toCam);
  return acc * dt * mix(0.3, 1.0, smoothstep(0.08, 0.45, sinT)) * (1.0 - 0.85 * smoothstep(0.2, 0.95, toward));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  outputColor = inputColor;
  if (uIntensity < 0.002) return;
  float viewZ = perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
  vec4 ray = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 vp = ray.xyz / ray.w;
  vec3 rdV = normalize(vp);
  vec3 ro = uCamWorld[3].xyz;
  vec3 rd = normalize((uCamWorld * vec4(rdV, 0.0)).xyz);
  float tMax = viewZ / rdV.z;   // both negative: distance along the ray to the surface
  float jitter = bmHash(gl_FragCoord.xy + fract(uTime) * 61.0);
  float acc = shaft(ro, rd, tMax, uAx0, jitter) + shaft(ro, rd, tMax, uAx1, jitter);
  // optical-depth cap: the shaft saturates softly instead of blowing out what lies behind it
  float a = 1.0 - exp(-acc * 0.7);
  outputColor = vec4(inputColor.rgb + uColor * a * uIntensity, inputColor.a);
}`;

class BeamEffect extends Effect {
  constructor(uniforms: Map<string, THREE.Uniform>) {
    super("HarbourBeamEffect", BEAM_FRAG, { blendFunction: BlendFunction.SET, attributes: EffectAttribute.DEPTH, uniforms });
  }
}

const HALO_VERT = /* glsl */ `
uniform float uSize;
varying vec2 vQ;
void main() {
  vQ = position.xy;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xyz += normalize(-mv.xyz) * 6.0;               // pull toward the camera past the lantern glass
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}`;

// star flare: a tight core, a faint glow and a thin four-point glint (never a sphere)
const HALO_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uCore, uGlow, uStreak;
varying vec2 vQ;
void main() {
  float r = length(vQ);
  float core = exp(-r * r * 1400.0) * uCore;
  float glow = (exp(-r * r * 60.0) * 0.12 + exp(-r * 9.0) * 0.03) * uGlow;
  float ax = abs(vQ.x), ay = abs(vQ.y);
  float star = (exp(-ay * 220.0) * exp(-ax * 5.5) + exp(-ax * 220.0) * exp(-ay * 9.0) * 0.6) * uStreak;
  float diag = exp(-abs(vQ.x - vQ.y) * 300.0) + exp(-abs(vQ.x + vQ.y) * 300.0);
  star += diag * exp(-r * 14.0) * 0.25 * uStreak;
  gl_FragColor = vec4(uColor * (core + glow + star) * (1.0 - smoothstep(0.85, 1.0, r)), 1.0);
}`;

export class BeamSystem implements WorldSystem {
  readonly name = "beam";
  private effect!: BeamEffect;
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
  private lighthouse: LighthouseLike | undefined;
  private lastAngle = NaN;
  private stillFor = 0;
  private dayPresence = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly U = {
    uCamWorld: new THREE.Uniform(new THREE.Matrix4()),
    uInvProj: new THREE.Uniform(new THREE.Matrix4()),
    uBeamPos: new THREE.Uniform(new THREE.Vector3()),
    uColor: new THREE.Uniform(new THREE.Color()),
    uAx0: new THREE.Uniform(new THREE.Vector3(1, 0, 0)),
    uAx1: new THREE.Uniform(new THREE.Vector3(-1, 0, 0)),
    uTime: new THREE.Uniform(0),
    uIntensity: new THREE.Uniform(0),
    uL: new THREE.Uniform(500),
    uWind: new THREE.Uniform(0.3),
    uNear: new THREE.Uniform(100),
    uNoise: new THREE.Uniform(null as THREE.Texture | null),
  };

  init(ctx: EngineContext): void {
    this.fx = acquireFxTextures(ctx);
    this.bu = getBeamUniforms(ctx);
    this.lighthouse = ctx.services.get("lighthouse") as LighthouseLike | undefined;
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    const pharos = layout?.landmarks?.find((l) => l.id === "pharos");
    this.lantern.set(pharos?.position[0] ?? 0, (pharos?.position[1] ?? 0) + 30, pharos?.position[2] ?? 0);

    // Inserted at init (before the first composer.render) just ahead of the bloom/AgX pass, after the
    // stale-fog pass when present, so the shaft lights the fog it crosses.
    this.U.uNoise.value = this.fx.noise;
    this.effect = new BeamEffect(new Map(Object.entries(this.U)) as Map<string, THREE.Uniform>);
    this.pass = new EffectPass(ctx.camera, this.effect);
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

    const svc: BeamService = {
      setReach: (v) => { this.reach = THREE.MathUtils.clamp(v, 0, 1); },
      setColor: (c) => { this.color.set(typeof c === "number" && c >= 0 && c <= 2 && Number.isInteger(c) ? LAMP_COLORS[c] : (c as THREE.ColorRepresentation)); },
      setDayPresence: (v) => { this.dayPresence = THREE.MathUtils.clamp(v, 0, 1); },
    };
    ctx.services.set("beam", svc);
    const p = new URLSearchParams(location.search);
    if (p.has("reach")) svc.setReach(Number(p.get("reach")));
    if (p.has("lamp")) svc.setColor(Number(p.get("lamp")) as 0 | 1 | 2);
    this.reachS = this.reach; this.colorS.copy(this.color);
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const dt = frame.delta;
    this.lighthouse ??= ctx.services.get("lighthouse") as LighthouseLike | undefined;
    const lp = this.lighthouse?.lanternPosition;
    if (Array.isArray(lp)) this.lantern.set(lp[0], lp[1], lp[2]);
    else if (lp) this.lantern.copy(lp);
    // internal convention: beam 0 points along (cos a, 0, sin a)
    const angle = this.lighthouse?.sweepAngle ? Math.PI / 2 - this.lighthouse.sweepAngle() : (frame.elapsed * 2 * Math.PI) / 12;
    const lit = this.lighthouse?.lit ?? true;
    this.reachS += (this.reach - this.reachS) * (1 - Math.exp(-dt));
    this.colorS.lerp(this.color, 1 - Math.exp(-dt * 1.5));
    // held beam (reduced motion): the rhythm becomes a slow lamp swell at the sweep period
    this.stillFor = Math.abs(angle - this.lastAngle) < 1e-5 ? this.stillFor + dt : 0;
    this.lastAngle = angle;
    const period = Math.max(2, this.lighthouse?.period ?? 12);
    const swell = this.stillFor > 0.5 ? 0.4 + 0.6 * (0.5 + 0.5 * Math.cos((frame.elapsed * 2 * Math.PI) / period)) : 1;

    const L = 240 + 420 * this.reachS;
    const night = ctx.uniforms.uNight.value;
    const nightK = THREE.MathUtils.smoothstep(night, 0.2, 0.9);
    const vis = nightK * (0.35 + 0.65 * this.reachS) * (lit ? 1 : 0) * swell;

    // flash: a beam swinging past the camera's azimuth lights the lantern up (readable by day)
    const cam = ctx.camera.position;
    const toCam = this.tmp.set(cam.x - this.lantern.x, 0, cam.z - this.lantern.z).normalize();
    const c0 = Math.cos(angle) * toCam.x + Math.sin(angle) * toCam.z;
    const day = 1 - nightK;
    // caution by day (readings): the flash widens so the rhythm reads at a glance, the lamp stays lit
    const dayAlert = this.dayPresence * day * (lit ? 1 : 0);
    const flash = lit ? Math.pow(Math.abs(c0), 60 - 46 * dayAlert) : 0;

    // fog thickens the shaft (more to scatter from)
    const fog = (ctx.services.get("readings") as { fog?: number } | undefined)?.fog ?? 0;
    const U = this.U;
    const ct = Math.cos(TILT), st = Math.sin(TILT);
    U.uAx0.value.set(Math.cos(angle) * ct, -st, Math.sin(angle) * ct);
    U.uAx1.value.set(-Math.cos(angle) * ct, -st, -Math.sin(angle) * ct);
    U.uBeamPos.value.copy(this.lantern);
    U.uColor.value.copy(this.colorS);
    U.uIntensity.value = vis * 0.95 * (1 + 0.8 * fog);
    U.uL.value = L;
    U.uTime.value = frame.elapsed;
    // the shaft fades out before it reaches the camera (never a smear across the foreground)
    U.uNear.value = THREE.MathUtils.clamp(this.lantern.distanceTo(cam) * 0.55, 40, 320);
    const sky = ctx.services.get("sky") as { shared?: { uWeatherSea: THREE.IUniform<THREE.Vector4> } } | undefined;
    U.uWind.value = sky?.shared?.uWeatherSea.value.y ?? 0.3;
    U.uCamWorld.value.copy(ctx.camera.matrixWorld);
    U.uInvProj.value.copy(ctx.camera.projectionMatrixInverse);
    this.pass.enabled = U.uIntensity.value > 0.002;

    // lantern star flare: constant screen size, steady by night, a rhythm flash by day
    const dist = this.lantern.distanceTo(cam);
    this.halo.position.copy(this.lantern);
    const hu = this.haloMat.uniforms;
    hu.uColor.value.copy(this.colorS);
    hu.uSize.value = dist * (0.045 + 0.035 * flash);
    const near = THREE.MathUtils.smoothstep(dist, 60, 220);       // close-up: let the glazing read
    hu.uCore.value = (1.4 * nightK * swell + (2.5 + 5 * day) * flash + 3.0 * dayAlert) * (0.35 + 0.65 * near);
    hu.uGlow.value = (0.6 * nightK * swell + (1.2 + 1.5 * day) * flash + 7.0 * dayAlert) * (0.3 + 0.7 * near);
    hu.uStreak.value = (0.25 * nightK * swell + (0.9 + 0.8 * day) * flash) * (0.5 + 0.5 * near);
    this.halo.visible = lit;

    // shared with the sea
    this.bu.uBeamPos.value.copy(this.lantern);
    this.bu.uBeamAngle.value = angle;
    this.bu.uBeamCol.value.copy(this.colorS).multiplyScalar((0.1 + 0.15 * dayAlert + 0.9 * nightK) * (0.4 + 0.6 * this.reachS) * 1.3 * (lit ? 1 : 0) * swell);
    this.bu.uBeamShape.value.set(L, HALF, TILT, flash * (1.5 + 2.5 * day));
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
