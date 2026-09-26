/**
 * Renderer detail policy: every camera-keyed level-of-detail decision the
 * Three.js world makes, resolved in ONE place.
 *
 * Extracted from `world-renderer.ts` (Hour-Print W0.24). Before this seam the
 * semantic view (overview / explore / analyze), the overview-LOD ease, the
 * fleet-thinning zoom, the sea-sign and cloth-weave zoom, the zone-buoy and
 * fine-detail toggles, and the AO framing ramp each read `frame.camera.zoom`
 * at their own call site. Now `resolveRendererDetailPolicy` is the only
 * function here that reads the camera; the renderer resolves it once per
 * frame, before content reconciliation, and every consumer reads the record.
 *
 * W1.0 re-keyed it from the rig's zoom to the POSE: every measure below derives
 * from the shown view's eye-to-target stand-off (`cameraDetailZoom` on the
 * viewport-free 1000 px reference scale; `cameraPixelZoom` on this viewport's
 * screen scale, which equals the rig zoom, so the whole-map pull-out keeps its
 * thresholds exactly). An explicit `rest` state — the rest ShotSpec showing,
 * at rest or mid hand-off — holds explore-level truth carriers (zone buoys,
 * fine detail), full props and zero fleet thinning at every viewport.
 *
 * The helpers below apply the record: they own the stateful parts (the
 * overview-LOD ease, the zone-buoy field) and the hover/selection exceptions,
 * never a second zoom read.
 */
import { MathUtils } from "three";
import type { ThreeWorldRendererFrame } from "../renderer/world-renderer-backend";
import { seaQualityTier } from "../renderer/render-scheduler";
import {
  GARDEN_EXPLORE_DETAIL_ZOOM,
  gardenSemanticView,
  type GardenSemanticView,
} from "../systems/garden-observatory-slice";
import {
  gardenFleetDisplayPresence,
  gardenFleetThinningZoom,
  type GardenFleetThinningShip,
} from "../systems/garden-fleet-thinning";
import { cameraAtRest, cameraDetailZoom, cameraPixelZoom } from "../systems/projection";
import { GARDEN_BREATH_PHASE, gardenBreathAt } from "../systems/weather";
import { OVERVIEW_LOD_FULL_ZOOM, type GardenOverviewLod } from "./garden-overview-lod";
import type { ShipVisual } from "./garden-ships";
import { updateZoneBuoys, type ZoneField, type ZoneVisual } from "./garden-zones";

export interface RendererDetailPolicy {
  /** The rest ShotSpec is showing (at rest or mid hand-off): explore-level truth, no thinning. */
  rest: boolean;
  /** `gardenSemanticView(detailZoom, selection)`: overview, explore or analyze. */
  semanticView: GardenSemanticView;
  /**
   * Explore framing reveals every ship's and dock's fine-detail group; other
   * views show it only on the hovered or selected entity.
   */
  showWorldDetail: boolean;
  /**
   * Local wake quads: the whole fleet, or (analyze, where a selection owns the
   * hierarchy) only a hull whose fine detail is showing.
   */
  wakes: "fleet" | "inspected";
  /**
   * Zone boundary buoys: hidden at overview, every body in explore, only the
   * hovered/selected body in analyze.
   */
  zoneBuoys: "hidden" | "all" | "focused";
  /** Screen-scale zoom the overview-LOD ease targets (props shed between 0.62 and 0.44). */
  overviewLodZoom: number;
  /** Screen-scale zoom the reversible wide-frame fleet thinning reads. */
  fleetThinningZoom: number;
  /** Screen-scale zoom the fleet's cloth-weave ramp reads (`setFleetAerialPerspective`). */
  fleetClothZoom: number;
  /** Screen-scale zoom the sea-sign scale track compensates for. */
  seaSignZoom: number;
  /**
   * N8AO framing target. N8AO is close-view grounding: the landing frame
   * (0.648) and whole-map frame both rely on the static sun shadows and
   * release its seven private textures; inspection restores it between 0.66
   * and 0.90. The renderer eases toward this target.
   */
  aoFramingTarget: number;
}

export type RendererDetailPolicyFrame = Pick<ThreeWorldRendererFrame, "camera" | "height" | "selectedDetailId" | "width">;

type InspectionFrame = Pick<ThreeWorldRendererFrame, "hoveredDetailId" | "selectedDetailId">;

/** One record per renderer; `resolveRendererDetailPolicy` rewrites it in place. */
export function createRendererDetailPolicy(): RendererDetailPolicy {
  return {
    rest: false,
    semanticView: "overview",
    showWorldDetail: false,
    wakes: "fleet",
    zoneBuoys: "hidden",
    overviewLodZoom: 1,
    fleetThinningZoom: 1,
    fleetClothZoom: 1,
    seaSignZoom: 1,
    aoFramingTarget: 1,
  };
}

/** The single camera read behind every detail decision. */
export function resolveRendererDetailPolicy(
  frame: RendererDetailPolicyFrame,
  out: RendererDetailPolicy,
): RendererDetailPolicy {
  const viewport = { x: frame.width, y: frame.height };
  const rest = cameraAtRest(frame.camera);
  const detailZoom = cameraDetailZoom(frame.camera, viewport);
  const pixelZoom = cameraPixelZoom(frame.camera, viewport);
  const semanticView = gardenSemanticView(
    rest ? Math.max(detailZoom, GARDEN_EXPLORE_DETAIL_ZOOM) : detailZoom,
    frame.selectedDetailId,
  );
  out.rest = rest;
  out.semanticView = semanticView;
  out.showWorldDetail = semanticView === "explore";
  out.wakes = semanticView === "analyze" ? "inspected" : "fleet";
  out.zoneBuoys = semanticView === "explore"
    ? "all"
    : semanticView === "analyze" ? "focused" : "hidden";
  out.overviewLodZoom = rest ? Math.max(pixelZoom, OVERVIEW_LOD_FULL_ZOOM) : pixelZoom;
  out.fleetThinningZoom = gardenFleetThinningZoom(frame.camera, viewport);
  out.fleetClothZoom = pixelZoom;
  out.seaSignZoom = pixelZoom;
  out.aoFramingTarget = MathUtils.smoothstep(detailZoom, 0.66, 0.9);
  return out;
}

/** Fine-detail groups: every entity in explore, else the hovered/selected one. */
export function gardenFineDetailVisible(
  policy: RendererDetailPolicy,
  detailId: string,
  frame: InspectionFrame,
): boolean {
  return policy.showWorldDetail
    || detailId === frame.hoveredDetailId
    || detailId === frame.selectedDetailId;
}

/**
 * The detail half of a hull's wake gate. Wakes remain a fleet-motion cue in
 * overview/explore; in analyze only the focused hull keeps its wake, so
 * unrelated foam cannot compete with its ring, route, or panel.
 */
export function gardenWakeDetailVisible(
  policy: RendererDetailPolicy,
  overviewDetail: number,
  fineDetailVisible: boolean,
): boolean {
  return overviewDetail > 0
    && (policy.wakes === "fleet" || fineDetailVisible);
}

// Reused argument record: `GardenOverviewLod.update` destructures on entry.
const scratchOverviewLodFrame = { deltaSeconds: 0, reducedMotion: false, zoom: 1 };

/**
 * Tier 3 #15: the far half of the detail policy. `showWorldDetail` reveals
 * inspection detail on the way IN (explore, detail zoom >= 1.05); this sheds the
 * props that stop resolving on the way OUT, easing them away between 0.62 and
 * 0.44 so nothing pops. Default framing (0.648) is above the band and pays
 * nothing for either. Returns the eased detail (0..1).
 */
export function advanceGardenOverviewDetail(
  overviewLod: GardenOverviewLod,
  policy: RendererDetailPolicy,
  deltaSeconds: number,
  reducedMotion: boolean,
): number {
  scratchOverviewLodFrame.deltaSeconds = deltaSeconds;
  scratchOverviewLodFrame.reducedMotion = reducedMotion;
  scratchOverviewLodFrame.zoom = policy.overviewLodZoom;
  overviewLod.update(scratchOverviewLodFrame);
  return overviewLod.detail;
}

/**
 * Per-hull display presence for the reversible wide-frame thinning. The
 * hovered and selected hulls are exempt, so resolve their ship ids first.
 */
export function resolveGardenFleetDisplayPresence(
  ships: readonly ShipVisual[],
  thinningShips: readonly GardenFleetThinningShip[],
  frame: InspectionFrame,
  policy: RendererDetailPolicy,
): Map<string, number> {
  const selectedShipId = frame.selectedDetailId
    ? ships.find(({ ship }) => ship.detailId === frame.selectedDetailId)?.ship.id ?? null
    : null;
  const hoveredShipId = frame.hoveredDetailId
    ? ships.find(({ ship }) => ship.detailId === frame.hoveredDetailId)?.ship.id ?? null
    : null;
  return gardenFleetDisplayPresence({
    hoveredShipId,
    selectedShipId,
    ships: thinningShips,
    zoom: policy.fleetThinningZoom,
  });
}

/**
 * Boundary buoys are inspectable landmarks, not ambient scenery: hide them at
 * overview and isolate them to the focused risk body during analyze.
 */
export function updateGardenZoneBuoyDetail(
  content: { zoneField: ZoneField; zones: readonly ZoneVisual[] },
  frame: InspectionFrame & Pick<ThreeWorldRendererFrame, "reducedMotion" | "renderScheduler" | "timeSeconds">,
  policy: RendererDetailPolicy,
  breathTime: number,
): void {
  const focusedAreaDetailId = content.zones.find(({ area }) => (
    area.detailId === frame.selectedDetailId
    || area.detailId === frame.hoveredDetailId
  ))?.area.detailId ?? null;
  const buoysVisible = policy.zoneBuoys === "all"
    || (policy.zoneBuoys === "focused" && focusedAreaDetailId !== null);
  content.zoneField.buoyBodies.visible = buoysVisible;
  content.zoneField.buoyLamps.visible = buoysVisible;
  updateZoneBuoys(
    content.zoneField,
    frame.timeSeconds,
    frame.reducedMotion,
    // Camera interaction is not load pressure; resolve the scheduler through
    // the sea tier so markers do not freeze mid-swell during a pan.
    seaQualityTier(frame.renderScheduler),
    policy.zoneBuoys === "focused" ? focusedAreaDetailId : null,
    gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.bob),
  );
}
