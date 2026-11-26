import * as THREE from "three";
import { LAYER_REFLECT } from "./reflect-layer";

/**
 * High-tier half-CSS Planar Reflection Mirror (`PLAN.md` §5.6, hardened from C1 / C3 / C4 / H12 / M7).
 *
 * Architecture & WebGL2 r186 invariants:
 * - Executes inside `ocean.onBeforeRender` immediately after `SceneCapture` while `composer.inputBuffer` is active,
 *   AFTER the main pass has already finalized and updated the shadow map.
 * - Uses a strictly right-handed mirrored camera (`det(matrixWorld) = +1`, zero winding flip, `mirrorCam.far === mainCam.far`)
 *   with Lengyel (2005) oblique near-plane clipping at `Y = PLANAR_CLIP_Y` (`-0.08 m`) so underwater geometry never
 *   leaks into the reflection while distant cliffs remain unclipped.
 * - Renders ONLY `LAYER_REFLECT` objects and shared lights (`enableLightReflectLayer`), saving/clearing/restoring
 *   `renderer.shadowMap.autoUpdate` and `needsUpdate` WITHOUT ever mutating `renderer.shadowMap.enabled` (C4: zero
 *   shader recompiles, zero shadow-map corruption).
 * - Preserves Three.js r186 FBO and scissor state cleanly in `finally` (restoring `prevTarget`, clearing
 *   `READ_FRAMEBUFFER` via `renderer.state.bindFramebuffer`, restoring scissor test, autoClear, and clear color/alpha;
 *   NEVER calling `renderer.state.reset()`).
 * - Exposes `updateFrustum(mainCam, target)` so `FleetSystem` can pose tall hulls visible in the mirror frustum (H12).
 */
export const PLANAR_CLIP_Y = -0.08;
export const PLANAR_FADE = 0.6;
export const PLANAR_STRENGTH = 0.72;
export const PLANAR_WOBBLE = 0.032;

export interface PlanarMirrorUniforms {
  uPlanarVP: THREE.IUniform<THREE.Matrix4>;
  uMirror: THREE.IUniform<THREE.Vector4>;
  uMirrorTex: THREE.IUniform<THREE.Texture>;
}

/** Half-CSS render target dimensions (minimum 1×1, never scaled by DPR). */
export function planarTargetSize(cssWidth: number, cssHeight: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.ceil(cssWidth / 2)),
    height: Math.max(1, Math.ceil(cssHeight / 2)),
  };
}

const _worldPlane = new THREE.Plane();
const _clipPlane = new THREE.Plane();
const _clipNormal = new THREE.Vector3(0, 1, 0);
const _lookDir = new THREE.Vector3();
const _targetScratch = new THREE.Vector3();
const _mirrorTarget = new THREE.Vector3();

/**
 * Replaces row 2 of `mirrorCam.projectionMatrix` with Lengyel's (2005) oblique near-plane clip at `Y = clipY`,
 * keeping the half-space `y >= clipY` inside `ndc.z ∈ [-1, 1]` and clipping `y < clipY` to `ndc.z < -1`.
 *
 * Requires `mirrorCam.updateMatrixWorld()` and `mirrorCam.updateProjectionMatrix()` to have been called first.
 * Returns `false` (leaving the standard projection matrix untouched) if the camera is nearly parallel to or on
 * the wrong side of the clip plane.
 */
export function applyObliqueClip(
  mirrorCam: THREE.PerspectiveCamera,
  clipY = PLANAR_CLIP_Y,
): boolean {
  // World plane n·p + d >= 0 for above-water points y >= clipY: n = (0, 1, 0), d = -clipY.
  _worldPlane.set(_clipNormal, -clipY);
  _clipPlane.copy(_worldPlane).applyMatrix4(mirrorCam.matrixWorldInverse);

  const cx = _clipPlane.normal.x;
  const cy = _clipPlane.normal.y;
  const cz = _clipPlane.normal.z;
  const cw = _clipPlane.constant;

  // From mirrorCam below Y = 0 looking up, world +Y points forward (-Z_view), so kept half-space has cz < 0.
  if (!(cz < -1e-4)) return false;

  const P = mirrorCam.projectionMatrix.elements;
  if (Math.abs(P[0]) < 1e-8 || Math.abs(P[5]) < 1e-8 || Math.abs(P[14]) < 1e-8) return false;

  const qx = (Math.sign(cx) + P[8]) / P[0];
  const qy = (Math.sign(cy) + P[9]) / P[5];
  const qz = -1.0;
  const qw = (1.0 + P[10]) / P[14];

  const dot = cx * qx + cy * qy + cz * qz + cw * qw;
  if (!(dot > 1e-4) || !Number.isFinite(dot)) return false;

  const scale = 2.0 / dot;
  P[2] = cx * scale;
  P[6] = cy * scale;
  P[10] = cz * scale + 1.0;
  P[14] = cw * scale;

  mirrorCam.projectionMatrixInverse.copy(mirrorCam.projectionMatrix).invert();
  return true;
}

/**
 * Syncs `mirrorCam` as a strictly right-handed reflection of `mainCam` across `Y = 0` with identical `far`
 * and Lengyel oblique near-plane clip at `Y = clipY`.
 */
export function syncMirrorCamera(
  mirrorCam: THREE.PerspectiveCamera,
  mainCam: THREE.PerspectiveCamera,
  target?: THREE.Vector3,
  clipY = PLANAR_CLIP_Y,
): boolean {
  mainCam.updateMatrixWorld();

  if (target) {
    _targetScratch.copy(target);
  } else {
    mainCam.getWorldDirection(_lookDir);
    _targetScratch.copy(mainCam.position).addScaledVector(_lookDir, 100);
  }

  mirrorCam.position.set(mainCam.position.x, -mainCam.position.y, mainCam.position.z);
  _mirrorTarget.set(_targetScratch.x, -_targetScratch.y, _targetScratch.z);

  const dx = _mirrorTarget.x - mirrorCam.position.x;
  const dz = _mirrorTarget.z - mirrorCam.position.z;
  if (dx * dx + dz * dz < 1e-8) {
    mirrorCam.up.set(0, 0, -1);
  } else {
    mirrorCam.up.set(0, 1, 0);
  }
  mirrorCam.lookAt(_mirrorTarget);

  mirrorCam.fov = mainCam.fov;
  mirrorCam.aspect = mainCam.aspect;
  mirrorCam.near = mainCam.near;
  mirrorCam.far = mainCam.far;
  mirrorCam.updateMatrixWorld(true);
  mirrorCam.updateProjectionMatrix();

  return applyObliqueClip(mirrorCam, clipY);
}

export class PlanarMirror {
  readonly mirrorCam = new THREE.PerspectiveCamera();
  readonly uniforms: PlanarMirrorUniforms;
  strength = PLANAR_STRENGTH;

  private readonly fallback: THREE.DataTexture;
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly frustum = new THREE.Frustum();
  private readonly vpScratch = new THREE.Matrix4();
  private readonly cssSize = new THREE.Vector2(1, 1);
  private readonly prevClear = new THREE.Color();
  private cssW = 1;
  private cssH = 1;
  private active = false;
  private _enabled = false;
  private _ready = false;
  private shown = 0;
  private visibility = 1;
  private rendering = false;
  private disposed = false;

  constructor() {
    this.mirrorCam.layers.set(LAYER_REFLECT);
    this.fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.fallback.minFilter = THREE.LinearFilter;
    this.fallback.magFilter = THREE.LinearFilter;
    this.fallback.wrapS = THREE.ClampToEdgeWrapping;
    this.fallback.wrapT = THREE.ClampToEdgeWrapping;
    this.fallback.needsUpdate = true;

    this.uniforms = {
      uPlanarVP: { value: new THREE.Matrix4() },
      uMirror: { value: new THREE.Vector4(0, PLANAR_WOBBLE, 0, 0) },
      uMirrorTex: { value: this.fallback },
    };
  }

  get texture(): THREE.Texture | null {
    return this.target?.texture ?? null;
  }

  get ready(): boolean {
    return this._ready;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /** D-2 visibility gating: stays on through light drizzle, suppresses smoothly in fog/rain. */
  setConditions(fogAmount: number, precipitation: number): void {
    this.visibility = (1 - fogAmount) * (1 - THREE.MathUtils.smoothstep(precipitation, 0.08, 0.3));
    this.updateStrength();
  }

  /** Updates cached CSS viewport size and resizes the half-CSS render target when allocated. */
  resize(cssWidth: number, cssHeight: number): void {
    this.cssW = cssWidth;
    this.cssH = cssHeight;
    if (!this.target) return;
    const { width, height } = planarTargetSize(cssWidth, cssHeight);
    if (this.target.width === width && this.target.height === height) return;
    this.target.setSize(width, height);
    this._ready = false;
    this.uniforms.uMirror.value.x = 0;
    this.uniforms.uMirror.value.w = 1.5 / height;
  }

  /**
   * High entry lazily allocates the half-CSS RGBA16F mipped render target and eases strength in over `PLANAR_FADE`.
   * Leaving High eases out and disposes the RT at zero; `immediate` (e.g. Low tier) cuts and disposes immediately.
   */
  setActive(active: boolean, immediate = false): void {
    if (this.disposed) return;
    if (active === this.active && !(immediate && this.target && !active)) return;
    this.active = active;
    if (!active) {
      if (immediate) this.release();
      return;
    }
    this._enabled = true;
    if (this.target) return;

    const { width, height } = planarTargetSize(this.cssW, this.cssH);
    const rt = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    rt.texture.name = "PlanarMirror.Target";
    this.target = rt;
    this.uniforms.uMirror.value.set(0, PLANAR_WOBBLE, 1, 1.5 / height);
    this.uniforms.uMirrorTex.value = rt.texture;
  }

  /**
   * Updates `mirrorCam` and returns its oblique-clipped frustum so `FleetSystem.update()` can pose vessels
   * visible in the water reflection before render (H12). Returns `null` when inactive or visibility is zero.
   */
  updateFrustum(mainCam: THREE.PerspectiveCamera, target?: THREE.Vector3): THREE.Frustum | null {
    if (!this._enabled || !this.target || this.visibility <= 0.001) return null;
    if (mainCam.position.y <= PLANAR_CLIP_Y + 0.05) return null;
    syncMirrorCamera(this.mirrorCam, mainCam, target, PLANAR_CLIP_Y);
    this.vpScratch.multiplyMatrices(this.mirrorCam.projectionMatrix, this.mirrorCam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.vpScratch);
    return this.frustum;
  }

  /**
   * Renders the reflective layer (`LAYER_REFLECT`) into the half-CSS planar target from inside `ocean.onBeforeRender`.
   * Strictly preserves FBO bindings, READ_FRAMEBUFFER, scissor test, autoClear, clear color/alpha, scene background/fog,
   * and shadow-map update flags without touching `shadowMap.enabled` or calling `renderer.state.reset()`.
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    mainCam: THREE.PerspectiveCamera,
    target?: THREE.Vector3,
    dt = 1 / 60,
  ): void {
    if (this.disposed || !this.target || this.rendering) return;

    const step = Math.min(Math.max(dt, 0), 0.25) / PLANAR_FADE;
    this.shown = this.active ? Math.min(1, this.shown + step) : Math.max(0, this.shown - step);
    if (!this.active && this.shown <= 0) {
      this.release();
      return;
    }

    if (this.visibility <= 0.001) {
      this.updateStrength();
      return;
    }

    if (mainCam.position.y <= PLANAR_CLIP_Y + 0.05) {
      this._ready = false;
      this.updateStrength();
      return;
    }

    if (typeof renderer.getSize === "function") {
      renderer.getSize(this.cssSize);
      this.resize(this.cssSize.x, this.cssSize.y);
    }

    syncMirrorCamera(this.mirrorCam, mainCam, target, PLANAR_CLIP_Y);
    this.mirrorCam.layers.set(LAYER_REFLECT);

    const gl = typeof renderer.getContext === "function"
      ? (renderer.getContext() as WebGL2RenderingContext | null)
      : null;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevClearColor = renderer.getClearColor(this.prevClear);
    const prevClearAlpha = renderer.getClearAlpha();
    const prevScissor = gl && typeof gl.isEnabled === "function" ? gl.isEnabled(gl.SCISSOR_TEST) : false;
    const sm = renderer.shadowMap;
    const prevShadowAuto = sm?.autoUpdate;
    const prevShadowNeeds = sm?.needsUpdate;
    const prevBg = scene.background;
    const prevFog = scene.fog;

    this.rendering = true;
    try {
      if (sm) {
        sm.autoUpdate = false;
        sm.needsUpdate = false;
      }
      scene.background = null;
      scene.fog = null;
      renderer.autoClear = false;
      if (prevScissor && typeof renderer.state?.setScissorTest === "function") {
        renderer.state.setScissorTest(false);
      } else if (prevScissor && gl && typeof gl.disable === "function") {
        gl.disable(gl.SCISSOR_TEST);
      }

      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(scene, this.mirrorCam);
    } finally {
      this.rendering = false;
      scene.background = prevBg;
      scene.fog = prevFog;
      if (sm) {
        if (prevShadowAuto !== undefined) sm.autoUpdate = prevShadowAuto;
        if (prevShadowNeeds !== undefined) sm.needsUpdate = prevShadowNeeds;
      }
      renderer.setClearColor(prevClearColor, prevClearAlpha);
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget);
      if (gl) {
        if ((renderer.state?.bindFramebuffer?.(gl.READ_FRAMEBUFFER, null) as unknown as boolean | undefined) === false) {
          gl.bindFramebuffer?.(gl.READ_FRAMEBUFFER, null);
        }
        if (typeof renderer.state?.setScissorTest === "function") {
          renderer.state.setScissorTest(prevScissor);
        } else if (typeof gl.enable === "function" && typeof gl.disable === "function") {
          if (prevScissor) gl.enable(gl.SCISSOR_TEST);
          else gl.disable(gl.SCISSOR_TEST);
        }
      }
    }

    this.uniforms.uPlanarVP.value.multiplyMatrices(
      this.mirrorCam.projectionMatrix,
      this.mirrorCam.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.uniforms.uPlanarVP.value);
    this._ready = true;
    this.updateStrength();
  }

  private updateStrength(): void {
    const eased = this.shown * this.shown * (3 - 2 * this.shown);
    this.uniforms.uMirror.value.x = this._ready ? this.strength * eased * this.visibility : 0;
  }

  private release(): void {
    this._enabled = false;
    this._ready = false;
    this.shown = 0;
    this.uniforms.uMirrorTex.value = this.fallback;
    this.uniforms.uMirror.value.set(0, PLANAR_WOBBLE, 0, 0);
    if (this.target) {
      this.target.dispose();
      this.target = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.release();
    this.fallback.dispose();
  }
}
