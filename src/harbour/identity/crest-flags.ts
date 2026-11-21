import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";
import { AERIAL_GLSL, AERIAL_VERT_GLSL, aerialUniforms } from "../world/aerial";

/**
 * Chain house flags (D17): the crest flown large over each harbour office, on a topmast stepped above the
 * office's own pole so it clears the roofs and reads at the overview. Cloth flutters downwind (the life
 * layer's wind), with travelling folds that shade the cloth; at night a lamp at the truck keeps it faintly lit.
 * One instanced draw for the flags, one for the topmasts.
 * E03b (O6-I1, O1-I8, O2-I5; ruling V6): flags at the town's scale, lit as cloth. Topmasts are 6 m (a site may fly
 * higher: Ethereum's 7 m), the cloth takes half the distance air, and at night only the truck lamp's glow at the hoist
 * head lights it, so the crest falls with the facades below the Pharos.
 */
/** E03b: share of the distance air the crest cloth takes. */
export const CREST_AIR = 0.5;
/** E03b: how far (flag units, fly = 1) the truck lamp's glow reaches down the cloth from the hoist head. */
export const CREST_GLOW_REACH = 0.6;
const ASPECT = 0.664;
const VERT = /* glsl */ `
attribute vec4 aRect;
attribute float aPhase;
uniform float uFlagT;
uniform float uWind;
varying vec2 vUv;
varying vec2 vFlagUv;
varying float vShade;
varying float vHoist;
varying vec3 vWorldN;
varying vec3 vWorldPos;
${AERIAL_VERT_GLSL}
void main() {
  vec2 q = uv;
  vFlagUv = uv;
  vUv = vec2(mix(aRect.x, aRect.z, uv.x), mix(aRect.y, aRect.w, uv.y));
  vec3 p = position;
  float fly = uv.x;                       // 0 at the hoist … 1 at the fly
  float w = clamp(uWind, 0.0, 1.0);
  float ph = uFlagT * (3.2 + 3.0 * w) + aPhase;
  float diag = (1.0 - uv.y) * 0.85;
  float a1 = ph - fly * 6.0 + diag;
  float a2 = ph * 1.7 - fly * 11.0 + 1.3 + diag * 0.5;
  float wave = sin(a1) + 0.45 * sin(a2);
  float amp = 0.10 + 0.10 * w;
  p.z += wave * amp * fly;
  // a calm lets the fly sag; a breeze lifts it out
  float sag = (1.0 - smoothstep(0.1, 0.65, w)) * 0.22;
  p.y -= sag * fly * fly;
  p.x *= 1.0 - sag * 0.3 * fly;
  // analytic deformed cloth tangents -> world-space normal (handles non-uniform instance scale cleanly)
  float dWaveDx = -6.0 * cos(a1) - 4.95 * cos(a2);
  float dWaveDy = -0.85 * cos(a1) - 0.19125 * cos(a2);
  vec3 locT = vec3(1.0 - sag * 0.6 * fly, -2.0 * sag * fly, amp * (wave + fly * dWaveDx));
  vec3 locB = vec3(0.0, 1.0, amp * fly * dWaveDy);
  mat3 wm = mat3(modelMatrix) * mat3(instanceMatrix);
  vWorldN = normalize(cross(wm * locT, wm * locB));
  vShade = 0.82 + 0.18 * cos(a1);
  vHoist = length(vec2(q.x, (1.0 - q.y) * ${ASPECT.toFixed(3)}));
  vWorldPos = (modelMatrix * instanceMatrix * vec4(p, 1.0)).xyz;
  hbAerialVert(vWorldPos);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uCrests;
uniform vec3 uLight;
uniform float uGlow;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNight;
varying vec2 vUv;
varying vec2 vFlagUv;
varying float vShade;
varying float vHoist;
varying vec3 vWorldN;
varying vec3 vWorldPos;
${AERIAL_GLSL}
void main() {
  vec4 t = texture2D(uCrests, vUv);
  vec3 N = normalize(vWorldN) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 V = normalize(cameraPosition - vWorldPos);
  // subtle woven linen cloth grain & stitched hem border (AA-faded to 1.0 at overview)
  vec2 fw = fwidth(vFlagUv) + 1e-4;
  float weaveFine = 1.0 - smoothstep(0.012, 0.045, max(fw.x, fw.y));
  float weave = ((sin(vFlagUv.x * 150.0) * 0.5 + 0.5) * 0.55 + (sin(vFlagUv.y * 100.0) * 0.5 + 0.5) * 0.45 - 0.5) * weaveFine;
  float edgeD = min(min(vFlagUv.x, 1.0 - vFlagUv.x), min(vFlagUv.y, 1.0 - vFlagUv.y));
  float hem = 1.0 - smoothstep(0.018, 0.045, edgeD);
  float clothTex = 1.0 + weave * 0.065 - hem * 0.07 * weaveFine;
  // directional sunlight fold contrast + soft cloth rim sheen + warm golden backlit linen translucency
  float daySun = smoothstep(-0.02, 0.05, uSunDir.y) * (1.0 - uNight);
  float sunFace = max(dot(N, uSunDir), 0.0);
  float shade = vShade * (0.92 + 0.16 * sunFace * daySun);
  float back = max(0.0, dot(-N, uSunDir));
  float low = 1.0 - smoothstep(0.08, 0.50, uSunDir.y);
  float toward = 0.26 + 0.74 * pow(max(0.0, dot(-V, uSunDir)), 2.4);
  vec3 sss = t.rgb * uSunColor * mix(vec3(1.05, 0.96, 0.80), vec3(1.18, 0.88, 0.50), low)
           * back * toward * daySun * (1.0 - hem * 0.45) * 0.28;
  float ls = dot(sss, vec3(0.2126, 0.7152, 0.0722));
  sss *= min(1.0, 0.36 / max(ls, 1e-4));
  vec3 rim = t.rgb * uSunColor * pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.0) * sunFace * daySun * 0.10;
  // lit as cloth; the truck lamp at the hoist head
  vec3 c = t.rgb * clothTex * (uLight * shade + uGlow * (1.0 - smoothstep(0.0, ${CREST_GLOW_REACH.toFixed(2)}, vHoist))) + sss + rim;
  hbAerial(c, vec3(0.0), ${(1 - CREST_AIR).toFixed(2)});
  gl_FragColor = vec4(c, 1.0);
}`;

export interface FlagSite {
  x: number; y: number; z: number; rect: [number, number, number, number]; phase: number;
  /** Flag size multiplier (the dominant harbour flies a larger flag). */
  scale?: number;
  /** E03b: this site's topmast (m above the office pole), when it flies higher than the others. */
  topmast?: number;
}

export class CrestFlags {
  readonly group = new THREE.Group();
  private readonly flags: THREE.InstancedMesh;
  private readonly masts: THREE.InstancedMesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly rect: THREE.InstancedBufferAttribute;
  private readonly phase: THREE.InstancedBufferAttribute;
  private readonly sites: FlagSite[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly e = new THREE.Euler(0, 0, 0, "YXZ");
  private t = 0;
  private placementDirty = true;
  private lastCamX = NaN;
  private lastCamZ = NaN;
  private lastWindX = NaN;
  private lastWindZ = NaN;
  private lastWind = NaN;
  private lastScale = NaN;
  /** 1 close in … ~1.6 at the overview (set by the owner from the camera distance). */
  farScale = 1;

  /** air: the world's haze & sun uniforms (the crest's share of the distance air & backlit linen light); fly: flag length (m); aspect h/w; topmast (m) raised above the office pole. */
  constructor(
    crests: THREE.Texture,
    air?: Pick<WorldUniforms, "uFogDensity" | "uHaze" | "uHorizon"> & Partial<Pick<WorldUniforms, "uSunDir" | "uSunColor" | "uNight">>,
    private readonly fly = 11,
    private readonly aspect = ASPECT,
    readonly topmast = 6,
    max = 16,
  ) {
    const g = new THREE.PlaneGeometry(1, 1, 12, 3);
    g.translate(0.5, -0.5, 0);
    this.rect = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.phase = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    g.setAttribute("aRect", this.rect);
    g.setAttribute("aPhase", this.phase);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: {
        uCrests: { value: crests }, uFlagT: { value: 0 }, uWind: { value: 0.35 }, uLight: { value: new THREE.Color(1, 1, 1) }, uGlow: { value: 0 },
        ...aerialUniforms, uAerialDensity: air?.uFogDensity ?? { value: 0 }, uAerialHaze: air?.uHaze ?? { value: new THREE.Color() },
        uHorizon: air?.uHorizon ?? { value: new THREE.Color() },
        uSunDir: air?.uSunDir ?? { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() },
        uSunColor: air?.uSunColor ?? { value: new THREE.Color(0, 0, 0) },
        uNight: air?.uNight ?? { value: 0 },
      },
    });
    this.flags = new THREE.InstancedMesh(g, this.mat, max);
    this.flags.count = 0;
    this.flags.frustumCulled = false;
    this.flags.name = "identity-crest-flags";
    // topmast: a slim dark spar with a gilt truck
    const mast = new THREE.CylinderGeometry(0.11, 0.16, 1, 6, 1);
    mast.translate(0, 0.5, 0);
    this.masts = new THREE.InstancedMesh(mast, new THREE.MeshStandardMaterial({ color: "#3A332C", roughness: 0.7 }), max);
    this.masts.count = 0;
    this.masts.castShadow = true;
    this.masts.frustumCulled = false;
    this.masts.name = "identity-crest-topmasts";
    this.group.add(this.flags, this.masts);
  }

  add(site: FlagSite): void {
    const i = this.sites.length;
    if (i >= this.flags.instanceMatrix.count) return;
    this.sites.push(site);
    this.placementDirty = true;
    this.rect.setXYZW(i, ...site.rect);
    this.phase.setX(i, site.phase);
    this.rect.needsUpdate = this.phase.needsUpdate = true;
    this.m.compose(this.p.set(site.x, site.y - 0.4, site.z), this.q.identity(), this.s.set(1, (site.topmast ?? this.topmast) + 0.4, 1));
    this.masts.setMatrixAt(i, this.m);
    this.masts.count = this.flags.count = this.sites.length;
    this.masts.instanceMatrix.needsUpdate = true;
  }

  /** windTo: downwind unit (x, z); toCam: camera position for easing the cloth's face toward the viewer. */
  update(dt: number, moving: boolean, windTo: readonly [number, number], wind: number, light: THREE.Color, glow: number, cam: THREE.Vector3): void {
    if (!this.sites.length) return;
    if (moving) this.t += dt;
    const u = this.mat.uniforms;
    u.uFlagT.value = this.t;
    u.uWind.value = wind;
    (u.uLight.value as THREE.Color).copy(light);
    u.uGlow.value = glow;
    // Flutter lives entirely in uniforms; only camera/wind/scale/site changes affect instance placement.
    // This also leaves reduced-motion poses still without recurring matrix uploads.
    if (!this.placementDirty && this.lastCamX === cam.x && this.lastCamZ === cam.z
      && this.lastWindX === windTo[0] && this.lastWindZ === windTo[1]
      && this.lastWind === wind && this.lastScale === this.farScale) return;
    this.placementDirty = false;
    this.lastCamX = cam.x; this.lastCamZ = cam.z;
    this.lastWindX = windTo[0]; this.lastWindZ = windTo[1];
    this.lastWind = wind; this.lastScale = this.farScale;
    // the fly streams downwind: local +x → windTo, eased a little toward the viewer so the crest reads
    const down = Math.atan2(windTo[0], windTo[1]);
    for (let i = 0; i < this.sites.length; i++) {
      const f = this.sites[i];
      const toCam = Math.atan2(cam.x - f.x, cam.z - f.z);
      const side = Math.sin(toCam - down);
      const yaw = down - Math.PI / 2 + 0.45 * Math.sign(side) * (1 - Math.abs(side));
      this.e.set(0, yaw, 0, "YXZ");
      // seen from afar the house flags are dressed larger (signal flags are made to be read from a distance)
      const L = this.fly * (0.9 + 0.1 * Math.min(1, wind * 2)) * this.farScale;
      this.m.compose(this.p.set(f.x, f.y + (f.topmast ?? this.topmast), f.z), this.q.setFromEuler(this.e), this.s.set(L * (f.scale ?? 1), L * this.aspect * (f.scale ?? 1), L * 0.6));
      this.flags.setMatrixAt(i, this.m);
    }
    this.flags.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.flags.geometry.dispose(); this.mat.dispose();
    this.masts.geometry.dispose(); (this.masts.material as THREE.Material).dispose();
  }
}
