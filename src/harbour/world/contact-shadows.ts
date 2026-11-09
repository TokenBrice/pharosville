import * as THREE from "three";
import { AERIAL_VERT_GLSL, aerialUniforms } from "./aerial";
import type { WorldUniforms } from "../engine/uniforms";

/**
 * E05 contact quads: ONE instanced draw (two triangles per caster) of soft sun-shadow footprints for the casters the
 * shadow registry hands over (world/shadow-casters.ts): afloat hulls past FADE_FROM× the fleet's shadow limit and
 * figures past FADE_FROM× FIGURE_SHADOW_DIST (their foot blobs). Each is the caster's footprint swept along its own
 * sun shadow (offset −sun.xz / sun.y × its height): a hull's body from the waterline to its deck, a figure from its
 * feet to its head, thinning toward the far tip. It is multiplied onto what is already drawn (no depth write), first
 * among the transparents, its vertices pulled toward the camera along their own view rays (the same pixels; the
 * depth clears wave crests and a slope, while a hull or a wall in front still hides it).
 *  - hulls on water darken as the sea wears a shadow (ocean/sea-golden.ts: the body ~12 %, less for a sun on the
 *    horizon and under the moon); Low, whose sea wears no sun shadow (B06), draws no hull quads;
 *  - figures on land darken by the key light's share of a flat surface's light (key vs sky and fill).
 * Strength follows the handover share (0 … 1) and fades with the aerial tint (it darkens the surface, not the air).
 * Decorative: time of day and zoom only.
 */

export const CONTACT_VERT = /* glsl */ `
attribute vec4 iA;   // x, surface y, z, heading (bow along (sin h, cos h))
attribute vec4 iB;   // half length, half width, height (m), share: > 0 a hull on water, < 0 a figure on land
uniform vec3 uSunDir;
uniform vec2 uK;     // darkening at full share: x hulls on water, y figures on land
uniform vec2 uReach; // the longest shadow, in footprint half lengths: x hulls, y figures
uniform vec2 uPull;  // depth pull toward the camera (m): x hulls, y figures
varying vec2 vN;
varying vec2 vO;
varying float vK;
${AERIAL_VERT_GLSL}
void main() {
  bool hull = iB.w > 0.0;
  vec2 fwd = vec2(sin(iA.w), cos(iA.w)), side = vec2(fwd.y, -fwd.x);
  vec2 o = -uSunDir.xz / max(uSunDir.y, 0.12) * iB.z;
  vec2 on = vec2(dot(o, fwd), dot(o, side)) / iB.xy;
  float reach = hull ? uReach.x : uReach.y, len = length(on);
  if (len > reach) on *= reach / len;
  vec2 n = mix(min(on, vec2(0.0)) - 1.0, max(on, vec2(0.0)) + 1.0, position.xy * 0.5 + 0.5);
  vec2 xz = iA.xz + fwd * (n.x * iB.x) + side * (n.y * iB.y);
  vec3 wp = vec3(xz.x, iA.y, xz.y);
  vN = n; vO = on;
  hbAerialVert(wp);
  vK = abs(iB.w) * (hull ? uK.x : uK.y) * (1.0 - vHbAerial);
  vec3 toCam = cameraPosition - wp;
  wp += toCam * ((hull ? uPull.x : uPull.y) / max(length(toCam), 1.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

export const CONTACT_FRAG = /* glsl */ `
varying vec2 vN;
varying vec2 vO;
varying float vK;
void main() {
  // distance to the footprint swept along its shadow (unit circles from the base, t = 0, to the tip, t = 1)
  float t = clamp(dot(vN, vO) / max(dot(vO, vO), 1e-4), 0.0, 1.0);
  float d = length(vN - vO * t);
  float a = (1.0 - smoothstep(0.35, 1.0, d)) * (1.0 - 0.45 * t * t);
  gl_FragColor = vec4(vec3(1.0 - vK * a), 1.0);
}`;

/** Water darkening of a hull's sun shadow at full share, by day (ocean/sea-golden.ts body + lost glitter). */
export const HULL_DARK = 0.13;
/** A small figure's shadow is mostly penumbra: its core keeps this share of a full key-light shadow. */
export const FIGURE_DARK = 0.85;

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Darkening at full share (x hulls on water, y figures on land) for the hour's light (world uniforms). */
export function contactDarkness(u: WorldUniforms, shadowIntensity: number, hulls: boolean, out: THREE.Vector2): THREE.Vector2 {
  const night = u.uNight.value, sun = u.uSunDir.value;
  // the sea's own shadow law (sea-golden.ts): weaker for a sun on the horizon, half under the moon
  const horizon = 0.55 + 0.45 * THREE.MathUtils.smoothstep(sun.y + night, 0, 0.12);
  const water = hulls ? horizon * THREE.MathUtils.lerp(HULL_DARK, HULL_DARK * 0.5, night) * shadowIntensity : 0;
  // a flat surface: the key light's share of what lights it (three: directional colour × n·l; hemisphere × π·0.85)
  const key = lum(u.uSunColor.value) * Math.max(sun.y, 0);
  const rest = lum(u.uHemiSky.value) * Math.PI * 0.85 + lum(u.uFillColor.value) * Math.max(u.uFillDir.value.y, 0);
  const land = key + rest > 1e-6 ? FIGURE_DARK * shadowIntensity * key / (key + rest) : 0;
  return out.set(water, land);
}

interface Crowd { readonly mesh: THREE.InstancedMesh; readonly height: number }

export class ContactShadows {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly geometry = new THREE.InstancedBufferGeometry();
  private a!: THREE.InstancedBufferAttribute;
  private b!: THREE.InstancedBufferAttribute;
  private capacity = 0;
  private count = 0;
  private hullsOn = true;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();

  /** Created with the sun rig (before boot preparation compiles its program); the hour's light is copied in at end(). */
  constructor() {
    const g = this.geometry;
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.grow(512);
    const material = new THREE.ShaderMaterial({
      name: "hb_contact_shadows", vertexShader: CONTACT_VERT, fragmentShader: CONTACT_FRAG,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uK: { value: new THREE.Vector2() }, uReach: { value: new THREE.Vector2(4, 9) },
        uPull: { value: new THREE.Vector2(1.2, 0.35) },
        uAerial: aerialUniforms.uAerial, uAerialCap: aerialUniforms.uAerialCap, uAerialDensity: { value: 0 },
      },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.name = "shadow-contacts";
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = -1;
    this.mesh.visible = false;
    this.mesh.raycast = () => {};
  }

  private grow(capacity: number): void {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const b = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    if (this.a) { a.array.set(this.a.array); b.array.set(this.b.array); }
    this.a = a; this.b = b; this.capacity = capacity;
    this.geometry.setAttribute("iA", a);
    this.geometry.setAttribute("iB", b);
  }

  private push(x: number, y: number, z: number, h: number, hl: number, hw: number, height: number, share: number): void {
    if (this.count === this.capacity) this.grow(this.capacity * 2);
    const i = this.count++ * 4, A = this.a.array as Float32Array, B = this.b.array as Float32Array;
    A[i] = x; A[i + 1] = y; A[i + 2] = z; A[i + 3] = h;
    B[i] = hl; B[i + 1] = hw; B[i + 2] = height; B[i + 3] = share;
  }

  /** Start a frame; Low (no sun shadow on its sea) takes no hulls. */
  begin(hulls: boolean): void { this.count = 0; this.hullsOn = hulls; }

  /** A hull afloat: the sea height under her, heading (bow along (sin h, cos h)), half length / beam, deck height. */
  hull(x: number, y: number, z: number, heading: number, halfLength: number, halfBeam: number, height: number, share: number): void {
    if (!this.hullsOn || share <= 0 || halfLength <= 0 || halfBeam <= 0) return;
    this.push(x, y, z, heading, halfLength, halfBeam, height, Math.min(share, 1));
  }

  /** Foot blobs for a crowd's shown instances (feet at each instance origin; height scales with the instance). */
  private crowd({ mesh, height }: Crowd, share: number, scene: THREE.Object3D): void {
    for (let o: THREE.Object3D | null = mesh; o && o !== scene; o = o.parent) if (!o.visible) return;
    const e = mesh.instanceMatrix.array as Float32Array, world = mesh.matrixWorld;
    const identity = world.equals(this.m.identity());
    const sy = identity ? 1 : world.getMaxScaleOnAxis();
    for (let i = 0, n = mesh.count; i < n; i++) {
      const o = i * 16, s = Math.hypot(e[o + 4], e[o + 5], e[o + 6]);
      if (s < 1e-3) continue;
      this.p.set(e[o + 12], e[o + 13], e[o + 14]);
      if (!identity) this.p.applyMatrix4(world);
      const r = 0.3 * s * sy;
      this.push(this.p.x, this.p.y, this.p.z, 0, r, r, height * s * sy, -Math.min(share, 1));
    }
  }

  /** After every caster pushed (before the render): add the crowds, set the hour's darkness, upload. */
  end(u: WorldUniforms, shadowIntensity: number, crowds: Iterable<Crowd>, figureShare: number, scene: THREE.Object3D): void {
    if (figureShare > 0) for (const c of crowds) this.crowd(c, figureShare, scene);
    const n = this.count, uniforms = this.mesh.material.uniforms;
    contactDarkness(u, shadowIntensity, this.hullsOn, uniforms.uK.value as THREE.Vector2);
    (uniforms.uSunDir.value as THREE.Vector3).copy(u.uSunDir.value);
    uniforms.uAerialDensity.value = u.uFogDensity.value;
    this.mesh.visible = n > 0;
    this.geometry.instanceCount = n;
    if (!n) return;
    for (const attr of [this.a, this.b]) { attr.clearUpdateRanges(); attr.addUpdateRange(0, n * 4); attr.needsUpdate = true; }
  }

  get instances(): number { return this.count; }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.mesh.material.dispose();
  }
}
