import { AMBIENT_SEA_HZ, AMBIENT_WIND_HZ } from "./motion-config";
import type { ShipWaterZone } from "./world-types";

/**
 * Speed scalars indexed by marketCap quartile (0 = lowest, 3 = highest).
 * Divide cycleSeconds by the scalar so higher-quartile (larger) ships complete
 * cycles faster — a 1.15 scalar yields ~15% shorter cycle than baseline.
 * The resulting range stays within the 780–1560s clamp in shipCycleSeconds.
 *
 * Q0 → 0.85 (Languid)  Q1 → 0.95 (Steady)
 * Q2 → 1.05 (Brisk)    Q3 → 1.15 (Lively)
 */
export const SPEED_QUARTILE_SCALARS = [0.85, 0.95, 1.05, 1.15] as const;

const TWO_PI = Math.PI * 2;

interface AmbientPhaseSource {
  readonly reducedMotion: boolean;
  readonly timeSeconds: number;
}

export function ambientWindPhase(motion: AmbientPhaseSource, offset = 0): number {
  if (motion.reducedMotion) return 0;
  return Math.sin(motion.timeSeconds * AMBIENT_WIND_HZ * TWO_PI + offset);
}

export function ambientSeaPhase(motion: AmbientPhaseSource, offset = 0): number {
  if (motion.reducedMotion) return 0;
  return Math.sin(motion.timeSeconds * AMBIENT_SEA_HZ * TWO_PI + offset);
}

export interface ShipWaterPath {
  from: { x: number; y: number };
  to: { x: number; y: number };
  points: Array<{ x: number; y: number }>;
  cumulativeLengths: number[];
  totalLength: number;
}

export type ShipMotionState = "idle" | "moored" | "departing" | "sailing" | "risk-drift" | "arriving";
export type ShipMotionStopKind = "dock" | "ledger";
export type ShipWaterRouteCache = Map<string, ShipWaterPath>;
export type ShipWaterPathBuilder = () => ShipWaterPath;

export interface ShipDockMotionStop {
  id: string;
  kind: "dock";
  dockId: string;
  chainId: string;
  weight: number;
  mooringTile: { x: number; y: number };
  // Unit vector from the mooring tile toward the dock's tile (or, when the
  // dock isn't resolvable, away from the nearest seawall barrier). Sampler
  // anchors moored heading to this direction so docked ships face naturally
  // instead of sweeping a Lissajous around the wall. `null` when no usable
  // direction can be derived; sampler falls back to the legacy sweep.
  dockTangent: { x: number; y: number } | null;
}

export interface ShipLedgerMotionStop {
  id: string;
  kind: "ledger";
  dockId: null;
  chainId: null;
  weight: number;
  mooringTile: { x: number; y: number };
  dockTangent: { x: number; y: number } | null;
}

export type ShipMotionRouteStop = ShipDockMotionStop | ShipLedgerMotionStop;

export interface ShipMotionRoute {
  shipId: string;
  cycleSeconds: number;
  phaseSeconds: number;
  riskTile: { x: number; y: number };
  dockStops: ShipDockMotionStop[];
  riskStop: ShipMotionRouteStop | null;
  zone: ShipWaterZone;
  dockStopSchedule: string[];
  homeDockId: string | null;
  openWaterPatrol: {
    outbound: ShipWaterPath;
    inbound: ShipWaterPath;
    waypoint: { x: number; y: number };
  } | null;
  waterPaths: ReadonlyMap<string, ShipWaterPath>;
  routeSeed: number;
  // Squad consort offset relative to the flagship, precomputed at route-build
  // so the per-frame sampler doesn't repeat the squad/placement lookups.
  // `null` for non-consort routes (flagships and unsquaded ships).
  formationOffset: { dx: number; dy: number } | null;
  // E1: true when ship.placementEvidence.stale. Widens mooring orbit radius
  // (×1.35) and slows angular speed (×0.65) so stale-evidence ships sway
  // larger and slower — "uncertain position" visual signal.
  staleEvidence: boolean;
  // E2: wake intensity multiplier derived from ship.change24hPct at plan time.
  // Baseline 1.0; formula: 1 + clamp(|pct| / 20, 0, 0.6) when |pct| ≥ 2
  // (change24hPct is in percent units — e.g. 10 means 10% — per recent-change.ts:16).
  wakeMultiplier: number;
  // E3: dock-dwell share override for ships with broad chain presence.
  // chainPresence.length ≥ 4 → base × 1.15; otherwise the DOCKED_SHIP_DWELL_SHARE
  // constant applies. undefined means "use the base constant".
  dockDwellShareOverride?: number;
}

export interface ShipMotionSample {
  shipId: string;
  tile: { x: number; y: number };
  state: ShipMotionState;
  zone: ShipWaterZone;
  currentDockId: string | null;
  currentRouteStopId: string | null;
  currentRouteStopKind: ShipMotionStopKind | null;
  heading: { x: number; y: number };
  wakeIntensity: number;
}

export interface PharosVilleMotionPlan {
  animatedShipIds: ReadonlySet<string>;
  effectShipIds: ReadonlySet<string>;
  lighthouseFireFlickerPerSecond: number;
  moverShipIds: ReadonlySet<string>;
  shipPhases: ReadonlyMap<string, number>;
  shipRoutes: ReadonlyMap<string, ShipMotionRoute>;
}

export interface PharosVilleBaseMotionPlan {
  animatedShipIds: ReadonlySet<string>;
  baseEffectShipIds: ReadonlySet<string>;
  lighthouseFireFlickerPerSecond: number;
  moverShipIds: ReadonlySet<string>;
  shipPhases: ReadonlyMap<string, number>;
  shipRoutes: ReadonlyMap<string, ShipMotionRoute>;
}
