import { seaBodyPlacement } from "../systems/sea-body-anchors";
import { seaBodyForArea, type SeaBodyName } from "../systems/sea-bodies";

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
 * D6: the board holds a roughly constant on-screen size.
 *
 * Screen size is proportional to worldScale x zoom, so a scale of k/zoom is
 * constant. Clamped at both ends: below 1 the board would shrink under its own
 * pilings when zoomed right in, and above the ceiling it would swamp the sea at
 * the widest framing.
 */
const SIGN_REFERENCE_ZOOM = 0.85;
const SIGN_MIN_SCALE = 0.85;
const SIGN_MAX_SCALE = 2.6;

export function seaSignScaleForZoom(zoom: number): number {
  const scale = SIGN_REFERENCE_ZOOM / Math.max(0.05, zoom);
  return Math.max(SIGN_MIN_SCALE, Math.min(SIGN_MAX_SCALE, scale));
}

/** Where one board ends up standing, in world units. */
export interface SeaSignSite {
  body: SeaBodyName;
  x: number;
  z: number;
}

const MIN_SEPARATION = 11;

/**
 * N1 siting, as a pure function of the body list.
 *
 * Boards are sited at each body's camera-facing frontier, and neighbouring
 * bodies can present that frontier at nearly the same point — Warning Shoals
 * and Danger Strait share a coast, and their first pass put one board on top of
 * the other. Any pair that lands too close is nudged apart along the axis the
 * camera reads as horizontal, nearest-to-camera moving last so it stays in
 * front of the water it names.
 *
 * The nudge is order-dependent, which is why this is shared rather than
 * reimplemented: the hit targets (N6) have to resolve the collisions the same
 * way the scene does, or a board's target lands on its neighbour.
 */
export function seaSignSites(bodies: readonly SeaBodyName[]): SeaSignSite[] {
  const sited: SeaSignSite[] = [];
  for (const body of bodies) {
    const placement = seaBodyPlacement(body);
    if (!placement) continue;
    let x = placement.tile.x * TILE_SCALE;
    let z = placement.tile.y * TILE_SCALE;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const clash = sited.find((other) => Math.hypot(other.x - x, other.z - z) < MIN_SEPARATION);
      if (!clash) break;
      // Slide along the screen-horizontal axis (world +x -z in this iso rig).
      x += MIN_SEPARATION * 0.55;
      z -= MIN_SEPARATION * 0.55;
    }
    sited.push({ body, x, z });
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
