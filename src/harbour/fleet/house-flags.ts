import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";

/**
 * House flags: a coin's emblem flown at the masthead of the bigger hulls lying at a berth or a
 * mooring, so the largest coins are named even with their sails furled. One instanced draw; each flag
 * is a cloth square with the emblem (atlas slot) on both faces, streaming downwind, turned a little
 * toward the viewer so it reads, and lit with the scene (dim at night).
 */
const VERT = /* glsl */ `
attribute float aSlot;
attribute float aPhase;
uniform float uTime;
uniform float uWind;
varying vec2 vUv;
varying float vSlot;
varying float vShade;
void main() {
  vUv = uv;
  vSlot = aSlot;
  vec3 p = position;
  float fly = uv.x;                       // 0 at the hoist … 1 at the fly
  float ph = uTime * (5.0 + 3.0 * uWind) + aPhase;
  p.z += sin(ph + fly * 5.0) * (0.05 + 0.07 * uWind) * fly;
  p.y += sin(ph * 0.7 + fly * 3.0) * 0.02 * fly;
  vShade = 0.86 + 0.14 * cos(ph + fly * 5.0);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uEmblems;
uniform vec4 uEmblemGrid;
uniform vec3 uLight;
varying vec2 vUv;
varying float vSlot;
varying float vShade;
void main() {
  vec2 q = vec2(gl_FrontFacing ? vUv.x : 1.0 - vUv.x, vUv.y);
  vec3 cloth = vec3(0.93, 0.91, 0.86);
  vec3 c = cloth;
  if (vSlot < -2.5) {
    // distress: a red-and-white chequered signal flag
    vec2 k = floor(q * vec2(4.0, 3.0));
    c = mod(k.x + k.y, 2.0) < 0.5 ? vec3(0.62, 0.07, 0.05) : cloth;
  } else if (vSlot >= 0.0) {
    vec2 cell = vec2(mod(vSlot, uEmblemGrid.x), floor(vSlot / uEmblemGrid.x));
    vec2 inset = vec2(q.x, 1.0 - q.y) * 0.86 + 0.07;
    vec2 uv = vec2((cell.x + inset.x) * uEmblemGrid.z, 1.0 - (cell.y + inset.y) * uEmblemGrid.w);
    vec4 t = texture2D(uEmblems, uv);       // premultiplied
    c = cloth * (1.0 - t.a) + t.rgb;
  }
  // hem and a thin dark edge so the square reads against sky and water
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  c *= mix(0.55, 1.0, smoothstep(0.0, 0.035, e));
  gl_FragColor = vec4(c * uLight * vShade, 1.0);
}`;

export class HouseFlags {
  readonly mesh: THREE.InstancedMesh;
  private readonly slotAttr: THREE.InstancedBufferAttribute;
  private readonly phaseAttr: THREE.InstancedBufferAttribute;
  private readonly mat: THREE.ShaderMaterial;
  private n = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  constructor(u: WorldUniforms, emblems: THREE.Texture, grid: THREE.Vector4, max = 256) {
    // a unit flag in its own xy plane, hoist on the local origin, flying along +x
    const g = new THREE.PlaneGeometry(1, 0.72, 8, 2);
    g.translate(0.5, -0.36, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: u.uTime, uWind: { value: 0.35 }, uEmblems: { value: emblems }, uEmblemGrid: { value: grid }, uLight: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, max);
    this.mesh.name = "harbour-house-flags";
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.slotAttr = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.phaseAttr = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aSlot", this.slotAttr);
    g.setAttribute("aPhase", this.phaseAttr);
  }

  begin(): void { this.n = 0; }

  /**
   * A flag hoisted at (x,y,z), `size` m on the fly, streaming toward `downwind` (heading convention:
   * along (sin, cos)), turned up to `face` radians toward `toCam` (heading of the camera from the flag).
   */
  add(x: number, y: number, z: number, size: number, downwind: number, toCam: number, slot: number, phase: number): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    // the flag's +x is its fly: yaw it so the fly points downwind, then ease the face toward the viewer
    let yaw = downwind - Math.PI / 2;
    const side = Math.sin(toCam - downwind); // viewer off the flag's side (>0: one face, <0: the other)
    yaw += 0.35 * Math.sign(side) * (1 - Math.abs(side));
    this.e.set(0, yaw, 0, "YXZ");
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(size, size, size));
    this.mesh.setMatrixAt(this.n, this.m);
    this.slotAttr.setX(this.n, slot);
    this.phaseAttr.setX(this.n, phase);
    this.n++;
  }

  end(light: THREE.Color, wind: number): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (!this.n) return;
    this.mesh.instanceMatrix.clearUpdateRanges(); this.mesh.instanceMatrix.addUpdateRange(0, this.n * 16); this.mesh.instanceMatrix.needsUpdate = true;
    for (const a of [this.slotAttr, this.phaseAttr]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n); a.needsUpdate = true; }
    (this.mat.uniforms.uLight.value as THREE.Color).copy(light);
    this.mat.uniforms.uWind.value = wind;
  }

  dispose(): void { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
