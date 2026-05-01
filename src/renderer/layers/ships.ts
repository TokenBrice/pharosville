import { squadForMember } from "../../systems/maker-squad";
import type { ShipMotionSample } from "../../systems/motion";
import type { ScreenPoint } from "../../systems/projection";
import type { PharosVilleWorld, ShipLivery, ShipLogoShape, ShipPegPattern, ShipPegShape, ShipStripePattern, ShipWaterZone } from "../../systems/world-types";
import type { LoadedPharosVilleAsset, PharosVilleAssetManager } from "../asset-manager";
import { drawAnimatedAsset, drawAsset, hexToRgba, readableInkForFill, roundedRectPath, stableVisualVariant } from "../canvas-primitives";
import type { RenderFrameCache } from "../frame-cache";
import type { ResolvedEntityGeometry } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";
import { recolorSailImageData, SHIP_SAIL_TINT_MASKS } from "../ship-sail-tint";
import { UNIQUE_SPRITE_IDS } from "../../systems/unique-ships";
import { resolveShipPose, zeroShipPose, type ShipPose } from "./ship-pose";

const SHIP_COLORS = {
  "treasury-galleon": "#8a4f2b",
  "chartered-brigantine": "#735233",
  "dao-schooner": "#35606c",
  "crypto-caravel": "#58433a",
  "algo-junk": "#774734",
};

export const SHIP_SAIL_MARKS: Record<string, { height: number; width: number; x: number; y: number }> = {
  "algo-junk": { height: 15, width: 18, x: 8, y: -28 },
  "chartered-brigantine": { height: 15, width: 18, x: 9, y: -29 },
  "crypto-caravel": { height: 14, width: 17, x: 8, y: -26 },
  "dao-schooner": { height: 14, width: 17, x: 8, y: -27 },
  "treasury-galleon": { height: 16, width: 19, x: 10, y: -31 },
  "ship.usdc-titan": { height: 21, width: 25, x: 4, y: -52 },
  "ship.usds-titan": { height: 19, width: 23, x: 3, y: -45 },
  "ship.usdt-titan": { height: 24, width: 28, x: 8, y: -58 },
  // Maker consorts seeded from ship.usds-titan; tuning in Task 7.5.
  "ship.dai-titan": { height: 19, width: 23, x: 3, y: -45 },
  "ship.susds-titan": { height: 19, width: 23, x: 3, y: -45 },
  "ship.sdai-titan": { height: 19, width: 23, x: 3, y: -45 },
  "ship.stusds-titan": { height: 19, width: 23, x: 3, y: -45 },
  // Unique heritage hulls (136x100, anchor [68,92]). Per-sprite tuned to the
  // painted mainsail polygon centroid; see PNG inspection notes in
  // agents/completed/2026-05-01-unique-ship-category-plan.md Step 6.1.
  "ship.crvusd-unique": { height: 19, width: 22, x: 4, y: -50 },
  "ship.bold-unique": { height: 18, width: 21, x: 3, y: -52 },
  "ship.fxusd-unique": { height: 18, width: 20, x: 3, y: -50 },
  "ship.xaut-unique": { height: 17, width: 20, x: -7, y: -57 },
  "ship.paxg-unique": { height: 20, width: 22, x: 2, y: -47 },
};

export const SHIP_PEG_MARKS: Record<string, { size: number; x: number; y: number }> = {
  "algo-junk": { size: 5.4, x: -18, y: -44 },
  "chartered-brigantine": { size: 5.6, x: -18, y: -46 },
  "crypto-caravel": { size: 5.3, x: -17, y: -42 },
  "dao-schooner": { size: 5.3, x: -17, y: -43 },
  "treasury-galleon": { size: 5.8, x: -19, y: -47 },
  "ship.usdc-titan": { size: 7.6, x: -33, y: -73 },
  "ship.usds-titan": { size: 7.2, x: -29, y: -65 },
  "ship.usdt-titan": { size: 8.4, x: -41, y: -84 },
  // Maker consorts seeded from ship.usds-titan; tuning in Task 7.5.
  "ship.dai-titan": { size: 7.2, x: -29, y: -65 },
  "ship.susds-titan": { size: 7.2, x: -29, y: -65 },
  "ship.sdai-titan": { size: 7.2, x: -29, y: -65 },
  "ship.stusds-titan": { size: 7.2, x: -29, y: -65 },
  // Unique heritage hulls (136x100, anchor [68,92]). Peg pennant sits forward
  // of the mainmast and below the masthead lantern.
  "ship.crvusd-unique": { size: 6.6, x: -26, y: -58 },
  "ship.bold-unique": { size: 6.5, x: -27, y: -60 },
  "ship.fxusd-unique": { size: 6.4, x: -25, y: -57 },
  "ship.xaut-unique": { size: 6.4, x: -25, y: -56 },
  "ship.paxg-unique": { size: 6.8, x: -28, y: -60 },
};

interface ShipTrimSpec {
  deck: readonly { height: number; width: number; x: number; y: number }[];
  keel: readonly [number, number, number, number];
  rail: readonly [number, number, number, number];
  stern: { height: number; width: number; x: number; y: number };
}

export const SHIP_TRIM_MARKS: Record<string, ShipTrimSpec> = {
  "algo-junk": {
    rail: [-24, -13, 21, -8],
    keel: [-22, -3, 18, 0],
    stern: { x: -29, y: -17, width: 9, height: 4 },
    deck: [{ x: -8, y: -20, width: 8, height: 4 }, { x: 5, y: -18, width: 7, height: 3 }],
  },
  "chartered-brigantine": {
    rail: [-25, -14, 22, -9],
    keel: [-23, -3, 20, 0],
    stern: { x: -30, y: -18, width: 9, height: 4 },
    deck: [{ x: -10, y: -22, width: 8, height: 4 }, { x: 7, y: -20, width: 7, height: 3 }],
  },
  "crypto-caravel": {
    rail: [-23, -13, 21, -8],
    keel: [-21, -3, 18, 0],
    stern: { x: -27, y: -17, width: 8, height: 4 },
    deck: [{ x: -7, y: -20, width: 7, height: 4 }, { x: 7, y: -18, width: 6, height: 3 }],
  },
  "dao-schooner": {
    rail: [-22, -13, 20, -8],
    keel: [-20, -3, 17, 0],
    stern: { x: -26, y: -17, width: 8, height: 4 },
    deck: [{ x: -7, y: -20, width: 7, height: 4 }, { x: 6, y: -18, width: 6, height: 3 }],
  },
  "treasury-galleon": {
    rail: [-26, -15, 23, -9],
    keel: [-24, -4, 20, 0],
    stern: { x: -31, y: -19, width: 10, height: 5 },
    deck: [{ x: -10, y: -23, width: 8, height: 4 }, { x: 8, y: -21, width: 7, height: 3 }],
  },
  "ship.usdc-titan": {
    rail: [-53, -20, 48, -11],
    keel: [-48, -5, 42, 0],
    stern: { x: -60, y: -27, width: 16, height: 7 },
    deck: [{ x: -17, y: -31, width: 13, height: 6 }, { x: 13, y: -27, width: 11, height: 5 }],
  },
  "ship.usds-titan": {
    rail: [-44, -18, 40, -8],
    keel: [-40, -5, 35, 0],
    stern: { x: -48, y: -26, width: 14, height: 6 },
    deck: [{ x: -14, y: -29, width: 11, height: 5 }, { x: 12, y: -25, width: 10, height: 4 }],
  },
  "ship.usdt-titan": {
    rail: [-66, -23, 61, -12],
    keel: [-60, -5, 53, 0],
    stern: { x: -74, y: -31, width: 18, height: 8 },
    deck: [{ x: -23, y: -35, width: 15, height: 7 }, { x: 16, y: -30, width: 13, height: 6 }],
  },
  // Maker consorts seeded from ship.usds-titan; tuning in Task 7.5.
  "ship.dai-titan": {
    rail: [-44, -18, 40, -8],
    keel: [-40, -5, 35, 0],
    stern: { x: -48, y: -26, width: 14, height: 6 },
    deck: [{ x: -14, y: -29, width: 11, height: 5 }, { x: 12, y: -25, width: 10, height: 4 }],
  },
  "ship.susds-titan": {
    rail: [-44, -18, 40, -8],
    keel: [-40, -5, 35, 0],
    stern: { x: -48, y: -26, width: 14, height: 6 },
    deck: [{ x: -14, y: -29, width: 11, height: 5 }, { x: 12, y: -25, width: 10, height: 4 }],
  },
  "ship.sdai-titan": {
    rail: [-44, -18, 40, -8],
    keel: [-40, -5, 35, 0],
    stern: { x: -48, y: -26, width: 14, height: 6 },
    deck: [{ x: -14, y: -29, width: 11, height: 5 }, { x: 12, y: -25, width: 10, height: 4 }],
  },
  "ship.stusds-titan": {
    rail: [-44, -18, 40, -8],
    keel: [-40, -5, 35, 0],
    stern: { x: -48, y: -26, width: 14, height: 6 },
    deck: [{ x: -14, y: -29, width: 11, height: 5 }, { x: 12, y: -25, width: 10, height: 4 }],
  },
  // Unique heritage hulls (136x100, anchor [68,92]). Trim offsets sit between
  // the standard galleon (104x80) and the titan hulls (144x104+).
  "ship.crvusd-unique": {
    rail: [-38, -16, 36, -7],
    keel: [-36, -4, 32, 0],
    stern: { x: -42, y: -22, width: 12, height: 5 },
    deck: [{ x: -12, y: -25, width: 10, height: 4 }, { x: 10, y: -22, width: 9, height: 4 }],
  },
  "ship.bold-unique": {
    rail: [-38, -16, 36, -7],
    keel: [-36, -4, 32, 0],
    stern: { x: -42, y: -23, width: 12, height: 5 },
    deck: [{ x: -12, y: -26, width: 10, height: 4 }, { x: 10, y: -23, width: 9, height: 4 }],
  },
  "ship.fxusd-unique": {
    rail: [-38, -15, 36, -7],
    keel: [-36, -4, 32, 0],
    stern: { x: -42, y: -21, width: 12, height: 5 },
    deck: [{ x: -12, y: -24, width: 10, height: 4 }, { x: 10, y: -21, width: 9, height: 4 }],
  },
  "ship.xaut-unique": {
    rail: [-38, -14, 36, -6],
    keel: [-36, -3, 32, 0],
    stern: { x: -42, y: -19, width: 12, height: 5 },
    deck: [{ x: -12, y: -22, width: 10, height: 4 }, { x: 10, y: -19, width: 9, height: 4 }],
  },
  "ship.paxg-unique": {
    rail: [-38, -17, 36, -8],
    keel: [-36, -4, 32, 0],
    stern: { x: -42, y: -23, width: 12, height: 5 },
    deck: [{ x: -12, y: -26, width: 10, height: 4 }, { x: 10, y: -23, width: 9, height: 4 }],
  },
};

const PENNANTS: Record<string, string> = {
  emerald: "#d7f0df",
  blue: "#d7e6f7",
  cyan: "#d7f0ee",
  gold: "#ffe1a0",
  silver: "#e5e7eb",
  slate: "#c7d0d8",
};

export const TITAN_SPRITE_IDS = new Set([
  "ship.usdc-titan",
  "ship.usds-titan",
  "ship.usdt-titan",
  "ship.dai-titan",
  "ship.susds-titan",
  "ship.sdai-titan",
  "ship.stusds-titan",
]);
const SHIP_SAIL_TINT_CACHE_MAX = 48;
const shipSailTintCache = new Map<string, HTMLCanvasElement | null>();

export interface ShipRenderState {
  bob: number;
  geometry: ResolvedEntityGeometry;
  p: ScreenPoint;
  pose: ShipPose;
  sample: ShipMotionSample | null;
  selected: boolean;
  shipAsset: LoadedPharosVilleAsset | null;
}

export interface ShipRenderFrame {
  cache: RenderFrameCache;
  shipRenderStates: Map<string, ShipRenderState>;
  // Optional: visible ships needed to look up the squad flagship for
  // synchronised wake ordering. World-canvas frames provide this; tests
  // may omit it (in which case wake ordering reduces to per-ship draw).
  visibleShips?: readonly PharosVilleWorld["ships"][number][];
  // Optional: tracks ship ids whose wake has been drawn this frame. Allows
  // `drawShipWake` to render the flagship's wake first (then mark it) when
  // both flagship and a consort move, so consort wakes overdraw the
  // flagship and create the squad interference pattern.
  wakeDrawnShipIds?: Set<string>;
}

export interface ShipRenderLodPlan {
  drawOverlayShipIds: ReadonlySet<string>;
  drawWakeShipIds: ReadonlySet<string>;
}

const SHIP_OVERLAY_BUDGET_MIN = 20;
const SHIP_OVERLAY_BUDGET_RATIO = 0.64;
const SHIP_WAKE_BUDGET_MIN = 12;
const SHIP_WAKE_BUDGET_RATIO = 0.44;
const SHIP_LOD_SKIP_THRESHOLD = 24;

const SHIP_SIZE_TIER_PRIORITY: Record<PharosVilleWorld["ships"][number]["visual"]["sizeTier"], number> = {
  titan: 7,
  unique: 6,
  flagship: 5,
  major: 4,
  regional: 3,
  local: 2,
  skiff: 1,
  micro: 1,
  unknown: 0,
};

export function planShipRenderLod(
  input: Pick<DrawPharosVilleInput, "camera" | "height" | "hoveredTarget" | "motion" | "selectedTarget" | "shipMotionSamples" | "width">,
  cache: Pick<RenderFrameCache, "geometryForEntity">,
  visibleShips: readonly PharosVilleWorld["ships"][number][],
): ShipRenderLodPlan {
  if (visibleShips.length <= SHIP_LOD_SKIP_THRESHOLD) {
    const allIds = new Set(visibleShips.map((ship) => ship.id));
    return {
      drawOverlayShipIds: allIds,
      drawWakeShipIds: allIds,
    };
  }

  const selectedId = input.selectedTarget?.id ?? null;
  const selectedDetailId = input.selectedTarget?.detailId ?? null;
  const hoveredId = input.hoveredTarget?.id ?? null;
  const hoveredDetailId = input.hoveredTarget?.detailId ?? null;
  const centerX = input.width / 2;
  const centerY = input.height / 2;
  const maxDistance = Math.max(320, Math.hypot(centerX, centerY) + 220 * input.camera.zoom);
  const viewportMargin = Math.max(96, 160 * input.camera.zoom);
  const zoomFactor = Math.max(0.72, Math.min(1.2, input.camera.zoom));
  const overlayBudget = Math.min(
    visibleShips.length,
    Math.max(SHIP_OVERLAY_BUDGET_MIN, Math.floor(visibleShips.length * SHIP_OVERLAY_BUDGET_RATIO * zoomFactor)),
  );
  const wakeBudget = Math.min(
    visibleShips.length,
    Math.max(SHIP_WAKE_BUDGET_MIN, Math.floor(visibleShips.length * SHIP_WAKE_BUDGET_RATIO * zoomFactor)),
  );

  const drawOverlayShipIds = new Set<string>();
  const drawWakeShipIds = new Set<string>();
  const overlayCandidates: Array<{ score: number; shipId: string }> = [];
  const wakeCandidates: Array<{ score: number; shipId: string }> = [];

  for (const ship of visibleShips) {
    const geometry = cache.geometryForEntity(ship);
    const sample = input.shipMotionSamples?.get(ship.id) ?? null;
    const mover = input.motion.plan.moverShipIds.has(ship.id);
    const effect = input.motion.plan.effectShipIds.has(ship.id);
    const selected = ship.id === selectedId || ship.detailId === selectedDetailId;
    const hovered = ship.id === hoveredId || ship.detailId === hoveredDetailId;
    const preserveTier = ship.visual.sizeTier === "titan"
      || ship.visual.sizeTier === "unique"
      || isTitanSprite(ship)
      || isUniqueSprite(ship);
    const inViewport = isShipRectInViewport(geometry.selectionRect, input.width, input.height, viewportMargin);
    const distance = Math.hypot(geometry.screenPoint.x - centerX, geometry.screenPoint.y - centerY);
    const proximityScore = Math.max(-1, 1 - distance / maxDistance);
    const sizePriority = SHIP_SIZE_TIER_PRIORITY[ship.visual.sizeTier] ?? 0;
    const transit = sample?.state === "departing" || sample?.state === "sailing" || sample?.state === "arriving";
    const preserve = selected || hovered || preserveTier;

    if (preserve) {
      drawOverlayShipIds.add(ship.id);
      drawWakeShipIds.add(ship.id);
      continue;
    }

    const visibilityScore = inViewport ? 2.2 : -2.4;
    const overlayScore = proximityScore * 5.6
      + visibilityScore
      + sizePriority
      + (effect ? 2.1 : 0)
      + (mover ? 2.8 : 0)
      + (transit ? 0.8 : -0.4);
    overlayCandidates.push({ score: overlayScore, shipId: ship.id });

    const wakeScore = proximityScore * 5.1
      + visibilityScore
      + (effect ? 3.1 : 0)
      + (mover ? 5.8 : 0)
      + (transit ? 4.4 : -3.6)
      + sizePriority * 0.4;
    wakeCandidates.push({ score: wakeScore, shipId: ship.id });
  }

  addTopBudgetedShips(drawOverlayShipIds, overlayCandidates, overlayBudget);
  addTopBudgetedShips(drawWakeShipIds, wakeCandidates, wakeBudget);

  return {
    drawOverlayShipIds,
    drawWakeShipIds,
  };
}

function addTopBudgetedShips(
  output: Set<string>,
  candidates: Array<{ score: number; shipId: string }>,
  targetBudget: number,
) {
  const target = Math.max(targetBudget, output.size);
  if (output.size >= target || candidates.length === 0) return;
  candidates.sort((a, b) => {
    const scoreDelta = b.score - a.score;
    if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
    return a.shipId < b.shipId ? -1 : a.shipId > b.shipId ? 1 : 0;
  });
  for (const candidate of candidates) {
    output.add(candidate.shipId);
    if (output.size >= target) break;
  }
}

function isShipRectInViewport(
  rect: { height: number; width: number; x: number; y: number },
  width: number,
  height: number,
  margin: number,
) {
  return (
    rect.x + rect.width >= -margin
    && rect.x <= width + margin
    && rect.y + rect.height >= -margin
    && rect.y <= height + margin
  );
}

function shipRenderState(input: DrawPharosVilleInput, frame: ShipRenderFrame, ship: PharosVilleWorld["ships"][number]): ShipRenderState {
  const cached = frame.shipRenderStates.get(ship.id);
  if (cached) return cached;
  const { camera, motion, selectedTarget, shipMotionSamples } = input;
  const sample = shipMotionSamples?.get(ship.id) ?? null;
  const shipAsset = frame.cache.assetForEntity(ship);
  const geometry = frame.cache.geometryForEntity(ship);
  const p = geometry.screenPoint;
  const phase = motion.plan.shipPhases.get(ship.id) ?? 0;
  const animated = !motion.reducedMotion && motion.plan.animatedShipIds.has(ship.id);
  const pose = animated
    ? resolveShipPose({
      phase,
      reducedMotion: motion.reducedMotion,
      sample,
      shipId: ship.id,
      timeSeconds: motion.timeSeconds,
      visualSizeTier: ship.visual.sizeTier,
      zoom: camera.zoom,
    })
    : zeroShipPose();
  const bob = Math.round(pose.bobPixels);
  const selected = selectedTarget?.id === ship.id;
  const state = { bob, geometry, p, pose, sample, selected, shipAsset };
  frame.shipRenderStates.set(ship.id, state);
  return state;
}

function isTitanSprite(ship: PharosVilleWorld["ships"][number]): boolean {
  return !!ship.visual.spriteAssetId && TITAN_SPRITE_IDS.has(ship.visual.spriteAssetId);
}

function isUniqueSprite(ship: PharosVilleWorld["ships"][number]): boolean {
  return !!ship.visual.spriteAssetId && UNIQUE_SPRITE_IDS.has(ship.visual.spriteAssetId);
}

function drawWithShipPose(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pose: ShipPose,
  draw: () => void,
) {
  if (Math.abs(pose.rollRadians) < 0.0005) {
    draw();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(pose.rollRadians);
  ctx.translate(-x, -y);
  draw();
  ctx.restore();
}

/**
 * Draws a ship's wake. May also paint the flagship's wake out-of-turn for
 * synchronised-squad-wake interference: when called for a Maker squad consort
 * that's a mover and the flagship is also a mover, the flagship's wake is
 * drawn first via `drawShipWakeRaw` and marked in `frame.wakeDrawnShipIds`
 * to prevent double-draw. See `ShipRenderFrame.wakeDrawnShipIds`.
 */
export function drawShipWake(input: DrawPharosVilleInput, frame: ShipRenderFrame, ship: PharosVilleWorld["ships"][number]) {
  // Synchronised squad wake: when this hull is a squad consort that is
  // currently a mover and its squad's flagship is also a mover, draw the
  // flagship's wake first so consort wakes overdraw additively.
  const squad = ship.squadId ? squadForMember(ship.id) : null;
  if (
    squad
    && ship.squadRole === "consort"
    && input.motion.plan.moverShipIds.has(ship.id)
    && input.motion.plan.moverShipIds.has(squad.flagshipId)
  ) {
    const flagship = frame.visibleShips?.find((entry) => entry.id === squad.flagshipId);
    const drawn = frame.wakeDrawnShipIds;
    if (flagship && drawn && !drawn.has(squad.flagshipId)) {
      drawShipWakeRaw(input, frame, flagship);
      drawn.add(squad.flagshipId);
    }
  }
  if (frame.wakeDrawnShipIds?.has(ship.id)) return;
  drawShipWakeRaw(input, frame, ship);
  frame.wakeDrawnShipIds?.add(ship.id);
}

function drawShipWakeRaw(input: DrawPharosVilleInput, frame: ShipRenderFrame, ship: PharosVilleWorld["ships"][number]) {
  const { camera, ctx, motion } = input;
  const { geometry, p, pose, sample, selected } = shipRenderState(input, frame, ship);
  drawShipContactShadow(ctx, geometry.drawPoint.x, geometry.drawPoint.y, geometry.drawScale);
  if (isTitanSprite(ship)) {
    drawTitanHullFoam(
      ctx,
      geometry.drawPoint.x,
      geometry.drawPoint.y,
      geometry.drawScale,
      pose,
      sample?.heading ?? { x: -1, y: 0 },
      sample?.zone ?? ship.riskZone,
    );
    if (sample?.state === "moored" && sample.currentDockId) {
      drawTitanMooringDetails(ctx, geometry.drawPoint.x, geometry.drawPoint.y, geometry.drawScale, pose);
    }
  }
  const isTransit = sample?.state === "departing" || sample?.state === "sailing" || sample?.state === "arriving";
  const drawsWake = !motion.reducedMotion
    && isTransit
    && (
      motion.plan.effectShipIds.has(ship.id)
      || selected
      || motion.plan.moverShipIds.has(ship.id)
    );
  if (drawsWake) {
    const changeIntensity = Math.min(1, Math.abs(ship.change24hPct ?? 0) * 18 + 0.2);
    const sampleIntensity = sample?.wakeIntensity ?? 0;
    const intensity = Math.max(sampleIntensity, motion.plan.moverShipIds.has(ship.id) ? changeIntensity : 0);
    drawWake(ctx, p.x, p.y + 8 * camera.zoom, camera.zoom, intensity, sample?.heading ?? { x: -1, y: 0 }, sample?.zone ?? ship.riskZone);
    if (isTitanSprite(ship)) {
      drawTitanBowSpray(
        ctx,
        geometry.drawPoint.x,
        geometry.drawPoint.y,
        geometry.drawScale,
        pose,
        sample?.heading ?? { x: -1, y: 0 },
        sample?.zone ?? ship.riskZone,
      );
    }
  }
}

function drawShipContactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.fillStyle = "rgba(3, 7, 10, 0.34)";
  ctx.beginPath();
  ctx.ellipse(x, y - 1 * scale, 28 * scale, 7.5 * scale, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(169, 224, 213, 0.12)";
  ctx.lineWidth = Math.max(1, 1.1 * scale);
  ctx.beginPath();
  ctx.moveTo(x - 25 * scale, y + 2 * scale);
  ctx.lineTo(x + 20 * scale, y + 3.5 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawTitanHullFoam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  pose: ShipPose,
  heading: { x: number; y: number },
  zone: ShipWaterZone,
) {
  const style = wakeStyleForZone(zone);
  const { cross, forward } = headingBasis(heading);
  const alpha = 0.12 + pose.bowWake * 0.18 + pose.mooringTension * 0.08;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = wakeRgba(style, alpha);
  ctx.lineWidth = Math.max(1, 1.15 * scale);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(
      x - forward.x * 3 * scale + cross.x * side * 25 * scale,
      y + 4 * scale - forward.y * 3 * scale + cross.y * side * 25 * scale,
    );
    ctx.quadraticCurveTo(
      x + forward.x * 10 * scale + cross.x * side * 18 * scale,
      y + 7 * scale + forward.y * 10 * scale + cross.y * side * 18 * scale,
      x + forward.x * 19 * scale + cross.x * side * 8 * scale,
      y + 4 * scale + forward.y * 19 * scale + cross.y * side * 8 * scale,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawTitanMooringDetails(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  pose: ShipPose,
) {
  const tension = pose.mooringTension;
  ctx.save();
  ctx.fillStyle = `rgba(2, 6, 8, ${0.16 + tension * 0.12})`;
  ctx.beginPath();
  ctx.ellipse(x - 4 * scale, y + 4 * scale, 46 * scale, 9 * scale, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineCap = "round";
  ctx.strokeStyle = `rgba(232, 205, 145, ${0.32 + tension * 0.2})`;
  ctx.lineWidth = Math.max(1, 1.1 * scale);
  for (const rope of [
    [-42, -14, -66, -2],
    [36, -12, 58, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x + rope[0] * scale, y + rope[1] * scale);
    ctx.quadraticCurveTo(
      x + ((rope[0] + rope[2]) / 2) * scale,
      y + ((rope[1] + rope[3]) / 2 + tension * 2.5) * scale,
      x + rope[2] * scale,
      y + rope[3] * scale,
    );
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(231, 225, 198, 0.78)";
  for (const fenderX of [-34, 31]) {
    ctx.beginPath();
    ctx.ellipse(x + fenderX * scale, y - 1 * scale, 3.2 * scale, 6.8 * scale, 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTitanBowSpray(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  pose: ShipPose,
  heading: { x: number; y: number },
  zone: ShipWaterZone,
) {
  if (pose.bowWake <= 0.02 && pose.sternChurn <= 0.02) return;
  const style = wakeStyleForZone(zone);
  const { cross, forward } = headingBasis(heading);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = wakeRgba(style, 0.16 + pose.bowWake * 0.24);
  ctx.lineWidth = Math.max(1, 1.05 * scale);
  for (let index = 0; index < 3; index += 1) {
    const side = index % 2 === 0 ? 1 : -1;
    const spread = (5 + index * 4) * side * scale;
    const start = (24 + index * 3) * scale;
    ctx.beginPath();
    ctx.moveTo(x + forward.x * start + cross.x * spread, y + 2 * scale + forward.y * start + cross.y * spread);
    ctx.lineTo(
      x + forward.x * (start + 12 * scale) + cross.x * spread * 1.7,
      y + 2 * scale + forward.y * (start + 12 * scale) + cross.y * spread * 1.7,
    );
    ctx.stroke();
  }

  if (pose.sternChurn > 0.05) {
    ctx.strokeStyle = wakeRgba(style, 0.12 + pose.sternChurn * 0.2);
    ctx.lineWidth = Math.max(1, 1 * scale);
    ctx.beginPath();
    ctx.moveTo(x - forward.x * 34 * scale - cross.x * 10 * scale, y + 6 * scale - forward.y * 34 * scale - cross.y * 10 * scale);
    ctx.lineTo(x - forward.x * 48 * scale - cross.x * 15 * scale, y + 8 * scale - forward.y * 48 * scale - cross.y * 15 * scale);
    ctx.moveTo(x - forward.x * 34 * scale + cross.x * 10 * scale, y + 6 * scale - forward.y * 34 * scale + cross.y * 10 * scale);
    ctx.lineTo(x - forward.x * 48 * scale + cross.x * 15 * scale, y + 8 * scale - forward.y * 48 * scale + cross.y * 15 * scale);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawShipBody(input: DrawPharosVilleInput, frame: ShipRenderFrame, ship: PharosVilleWorld["ships"][number]) {
  const { camera, ctx, motion } = input;
  const { bob, geometry, p, pose, shipAsset } = shipRenderState(input, frame, ship);
  if (shipAsset) {
    const titanSprite = isTitanSprite(ship);
    const drawY = geometry.drawPoint.y + bob;
    drawWithShipPose(ctx, geometry.drawPoint.x, drawY, pose, () => {
      if (titanSprite) {
        drawAnimatedAsset(
          ctx,
          shipAsset,
          geometry.drawPoint.x,
          drawY,
          geometry.drawScale,
          shipAnimationFrameIndex(shipAsset, motion.timeSeconds, ship.id),
          motion.reducedMotion,
        );
      } else {
        drawAsset(ctx, shipAsset, geometry.drawPoint.x, drawY, geometry.drawScale);
      }
      const visualKey = ship.visual.spriteAssetId ?? ship.visual.hull;
      drawShipSailTint(ctx, shipAsset, geometry.drawPoint.x, drawY, geometry.drawScale, ship.visual.livery);
      if (!titanSprite) {
        drawShipLiveryTrim(ctx, ship.id, ship.visual.livery, visualKey, geometry.drawPoint.x, drawY, geometry.drawScale);
      }
      drawSquadIdentityAccent(ctx, ship.id, geometry.drawPoint.x, drawY, geometry.drawScale);
    });
  } else {
    const drawY = p.y - 4 * camera.zoom + bob;
    const proceduralScale = camera.zoom * ship.visual.scale;
    drawShip(
      ctx,
      p.x,
      drawY,
      ship.visual.scale,
      ship.visual.livery.sailColor,
      SHIP_COLORS[ship.visual.hull],
      camera.zoom,
    );
    drawProceduralShipLiveryTrim(ctx, ship.id, ship.visual.livery, p.x, drawY, proceduralScale);
    drawSquadIdentityAccent(ctx, ship.id, p.x, drawY, proceduralScale);
  }
}

// Per-hull identity accents, drawn after sprite blit and livery trim but
// before overlay chrome. Gated by ship.id so only the three squad members
// with a distinct callsign render an accent.
export function drawSquadIdentityAccent(
  ctx: CanvasRenderingContext2D,
  shipId: string,
  x: number,
  y: number,
  scale: number,
) {
  // Both squad flagships fly the admiral's banner. DAI (Maker flagship) also
  // carries weathered hull patches as elder consort lore.
  const squad = squadForMember(shipId);
  if (squad && shipId === squad.flagshipId) drawAdmiralBanner(ctx, x, y, scale);
  if (shipId === "stusds-sky") drawForgeGlow(ctx, x, y, scale);
  if (shipId === "dai-makerdao") drawWeatheredPatches(ctx, x, y, scale);
}

// Narrow rectangular pennant just above the mast tip; flagship-only.
function drawAdmiralBanner(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.fillStyle = "#e8bb60";
  ctx.strokeStyle = "rgba(43, 28, 18, 0.78)";
  ctx.lineWidth = Math.max(1, 0.6 * scale);
  ctx.beginPath();
  ctx.rect(x - 1 * scale, y - 60 * scale, 11 * scale, 3.4 * scale);
  ctx.fill();
  ctx.stroke();
  // Forked tip for admiral's banner.
  ctx.beginPath();
  ctx.moveTo(x + 10 * scale, y - 60 * scale);
  ctx.lineTo(x + 13.5 * scale, y - 58.3 * scale);
  ctx.lineTo(x + 10 * scale, y - 56.6 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Soft warm-orange radial gradient at the bow ram joint; reads as forge-glow.
function drawForgeGlow(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  const cx = x + 14 * scale;
  const cy = y - 4 * scale;
  const radius = Math.max(2, 9 * scale);
  ctx.save();
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, "rgba(255, 140, 40, 0.32)");
  gradient.addColorStop(0.6, "rgba(255, 140, 40, 0.12)");
  gradient.addColorStop(1, "rgba(255, 140, 40, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Three desaturated grey-brown rectangles near the waterline; reads as
// patched-up timbers on the elder consort.
function drawWeatheredPatches(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.fillStyle = "rgba(96, 78, 60, 0.55)";
  ctx.strokeStyle = "rgba(40, 32, 24, 0.5)";
  ctx.lineWidth = Math.max(1, 0.5 * scale);
  const patches: ReadonlyArray<readonly [number, number, number, number]> = [
    [-16, -3, 5, 2.4],
    [-6, -4, 4.4, 2.2],
    [4, -3, 4.8, 2.6],
    [13, -4, 3.6, 2.0],
  ];
  for (const [px, py, pw, ph] of patches) {
    ctx.beginPath();
    ctx.rect(x + px * scale, y + py * scale, pw * scale, ph * scale);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// Mast-top in screen-space, including hull pose (bob + roll). Used by the
// squad chrome layer to anchor the bunting catenary so it follows wake.
export function shipMastTopScreenPoint(
  input: DrawPharosVilleInput,
  frame: ShipRenderFrame,
  ship: PharosVilleWorld["ships"][number],
): { x: number; y: number } {
  const { bob, geometry, pose } = shipRenderState(input, frame, ship);
  const drawX = geometry.drawPoint.x;
  const drawY = geometry.drawPoint.y + bob;
  const sailKey = ship.visual.spriteAssetId ?? ship.visual.hull;
  const sail = SHIP_SAIL_MARKS[sailKey] ?? SHIP_SAIL_MARKS["treasury-galleon"]!;
  // Mast tip sits above the sail mark, slightly inboard of the sail's nominal X
  // (the sail mark sits roughly mid-sail; the mast pole is closer to centerline).
  const MAST_TOP_HEIGHT_FACTOR = 0.6; // mast extends 60% of sail-mark height above the mark
  const MAST_X_INSET_FACTOR = 0.1; // mast pole sits at 10% of sail.x toward centerline
  const localX = sail.x * geometry.drawScale * MAST_X_INSET_FACTOR;
  const localY = (sail.y - sail.height * MAST_TOP_HEIGHT_FACTOR) * geometry.drawScale;
  // Apply pose roll about the hull origin (drawX, drawY).
  const cos = Math.cos(pose.rollRadians);
  const sin = Math.sin(pose.rollRadians);
  return {
    x: drawX + localX * cos - localY * sin,
    y: drawY + localX * sin + localY * cos,
  };
}

function shipAnimationFrameIndex(asset: LoadedPharosVilleAsset, timeSeconds: number, shipId: string): number {
  const animation = asset.entry.animation;
  if (!animation || animation.frameCount <= 1) return 0;
  const fps = animation.fps
    ?? (animation.durationMs && animation.durationMs > 0 ? animation.frameCount / (animation.durationMs / 1000) : 4);
  const phase = stableVisualVariant(`${shipId}:${asset.entry.id}:animation-frame`) % animation.frameCount;
  return Math.floor(Math.max(0, timeSeconds) * fps + phase);
}

export function drawShipOverlay(input: DrawPharosVilleInput, frame: ShipRenderFrame, ship: PharosVilleWorld["ships"][number]) {
  const { assets, camera, ctx } = input;
  const { bob, geometry, p, pose, selected, shipAsset } = shipRenderState(input, frame, ship);
  if (shipAsset) {
    const titanSprite = isTitanSprite(ship);
    const drawY = geometry.drawPoint.y + bob;
    drawWithShipPose(ctx, geometry.drawPoint.x, drawY, pose, () => {
      if (selected) drawSelectedShipOutline(ctx, geometry.drawPoint.x, drawY, geometry.drawScale);
      const mark = SHIP_SAIL_MARKS[ship.visual.spriteAssetId ?? ship.visual.hull] ?? SHIP_SAIL_MARKS[ship.visual.hull];
      const flutterY = titanSprite ? pose.sailFlutter * geometry.drawScale : 0;
      drawSailLogo({
        ctx,
        logo: assets?.getLogo(ship.logoSrc) ?? null,
        livery: ship.visual.livery,
        mark: ship.symbol,
        sailColor: ship.visual.sailColor,
        stripeColor: ship.visual.sailStripeColor,
        height: mark.height * geometry.drawScale,
        width: mark.width * geometry.drawScale,
        x: geometry.drawPoint.x + mark.x * geometry.drawScale,
        y: drawY + mark.y * geometry.drawScale + flutterY,
      });
      if (titanSprite) return;
      drawShipPegPennant(
        ctx,
        ship.visual.pennant,
        ship.visual.pegShape,
        ship.visual.pegPattern,
        ship.visual.spriteAssetId ?? ship.visual.hull,
        geometry.drawPoint.x,
        drawY,
        geometry.drawScale,
      );
      drawShipSignalOverlay(ctx, ship.visual.overlay, geometry.drawPoint.x - 17 * geometry.drawScale, drawY - 36 * geometry.drawScale, geometry.drawScale);
    });
  } else {
    const proceduralScale = camera.zoom * ship.visual.scale;
    const drawY = p.y - 4 * camera.zoom + bob;
    if (selected) drawSelectedShipOutline(ctx, p.x, drawY, proceduralScale * 0.7);
    drawSailLogo({
      ctx,
      logo: assets?.getLogo(ship.logoSrc) ?? null,
      livery: ship.visual.livery,
      mark: ship.symbol,
      sailColor: ship.visual.sailColor,
      stripeColor: ship.visual.sailStripeColor,
      height: 12 * proceduralScale,
      width: 14 * proceduralScale,
      x: p.x + 7 * proceduralScale,
      y: drawY - 10 * proceduralScale,
    });
    drawProceduralShipPegPennant(ctx, ship.visual.pennant, ship.visual.pegShape, ship.visual.pegPattern, p.x, drawY, proceduralScale);
    drawShipSignalOverlay(ctx, ship.visual.overlay, p.x - 10 * proceduralScale, drawY - 20 * proceduralScale, proceduralScale);
  }
}

function drawSelectedShipOutline(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 229, 160, 0.92)";
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.beginPath();
  ctx.ellipse(x, y - 18 * scale, 34 * scale, 23 * scale, -0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, sail: string, hull: string, zoom: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * zoom, scale * zoom);
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.lineTo(14, 0);
  ctx.lineTo(8, 8);
  ctx.lineTo(-9, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#271b12";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#5c4932";
  ctx.fillRect(-1, -22, 2, 23);
  ctx.fillStyle = sail;
  ctx.beginPath();
  ctx.moveTo(1, -21);
  ctx.lineTo(1, -3);
  ctx.lineTo(14, -6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSailLogo(input: {
  ctx: CanvasRenderingContext2D;
  height: number;
  livery: ShipLivery;
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>;
  mark: string;
  sailColor: string;
  stripeColor: string;
  width: number;
  x: number;
  y: number;
}) {
  const { ctx, height, livery, logo, mark, sailColor, stripeColor, width, x, y } = input;
  const safeWidth = Math.max(6, width * 1.14);
  const safeHeight = Math.max(6, height * 1.1);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.fillStyle = sailColor;
  ctx.strokeStyle = "rgba(43, 28, 18, 0.72)";
  ctx.lineWidth = Math.max(1, safeWidth * 0.08);
  ctx.beginPath();
  ctx.moveTo(-safeWidth * 0.42, -safeHeight * 0.48);
  ctx.lineTo(safeWidth * 0.42, -safeHeight * 0.36);
  ctx.lineTo(safeWidth * 0.36, safeHeight * 0.34);
  ctx.lineTo(-safeWidth * 0.36, safeHeight * 0.48);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.clip();
  drawLiverySailPanel(ctx, livery, safeWidth, safeHeight);
  drawLiveryStripePattern(ctx, livery.stripePattern, stripeColor, safeWidth, safeHeight);
  ctx.fillStyle = "rgba(255, 250, 222, 0.32)";
  ctx.fillRect(-safeWidth * 0.38, -safeHeight * 0.41, safeWidth * 0.22, safeHeight * 0.82);
  ctx.restore();

  const matteWidth = safeWidth * 0.82;
  const matteHeight = safeHeight * 0.78;
  ctx.save();
  logoShapePath(ctx, livery.logoShape, 0, -safeHeight * 0.04, matteWidth, matteHeight);
  ctx.fillStyle = livery.logoMatte;
  ctx.fill();
  ctx.strokeStyle = hexToRgba(livery.primary, 0.86);
  ctx.lineWidth = Math.max(1, safeWidth * 0.07);
  ctx.stroke();
  ctx.restore();

  if (logo) {
    ctx.save();
    logoShapePath(ctx, livery.logoShape, 0, -safeHeight * 0.04, matteWidth * 0.8, matteHeight * 0.8);
    ctx.clip();
    const size = Math.round(Math.min(safeWidth, safeHeight) * 0.82);
    ctx.drawImage(logo.image, -size / 2, -safeHeight * 0.04 - size / 2, size, size);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = readableInkForFill(livery.logoMatte);
    ctx.font = `800 ${Math.max(5, Math.min(safeHeight * 0.72, safeWidth * 0.48))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark.slice(0, 3).toUpperCase(), 0, -safeHeight * 0.02, safeWidth * 0.58);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }
  ctx.restore();
}

function drawLiverySailPanel(ctx: CanvasRenderingContext2D, livery: ShipLivery, width: number, height: number) {
  ctx.fillStyle = hexToRgba(livery.accent, 0.24);
  if (livery.sailPanel === "field") {
    ctx.fillRect(-width * 0.42, -height * 0.44, width * 0.84, height * 0.88);
  } else if (livery.sailPanel === "hoist") {
    ctx.fillRect(-width * 0.42, -height * 0.44, width * 0.3, height * 0.88);
  } else if (livery.sailPanel === "quartered") {
    ctx.fillRect(-width * 0.42, -height * 0.44, width * 0.42, height * 0.44);
    ctx.fillRect(0, 0, width * 0.42, height * 0.44);
  } else {
    roundedRectPath(ctx, -width * 0.32, -height * 0.32, width * 0.64, height * 0.62, Math.max(1, width * 0.12));
    ctx.fill();
  }
}

function drawLiveryStripePattern(
  ctx: CanvasRenderingContext2D,
  pattern: ShipStripePattern,
  color: string,
  width: number,
  height: number,
) {
  ctx.fillStyle = hexToRgba(color, 0.84);
  ctx.strokeStyle = hexToRgba(color, 0.88);
  ctx.lineWidth = Math.max(1, height * 0.12);
  if (pattern === "double") {
    ctx.fillRect(-width * 0.43, height * 0.08, width * 0.88, Math.max(1, height * 0.1));
    ctx.fillRect(-width * 0.43, height * 0.27, width * 0.88, Math.max(1, height * 0.1));
  } else if (pattern === "diagonal") {
    ctx.save();
    ctx.rotate(-0.42);
    ctx.fillRect(-width * 0.54, height * 0.08, width * 1.08, Math.max(1.2, height * 0.16));
    ctx.restore();
  } else if (pattern === "chevron") {
    ctx.beginPath();
    ctx.moveTo(-width * 0.42, height * 0.24);
    ctx.lineTo(0, height * 0.04);
    ctx.lineTo(width * 0.42, height * 0.24);
    ctx.stroke();
  } else if (pattern === "wave") {
    ctx.beginPath();
    ctx.moveTo(-width * 0.42, height * 0.2);
    ctx.quadraticCurveTo(-width * 0.2, height * 0.02, 0, height * 0.2);
    ctx.quadraticCurveTo(width * 0.2, height * 0.38, width * 0.42, height * 0.2);
    ctx.stroke();
  } else if (pattern === "ladder") {
    ctx.fillRect(-width * 0.43, height * 0.18, width * 0.88, Math.max(1, height * 0.1));
    for (const offset of [-0.24, 0, 0.24]) {
      ctx.fillRect(width * offset, -height * 0.34, Math.max(1, width * 0.06), height * 0.7);
    }
  } else if (pattern === "cross") {
    ctx.fillRect(-width * 0.43, height * 0.16, width * 0.88, Math.max(1, height * 0.11));
    ctx.fillRect(-width * 0.04, -height * 0.42, Math.max(1, width * 0.08), height * 0.82);
  } else if (pattern === "grain") {
    for (const offset of [-0.24, 0, 0.24]) {
      ctx.beginPath();
      ctx.ellipse(width * offset, height * 0.18, width * 0.07, height * 0.2, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillRect(-width * 0.43, height * 0.19, width * 0.88, Math.max(1.2, height * 0.16));
  }
}

function drawShipLiveryTrim(
  ctx: CanvasRenderingContext2D,
  stablecoinId: string,
  livery: ShipLivery,
  visualKey: string,
  x: number,
  y: number,
  scale: number,
) {
  const spec = SHIP_TRIM_MARKS[visualKey];
  if (!spec) return;
  const variant = stableVisualVariant(stablecoinId);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = hexToRgba(livery.primary, 0.88);
  ctx.lineWidth = Math.max(1, 1.15 * scale);
  if (variant % 3 === 1) ctx.setLineDash([Math.max(2, 3 * scale), Math.max(1, 1.6 * scale)]);
  drawRelativeLine(ctx, x, y, scale, spec.rail);
  ctx.setLineDash([]);
  if (variant % 3 === 2) {
    ctx.strokeStyle = hexToRgba(livery.accent, 0.78);
    ctx.lineWidth = Math.max(1, 0.82 * scale);
    drawRelativeLine(ctx, x, y + 2 * scale, scale, spec.rail);
  }

  ctx.strokeStyle = hexToRgba(livery.secondary, 0.5);
  ctx.lineWidth = Math.max(1, 0.85 * scale);
  drawRelativeLine(ctx, x, y, scale, spec.keel);

  const stern = spec.stern;
  ctx.fillStyle = hexToRgba(livery.accent, 0.88);
  roundedRectPath(
    ctx,
    x + stern.x * scale,
    y + stern.y * scale,
    stern.width * scale,
    stern.height * scale,
    Math.max(1, stern.height * scale * 0.25),
  );
  ctx.fill();
  ctx.strokeStyle = hexToRgba(livery.secondary, 0.64);
  ctx.stroke();

  const deck = spec.deck[variant % spec.deck.length];
  if (deck) {
    ctx.fillStyle = hexToRgba(variant % 2 === 0 ? livery.logoMatte : livery.accent, 0.86);
    roundedRectPath(
      ctx,
      x + deck.x * scale,
      y + deck.y * scale,
      deck.width * scale,
      deck.height * scale,
      Math.max(1, deck.height * scale * 0.25),
    );
    ctx.fill();
    ctx.strokeStyle = hexToRgba(livery.primary, 0.78);
    ctx.lineWidth = Math.max(1, 0.7 * scale);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProceduralShipLiveryTrim(
  ctx: CanvasRenderingContext2D,
  stablecoinId: string,
  livery: ShipLivery,
  x: number,
  y: number,
  scale: number,
) {
  const variant = stableVisualVariant(stablecoinId);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = hexToRgba(livery.primary, 0.86);
  ctx.lineWidth = Math.max(1, 1.1 * scale);
  ctx.beginPath();
  ctx.moveTo(x - 12 * scale, y + 1 * scale);
  ctx.lineTo(x + 12 * scale, y + 1.5 * scale);
  ctx.stroke();
  ctx.fillStyle = hexToRgba(variant % 2 === 0 ? livery.accent : livery.logoMatte, 0.86);
  roundedRectPath(ctx, x - 5 * scale, y - 6 * scale, 7 * scale, 3.4 * scale, Math.max(1, scale));
  ctx.fill();
  ctx.strokeStyle = hexToRgba(livery.secondary, 0.62);
  ctx.stroke();
  ctx.restore();
}

function drawRelativeLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  line: readonly [number, number, number, number],
) {
  ctx.beginPath();
  ctx.moveTo(x + line[0] * scale, y + line[1] * scale);
  ctx.lineTo(x + line[2] * scale, y + line[3] * scale);
  ctx.stroke();
}

function drawShipPegPennant(
  ctx: CanvasRenderingContext2D,
  pennant: string,
  shape: ShipPegShape,
  pattern: ShipPegPattern,
  visualKey: string,
  x: number,
  y: number,
  scale: number,
) {
  const mark = SHIP_PEG_MARKS[visualKey] ?? SHIP_PEG_MARKS["treasury-galleon"];
  if (!mark) return;
  drawPegPennant(ctx, pennant, shape, pattern, x + mark.x * scale, y + mark.y * scale, mark.size * scale);
}

function drawProceduralShipPegPennant(
  ctx: CanvasRenderingContext2D,
  pennant: string,
  shape: ShipPegShape,
  pattern: ShipPegPattern,
  x: number,
  y: number,
  scale: number,
) {
  drawPegPennant(ctx, pennant, shape, pattern, x - 10 * scale, y - 27 * scale, 4.8 * scale);
}

function drawPegPennant(
  ctx: CanvasRenderingContext2D,
  pennant: string,
  shape: ShipPegShape,
  pattern: ShipPegPattern,
  x: number,
  y: number,
  size: number,
) {
  const color = PENNANTS[pennant] ?? PENNANTS.slate;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#2f2117";
  ctx.lineWidth = Math.max(1, size * 0.18);
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.9);
  ctx.lineTo(x, y - size * 1.15);
  ctx.stroke();

  const centerX = x + size * 0.62;
  const centerY = y - size * 0.72;
  ctx.fillStyle = color;
  pegPennantPath(ctx, shape, centerX, centerY, size);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  pegPennantPath(ctx, shape, centerX, centerY, size * 0.86);
  ctx.clip();
  drawPegPattern(ctx, pattern, centerX, centerY, size, readableInkForFill(color));
  ctx.restore();
  ctx.restore();
}

function pegPennantPath(ctx: CanvasRenderingContext2D, shape: ShipPegShape, x: number, y: number, size: number) {
  if (shape === "diamond") {
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.58);
    ctx.lineTo(x + size * 0.66, y);
    ctx.lineTo(x, y + size * 0.58);
    ctx.lineTo(x - size * 0.66, y);
    ctx.closePath();
  } else if (shape === "shield") {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.58, y - size * 0.48);
    ctx.lineTo(x + size * 0.58, y - size * 0.48);
    ctx.lineTo(x + size * 0.48, y + size * 0.16);
    ctx.lineTo(x, y + size * 0.62);
    ctx.lineTo(x - size * 0.48, y + size * 0.16);
    ctx.closePath();
  } else if (shape === "crown") {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.62, y + size * 0.42);
    ctx.lineTo(x - size * 0.54, y - size * 0.36);
    ctx.lineTo(x - size * 0.18, y - size * 0.08);
    ctx.lineTo(x, y - size * 0.52);
    ctx.lineTo(x + size * 0.18, y - size * 0.08);
    ctx.lineTo(x + size * 0.54, y - size * 0.36);
    ctx.lineTo(x + size * 0.62, y + size * 0.42);
    ctx.closePath();
  } else if (shape === "coin") {
    roundedRectPath(ctx, x - size * 0.56, y - size * 0.5, size * 1.12, size, Math.max(1, size * 0.2));
  } else {
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.58, size * 0.5, 0, 0, Math.PI * 2);
  }
}

function drawPegPattern(
  ctx: CanvasRenderingContext2D,
  pattern: ShipPegPattern,
  x: number,
  y: number,
  size: number,
  ink: string,
) {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1, size * 0.14);
  if (pattern === "ring") {
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.28, size * 0.24, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (pattern === "cross") {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.34, y);
    ctx.lineTo(x + size * 0.34, y);
    ctx.moveTo(x, y - size * 0.32);
    ctx.lineTo(x, y + size * 0.32);
    ctx.stroke();
  } else if (pattern === "grain") {
    for (const offset of [-0.22, 0.08, 0.34]) {
      ctx.beginPath();
      ctx.ellipse(x + offset * size, y + size * 0.08, size * 0.08, size * 0.18, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === "wave") {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.36, y + size * 0.08);
    ctx.quadraticCurveTo(x - size * 0.16, y - size * 0.18, x + size * 0.04, y + size * 0.08);
    ctx.quadraticCurveTo(x + size * 0.22, y + size * 0.3, x + size * 0.38, y + size * 0.02);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.36, y);
    ctx.lineTo(x + size * 0.36, y);
    ctx.stroke();
  }
}

function logoShapePath(ctx: CanvasRenderingContext2D, shape: ShipLogoShape, x: number, y: number, width: number, height: number) {
  if (shape === "circle" || shape === "ring") {
    ctx.beginPath();
    ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else if (shape === "diamond") {
    ctx.beginPath();
    ctx.moveTo(x, y - height / 2);
    ctx.lineTo(x + width / 2, y);
    ctx.lineTo(x, y + height / 2);
    ctx.lineTo(x - width / 2, y);
    ctx.closePath();
  } else if (shape === "hex") {
    ctx.beginPath();
    ctx.moveTo(x - width * 0.28, y - height / 2);
    ctx.lineTo(x + width * 0.28, y - height / 2);
    ctx.lineTo(x + width / 2, y);
    ctx.lineTo(x + width * 0.28, y + height / 2);
    ctx.lineTo(x - width * 0.28, y + height / 2);
    ctx.lineTo(x - width / 2, y);
    ctx.closePath();
  } else if (shape === "triangle") {
    ctx.beginPath();
    ctx.moveTo(x, y - height / 2);
    ctx.lineTo(x + width / 2, y + height / 2);
    ctx.lineTo(x - width / 2, y + height / 2);
    ctx.closePath();
  } else if (shape === "slash") {
    ctx.beginPath();
    ctx.moveTo(x - width * 0.28, y - height / 2);
    ctx.lineTo(x + width / 2, y - height / 2);
    ctx.lineTo(x + width * 0.28, y + height / 2);
    ctx.lineTo(x - width / 2, y + height / 2);
    ctx.closePath();
  } else {
    roundedRectPath(ctx, x - width / 2, y - height / 2, width, height, Math.max(1, width * 0.2));
  }
}

function drawShipSignalOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: PharosVilleWorld["ships"][number]["visual"]["overlay"],
  x: number,
  y: number,
  scale: number,
) {
  if (overlay === "none") return;
  const color = overlay === "nav" ? "#d9b974" : overlay === "yield" ? "#78b689" : "#9fb0aa";
  ctx.save();
  ctx.strokeStyle = "#2f2117";
  ctx.lineWidth = Math.max(1, 1 * scale);
  ctx.beginPath();
  ctx.moveTo(x, y + 10 * scale);
  ctx.lineTo(x, y - 8 * scale);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 8 * scale);
  ctx.lineTo(x + 10 * scale, y - 5 * scale);
  ctx.lineTo(x + 7 * scale, y);
  ctx.lineTo(x, y - 1 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (overlay === "nav") {
    ctx.fillStyle = "rgba(255, 241, 191, 0.48)";
    ctx.beginPath();
    ctx.ellipse(x + 5 * scale, y - 3 * scale, 6 * scale, 2.4 * scale, -0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShipSailTint(
  ctx: CanvasRenderingContext2D,
  asset: LoadedPharosVilleAsset,
  x: number,
  y: number,
  scale: number,
  livery: ShipLivery,
) {
  const tint = shipSailTintCanvasFor(asset, livery);
  if (!tint) return;
  const { entry } = asset;
  const width = entry.width * entry.displayScale * scale;
  const height = entry.height * entry.displayScale * scale;
  const left = Math.round(x - entry.anchor[0] * entry.displayScale * scale);
  const top = Math.round(y - entry.anchor[1] * entry.displayScale * scale);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(tint, left, top, Math.round(width), Math.round(height));
  ctx.restore();
}

function shipSailTintCanvasFor(asset: LoadedPharosVilleAsset, livery: ShipLivery): HTMLCanvasElement | null {
  const { entry, image } = asset;
  const spec = SHIP_SAIL_TINT_MASKS[entry.id];
  const cacheKey = `${entry.id}:${livery.sailColor.toLowerCase()}:${livery.primary.toLowerCase()}:${livery.accent.toLowerCase()}`;
  if (shipSailTintCache.has(cacheKey)) {
    const cached = shipSailTintCache.get(cacheKey) ?? null;
    shipSailTintCache.delete(cacheKey);
    shipSailTintCache.set(cacheKey, cached);
    return cached;
  }
  const canvas = spec ? createSailTintCanvas(entry.width, entry.height) : null;
  if (!canvas || !spec) {
    rememberShipSailTint(cacheKey, null);
    return null;
  }
  const tintCtx = canvas.getContext("2d", { willReadFrequently: true });
  if (!tintCtx) {
    rememberShipSailTint(cacheKey, null);
    return null;
  }
  try {
    tintCtx.drawImage(image, 0, 0, entry.width, entry.height);
    const imageData = tintCtx.getImageData(0, 0, entry.width, entry.height);
    recolorSailImageData(imageData.data, entry.width, entry.height, spec, livery);
    tintCtx.putImageData(imageData, 0, 0);
  } catch {
    rememberShipSailTint(cacheKey, null);
    return null;
  }
  rememberShipSailTint(cacheKey, canvas);
  return canvas;
}

function rememberShipSailTint(cacheKey: string, canvas: HTMLCanvasElement | null) {
  shipSailTintCache.set(cacheKey, canvas);
  while (shipSailTintCache.size > SHIP_SAIL_TINT_CACHE_MAX) {
    const oldest = shipSailTintCache.keys().next().value;
    if (typeof oldest !== "string") break;
    shipSailTintCache.delete(oldest);
  }
}

function createSailTintCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawWake(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  intensity: number,
  heading: { x: number; y: number },
  zone: ShipWaterZone,
) {
  const style = wakeStyleForZone(zone);
  const headingMagnitude = Math.hypot(heading.x, heading.y);
  const forward = headingMagnitude > 0
    ? { x: heading.x / headingMagnitude, y: heading.y / headingMagnitude }
    : { x: -1, y: 0 };
  const wakeDirection = { x: -forward.x, y: -forward.y };
  const cross = { x: -forward.y, y: forward.x };
  ctx.save();
  ctx.strokeStyle = wakeRgba(style, 0.22 + intensity * style.alphaScale);
  ctx.lineWidth = Math.max(1, zoom * style.lineScale);
  for (let index = 0; index < 3; index += 1) {
    const offset = index * style.spacing * zoom;
    const baseDistance = (14 + offset) * zoom;
    const spread = (style.spread + index * style.spreadStep) * zoom;
    const length = (style.length + index * style.lengthStep) * zoom;
    ctx.beginPath();
    ctx.moveTo(
      x + wakeDirection.x * baseDistance + cross.x * spread,
      y + wakeDirection.y * baseDistance + cross.y * spread,
    );
    ctx.lineTo(
      x + wakeDirection.x * (baseDistance + length) + cross.x * spread * 1.45,
      y + wakeDirection.y * (baseDistance + length) + cross.y * spread * 1.45,
    );
    ctx.stroke();
  }
  ctx.restore();
}

function headingBasis(heading: { x: number; y: number }): {
  cross: { x: number; y: number };
  forward: { x: number; y: number };
} {
  const magnitude = Math.hypot(heading.x, heading.y);
  const forward = magnitude > 0
    ? { x: heading.x / magnitude, y: heading.y / magnitude }
    : { x: -1, y: 0 };
  return {
    cross: { x: -forward.y, y: forward.x },
    forward,
  };
}

function wakeStyleForZone(zone: ShipWaterZone): {
  alphaScale: number;
  b: number;
  g: number;
  length: number;
  lengthStep: number;
  lineScale: number;
  r: number;
  spacing: number;
  spread: number;
  spreadStep: number;
} {
  if (zone === "ledger") return { r: 228, g: 210, b: 142, alphaScale: 0.1, length: 9, lengthStep: 2, lineScale: 0.84, spacing: 5.5, spread: 3, spreadStep: 1.5 };
  if (zone === "calm") return { r: 177, g: 232, b: 222, alphaScale: 0.12, length: 10, lengthStep: 2.4, lineScale: 0.9, spacing: 6, spread: 3.5, spreadStep: 1.7 };
  if (zone === "watch") return { r: 180, g: 224, b: 234, alphaScale: 0.15, length: 12, lengthStep: 3, lineScale: 1, spacing: 7, spread: 4, spreadStep: 2 };
  if (zone === "alert") return { r: 190, g: 238, b: 229, alphaScale: 0.17, length: 13, lengthStep: 3.4, lineScale: 1.04, spacing: 7.2, spread: 4.4, spreadStep: 2.1 };
  if (zone === "warning") return { r: 222, g: 235, b: 225, alphaScale: 0.19, length: 15, lengthStep: 4, lineScale: 1.08, spacing: 7.8, spread: 4.8, spreadStep: 2.4 };
  return { r: 236, g: 241, b: 230, alphaScale: 0.22, length: 17, lengthStep: 4.8, lineScale: 1.14, spacing: 8.4, spread: 5.2, spreadStep: 2.8 };
}

function wakeRgba(style: ReturnType<typeof wakeStyleForZone>, alpha: number): string {
  return `rgba(${style.r}, ${style.g}, ${style.b}, ${Math.max(0, Math.min(0.52, alpha))})`;
}
