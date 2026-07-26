import { PHAROSVILLE_DESIGN_SPAN, PHAROSVILLE_MAP_SCALE } from "./map-scale";
import type { TerrainKind } from "./world-types";

/**
 * Z1 (Sea Master, 2026-07-25): the sea's bodies of water, as a coastline.
 *
 * ## What this replaces
 *
 * The DEWS bands used to be a cascade of half-planes, rectangles and three
 * concentric circles around the (55, 0) map corner. Rendered out, that is
 * exactly what it looks like: `x <= 30 && y <= 9` for Ledger Mooring is a
 * literal rectangle 78 world tiles wide, the Alert/Warning/Danger stack is an
 * onion of rings, and the Calm/Watch boundary is a dead-straight vertical line
 * 35 tiles long. A domain warp was added at RENDER time to hide the ruler
 * lines, but ~12 tiles of wobble on a line 140 tiles long does not hide it, and
 * it made the drawn edge disagree with the classified one (measured: 13.7% of
 * the sea was painted a different region than the simulation used).
 *
 * Worse, Calm was not authored at all. `terrainKindAt` ended with
 * `return "calm-water"`, so every tile no named test claimed became Calm — 43%
 * of the sea, 37% of it nowhere near the authored anchorage.
 *
 * ## How this works
 *
 * Each body is a small union of SEEDS — capsules (a segment with a radius) and
 * discs — and a tile belongs to whichever body's seed is nearest, measured as a
 * signed distance and offset by a per-body `reach`:
 *
 *     body(p) = argmin_i ( sdf_i(p) - reach_i )
 *
 * That is a generalised Voronoi diagram over extended shapes, which buys four
 * properties the cascade could not have:
 *
 * - **Total coverage, no slivers.** Every water tile belongs to exactly one
 *   body by construction. There is no fallback, so no body can become the
 *   residue the way Calm did.
 * - **Organic boundaries.** The edge between two capsules is a curve, not a
 *   line. Coastlines fall out of the geometry instead of being noised on top.
 * - **Area is a dial.** `reach` moves a body's whole frontier in or out, so
 *   hitting a target share is a calibration rather than a re-author. See
 *   `SEA_BODY_TARGET_SHARE` and scripts/pharosville/calibrate-sea-bodies.mjs.
 * - **One warp, applied to the LOOKUP.** The domain warp lives here, in
 *   classification, so the boundary ships obey IS the boundary the water
 *   shader draws. Display and data cannot drift.
 *
 * ## Space
 *
 * Seeds are authored in NORMALISED map space — u east, v south, both 0..1 —
 * rather than the 56-tile design space the old predicates used. Normalised
 * space is scale-free (it survives any future `PHAROSVILLE_MAP_SCALE` change
 * for free) and it is the space the composition is actually reasoned about in:
 * "the bay in the island's lee", not "x <= 15".
 */

export type SeaBodyName =
  | "calm"
  | "watch"
  | "alert"
  | "warning"
  | "danger"
  | "ledger"
  | "wreck"
  | "open";

export const SEA_BODY_TERRAIN: Record<SeaBodyName, TerrainKind> = {
  alert: "alert-water",
  calm: "calm-water",
  danger: "storm-water",
  ledger: "ledger-water",
  open: "water",
  warning: "warning-water",
  watch: "watch-water",
  wreck: "wreck-water",
};

/** A segment with a radius. A disc is the degenerate case where a == b. */
interface Seed {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
}

const disc = (x: number, y: number, r: number): Seed => ({ ax: x, ay: y, bx: x, by: y, r });
const capsule = (ax: number, ay: number, bx: number, by: number, r: number): Seed => ({ ax, ay, bx, by, r });

interface SeaBody {
  name: SeaBodyName;
  seeds: readonly Seed[];
}

/**
 * How far each body's frontier pushes against its neighbours, in normalised
 * units — the area dial. Shapes decide FORM; `reach` decides how much sea a
 * form is granted.
 *
 * These are SOLVED, not hand-picked: `npm run calibrate:sea-bodies` runs a
 * fixed-point iteration against `SEA_BODY_TARGET_SHARE` and prints the values
 * below. Re-run it after moving any seed.
 */
export const SEA_BODY_REACH: Record<SeaBodyName, number> = {
  calm: 0.0357,
  ledger: 0.0794,
  watch: -0.071,
  alert: 0.066,
  warning: -0.0137,
  danger: -0.0937,
  wreck: -0.0853,
  open: 0.0826,
};

/**
 * The composition (decision D4: the narrative poles hold).
 *
 * The island sits at roughly (0.53, 0.54). Danger stays in the north-east and
 * the wreck shoals in the south-west, so the map still reads danger at one pole
 * and memory at the other, and the DEWS escalation stays monotonic along a
 * north-east bearing: Calm -> open sea -> Watch -> Alert -> Warning -> Danger.
 * What changes is that each one is now a PLACE.
 */
const SEA_BODIES: readonly SeaBody[] = [
  {
    // The great sheltered bay in the island's lee — west and south-west, with
    // its mouth opening south-east past the anchorage head. The biggest body by
    // traffic (60% of the fleet), but one bay with one coastline rather than an
    // L wrapped round the map.
    name: "calm",
    seeds: [
      capsule(0.10, 0.30, 0.16, 0.62, 0.16),
      capsule(0.16, 0.62, 0.42, 0.76, 0.13),
      capsule(0.12, 0.22, 0.34, 0.26, 0.10),
    ],
  },
  {
    // The mooring shelf along the northern shore: a long bar with a scalloped
    // southern edge, not the rectangle it used to be.
    name: "ledger",
    seeds: [
      capsule(0.06, 0.09, 0.24, 0.14, 0.085),
      capsule(0.26, 0.07, 0.44, 0.12, 0.075),
      disc(0.17, 0.21, 0.065),
    ],
  },
  {
    // The working sea east and south-east of the island, behind the breakwater
    // arc — the water between the anchorage and the alert channel.
    name: "watch",
    seeds: [
      capsule(0.72, 0.46, 0.80, 0.80, 0.12),
      // Out to the south-east corner: the TON pigeonnier islet sits at (0.91,
      // 0.91) and is authored as standing off the Watch shelf, so Watch has to
      // reach it or the wharf ends up in unnamed open sea.
      capsule(0.56, 0.84, 0.95, 0.93, 0.085),
    ],
  },
  {
    // The approach channel: the outermost of three bands you cross sailing out
    // toward the storm corner, and the widest, so "channel" means channel.
    name: "alert",
    seeds: [
      capsule(0.755, 0.04, 0.66, 0.26, 0.075),
      capsule(0.68, 0.24, 0.62, 0.44, 0.065),
    ],
  },
  {
    // The shoals inshore of the strait — a thinner band between the approach
    // and the channel itself.
    //
    // Its seed sits BESIDE Danger's, not around it. An earlier pass had Warning
    // as a wider capsule on the same axis, which cannot work: a strictly larger
    // capsule is nearer everywhere along that axis, so Danger could never win a
    // single tile and the solver inflated its reach until the partition
    // degenerated into wedges.
    name: "warning",
    seeds: [capsule(0.875, 0.02, 0.775, 0.30, 0.055)],
  },
  {
    // The strait itself: narrow and long, hugging the north-east corner and
    // opening to the map edge. It used to be a disc in that corner.
    name: "danger",
    seeds: [capsule(0.975, 0.015, 0.86, 0.30, 0.065)],
  },
  {
    // The graveyard, unchanged in place: the far pole from the storm corner.
    name: "wreck",
    seeds: [capsule(0.08, 0.82, 0.24, 0.95, 0.11)],
  },
  {
    // Deliberately unnamed open sea (decision D2). The island's own approach
    // ring, a channel running south to the map edge, and the northern gap
    // between the mooring shelf and the alert channel.
    //
    // This is the body that makes the others read. Named waters only look like
    // BODIES when there is unclaimed sea between them; without it the map is a
    // pie chart. It is also the composition's breathing room and the
    // "asymmetric, sea-first, intentionally open" invariant, made real.
    name: "open",
    seeds: [
      disc(0.53, 0.54, 0.17),
      capsule(0.56, 0.64, 0.70, 0.98, 0.10),
      capsule(0.42, 0.14, 0.56, 0.34, 0.08),
    ],
  },
];

/**
 * Target share of the sea per body (decision D1 for Calm's 30%).
 *
 * Sized against the STRUCTURAL fleet distribution, not a live snapshot — the
 * terrain field is compile-time constant, and most stablecoins are pegged most
 * of the time, so Calm's dominance is real and should stay. Compressed so no
 * body becomes unreadable: measured against the live fleet the old partition
 * ran a 13x density spread (Watch at 3.0 ships per 1000 tiles while Danger ran
 * 39.7); these targets bring it to about 3x.
 */
export const SEA_BODY_TARGET_SHARE: Record<SeaBodyName, number> = {
  calm: 0.30,
  open: 0.24,
  watch: 0.12,
  ledger: 0.10,
  alert: 0.08,
  wreck: 0.07,
  danger: 0.05,
  warning: 0.04,
};

// --- the warp ---------------------------------------------------------------

/**
 * Z2: the domain warp, applied HERE — to the classification lookup — and
 * nowhere else.
 *
 * It used to live in the renderer's field bake, which meant the water shader
 * drew a warped edge while ships, buoys, labels and motion obeyed the crisp
 * one. Measured, 13.7% of the sea was painted a different body than the
 * simulation used, rising to 70% for open water and 39% for Warning Shoals.
 *
 * Warping the lookup instead makes the warped edge the ONLY edge, so display
 * and data cannot disagree by construction.
 *
 * Amplitude is in normalised units, and it has to be big to do anything: a
 * nearest-seed partition of a square produces long, near-straight mutual
 * boundaries, and the map is 140 tiles across, so the 0.045 this started at
 * (about six tiles of wander) barely dented them. 0.10 is fourteen tiles, which
 * is what it takes to read as a coast rather than as a ruled line — and the
 * `reach` calibration is re-solved against the warped field, so the areas hold.
 */
const WARP_AMPLITUDE = 0.10;

function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

/**
 * Three octaves: one to bend the coast into bays and headlands, one to break
 * those into inlets, one to roughen the line itself.
 */
function warpChannel(x: number, y: number): number {
  return (smoothNoise(x * 2.2, y * 2.2) - 0.5) * 1.35
    + (smoothNoise(x * 5.3 + 11.3, y * 5.3 - 4.7) - 0.5) * 0.6
    + (smoothNoise(x * 11.7 - 6.1, y * 11.7 + 2.9) - 0.5) * 0.25;
}

// --- the partition ----------------------------------------------------------

/** Squared distance from p to segment ab. */
function segmentDistance(px: number, py: number, seed: Seed): number {
  const dx = seed.bx - seed.ax;
  const dy = seed.by - seed.ay;
  const lengthSquared = dx * dx + dy * dy;
  let t = 0;
  if (lengthSquared > 1e-9) {
    t = ((px - seed.ax) * dx + (py - seed.ay) * dy) / lengthSquared;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const cx = seed.ax + dx * t;
  const cy = seed.ay + dy * t;
  return Math.hypot(px - cx, py - cy);
}

function bodyDistance(px: number, py: number, body: SeaBody): number {
  let best = Number.POSITIVE_INFINITY;
  for (const seed of body.seeds) {
    const distance = segmentDistance(px, py, seed) - seed.r;
    if (distance < best) best = distance;
  }
  return best - SEA_BODY_REACH[body.name];
}

const MAP_SPAN = PHAROSVILLE_DESIGN_SPAN * PHAROSVILLE_MAP_SCALE;
const MAP_LAST = MAP_SPAN - 1;

/**
 * The body a world tile belongs to.
 *
 * Pure and cheap: eight bodies, fifteen seeds, no allocation. Callers that need
 * it per-tile over the whole map (the renderer's field bake, the coverage
 * guard) run it 19 000 times, which is well under a millisecond.
 */
export function seaBodyAtTile(x: number, y: number): SeaBodyName {
  const u = x / MAP_LAST;
  const v = y / MAP_LAST;
  const wu = u + warpChannel(u, v) * WARP_AMPLITUDE;
  const wv = v + warpChannel(v + 3.7, u - 1.9) * WARP_AMPLITUDE;

  let bestName: SeaBodyName = "open";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const body of SEA_BODIES) {
    const distance = bodyDistance(wu, wv, body);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = body.name;
    }
  }
  return bestName;
}

/** The terrain kind a world tile's sea body maps to. */
export function seaTerrainAtTile(x: number, y: number): TerrainKind {
  return SEA_BODY_TERRAIN[seaBodyAtTile(x, y)];
}

/** Every body name, in a stable order — for guards and the calibrator. */
export const SEA_BODY_NAMES: readonly SeaBodyName[] = SEA_BODIES.map((body) => body.name);
