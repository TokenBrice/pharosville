import { PHAROSVILLE_MAP_SCALE } from "./map-scale";

// Zone radius mapping, extracted from garden-zones.ts so systems code (and the
// deterministic sea-coverage measurement in garden-zone-coverage.ts) can
// consume the SAME numbers without pulling three.js into the systems graph.
// The constants themselves are owned by Lane Z / the zones-v2 operator overlay.

/** The zone ellipse's world semi-axes relative to the base radius. These match
    the historic `root.scale` (x = 1.25·r, z = 0.76·r) so the selection-cue
    contract (`entityCues` reads `zone.root`) and the DOM label placement stay
    put while the filled disc is replaced by a charted perimeter. */
export const ZONE_ELLIPSE_X = 1.25;
export const ZONE_ELLIPSE_Z = 0.76;

// Zones-v2 (operator overlay, 2026-07-24): per-band base radii compose the sea
// into nested bodies of water — Calm's inner harbor ring on the island, the
// dominant Watch sea, Ledger's off-frame NW arc, and the Alert>Warning>Danger
// escalation tightening into the NE corner. A mild √count term (+≤2) keeps the
// population→size encoding monotonic without disturbing the composition.
// Zones-v3 (2026-07-24, operator steer "vastly increase the sea zones,
// especially calm and watch"): radii raised across the board while keeping the
// hierarchy Watch > Ledger > Alert > Calm > Warning > Danger. NOTE: the union
// of the six rendered ellipses already covered ~89% of the open-sea surface at
// the zones-v2 radii (the "empty" read comes from the deliberately faint
// tints, not the ellipse footprints); these values push it to ~98% while
// keeping the N-strip and SW-corner open-water pockets readable (measured in
// garden-zone-coverage.ts — the guard asserts ≥50% at worst-case counts).
//
// N1 (2026-07-25): the map doubled on each axis and the zone BANDS scale with
// it, so the rendered ellipses that stand for those bands scale too — the radii
// below stay authored against the 56-tile design space and are multiplied by
// MAP_SCALE on export. Left unscaled, the six ellipses covered a measured 34.3%
// of the enlarged sea instead of the ~89% the composition was tuned for.
const AUTHORED_ZONE_BASE_RADIUS: Record<string, number> = {
  ALERT: 34,
  CALM: 32,
  DANGER: 6,
  WARNING: 15,
  WATCH: 48,
};
export const ZONE_BASE_RADIUS: Record<string, number> = Object.fromEntries(
  Object.entries(AUTHORED_ZONE_BASE_RADIUS).map(([band, radius]) => [band, radius * PHAROSVILLE_MAP_SCALE]),
);
export const ZONE_BASE_RADIUS_LEDGER = 36 * PHAROSVILLE_MAP_SCALE;
export const ZONE_BASE_RADIUS_DEFAULT = 12 * PHAROSVILLE_MAP_SCALE;

/** World-unit base radius + capped √count term for one zone area. */
export function zoneRadius(area: {
  band?: string | null;
  riskPlacement?: string | null;
  count?: number | null;
}): number {
  const bandBase = area.band ? ZONE_BASE_RADIUS[area.band] : undefined;
  const base = bandBase
    ?? (area.riskPlacement === "ledger-mooring"
      ? ZONE_BASE_RADIUS_LEDGER
      : ZONE_BASE_RADIUS_DEFAULT);
  return base + Math.min(2, Math.sqrt(Math.max(1, area.count ?? 1)) * 0.3);
}
