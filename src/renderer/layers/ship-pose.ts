import { stableUnit } from "../../systems/stable-random";
import { getShipHeadingDelta } from "../../systems/motion-sampling";
import type { ShipMotionSample, ShipMotionState } from "../../systems/motion";
import type { ShipSizeTier, ShipWaterZone } from "../../systems/world-types";

const BANK_GAIN = 0.18;
const BANK_MAX = 0.06;

const TWO_PI = Math.PI * 2;
const NON_TITAN_BOB_PIXELS = 2;
const poseSeedCache = new Map<string, number>();
const phaseSeedCache = new Map<string, number>();
const SHIP_POSE_SEED_CACHE_MAX = 1024;

const ZONE_ROUGHNESS = {
  alert: 1,
  calm: 0.72,
  danger: 1.32,
  ledger: 0.65,
  warning: 1.14,
  watch: 0.86,
} as const satisfies Record<ShipWaterZone, number>;

const STATIC_SHIP_POSE: ShipPose = Object.freeze({
  bobPixels: 0,
  bowWake: 0,
  lanternAlpha: 0,
  mooringTension: 0,
  rollRadians: 0,
  sailFlutter: 0,
  sternChurn: 0,
}) as ShipPose;

export interface ShipPose {
  rollRadians: number;
  bobPixels: number;
  sailFlutter: number;
  bowWake: number;
  sternChurn: number;
  mooringTension: number;
  lanternAlpha: number;
}

interface ShipPoseInputBase {
  shipId: string;
  sample?: ShipMotionSample | null;
  reducedMotion: boolean;
  timeSeconds: number;
  zoom: number;
  phase?: number;
}

export type ShipPoseInput = ShipPoseInputBase & (
  | { visualSizeTier: ShipSizeTier; sizeTier?: ShipSizeTier }
  | { sizeTier: ShipSizeTier; visualSizeTier?: ShipSizeTier }
);

export function resolveShipPose(input: ShipPoseInput): ShipPose {
  if (input.reducedMotion) return zeroShipPose();

  const sizeTier = input.visualSizeTier ?? input.sizeTier;
  const timeSeconds = finiteOr(input.timeSeconds, 0);
  const zoom = Math.max(0, finiteOr(input.zoom, 1));
  const phase = finiteOr(input.phase ?? phaseSeed(input.shipId), 0);
  if (sizeTier !== "titan") {
    return {
      ...STATIC_SHIP_POSE,
      bobPixels: Math.round(Math.sin(timeSeconds * 0.7 + phase) * NON_TITAN_BOB_PIXELS * zoom),
    };
  }

  const sample = input.sample;
  if (!sample) return zeroShipPose();

  const state = sample.state;
  const roughness = ZONE_ROUGHNESS[sample.zone] ?? 0.8;
  const wakeIntensity = clamp(sample.wakeIntensity, 0, 1);
  const headingMagnitude = clamp(Math.hypot(sample.heading.x, sample.heading.y), 0, 1);
  const headingLean = clamp((sample.heading.x - sample.heading.y) * 0.32, -0.45, 0.45);
  const seedPhase = phase + poseSeed(input.shipId);
  const sea = Math.sin(timeSeconds * 1.18 + seedPhase);
  const swell = Math.sin(timeSeconds * 0.74 + seedPhase * 0.7);
  const flutter = Math.sin(timeSeconds * 3.2 + seedPhase * 1.3) * 0.5 + 0.5;
  const lantern = Math.sin(timeSeconds * 1.7 + seedPhase * 1.9) * 0.5 + 0.5;

  if (isTransitState(state)) {
    const wake = clamp((0.18 + wakeIntensity * 0.82) * (0.86 + roughness * 0.14) * (0.9 + headingMagnitude * 0.1), 0, 1);
    // Bank into turns proportional to angular velocity. headingDelta is the
    // signed rad/sec the heading has rotated this sample, cached by the
    // sampler's low-pass filter. Real boats heel into a turn; this couples
    // the visual roll to the ship's actual rotation rate.
    const headingDelta = getShipHeadingDelta(input.shipId);
    const bank = Math.max(-BANK_MAX, Math.min(BANK_MAX, headingDelta * BANK_GAIN));
    return {
      rollRadians: sea * 0.026 * roughness * (0.82 + wakeIntensity * 0.46) + headingLean * 0.012 + bank,
      bobPixels: swell * 3.1 * zoom * roughness * (0.82 + wakeIntensity * 0.34),
      sailFlutter: clamp(0.52 + flutter * 0.24 + wakeIntensity * 0.08, 0, 1),
      bowWake: wake,
      sternChurn: clamp(0.24 + wakeIntensity * 0.54 + roughness * 0.06, 0, 1),
      mooringTension: 0,
      lanternAlpha: clamp(0.5 + lantern * 0.28 + wakeIntensity * 0.06, 0, 1),
    };
  }

  if (state === "moored") {
    const tension = clamp(0.42 + roughness * 0.12 + Math.abs(sea) * 0.1, 0, 1);
    return {
      rollRadians: sea * 0.008 * roughness + headingLean * 0.004,
      bobPixels: swell * 0.9 * zoom * roughness,
      sailFlutter: clamp(0.15 + flutter * 0.08 + roughness * 0.02, 0, 1),
      bowWake: 0,
      sternChurn: clamp(0.05 + roughness * 0.04, 0, 1),
      mooringTension: tension,
      lanternAlpha: clamp(0.3 + lantern * 0.18, 0, 1),
    };
  }

  if (state === "risk-drift") {
    return {
      rollRadians: sea * 0.0025 * roughness + headingLean * 0.001,
      bobPixels: swell * 0.28 * zoom * roughness,
      sailFlutter: clamp(0.03 + flutter * 0.025 + wakeIntensity * 0.01, 0, 1),
      bowWake: 0,
      sternChurn: clamp(0.012 + roughness * 0.012, 0, 1),
      mooringTension: 0,
      lanternAlpha: clamp(0.12 + lantern * 0.08, 0, 1),
    };
  }

  return zeroShipPose();
}

export function zeroShipPose(): ShipPose {
  return STATIC_SHIP_POSE;
}

function isTransitState(state: ShipMotionState): boolean {
  return state === "departing" || state === "sailing" || state === "arriving";
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function poseSeed(shipId: string): number {
  let seed = poseSeedCache.get(shipId);
  if (seed === undefined) {
    seed = stableUnit(`${shipId}.pose`) * TWO_PI;
    poseSeedCache.set(shipId, seed);
    while (poseSeedCache.size > SHIP_POSE_SEED_CACHE_MAX) {
      const oldest = poseSeedCache.keys().next().value;
      if (typeof oldest !== "string") break;
      poseSeedCache.delete(oldest);
    }
  }
  return seed;
}

function phaseSeed(shipId: string): number {
  let phase = phaseSeedCache.get(shipId);
  if (phase === undefined) {
    phase = stableUnit(`${shipId}.pose-phase`) * TWO_PI;
    phaseSeedCache.set(shipId, phase);
    while (phaseSeedCache.size > SHIP_POSE_SEED_CACHE_MAX) {
      const oldest = phaseSeedCache.keys().next().value;
      if (typeof oldest !== "string") break;
      phaseSeedCache.delete(oldest);
    }
  }
  return phase;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
