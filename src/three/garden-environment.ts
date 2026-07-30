import {
  Mesh,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  type ShaderMaterial,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
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
 * of times an hour. The previous target is disposed before the next is kept, so
 * exactly one is ever live.
 *
 * `bakeCount` is exposed so a test can assert that a run of frames at a steady
 * hour bakes once and not once per frame.
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

export interface GardenEnvironment {
  /** Bakes so far. Test evidence that the probe is cached, not per frame. */
  readonly bakeCount: number;
  dispose(): void;
  /**
   * Rebakes only when the quantised phase has moved. Safe to call every frame.
   * `stormLevel` (Phase 2) joins the key, coarsely quantised: the dome it
   * bakes from is storm-graded, so the light the world is lit by must not lag
   * the sky it is seen against when a storm arrives.
   */
  update(phase: DayCyclePhase, stormLevel?: number): void;
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
  const probe = new Mesh(probeGeometry, domeMaterial);
  probe.name = "garden-environment-probe";
  probe.frustumCulled = false;
  probeScene.add(probe);

  let target: WebGLRenderTarget | null = null;
  let bakedKey: string | null = null;
  let stormBand: number | null = null;
  let bakeCount = 0;
  let disposed = false;

  return {
    get bakeCount() {
      return bakeCount;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.environment = null;
      target?.dispose();
      target = null;
      probeGeometry.dispose();
      generator.dispose();
    },
    update(phase, stormLevel = 0) {
      if (disposed) return;
      stormBand = resolveGardenEnvironmentStormBand(stormBand, stormLevel);
      const key = gardenEnvironmentPhaseBandKey(phase, stormBand);
      if (key === bakedKey) return;
      const next = generator.fromScene(probeScene);
      // Dispose AFTER the new bake succeeds, so a throwing bake leaves the
      // previous probe lit rather than dropping the scene to unlit metal.
      target?.dispose();
      target = next;
      bakedKey = key;
      bakeCount += 1;
      scene.environment = next.texture;
      scene.environmentIntensity = GARDEN_ENVIRONMENT_INTENSITY;
    },
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
