import * as THREE from "three";
import { Pass } from "postprocessing";
import { patch } from "../engine/shader-patch";
import { OCEAN_FRAG } from "./ocean-material";

/**
 * E35 the harbour mirror (High only; O3-I1's temporal design). The camera pitch is fixed, so an object always stands
 * above its reflection on screen: a screen-space reflection. This pass runs right after the RenderPass (composer index 1,
 * ahead of the stale fog, so fog stays stale-only and reads over the mirror) at HALF the CSS resolution: the drawing
 * buffer (DPR, the B25 backing clamp, supersampling) never multiplies it. On water pixels (the ocean's alpha .05–.5,
 * every other surface 1) it marches frame N's depth up the screen (14 steps + 4 refinements, with thickness, miss and
 * edge fades) about the mean water plane and keeps the hit's colour and confidence. There is no composite pass: in frame
 * N+1 the ocean reads this target reprojected through the view-projection it was written with, and mixes it by the
 * calm-harbour weight × (1 − foam) × ripple × (1 − rain) with a sea-clock wobble (vertical strokes). The scrub restores
 * alpha 1 before anything blurs. The pass owns one target, created on entering High and disposed on leaving it.
 */
export const MIRROR_PASS_NAME = "MirrorPass";
/** The painterly strength in the calm harbour (V14: 25–35 %, set by A/B; physics gives 6–8 % at the hero pitch). */
export const MIRROR_STRENGTH = 0.3;
/** Sea-clock wobble: uv per unit of the smoothed surface slope, mostly along the view (vertical strokes). */
export const MIRROR_WOBBLE = 0.05;
/** The longest reflected ray (m): the Pharos lantern from the water before it at the hero pitch. */
export const MIRROR_RAY = 240;
/** A tier switch eases the mirror in or out over this long (s), never a pop; Low (another ocean program) cuts at once. */
export const MIRROR_FADE = 0.6;

/** The mirror target: half the CSS size (never the drawing buffer). */
export function mirrorTargetSize(cssWidth: number, cssHeight: number): { width: number; height: number } {
  return { width: Math.max(1, Math.ceil(cssWidth / 2)), height: Math.max(1, Math.ceil(cssHeight / 2)) };
}

export const MIRROR_VERT = "varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }";

export const MIRROR_FRAG = /* glsl */ `
uniform sampler2D inputBuffer;
uniform highp sampler2D depthBuffer;
uniform mat4 uProj, uInvProj;
uniform vec3 uUp;        // the mean water plane's normal (world up) in view space
uniform vec3 uRay;       // near, far, longest ray (m)
varying vec2 vUv;
float hbViewZ(float d) { return (uRay.x * uRay.y) / ((uRay.y - uRay.x) * d - uRay.y); }
vec3 hbViewPos(vec2 uv, float d) { vec4 p = uInvProj * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
vec2 hbToUv(vec3 q) { vec4 c = uProj * vec4(q, 1.0); return c.xy / c.w * 0.5 + 0.5; }
// how far the ray has passed behind the surface at q (view metres; > 0 behind)
float hbBehind(vec3 q, out vec2 uv) { uv = hbToUv(q); return hbViewZ(textureLod(depthBuffer, uv, 0.0).r) - q.z; }
void main() {
  vec4 c0 = textureLod(inputBuffer, vUv, 0.0);
  // the ocean's mask: alpha .05 + .45 × its potential weight; 1 on every other surface (transparent overlays raise it)
  float w0 = (c0.a - 0.05) / 0.45;
  if (c0.a > 0.52 || w0 < 0.02) { gl_FragColor = vec4(0.0); return; }
  vec3 P = hbViewPos(vUv, textureLod(depthBuffer, vUv, 0.0).r);
  vec3 R = reflect(normalize(P), uUp);
  // a ray turning back toward the camera leaves the picture
  float facing = 1.0 - smoothstep(-0.15, 0.2, R.z);
  if (facing <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float lastT = 0.0, hitT = -1.0, thick = 1.5;
  vec2 uv;
  for (int i = 0; i < 14; i++) {
    float s = (float(i) + 1.0) / 14.0;
    float t = uRay.z * s * s;
    vec3 q = P + R * t;
    if (q.z > -uRay.x) break;
    float dz = hbBehind(q, uv);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    // the surface must be thicker than one step's travel, or the ray skips it
    thick = max(1.5, (t - lastT) * 1.25);
    if (dz > 0.0 && dz < thick) { hitT = t; break; }
    lastT = t;
  }
  if (hitT < 0.0) { gl_FragColor = vec4(0.0); return; }
  float a = lastT, b = hitT;
  for (int i = 0; i < 4; i++) {
    float m = 0.5 * (a + b);
    if (hbBehind(P + R * m, uv) > 0.0) b = m; else a = m;
  }
  float dz = hbBehind(P + R * b, uv);
  vec4 hit = textureLod(inputBuffer, uv, 0.0);
  // only opaque, non-water surfaces mirror: water (alpha <= .5) and transparent edges are rejected
  float solid = smoothstep(0.9, 0.99, hit.a);
  float edge = smoothstep(0.0, 0.05, uv.x) * smoothstep(0.0, 0.05, 1.0 - uv.x) * smoothstep(0.0, 0.12, 1.0 - uv.y) * smoothstep(0.0, 0.02, uv.y);
  float conf = solid * edge * facing * (1.0 - smoothstep(0.5, 1.0, dz / thick)) * (1.0 - smoothstep(0.6, 1.0, b / uRay.z));
  bool ok = hit.r >= 0.0 && hit.r <= 65000.0 && hit.g >= 0.0 && hit.g <= 65000.0 && hit.b >= 0.0 && hit.b <= 65000.0 && conf >= 0.0 && conf <= 1.0;
  gl_FragColor = ok ? vec4(min(hit.rgb, vec3(32.0)), conf) : vec4(0.0);
}`;

/** The ocean's half of the mirror, through patch(): uniforms, last frame's reflection mixed in, the water mask written. */
export const OCEAN_FRAG_MIRROR = patch(patch(patch(patch(OCEAN_FRAG,
  "uniform float uSceneRadius;\n",
  "uniform float uSceneRadius;\nuniform sampler2D uMirrorTex;\nuniform mat4 uMirrorVP;\nuniform vec4 uMirror;   // E35: x strength (0 until a reflection exists), y wobble, z mask on, w stroke (uv)\n",
  { id: "ocean.mirror.uniforms" }),
"  col *= mix(1.0, cShade, 0.55);\n",
`  col *= mix(1.0, cShade, 0.55);
  // E35 the harbour mirror: last frame's reflection (mirror-pass.ts) reprojected through the view-projection it was
  // written with; the calm harbour mirrors best, foam, ripples and rain break it, the sea clock wobbles it into strokes
  float mirrorW = mix(0.6, 1.0, zm.b) * (1.0 - foam) * (1.0 - smoothstep(0.05, 0.22, dk)) * (1.0 - uPrecip.x);
  float mirrorCov = 0.0;
  if (uMirror.x > 0.0 && mirrorW > 0.0) {
    vec4 mc = uMirrorVP * vec4(vWorld, 1.0);
    vec2 away = -toCam.xz / max(camD, 1.0);
    // the smoothed sky-mirror normal (swell + a little ripple): long, soft strokes, not a mosaic
    vec2 slope = Nr.xz / max(Nr.y, 0.5);
    vec2 muv = mc.xy / mc.w * 0.5 + 0.5 + vec2(dot(slope, vec2(-away.y, away.x)) * 0.35, dot(slope, away)) * uMirror.y;
    vec4 m = 0.5 * (textureLod(uMirrorTex, muv, 0.0) + textureLod(uMirrorTex, muv + vec2(0.0, uMirror.w), 0.0));
    mirrorCov = clamp(m.a, 0.0, 1.0) * step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0) * mirrorW;
    col = mix(col, m.rgb, uMirror.x * mirrorCov);
  }
`, { id: "ocean.mirror.mix" }),
"  col += glint * overcast * (1.0 - foam) * cShade;\n",
"  col += glint * overcast * (1.0 - foam) * cShade * (1.0 - 0.85 * mirrorCov);\n",
{ id: "ocean.mirror.glint" }),
"  gl_FragColor = vec4(col, 1.0);\n",
"  gl_FragColor = vec4(col, uMirror.z > 0.5 ? 0.05 + 0.45 * clamp(mirrorW * (1.0 - hz), 0.0, 1.0) : 1.0);\n",
{ id: "ocean.mirror.mask" });

export interface MirrorUniforms {
  uMirrorTex: THREE.IUniform<THREE.Texture | null>;
  uMirrorVP: THREE.IUniform<THREE.Matrix4>;
  uMirror: THREE.IUniform<THREE.Vector4>;
}

const cssSize = new THREE.Vector2();

/** The SSR pass; it never swaps the composer's buffers (the frame passes through it untouched). */
export class MirrorPass extends Pass {
  /** Shared with the ocean material. */
  readonly uniforms: MirrorUniforms = { uMirrorTex: { value: null }, uMirrorVP: { value: new THREE.Matrix4() }, uMirror: { value: new THREE.Vector4() } };
  strength = MIRROR_STRENGTH;
  private readonly material: THREE.ShaderMaterial;
  private target: THREE.WebGLRenderTarget | null = null;
  private active = false;
  /** 0..1 eased toward `active` (MIRROR_FADE); the target lives until it reaches 0. */
  private shown = 0;

  constructor(private readonly view: THREE.PerspectiveCamera) {
    super(MIRROR_PASS_NAME);
    this.needsSwap = false;
    this.needsDepthTexture = true;
    this.enabled = false;
    this.material = new THREE.ShaderMaterial({
      name: "hb_post_mirror",
      uniforms: {
        inputBuffer: { value: null }, depthBuffer: { value: null },
        uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() },
        uUp: { value: new THREE.Vector3(0, 1, 0) }, uRay: { value: new THREE.Vector3(5, 9000, MIRROR_RAY) },
      },
      vertexShader: MIRROR_VERT, fragmentShader: MIRROR_FRAG,
      blending: THREE.NoBlending, depthWrite: false, depthTest: false, toneMapped: false,
    });
    this.fullscreenMaterial = this.material;
  }

  /** The current target (null outside High). */
  get texture(): THREE.Texture | null { return this.target?.texture ?? null; }

  override setDepthTexture(depthTexture: THREE.Texture | null): void { this.material.uniforms.depthBuffer.value = depthTexture; }

  /** The composer passes drawing-buffer pixels; the mirror sizes itself from the CSS size instead. */
  override setSize(_width?: number, _height?: number): void {
    if (!this.target || !this.renderer) return;
    this.renderer.getSize(cssSize);
    const { width, height } = mirrorTargetSize(cssSize.x, cssSize.y);
    if (this.target.width === width && this.target.height === height) return;
    this.target.setSize(width, height);
    this.uniforms.uMirror.value.x = 0;   // the old reflection no longer matches the target
    this.uniforms.uMirror.value.w = 1.5 / height;
  }

  /**
   * High entry creates the target (the ocean writes its mask from the next frame) and fades the mirror in; leaving High
   * fades it out first and disposes the target at zero. `immediate` (Low: the lite ocean has no mirror) cuts at once.
   */
  setActive(active: boolean, immediate = false): void {
    if (active === this.active && !(immediate && this.target && !active)) return;
    this.active = active;
    if (!active) { if (immediate) this.release(); return; }
    this.enabled = true;
    if (this.target) return;   // back before the fade-out ended: it eases in again from where it is
    const u = this.uniforms;
    u.uMirror.value.set(0, MIRROR_WOBBLE, 1, 0);
    if (this.renderer) this.renderer.getSize(cssSize); else cssSize.set(1, 1);
    const { width, height } = mirrorTargetSize(cssSize.x, cssSize.y);
    this.target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    this.target.texture.name = "Mirror.Target";
    u.uMirror.value.w = 1.5 / height;
    u.uMirrorTex.value = this.target.texture;
  }

  private release(): void {
    this.enabled = false;
    this.shown = 0;
    this.target?.dispose();
    this.target = null;
    const u = this.uniforms;
    u.uMirror.value.set(0, MIRROR_WOBBLE, 0, 0);
    u.uMirrorTex.value = null;
  }

  override render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, _outputBuffer?: THREE.WebGLRenderTarget | null, deltaTime = 1 / 60): void {
    if (!this.target) return;
    const step = Math.min(Math.max(deltaTime, 0), 0.25) / MIRROR_FADE;
    this.shown = this.active ? Math.min(1, this.shown + step) : Math.max(0, this.shown - step);
    if (!this.active && this.shown <= 0) { this.release(); return; }
    const u = this.material.uniforms, cam = this.view;
    u.inputBuffer.value = inputBuffer.texture;
    u.uProj.value.copy(cam.projectionMatrix);
    u.uInvProj.value.copy(cam.projectionMatrixInverse);
    (u.uUp.value as THREE.Vector3).set(0, 1, 0).transformDirection(cam.matrixWorldInverse);
    (u.uRay.value as THREE.Vector3).set(cam.near, cam.far, MIRROR_RAY);
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, this.camera);
    } finally { renderer.setRenderTarget(previous); }
    // the ocean's next frame reads this reflection through the view-projection it was written with
    this.uniforms.uMirrorVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.uniforms.uMirror.value.x = this.strength * this.shown * this.shown * (3 - 2 * this.shown);
  }

  /** Pass.dispose releases the material; the target goes first. */
  override dispose(): void {
    this.active = false;
    this.release();
    super.dispose();
  }
}
