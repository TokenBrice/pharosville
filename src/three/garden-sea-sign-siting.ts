import { seaBodyPlacement, seaBodyTiles } from "../systems/sea-body-anchors";
import { seaBodyForArea, type SeaBodyName } from "../systems/sea-bodies";
import {
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
  isWaterTileKind,
  terrainKindAt,
} from "../systems/world-layout";

/**
 * Where the sea steles stand, and how big their carved faces are — with no three.js in
 * the module graph.
 *
 * The hit targets (N6) must resolve the steles exactly as the scene draws them,
 * so this siting is shared rather than reimplemented. But the hit tester lives
 * in the world chunk and `garden-sea-signs.ts` imports three, so importing the
 * siting from there pulled the whole renderer across the lazy boundary: the
 * world chunk went 147 KiB -> 750 KiB while the renderer chunk emptied out.
 * Same total bytes, wrong side of the gate. Keep this file free of three.
 */

/** One world unit per tile, on the diagonal the isometric rig is built around. */
export const TILE_SCALE = Math.SQRT2;

// Low stele proportions in world units. The overview rung enlarges each whole
// stele discretely; it is not continuous billboard compensation.
export const STELE_WIDTH = 5.6;
export const STELE_FACE_HEIGHT = 1.25;
export const STELE_FACE_BASE_Y = 0.9;
export const STELE_DEPTH = 0.6;

/**
 * The lettered face's true-scale footprint. Draw and hit projection both
 * multiply this by the renderer track's current scale.
 */
export const SEA_SIGN_STELE = {
  /** Height of the face's centre above the stele's own origin. */
  baseY: STELE_FACE_BASE_Y,
  height: STELE_FACE_HEIGHT,
  width: STELE_WIDTH,
  /** Squared to the isometric camera rather than to the body's own bearing. */
  yaw: Math.PI * 0.25,
} as const;

/**
 * W2a fix: the stele is true-scale in the inhabited camera range and gets one
 * chart-scale overview rung below zoom 0.4.
 *
 * Screen size is proportional to worldScale x zoom, so a scale of k/zoom holds
 * it constant, and `k / zoom` clamped to [0.85, 2.6] is what this used to be.
 * The end states were right and the transit was wrong: a continuous k/zoom is
 * the one object class in the world that ANIMATES AGAINST the camera gesture.
 * Pinch out and the sea, the fleet, the island and the tower all shrink
 * together while the boards swelled to nearly 3x — the eye read that as the
 * signage fighting the hand, which is the opposite of the composure the rest
 * of the motion hierarchy is built for.
 *
 * The old three-step ladder preserved near-constant screen size, but the map
 * read as labels resisting the camera. Stone stele UP; billboard-like scale
 * compensation DOWN. One discrete far rung makes an active carving readable
 * on the chart without making it continuously fight the camera gesture.
 */
/**
 * Stele world scale per step: inhabited world first, whole-map chart second.
 */
export const SEA_SIGN_SCALE_STEPS = [1, 3.2] as const;

/**
 * Nominal band edges, in zoom, one per gap in the ladder: `[i]` is the zoom
 * below which step `i` gives way to step `i + 1`. Descending, like the steps.
 */
export const SEA_SIGN_STEP_ZOOMS: readonly number[] = [0.4];

/**
 * How far past a nominal edge the zoom must travel before the step actually
 * changes, as a fraction of that edge.
 *
 * Without it, a zoom parked on an edge — a trackpad pinch resting, a wheel
 * click landing there — would toggle the old board between two rungs 1.7x apart,
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
 * easing over it would leave a sign stranded mid-settle, so the step is
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
  // Zooming out: a multi-rung sign only grows clear BELOW the edge.
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
 * The SETTLED stele scale for a zoom, as a pure function.
 *
 * This carries no history and is only a fallback for snapshots built before a
 * live renderer exists. Live hit targets consume `createSeaSignScaleTrack`'s
 * current value after the frame is drawn, including hysteresis and easing.
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
 * between two rungs the sign currently is.
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

/** Where one stele ends up standing, in world units. */
export interface SeaSignSite {
  body: SeaBodyName;
  x: number;
  z: number;
}

const MIN_SEPARATION = 11;

/**
 * Every map tile touched by the stele at its maximum overview rung.
 *
 * Expanding the oriented rectangle by a tile cell's projected half-width is
 * conservative: if every returned tile is water, the full stone volume cannot
 * cross a land square at any supported zoom rung.
 */
export function seaSignFootprintTiles(site: Pick<SeaSignSite, "x" | "z">): { x: number; y: number }[] {
  const scale = SEA_SIGN_SCALE_STEPS[SEA_SIGN_SCALE_STEPS.length - 1]!;
  const centreX = site.x / TILE_SCALE;
  const centreY = site.z / TILE_SCALE;
  const alongX = Math.cos(SEA_SIGN_STELE.yaw);
  const alongY = -Math.sin(SEA_SIGN_STELE.yaw);
  const acrossX = -alongY;
  const acrossY = alongX;
  const halfLength = STELE_WIDTH / 2 * scale / TILE_SCALE;
  const halfThickness = STELE_DEPTH / 2 * scale / TILE_SCALE;
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
 * Steles begin at each body's camera-facing frontier, and neighbouring bodies
 * can present that frontier at nearly the same point. Candidates are searched
 * outward through that body's own water until both the maximum-scale physical
 * footprint and the inter-stele separation are clear.
 *
 * The search is order-dependent, which is why this is shared rather than
 * reimplemented: the hit targets (N6) have to resolve the same final sites as
 * the scene, or a stele's target lands on its neighbour.
 */
export function seaSignSites(bodies: readonly SeaBodyName[]): SeaSignSite[] {
  const sited: SeaSignSite[] = [];
  for (const body of bodies) {
    const placement = seaBodyPlacement(body);
    if (!placement) continue;
    // The authored rim closes around Wreck Shoal on the west and south. Keep
    // its reviewed inlet footing rather than letting geometry-width changes
    // drift the marker back toward either bank.
    const preferredTile = body === "wreck" ? { x: 50, y: 122 } : placement.tile;
    let best: SeaSignSite | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const tile of seaBodyTiles(body)) {
      const candidate = { body, x: tile.x * TILE_SCALE, z: tile.y * TILE_SCALE };
      if (!footprintIsWater(candidate)) continue;
      if (sited.some((other) => Math.hypot(other.x - candidate.x, other.z - candidate.z) < MIN_SEPARATION)) continue;
      const distance = (tile.x - preferredTile.x) ** 2 + (tile.y - preferredTile.y) ** 2;
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    // A missing sign is safer than a stele planted through land.
    if (best) sited.push(best);
  }
  return sited;
}

/** The area fields the stele list reads. Structural, so any world area fits. */
export interface SeaSignArea {
  id?: string | null;
  band?: string | null;
  detailId: string;
  label: string;
  riskPlacement?: string | null;
}

/** A sited stele together with the detail its name opens, if it has one. */
export interface SeaSignStele extends SeaSignSite {
  detailId: string;
  label: string;
}

/**
 * Every stele the world draws, in the order the renderer builds its specs —
 * which is the order the separation nudge above depends on.
 */
export function seaSignSteles(areas: readonly SeaSignArea[]): SeaSignStele[] {
  const named: { body: SeaBodyName; detailId: string; label: string }[] = [];
  for (const area of areas) {
    const body = seaBodyForArea(area);
    if (!body) continue;
    named.push({ body, detailId: area.detailId, label: area.label });
  }
  const siteByBody = new Map(seaSignSites(named.map((entry) => entry.body)).map((site) => [site.body, site]));
  const steles: SeaSignStele[] = [];
  for (const entry of named) {
    const site = siteByBody.get(entry.body);
    if (site) steles.push({ ...entry, x: site.x, z: site.z });
  }
  return steles;
}
