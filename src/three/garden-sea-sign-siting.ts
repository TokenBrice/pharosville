import { seaBodyPlacement, seaBodyTiles } from "../systems/sea-body-anchors";
import { seaBodyForArea, type SeaBodyName } from "../systems/sea-bodies";
import {
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  isWaterTileKind,
  terrainKindAt,
} from "../systems/world-layout";

/**
 * Where the sea boards stand, and how big their faces are — with no three.js in
 * the module graph.
 *
 * The hit targets (N6) must resolve the boards exactly as the scene draws them,
 * so this siting is shared rather than reimplemented. But the hit tester lives
 * in the world chunk and `garden-sea-signs.ts` imports three, so importing the
 * siting from there pulled the whole renderer across the lazy boundary: the
 * world chunk went 147 KiB -> 750 KiB while the renderer chunk emptied out.
 * Same total bytes, wrong side of the gate. Keep this file free of three.
 */

/** One world unit per tile, on the diagonal the isometric rig is built around. */
export const TILE_SCALE = Math.SQRT2;

// Board proportions, in world units at zoom 1.
export const BOARD_WIDTH = 7.2;
export const BOARD_HEIGHT = 1.9;
export const BOARD_BASE_Y = 2.5;
export const BOARD_THICKNESS = 0.22;
export const PILING_RADIUS = 0.16;
export const PILING_SPREAD = 2.4;

/**
 * The lettered face's true-scale footprint, as the hit-target projection needs
 * it: everything here is multiplied by `seaSignScaleForZoom` at draw time.
 */
export const SEA_SIGN_BOARD = {
  /** Height of the face's centre above the board's own origin. */
  baseY: BOARD_BASE_Y,
  height: BOARD_HEIGHT,
  width: BOARD_WIDTH,
  /** Squared to the isometric camera rather than to the body's own bearing. */
  yaw: Math.PI * 0.25,
} as const;

/**
 * D6: the board holds a roughly constant on-screen size — in three steps.
 *
 * Screen size is proportional to worldScale x zoom, so a scale of k/zoom holds
 * it constant, and `k / zoom` clamped to [0.85, 2.6] is what this used to be.
 * The end states were right and the transit was wrong: a continuous k/zoom is
 * the one object class in the world that ANIMATES AGAINST the camera gesture.
 * Pinch out and the sea, the fleet, the island and the tower all shrink
 * together while the boards swell to nearly 3x — the eye reads that as the
 * signage fighting the hand, which is the opposite of the composure the rest
 * of the motion hierarchy is built for.
 *
 * So the response is quantized (W0.7). Inside a band the board is an ordinary
 * world object: it scales with everything else and never moves on its own.
 * Crossing a band is a discrete event — one short eased settle, run by
 * `createSeaSignScaleTrack` below — not a continuous fight.
 *
 * The ladder is chosen against the old curve, not away from it:
 *
 * - `SEA_SIGN_SCALE_STEPS[0]` (0.85) and `[2]` (2.6) are exactly the old clamp
 *   endpoints, so the two END STATES the design was reviewed at are unchanged:
 *   near world scale when you are in among the hulls, drawn out of scale on the
 *   chart at whole-map framing, the way a landmark is on an old map.
 * - The middle rung sits at the geometric mid of its own band
 *   (`0.85 / sqrt(0.40 x 0.88)` = 1.433, kept as 1.43), which is the value that
 *   minimises the worst-case departure from the old constant-screen ideal. No
 *   zoom in the interactive range (0.28..2.4) reads more than ~1.5x off the
 *   on-screen size the continuous curve gave it.
 * - The band edges dodge the framings the world already spends its attention
 *   on: 0.40 sits below the overview-LOD fade (0.44..0.62) so the boards do not
 *   step in the same breath as the shore props shed, and 0.88 sits clear of
 *   both the reference default framing (0.648) and the explore threshold
 *   (1.05), including once hysteresis widens it to 0.827..0.933.
 */
/**
 * Board world scale per step, CLOSEST framing first. Index 0 is the zoomed-in
 * end (near world scale), the last index the whole-map end.
 */
export const SEA_SIGN_SCALE_STEPS = [0.85, 1.43, 2.6] as const;

/**
 * Nominal band edges, in zoom, one per gap in the ladder: `[i]` is the zoom
 * below which step `i` gives way to step `i + 1`. Descending, like the steps.
 */
export const SEA_SIGN_STEP_ZOOMS = [0.88, 0.4] as const;

/**
 * How far past a nominal edge the zoom must travel before the step actually
 * changes, as a fraction of that edge.
 *
 * Without it, a zoom parked on an edge — a trackpad pinch resting, a wheel
 * click landing there — would toggle the board between two rungs 1.7x apart,
 * which is a worse artefact than the swell this replaces. +-6% turns each edge
 * into a band (0.827..0.933 and 0.376..0.424) that a settled camera sits
 * inside without ever crossing.
 */
export const SEA_SIGN_STEP_HYSTERESIS = 0.06;

/** How long the settle onto a new step takes, in world-clock seconds. */
export const SEA_SIGN_STEP_FADE_SECONDS = 0.45;

/**
 * A frame delta longer than this means the loop was not running: a hidden tab,
 * a resumed render, or the on-demand single paints the reduced-motion path
 * draws. There is no gesture to stay calm against across a gap like that, and
 * easing over it would leave the board stranded mid-settle, so the step is
 * taken whole.
 */
const SEA_SIGN_STALE_FRAME_SECONDS = 0.25;

/** Which rung a zoom belongs to on its own, with no history. */
export function seaSignStepForZoom(zoom: number): number {
  let step = 0;
  for (const edge of SEA_SIGN_STEP_ZOOMS) {
    if (zoom < edge) step += 1;
  }
  return step;
}

/**
 * The rung a zoom moves to given the rung it is already on — the same edges,
 * each widened by `SEA_SIGN_STEP_HYSTERESIS` in the direction of travel. Loops
 * rather than steps once, so a camera reset that jumps the whole zoom range in
 * one frame still lands on the right rung.
 */
export function seaSignStepWithHysteresis(zoom: number, currentStep: number): number {
  let step = Math.max(0, Math.min(SEA_SIGN_SCALE_STEPS.length - 1, Math.round(currentStep)));
  // Zooming out: the board only grows once the zoom is clear BELOW the edge.
  while (step < SEA_SIGN_STEP_ZOOMS.length && zoom < SEA_SIGN_STEP_ZOOMS[step]! * (1 - SEA_SIGN_STEP_HYSTERESIS)) {
    step += 1;
  }
  // Zooming in: and only shrinks once it is clear ABOVE it.
  while (step > 0 && zoom >= SEA_SIGN_STEP_ZOOMS[step - 1]! * (1 + SEA_SIGN_STEP_HYSTERESIS)) {
    step -= 1;
  }
  return step;
}

/**
 * The SETTLED board scale for a zoom, as a pure function.
 *
 * This is the shared contract the hit targets (N6) resolve against, so it
 * carries no history and no easing: a hit rect built from it matches the drawn
 * board at every resting camera outside the hysteresis bands, and inside them
 * it is at most one rung out for as long as the camera sits there. Draw code
 * wants `createSeaSignScaleTrack`, which adds exactly the two things a pure
 * function cannot have: the hysteresis and the settle.
 */
export function seaSignScaleForZoom(zoom: number): number {
  return SEA_SIGN_SCALE_STEPS[seaSignStepForZoom(Math.max(0.05, zoom))]!;
}

/** What one frame tells the scale track. */
export interface SeaSignScaleFrame {
  /**
   * World-clock seconds since the last frame. Non-finite (a first frame) or
   * longer than the stale ceiling takes the step whole.
   */
  deltaSeconds: number;
  /**
   * Reduced motion draws ONE deterministic static frame, so the settle is not
   * merely instant — the hysteresis is bypassed too, and the track returns
   * exactly `seaSignScaleForZoom(zoom)`. A still frame has no flicker to
   * protect against, and no history worth carrying into it.
   */
  reducedMotion?: boolean;
  zoom: number;
}

export interface SeaSignScaleTrack {
  /** The scale to draw this frame. */
  readonly scale: number;
  /** Which rung the track has latched, for tests and diagnostics. */
  readonly step: number;
  advance(frame: SeaSignScaleFrame): number;
}

/** Ease-out cubic: the settle leaves the old rung briskly and arrives quietly. */
function easeOutStep(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return 1 - (1 - clamped) ** 3;
}

/**
 * The stateful half of D6: which rung is latched, and where in the settle
 * between two rungs the board currently is.
 *
 * The settle interpolates GEOMETRICALLY (`from x (target/from)^t`). A rung gap
 * is a ratio, not a difference — 0.85 -> 1.43 and 1.43 -> 2.6 are the same
 * visual move — and a linear ramp between them reads fast at the small end and
 * slow at the large one.
 */
export function createSeaSignScaleTrack(): SeaSignScaleTrack {
  let step: number | null = null;
  let scale = 0;
  let from = 0;
  let elapsed = SEA_SIGN_STEP_FADE_SECONDS;
  return {
    get scale() {
      return scale;
    },
    get step() {
      return step ?? 0;
    },
    advance({ deltaSeconds, reducedMotion = false, zoom }) {
      const safeZoom = Math.max(0.05, zoom);
      const nextStep = step === null || reducedMotion
        ? seaSignStepForZoom(safeZoom)
        : seaSignStepWithHysteresis(safeZoom, step);
      if (nextStep !== step) {
        from = step === null ? SEA_SIGN_SCALE_STEPS[nextStep]! : scale;
        elapsed = 0;
        step = nextStep;
      }
      const target = SEA_SIGN_SCALE_STEPS[step]!;
      if (
        reducedMotion
        || !Number.isFinite(deltaSeconds)
        || deltaSeconds > SEA_SIGN_STALE_FRAME_SECONDS
      ) {
        elapsed = SEA_SIGN_STEP_FADE_SECONDS;
        scale = target;
        return scale;
      }
      // A zero or negative delta is a repainted frame, not a paused one: hold
      // the settle where it is rather than completing or rewinding it.
      if (deltaSeconds > 0) elapsed = Math.min(SEA_SIGN_STEP_FADE_SECONDS, elapsed + deltaSeconds);
      const progress = easeOutStep(elapsed / SEA_SIGN_STEP_FADE_SECONDS);
      scale = progress >= 1 || from <= 0 ? target : from * (target / from) ** progress;
      return scale;
    },
  };
}

/** Where one board ends up standing, in world units. */
export interface SeaSignSite {
  body: SeaBodyName;
  x: number;
  z: number;
}

const MIN_SEPARATION = 11;

/**
 * Every map tile touched by the maximum-scale board or either piling.
 *
 * Expanding the oriented rectangle by a tile cell's projected half-width is
 * conservative: if a returned tile is water, neither the face nor a piling
 * can cross that tile's land square at any supported zoom rung.
 */
export function seaSignFootprintTiles(site: Pick<SeaSignSite, "x" | "z">): { x: number; y: number }[] {
  const scale = SEA_SIGN_SCALE_STEPS[SEA_SIGN_SCALE_STEPS.length - 1]!;
  const centreX = site.x / TILE_SCALE;
  const centreY = site.z / TILE_SCALE;
  const alongX = Math.cos(SEA_SIGN_BOARD.yaw);
  const alongY = -Math.sin(SEA_SIGN_BOARD.yaw);
  const acrossX = -alongY;
  const acrossY = alongX;
  const halfLength = Math.max(BOARD_WIDTH / 2, PILING_SPREAD + PILING_RADIUS) * scale / TILE_SCALE;
  const halfThickness = Math.max(BOARD_THICKNESS / 2, PILING_RADIUS) * scale / TILE_SCALE;
  const tileProjection = (Math.abs(alongX) + Math.abs(alongY)) * 0.5;
  const bound = Math.ceil(halfLength + tileProjection);
  const tiles: { x: number; y: number }[] = [];

  for (let y = Math.floor(centreY) - bound; y <= Math.ceil(centreY) + bound; y += 1) {
    for (let x = Math.floor(centreX) - bound; x <= Math.ceil(centreX) + bound; x += 1) {
      const dx = x - centreX;
      const dy = y - centreY;
      const along = Math.abs(dx * alongX + dy * alongY);
      const across = Math.abs(dx * acrossX + dy * acrossY);
      if (along <= halfLength + tileProjection && across <= halfThickness + tileProjection) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

function footprintIsWater(site: Pick<SeaSignSite, "x" | "z">): boolean {
  return seaSignFootprintTiles(site).every((tile) => (
    tile.x >= 0 && tile.y >= 0
    && tile.x < PHAROSVILLE_MAP_WIDTH && tile.y < PHAROSVILLE_MAP_HEIGHT
    && isWaterTileKind(terrainKindAt(tile.x, tile.y))
  ));
}

/**
 * N1 siting, as a pure function of the body list.
 *
 * Boards begin at each body's camera-facing frontier, and neighbouring bodies
 * can present that frontier at nearly the same point. Candidates are searched
 * outward through that body's own water until both the maximum-scale physical
 * footprint and the inter-board separation are clear.
 *
 * The search is order-dependent, which is why this is shared rather than
 * reimplemented: the hit targets (N6) have to resolve the same final sites as
 * the scene, or a board's target lands on its neighbour.
 */
export function seaSignSites(bodies: readonly SeaBodyName[]): SeaSignSite[] {
  const sited: SeaSignSite[] = [];
  for (const body of bodies) {
    const placement = seaBodyPlacement(body);
    if (!placement) continue;
    let best: SeaSignSite | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const tile of seaBodyTiles(body)) {
      const candidate = { body, x: tile.x * TILE_SCALE, z: tile.y * TILE_SCALE };
      if (!footprintIsWater(candidate)) continue;
      if (sited.some((other) => Math.hypot(other.x - candidate.x, other.z - candidate.z) < MIN_SEPARATION)) continue;
      const distance = (tile.x - placement.tile.x) ** 2 + (tile.y - placement.tile.y) ** 2;
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    // A missing sign is safer than a board or piling planted through land.
    if (best) sited.push(best);
  }
  return sited;
}

/** The area fields the board list reads. Structural, so any world area fits. */
export interface SeaSignArea {
  band?: string | null;
  detailId: string;
  label: string;
  riskPlacement?: string | null;
}

/** A sited board together with the detail its name opens, if it has one. */
export interface SeaSignBoard extends SeaSignSite {
  /** Null for the wreck shoals, which are a place with no area record. */
  detailId: string | null;
  label: string;
}

/**
 * Every board the world draws, in the order the renderer builds its specs —
 * which is the order the separation nudge above depends on.
 */
export function seaSignBoards(areas: readonly SeaSignArea[]): SeaSignBoard[] {
  const named: { body: SeaBodyName; detailId: string | null; label: string }[] = [];
  for (const area of areas) {
    const body = seaBodyForArea(area);
    if (!body) continue;
    named.push({ body, detailId: area.detailId, label: area.label });
  }
  named.push({ body: "wreck", detailId: null, label: "Wreck Shoals" });

  const siteByBody = new Map(seaSignSites(named.map((entry) => entry.body)).map((site) => [site.body, site]));
  const boards: SeaSignBoard[] = [];
  for (const entry of named) {
    const site = siteByBody.get(entry.body);
    if (site) boards.push({ ...entry, x: site.x, z: site.z });
  }
  return boards;
}
