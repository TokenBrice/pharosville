import { Box3, MathUtils, Object3D, Vector3 } from "three";

/**
 * Overview LOD: one policy for the detail that cannot read at wide framing.
 *
 * Whole-map framing is the shot that shows the whole product, and it was the
 * one frame that broke the budget: 917 draw calls against a 700 ceiling at
 * `#cam=0,0,0.28`, where the Wave 1 landing framing (zoom 0.648) sits inside
 * it. The difference is not the fleet — the batches are 15 calls whatever the
 * zoom — it is that pulling back stops the frustum culling anything, so every
 * station and per-hero prop in the world pays a draw call (and a second one in
 * the shadow pass) to render as two or three pixels of mud.
 *
 * The repo already has the rule that says which props those are: the isometric
 * silhouette law (`scripts/pharosville/hero-silhouettes.mjs`) — a feature needs
 * roughly 0.7 world units of clearance to resolve. One world unit projects to
 * `TILE_HEIGHT × zoom` screen pixels, so at zoom 0.28 that clearance is about
 * three pixels and at the default 0.648 it is about seven. This module is the single
 * place that decides what that means for the scene graph, rather than a second
 * zoom mechanism per module: every shed prop is named, the names live in
 * `OVERVIEW_LOD_DETAIL_NAMES`, and the world is scanned once at build.
 *
 * Nothing analytical is shed. What goes is deck and shore furniture — dock
 * posts, lamp heads, lit screens, works signatures, the chain flag, the keeper's
 * rowboat and shore stones, the cottage lantern string, the quay stair, the
 * precinct obelisks, and the per-hero grade shield and overlay signal. The
 * harbour's structure, the fleet, the zones, the sea signs (which hold a
 * constant on-screen size for exactly this framing) and the monument all stay.
 */

/** At or above this zoom every shed prop is at its authored transform. */
export const OVERVIEW_LOD_FULL_ZOOM = 0.62;
/** At or below this zoom every shed prop is gone, costing nothing. */
export const OVERVIEW_LOD_HIDDEN_ZOOM = 0.44;

/**
 * The named props the overview policy sheds. Names are the ones the building
 * modules already give these nodes; `garden-overview-lod.test.ts` asserts the
 * composed world still answers to every one of them, so a rename upstream
 * fails loudly instead of silently un-culling the frame.
 *
 * Each entry is the HIGHEST node that is purely this prop, so shedding costs
 * one gate rather than one per mesh.
 */
export const OVERVIEW_LOD_DETAIL_NAMES: readonly string[] = [
  // World-wide named-water edge batches. At whole-map scale their small forms
  // become texture; visibility-only avoids collapsing the map toward origin.
  "garden-sea-edges-overview",
  // Globally batched station furniture.
  "dock-cargo-tide",
  "dock-chain-flag",
  "dock-tide-line",
  "dock-lamp-heads",
  "dock-posts",
  "harbor-netRack",
  "station-lit-screens",
  // The island's toy-scale grounding props, authored against a 34-unit Pharos.
  // W3.1 deleted the keeper-cottage lantern string outright (the Great
  // Quieting removed that glow vocabulary), so it no longer appears here.
  "island-quay-stair",
  "island-koi",
  "island-niwaki",
  "lighthouse-shore-props",
  "pharos-precinct-obelisks",
  // The rim body remains at whole-map framing; its distributed furniture is
  // less than a few pixels there and fades only by visibility.
  "garden-rim-path",
  "garden-rim-pines",
  "garden-rim-stones",
  // Per-hero badges, ×~29 hulls, and the three hero gull flocks.
  "ship-gull-flock",
  "ship-overview-detail",
];

/**
 * The registered names that are ONE group at the world origin holding a single
 * InstancedMesh spread across the whole harbour ring, rather than a node under
 * one dock.
 *
 * Their names read per-dock and they are not: every crate and quay plate is an
 * instance whose matrix already carries its own berth's world position, so the
 * group's transform is the RING's transform. Shrinking such a group about its
 * own centre — which is the ring's centroid, near the middle of the map —
 * scales the ring itself, sliding each crate tens of world units off its
 * harbour toward the island for the whole width of the fade band.
 *
 * So these fade by visibility alone and never take a transform. The same zoom
 * still sheds them; what goes is only the intermediate pose, which was wrong
 * everywhere it was drawn. A per-instance shrink would mean rewriting every
 * instance matrix per frame, and at three screen pixels there is nothing there
 * to see it.
 */
export const OVERVIEW_LOD_WHOLE_RING_NAMES: readonly string[] = [
  "garden-sea-edges-overview",
  "dock-cargo-tide",
  "dock-chain-flag",
  "dock-lamp-heads",
  "dock-posts",
  "dock-tide-line",
  "harbor-netRack",
  "station-lit-screens",
  "garden-rim-path",
  "garden-rim-pines",
  "garden-rim-stones",
];

interface OverviewLodEntry {
  readonly basePosition: Vector3;
  readonly baseScale: Vector3;
  readonly object: Object3D;
  /**
   * Where this prop's own centre sits in its parent's space, so the shrink
   * happens about the prop rather than about its parent's origin.
   */
  readonly pivotOffset: Vector3;
  /** False for whole-ring groups, which may only be shown or hidden. */
  readonly shrinks: boolean;
}

export interface GardenOverviewLod {
  /** 0 (shed) to 1 (authored), after easing. Exposed for tests. */
  readonly detail: number;
  /** How many props this policy governs in the composed world. */
  readonly entryCount: number;
  update(input: {
    deltaSeconds: number;
    reducedMotion: boolean;
    zoom: number;
  }): void;
}

/**
 * Matches the water's S2 tier easing: a frame-rate independent exponential
 * approach, so a zoom the camera steps rather than drags still resolves over
 * the same ~300 ms instead of snapping.
 */
const DETAIL_EASE_RATE = 12;

const scratchCentre = new Vector3();

export function overviewLodTargetDetail(zoom: number): number {
  return MathUtils.smoothstep(zoom, OVERVIEW_LOD_HIDDEN_ZOOM, OVERVIEW_LOD_FULL_ZOOM);
}

export function createGardenOverviewLod(root: Object3D): GardenOverviewLod {
  root.updateMatrixWorld(true);
  const names = new Set(OVERVIEW_LOD_DETAIL_NAMES);
  const wholeRing = new Set(OVERVIEW_LOD_WHOLE_RING_NAMES);
  const entries: OverviewLodEntry[] = [];
  root.traverse((object) => {
    if (!names.has(object.name)) return;
    const shrinks = !wholeRing.has(object.name);
    if (shrinks) {
      new Box3().setFromObject(object).getCenter(scratchCentre);
      object.worldToLocal(scratchCentre);
    } else {
      scratchCentre.set(0, 0, 0);
    }
    entries.push({
      basePosition: object.position.clone(),
      baseScale: object.scale.clone(),
      object,
      // The prop's matrix is T·R·S, so the centre contributes R·S·c to its
      // parent-space position; holding position + R·S·c fixed as S scales by f
      // is what keeps the prop shrinking in place.
      pivotOffset: scratchCentre.multiply(object.scale).applyQuaternion(object.quaternion).clone(),
      shrinks,
    });
  });

  let detail = 1;
  let applied = -1;
  return {
    get detail() {
      return detail;
    },
    entryCount: entries.length,
    update({ deltaSeconds, reducedMotion, zoom }) {
      const target = overviewLodTargetDetail(zoom);
      // Reduced motion draws ONE static frame, so it must land on the target
      // rather than part-way through an approach it will never finish.
      detail = reducedMotion || !Number.isFinite(deltaSeconds)
        ? target
        : detail + (target - detail) * (1 - Math.exp(-DETAIL_EASE_RATE * deltaSeconds));
      if (Math.abs(detail - target) < 0.001) detail = target;
      if (detail === applied) return;
      applied = detail;
      for (const entry of entries) {
        entry.object.visible = detail > 0;
        if (detail <= 0 || !entry.shrinks) continue;
        entry.object.scale.copy(entry.baseScale).multiplyScalar(detail);
        entry.object.position.copy(entry.basePosition)
          .addScaledVector(entry.pivotOffset, 1 - detail);
      }
    },
  };
}
