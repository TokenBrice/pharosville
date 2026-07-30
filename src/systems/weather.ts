/**
 * Phase 2 (Breathtaking Rendering, items 4-5): wind and storm as a first-class
 * system — the Bruno Simon dependency-graph piece the renderer was missing.
 *
 * One pure plan, derived from the world clock and the analytic signals the sea
 * state already carries (PSI stress, DEWS-driven base wind), consumed by every
 * weather-reading surface: water swell direction and chop, cloud-shadow drift,
 * rain-curtain slant and intensity, sail/pennant flutter, gull drift and storm
 * scatter, sky/fog storm darkening, the post chain's wet-glow bloom, and the
 * storm-peak lightning flash.
 *
 * Determinism contract (same as the motion plan):
 * - Everything below is a pure function of `timeSeconds` + the analytic
 *   inputs. No Math.random, no wall-clock reads, no hidden state.
 * - Under reduced motion the render loop pins `timeSeconds = 0`, so the whole
 *   plan freezes into one static composition — including lightning, whose
 *   schedule keeps the first 1.5 s of every slot dark (see below).
 * - Wind/storm are WORLD state (like the day cycle), never tier state: tiers
 *   may shed fidelity but the weather plan is identical at every tier.
 *
 * Parameter ranges:
 * - windAngle wanders ±~1.6 rad around WIND_BASE_ANGLE on three slow periods
 *   (241 s / 97 s / 41 s) — an Ornstein-Uhlenbeck-ish meander built from
 *   layered sines, so it never snaps and never wraps visibly.
 * - windSpeed 0.2..1: a floor so the world never reads as holding its breath,
 *   then base wind (DEWS threat), a slow breeze envelope, and storm on top.
 * - gust 0..1: a higher-frequency envelope (7.3 s with a 2.9 s wobble),
 *   squared for spikiness and scaled by the sustained wind so gusts only read
 *   when the wind is actually up.
 * - stormLevel 0..1: smoothstep(0.35, 0.92) of PSI stress — STEADY and below
 *   stay calm, TREMOR is the first stirring, FRACTURE a building sea, CRISIS
 *   and MELTDOWN a full storm — plus a ±5% breathing term (167 s) so a
 *   borderline storm swells and ebbs instead of sitting at a fixed value.
 * - lightning 0..~1.6: zero until stormLevel crosses 0.8, then a deterministic
 *   9-second slot schedule; each struck slot fires a double-stroke envelope
 *   decaying over ~0.3 s.
 */

export interface WeatherPlan {
  /**
   * Unit downwind direction in world XZ: the direction air, rain, mist,
   * surface foam, and other advected features move toward.
   */
  windDirX: number;
  windDirZ: number;
  /** Downwind bearing in radians: atan2(windDirZ, windDirX). */
  windAngle: number;
  /** Sustained wind strength, 0..1. */
  windSpeed: number;
  /** Gust envelope, 0..1 — the flutter/rain-squall driver. */
  gust: number;
  /** Storm state, 0..1. */
  stormLevel: number;
  /** Lightning flash envelope; 0 unless the storm is at its peak. */
  lightning: number;
}

export interface WeatherInput {
  /** World-clock seconds — the render loop's `timeSeconds`. */
  timeSeconds: number;
  /** PSI stress, 0..1 (`seaState.source.psiStress`). */
  psiStress: number;
  /** Sustained wind base, 0..1 (`seaState.wind`). */
  baseWind: number;
}

const TAU = Math.PI * 2;

/**
 * Weather vectors always point TOWARD the downwind destination. The default
 * is the v0.6.2 sea's dominant crest velocity: its local phase gradient was
 * (0.9229, 0.3851), so the +time wave travelled in the opposite water-local
 * direction, which maps to this world-XZ vector.
 */
const HISTORICAL_WIND_LENGTH = Math.hypot(0.9229, 0.3851);
export const GARDEN_DEFAULT_WIND_X = -0.9229 / HISTORICAL_WIND_LENGTH;
export const GARDEN_DEFAULT_WIND_Z = 0.3851 / HISTORICAL_WIND_LENGTH;
export const GARDEN_WIND_DIRECTION_CONVENTION = "toward" as const;
const WIND_BASE_ANGLE = Math.atan2(GARDEN_DEFAULT_WIND_Z, GARDEN_DEFAULT_WIND_X);

/** Storm begins at TREMOR stress and owns the sky by near-MELTDOWN. */
const STORM_START = 0.35;
const STORM_FULL = 0.92;
/** Lightning waits for the storm peak — CRISIS band and above. */
const LIGHTNING_START = 0.8;
/** Seconds per lightning slot; each slot independently may hold one strike. */
const LIGHTNING_SLOT_SECONDS = 9;

export function weatherForFrame(input: WeatherInput): WeatherPlan {
  const plan: WeatherPlan = {
    windDirX: 0,
    windDirZ: 0,
    windAngle: 0,
    windSpeed: 0,
    gust: 0,
    stormLevel: 0,
    lightning: 0,
  };
  writeWeatherPlan(input, plan);
  return plan;
}

/**
 * Allocation-free form for the frame path: writes the plan into `out`.
 * Pure — same inputs always produce the same writes.
 */
export function writeWeatherPlan(input: WeatherInput, out: WeatherPlan): void {
  const time = Math.max(0, Number.isFinite(input.timeSeconds) ? input.timeSeconds : 0);
  const psiStress = clamp01(input.psiStress);
  const baseWind = clamp01(input.baseWind);

  // Slow direction wander: three incommensurate periods layered so the wind
  // veers and backs like a real harbour breeze, never wrapping in view. Every
  // term starts at zero so time zero is the established default bearing.
  const windAngle = WIND_BASE_ANGLE
    + 0.85 * Math.sin((TAU * time) / 241)
    + 0.5 * Math.sin((TAU * time) / 97)
    + 0.28 * Math.sin((TAU * time) / 41);

  const stormBase = smoothstep(STORM_START, STORM_FULL, psiStress);
  // Breathing scales WITH the storm so calm water never breathes into one.
  const stormLevel = clamp01(
    stormBase * (1 + 0.05 * Math.sin((TAU * time) / 167 + 0.6)),
  );

  const breeze = 0.5 + 0.5 * Math.sin((TAU * time) / 83 + 1.2);
  const windSpeed = clamp01(0.2 + baseWind * 0.3 + breeze * 0.18 + stormLevel * 0.38);

  // Gusts: a spiky envelope that only has force when the wind is up.
  const gustWave = 0.5
    + 0.5 * Math.sin((TAU * time) / 7.3 + Math.sin((TAU * time) / 2.9) * 1.4);
  const gust = clamp01(gustWave * gustWave * (0.3 + windSpeed * 0.7));

  out.windAngle = windAngle;
  out.windDirX = Math.cos(windAngle);
  out.windDirZ = Math.sin(windAngle);
  out.windSpeed = windSpeed;
  out.gust = gust;
  out.stormLevel = stormLevel;
  out.lightning = lightningAt(time, stormLevel);
}

/**
 * Deterministic lightning schedule. Time is divided into 9-second slots; a
 * hash of the slot index decides whether the slot holds a strike (more likely
 * the harder the storm) and where inside the slot it lands. Strikes never
 * fall in the first 1.5 s of a slot, so the reduced-motion static frame
 * (timeSeconds pinned at 0) is always dark.
 *
 * The flash is a double stroke: a fast primary (~90 ms decay) and a slower
 * re-strike 120 ms later — the shape a real flash reads as, from two
 * exponential decays, ~0.3 s end to end.
 */
function lightningAt(timeSeconds: number, stormLevel: number): number {
  if (stormLevel <= LIGHTNING_START) return 0;
  const slot = Math.floor(timeSeconds / LIGHTNING_SLOT_SECONDS);
  const presence = hash01(slot * 2 + 1);
  const stormPeak = smoothstep(LIGHTNING_START, 0.97, stormLevel);
  if (presence > 0.25 + stormPeak * 0.7) return 0;
  const strikeAt = slot * LIGHTNING_SLOT_SECONDS
    + 1.5
    + hash01(slot * 2 + 2) * (LIGHTNING_SLOT_SECONDS - 2.5);
  const since = timeSeconds - strikeAt;
  if (since < 0) return 0;
  let flash = Math.exp(-since / 0.09);
  const restrike = since - 0.12;
  if (restrike > 0) flash += 0.7 * Math.exp(-restrike / 0.11);
  return flash * stormPeak;
}

/** Deterministic 0..1 hash of an integer slot — the lightning schedule's RNG. */
function hash01(n: number): number {
  let hash = (n * 374761393 + 2246822519) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
