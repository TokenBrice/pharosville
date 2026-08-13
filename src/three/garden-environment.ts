import {
  CubeCamera,
  LightProbe,
  LinearSRGBColorSpace,
  Mesh,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SphericalHarmonics3,
  UnsignedByteType,
  WebGLCubeRenderTarget,
  type ShaderMaterial,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { LightProbeGenerator } from "three/examples/jsm/lights/LightProbeGenerator.js";
import type { DayCyclePhase } from "./garden-day-cycle";

/**
 * W6.5 — image-based lighting from the world's own sky.
 *
 * Until now every `MeshStandardMaterial` in PharosVille was lit by three
 * analytic lights and nothing else. That is fine for matte stone and canvas and
 * it is actively wrong for METAL: a metal surface has no diffuse response at
 * all, so its entire appearance is a reflection of its surroundings, and with no
 * environment to reflect the renderer had nothing to give it. The Pharos statue's
 * bronze-gilt, the harbour lanterns, the iron on the pilings and every hull's
 * trim were reading as flat dark shapes that only came alive where an emissive
 * term had been added by hand to compensate.
 *
 * This bakes a PMREM probe from the SAME sky dome the camera sees, so those
 * surfaces reflect the actual sky of the actual hour — cool indigo-teal at noon,
 * the ember west band at dusk, near-black with a moon at night.
 *
 * ## Why it is baked from a shared material, not a copy of the colours
 *
 * `createGardenEnvironment` hangs a unit sphere on `garden-sky`'s own dome
 * material instance. The dome's uniforms are written once per frame by
 * `GardenSky.update`, and this probe renders those same uniform objects, so the
 * probe and the visible sky are the same picture by construction. Re-deriving
 * the gradient in JavaScript would have produced a second copy of the sky's
 * colour law to keep in step with the shader by hand, and it would have drifted.
 *
 * ## Why it is not per frame
 *
 * A PMREM bake allocates a render target and runs a six-face cube render plus a
 * roughness mip chain. Doing that every frame would leak a render target per
 * frame and cost more than everything it improves. So the probe is CACHED
 * against a quantised day-cycle key and rebaked only when that key moves — in
 * ordinary use, when the visitor's wall clock crosses a step, which is a handful
 * of times an hour. W1.5 adds a real-time floor and a load gate on top of that
 * key, so a time-control drag — which walks every key a day contains in the two
 * seconds the gesture lasts — costs two or three bakes rather than forty-one,
 * and an ordinary bake waits for a frame that can spare it.
 *
 * The previous target is disposed only once its replacement is committed, so a
 * throwing bake leaves the world lit rather than dropping the metal to black.
 * Two are live for the handful of frames a new bake is HELD waiting for its
 * harmonic (below), and never more than two.
 *
 * `bakeCount` is exposed so a test can assert that a run of frames at a steady
 * hour bakes once and not once per frame.
 *
 * ## W1.5 — why a cached probe alone made dawn SNAP
 *
 * A cached probe is the right cost decision and the wrong LOOK decision on its
 * own, because the cache key is quantised: the sky the metals reflect held
 * still for a whole step and then jumped a whole step at once. Everything else
 * in the day cycle is continuous — `updateDayCycle` blends the hemisphere,
 * ambient and key light off the RAW phase every frame — so the probe was the
 * one ambient term in the world that moved in stairs. Dawn snapped instead of
 * blooming.
 *
 * The fix is not to bake more often. It is to separate the two halves of what
 * `Scene.environment` contributes and treat them differently:
 *
 * - the DIFFUSE half is nine numbers, and nine numbers can be interpolated for
 *   free. A `LightProbe` carries the difference between the smooth ambient the
 *   frame wants and the stepped ambient the baked probe is actually supplying,
 *   so the diffuse term is continuous THROUGH the swap by construction.
 * - the SPECULAR half is a cube texture and cannot be cross-dissolved without a
 *   second sampler in every material. What it gets instead is a short dip in
 *   `environmentIntensity` timed on the swap, so the discontinuity lands at the
 *   moment the term is weakest, then eases back.
 *
 * ## Why the light probe cannot double-brighten the frame
 *
 * The probe is a DIFFERENTIAL, not a second ambient source:
 *
 *     probe.sh = smoothSH * I0 - bakedSH * I(t)
 *
 * where `bakedSH` is the spherical harmonic of the cube the live PMREM was
 * built from, `smoothSH` eases from the previous bake's harmonic to it, `I0` is
 * `GARDEN_ENVIRONMENT_INTENSITY` and `I(t)` is the live (possibly dipped)
 * `Scene.environmentIntensity`. The environment's own diffuse contribution is
 * `bakedSH * I(t)`, so the two sum to `smoothSH * I0` — exactly one ambient
 * term, at exactly the strength the calibration table below settled on.
 *
 * At rest `smoothSH === bakedSH` and `I(t) === I0`, so every coefficient is
 * algebraically zero and the probe contributes NOTHING. The per-phase ambient
 * energy of a steady frame is therefore bit-identical to the frame before this
 * change; the probe only exists during the second or two after a swap. That is
 * the whole answer to "does this re-brighten a phase" — it cannot, because the
 * only frames it touches are the ones between two states it is interpolating.
 *
 * ## Why the harmonic is read back asynchronously
 *
 * `LightProbeGenerator` needs the cube's pixels on the CPU. The synchronous
 * `readRenderTargetPixels` would stall the pipeline mid-frame; the async form
 * fences and polls, so the six faces land a handful of frames later. That
 * latency is invisible for an ambient term and it is why a new bake is HELD
 * rather than swapped on arrival: swapping the texture before its harmonic
 * exists would step the diffuse uncompensated, which is the bug being fixed. If
 * the readback never lands (`GARDEN_ENVIRONMENT_SH_DEADLINE_SECONDS`) or throws,
 * the probe is zeroed and the module degrades to exactly its pre-W1.5 behaviour
 * rather than to a dark frame — never to a dark one, which is the property the
 * failure arms are written around.
 *
 * ## Why the intensity is low, and why it is not a grade knob
 *
 * `Scene.environment` adds BOTH diffuse irradiance and specular reflection, and
 * the diffuse half double-counts the `HemisphereLight` that already approximates
 * sky fill. Run at full strength it re-washes the noon frame, which is precisely
 * the calibration the Lantern Sea release pinned down. So the probe runs at a
 * deliberately low intensity chosen against a measured frame: enough that rough
 * surfaces barely move while metals — which had NO specular source at all — gain
 * a real one. It is a lighting term, and it is emphatically not a substitute for
 * re-tuning exposure, tone mapping or the colour grade, none of which this
 * module touches.
 */

/**
 * Strength of the probe's contribution, as `Scene.environmentIntensity`.
 *
 * Measured on the real GPU (`npm run preview --reduced`, 1600x1000, the
 * noon/dusk/night triptych), as mean frame luminance against the same frame with
 * the probe contributing nothing:
 *
 * | intensity | noon    | night   | clipped |
 * |-----------|---------|---------|---------|
 * | 0.0       | 101.45  |  82.00  | 0.000%  |
 * | 0.3       | 101.63  |  82.14  | 0.000%  |
 * | 0.6       | 102.34  |  82.28  | 0.000%  |
 * | 1.0       | 102.56  |  82.45  | 0.000%  |
 * | 8.0       | 105.73  |    —    | 0.000%  |
 *
 * So the probe does NOT re-wash the frame: even at 1.0 the noon mean moves
 * ~1.1%, and an absurd 8.0 — twenty-six times what ships — moves it 4.2% without
 * clipping a single pixel. Two things explain the small numbers. Most of this
 * frame is sea and sky, both of which are `ShaderMaterial` and cannot see an
 * environment at all; and AgX has a long shoulder that compresses what is left.
 *
 * 0.6 is chosen for headroom on both sides: comfortably inside the range that
 * measured clean, and high enough to actually reach the metal, which is the
 * entire point — a `metalness: 1` surface has no diffuse term, so before this it
 * had NO specular source and rendered as flat dark shape.
 *
 * The exact strength past this point is a LOOK call, not a calibration one, and
 * it belongs to the operator on their own screen. What is settled by the table
 * above is only that no value in it forces the grade, the exposure or the tone
 * mapping to move — and none of those is touched here.
 */
export const GARDEN_ENVIRONMENT_INTENSITY = 0.6;

/**
 * Quantisation of the day-cycle blend, per axis, for the cache key.
 *
 * Ten steps puts a rebake roughly every 7 minutes of the real dawn and dusk
 * ramps and never during the long flat middle of day or night. It also bounds
 * the worst case — dragging the time control across a whole day — to a few dozen
 * bakes spread over the drag rather than one per frame, because the key can only
 * change as fast as the quantised blend does.
 */
const PHASE_STEPS = 10;
const STORM_STEPS = 4;
// The weather plan breathes a steady storm by up to 5%. A 6-point dead band
// keeps that authored motion from crossing a PMREM key boundary twice per
// cycle while still allowing a real risk-state rise/fall to rebake the probe.
const STORM_BAND_HYSTERESIS = 0.06;

/**
 * Radius of the probe sphere. The dome shader takes its direction from
 * `normalize(position)`, so the radius is arbitrary; a unit sphere just keeps it
 * comfortably inside the cube camera's default near/far without any thought.
 */
const PROBE_RADIUS = 1;

/**
 * Face size of the harmonic cube.
 *
 * Nine coefficients cannot hold more than the lowest frequencies of a sky, so
 * resolution past a couple of dozen pixels a face buys nothing but readback
 * bytes. 16 is 1.5 KB a face and 1,536 texels of projection arithmetic for the
 * whole cube — small enough to sit inside the episodic bake slot without
 * showing up next to the PMREM mip chain it shares that slot with.
 */
const SH_CUBE_SIZE = 16;

/**
 * How long the ambient takes to walk from the previous bake's sky to the new
 * one, as an exponential time constant.
 *
 * This is the number that turns the step into a bloom, so it wants to be long
 * enough to read as motion rather than as a cut — about four time constants, so
 * ~3.5 s of settle. Much longer and a visitor dragging the time control would
 * watch the light trail the sky it is coming from; much shorter and it is the
 * snap this exists to remove.
 */
const SH_DRIFT_TAU_SECONDS = 0.9;

/**
 * The specular half's landing, as a time constant and a depth.
 *
 * The cube texture swaps in one frame — there is no second environment sampler
 * to cross-dissolve against, and adding one to every material in the world to
 * soften an adjacent pair of quantisation steps is not a trade worth making. So
 * the swap is timed to land where the term is weakest instead: intensity drops
 * by `SWAP_DIP` at the instant of the swap, which scales the discontinuity the
 * metals see by the same fraction, then recovers.
 *
 * Deliberately much faster than the diffuse drift. The dip is a modulation of
 * the whole environment term, so a slow one would be its own artefact — metals
 * visibly dulling for seconds — and would trade a small step for a large ramp.
 * At 0.22 s it is over inside ~0.7 s, which is a landing rather than a blink.
 *
 * The diffuse half does not care either way: the differential probe is written
 * against the LIVE intensity, so it cancels the dip exactly.
 */
const SWAP_DIP_TAU_SECONDS = 0.22;
const SWAP_DIP = 0.3;

/** Below this, an easing scalar is snapped to zero so "at rest" is exact. */
const DRIFT_EPSILON = 0.002;

/**
 * Real seconds a bake must wait behind the previous one.
 *
 * The quantised key already bounds the WALL-CLOCK case to a handful of bakes an
 * hour. What it does not bound is a visitor dragging the time control, which
 * walks all 41 distinct keys of a day in the couple of seconds the drag takes —
 * 41 PMREM bakes and 41 cube readbacks inside a gesture, which is the one input
 * in the app that most wants the frame budget left alone. A real-time floor
 * turns that into two or three bakes, and because the wanted key is always the
 * LATEST one, the drag still lands on the right sky.
 */
export const GARDEN_ENVIRONMENT_MIN_BAKE_SECONDS = 1.5;

/**
 * How long a wanted bake may be deferred waiting for a quiet frame.
 *
 * Deferring to an idle or low-load frame is a courtesy, not a contract: a
 * machine that never leaves `recovery` must still eventually light its metals
 * with the right sky. Six seconds is long enough to skip a burst of pressure
 * and short enough that nobody watches the wrong sky reflected in the bronze.
 */
export const GARDEN_ENVIRONMENT_MAX_DEFER_SECONDS = 6;

/**
 * How long a held bake waits for its harmonic before swapping without one.
 *
 * The async readback normally lands within a few frames. If it does not — a
 * throttled background tab, a driver that refuses the format — the new sky must
 * still reach the frame. Swapping uncompensated costs one step, which is what
 * the world did before W1.5; never swapping would strand the metals on a stale
 * sky indefinitely, which is worse.
 */
export const GARDEN_ENVIRONMENT_SH_DEADLINE_SECONDS = 2;

export interface GardenEnvironmentUpdateOptions {
  /**
   * Real seconds since the previous update. Drives the swap easing and the bake
   * cadence. Absent (or zero) the easing holds still, which is what a caller
   * with no clock should get rather than a jump.
   */
  deltaSeconds?: number;
  /**
   * Whether this frame can afford an episodic bake — an idle frame, or one the
   * load ladder reads as healthy. Deferring is bounded by
   * `GARDEN_ENVIRONMENT_MAX_DEFER_SECONDS`, so a permanently loaded machine
   * still rebakes. Defaults to `true`: a caller that says nothing keeps the
   * pre-W1.5 "bake when the key moves" behaviour.
   */
  bakeAllowed?: boolean;
  /**
   * The reduced-motion still frame. There is no later frame to defer to and no
   * time over which to ease, so the bake happens now and the swap is instant —
   * the composition must be complete and settled the moment it is drawn.
   */
  reducedMotion?: boolean;
}

export interface GardenEnvironment {
  /** Bakes so far. Test evidence that the probe is cached, not per frame. */
  readonly bakeCount: number;
  dispose(): void;
  /**
   * Rebakes only when the quantised phase has moved. Safe to call every frame.
   * `stormLevel` (Phase 2) joins the key, coarsely quantised: the dome it
   * bakes from is storm-graded, so the light the world is lit by must not lag
   * the sky it is seen against when a storm arrives.
   *
   * W1.5: also advances the per-frame ambient easing, which is nine vector
   * lerps and one scalar — free, and the reason this is safe to call on every
   * frame including the ones that do not bake.
   */
  update(
    phase: DayCyclePhase,
    stormLevel?: number,
    options?: GardenEnvironmentUpdateOptions,
  ): void;
}

/**
 * Whether this frame should spend a bake, given what the last one cost.
 *
 * Pure so the cadence — the part that decides whether a time-control drag costs
 * three bakes or forty — is testable without a GL context.
 */
export function shouldBakeGardenEnvironment(input: {
  /** A bake is already baked and waiting for its harmonic. */
  bakePending: boolean;
  /** Something is already lit by a probe. The first bake can never wait. */
  hasProbe: boolean;
  /** The quantised key wants a sky the live probe does not have. */
  keyChanged: boolean;
  /** This frame can afford the work (idle, or a healthy load tier). */
  lowLoad: boolean;
  reducedMotion: boolean;
  secondsSinceBake: number;
  /** How long the wanted key has been waiting for a frame that would take it. */
  wantedSeconds: number;
}): boolean {
  if (!input.keyChanged) return false;
  if (input.bakePending) return false;
  // Nothing is lit yet, or this is the single frame reduced motion will ever
  // draw. Either way there is no later frame to defer to.
  if (!input.hasProbe || input.reducedMotion) return true;
  if (input.secondsSinceBake < GARDEN_ENVIRONMENT_MIN_BAKE_SECONDS) return false;
  return input.lowLoad || input.wantedSeconds >= GARDEN_ENVIRONMENT_MAX_DEFER_SECONDS;
}

/** One step of an exponential settle, snapped to an exact rest at the end. */
export function advanceGardenEnvironmentDrift(
  drift: number,
  deltaSeconds: number,
  tauSeconds: number,
  reducedMotion = false,
): number {
  // The still frame is drawn once, settled: there is no second frame in which
  // to finish an ease, so there is nothing to be part-way through.
  if (reducedMotion) return 0;
  if (!(drift > 0)) return 0;
  const step = Math.max(0, Math.min(0.25, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
  const next = drift * Math.exp(-step / tauSeconds);
  return next < DRIFT_EPSILON ? 0 : next;
}

export function gardenEnvironmentDriftTaus(): { sh: number; swap: number } {
  return { sh: SH_DRIFT_TAU_SECONDS, swap: SWAP_DIP_TAU_SECONDS };
}

/**
 * `Scene.environmentIntensity` for a swap that is `swapDrift` of the way from
 * "just swapped" (1) back to rest (0).
 */
export function gardenEnvironmentIntensityForSwap(swapDrift: number): number {
  const drift = Math.max(0, Math.min(1, swapDrift));
  return GARDEN_ENVIRONMENT_INTENSITY * (1 - SWAP_DIP * drift);
}

/**
 * The differential the light probe carries, written in place.
 *
 * `out = (baked + (previous - baked) * shDrift) * I0 - baked * environmentIntensity`
 *
 * The first term is the smooth ambient the frame wants; the second is what the
 * live PMREM is already supplying. Their sum — which is what a material
 * actually sees — is the smooth term alone, so no phase gains energy and the
 * swap is invisible to the diffuse half. At rest (`shDrift === 0` and
 * `environmentIntensity === GARDEN_ENVIRONMENT_INTENSITY`) every coefficient is
 * exactly zero.
 *
 * Writes into `out`'s existing vectors; allocates nothing.
 */
export function writeGardenEnvironmentProbeSH(
  out: SphericalHarmonics3,
  previous: SphericalHarmonics3,
  baked: SphericalHarmonics3,
  shDrift: number,
  environmentIntensity: number,
): void {
  const outCoefficients = out.coefficients;
  const previousCoefficients = previous.coefficients;
  const bakedCoefficients = baked.coefficients;
  const drift = Math.max(0, Math.min(1, shDrift));
  for (let index = 0; index < 9; index += 1) {
    const target = outCoefficients[index]!;
    const from = previousCoefficients[index]!;
    const to = bakedCoefficients[index]!;
    target.x = (to.x + (from.x - to.x) * drift) * GARDEN_ENVIRONMENT_INTENSITY
      - to.x * environmentIntensity;
    target.y = (to.y + (from.y - to.y) * drift) * GARDEN_ENVIRONMENT_INTENSITY
      - to.y * environmentIntensity;
    target.z = (to.z + (from.z - to.z) * drift) * GARDEN_ENVIRONMENT_INTENSITY
      - to.z * environmentIntensity;
  }
}

/**
 * The cache key: the day-cycle blend, quantised.
 *
 * Keyed on `daylight` and `dusk` rather than on the clock hour because those two
 * are what the dome's uniforms are actually derived from — two hours that blend
 * to the same sky should share a bake, and an hour control that moves without
 * changing the sky should not cause one.
 *
 * The public helper returns the direct key for deterministic lookup/tests. The
 * live environment additionally applies `resolveGardenEnvironmentStormBand`
 * hysteresis so a breathing storm cannot oscillate around a rounding edge.
 */
export function gardenEnvironmentPhaseKey(phase: DayCyclePhase, stormLevel = 0): string {
  const stormBand = Math.round(clamp01(stormLevel) * STORM_STEPS);
  return gardenEnvironmentPhaseBandKey(phase, stormBand);
}

export function resolveGardenEnvironmentStormBand(
  previousBand: number | null,
  stormLevel: number,
): number {
  const level = clamp01(stormLevel);
  if (previousBand === null) return Math.round(level * STORM_STEPS);
  let band = Math.max(0, Math.min(STORM_STEPS, Math.round(previousBand)));
  while (
    band < STORM_STEPS
    && level >= (band + 0.5) / STORM_STEPS + STORM_BAND_HYSTERESIS
  ) {
    band += 1;
  }
  while (
    band > 0
    && level <= (band - 0.5) / STORM_STEPS - STORM_BAND_HYSTERESIS
  ) {
    band -= 1;
  }
  return band;
}

function gardenEnvironmentPhaseBandKey(
  phase: DayCyclePhase,
  stormBand: number,
): string {
  const daylight = Math.round(Math.max(0, Math.min(1, phase.daylight)) * PHASE_STEPS);
  const dusk = Math.round(Math.max(0, Math.min(1, phase.dusk)) * PHASE_STEPS);
  return `${daylight}:${dusk}:${stormBand}`;
}

export function createGardenEnvironment(
  renderer: WebGLRenderer,
  scene: Scene,
  domeMaterial: ShaderMaterial,
): GardenEnvironment {
  const generator = new PMREMGenerator(renderer);
  // The probe's own scene. The dome material is SHARED with the visible sky and
  // is disposed by `garden-sky`; only this geometry belongs to this module.
  const probeScene = new Scene();
  const probeGeometry = new SphereGeometry(PROBE_RADIUS, 32, 16);
  const probeMesh = new Mesh(probeGeometry, domeMaterial);
  probeMesh.name = "garden-environment-probe";
  probeMesh.frustumCulled = false;
  probeScene.add(probeMesh);

  // The harmonic cube.
  //
  // Eight-bit, not the half-float PMREMGenerator renders the same dome into,
  // and deliberately: `readPixels` is only guaranteed to accept RGBA/UNSIGNED_
  // BYTE. Half-float reads are the driver's implementation-defined pair, which
  // is available on plenty of machines and is not a promise, and this readback
  // has no fallback path worth writing — a format one driver in ten refuses
  // would silently turn the ambient drift off for those visitors.
  //
  // The precision that costs is precision the result cannot use. Nine
  // coefficients of a difference that decays to zero within a couple of seconds
  // do not resolve a 1/255 quantisation of the sky, and at night — where the
  // linear values are smallest and the quantisation relatively worst — the sky
  // is near-black in both endpoints, so the absolute error is smaller still.
  // Tagged linear because the dome writes linear: it is a raw `ShaderMaterial`
  // with no colour-space conversion in it, which is exactly why the PMREM path
  // reads it linear too.
  const shCubeTarget = new WebGLCubeRenderTarget(SH_CUBE_SIZE, {
    type: UnsignedByteType,
    colorSpace: LinearSRGBColorSpace,
  });
  shCubeTarget.texture.name = "garden-environment-sh-cube";
  const shCubeCamera = new CubeCamera(0.1, 5, shCubeTarget);

  // The differential ambient. Added with zero coefficients so every material in
  // the world compiles with the light-probe term from the first frame — a probe
  // that appears later would recompile the whole scene mid-session.
  const lightProbe = new LightProbe();
  lightProbe.name = "garden-environment-light-probe";
  scene.add(lightProbe);

  // Preallocated: the per-frame path writes through these and allocates nothing.
  const bakedSH = new SphericalHarmonics3();
  const previousSH = new SphericalHarmonics3();

  let target: WebGLRenderTarget | null = null;
  let bakedKey: string | null = null;
  let stormBand: number | null = null;
  let bakeCount = 0;
  let disposed = false;

  // W1.5 easing + cadence state.
  let shDrift = 0;
  let swapDrift = 0;
  /** False until a harmonic for the LIVE probe has landed; zeroes the probe. */
  let shValid = false;
  let secondsSinceBake = Number.POSITIVE_INFINITY;
  let wantedSeconds = 0;
  let bakeSerial = 0;
  /** Serial of the bake whose harmonic is still being read back. */
  let awaitingSerial: number | null = null;
  let awaitedSH: SphericalHarmonics3 | null = null;
  let pending: {
    serial: number;
    target: WebGLRenderTarget;
    key: string;
    waitedSeconds: number;
  } | null = null;

  /**
   * Renders the dome into the harmonic cube and starts the async projection.
   *
   * Six small draws, inside the caller's episodic bake window, so they are
   * accounted against the bake and not against the frame's recurring work. The
   * readback itself is fenced and lands later; nothing here waits on it.
   */
  function requestHarmonic(serial: number): void {
    awaitingSerial = null;
    awaitedSH = null;
    try {
      shCubeCamera.update(renderer, probeScene);
    } catch {
      // A cube render that will not run is a driver problem, not a reason to
      // stop lighting the world. Leave the harmonic unclaimed: the caller
      // swaps without one and the probe stays zeroed — pre-W1.5 behaviour.
      return;
    }
    awaitingSerial = serial;
    void LightProbeGenerator.fromCubeRenderTarget(renderer, shCubeTarget)
      .then((generated) => {
        if (disposed || awaitingSerial !== serial) return;
        awaitedSH = generated.sh;
      })
      .catch(() => {
        if (awaitingSerial === serial) awaitingSerial = null;
      });
  }

  /**
   * Swaps the environment with no harmonic to hold the diffuse steady across
   * it, and zeroes the probe so the frame is exactly what it was before W1.5.
   * Used for the first bake of a session (nothing to interpolate from), for the
   * reduced-motion still frame (no later frame to ease in), and as the
   * readback's failure arm.
   */
  function swapImmediately(next: WebGLRenderTarget, key: string): void {
    // Dispose AFTER the swap is committed, so a throwing bake leaves the
    // previous probe lit rather than dropping the scene to unlit metal.
    const previousTarget = target;
    target = next;
    bakedKey = key;
    scene.environment = next.texture;
    previousTarget?.dispose();
    shValid = false;
    bakedSH.zero();
    previousSH.zero();
    shDrift = 0;
    swapDrift = 0;
  }

  /** The smooth arm: the harmonic exists, so the diffuse crosses continuously. */
  function swapWithHarmonic(next: WebGLRenderTarget, key: string, sh: SphericalHarmonics3): void {
    const previousTarget = target;
    target = next;
    bakedKey = key;
    scene.environment = next.texture;
    previousTarget?.dispose();
    previousSH.copy(bakedSH);
    bakedSH.copy(sh);
    shValid = true;
    // The ambient now reads the OLD sky and walks to the new one; the probe's
    // first written value cancels the swap exactly.
    shDrift = 1;
    swapDrift = 1;
  }

  return {
    get bakeCount() {
      return bakeCount;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.environment = null;
      scene.remove(lightProbe);
      pending?.target.dispose();
      pending = null;
      target?.dispose();
      target = null;
      shCubeTarget.dispose();
      probeGeometry.dispose();
      generator.dispose();
    },
    update(phase, stormLevel = 0, options) {
      if (disposed) return;
      const reducedMotion = options?.reducedMotion === true;
      const deltaSeconds = Math.max(
        0,
        Math.min(0.25, Number.isFinite(options?.deltaSeconds) ? options!.deltaSeconds! : 0),
      );
      secondsSinceBake += deltaSeconds;

      // 1. A harmonic that has landed. It belongs either to a held bake (commit
      //    it smoothly) or to a target already swapped in (adopt it, with the
      //    probe still at rest — adopting cannot change the frame).
      if (awaitingSerial !== null && awaitedSH !== null) {
        const landed = awaitedSH;
        awaitedSH = null;
        const serial = awaitingSerial;
        awaitingSerial = null;
        if (pending && pending.serial === serial) {
          swapWithHarmonic(pending.target, pending.key, landed);
          pending = null;
        } else if (!pending) {
          bakedSH.copy(landed);
          previousSH.copy(landed);
          shValid = true;
        }
      }

      // 2. A held bake whose harmonic never came. Swap uncompensated rather
      //    than reflect a sky that is hours stale.
      if (pending) {
        pending.waitedSeconds += deltaSeconds;
        if (
          reducedMotion
          || pending.waitedSeconds >= GARDEN_ENVIRONMENT_SH_DEADLINE_SECONDS
        ) {
          awaitingSerial = null;
          awaitedSH = null;
          swapImmediately(pending.target, pending.key);
          pending = null;
        }
      }

      // 3. The cadence.
      stormBand = resolveGardenEnvironmentStormBand(stormBand, stormLevel);
      const key = gardenEnvironmentPhaseBandKey(phase, stormBand);
      const keyChanged = key !== bakedKey && key !== pending?.key;
      wantedSeconds = keyChanged ? wantedSeconds + deltaSeconds : 0;
      if (shouldBakeGardenEnvironment({
        bakePending: pending !== null,
        hasProbe: target !== null,
        keyChanged,
        lowLoad: options?.bakeAllowed ?? true,
        reducedMotion,
        secondsSinceBake,
        wantedSeconds,
      })) {
        const serial = bakeSerial += 1;
        // Both pieces of GPU work sit here, inside the caller's episodic bake
        // window, so `renderer.info` attributes them to the bake.
        requestHarmonic(serial);
        const next = generator.fromScene(probeScene);
        bakeCount += 1;
        secondsSinceBake = 0;
        wantedSeconds = 0;
        // Hold the new probe only when holding it can buy something: a previous
        // sky to interpolate FROM (`shValid` — the live probe's own harmonic has
        // landed), a later frame to interpolate IN, and a harmonic actually on
        // its way for this bake. Otherwise swap now. Holding without `shValid`
        // would be worse than not holding at all: the differential would be
        // written against a zeroed "previous", which is not the old sky, it is
        // NO sky, and the diffuse would dip to black and climb back out.
        if (target === null || !shValid || reducedMotion || awaitingSerial !== serial) {
          swapImmediately(next, key);
        } else {
          pending = { key, serial, target: next, waitedSeconds: 0 };
        }
      }

      // 4. The per-frame easing. Nine vector lerps and two scalars.
      shDrift = advanceGardenEnvironmentDrift(shDrift, deltaSeconds, SH_DRIFT_TAU_SECONDS, reducedMotion);
      swapDrift = advanceGardenEnvironmentDrift(swapDrift, deltaSeconds, SWAP_DIP_TAU_SECONDS, reducedMotion);
      const intensity = gardenEnvironmentIntensityForSwap(swapDrift);
      scene.environmentIntensity = intensity;
      if (shValid) {
        writeGardenEnvironmentProbeSH(lightProbe.sh, previousSH, bakedSH, shDrift, intensity);
      } else {
        lightProbe.sh.zero();
      }
    },
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
