/**
 * 3d — the beam settles on the largest PSI contributor.
 *
 * `stability.current.contributors` already had panel rows and a ledger clause;
 * what it had no way to reach was the world. The beacon is PharosVille's one
 * moving light, and it has always swept at an even rate — motion that said
 * nothing beyond the fleet's overall tempo. This makes the sweep point at
 * something: each revolution it slows across the bearing of the ship
 * contributing most to the index, and speeds back up over open water. A
 * lighthouse watching one vessel.
 *
 * ## Why a rate well and not an easing target
 *
 * A lighthouse does not reverse, stall, or jump, and a sweep that eased toward
 * a target and back would do at least two of those — worse, the target moves
 * every refresh, so it would also have to interpolate between old and new
 * bearings. Scaling the sweep RATE instead keeps the light turning one way,
 * continuously, forever: it is the same integration `world-renderer.ts` already
 * does, with a well cut into the rate. Nothing to reset, nothing to snap, and a
 * data refresh only moves where the well sits.
 *
 * The wording everywhere this surfaces is "largest PSI contributor" — the
 * largest term in a weighted sum, which is arithmetic. The light is watching,
 * not accusing.
 */

/**
 * How far the sweep slows in the well. At 0.62 the beam crosses the
 * contributor's bearing at ~38% of its open-water rate — a visible lingering
 * that still reads as one continuous turn, not a stop.
 */
const DWELL_DEPTH = 0.62;

/**
 * Half-width of the well, in radians. ~0.55 rad is a little over 30° — wide
 * enough that the slowdown is felt rather than glimpsed, narrow enough that the
 * rest of the revolution keeps its ordinary pace.
 */
const DWELL_WIDTH = 0.55;

/**
 * Bearing from the beacon to a point, in the beam group's own rotation.y units.
 *
 * The beam's cone lies along the group's local +X, and a rotation of `angle`
 * about +Y sends local +X to world (cos a, 0, -sin a). So the angle that points
 * at a world delta is `atan2(-dz, dx)` — the negated Z is the whole reason this
 * is a named function rather than an inline atan2 someone would later "fix".
 */
export function beamBearingTo(
  beacon: { x: number; z: number },
  target: { x: number; z: number },
): number {
  return Math.atan2(-(target.z - beacon.z), target.x - beacon.x);
}

/** Shortest signed angular distance between two bearings, in [-π, π]. */
export function angularDistance(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Multiplier on the sweep rate at `beamAngle`, given where the beam is meant to
 * dwell. Returns 1 when there is nothing to dwell on, so the caller needs no
 * branch and an absent contributor restores the plain even sweep exactly.
 *
 * The well is a raised cosine rather than a gaussian: it reaches exactly 1 at
 * the edges, so there is no discontinuity where the beam enters and leaves it,
 * and it needs no exp().
 */
export function beamDwellRateScale(beamAngle: number, dwellBearing: number | null): number {
  if (dwellBearing === null) return 1;
  const distance = Math.abs(angularDistance(beamAngle, dwellBearing));
  if (distance >= DWELL_WIDTH) return 1;
  const inside = 0.5 * (1 + Math.cos((distance / DWELL_WIDTH) * Math.PI));
  return 1 - DWELL_DEPTH * inside;
}

/**
 * Where the beam is parked when motion is off.
 *
 * Reduced motion loses the sweep entirely, so the cue has to survive as a
 * BEARING: the light holds on the contributor, and the lighthouse detail's Beam
 * bearing row names the ship it is holding on. Without a contributor it keeps
 * the composed pose the beam has always used.
 */
export const BEAM_PARKED_BEARING = -0.55;

export function beamStaticBearing(dwellBearing: number | null): number {
  return dwellBearing === null ? BEAM_PARKED_BEARING : dwellBearing;
}
