import {
  Color,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  MathUtils,
  MaxEquation,
  Mesh,
  OneFactor,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector4,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three";
import type { TextureOwnerManifestEntry } from "../renderer/render-types";

/**
 * The wake field (Hour-Print K8: W3.8 hull contact, W3.9 glassy slicks).
 *
 * A 512² HalfFloat RGBA ping-pong pair holds three independent channels in a
 * world-space window around the camera target. The water fragment samples it.
 *
 * - **R foam**: bow cushion, stern churn and short hull-scaled Kelvin arms of
 *   every hull making way. Fades in ~3 s, exactly zero by 12 s.
 * - **G slick**: soft historical water displaced by an actual mover, laid at
 *   its raw zone/speed/change intensity. Fades over ~30 s, zero by 60 s.
 * - **B contact**: every visible hull's waterline footprint, THIS frame only —
 *   the feedback pass zeroes it, the stamp pass rewrites it.
 * - A: unused, held at zero.
 *
 * Stamps are one instanced draw; the kind rides in the sign of `aParam.x`
 * (+ wake, − contact). They blend with MAX, not ADD, so the field a hull
 * writes is independent of frame rate and overlapping hulls never double.
 *
 * ## Residue policy
 *
 * Contact stamps arrive every frame, so the field no longer sleeps while
 * hulls are in the window. Each decaying channel follows the exact solution of
 * `dv/dt = −k·v − f` over the frame (`wakeDecayFloor`), with `f` chosen so a
 * full value reaches zero exactly at the channel's horizon: nothing lingers
 * as a faint residue, at any frame rate. The slow G channel accumulates its
 * time and steps every `WAKE_SLICK_STEP_SECONDS`, because a 30 s decay is a
 * per-frame change below one HalfFloat ulp at 120 Hz and would stall; between
 * steps G is copied exactly. The field sleeps (passes skipped, targets
 * cleared) only when no stamp arrived and the slick horizon has passed since
 * the last wake stamp — i.e. once it is provably empty.
 *
 * Contracts kept:
 * - Offscreen, out of the 700-draw-call budget: `update` is invoked BEFORE
 *   the frame's `renderer.info` reset, the same pattern the PMREM bake uses
 *   (world-renderer documents why). Costs 2 draws at full/balanced, 0 below.
 * - Texture count unchanged: the same two targets, now HalfFloat.
 * - Deterministic: content derives from the fleet's poses and fixed decay
 *   laws; the frame delta is clamped so a backgrounded tab cannot jump the
 *   field. Reduced motion clears R/G to canonical time zero and redraws B
 *   only when the hull footprints or camera window change.
 * - Tier invariance of intent: below `balanced` the target freezes while the
 *   water fades it out, then clears once it is no longer visible.
 * - No per-frame allocation: stamp attributes are preallocated buffers;
 *   targets ping-pong; the window and the decay plan are pure data.
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
 * the 512 texels too thin to hold a slick lane.
 */

export const WAKE_TEXTURE_SIZE = 512;
/** Every hull stamps contact; movers add a wake: fleet + movers + waterfall. */
export const WAKE_MAX_STAMPS = 384;
const WAKE_MIN_HALF_SIZE = 72;
const WAKE_MAX_HALF_SIZE = 220;
const WAKE_VIEW_COVER = 1.35;
/** Pan distance (as a fraction of the window) that counts as a teleport. */
const WAKE_TELEPORT_FRACTION = 0.5;
/** R foam: exponential rate (1/s, ~3 s) and the time a full value reaches 0. */
export const WAKE_FOAM_DECAY_RATE = 0.35;
export const WAKE_FOAM_HORIZON_SECONDS = 12;
/** R foam spreads as it dies: neighbour mix per second (0.45 per 60 Hz frame). */
const WAKE_FOAM_DIFFUSE_RATE = 27;
const WAKE_FOAM_DIFFUSE_MAX = 0.45;
/** G slick: exponential rate (1/s, ~30 s) and the time a full value reaches 0. */
export const WAKE_SLICK_DECAY_RATE = 1 / 30;
export const WAKE_SLICK_HORIZON_SECONDS = 60;
/** G steps at this cadence so each step is several HalfFloat ulps. */
export const WAKE_SLICK_STEP_SECONDS = 0.1;
/** G softens slowly as it ages: neighbour mix per second (σ ≈ 2 texels by 30 s). */
const WAKE_SLICK_DIFFUSE_RATE = 0.3;
/** The G value the water reads as a visible slick. */
export const WAKE_SLICK_VISIBLE = 0.12;
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

/**
 * The subtractive term of one decay step `v' = max(v·m − floor, 0)`, where
 * `m = exp(−rate·dt)`. It is the exact step of `dv/dt = −rate·v − f` with `f`
 * set so a value of 1 reaches 0 exactly at `horizonSeconds`; exact, so any
 * split of the same time into frames lands on the same value.
 */
export function wakeDecayFloor(rate: number, horizonSeconds: number, multiplier: number): number {
  const tail = Math.exp(-rate * horizonSeconds);
  return (tail / (1 - tail)) * (1 - multiplier);
}

export interface WakeChannels {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** One feedback pass's per-channel laws: `max(mix(c, blur, diffuse) · decay − floor, 0)`. */
export interface WakeDecayPass {
  decay: WakeChannels;
  floor: WakeChannels;
  diffuse: WakeChannels;
}

/** Carries G's unstepped time between feedback passes. */
export interface WakeDecayClock {
  slickPendingSeconds: number;
}

/**
 * Plans one feedback pass: R steps every frame, G every
 * `WAKE_SLICK_STEP_SECONDS` of accumulated time (identity in between), B and
 * A are zeroed.
 */
export function planWakeDecayPass(clock: WakeDecayClock, deltaSeconds: number, out: WakeDecayPass): void {
  const dt = Math.min(0.25, Math.max(0, deltaSeconds));
  const foam = Math.exp(-WAKE_FOAM_DECAY_RATE * dt);
  out.decay.x = foam;
  out.floor.x = wakeDecayFloor(WAKE_FOAM_DECAY_RATE, WAKE_FOAM_HORIZON_SECONDS, foam);
  out.diffuse.x = Math.min(WAKE_FOAM_DIFFUSE_MAX, WAKE_FOAM_DIFFUSE_RATE * dt);
  clock.slickPendingSeconds += dt;
  // The epsilon absorbs float drift so six 60 Hz frames make one step.
  if (clock.slickPendingSeconds >= WAKE_SLICK_STEP_SECONDS - 1e-6) {
    const step = clock.slickPendingSeconds;
    clock.slickPendingSeconds = 0;
    const slick = Math.exp(-WAKE_SLICK_DECAY_RATE * step);
    out.decay.y = slick;
    out.floor.y = wakeDecayFloor(WAKE_SLICK_DECAY_RATE, WAKE_SLICK_HORIZON_SECONDS, slick);
    out.diffuse.y = Math.min(0.25, WAKE_SLICK_DIFFUSE_RATE * step);
  } else {
    out.decay.y = 1;
    out.floor.y = 0;
    out.diffuse.y = 0;
  }
  out.decay.z = 0;
  out.floor.z = 0;
  out.diffuse.z = 0;
  out.decay.w = 0;
  out.floor.w = 0;
  out.diffuse.w = 0;
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
  /** Whether the field holds content (not asleep). */
  readonly active: boolean;
  dispose: () => void;
  /** Clears history and queued stamps, used before a world-content epoch changes. */
  reset: () => void;
  /**
   * Records one hull making way (or any foam source): foam into R at the bow,
   * stern and short Kelvin arms and, when `slick` > 0, the glassy lane into G.
   * World XZ + tile-space heading, as the ship loop has them; `halfLength`
   * and `halfBeam` are the hull's world half-extents.
   */
  stamp: (
    worldX: number,
    worldZ: number,
    headingX: number,
    headingY: number,
    foam: number,
    halfLength: number,
    halfBeam?: number,
    slick?: number,
  ) => void;
  /** Records one hull's waterline footprint into B for the next frame only. */
  stampContact: (
    worldX: number,
    worldZ: number,
    headingX: number,
    headingY: number,
    halfLength: number,
    halfBeam: number,
    strength: number,
  ) => void;
  update: (frame: GardenWakesFrame) => void;
  /**
   * Reduced motion (W5): the field carries no wakes, but hulls still sit in
   * the water. After this frame's ship loop has stamped contact, draw those
   * footprints alone into the (cleared) field so the water reads them in the
   * same frame — hull-bedded static contact, never historical trails.
   * No-op outside reduced motion.
   */
  renderStaticContact: () => void;
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
  uniform vec2 uTexel;
  uniform vec4 uDecay;
  uniform vec4 uFloor;
  uniform vec4 uDiffuse;
  varying vec2 vUv;
  void main() {
    // Reproject: the texel at vUv in the NEW window shows the field that sat
    // at the same WORLD point in the previous window.
    vec2 uv = vec2(0.5) + (vUv - vec2(0.5)) * uUvScale + uShift;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec4 c = texture2D(uPrev, uv);
    vec4 blur = (
      texture2D(uPrev, uv + vec2(uTexel.x, 0.0))
      + texture2D(uPrev, uv - vec2(uTexel.x, 0.0))
      + texture2D(uPrev, uv + vec2(0.0, uTexel.y))
      + texture2D(uPrev, uv - vec2(0.0, uTexel.y))
    ) * 0.25;
    // Per channel: spread, clamp, then the exact decay step. A zero diffuse
    // and unit decay copy G exactly between its steps; B and A decay to 0.
    c = min(mix(c, blur, uDiffuse), vec4(1.0));
    gl_FragColor = max(c * uDecay - uFloor, vec4(0.0));
  }
`;

const STAMP_VERTEX = /* glsl */ `
  attribute vec2 aPos;
  attribute vec2 aDir;
  // x: signed strength (+ wake, - contact), y: half-length, z: half-beam,
  // w: slick strength (wake only).
  attribute vec4 aParam;
  uniform vec2 uCenter;
  uniform float uHalfSize;
  uniform float uTexelWorld;
  varying vec2 vLocal;
  varying vec4 vParam;
  void main() {
    vec2 side = vec2(-aDir.y, aDir.x);
    float halfLength = aParam.y;
    float halfBeam = aParam.z;
    float pad = 2.0 * uTexelWorld;
    vec2 alongRange;
    float halfAcross;
    if (aParam.x < 0.0) {
      alongRange = vec2(-1.1 * halfLength - pad, 1.1 * halfLength + pad);
      halfAcross = 1.1 * halfBeam + pad;
    } else {
      // Kelvin arms reach 0.354 * 2.4 * halfLength abeam at their tail.
      alongRange = vec2(-2.4 * halfLength - pad, 1.2 * halfLength + pad);
      halfAcross = max(0.85 * halfLength, 1.45 * halfBeam) + pad;
    }
    float along = mix(alongRange.x, alongRange.y, position.y + 0.5);
    float across = position.x * 2.0 * halfAcross;
    vLocal = vec2(along, across);
    vParam = aParam;
    vec2 world = aPos + aDir * along + side * across;
    gl_Position = vec4((world - uCenter) / uHalfSize, 0.0, 1.0);
  }
`;

const STAMP_FRAGMENT = /* glsl */ `
  uniform float uTexelWorld;
  varying vec2 vLocal;
  varying vec4 vParam;
  void main() {
    float halfLength = vParam.y;
    float halfBeam = vParam.z;
    float along = vLocal.x;
    float across = vLocal.y;
    // Evaluate the stamp footprint before the contact-only branch.
    float edge = max(0.04, uTexelWorld / max(halfBeam, 0.2));
    if (vParam.x < 0.0) {
      // B: a continuous full-core waterline bed, not a trail or a reflection.
      float r = length(vec2(along / max(halfLength, 0.3), across / max(halfBeam, 0.2)));
      gl_FragColor = vec4(0.0, 0.0, (1.0 - smoothstep(1.0 - min(edge, 0.45), 1.0 + edge * 0.25, r)) * -vParam.x, 0.0);
      return;
    }
    float strength = vParam.x;
    float beam2 = halfBeam * halfBeam;
    // R: a soft cushion at the stem...
    float bowAlong = along - 0.85 * halfLength;
    float bow = exp(-(bowAlong * bowAlong) / (0.09 * halfLength * halfLength) - (across * across) / (1.2 * beam2)) * 0.6;
    // ...churn under and just astern of the transom...
    float astern = -halfLength - along;
    float churn = exp(-(across * across) / (0.8 * beam2))
      * smoothstep(-0.35 * halfLength, 0.0, astern)
      * exp(-max(astern, 0.0) / (0.55 * halfLength)) * 0.8;
    // ...and short Kelvin arms (19.5 degrees) held to about one hull length.
    // Filter the narrow arms to the field texel without inflating their energy.
    float fromStem = halfLength - along;
    float armWidth = max(0.25, 0.9 * uTexelWorld);
    float armDelta = (abs(across) - 0.354 * fromStem) / armWidth;
    float arm = exp(-armDelta * armDelta)
      * smoothstep(0.6 * halfLength, 1.2 * halfLength, fromStem)
      * (1.0 - smoothstep(1.6 * halfLength, 2.4 * halfLength, fromStem)) * (0.075 / armWidth);
    float foam = clamp((bow + churn + arm) * strength, 0.0, 1.0);
    // G is historical: overlapping soft stamps trace only the path sailed.
    // No hard threshold or selected-only writer turns that path into a road.
    float laneHalfWidth = 1.1 * halfBeam * (0.6 + 0.4 * strength);
    float lane = (1.0 - smoothstep(0.2 * laneHalfWidth, 1.3 * laneHalfWidth + uTexelWorld, abs(across)))
      * smoothstep(-2.4 * halfLength, -1.6 * halfLength, along)
      * (1.0 - smoothstep(0.0, 0.4 * halfLength, along));
    gl_FragColor = vec4(foam, lane * vParam.w, 0.0, 0.0);
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
    type: HalfFloatType,
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

  const decayPass: WakeDecayPass = {
    decay: new Vector4(),
    diffuse: new Vector4(),
    floor: new Vector4(),
  };
  const decayClock: WakeDecayClock = { slickPendingSeconds: 0 };
  const feedbackMaterial = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    fragmentShader: FEEDBACK_FRAGMENT,
    uniforms: {
      uDecay: { value: decayPass.decay },
      uDiffuse: { value: decayPass.diffuse },
      uFloor: { value: decayPass.floor },
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
  const paramData = new Float32Array(WAKE_MAX_STAMPS * 4);
  const posAttribute = new InstancedBufferAttribute(posData, 2);
  const dirAttribute = new InstancedBufferAttribute(dirData, 2);
  const paramAttribute = new InstancedBufferAttribute(paramData, 4);
  posAttribute.setUsage(DynamicDrawUsage);
  dirAttribute.setUsage(DynamicDrawUsage);
  paramAttribute.setUsage(DynamicDrawUsage);
  stampGeometry.setAttribute("aPos", posAttribute);
  stampGeometry.setAttribute("aDir", dirAttribute);
  stampGeometry.setAttribute("aParam", paramAttribute);
  const stampMaterial = new ShaderMaterial({
    // MAX, not ADD: a hull writes the same field at 60 and 120 Hz, and two
    // overlapping hulls never double. (Blend factors are ignored by MAX.)
    blendDst: OneFactor,
    blendEquation: MaxEquation,
    blendEquationAlpha: MaxEquation,
    blendSrc: OneFactor,
    blending: CustomBlending,
    depthTest: false,
    depthWrite: false,
    fragmentShader: STAMP_FRAGMENT,
    // The quad maps plane x to the beam and y to the heading — a mirror of
    // the plane's winding — so front-face culling would drop every stamp.
    side: DoubleSide,
    uniforms: {
      uCenter: { value: { x: 0, y: 0 } },
      uHalfSize: { value: 96 },
      uTexelWorld: { value: 192 / WAKE_TEXTURE_SIZE },
    },
    vertexShader: STAMP_VERTEX,
  });
  const stampMesh = new InstancedMesh(stampGeometry, stampMaterial, WAKE_MAX_STAMPS);
  stampMesh.count = 0;
  stampMesh.frustumCulled = false;

  offscreenScene.add(feedbackQuad, stampMesh);

  let window_: WakeWindow = { centerX: 0, centerY: 0, halfSize: 96 };
  let stampCount = 0;
  // Wake (R/G-bearing) stamps queued since the last pass.
  let wakeStampCount = 0;
  // Seconds since a wake stamp last landed; past the slick horizon the R and
  // G channels are provably zero.
  let secondsSinceWake = Number.POSITIVE_INFINITY;
  // sleeping = the field is empty and the passes are skipped; hasWindow = the
  // window anchor is established (so the reset policy can see pans).
  let sleeping = true;
  let hasWindow = false;
  let targetsAreClear = false;
  let wasReducedMotion = false;
  // Reduced motion: what the field last drew (stamp data, count, window), so a
  // still fleet costs no offscreen pass at all.
  const staticContactData = new Float32Array(WAKE_MAX_STAMPS * 8);
  let staticContactCount = -1;
  const staticContactWindow: WakeWindow = { centerX: Number.NaN, centerY: Number.NaN, halfSize: Number.NaN };
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

  const sleep = (window: WakeWindow) => {
    front = firstTarget;
    back = secondTarget;
    window_ = window;
    stampCount = 0;
    wakeStampCount = 0;
    secondsSinceWake = Number.POSITIVE_INFINITY;
    decayClock.slickPendingSeconds = 0;
    sleeping = true;
  };

  const resetField = (window: WakeWindow) => {
    if (!targetsAreClear) clearTargets();
    sleep(window);
  };

  const writeStamp = (
    worldX: number,
    worldZ: number,
    headingX: number,
    headingY: number,
    signedStrength: number,
    halfLength: number,
    halfBeam: number,
    slick: number,
  ): boolean => {
    if (stampCount >= WAKE_MAX_STAMPS) return false;
    // Wake space: x = worldX, y = -worldZ (the water plane's -90° X rotation).
    const x = worldX;
    const y = -worldZ;
    // Hulls outside the window (plus the stamp's own reach) cannot
    // contribute — the stamp would clip to nothing anyway.
    const margin = window_.halfSize * 1.05 + halfLength * 2.5;
    if (Math.abs(x - window_.centerX) > margin || Math.abs(y - window_.centerY) > margin) {
      return false;
    }
    const length = Math.hypot(headingX, headingY);
    if (!(length > 1e-6)) return false;
    const i = stampCount * 2;
    posData[i] = x;
    posData[i + 1] = y;
    dirData[i] = headingX / length;
    dirData[i + 1] = -headingY / length;
    const p = stampCount * 4;
    paramData[p] = signedStrength;
    paramData[p + 1] = halfLength;
    paramData[p + 2] = halfBeam;
    paramData[p + 3] = slick;
    stampCount += 1;
    return true;
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
      return !sleeping;
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
      staticContactCount = -1;
    },
    stamp(worldX, worldZ, headingX, headingY, foam, halfLength, halfBeam, slick = 0) {
      if (wasReducedMotion) return;
      const strength = MathUtils.clamp(foam, 0, 1);
      const lane = MathUtils.clamp(slick, 0, 1);
      if (strength <= 0 && lane <= 0) return;
      const length = Math.min(14, Math.max(0.3, halfLength));
      const beam = Math.min(5, Math.max(0.2, halfBeam ?? length * 0.4));
      // A positive x marks the wake kind even when only the lane is laid.
      if (writeStamp(worldX, worldZ, headingX, headingY, Math.max(strength, 1e-4), length, beam, lane)) {
        wakeStampCount += 1;
      }
    },
    stampContact(worldX, worldZ, headingX, headingY, halfLength, halfBeam, strength) {
      const value = MathUtils.clamp(strength, 0, 1);
      if (value <= 0) return;
      writeStamp(
        worldX,
        worldZ,
        headingX,
        headingY,
        -value,
        Math.min(14, Math.max(0.3, halfLength)),
        Math.min(5, Math.max(0.2, halfBeam)),
        0,
      );
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
        if (!wasReducedMotion) {
          resetField(planned.window);
          staticContactCount = -1;
        } else {
          // The field holds the last static contact; `renderStaticContact`
          // redraws it only if the footprints or the window changed.
          window_ = planned.window;
        }
        wasReducedMotion = true;
        stampCount = 0;
        wakeStampCount = 0;
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
        wakeStampCount = 0;
        if ((frame.visibleStrength ?? 0) <= WAKE_VISIBLE_EPSILON) {
          resetField(planned.window);
        }
        return;
      }
      const dt = Math.min(0.25, Math.max(0, frame.deltaSeconds));
      secondsSinceWake = wakeStampCount > 0 ? 0 : secondsSinceWake + dt;
      if (stampCount === 0 && secondsSinceWake > WAKE_SLICK_HORIZON_SECONDS) {
        // Provably empty (R and G past their horizons; B is only ever last
        // frame's): clear once and skip both passes until a stamp arrives.
        resetField(planned.window);
        return;
      }
      sleeping = false;
      const feedback = feedbackMaterial.uniforms;
      feedback.uPrev.value = front.texture;
      // Shift in UV: a world point lands (C_new - C_prev)/(2*halfSize) away.
      feedback.uShift.value.x = (planned.window.centerX - window_.centerX) / (2 * window_.halfSize);
      feedback.uShift.value.y = (planned.window.centerY - window_.centerY) / (2 * window_.halfSize);
      feedback.uUvScale.value = planned.window.halfSize / window_.halfSize;
      planWakeDecayPass(decayClock, dt, decayPass);
      window_ = planned.window;
      const stamps = stampMaterial.uniforms;
      stamps.uCenter.value.x = window_.centerX;
      stamps.uCenter.value.y = window_.centerY;
      stamps.uHalfSize.value = window_.halfSize;
      stamps.uTexelWorld.value = (2 * window_.halfSize) / WAKE_TEXTURE_SIZE;
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
      // The stamp pass max-blends into the feedback result without clearing it.
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
      stampCount = 0;
      wakeStampCount = 0;
    },
    renderStaticContact() {
      if (disposed || !wasReducedMotion) return;
      // Only contact stamps arrive under reduced motion (the ship loop lays
      // no wakes). Skip everything when this frame's footprints and window
      // match what the field already holds.
      let changed = stampCount !== staticContactCount
        || window_.centerX !== staticContactWindow.centerX
        || window_.centerY !== staticContactWindow.centerY
        || window_.halfSize !== staticContactWindow.halfSize;
      for (let index = 0; index < stampCount && !changed; index += 1) {
        const d = index * 8;
        changed = staticContactData[d] !== posData[index * 2]
          || staticContactData[d + 1] !== posData[index * 2 + 1]
          || staticContactData[d + 2] !== dirData[index * 2]
          || staticContactData[d + 3] !== dirData[index * 2 + 1]
          || staticContactData[d + 4] !== paramData[index * 4]
          || staticContactData[d + 5] !== paramData[index * 4 + 1]
          || staticContactData[d + 6] !== paramData[index * 4 + 2]
          || staticContactData[d + 7] !== paramData[index * 4 + 3];
      }
      if (!changed) {
        stampCount = 0;
        return;
      }
      for (let index = 0; index < stampCount; index += 1) {
        const d = index * 8;
        staticContactData[d] = posData[index * 2]!;
        staticContactData[d + 1] = posData[index * 2 + 1]!;
        staticContactData[d + 2] = dirData[index * 2]!;
        staticContactData[d + 3] = dirData[index * 2 + 1]!;
        staticContactData[d + 4] = paramData[index * 4]!;
        staticContactData[d + 5] = paramData[index * 4 + 1]!;
        staticContactData[d + 6] = paramData[index * 4 + 2]!;
        staticContactData[d + 7] = paramData[index * 4 + 3]!;
      }
      staticContactCount = stampCount;
      staticContactWindow.centerX = window_.centerX;
      staticContactWindow.centerY = window_.centerY;
      staticContactWindow.halfSize = window_.halfSize;
      if (!targetsAreClear) clearTargets();
      if (stampCount === 0) return;
      const stamps = stampMaterial.uniforms;
      stamps.uCenter.value.x = window_.centerX;
      stamps.uCenter.value.y = window_.centerY;
      stamps.uHalfSize.value = window_.halfSize;
      stamps.uTexelWorld.value = (2 * window_.halfSize) / WAKE_TEXTURE_SIZE;
      stampMesh.count = stampCount;
      posAttribute.needsUpdate = true;
      dirAttribute.needsUpdate = true;
      paramAttribute.needsUpdate = true;
      const previousTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      renderer.setRenderTarget(front);
      feedbackQuad.visible = false;
      stampMesh.visible = true;
      renderer.autoClear = false;
      renderer.render(offscreenScene, offscreenCamera);
      feedbackQuad.visible = true;
      stampMesh.visible = false;
      renderer.autoClear = previousAutoClear;
      renderer.setRenderTarget(previousTarget);
      targetsAreClear = false;
      stampCount = 0;
      wakeStampCount = 0;
    },
  };
}
