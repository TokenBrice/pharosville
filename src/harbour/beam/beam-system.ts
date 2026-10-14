import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import { acquireFxTextures, type FxTextures } from "../ocean/textures";
import { getBeamUniforms, type BeamUniforms } from "./uniforms";

/**
 * BEAM: the hero lighthouse beam. Two opposed cones raymarched in their own volume (noise-modulated
 * mist density, gaussian cross-section, length falloff), a lantern halo, and the shared uniforms that
 * make the sea glint where the beam sweeps. Strong at night, faint at dusk, a flash + glint by day.
 *
 * Reads the 'lighthouse' service ({ lanternPosition, sweepAngle() }) when present, else the layout's
 * pharos landmark + 30 m and a 12 s sweep. Service 'beam': setReach(0..1), setColor(0|1|2 | colour).
 */
export interface BeamService {
  setReach(v: number): void;
  /** 0 steady (warm white), 1 caution (amber), 2 alarm (red), or an explicit colour. */
  setColor(step: 0 | 1 | 2 | THREE.ColorRepresentation): void;
}

interface LighthouseLike {
  lanternPosition?: THREE.Vector3 | [number, number, number];
  /** Layout heading convention: the beam points along (sin h, 0, cos h). */
  sweepAngle?: () => number;
  readonly lit?: boolean;
}

export const LAMP_COLORS = ["#FFE0A8", "#FFB45A", "#FF6A4A"] as const;
const R0 = 1.1;            // beam radius at the lens (m)
const HALF = 0.05;        // cone half-angle (rad)
const TILT = 0.028;        // down-tilt (rad)

const BEAM_VERT = /* glsl */ `
varying vec3 vObj;
void main() { vObj = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uCamObj, uBeamPos, uColor;
uniform float uTime, uAngle, uIntensity, uL, uWind;
uniform sampler2D uNoise;
varying vec3 vObj;
const float R0 = ${R0.toFixed(3)};
const float TANA = ${Math.tan(HALF).toFixed(5)};
const float TILT = ${TILT.toFixed(5)};
float density(vec3 p, vec3 ax) {
  float s = dot(p, ax);
  if (s < -1.0) return 0.0;
  float r = length(p - ax * s);
  float Rn = R0 + max(s, 0.0) * TANA;
  float prof = exp(-(r * r) / (Rn * Rn) * 2.0) * 0.75 + exp(-(r * r) / (Rn * Rn) * 9.0) * 0.4;
  float fall = smoothstep(-1.0, 6.0, s) * exp(-s / (uL * 0.3)) * (1.0 - smoothstep(uL * 0.6, uL, s));
  // world-space mist (does not rotate with the beam)
  float c = cos(uAngle), sn = sin(uAngle);
  vec3 w = vec3(p.x * c - p.z * sn, p.y, p.x * sn + p.z * c) + uBeamPos;
  if (w.y < 0.0) return 0.0;
  vec2 drift = vec2(uTime * (0.6 + 2.0 * uWind), uTime * 0.25);
  float n1 = texture2D(uNoise, (w.xz + drift) * 0.0042 + w.y * 0.0021).r;
  float n2 = texture2D(uNoise, (w.xz - drift * 0.6) * 0.0135 + vec2(w.y * 0.011, 0.0)).g;
  float mist = 0.12 + 1.5 * smoothstep(0.3, 0.85, n1 * 0.7 + n2 * 0.55);
  float spread = pow(5.0 / (Rn + 4.0), 1.15);
  return prof * fall * mist * spread;
}
void main() {
  vec3 ro = uCamObj;
  vec3 rd = normalize(vObj - ro);
  float tExit = length(vObj - ro);
  float side = vObj.x >= 0.0 ? 1.0 : -1.0;
  vec3 ax = normalize(vec3(side * cos(TILT), -sin(TILT), 0.0));
  float s = max(dot(vObj, ax), 0.0);
  float Rm = (R0 + s * TANA) * 1.35;
  float sinT = max(length(cross(rd, ax)), 0.08);
  float chord = min(2.0 * Rm / sinT, uL * 0.6);
  float t0 = max(tExit - chord, 0.0);
  const int N = 14;
  float dt = (tExit - t0) / float(N);
  float acc = 0.0;
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * (t0 + (float(i) + jitter) * dt);
    acc += density(p, ax);
  }
  acc *= dt;
  gl_FragColor = vec4(uColor * acc * uIntensity * 0.3, 1.0);
}`;

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

const HALO_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uCore, uGlow, uStreak;
varying vec2 vQ;
void main() {
  float r = length(vQ);
  float core = exp(-r * r * 260.0) * uCore;
  float glow = exp(-r * r * 22.0) * 0.22 * uGlow + exp(-r * 5.0) * 0.05 * uGlow;
  float streak = exp(-abs(vQ.y) * 140.0) * exp(-abs(vQ.x) * 4.5) * uStreak;
  gl_FragColor = vec4(uColor * (core + glow + streak), 1.0);
}`;

function coneGeometry(L: number): THREE.BufferGeometry {
  const rEnd = (R0 + L * Math.tan(HALF)) * 1.35;
  const one = new THREE.CylinderGeometry(R0 * 1.35, rEnd, L, 28, 1, true);
  one.translate(0, -L / 2, 0);
  one.rotateZ(Math.PI / 2);      // -Y (wide end) -> +X
  one.rotateZ(-TILT);
  const two = one.clone();
  two.rotateY(Math.PI);
  const n = one.attributes.position.count;
  const pos = new Float32Array(n * 6);
  pos.set(one.attributes.position.array as Float32Array);
  pos.set(two.attributes.position.array as Float32Array, n * 3);
  const idx: number[] = [];
  const i1 = one.index!.array;
  for (let i = 0; i < i1.length; i++) idx.push(i1[i]);
  for (let i = 0; i < i1.length; i++) idx.push(i1[i] + n);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  one.dispose(); two.dispose();
  return g;
}

export class BeamSystem implements WorldSystem {
  readonly name = "beam";
  private group = new THREE.Group();
  private cone!: THREE.Mesh;
  private coneMat!: THREE.ShaderMaterial;
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
  private builtL = 0;
  private readonly inv = new THREE.Matrix4();
  private readonly tmp = new THREE.Vector3();

  init(ctx: EngineContext): void {
    this.fx = acquireFxTextures(ctx);
    this.bu = getBeamUniforms(ctx);
    this.lighthouse = ctx.services.get("lighthouse") as LighthouseLike | undefined;
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    const pharos = layout?.landmarks?.find((l) => l.id === "pharos");
    this.lantern.set(pharos?.position[0] ?? 0, (pharos?.position[1] ?? 0) + 30, pharos?.position[2] ?? 0);

    this.coneMat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      uniforms: {
        uCamObj: { value: new THREE.Vector3() }, uBeamPos: this.bu.uBeamPos, uColor: { value: new THREE.Color() },
        uTime: ctx.uniforms.uTime, uAngle: { value: 0 }, uIntensity: { value: 1 }, uL: { value: 500 }, uWind: { value: 0.3 },
        uNoise: { value: this.fx.noise },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false,
    });
    this.cone = new THREE.Mesh(new THREE.BufferGeometry(), this.coneMat);
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 20;
    this.cone.name = "beam-cone";
    this.haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
      uniforms: { uColor: { value: new THREE.Color() }, uSize: { value: 30 }, uCore: { value: 1 }, uGlow: { value: 1 }, uStreak: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    const q = new THREE.PlaneGeometry(2, 2);
    this.halo = new THREE.Mesh(q, this.haloMat);
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 21;
    this.halo.name = "beam-halo";
    this.group.add(this.cone, this.halo);
    ctx.scene.add(this.group);

    const svc: BeamService = {
      setReach: (v) => { this.reach = THREE.MathUtils.clamp(v, 0, 1); },
      setColor: (c) => { this.color.set(typeof c === "number" && c >= 0 && c <= 2 && Number.isInteger(c) ? LAMP_COLORS[c] : (c as THREE.ColorRepresentation)); },
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

    const L = Math.round(240 + 420 * this.reachS);
    if (Math.abs(L - this.builtL) > 8) {
      this.cone.geometry.dispose();
      this.cone.geometry = coneGeometry(L);
      this.builtL = L;
    }
    const night = ctx.uniforms.uNight.value;
    const nightK = THREE.MathUtils.smoothstep(night, 0.12, 0.9);
    const vis = (0.03 + 0.97 * nightK) * (0.35 + 0.65 * this.reachS) * (lit ? 1 : 0);

    // flash: a beam swinging past the camera's azimuth lights the lantern up (readable by day)
    const cam = ctx.camera.position;
    const toCam = this.tmp.set(cam.x - this.lantern.x, 0, cam.z - this.lantern.z).normalize();
    const c0 = Math.cos(angle) * toCam.x + Math.sin(angle) * toCam.z;
    const flash = lit ? Math.pow(Math.abs(c0), 90) : 0;

    this.group.position.copy(this.lantern);
    this.cone.rotation.y = -angle;
    this.group.updateMatrixWorld(true);
    this.inv.copy(this.cone.matrixWorld).invert();
    const cu = this.coneMat.uniforms;
    cu.uCamObj.value.copy(cam).applyMatrix4(this.inv);
    cu.uColor.value.copy(this.colorS);
    cu.uAngle.value = angle;
    cu.uIntensity.value = vis;
    cu.uL.value = L;
    this.cone.visible = vis > 0.01;
    const hu = this.haloMat.uniforms;
    hu.uColor.value.copy(this.colorS);
    hu.uCore.value = 0.5 + 12 * nightK + 16 * flash;
    hu.uGlow.value = 0.08 + 1.6 * nightK + 2.2 * flash;
    hu.uStreak.value = flash * 0.5;
    hu.uSize.value = 26 + 22 * flash;

    // shared with the sea
    this.bu.uBeamPos.value.copy(this.lantern);
    this.bu.uBeamAngle.value = angle;
    this.bu.uBeamCol.value.copy(this.colorS).multiplyScalar((0.08 + 0.92 * nightK) * (0.4 + 0.6 * this.reachS) * 1.4 * (lit ? 1 : 0));
    this.halo.visible = lit;
    this.bu.uBeamShape.value.set(L, HALF, TILT, flash * 3.0 * (1 - nightK * 0.5));
  }

  dispose(ctx: EngineContext): void {
    ctx.scene.remove(this.group);
    this.cone.geometry.dispose();
    this.coneMat.dispose();
    this.halo.geometry.dispose();
    this.haloMat.dispose();
    this.fx.release();
    ctx.services.delete("beam");
  }
}
