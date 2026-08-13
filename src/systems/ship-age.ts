import type { StablecoinMeta } from "@shared/types";
import { stableUnit } from "./stable-random";

export const SHIP_AGE_FRESH_DAYS = 365;
export const SHIP_AGE_VETERAN_DAYS = 365 * 3;
/** Ten years is the visual ceiling; older ships do not become progressively darker. */
export const SHIP_AGE_PATINA_FULL_DAYS = 365 * 10;

export type ShipAgeEra = "fresh" | "seasoned" | "veteran" | "unavailable";
export type ShipAgeSource = "age-days" | "launch-date" | "launch-milestone" | "tracking-only" | "unavailable";

export interface ShipAgeProfile {
  /** Best supported service age. Null is deliberately not coerced to fresh. */
  ageDays: number | null;
  era: ShipAgeEra;
  /** Even hull patina in [0, 1]; null means the renderer's neutral finish. */
  patina: number | null;
  serviceSince: string | null;
  source: ShipAgeSource;
  trackingSpanDays: number | null;
}

export interface ShipWabiSurface {
  hullValue: number;
  propRotation: number;
  ropeSag: number;
}

/** Decorative only: stable id leads every seed to avoid suffix clustering. */
export function deriveShipWabiSurface(shipId: string): ShipWabiSurface {
  const hullDirection = stableUnit(`${shipId}|wabi-hull-direction`) < 0.5 ? -1 : 1;
  const propDirection = stableUnit(`${shipId}|wabi-prop-direction`) < 0.5 ? -1 : 1;
  const ropeDirection = stableUnit(`${shipId}|wabi-rope-direction`) < 0.5 ? -1 : 1;
  return {
    hullValue: 1 + hullDirection * (0.04 + stableUnit(`${shipId}|wabi-hull-magnitude`) * 0.02),
    propRotation: propDirection * (2 + stableUnit(`${shipId}|wabi-prop-magnitude`) * 7) * Math.PI / 180,
    ropeSag: ropeDirection * (0.025 + stableUnit(`${shipId}|wabi-rope-magnitude`) * 0.045),
  };
}

export interface DeriveShipAgeInput {
  ageDays?: number | null | undefined;
  asOfMs?: number | null | undefined;
  assetStatus?: StablecoinMeta["status"] | null | undefined;
  meta?: Pick<StablecoinMeta, "launchDate" | "milestones"> | null | undefined;
  trackingSpanDays?: number | null | undefined;
}

function finiteDays(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function dateOnly(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? value : null;
}

function daysSince(date: string, asOfMs: number | null): number | null {
  if (asOfMs === null || !Number.isFinite(asOfMs)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(time) || time > asOfMs) return null;
  return Math.floor((asOfMs - time) / 86_400_000);
}

/**
 * A milestone is usable as a service date only when its title says the asset
 * actually launched, deployed, or went live. Announcements, audits and
 * testnets are intentionally excluded: aging a ship from a promise would turn
 * patina into false precision.
 */
function launchMilestoneDate(meta: DeriveShipAgeInput["meta"]): string | null {
  const candidates = (meta?.milestones ?? [])
    .filter((milestone) => milestone.type === "milestone")
    .filter((milestone) => /\b(launch(?:ed)?|mainnet|deployed|went live|live)\b/i.test(milestone.title))
    .map((milestone) => dateOnly(milestone.date))
    .filter((date): date is string => date !== null)
    .sort();
  return candidates[0] ?? null;
}

export function shipAgeEra(ageDays: number | null): ShipAgeEra {
  if (ageDays === null) return "unavailable";
  if (ageDays < SHIP_AGE_FRESH_DAYS) return "fresh";
  if (ageDays < SHIP_AGE_VETERAN_DAYS) return "seasoned";
  return "veteran";
}

/** Piecewise-linear era ladder: <1y fresh, 1-3y seasoned, >3y veteran. */
export function shipAgePatina(ageDays: number | null): number | null {
  if (ageDays === null) return null;
  if (ageDays < SHIP_AGE_FRESH_DAYS) {
    return (ageDays / SHIP_AGE_FRESH_DAYS) / 3;
  }
  if (ageDays < SHIP_AGE_VETERAN_DAYS) {
    return 1 / 3 + ((ageDays - SHIP_AGE_FRESH_DAYS)
      / (SHIP_AGE_VETERAN_DAYS - SHIP_AGE_FRESH_DAYS)) / 3;
  }
  return Math.min(1, 2 / 3 + ((ageDays - SHIP_AGE_VETERAN_DAYS)
    / (SHIP_AGE_PATINA_FULL_DAYS - SHIP_AGE_VETERAN_DAYS)) / 3);
}

/**
 * Folds three imperfect clocks without pretending they are interchangeable.
 * Explicit model age wins, then a dated launch, then a launch-like milestone.
 * Tracking span is a lower bound and is used alone only when no service date
 * exists; the returned source keeps that limitation visible to DOM parity.
 */
export function deriveShipAge(input: DeriveShipAgeInput): ShipAgeProfile {
  const reportedAge = finiteDays(input.ageDays);
  const trackingSpanDays = finiteDays(input.trackingSpanDays);
  const asOfMs = typeof input.asOfMs === "number" && Number.isFinite(input.asOfMs)
    ? input.asOfMs
    : null;
  const launchDate = dateOnly(input.meta?.launchDate);
  // Pre-launch/testnet records can contain milestones for their provider or
  // host chain (for example INDX or Tempo) that are not the coin's launch.
  const milestoneDate = launchDate || input.assetStatus === "pre-launch"
    ? null
    : launchMilestoneDate(input.meta);
  const datedAge = launchDate ? daysSince(launchDate, asOfMs) : null;
  const milestoneAge = milestoneDate ? daysSince(milestoneDate, asOfMs) : null;

  let ageDays: number | null = null;
  let serviceSince: string | null = null;
  let source: ShipAgeSource = "unavailable";
  if (reportedAge !== null) {
    ageDays = reportedAge;
    source = "age-days";
    serviceSince = launchDate ?? milestoneDate;
  } else if (datedAge !== null && launchDate) {
    ageDays = datedAge;
    serviceSince = launchDate;
    source = "launch-date";
  } else if (milestoneAge !== null && milestoneDate) {
    ageDays = milestoneAge;
    serviceSince = milestoneDate;
    source = "launch-milestone";
  } else if (trackingSpanDays !== null) {
    ageDays = trackingSpanDays;
    source = "tracking-only";
  }

  return {
    ageDays,
    era: shipAgeEra(ageDays),
    patina: shipAgePatina(ageDays),
    serviceSince,
    source,
    trackingSpanDays,
  };
}
