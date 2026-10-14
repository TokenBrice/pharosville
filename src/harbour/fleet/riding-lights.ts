import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";

/**
 * The fleet's own night lights, one Points draw: a small soft lamp per lit hull plus a short,
 * wave-broken reflection streak on the water under it. Hulls under way carry masthead, side
 * (red/green) and stern lights; anchored and moored hulls a dim oil anchor light (only some of
 * them, chosen by the caller). No light pools and no long pillars: those belong to the quay lamps.
 *
 * Per point: world position, colour (linear, pre-scaled), size (m), kind (0 lamp, 1 streak) and the
 * water height under it (streak anchor).
 */
const VERT = /* glsl */ `
attribute vec3 aColor;
attribute vec3 aInfo;   // size (m), kind (0 lamp | 1 streak), water y
uniform vec2 uResolution;
uniform float uGlow;
uniform float uSea;     // 0 calm … 1 rough: streak length and break-up
varying vec3 vColor;
varying float vKind;
varying float vAspect;
varying float vSeed;
void main() {
  vKind = aInfo.y;
  vSeed = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 p = position;
  float sizeM = aInfo.x;
  if (vKind > 0.5) {
    // the streak hangs below the lamp's mirror image on the water: anchor at the water under it
    p.y = aInfo.z;
  }
  vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float pxPerM = projectionMatrix[1][1] * 0.5 * uResolution.y / max(c.w, 1e-3);
  float px = sizeM * pxPerM;
  if (vKind > 0.5) {
    // length ∝ the lamp's height over the water, ~40% of a quay lamp's pillar, longer in a swell
    float h = max(0.5, position.y - aInfo.z);
    float len = clamp(h * pxPerM * (0.55 + 0.5 * uSea), 4.0, 90.0);
    px = len;
    c.y -= len * 0.5 / (0.5 * uResolution.y) * c.w; // centre the sprite half its length below the anchor
    vAspect = clamp(sizeM * pxPerM * 1.6 / len, 0.04, 0.6);
  } else {
    // a lamp never shrinks below a couple of pixels: the fleet still glimmers from the overview
    px = clamp(px, sizeM >= 0.3 ? 3.4 : 2.0, 24.0);
    vAspect = 1.0;
  }
  gl_PointSize = px;
  gl_Position = c;
  vColor = aColor * uGlow;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uSea;
varying vec3 vColor;
varying float vKind;
varying float vAspect;
varying float vSeed;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a;
  if (vKind < 0.5) {
    float r = length(q);
    a = exp(-r * r * 5.0) + 0.35 * exp(-r * r * 1.4);
  } else {
    // narrow, fading downward, broken into wavering dashes by the ripples
    float x = q.x / vAspect;
    float y = q.y * 0.5 + 0.5;                 // 0 top (at the hull) … 1 bottom
    float w = exp(-x * x * 2.2);
    float fall = (1.0 - y) * (1.0 - y);
    float dash = 0.55 + 0.45 * sin(y * (18.0 + 10.0 * uSea) - uTime * (2.2 + vSeed) + vSeed * 6.28);
    dash *= 0.7 + 0.3 * sin(y * 7.0 + uTime * 1.3 + vSeed * 3.0);
    float wob = sin(y * 23.0 + uTime * 3.1 + vSeed * 9.0) * 0.18 * y;
    w = exp(-(x - wob / vAspect * 0.2) * (x - wob / vAspect * 0.2) * 2.2);
    a = w * fall * max(0.0, dash) * 0.75;
  }
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * a, 1.0);
}`;

export class RidingLights {
  readonly object: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly info: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private n = 0;
  readonly max: number;

  constructor(u: WorldUniforms, max = 1600) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.info = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aInfo", new THREE.BufferAttribute(this.info, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uResolution: u.uResolution, uTime: u.uTime, uGlow: { value: 0 }, uSea: { value: 0.3 } },
      vertexShader: VERT, fragmentShader: FRAG,
      // additive colour, alpha untouched (later passes read the frame's alpha)
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.object = new THREE.Points(g, this.mat);
    this.object.name = "harbour-riding-lights";
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
  }

  begin(): void { this.n = 0; }

  /** A lamp (and its streak when `streak`) at (x,y,z) over water at height wy. */
  add(x: number, y: number, z: number, r: number, g: number, b: number, size: number, wy: number, streak: number): void {
    if (this.n + 2 > this.max) return;
    let k = this.n * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.info[k] = size; this.info[k + 1] = 0; this.info[k + 2] = wy;
    this.n++;
    if (streak <= 0) return;
    k = this.n * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.col[k] = r * streak; this.col[k + 1] = g * streak; this.col[k + 2] = b * streak;
    this.info[k] = size; this.info[k + 1] = 1; this.info[k + 2] = wy;
    this.n++;
  }

  end(glow: number, sea: number): void {
    this.mat.uniforms.uGlow.value = glow;
    this.mat.uniforms.uSea.value = sea;
    this.object.visible = glow > 0.002 && this.n > 0;
    this.geo.setDrawRange(0, this.n);
    for (const name of ["position", "aColor", "aInfo"]) {
      const at = this.geo.getAttribute(name) as THREE.BufferAttribute;
      at.clearUpdateRanges(); at.addUpdateRange(0, this.n * 3); at.needsUpdate = true;
    }
  }

  get count(): number { return this.n; }

  dispose(): void { this.geo.dispose(); this.mat.dispose(); }
}
