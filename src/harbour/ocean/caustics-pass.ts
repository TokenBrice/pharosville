import * as THREE from "three";
import type { PreparationEntry } from "../engine/types";
import { WAVES, wavesGLSL } from "./waves";

/**
 * High-only Evan-Wallace refracted-sun-ray caustics pass (`hb_caustics`, Phase 1 Workstream 1.5, H1 / H10 / D-7).
 *
 * Renders a 384×384 wave mesh over a frustum-target-centered 256 m × 256 m window (snapped to 2 m increments,
 * 0.25 m/texel) into a 1024×1024 R16F render target using additive ONE/ONE blending and DoubleSide rasterisation
 * so folded/inverted wave sheets accumulate focused caustic filaments instead of overwriting or backface-culling.
 *
 * Each vertex evaluates Gerstner swells (with OCEAN_VERT's exact SDF coastal damping and 470..560 m mainland fade)
 * plus 5 isotropic domain-warped dispersive wavelets (λ ≈ 6.4 / 4.9 / 3.9 / 3.2 / 2.75 m, all > 2× grid Nyquist)
 * so sheltered harbour basins project organic curved Mediterranean caustic webs without directional striping.
 * Rays refract along Snell's law (η = 0.75, guarded against grazing blow-up) onto the Y = -3.0 m reference plane,
 * and the fragment shader outputs baseline-subtracted Evan-Wallace parallelogram Jacobian compression.
 *
 * D-7 tier contract: BOTH the 1024² R16F RT AND the 384² Uint32Array grid are allocated ONLY when `setActive(true)`
 * (High tier) and disposed immediately on `setActive(false)` (restoring the 1×1 black DataTexture fallback and a
 * 1-triangle placeholder geometry before disposal) so Medium and Low pay 0 MB production VRAM/geometry. A tiny
 * 1×1 linear R16F compilation target ensures Medium→High promotion compiles the exact linear-output program off-High.
 */
export const CAUSTICS_RES = 1024;
export const CAUSTICS_MESH_N = 384;
export const CAUSTICS_HALF_EXTENT = 128; // 256 m × 256 m target-centered window
export const CAUSTICS_SNAP = 2;          // 2 m world snap
export const CAUSTICS_REF_Y = -3.0;      // reference projection plane Y (m)

const WAVES_AMP_SUM = WAVES.reduce((s, w) => s + w.amp, 0).toFixed(6);
const REF_Y_GLSL = CAUSTICS_REF_Y.toFixed(1);

export const CAUSTICS_VERT = /* glsl */ `
uniform float uTime;
uniform vec4 uSea;
uniform sampler2D uSdf;
uniform vec4 uSdfBounds;
uniform vec2 uSceneCenter;
uniform vec3 uSunDir;
uniform vec4 uCausticBounds;

varying vec3 vOldPos;
varying vec3 vNewPos;

${wavesGLSL()}

void main() {
  vec2 xz = mix(uCausticBounds.xy, uCausticBounds.zw, position.xy);

  vec2 suv = (xz - uSdfBounds.xy) / (uSdfBounds.zw - uSdfBounds.xy);
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  float coast = mix(200.0, (mix(textureLod(uSdf, clamp(suv, 0.0, 1.0), 0.0).r, 1.0, smoothstep(470.0, 560.0, length(xz - uSceneCenter))) - 0.5) * 128.0, inside);
  float damp = smoothstep(0.0, 34.0, coast) * 0.9 + 0.1 * smoothstep(-2.0, 2.0, coast);
  float amp = uSea.x * damp;

  vec3 g;
  float crest;
  gerstnerSums(xz, uTime, g, crest);
  float waveY = crest * ${WAVES_AMP_SUM} * amp;
  vec3 gN = gerstnerNormalOf(g, amp);

  float capScale = mix(0.85, 1.30, clamp(uSea.y, 0.0, 1.0)) * (0.72 + 0.28 * damp);
  vec2 wx = xz + vec2(
    sin(xz.y * 0.17 + xz.x * 0.09) * 1.35 + cos(xz.y * 0.31 - xz.x * 0.23) * 0.55,
    cos(xz.x * 0.19 - xz.y * 0.11) * 1.35 + sin(xz.x * 0.29 + xz.y * 0.21) * 0.55
  );
  vec2 capSlope = vec2(0.0);
  float capH = 0.0;
  {
    float ph = 0.981748 * dot(vec2(0.970296, 0.241922), wx) - 3.103377 * uTime;
    capSlope += vec2(0.970296, 0.241922) * (0.155 * capScale * cos(ph));
    capH += 0.065 * capScale * sin(ph);
  }
  {
    float ph = 1.282283 * dot(vec2(0.629320, 0.777146), wx) - 3.546716 * uTime + 1.1;
    capSlope += vec2(0.629320, 0.777146) * (0.150 * capScale * cos(ph));
    capH += 0.055 * capScale * sin(ph);
  }
  {
    float ph = 1.611073 * dot(vec2(-0.069756, 0.997564), wx) - 3.975504 * uTime + 2.3;
    capSlope += vec2(-0.069756, 0.997564) * (0.145 * capScale * cos(ph));
    capH += 0.045 * capScale * sin(ph);
  }
  {
    float ph = 1.963495 * dot(vec2(-0.681998, 0.731354), wx) - 4.388837 * uTime + 3.7;
    capSlope += vec2(-0.681998, 0.731354) * (0.140 * capScale * cos(ph));
    capH += 0.038 * capScale * sin(ph);
  }
  {
    float ph = 2.284795 * dot(vec2(-0.974370, 0.224951), wx) - 4.734326 * uTime + 5.1;
    capSlope += vec2(-0.974370, 0.224951) * (0.130 * capScale * cos(ph));
    capH += 0.032 * capScale * sin(ph);
  }
  waveY += capH;
  vec3 N_wave = normalize(vec3(gN.x * 0.45 - capSlope.x, max(gN.y, 0.30), gN.z * 0.45 - capSlope.y));

  float sunLen = length(uSunDir);
  vec3 sunDir = sunLen > 1e-4 ? uSunDir / sunLen : vec3(0.0, 1.0, 0.0);
  vec3 R_sun = refract(-sunDir, N_wave, 0.75);
  float rY = min(R_sun.y, -0.15);

  vOldPos = vec3(xz.x, waveY, xz.y);
  float tRef = (${REF_Y_GLSL} - waveY) / rY;
  vec2 hitXZ = xz + R_sun.xz * clamp(tRef, 0.0, 28.0);
  vNewPos = vec3(hitXZ.x, ${REF_Y_GLSL}, hitXZ.y);

  vec2 uv = (hitXZ - uCausticBounds.xy) / (uCausticBounds.zw - uCausticBounds.xy);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const CAUSTICS_FRAG = /* glsl */ `
varying vec3 vOldPos;
varying vec3 vNewPos;

void main() {
  float oldArea = length(cross(dFdx(vOldPos), dFdy(vOldPos)));
  float newArea = length(cross(dFdx(vNewPos), dFdy(vNewPos)));
  float ratio = oldArea / max(newArea, 1e-5);
  float focused = max(ratio - 0.72, 0.0);
  float intensity = clamp(focused * 0.55 + focused * focused * 0.22, 0.0, 2.5);
  gl_FragColor = vec4(intensity, 0.0, 0.0, 1.0);
}
`;

/** Target-centered 256 m × 256 m world-XZ bounds snapped to 2 m world increments (H1). */
export function causticsBoundsFor(
  targetX: number,
  targetZ: number,
  out: [number, number, number, number] = [0, 0, 0, 0],
): [number, number, number, number] {
  const cx = Math.round(targetX / CAUSTICS_SNAP) * CAUSTICS_SNAP || 0;
  const cz = Math.round(targetZ / CAUSTICS_SNAP) * CAUSTICS_SNAP || 0;
  out[0] = cx - CAUSTICS_HALF_EXTENT;
  out[1] = cz - CAUSTICS_HALF_EXTENT;
  out[2] = cx + CAUSTICS_HALF_EXTENT;
  out[3] = cz + CAUSTICS_HALF_EXTENT;
  return out;
}

export interface CausticsUniforms {
  uCausticMap: THREE.IUniform<THREE.Texture>;
  uCausticBounds: THREE.IUniform<THREE.Vector4>;
  uCausticMode: THREE.IUniform<number>; // 2 = High light-space map, 1 = Med Hessian, 0 = Low Voronoi
}

function createCausticsGrid(n: number): THREE.BufferGeometry {
  const cols = n + 1;
  const vertCount = cols * cols;
  const pos = new Float32Array(vertCount * 3);
  let p = 0;
  for (let j = 0; j <= n; j++) {
    const v = j / n;
    for (let i = 0; i <= n; i++) {
      pos[p++] = i / n;
      pos[p++] = v;
      pos[p++] = 0;
    }
  }
  const indices = new Uint32Array(n * n * 6);
  let k = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
  return geo;
}

function createPlaceholderGeo(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  return geo;
}

export class CausticsPass {
  readonly uniforms: CausticsUniforms;
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private rt: THREE.WebGLRenderTarget | null = null;
  private gridGeo: THREE.BufferGeometry | null = null;
  private readonly placeholderGeo: THREE.BufferGeometry;
  /** Tiny 1×1 linear R16F target matching production RT colorSpace for stall-free Medium→High preparation. */
  private readonly compilationTarget: THREE.WebGLRenderTarget;
  private active = false;
  private hasDayContent = false;
  private readonly fallback: THREE.DataTexture;
  private readonly material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly boundsScratch: [number, number, number, number] = [0, 0, 0, 0];
  private readonly prevClear = new THREE.Color();

  constructor(shared: {
    uTime: THREE.IUniform<number>;
    uSea: THREE.IUniform<THREE.Vector4>;
    uSdf: THREE.IUniform<THREE.Texture>;
    uSdfBounds: THREE.IUniform<THREE.Vector4>;
    uSceneCenter: THREE.IUniform<THREE.Vector2>;
    uSunDir: THREE.IUniform<THREE.Vector3>;
  }) {
    this.fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.fallback.minFilter = THREE.LinearFilter;
    this.fallback.magFilter = THREE.LinearFilter;
    this.fallback.wrapS = THREE.ClampToEdgeWrapping;
    this.fallback.wrapT = THREE.ClampToEdgeWrapping;
    this.fallback.needsUpdate = true;

    this.compilationTarget = new THREE.WebGLRenderTarget(1, 1, {
      format: THREE.RedFormat,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.compilationTarget.texture.name = "CausticsPass.Compile";

    this.uniforms = {
      uCausticMap: { value: this.fallback },
      uCausticBounds: {
        value: new THREE.Vector4(-CAUSTICS_HALF_EXTENT, -CAUSTICS_HALF_EXTENT, CAUSTICS_HALF_EXTENT, CAUSTICS_HALF_EXTENT),
      },
      uCausticMode: { value: 0 },
    };

    this.placeholderGeo = createPlaceholderGeo();
    this.material = new THREE.ShaderMaterial({
      name: "hb_caustics",
      vertexShader: CAUSTICS_VERT,
      fragmentShader: CAUSTICS_FRAG,
      uniforms: {
        ...shared,
        uCausticBounds: this.uniforms.uCausticBounds,
      },
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      fog: false,
    });

    this.mesh = new THREE.Mesh(this.placeholderGeo, this.material);
    this.mesh.name = "ocean-caustics";
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  get target(): THREE.WebGLRenderTarget | null {
    return this.rt;
  }

  /** High-only RT & grid gate (D-7): allocates 1024² R16F + 384² grid on High, disposes both off High. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (active) {
      if (!this.gridGeo) {
        this.gridGeo = createCausticsGrid(CAUSTICS_MESH_N);
      }
      this.mesh.geometry = this.gridGeo;
      if (!this.rt) {
        this.rt = new THREE.WebGLRenderTarget(CAUSTICS_RES, CAUSTICS_RES, {
          format: THREE.RedFormat,
          type: THREE.HalfFloatType,
          depthBuffer: false,
          stencilBuffer: false,
          generateMipmaps: false,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          wrapS: THREE.ClampToEdgeWrapping,
          wrapT: THREE.ClampToEdgeWrapping,
        });
        this.rt.texture.name = "CausticsPass.Map";
      }
      this.uniforms.uCausticMap.value = this.rt.texture;
      this.hasDayContent = false;
    } else {
      this.uniforms.uCausticMap.value = this.fallback;
      this.mesh.geometry = this.placeholderGeo;
      if (this.gridGeo) {
        this.gridGeo.dispose();
        this.gridGeo = null;
      }
      if (this.rt) {
        this.rt.dispose();
        this.rt = null;
      }
      this.hasDayContent = false;
    }
  }

  setMode(mode: 0 | 1 | 2): void {
    this.uniforms.uCausticMode.value = mode;
  }

  render(renderer: THREE.WebGLRenderer, targetX: number, targetZ: number, sunUp: number): void {
    const b = causticsBoundsFor(targetX, targetZ, this.boundsScratch);
    this.uniforms.uCausticBounds.value.set(b[0], b[1], b[2], b[3]);
    if (!this.active || !this.rt) return;

    const night = sunUp <= 0.01;
    if (night && !this.hasDayContent) return;

    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    const prevClear = renderer.getClearColor(this.prevClear);
    const prevAlpha = renderer.getClearAlpha();
    try {
      renderer.autoClear = false;
      renderer.setRenderTarget(this.rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      if (night) {
        this.hasDayContent = false;
      } else {
        renderer.render(this.scene, this.cam);
        this.hasDayContent = true;
      }
    } finally {
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.autoClear = prevAuto;
      renderer.setRenderTarget(prevTarget);
    }
  }

  preparationEntries(): PreparationEntry[] {
    return [{ root: this.mesh, camera: this.cam, target: () => this.rt ?? this.compilationTarget, scene: this.scene }];
  }

  dispose(): void {
    this.setActive(false);
    this.fallback.dispose();
    this.compilationTarget.dispose();
    this.placeholderGeo.dispose();
    this.material.dispose();
  }
}
