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
 * Tier policy (guardrails): sun glitter ships at balanced+, ripple rings at
 * full/balanced; cloud-shadow strength stays 0 until the sky draws clouds
 * overhead; all motion freezes under reduced motion (one static detailed
 * frame, zero continuous RAF).
 */

/** Maximum simultaneous zone soft-tints the water shader supports. */
export const GARDEN_WATER_MAX_ZONE_TINTS = 6;

/** Maximum simultaneous karesansui ripple-ring emitters. */
export const GARDEN_WATER_MAX_RIPPLE_RINGS = 12;

/**
 * W4.11 — maximum point/route reflections evaluated by the water shader.
 *
 * The lane texture remains wider so the registry can rotate candidates, but
 * its full-quality pack is deliberately capped at sixteen. Keeping that same
 * bound in the shader makes the authored quiet-night limit a compile-time GPU
 * limit too.
 */
export const GARDEN_WATER_MAX_LIGHT_LANES = 16;

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
/**
 * W3.1 (water-1b): the sky may take at most this share of the water. Schlick
 * with F0 0.02 is scaled only by the body's reflectivity; the cap keeps a
 * breath of transmitted body even in a glass-calm grazing mirror.
 */
export const GARDEN_WATER_FRESNEL_CAP = 0.92;
/**
 * W3.1 (water-1e): the hour's sky radiance in the water, per light beat. The
 * probe is no longer dimmed by the scene's IBL intensity (0.3–0.6); the
 * five-beat score doses it here. Below 1 by day so the mirrored pale horizon
 * never outshines the tower that stands in it (value plan: inlet 45 under a
 * tower of 62); night stays ≤ 0.5.
 */
export const GARDEN_WATER_SKY_RADIANCE = Object.freeze({
  dawn: 0.82,
  day: 0.72,
  golden: 0.85,
  blue: 0.8,
  night: 0.45,
});
/** One pond envelope for every body; surface signatures are independent of optics. */
export const GARDEN_WATER_OPTICS = Object.freeze({
  normalTileWorldUnits: 40,
  fineTileWorldUnits: 17,
  fineSlopeGain: 0.15,
  maximumTextureCycles: 12,
  gerstnerSlopeGain: 0.6,
  derivativeVarianceGain: 0.35,
  maximumRoughness: 0.4,
});
export const GARDEN_WATER_CREST_FOAM = Object.freeze({
  /** `-J + bias` is positive only where the horizontal wave field folds. */
  jacobianBias: 1,
  jacobianStart: 0.00042,
  jacobianEnd: 0.00078,
  noiseGate: 0.56,
  maxMix: 0.055,
});
/** Sparse physical lap on exposed authored reaches; never a universal collar. */
export const GARDEN_WATER_SHORE_LAP = Object.freeze({
  periodSeconds: 10.5,
  travel: 0.004,
  centre: 0.01,
  core: 0.002,
  feather: 0.006,
  exposureStart: 0.65,
  exposureEnd: 0.9,
  noiseStart: 0.76,
  maxMix: 0.055,
});

/** Shared derivative-filtered physical contact, independent of weekly supply tide. */
export function gardenShoreContactGlsl(
  above: string,
  contact: Readonly<{ submergedAbove: number; dryAbove: number }>,
): string {
  return `float shoreAbove = ${above};
  float shoreAa = max(0.005, fwidth(shoreAbove));
  float shoreDamp = 1.0 - smoothstep(${contact.dryAbove} - shoreAa, ${contact.dryAbove} + shoreAa, shoreAbove);
  float shoreSubmerged = 1.0 - smoothstep(${contact.submergedAbove} - shoreAa, ${contact.submergedAbove} + shoreAa, shoreAbove);`;
}
/**
 * K4: the moon road's gain over moonlight at full illumination, before the
 * slat duty (~40 %) and the half-vector lobe. Measured on the real GPU at
 * `#t=22 --clock 2026-09-26` (full moon): 0.32 peaked at L* 80, so this sits
 * at the plan's L* 60 ceiling; the road is the only water feature above L* 10.
 */
export const GARDEN_WATER_MOON_ROAD_GAIN = 0.15;

/**
 * Ceiling on the summed light/ember lane reflections one water fragment may
 * add. Open-night water luminance is measured on the rendered frame (the
 * preview's `--night-water` probe), not derived from authored gains.
 */
export const GARDEN_WATER_LANE_CLAMP = 0.75;

export const GARDEN_WATER_BEACON_CLAMP = 1.3;
export const GARDEN_WATER_SUN_GLITTER_GAIN = 0.9;
/**
 * Conservative unit-luminance open-night term × support occupancy proxy.
 * These are acceptance bounds, not captured measurements; matched full/new
 * moon support occupancy is recorded with the packet's real-GPU evidence.
 * Passive Fresnel/hero/risk/foam/ripple mixtures are not additive emission.
 */
export const GARDEN_WATER_NIGHT_EMISSION = Object.freeze({
  sunGlitter: Object.freeze({ gain: GARDEN_WATER_SUN_GLITTER_GAIN, occupancy: 0 }),
  moonRoad: Object.freeze({ gain: GARDEN_WATER_MOON_ROAD_GAIN, occupancy: 0.04 }),
  beacon: Object.freeze({ gain: GARDEN_WATER_BEACON_CLAMP, occupancy: 0.002 }),
  lanes: Object.freeze({ gain: GARDEN_WATER_LANE_CLAMP, occupancy: 0.009 }),
});

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
    wind?: { x: number; y: number; speed: number; gust: number };
    stormLevel?: number;
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
  /**
   * X5 (life-6): one ring that rises once from `center` and is gone — a fish
   * rising, a heron's strike. Starts at the water's current clock, expands to
   * `radius` over `periodSeconds` (a faint second crest follows), then removes
   * itself. One-shots outrank the standing trains for a uniform slot. A pulse
   * with the id of a live one restarts it. No-op under reduced motion (the
   * water clock is frozen at 0).
   */
  pulseRing: (ring: {
    id: string;
    center: { x: number; z: number };
    radius: number;
    periodSeconds: number;
    /** 0–1 ring contrast. */
    strength: number;
  }) => void;
  /** Live emitter count; surfaced via `__pharosVilleDebug` (contract C4). */
  ringCount: () => number;
}
