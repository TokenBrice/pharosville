import { SHIP_WATER_ANCHORS } from "./risk-water-areas";
import { snapToSeaBody } from "./sea-body-anchors";
import type { SeaBodyName } from "./sea-bodies";
import type { ShipWaterZone } from "./world-types";

export const AMBIENT_WIND_HZ = 0.04;
export const AMBIENT_SEA_HZ = 0.7;

export const BAND_FIRE_FLICKER_SPEED: Record<string, number> = {
  critical: 0.18,
  danger: 0.28,
  degraded: 0.38,
  healthy: 0.52,
  stable: 0.48,
  warning: 0.32,
};

export const ZONE_DWELL = {
  alert: { riskDwell: 1 / 3, dockDwell: 1 / 3, transit: 1 / 3 },
  calm: { riskDwell: 1 / 3, dockDwell: 1 / 3, transit: 1 / 3 },
  danger: { riskDwell: 1 / 3, dockDwell: 1 / 3, transit: 1 / 3 },
  ledger: { riskDwell: 1 / 3, dockDwell: 1 / 3, transit: 1 / 3 },
  warning: { riskDwell: 1 / 3, dockDwell: 1 / 3, transit: 1 / 3 },
  watch: { riskDwell: 1 / 3, dockDwell: 1 / 3, transit: 1 / 3 },
} as const satisfies Record<ShipWaterZone, { dockDwell: number; riskDwell: number; transit: number }>;

export const DOCKED_SHIP_DWELL_SHARE = 1 / 3;

/**
 * Wave 4b leg cadence. A route cycle is two travel legs and two rests:
 * berth -> risk-water waypoint -> next berth. Identity-derived durations keep
 * individual ships from becoming a fleet-wide metronome. The paired dock and
 * risk rests are balanced so a docked route still spends exactly one third of
 * its cycle visibly moored.
 */
export const MOTION_LEG_MIN_SECONDS = 90;
export const MOTION_LEG_MAX_SECONDS = 180;
export const MOTION_REST_MIN_SECONDS = 240;
export const MOTION_REST_MAX_SECONDS = 480;
export const MOTION_CYCLE_MAX_SECONDS = 1_320;
export const MOTION_TRANSITION_SHARE = 0.34;
export const MOTION_PAIR_WINDOW_SECONDS = 15;
export const MOTION_PAIR_HORIZON_SECONDS = 600;
export const MOTION_PAIR_SLOT_SECONDS = 10;
export const MOTION_UNDERWAY_MIN_TILES_PER_SECOND = 0.45;
export const MOTION_UNDERWAY_MAX_TILES_PER_SECOND = 0.8;

export const MOTION_ROUTE_MEANING_CAVEAT = "Routes show rendered-chain and risk-water presence only; they do not measure transfers, bridge volume, transactions, or issuer operations.";

export function motionCadenceDetailLabel(): string {
  return `90–180 s legs; 240–480 s rests; arrivals and departures are paired. Risk-water rests grow more restless in risk order from calm through watch, alert and warning to danger. ${MOTION_ROUTE_MEANING_CAVEAT}`;
}

export const ARRIVING_FULL_TRANSIT_END = 0.85;
export const ARRIVING_DECEL_END = 0.96;
export const CAST_OFF_LINE_RELEASE_END = 0.04;
export const CAST_OFF_ACCEL_END = 0.18;
export const MOORING_WORKING_END = 0.25;
export const MOORING_QUIET_END = 0.75;

/**
 * Z3: the authored patrol waypoints, SNAPPED into their own body.
 *
 * The tables stay — their per-zone spread is what the drift circuits and cycle
 * lengths in motion-sampling were tuned against, and regenerating them evenly
 * flattened the DEWS motion escalation from 2.1x to 1.2x because the transit
 * between evenly-spread waypoints came to dominate the sampled speed.
 *
 * What the snap fixes is correctness: after the Sea Master reshape a good
 * number of these tiles no longer sat in the water they name, and a patrol
 * waypoint in the wrong zone is worse than a stale berth because the ship
 * sails to it.
 */
const PATROL_BODY_FOR_PLACEMENT = {
  "harbor-mouth-watch": "alert",
  "outer-rough-water": "warning",
  "safe-harbor": "calm",
  "storm-shelf": "danger",
  "breakwater-edge": "watch",
  "ledger-mooring": "ledger",
} as const satisfies Record<string, SeaBodyName>;

type PatrolPlacement = keyof typeof PATROL_BODY_FOR_PLACEMENT;

const patrolAnchors = (placement: PatrolPlacement): readonly { x: number; y: number }[] =>
  SHIP_WATER_ANCHORS[placement].map((tile) => snapToSeaBody(tile, PATROL_BODY_FOR_PLACEMENT[placement]));

export const OPEN_WATER_PATROL_WAYPOINTS: Record<ShipWaterZone, readonly { x: number; y: number }[]> = {
  alert: [...patrolAnchors("harbor-mouth-watch"), ...patrolAnchors("outer-rough-water")],
  calm: patrolAnchors("safe-harbor"),
  danger: [...patrolAnchors("storm-shelf"), ...patrolAnchors("outer-rough-water")],
  ledger: [
    ...patrolAnchors("ledger-mooring"),
    ...patrolAnchors("safe-harbor"),
    ...patrolAnchors("breakwater-edge"),
    ...patrolAnchors("harbor-mouth-watch"),
    ...patrolAnchors("outer-rough-water"),
    ...patrolAnchors("storm-shelf"),
  ],
  warning: [...patrolAnchors("outer-rough-water"), ...patrolAnchors("storm-shelf")],
  watch: [...patrolAnchors("breakwater-edge"), ...patrolAnchors("safe-harbor")],
};
