import { clamp } from "../motion-utils";
import type { SeaState } from "../sea-state";
import type { ShipMotionSample } from "../motion-types";
import type { ShipNode } from "../world-types";
import { clampMotionTileInto } from "./shared";

// ---------------------------------------------------------------------------
// W3.20 — Sea-room soft separation
// ---------------------------------------------------------------------------
//
// Per-frame relaxation pass over already-resolved ship samples. Pairs of ships
// whose tile-space distance falls below `radius` get nudged apart by half the
// shortfall, capped at `SEA_ROOM_MAX_NUDGE_PER_FRAME` to keep visual motion
// gentle. Moored ships and squad consorts are skipped so:
//   - docked ships stay tight to their berths
//   - squad consorts stay locked to their flagship formation
// Iteration is stable id-sorted so the (i, j) pair order is deterministic
// across frames — same inputs always produce the same nudge magnitudes.
//
// Radius modulates with `seaState.swell`: rough seas widen the comfort
// envelope (ships keep more sea-room when the swell is high), calm seas leave
// the base 0.7-tile radius unchanged.
//
// Reduced-motion is a no-op: under reduced motion the input samples are
// already the deterministic representative idle frame (see reducedMotionSampleInto)
// and applying separation would silently move ships out of their canonical
// position. The reduced-motion contract documents this in the cue registry.

export const SEA_ROOM_BASE_RADIUS_TILES = 0.7;
export const SEA_ROOM_MAX_NUDGE_PER_FRAME = 0.15;
const SEA_ROOM_SWELL_RADIUS_GAIN = 0.3;

export interface SeaRoomSeparationOptions {
  reducedMotion?: boolean;
  seaState?: SeaState | null;
}

interface SeaRoomCandidate {
  shipId: string;
  tile: { x: number; y: number };
  isConsort: boolean;
}

const seaRoomCandidatesScratch: SeaRoomCandidate[] = [];

function compareSeaRoomCandidate(a: SeaRoomCandidate, b: SeaRoomCandidate): number {
  return a.shipId < b.shipId ? -1 : a.shipId > b.shipId ? 1 : 0;
}

/**
 * Radius of the per-frame separation envelope, in tile units. Modulated by
 * the supplied sea state's swell so rougher seas widen the comfort envelope.
 * Calm seas return the base 0.7-tile radius.
 */
export function seaRoomSeparationRadius(seaState: SeaState | null | undefined): number {
  if (!seaState) return SEA_ROOM_BASE_RADIUS_TILES;
  const swell = clamp(seaState.swell, 0, 1);
  return SEA_ROOM_BASE_RADIUS_TILES * (1 + SEA_ROOM_SWELL_RADIUS_GAIN * swell);
}

/**
 * Post-pass over resolved ship motion samples that nudges any two non-moored,
 * non-consort ships apart by `(d - radius) / 2` along the separation axis,
 * capped at `SEA_ROOM_MAX_NUDGE_PER_FRAME` per ship per axis. Mutates the
 * sample tiles in-place. Returns the number of pairs nudged for telemetry.
 *
 * Stable id-sorted ordering keeps the (i, j) pair order deterministic across
 * frames, so the same set of inputs always yields the same outputs.
 *
 * Skips:
 *   - moored ships (state === "moored")
 *   - squad consorts (squadRole === "consort") — they shadow their flagship
 *   - ships without a resolved sample
 *
 * Reduced-motion is a hard no-op: representative idle frames are canonical
 * and must not be perturbed.
 */
export function applySeaRoomSeparationPass(
  samples: ReadonlyMap<string, ShipMotionSample>,
  ships: readonly ShipNode[],
  options: SeaRoomSeparationOptions = {},
): number {
  if (options.reducedMotion) return 0;
  if (samples.size === 0 || ships.length < 2) return 0;

  const radius = seaRoomSeparationRadius(options.seaState ?? null);
  const radiusSq = radius * radius;
  if (radius <= 0) return 0;

  seaRoomCandidatesScratch.length = 0;
  for (const ship of ships) {
    const sample = samples.get(ship.id);
    if (!sample) continue;
    if (sample.state === "moored") continue;
    if (ship.squadRole === "consort") continue;
    seaRoomCandidatesScratch.push({
      shipId: ship.id,
      tile: sample.tile,
      isConsort: false,
    });
  }
  if (seaRoomCandidatesScratch.length < 2) return 0;

  // Stable id-sorted so pair iteration is deterministic frame-to-frame.
  seaRoomCandidatesScratch.sort(compareSeaRoomCandidate);

  let nudgedPairs = 0;
  for (let i = 0; i < seaRoomCandidatesScratch.length; i += 1) {
    const a = seaRoomCandidatesScratch[i]!;
    for (let j = i + 1; j < seaRoomCandidatesScratch.length; j += 1) {
      const b = seaRoomCandidatesScratch[j]!;
      const dx = b.tile.x - a.tile.x;
      const dy = b.tile.y - a.tile.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= radiusSq) continue;
      const dist = Math.sqrt(distSq);
      // Degenerate-overlap fallback: nudge along the +x axis using stable id
      // order so the pair always splits the same way (a moves -x, b moves +x).
      let axisX: number;
      let axisY: number;
      if (dist <= 1e-6) {
        axisX = 1;
        axisY = 0;
      } else {
        axisX = dx / dist;
        axisY = dy / dist;
      }
      const halfShortfall = (radius - dist) / 2;
      const nudge = Math.min(halfShortfall, SEA_ROOM_MAX_NUDGE_PER_FRAME);
      clampMotionTileInto(a.tile.x - axisX * nudge, a.tile.y - axisY * nudge, a.tile);
      clampMotionTileInto(b.tile.x + axisX * nudge, b.tile.y + axisY * nudge, b.tile);
      nudgedPairs += 1;
    }
  }
  return nudgedPairs;
}
