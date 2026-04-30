import { SHIP_WATER_ANCHORS } from "./risk-water-areas";
import type { ShipWaterZone } from "./world-types";

export const BAND_FIRE_FLICKER_SPEED: Record<string, number> = {
  critical: 0.18,
  danger: 0.28,
  degraded: 0.38,
  healthy: 0.52,
  stable: 0.48,
  warning: 0.32,
};

export const ZONE_DWELL: Record<ShipWaterZone, { dockDwell: number; riskDwell: number; transit: number }> = {
  alert: { riskDwell: 0.38, dockDwell: 0.18, transit: 0.44 },
  calm: { riskDwell: 0.24, dockDwell: 0.24, transit: 0.52 },
  danger: { riskDwell: 0.58, dockDwell: 0.06, transit: 0.36 },
  ledger: { riskDwell: 0.48, dockDwell: 0.1, transit: 0.42 },
  warning: { riskDwell: 0.46, dockDwell: 0.12, transit: 0.42 },
  watch: { riskDwell: 0.3, dockDwell: 0.22, transit: 0.48 },
};

export const DOCKED_SHIP_DWELL_SHARE = 1 / 3;

export const OPEN_WATER_PATROL_WAYPOINTS: Record<ShipWaterZone, readonly { x: number; y: number }[]> = {
  alert: [...SHIP_WATER_ANCHORS["harbor-mouth-watch"], ...SHIP_WATER_ANCHORS["outer-rough-water"], ...SHIP_WATER_ANCHORS["breakwater-edge"]],
  calm: SHIP_WATER_ANCHORS["safe-harbor"],
  danger: [...SHIP_WATER_ANCHORS["storm-shelf"], ...SHIP_WATER_ANCHORS["outer-rough-water"]],
  ledger: SHIP_WATER_ANCHORS["ledger-mooring"],
  warning: [...SHIP_WATER_ANCHORS["outer-rough-water"], ...SHIP_WATER_ANCHORS["storm-shelf"]],
  watch: [...SHIP_WATER_ANCHORS["breakwater-edge"], ...SHIP_WATER_ANCHORS["safe-harbor"]],
};
