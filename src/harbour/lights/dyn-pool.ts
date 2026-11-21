import * as THREE from "three";
import type { DynPoolService } from "../engine/services";
import type { Bounds4 } from "../ocean/sea-sdf";

/**
 * High-only dynamic per-frame boat-to-water night light pools (`dynPool` service, §6.3.2, seams S-2 / S-3, D-7).
 *
 * Owns a dedicated 512×512 RGBA16F render target over the exact world-XZ bounds as `uWakeBounds`
 * (`[minX, minZ, maxX, maxZ]`). Allocated strictly on High and disposed immediately on leaving High or dispose().
 * Renders 1 instanced additive quad draw ONLY when `active && windowGlow > 0.02 && count > 0`; otherwise binds no
 * RT (zero GPU cost by day or on Medium/Low). Pushed lights are cleared every frame after render().
 */
export const DYN_POOL_RES = 512;
const MAX_DYN_LIGHTS = 1024;

export const DYN_POOL_VERT = /* glsl */ `
uniform vec4 uBounds; // minX, minZ, maxX, maxZ (matches uWakeBounds)
attribute vec4 iPosR; // x, z, y, radius
attribute vec3 iCol;  // r, g, b
varying vec2 vQ;
varying vec3 vC;
varying float vH;
varying float vR;
void main() {
  float R = iPosR.w;
  vR = R;
  vH = max(iPosR.z, 0.5);
  vQ = position.xy * 2.0 * R;
  vC = iCol;
  vec2 w = iPosR.xy + vQ;
  vec2 uv = (w - uBounds.xy) / (uBounds.zw - uBounds.xy);
  gl_Position = R > 0.0 ? vec4(uv * 2.0 - 1.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

export const DYN_POOL_FRAG = /* glsl */ `
varying vec2 vQ;
varying vec3 vC;
varying float vH;
varying float vR;
void main() {
  float r2 = dot(vQ, vQ);
  float r = sqrt(r2);
  if (r >= vR) discard;
  float h2 = max(vH * vH, 1.0);
  float f = pow(h2 / (r2 + h2), 1.25) * (1.0 - smoothstep(0.45 * vR, vR, r));
  gl_FragColor = vec4(vC * f, vH);
}
`;

export interface DynPoolRenderResult {
  texture: THREE.Texture | null;
  intensity: number;
}

export class DynPool implements DynPoolService {
  readonly bounds: Bounds4;
  private rt: THREE.WebGLRenderTarget | null = null;
  private active = false;
  private count = 0;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mat: THREE.ShaderMaterial;
  private readonly attrPosR: THREE.InstancedBufferAttribute;
  private readonly attrCol: THREE.InstancedBufferAttribute;
  private readonly bufPosR: Float32Array;
  private readonly bufCol: Float32Array;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  private readonly clearColor = new THREE.Color();

  constructor(bounds: Bounds4, private readonly res = DYN_POOL_RES) {
    this.bounds = bounds;
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.bufPosR = new Float32Array(MAX_DYN_LIGHTS * 4);
    this.bufCol = new Float32Array(MAX_DYN_LIGHTS * 3);
    this.attrPosR = new THREE.InstancedBufferAttribute(this.bufPosR, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrCol = new THREE.InstancedBufferAttribute(this.bufCol, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("iPosR", this.attrPosR);
    this.geo.setAttribute("iCol", this.attrCol);
    this.geo.instanceCount = 0;

    this.mat = new THREE.ShaderMaterial({
      name: "hb_dyn_pool",
      vertexShader: DYN_POOL_VERT,
      fragmentShader: DYN_POOL_FRAG,
      uniforms: { uBounds: { value: new THREE.Vector4(...bounds) } },
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.MaxEquation,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  get enabled(): boolean { return this.active; }
  get texture(): THREE.Texture | null { return this.rt?.texture ?? null; }
  get target(): THREE.WebGLRenderTarget | null { return this.rt; }
  get pendingCount(): number { return this.count; }

  /** High-only gate (D-7): allocates 512×512 RGBA16F RT on High, disposes immediately on Medium/Low. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.count = 0;
    if (active) {
      if (!this.rt) {
        this.rt = new THREE.WebGLRenderTarget(this.res, this.res, {
          type: THREE.HalfFloatType,
          format: THREE.RGBAFormat,
          depthBuffer: false,
          stencilBuffer: false,
          generateMipmaps: false,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          wrapS: THREE.ClampToEdgeWrapping,
          wrapT: THREE.ClampToEdgeWrapping,
        });
        this.rt.texture.name = "DynPool.Target";
      }
    } else if (this.rt) {
      this.rt.dispose();
      this.rt = null;
    }
  }

  light(x: number, z: number, y: number, radius: number, r: number, g: number, b: number): void {
    if (!this.active || this.count >= MAX_DYN_LIGHTS || radius <= 0 || (r <= 0 && g <= 0 && b <= 0)) return;
    const i = this.count++;
    const o4 = i * 4;
    const o3 = i * 3;
    this.bufPosR[o4] = x;
    this.bufPosR[o4 + 1] = z;
    this.bufPosR[o4 + 2] = y;
    this.bufPosR[o4 + 3] = radius;
    this.bufCol[o3] = r;
    this.bufCol[o3 + 1] = g;
    this.bufCol[o3 + 2] = b;
  }

  /**
   * Render all pushed boat/Titan light pools into the 512×512 RGBA16F RT ONLY when
   * `active && windowGlow > 0.02 && count > 0`, then clear pushed lights for the next frame.
   */
  render(renderer: THREE.WebGLRenderer, windowGlow: number): DynPoolRenderResult {
    const n = this.count;
    this.count = 0;
    if (!this.active || !this.rt || windowGlow <= 0.02 || n === 0) {
      this.geo.instanceCount = 0;
      return { texture: null, intensity: 0 };
    }
    this.geo.instanceCount = n;
    this.attrPosR.clearUpdateRanges(); this.attrPosR.addUpdateRange(0, n * 4); this.attrPosR.needsUpdate = true;
    this.attrCol.clearUpdateRanges(); this.attrCol.addUpdateRange(0, n * 3); this.attrCol.needsUpdate = true;

    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    const prevClear = renderer.getClearColor(this.clearColor);
    const prevAlpha = renderer.getClearAlpha();
    try {
      renderer.autoClear = false;
      renderer.setRenderTarget(this.rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(this.scene, this.cam);
    } finally {
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.autoClear = prevAuto;
      renderer.setRenderTarget(prevTarget);
    }
    return { texture: this.rt.texture, intensity: 1 };
  }

  dispose(): void {
    this.setActive(false);
    this.geo.dispose();
    this.mat.dispose();
  }
}
