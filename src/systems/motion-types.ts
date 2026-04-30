import { AMBIENT_SEA_HZ, AMBIENT_WIND_HZ } from "./motion-config";
import type { ShipWaterZone } from "./world-types";

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
}

export interface ShipLedgerMotionStop {
  id: string;
  kind: "ledger";
  dockId: null;
  chainId: null;
  weight: number;
  mooringTile: { x: number; y: number };
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
