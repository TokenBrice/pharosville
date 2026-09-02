import type { Color, DataTexture } from "three";
import { GARDEN_PLATE_MARGIN_TILES } from "../systems/projection";

/**
 * C2 — Water-shader interface contract (frozen in P0, 2026-07-24).
 *
 * This module is the binding SPEC for the Garden Sea water API. It is
 * type-only on purpose: Lane W owns `garden-water.ts` (single writer) and
 * implements everything described here; Lanes Z, I, and S consume these
 * surfaces and must never edit `garden-water.ts`.
 *
 * Day/dusk/night blend factors come from `dayCyclePhase` in
 * `garden-day-cycle.ts` (contract C1) — Lane W replaces the water module's
 * local curve copy with that import. All colors derive from
 * `HARBOR_PALETTE` in `src/systems/palette.ts`; no hex literals in
 * `garden-water.ts`.
 *
 * Tier policy (guardrails): cloud shadows + sun glitter ship at balanced+,
 * ripple rings at full/balanced; all motion freezes under reduced motion
 * (one static detailed frame, zero continuous RAF).
 */

/** Maximum simultaneous zone soft-tints the water shader supports. */
export const GARDEN_WATER_MAX_ZONE_TINTS = 6;

/** Maximum simultaneous karesansui ripple-ring emitters. */
export const GARDEN_WATER_MAX_RIPPLE_RINGS = 12;

/**
 * Wave 1 finite-plate contract.
 *
 * Water ends just beyond the outer tile centres. The margin gives displaced
 * vertices and the two authored sea openings room to disappear into the fog
 * seam without restoring a second, renderer-only "open ocean" domain.
 */
export const GARDEN_WATER_PLATE_MARGIN_TILES = GARDEN_PLATE_MARGIN_TILES;

/**
 * W2.6 — the feature-frozen sea's look constants.
 *
 * These are exported because future water work may refine an existing term,
 * but it may not quietly raise the sea's attention budget. `garden-water.ts`
 * interpolates these exact values into the shader source and the focused test
 * records the corresponding night-emissive ceiling.
 */
export const GARDEN_WATER_PROBE_ROUGHNESS = 0.4;
export const GARDEN_WATER_PROBE_BLEND = 0.82;
export const GARDEN_WATER_GLINT_NORMAL_FILTER_GAIN = 18;
export const GARDEN_WATER_CREST_FOAM = Object.freeze({
  /** `-J + bias` is positive only where the horizontal wave field folds. */
  jacobianBias: 1,
  jacobianStart: 0.00042,
  jacobianEnd: 0.00078,
  noiseGate: 0.56,
  maxMix: 0.055,
});
export const GARDEN_WATER_SHORE_FOAM = Object.freeze({
  /** Normalised SDF units; about 0.2 world units on the island's long axis. */
  breathAmplitude: 0.009,
  lineCore: 0.01,
  lineFeather: 0.038,
  maxMix: 0.18,
});

/**
 * Proxy for mean additive/mixed luminance over the representative OPEN-NIGHT
 * water mask. A true render assertion would be GPU/grade dependent, so this
 * deliberately tests the shader's authored light budget instead:
 *
 * - each gain is the exact GLSL constant used by the water material;
 * - each occupancy is the recorded fraction of the open-water mask that term
 *   is allowed to cover in the quiet composition;
 * - colours are conservatively treated as unit luminance.
 *
 * It does not claim to measure final post-AgX pixels. It prevents a future
 * one-line gain change from turning the open night sea into an emissive field
 * without moving the explicit recorded ceiling at the same time.
 */
export const GARDEN_WATER_NIGHT_EMISSIVE_BUDGET = Object.freeze({
  moonRoadGain: 0.06,
  moonRoadOccupancy: 0.08,
  moonGlitterGain: 2.6,
  moonGlitterOccupancy: 0.002,
  laneClamp: 2.2,
  laneOccupancy: 0.0025,
  maxMeanLuminance: 0.016,
});

export function gardenWaterOpenNightMeanEmissiveBudget(): number {
  const budget = GARDEN_WATER_NIGHT_EMISSIVE_BUDGET;
  return budget.moonRoadGain * budget.moonRoadOccupancy
    + budget.moonGlitterGain * budget.moonGlitterOccupancy
    + budget.laneClamp * budget.laneOccupancy;
}

/**
 * (a) Zone soft-tint uniform path — consumed by Lane Z's data.
 *
 * Lane Z supplies positions/radii/colors only (from `risk-water-areas.ts`
 * via `garden-zones.ts`); Lane W maps them onto the shader's zone uniform
 * array (`uZoneEllipse`/`uZoneTint` today). Z3 replaces the hard ellipse
 * with a smoothstep soft-edged band and day-harmonized, luminance-matched
 * colors — the uniform path below is the stable surface either way.
 */
export interface GardenWaterZoneTint {
  /** Zone center in world XZ (Three units; TILE_SCALE from garden-util). */
  center: { x: number; z: number };
  /** Day-harmonized band color, derived from HARBOR_PALETTE by Lane Z. */
  color: Color;
  /** Ellipse radii in world units (Z2: ~8–14, count→radius stays monotonic). */
  radiusX: number;
  radiusZ: number;
  /** Soft-band opacity 0–1; the shader smooths the perimeter falloff. */
  strength: number;
  /**
   * W2 / D5: which sea region slot this band colours. The rendered geometry
   * now comes from the terrain-derived region field, not from the ellipse
   * above — `center`/`radius*` survive only for the DOM label anchor and the
   * selection cue, which still want a representative point and extent.
   */
  regionId?: number;
}

/**
 * (b) Harbor-calm mask extents — supplied by Lane I (I2 mirror basin),
 * implemented by Lane W. Inside this ellipse the water suppresses normal
 * scroll + swell amplitude and boosts the sky env tint so the harbor reads
 * as a still mirror against the open sea's motion.
 */
export interface GardenHarborCalmMask {
  /** Harbor basin center in world XZ. */
  center: { x: number; z: number };
  /** Calm-region radii in world units; feathered at the edge. */
  radiusX: number;
  radiusZ: number;
  /** 0–1: how strongly motion is suppressed inside the mask. */
  calmStrength: number;
}

/**
 * (c) Shared cloud-shadow sampler — owned by Lane W (W4), applied by
 * Lane I (island materials, I3) and Lane S (ship materials). One noise
 * texture scrolled in world-XZ; every consumer samples the SAME texture
 * with the SAME mapping so light weather drifts coherently across water,
 * land, and ships. Also modulates the W3 sun glitter (sun-dappled patches).
 */
export interface GardenCloudShadowSource {
  /** Repeat-wrapped cloud-noise texture (single channel is enough). */
  texture: DataTexture;
  /**
   * Uniform block shared with every consuming material:
   * - `uCloudShadow`: the texture above.
   * - `uCloudShadowTransform`: (scaleX, scaleZ, offsetX, offsetZ) mapping
   *   world XZ → texture UV. Lane W advances the offsets per frame
   *   (frozen under reduced motion); consumers never write it.
   * - `uCloudShadowStrength`: 0–1 light-term attenuation at full cover.
   */
  uniforms: {
    uCloudShadow: { value: DataTexture };
    uCloudShadowTransform: { value: [number, number, number, number] };
    uCloudShadowStrength: { value: number };
  };
  /**
   * Advances drift; gated to balanced+ tiers, frozen under reduced motion.
   * `wind` (Phase 2 weather system) steers the drift direction and speed;
   * absent, the sea's historical east-southeast drift holds.
   */
  update: (frame: {
    reducedMotion: boolean;
    tier: string;
    timeSeconds: number;
    wind?: { windDirX: number; windDirZ: number; windSpeed: number; stormLevel: number };
  }) => void;
}

/**
 * (d) Ripple-ring emitter API — karesansui rings (W5). Lane Z5 registers
 * islets, Lane S registers moored/slow ships (S7 grounding), Lane I may
 * register dock pylons. Lane W owns the SDF ring rendering inside the water
 * shader and the per-tier ring budget; the existing lapping shore foam
 * stays inside the innermost island ring.
 */
export interface GardenRippleRingEmitter {
  /**
   * Registers (or updates, by `id`) a ring source. `bands` is 2–3
   * phase-offset concentric rings; `periodSeconds` is the expansion cycle.
   */
  setRing: (ring: {
    id: string;
    center: { x: number; z: number };
    /** Outer radius of the ring train in world units. */
    radius: number;
    bands: 2 | 3;
    periodSeconds: number;
    /** 0–1 ring contrast; keep low — calm, on-theme. */
    strength: number;
  }) => void;
  removeRing: (id: string) => void;
  /** Live emitter count; surfaced via `__pharosVilleDebug` (contract C4). */
  ringCount: () => number;
}
