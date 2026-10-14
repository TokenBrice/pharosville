import * as THREE from "three";

/**
 * Chain house flags (D17): the crest flown large over each harbour office, on a topmast stepped above the
 * office's own pole so it clears the roofs and reads at the overview. Cloth flutters downwind (the life
 * layer's wind), with travelling folds that shade the cloth; at night a lamp at the truck keeps it faintly lit.
 * One instanced draw for the flags, one for the topmasts.
 */
const VERT = /* glsl */ `
attribute vec4 aRect;
attribute float aPhase;
uniform float uFlagT;
uniform float uWind;
varying vec2 vUv;
varying float vShade;
void main() {
  vec2 q = uv;
  vUv = vec2(mix(aRect.x, aRect.z, uv.x), mix(aRect.y, aRect.w, uv.y));
  vec3 p = position;
  float fly = uv.x;                       // 0 at the hoist … 1 at the fly
  float w = clamp(uWind, 0.0, 1.0);
  float ph = uFlagT * (3.2 + 3.0 * w) + aPhase;
  float wave = sin(ph - fly * 6.0) + 0.45 * sin(ph * 1.7 - fly * 11.0 + 1.3);
  p.z += wave * (0.10 + 0.10 * w) * fly;
  // a calm lets the fly sag; a breeze lifts it out
  float sag = (1.0 - smoothstep(0.1, 0.65, w)) * 0.22;
  p.y -= sag * fly * fly;
  p.x *= 1.0 - sag * 0.3 * fly;
  vShade = 0.84 + 0.16 * cos(ph - fly * 6.0);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uCrests;
uniform vec3 uLight;
uniform float uGlow;
varying vec2 vUv;
varying float vShade;
void main() {
  vec4 t = texture2D(uCrests, vUv);
  vec3 c = t.rgb * (uLight * vShade + uGlow);
  gl_FragColor = vec4(c, 1.0);
}`;

export interface FlagSite {
  x: number; y: number; z: number; rect: [number, number, number, number]; phase: number;
  /** Flag size and topmast height multiplier (the dominant harbour flies a larger flag on a taller pole). */
  scale?: number;
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
  /** 1 close in … ~1.6 at the overview (set by the owner from the camera distance). */
  farScale = 1;

  /** fly: flag length (m); aspect h/w; topmast (m) raised above the office pole. */
  constructor(crests: THREE.Texture, private readonly fly = 11, private readonly aspect = 0.664, readonly topmast = 9, max = 16) {
    const g = new THREE.PlaneGeometry(1, 1, 12, 3);
    g.translate(0.5, -0.5, 0);
    this.rect = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.phase = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    g.setAttribute("aRect", this.rect);
    g.setAttribute("aPhase", this.phase);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      uniforms: { uCrests: { value: crests }, uFlagT: { value: 0 }, uWind: { value: 0.35 }, uLight: { value: new THREE.Color(1, 1, 1) }, uGlow: { value: 0 } },
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
    this.rect.setXYZW(i, ...site.rect);
    this.phase.setX(i, site.phase);
    this.rect.needsUpdate = this.phase.needsUpdate = true;
    this.m.compose(this.p.set(site.x, site.y - 0.4, site.z), this.q.identity(), this.s.set(1, this.topmast * (site.scale ?? 1) + 0.4, 1));
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
      this.m.compose(this.p.set(f.x, f.y + this.topmast * (f.scale ?? 1), f.z), this.q.setFromEuler(this.e), this.s.set(L * (f.scale ?? 1), L * this.aspect * (f.scale ?? 1), L * 0.6));
      this.flags.setMatrixAt(i, this.m);
    }
    this.flags.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.flags.geometry.dispose(); this.mat.dispose();
    this.masts.geometry.dispose(); (this.masts.material as THREE.Material).dispose();
  }
}
