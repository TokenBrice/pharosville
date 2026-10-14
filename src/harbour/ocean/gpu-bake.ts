import * as THREE from "three";

/**
 * One-off GPU bakes (procedural textures, cloud atlas) and reusable fullscreen passes.
 * A pass owns a fullscreen triangle + ShaderMaterial; render() draws it into a target and restores
 * the renderer's previous target / autoClear so it is safe to call from a WorldSystem.update().
 */
export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class FullscreenPass {
  readonly material: THREE.ShaderMaterial;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mesh: THREE.Mesh;

  constructor(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, opts: Partial<THREE.ShaderMaterialParameters> = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, ...opts });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, clear = true, viewport?: THREE.Vector4): void {
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    if (viewport && target) { target.viewport.copy(viewport); target.scissor.copy(viewport); target.scissorTest = true; }
    renderer.setRenderTarget(target);
    renderer.autoClear = clear;
    renderer.render(this.scene, this.camera);
    if (viewport && target) { target.viewport.set(0, 0, target.width, target.height); target.scissorTest = false; }
    renderer.autoClear = prevAuto;
    renderer.setRenderTarget(prevTarget);
  }

  dispose(): void { this.mesh.geometry.dispose(); this.material.dispose(); }
}

export interface BakeOptions {
  width: number;
  height: number;
  type?: THREE.TextureDataType;
  wrap?: THREE.Wrapping;
  mipmaps?: boolean;
  uniforms?: Record<string, THREE.IUniform>;
}

/** Render a fragment shader once into a new render target (texture stays on the GPU). */
export function bakeTexture(renderer: THREE.WebGLRenderer, fragmentShader: string, o: BakeOptions): THREE.WebGLRenderTarget {
  const mip = o.mipmaps ?? true;
  const rt = new THREE.WebGLRenderTarget(o.width, o.height, {
    type: o.type ?? THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    generateMipmaps: mip,
    minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: o.wrap ?? THREE.RepeatWrapping,
    wrapT: o.wrap ?? THREE.RepeatWrapping,
    anisotropy: 4,
  });
  const pass = new FullscreenPass(fragmentShader, o.uniforms ?? {});
  pass.render(renderer, rt);
  pass.dispose();
  return rt;
}

/** GLSL: periodic (tileable) value noise + fbm, hash without sin for precision. */
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float pnoise(vec2 x, float period, float seed) {
  vec2 i = floor(x), f = fract(x); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(vec3(mod(i, period), seed));
  float b = hash13(vec3(mod(i + vec2(1.0, 0.0), period), seed));
  float c = hash13(vec3(mod(i + vec2(0.0, 1.0), period), seed));
  float d = hash13(vec3(mod(i + vec2(1.0, 1.0), period), seed));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm(vec2 uv, float base, float seed, int oct) {
  float v = 0.0, amp = 0.5, f = base, n = 0.0;
  for (int o = 0; o < 6; o++) { if (o >= oct) break; v += amp * pnoise(uv * f, f, seed + float(o) * 7.0); n += amp; amp *= 0.5; f *= 2.0; }
  return v / n;
}`;
