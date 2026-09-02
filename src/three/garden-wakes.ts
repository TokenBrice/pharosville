import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import type { TextureOwnerManifestEntry } from "../renderer/render-types";

/**
 * Phase 3 (Breathtaking Rendering, item 2): persistent ship wakes.
 *
 * A 512² ping-pong render target holds a foam scalar field in a world-space
 * window around the camera target. Moving ships stamp decaying V-wakes into
 * it (ONE instanced draw, poses reused from the frame's ship loop — no new
 * CPU motion work), a feedback pass fades and slightly diffuses the previous
 * frame, and the water fragment samples the result for foam brightening and
 * normal perturbation. Motion that remembers: a wake outlives the stamp by
 * the decay time (~8 s) instead of vanishing with the ship's ripple ring.
 *
 * Contracts kept:
 * - Offscreen, out of the 700-draw-call budget: `update` is invoked BEFORE
 *   the frame's `renderer.info` reset, the same pattern the PMREM bake uses
 *   (world-renderer documents why). Costs 2 draws at full/balanced, 0 below.
 * - Deterministic: content derives from the fleet's motion plan and a fixed
 *   decay; the frame delta is clamped so a backgrounded tab cannot jump the
 *   field. Reduced motion resets the field to one empty time-zero composition,
 *   so a fresh static load and a runtime preference change are identical.
 * - Tier invariance of intent: below `balanced` the target freezes while the
 *   water fades it out, then clears once it is no longer visible. Painted
 *   per-ship ripple rings carry the wake cue below that tier, as before.
 * - No per-frame allocation: stamp attributes are preallocated buffers;
 *   targets ping-pong; the window is pure data.
 *
 * ## Windowing
 *
 * The field covers a square of `2 × halfSize` world units centred on the
 * camera target, in WATER space (x = worldX, y = −worldZ — the plane's −90°
 * X rotation maps world +Z to local −Y). Small pans reproject: the feedback
 * pass maps each texel in the new window back into the previous window, so a
 * wake survives both a drag and a smooth zoom. Only a teleport (shift > half
 * the previous window) hard-resets the field.
 *
 * `halfSize` tracks the view: wide enough that the wake window covers the
 * default framing with margin, capped so whole-map framing does not spread
 * the 512 texels too thin to hold a wake arm.
 */

export const WAKE_TEXTURE_SIZE = 512;
export const WAKE_MAX_STAMPS = 320;
const WAKE_MIN_HALF_SIZE = 72;
const WAKE_MAX_HALF_SIZE = 220;
const WAKE_VIEW_COVER = 1.35;
/** Pan distance (as a fraction of the window) that counts as a teleport. */
const WAKE_TELEPORT_FRACTION = 0.5;
/** Foam decay rate, 1/seconds — a stamp reads for ~8 s. */
const WAKE_DECAY_RATE = 0.12;
/** Idle frames-worth of seconds after which the field is cleared and sleeps. */
const WAKE_IDLE_TIMEOUT = 14;
/** Same coherent branch threshold used by the water shader. */
const WAKE_VISIBLE_EPSILON = 0.01;

export interface WakeWindow {
  /** Water-space centre: x = world targetX, y = −world targetZ. */
  centerX: number;
  centerY: number;
  halfSize: number;
}

/**
 * Pure window policy, separated from the GL so the reset rules are testable
 * without a renderer. Returns the window for this frame and whether the
 * field must be hard-reset (teleport) rather than reprojected.
 */
export function planWakeWindow(
  previous: WakeWindow | null,
  targetX: number,
  targetZ: number,
  viewHalfWidth: number,
): { reset: boolean; window: WakeWindow } {
  const halfSize = Math.min(
    WAKE_MAX_HALF_SIZE,
    Math.max(WAKE_MIN_HALF_SIZE, viewHalfWidth * WAKE_VIEW_COVER),
  );
  const centerX = targetX;
  const centerY = -targetZ;
  if (!previous) return { reset: true, window: { centerX, centerY, halfSize } };
  const shift = Math.hypot(centerX - previous.centerX, centerY - previous.centerY);
  return {
    reset: shift > previous.halfSize * WAKE_TELEPORT_FRACTION,
    window: { centerX, centerY, halfSize },
  };
}

export interface GardenWakesFrame {
  /** Clamped frame delta in seconds (world-renderer clamps to ≤ 0.25). */
  deltaSeconds: number;
  reducedMotion: boolean;
  /** Camera target in world XZ (same value the sky root anchors to). */
  targetX: number;
  targetZ: number;
  /** Half the view width in world units, for the window cover policy. */
  viewHalfWidth: number;
  /** Resolved quality tier; wakes ship at full/balanced only. */
  tier: string;
  /**
   * Water's currently displayed `uWakeStrength`. A lower tier retains the
   * target until this reaches the shader's invisible threshold.
   */
  visibleStrength?: number;
}

export interface GardenWakes {
  /** Water-space window centre X (world targetX). */
  readonly centerX: number;
  /** Water-space window centre Y (−world targetZ). */
  readonly centerY: number;
  readonly halfSize: number;
  /** Stamps collected since the last `update` (consumed by the next pass). */
  readonly stampCount: number;
  /** The field the water should sample this frame. */
  readonly texture: Texture;
  /** Both ping-pong attachments, including the back buffer not sampled by water. */
  getTextureManifest: () => readonly TextureOwnerManifestEntry[];
  /** Whether the field is live (stamped within the idle timeout). */
  readonly active: boolean;
  dispose: () => void;
  /** Clears history and queued stamps, used before a world-content epoch changes. */
  reset: () => void;
  /** Records one V-wake stamp; world XZ + tile-space heading, as the ship loop has them. */
  stamp: (
    worldX: number,
    worldZ: number,
    headingX: number,
    headingY: number,
    intensity: number,
    hullLength: number,
  ) => void;
  update: (frame: GardenWakesFrame) => void;
}

const FEEDBACK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FEEDBACK_FRAGMENT = /* glsl */ `
  uniform sampler2D uPrev;
  uniform vec2 uShift;
  uniform float uUvScale;
  uniform float uDecay;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    // Reproject: the texel at vUv in the NEW window shows the foam that sat
    // at the same WORLD point in the previous window.
    vec2 uv = vec2(0.5) + (vUv - vec2(0.5)) * uUvScale + uShift;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
      gl_FragColor = vec4(0.0);
      return;
    }
    // Slight diffusion (a wake spreads as it dies) then exponential decay.
    vec4 c = texture2D(uPrev, uv) * 0.55;
    c += texture2D(uPrev, uv + vec2(uTexel.x, 0.0)) * 0.1125;
    c += texture2D(uPrev, uv - vec2(uTexel.x, 0.0)) * 0.1125;
    c += texture2D(uPrev, uv + vec2(0.0, uTexel.y)) * 0.1125;
    c += texture2D(uPrev, uv - vec2(0.0, uTexel.y)) * 0.1125;
    gl_FragColor = max(c * uDecay - vec4(0.001, 0.0, 0.0, 0.0), vec4(0.0));
  }
`;

const STAMP_VERTEX = /* glsl */ `
  attribute vec2 aPos;
  attribute vec2 aDir;
  attribute vec2 aParam;
  uniform vec2 uCenter;
  uniform float uHalfSize;
  varying float vAcross;
  varying float vAstern;
  varying float vIntensity;
  void main() {
    vec2 side = vec2(-aDir.y, aDir.x);
    float width = 1.35 * aParam.y;
    float wakeLen = 3.0 * aParam.y;
    float trail = 0.5 - position.y;
    vec2 world = aPos + side * (position.x * width) - aDir * (trail * wakeLen);
    vAcross = position.x * width;
    vAstern = trail * wakeLen;
    vIntensity = aParam.x;
    vec2 clip = (world - uCenter) / uHalfSize;
    gl_Position = vec4(clip, 0.0, 1.0);
  }
`;

const STAMP_FRAGMENT = /* glsl */ `
  varying float vAcross;
  varying float vAstern;
  varying float vIntensity;
  void main() {
    float s = vAstern;
    // Kelvin-ish V: two arms at ~19 degrees, a centre wash, and a bright bow.
    // The arm width is sized to the window's texel (~0.4 world units) so the
    // lines survive rasterisation instead of sparkling under the fleet's motion.
    float armLine = s * 0.34;
    float armDelta = abs(vAcross) - armLine;
    float arm = exp(-(armDelta * armDelta) / 0.14) * exp(-s * 0.55);
    float wash = exp(-(vAcross * vAcross) / 0.16) * exp(-s * 0.9) * 0.55;
    float bow = exp(-(vAcross * vAcross + s * s) / 0.05) * 0.7;
    float foam = (arm + wash + bow) * vIntensity * 0.5;
    gl_FragColor = vec4(foam, 0.0, 0.0, 1.0);
  }
`;

function createTarget(): WebGLRenderTarget {
  const target = new WebGLRenderTarget(WAKE_TEXTURE_SIZE, WAKE_TEXTURE_SIZE, {
    depthBuffer: false,
    format: RGBAFormat,
    generateMipmaps: false,
    magFilter: LinearFilter,
    minFilter: LinearFilter,
    stencilBuffer: false,
  });
  return target;
}

export function createGardenWakes(renderer: WebGLRenderer): GardenWakes {
  const firstTarget = createTarget();
  const secondTarget = createTarget();
  const textureManifest: readonly TextureOwnerManifestEntry[] = [
    { owner: "garden-wakes.target-a", texture: firstTarget.texture },
    { owner: "garden-wakes.target-b", texture: secondTarget.texture },
  ];
  let front = firstTarget;
  let back = secondTarget;

  const offscreenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const offscreenScene = new Scene();

  const feedbackMaterial = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    fragmentShader: FEEDBACK_FRAGMENT,
    uniforms: {
      uDecay: { value: 1 },
      uPrev: { value: front.texture },
      uShift: { value: { x: 0, y: 0 } },
      uTexel: { value: { x: 1 / WAKE_TEXTURE_SIZE, y: 1 / WAKE_TEXTURE_SIZE } },
      uUvScale: { value: 1 },
    },
    vertexShader: FEEDBACK_VERTEX,
  });
  const feedbackQuad = new Mesh(new PlaneGeometry(2, 2), feedbackMaterial);
  feedbackQuad.frustumCulled = false;

  const stampGeometry = new PlaneGeometry(1, 1);
  const posData = new Float32Array(WAKE_MAX_STAMPS * 2);
  const dirData = new Float32Array(WAKE_MAX_STAMPS * 2);
  const paramData = new Float32Array(WAKE_MAX_STAMPS * 2);
  const posAttribute = new InstancedBufferAttribute(posData, 2);
  const dirAttribute = new InstancedBufferAttribute(dirData, 2);
  const paramAttribute = new InstancedBufferAttribute(paramData, 2);
  posAttribute.setUsage(DynamicDrawUsage);
  dirAttribute.setUsage(DynamicDrawUsage);
  paramAttribute.setUsage(DynamicDrawUsage);
  stampGeometry.setAttribute("aPos", posAttribute);
  stampGeometry.setAttribute("aDir", dirAttribute);
  stampGeometry.setAttribute("aParam", paramAttribute);
  const stampMaterial = new ShaderMaterial({
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    fragmentShader: STAMP_FRAGMENT,
    uniforms: {
      uCenter: { value: { x: 0, y: 0 } },
      uHalfSize: { value: 96 },
    },
    vertexShader: STAMP_VERTEX,
  });
  const stampMesh = new InstancedMesh(stampGeometry, stampMaterial, WAKE_MAX_STAMPS);
  stampMesh.count = 0;
  stampMesh.frustumCulled = false;

  offscreenScene.add(feedbackQuad, stampMesh);

  let window_: WakeWindow = { centerX: 0, centerY: 0, halfSize: 96 };
  let stampCount = 0;
  let active = false;
  let idleSeconds = 0;
  // sleeping = the field is empty and the passes are skipped; hasWindow = the
  // window anchor is established (so the reset policy can see pans).
  let sleeping = true;
  let hasWindow = false;
  let targetsAreClear = false;
  let wasReducedMotion = false;
  const clearColorScratch = new Color();
  let disposed = false;

  const clearTargets = () => {
    const previousTarget = renderer.getRenderTarget();
    renderer.getClearColor(clearColorScratch);
    const previousAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(front);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(back);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(clearColorScratch, previousAlpha);
    targetsAreClear = true;
  };

  const resetField = (window: WakeWindow) => {
    if (!targetsAreClear) clearTargets();
    front = firstTarget;
    back = secondTarget;
    window_ = window;
    stampCount = 0;
    sleeping = true;
    active = false;
    idleSeconds = 0;
  };

  return {
    get centerX() {
      return window_.centerX;
    },
    get centerY() {
      return window_.centerY;
    },
    get halfSize() {
      return window_.halfSize;
    },
    get stampCount() {
      return stampCount;
    },
    get texture() {
      return front.texture;
    },
    getTextureManifest() {
      return textureManifest;
    },
    get active() {
      return active;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      firstTarget.dispose();
      secondTarget.dispose();
      feedbackQuad.geometry.dispose();
      feedbackMaterial.dispose();
      stampGeometry.dispose();
      stampMaterial.dispose();
    },
    reset() {
      if (disposed) return;
      resetField(window_);
    },
    stamp(worldX, worldZ, headingX, headingY, intensity, hullLength) {
      if (stampCount >= WAKE_MAX_STAMPS) return;
      // Wake space: x = worldX, y = -worldZ (the water plane's -90° X rotation).
      const x = worldX;
      const y = -worldZ;
      // Ships outside the window (plus a small margin for the wake's own
      // reach) cannot contribute — the stamp would clip to nothing anyway.
      const margin = window_.halfSize * 1.15;
      if (Math.abs(x - window_.centerX) > margin || Math.abs(y - window_.centerY) > margin) {
        return;
      }
      const i = stampCount * 2;
      posData[i] = x;
      posData[i + 1] = y;
      dirData[i] = headingX;
      dirData[i + 1] = -headingY;
      paramData[i] = Math.min(1, Math.max(0, intensity));
      paramData[i + 1] = Math.min(3, Math.max(0.5, hullLength));
      stampCount += 1;
    },
    update(frame) {
      if (disposed) return;
      const planned = planWakeWindow(
        hasWindow ? window_ : null,
        frame.targetX,
        frame.targetZ,
        frame.viewHalfWidth,
      );
      hasWindow = true;
      const tierOn = frame.tier === "full" || frame.tier === "balanced";
      // Reduced motion always resolves to the same empty time-zero field,
      // whether it was active from startup or entered after an animated run.
      if (frame.reducedMotion) {
        if (!wasReducedMotion || !targetsAreClear) resetField(planned.window);
        wasReducedMotion = true;
        stampCount = 0;
        return;
      }
      wasReducedMotion = false;
      // A teleport cannot be reprojected honestly.
      if (planned.reset) {
        resetField(planned.window);
        return;
      }
      if (!tierOn) {
        // Stop adding/decaying while water eases the existing field away. Once
        // it is below the fragment shader's branch threshold, clear exactly
        // once and adopt the latest camera window for a clean tier ascent.
        stampCount = 0;
        if ((frame.visibleStrength ?? 0) <= WAKE_VISIBLE_EPSILON) {
          resetField(planned.window);
        }
        return;
      }
      // An empty target sleeps until the first new ship stamp arrives.
      if (sleeping && stampCount === 0) {
        window_ = planned.window;
        return;
      }
      idleSeconds = stampCount > 0 ? 0 : idleSeconds + frame.deltaSeconds;
      if (idleSeconds > WAKE_IDLE_TIMEOUT) {
        clearTargets();
        sleeping = true;
        active = false;
        idleSeconds = 0;
        stampCount = 0;
        window_ = planned.window;
        return;
      }
      sleeping = false;
      const dt = Math.min(0.25, Math.max(0, frame.deltaSeconds));
      const feedback = feedbackMaterial.uniforms;
      feedback.uPrev.value = front.texture;
      // Shift in UV: a world point lands (C_new - C_prev)/(2*halfSize) away.
      feedback.uShift.value.x = (planned.window.centerX - window_.centerX) / (2 * window_.halfSize);
      feedback.uShift.value.y = (planned.window.centerY - window_.centerY) / (2 * window_.halfSize);
      feedback.uUvScale.value = planned.window.halfSize / window_.halfSize;
      feedback.uDecay.value = Math.exp(-WAKE_DECAY_RATE * dt);
      window_ = planned.window;
      const stamps = stampMaterial.uniforms;
      stamps.uCenter.value.x = window_.centerX;
      stamps.uCenter.value.y = window_.centerY;
      stamps.uHalfSize.value = window_.halfSize;
      stampMesh.count = stampCount;
      posAttribute.needsUpdate = true;
      dirAttribute.needsUpdate = true;
      paramAttribute.needsUpdate = true;

      const previousTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      renderer.setRenderTarget(back);
      feedbackQuad.visible = true;
      stampMesh.visible = false;
      renderer.autoClear = true;
      renderer.render(offscreenScene, offscreenCamera);
      // The stamp pass adds into the feedback result without clearing it.
      if (stampCount > 0) {
        feedbackQuad.visible = false;
        stampMesh.visible = true;
        renderer.autoClear = false;
        renderer.render(offscreenScene, offscreenCamera);
      }
      feedbackQuad.visible = true;
      stampMesh.visible = false;
      renderer.autoClear = previousAutoClear;
      renderer.setRenderTarget(previousTarget);
      const swap = front;
      front = back;
      back = swap;
      targetsAreClear = false;
      active = true;
      stampCount = 0;
    },
  };
}
