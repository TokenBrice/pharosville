import { dockOutwardVector } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";
import { windMultiplierForMotion } from "./weather";

/**
 * Dock caustic shimmer (plan 2.2 remainder) — a subtle animated caustic
 * ripple in the water around the four major EVM-bay dock bodies. Three
 * nested iso-ellipse rings per dock breathe at a wind-scaled cadence
 * (`windMultiplier`, 1.0–1.85 by threat level), echoing how light refracts
 * around pilings. Drawn after the static terrain pass and before the entity
 * pass, so the per-frame dock sprites paint over the inner rings while the
 * fringe stays visible on the water — the same layering contract as
 * `drawHarborSurf`. Scheduler pass `"dock-caustics"`: recovery keeps it,
 * constrained sheds it. Reduced motion freezes the rings at the time-zero
 * frame (no RAF dependency), matching the harbor-surf pattern.
 */

/** The four major dock bodies (EVM bay periphery) that receive caustics. */
const DOCK_CAUSTIC_CHAIN_IDS: ReadonlySet<string> = new Set([
  "ethereum",
  "base",
  "arbitrum",
  "polygon",
]);

// Ring geometry in tile-screen pixels at zoom 1 (multiplied by camera.zoom).
// Base radii sit just outside the quay-underlay half-width (~30-40px) so the
// shimmer reads as water-side fringe rather than paint over the dock pad.
const CAUSTIC_RING_BASE_RADII = [24, 34, 45] as const;
const CAUSTIC_RING_PHASES = [0.7, 2.9, 5.1] as const;
const CAUSTIC_RADIUS_PULSE_PX = 2.2;
const CAUSTIC_PEAK_ALPHA = 0.11;
const CAUSTIC_ALPHA_WOBBLE = 0.05;

/**
 * Per-dock count drawn; returned for metrics parity with the water-accent
 * pass (`waterAccentTileCount` convention).
 */
export function drawDockCaustics(input: DrawPharosVilleInput): number {
  const { camera, ctx, motion, world } = input;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const wind = windMultiplierForMotion(motion, world);
  // Wind raises both the shimmer cadence and its presence a touch, the same
  // direction the pennant flutter and cloud drift already lean.
  const windPresence = 0.85 + (wind - 1) * 0.35;
  const zoom = camera.zoom;
  const mapWidth = world.map.width;
  let drawn = 0;

  ctx.save();
  for (const dock of world.docks) {
    if (!DOCK_CAUSTIC_CHAIN_IDS.has(dock.chainId)) continue;
    const outward = dockOutwardVector(dock.tile, mapWidth);
    // Anchor one step seaward of the dock tile so the rings are centered on
    // open water for every periphery orientation.
    const anchorX = dock.tile.x + outward.x * 1.1;
    const anchorY = dock.tile.y + outward.y * 1.1;
    const pX = (anchorX - anchorY) * 16 * zoom + camera.offsetX;
    const pY = (anchorX + anchorY) * 8 * zoom + camera.offsetY;
    const dockPhase = (dock.tile.x * 0.83 + dock.tile.y * 0.57) % (Math.PI * 2);

    for (let ring = 0; ring < CAUSTIC_RING_BASE_RADII.length; ring += 1) {
      const phase = dockPhase + CAUSTIC_RING_PHASES[ring]!;
      const pulse = Math.sin(time * 1.1 * wind + phase) * CAUSTIC_RADIUS_PULSE_PX;
      const rx = (CAUSTIC_RING_BASE_RADII[ring]! + pulse) * zoom;
      const alpha = (CAUSTIC_PEAK_ALPHA + Math.sin(time * 1.7 * wind + phase * 1.9) * CAUSTIC_ALPHA_WOBBLE)
        * windPresence;
      if (alpha < 0.02 || rx <= 0) continue;
      ctx.strokeStyle = `rgba(196, 234, 228, ${Math.min(1, alpha).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, 1.1 * zoom);
      ctx.beginPath();
      // Iso water plane: 2:1 ellipse matching the tile projection.
      ctx.ellipse(pX, pY, rx, rx * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawn += 1;
  }
  ctx.restore();
  return drawn;
}
