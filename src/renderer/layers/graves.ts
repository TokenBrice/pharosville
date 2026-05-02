import { CAUSE_HEX, type CauseOfDeath } from "@shared/lib/cause-of-death";
import type { ScreenPoint } from "../../systems/projection";
import type { PharosVilleWorld } from "../../systems/world-types";
import type { PharosVilleAssetManager } from "../asset-manager";
import { hexToRgba, roundedRectPath } from "../canvas-primitives";
import type { RenderFrameCache } from "../frame-cache";
import type { ResolvedEntityGeometry } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";

const GRAVE_CAUSE_COLORS: Record<CauseOfDeath, string> = CAUSE_HEX;

type WreckMarker = PharosVilleWorld["graves"][number]["visual"]["marker"];

// Logo plaque vertical offset above the wreck silhouette, in coordinate-space units.
const WRECK_LOGO_OFFSET: Record<WreckMarker, number> = {
  "broken-keel": 11,
  "sinking-stern": 13,
  grounded: 14,
  shattered: 11,
  skeletal: 10,
};

// Visual abstraction tier — many small dead coins should not each render a
// full wreck silhouette; the cove reads as a debris field by tiering the
// per-grave visual into:
//   major   — distinct half-sunken wreck silhouette (one of 5 cause variants)
//   medium  — partial hull stub (bow or stern only)
//   debris  — a couple of floating planks
type WreckTier = "major" | "medium" | "debris";

function wreckTier(scale: number): WreckTier {
  if (scale >= 0.41) return "major";
  if (scale >= 0.33) return "medium";
  return "debris";
}

const WRECK_PALETTE = {
  hullDark: "#2c1f15",
  hullMid: "#5a3f26",
  hullLight: "#8c6638",
  hullPlank: "#b58146",
  hullShadow: "rgba(12, 16, 14, 0.46)",
  outline: "#1b1410",
  rib: "rgba(220, 204, 168, 0.92)",
  ribShadow: "#352618",
  metal: "#7d6a3a",
  metalHighlight: "#d2aa61",
  foam: "rgba(232, 244, 232, 0.78)",
  foamCore: "rgba(186, 214, 206, 0.62)",
  rock: "#5a5246",
  rockHighlight: "#a39074",
  sailRag: "rgba(228, 218, 184, 0.7)",
} as const;

export interface GraveRenderState {
  causeColor: string;
  emphasized: boolean;
  geometry: ResolvedEntityGeometry;
  graveZoom: number;
  p: ScreenPoint;
}

export interface GraveRenderFrame {
  cache: RenderFrameCache;
  graveRenderStates: Map<string, GraveRenderState>;
}

function graveRenderState(input: DrawPharosVilleInput, frame: GraveRenderFrame, grave: PharosVilleWorld["graves"][number]): GraveRenderState {
  const cached = frame.graveRenderStates.get(grave.id);
  if (cached) return cached;
  const { camera, hoveredTarget, selectedTarget } = input;
  const geometry = frame.cache.geometryForEntity(grave);
  const p = geometry.screenPoint;
  const causeColor = GRAVE_CAUSE_COLORS[grave.entry.causeOfDeath] ?? GRAVE_CAUSE_COLORS.abandoned;
  const emphasized = hoveredTarget?.id === grave.id || selectedTarget?.id === grave.id;
  const graveZoom = camera.zoom * grave.visual.scale;
  const state = { causeColor, emphasized, geometry, graveZoom, p };
  frame.graveRenderStates.set(grave.id, state);
  return state;
}

export function drawGraveUnderlay(input: DrawPharosVilleInput, frame: GraveRenderFrame, grave: PharosVilleWorld["graves"][number]) {
  const { ctx } = input;
  const { causeColor, emphasized, geometry, graveZoom } = graveRenderState(input, frame, grave);
  drawWreckGroundShadow(ctx, geometry.drawPoint.x, geometry.drawPoint.y, graveZoom, causeColor, emphasized);
}

export function drawGraveBody(input: DrawPharosVilleInput, frame: GraveRenderFrame, grave: PharosVilleWorld["graves"][number]) {
  const { camera, ctx } = input;
  const { causeColor, geometry } = graveRenderState(input, frame, grave);
  const tier = wreckTier(grave.visual.scale);
  if (tier === "debris") {
    drawFloatingDebris(ctx, geometry.drawPoint.x, geometry.drawPoint.y, camera.zoom * grave.visual.scale, causeColor, grave.id);
    return;
  }
  if (tier === "medium") {
    drawHullStub(ctx, geometry.drawPoint.x, geometry.drawPoint.y, camera.zoom * grave.visual.scale, causeColor, grave.visual.marker, grave.id);
    return;
  }
  drawProceduralWreck(
    ctx,
    geometry.drawPoint.x,
    geometry.drawPoint.y,
    camera.zoom,
    causeColor,
    grave.visual.marker,
    grave.visual.scale,
  );
}

export function drawGraveOverlay(input: DrawPharosVilleInput, frame: GraveRenderFrame, grave: PharosVilleWorld["graves"][number]) {
  const { assets, camera, ctx } = input;
  const { causeColor, emphasized, geometry } = graveRenderState(input, frame, grave);
  const tier = wreckTier(grave.visual.scale);
  // Only major wrecks always carry a logo plaque; medium/debris only show one
  // when hovered/selected so the cove doesn't turn into a wall of plaques.
  if (!emphasized && tier !== "major") return;
  const offsetUnits = tier === "major"
    ? WRECK_LOGO_OFFSET[grave.visual.marker]
    : tier === "medium"
      ? 8
      : 5;
  drawGraveLogo({
    ctx,
    causeColor,
    emphasized,
    major: tier === "major",
    logo: assets?.getLogo(grave.logoSrc) ?? null,
    mark: grave.label,
    radius: Math.max(1, 2.05 * camera.zoom * Math.sqrt(grave.visual.scale)),
    x: geometry.drawPoint.x,
    y: geometry.drawPoint.y - offsetUnits * camera.zoom * grave.visual.scale,
  });
}

function drawWreckGroundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  causeColor: string,
  emphasized: boolean,
) {
  ctx.save();
  // Foam ring around the waterline — wrecks now sit IN water.
  ctx.fillStyle = WRECK_PALETTE.foam;
  ctx.beginPath();
  ctx.ellipse(x, y + 3 * zoom, 17 * zoom, 5.5 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = WRECK_PALETTE.foamCore;
  ctx.beginPath();
  ctx.ellipse(x, y + 3 * zoom, 13 * zoom, 4 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hover/selection halo overrides foam.
  if (emphasized) {
    ctx.fillStyle = `${causeColor}55`;
    ctx.beginPath();
    ctx.ellipse(x, y + 3 * zoom, 18 * zoom, 6 * zoom, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawProceduralWreck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  causeColor: string,
  marker: WreckMarker,
  markerScale: number,
) {
  ctx.save();
  ctx.translate(x, y + 1 * zoom);
  ctx.scale(zoom * markerScale * 2.2, zoom * markerScale * 2.2);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (marker === "broken-keel") drawBrokenKeel(ctx, causeColor);
  else if (marker === "sinking-stern") drawSinkingStern(ctx, causeColor);
  else if (marker === "grounded") drawGroundedWreck(ctx, causeColor);
  else if (marker === "shattered") drawShatteredWreck(ctx, causeColor);
  else drawSkeletalWreck(ctx, causeColor);

  ctx.restore();
}

function drawBrokenKeel(ctx: CanvasRenderingContext2D, causeColor: string) {
  // Hull split clean across midship, halves nudged apart, broken mast lying across the gap.
  ctx.fillStyle = WRECK_PALETTE.hullDark;
  // Left half hull.
  ctx.beginPath();
  ctx.moveTo(-13, 3);
  ctx.quadraticCurveTo(-12.5, -2.5, -8, -3.4);
  ctx.lineTo(-2.4, -3.0);
  ctx.lineTo(-1.6, 3);
  ctx.closePath();
  ctx.fill();
  strokeOutline(ctx);

  // Right half hull.
  ctx.fillStyle = WRECK_PALETTE.hullDark;
  ctx.beginPath();
  ctx.moveTo(2.0, 3);
  ctx.lineTo(2.6, -3.0);
  ctx.lineTo(8, -3.4);
  ctx.quadraticCurveTo(12.5, -2.5, 13, 3);
  ctx.closePath();
  ctx.fill();
  strokeOutline(ctx);

  // Decks (lighter).
  ctx.fillStyle = WRECK_PALETTE.hullMid;
  ctx.beginPath();
  ctx.moveTo(-11.5, 1.6);
  ctx.quadraticCurveTo(-11, -2, -7.6, -2.6);
  ctx.lineTo(-2.6, -2.4);
  ctx.lineTo(-2.0, 1.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2.4, 1.6);
  ctx.lineTo(2.8, -2.4);
  ctx.lineTo(7.6, -2.6);
  ctx.quadraticCurveTo(11, -2, 11.5, 1.6);
  ctx.closePath();
  ctx.fill();

  // Plank lines.
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.5;
  for (let i = -10; i <= -3; i += 2.5) {
    ctx.beginPath();
    ctx.moveTo(i, -2.4);
    ctx.lineTo(i + 0.4, 1.4);
    ctx.stroke();
  }
  for (let i = 3; i <= 10; i += 2.5) {
    ctx.beginPath();
    ctx.moveTo(i, -2.4);
    ctx.lineTo(i + 0.4, 1.4);
    ctx.stroke();
  }

  // Snapped mast lying across the gap.
  ctx.save();
  ctx.rotate(-0.15);
  ctx.fillStyle = WRECK_PALETTE.hullPlank;
  ctx.fillRect(-9, -6.4, 18, 1.4);
  ctx.fillStyle = WRECK_PALETTE.outline;
  ctx.fillRect(-9, -6.4, 18, 0.4);
  // Splintered ends.
  ctx.fillStyle = WRECK_PALETTE.hullDark;
  ctx.beginPath();
  ctx.moveTo(-9, -6.4);
  ctx.lineTo(-10.4, -5.4);
  ctx.lineTo(-9, -4.8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(9, -6.4);
  ctx.lineTo(10.4, -5.0);
  ctx.lineTo(9, -4.8);
  ctx.fill();
  ctx.restore();

  // Debris in the gap.
  ctx.fillStyle = WRECK_PALETTE.hullPlank;
  ctx.fillRect(-1.4, 0.6, 2.8, 0.8);
  ctx.fillRect(-0.8, -1.4, 1.6, 0.6);

  drawCausePennant(ctx, -8, -3.6, causeColor);
}

function drawSinkingStern(ctx: CanvasRenderingContext2D, causeColor: string) {
  // Stern protruding from sand/water at an angle, foam ring around the bow side.
  // Foam ring underneath.
  ctx.fillStyle = WRECK_PALETTE.foamCore;
  ctx.beginPath();
  ctx.ellipse(-2, 4.2, 14, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = WRECK_PALETTE.foam;
  ctx.beginPath();
  ctx.ellipse(-2, 4, 11, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sunken bow (just hint of curve).
  ctx.fillStyle = WRECK_PALETTE.hullDark;
  ctx.beginPath();
  ctx.moveTo(-12, 4);
  ctx.quadraticCurveTo(-11.5, 3, -8, 3.2);
  ctx.lineTo(-7, 4.2);
  ctx.closePath();
  ctx.fill();

  // Stern emerging — tilted upward.
  ctx.save();
  ctx.translate(6, -1);
  ctx.rotate(-0.34);
  ctx.fillStyle = WRECK_PALETTE.hullDark;
  ctx.beginPath();
  ctx.moveTo(-7, 4);
  ctx.lineTo(-6, -4);
  ctx.quadraticCurveTo(-3, -7, 3, -7);
  ctx.quadraticCurveTo(6, -6.5, 7, -3);
  ctx.lineTo(7, 4);
  ctx.closePath();
  ctx.fill();
  strokeOutline(ctx);

  ctx.fillStyle = WRECK_PALETTE.hullMid;
  ctx.beginPath();
  ctx.moveTo(-5.4, 3);
  ctx.lineTo(-4.6, -3.4);
  ctx.quadraticCurveTo(-2.6, -5.6, 2.8, -5.6);
  ctx.quadraticCurveTo(5, -5.2, 5.6, -2.6);
  ctx.lineTo(5.6, 3);
  ctx.closePath();
  ctx.fill();

  // Stern transom plank lines.
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.5;
  for (let i = -4; i <= 4; i += 2) {
    ctx.beginPath();
    ctx.moveTo(i, -5);
    ctx.lineTo(i, 2.6);
    ctx.stroke();
  }

  // Lantern hanging from the stern.
  ctx.fillStyle = WRECK_PALETTE.metalHighlight;
  ctx.beginPath();
  ctx.arc(0, -7.6, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(0, -5.6);
  ctx.stroke();
  ctx.restore();

  drawCausePennant(ctx, 7.4, -6, causeColor);
}

function drawGroundedWreck(ctx: CanvasRenderingContext2D, causeColor: string) {
  // Hull listing on rocks, exposed keel on one side, mast leaning at angle.
  // Rocks underneath.
  ctx.fillStyle = WRECK_PALETTE.rock;
  ctx.beginPath();
  ctx.ellipse(-7, 3, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(7, 3.4, 6, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = WRECK_PALETTE.rockHighlight;
  ctx.beginPath();
  ctx.ellipse(-7.6, 2.4, 3, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(6.4, 2.8, 4, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tilted hull.
  ctx.save();
  ctx.rotate(-0.22);
  ctx.fillStyle = WRECK_PALETTE.hullDark;
  ctx.beginPath();
  ctx.moveTo(-13, 1.4);
  ctx.quadraticCurveTo(-12, -3, -7, -3.8);
  ctx.lineTo(7, -3.8);
  ctx.quadraticCurveTo(12, -3, 13, 1.4);
  ctx.lineTo(11, 3);
  ctx.lineTo(-11, 3);
  ctx.closePath();
  ctx.fill();
  strokeOutline(ctx);

  // Exposed keel underside (lighter wood).
  ctx.fillStyle = WRECK_PALETTE.hullPlank;
  ctx.beginPath();
  ctx.moveTo(-13, 1.4);
  ctx.lineTo(-11, 3);
  ctx.lineTo(11, 3);
  ctx.lineTo(13, 1.4);
  ctx.closePath();
  ctx.fill();

  // Deck.
  ctx.fillStyle = WRECK_PALETTE.hullMid;
  ctx.beginPath();
  ctx.moveTo(-11, -0.4);
  ctx.quadraticCurveTo(-10, -3, -6.5, -3);
  ctx.lineTo(6.5, -3);
  ctx.quadraticCurveTo(10, -3, 11, -0.4);
  ctx.closePath();
  ctx.fill();

  // Plank lines.
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.5;
  for (let i = -8; i <= 8; i += 2.5) {
    ctx.beginPath();
    ctx.moveTo(i, -2.6);
    ctx.lineTo(i + 0.3, -0.6);
    ctx.stroke();
  }

  // Leaning mast.
  ctx.save();
  ctx.translate(-1.5, -3);
  ctx.rotate(-0.45);
  ctx.fillStyle = WRECK_PALETTE.hullPlank;
  ctx.fillRect(-0.7, -10, 1.4, 11);
  ctx.fillStyle = WRECK_PALETTE.outline;
  ctx.fillRect(-0.7, -10, 0.5, 11);
  // Tattered sail.
  ctx.fillStyle = WRECK_PALETTE.sailRag;
  ctx.beginPath();
  ctx.moveTo(0.7, -8);
  ctx.lineTo(4.2, -6.5);
  ctx.lineTo(3.4, -3.5);
  ctx.lineTo(1.6, -4.4);
  ctx.lineTo(0.7, -5.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.45;
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  drawCausePennant(ctx, -8.6, -4.8, causeColor);
}

function drawShatteredWreck(ctx: CanvasRenderingContext2D, causeColor: string) {
  // Destroyed hull with planks scattered radially.
  // Scattered planks first (under the hull).
  const debris = [
    { x: -10, y: 3.4, angle: 0.4, len: 5 },
    { x: 9, y: 3.6, angle: -0.3, len: 4.5 },
    { x: -7, y: -2.6, angle: -0.9, len: 3.6 },
    { x: 7, y: -2.4, angle: 1.0, len: 3.8 },
    { x: 0, y: 4.2, angle: 0.0, len: 5.5 },
    { x: -2, y: -4.4, angle: 1.4, len: 3.2 },
  ] as const;
  for (const piece of debris) {
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.angle);
    ctx.fillStyle = WRECK_PALETTE.hullPlank;
    ctx.fillRect(-piece.len / 2, -0.6, piece.len, 1.2);
    ctx.fillStyle = WRECK_PALETTE.outline;
    ctx.fillRect(-piece.len / 2, -0.6, piece.len, 0.4);
    ctx.restore();
  }

  // Central destroyed hull — splayed open like a cracked nut.
  ctx.fillStyle = WRECK_PALETTE.hullDark;
  ctx.beginPath();
  ctx.moveTo(-9, 2.4);
  ctx.lineTo(-6, -3);
  ctx.lineTo(-2.4, -1.6);
  ctx.lineTo(-1, -3.6);
  ctx.lineTo(1.4, -3.4);
  ctx.lineTo(2.6, -1.6);
  ctx.lineTo(6, -2.6);
  ctx.lineTo(9, 2.6);
  ctx.lineTo(6, 3.2);
  ctx.lineTo(-6, 3);
  ctx.closePath();
  ctx.fill();
  strokeOutline(ctx);

  // Inner cracked deck.
  ctx.fillStyle = WRECK_PALETTE.hullMid;
  ctx.beginPath();
  ctx.moveTo(-7, 2);
  ctx.lineTo(-5, -1.6);
  ctx.lineTo(-1.6, 0.4);
  ctx.lineTo(0, -1.2);
  ctx.lineTo(1.6, 0.4);
  ctx.lineTo(5, -1.4);
  ctx.lineTo(7, 2.2);
  ctx.lineTo(5, 2.6);
  ctx.lineTo(-5, 2.4);
  ctx.closePath();
  ctx.fill();

  // Crack lines radiating.
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, 2.6);
  ctx.lineTo(0, -2.4);
  ctx.moveTo(-3, 2.4);
  ctx.lineTo(-1, -1);
  ctx.moveTo(3, 2.4);
  ctx.lineTo(1, -1);
  ctx.stroke();

  // Snapped mast stub jammed in the deck.
  ctx.fillStyle = WRECK_PALETTE.hullPlank;
  ctx.fillRect(-0.6, -6, 1.2, 4);
  ctx.fillStyle = WRECK_PALETTE.outline;
  ctx.fillRect(-0.6, -6, 0.4, 4);
  ctx.fillStyle = WRECK_PALETTE.hullDark;
  ctx.beginPath();
  ctx.moveTo(-0.6, -6);
  ctx.lineTo(-1, -7.4);
  ctx.lineTo(0.4, -6.6);
  ctx.lineTo(0.8, -7.6);
  ctx.lineTo(0.6, -6);
  ctx.closePath();
  ctx.fill();

  drawCausePennant(ctx, -7.5, -4.5, causeColor);
}

function drawSkeletalWreck(ctx: CanvasRenderingContext2D, causeColor: string) {
  // Bare ribbed hull frame (no planking), broken stub mast, weathered.
  ctx.fillStyle = WRECK_PALETTE.hullDark;
  // Keel beam.
  ctx.fillRect(-12, 2.0, 24, 1.2);
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(-12, 2.0, 24, 1.2);

  // Curved ribs (alternating tall + short).
  const ribs = [-10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10];
  for (const rx of ribs) {
    const tall = Math.abs(rx) <= 5.5;
    const top = tall ? -4 : -2.6;
    ctx.strokeStyle = WRECK_PALETTE.rib;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(rx, 2.0);
    ctx.quadraticCurveTo(rx + 0.4, top + 1, rx + 0.2, top);
    ctx.stroke();
    // Rib shadow side.
    ctx.strokeStyle = WRECK_PALETTE.ribShadow;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(rx + 0.4, 2.0);
    ctx.quadraticCurveTo(rx + 0.8, top + 1, rx + 0.6, top);
    ctx.stroke();
  }

  // Bow stem post.
  ctx.fillStyle = WRECK_PALETTE.hullMid;
  ctx.beginPath();
  ctx.moveTo(-12, 2.0);
  ctx.lineTo(-13.2, -3);
  ctx.lineTo(-11.6, -3);
  ctx.lineTo(-10.4, 2.0);
  ctx.closePath();
  ctx.fill();
  strokeOutline(ctx);

  // Stern post.
  ctx.fillStyle = WRECK_PALETTE.hullMid;
  ctx.beginPath();
  ctx.moveTo(12, 2.0);
  ctx.lineTo(13.2, -2.4);
  ctx.lineTo(11.4, -2.4);
  ctx.lineTo(10.2, 2.0);
  ctx.closePath();
  ctx.fill();
  strokeOutline(ctx);

  // Stub mast.
  ctx.fillStyle = WRECK_PALETTE.hullPlank;
  ctx.fillRect(-0.6, -5.4, 1.2, 3.4);
  ctx.fillStyle = WRECK_PALETTE.outline;
  ctx.fillRect(-0.6, -5.4, 0.4, 3.4);
  // Splintered top.
  ctx.fillStyle = WRECK_PALETTE.hullDark;
  ctx.beginPath();
  ctx.moveTo(-0.6, -5.4);
  ctx.lineTo(-1, -6.4);
  ctx.lineTo(0.6, -6);
  ctx.lineTo(0.8, -7);
  ctx.lineTo(0.6, -5.4);
  ctx.closePath();
  ctx.fill();

  drawCausePennant(ctx, -8, -4, causeColor);
}

function strokeOutline(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

function drawCausePennant(ctx: CanvasRenderingContext2D, x: number, y: number, causeColor: string) {
  // Small cause-color pennant flying from a thin pole — replaces the old plaque chip.
  ctx.save();
  ctx.translate(x, y);
  // Pole.
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -3.6);
  ctx.stroke();
  // Pennant flag.
  ctx.fillStyle = causeColor;
  ctx.beginPath();
  ctx.moveTo(0, -3.4);
  ctx.lineTo(3.4, -2.8);
  ctx.lineTo(2.6, -2.0);
  ctx.lineTo(3.2, -1.2);
  ctx.lineTo(0, -1.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.restore();
}

function stableUnit(seed: string): number {
  // Cheap deterministic hash → unit float, kept local to avoid an import.
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

function drawHullStub(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  causeColor: string,
  marker: WreckMarker,
  graveId: string,
) {
  // Just a partial hull — bow or stern poking out of the lagoon, scale
  // smaller than a major wreck so the cove reads as varied debris.
  const showStern = stableUnit(graveId) > 0.5;
  ctx.save();
  ctx.translate(x, y + 1 * zoom);
  ctx.scale(zoom * 2.0, zoom * 2.0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Skeletal markers render as ribs poking up from the water rather than a hull stub.
  if (marker === "skeletal") {
    for (const rx of [-3.5, -1.2, 1.2, 3.5]) {
      ctx.strokeStyle = WRECK_PALETTE.rib;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx, 1.5);
      ctx.quadraticCurveTo(rx + 0.3, -2, rx - 0.4, -4.5);
      ctx.stroke();
      ctx.strokeStyle = WRECK_PALETTE.ribShadow;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(rx + 0.4, 1.5);
      ctx.quadraticCurveTo(rx + 0.7, -2, rx, -4.5);
      ctx.stroke();
    }
    drawCausePennant(ctx, -4.5, -3, causeColor);
    ctx.restore();
    return;
  }

  // Hull half (stern or bow).
  ctx.fillStyle = WRECK_PALETTE.hullDark;
  ctx.beginPath();
  if (showStern) {
    ctx.moveTo(-2, 2);
    ctx.lineTo(-1.5, -3.5);
    ctx.quadraticCurveTo(1, -5, 6, -5);
    ctx.quadraticCurveTo(8.5, -4.4, 9, -1.6);
    ctx.lineTo(9, 2);
  } else {
    ctx.moveTo(-9, 2);
    ctx.quadraticCurveTo(-8.5, -4, -3, -4.6);
    ctx.lineTo(2, -4.6);
    ctx.lineTo(2, 2);
  }
  ctx.closePath();
  ctx.fill();
  strokeOutline(ctx);

  ctx.fillStyle = WRECK_PALETTE.hullMid;
  ctx.beginPath();
  if (showStern) {
    ctx.moveTo(-1.4, 1.4);
    ctx.lineTo(-0.9, -2.8);
    ctx.quadraticCurveTo(1.4, -4, 5.4, -4);
    ctx.quadraticCurveTo(7.4, -3.6, 7.8, -1.2);
    ctx.lineTo(7.8, 1.4);
  } else {
    ctx.moveTo(-7.8, 1.4);
    ctx.quadraticCurveTo(-7.4, -3.2, -2.8, -3.8);
    ctx.lineTo(1.4, -3.8);
    ctx.lineTo(1.4, 1.4);
  }
  ctx.closePath();
  ctx.fill();

  // Plank lines.
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.4;
  for (let i = showStern ? 0 : -7; i <= (showStern ? 6 : -1); i += 2) {
    ctx.beginPath();
    ctx.moveTo(i, -3.4);
    ctx.lineTo(i + 0.2, 0.8);
    ctx.stroke();
  }

  // Snapped mast stub.
  if (marker !== "shattered") {
    const mx = showStern ? 4 : -4;
    ctx.fillStyle = WRECK_PALETTE.hullPlank;
    ctx.fillRect(mx - 0.5, -7, 1, 4.5);
    ctx.fillStyle = WRECK_PALETTE.outline;
    ctx.fillRect(mx - 0.5, -7, 0.4, 4.5);
  }

  drawCausePennant(ctx, showStern ? -1.5 : -7.5, -4, causeColor);
  ctx.restore();
}

function drawFloatingDebris(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  causeColor: string,
  graveId: string,
) {
  // Two or three floating planks + a small cause-color dot. Each grave still
  // has an unique selectable position; visual is intentionally minimal.
  const seed = stableUnit(graveId);
  const orient = (seed * 6.28318) - Math.PI;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(orient);
  ctx.scale(zoom * 2.4, zoom * 2.4);

  // Plank #1.
  ctx.fillStyle = WRECK_PALETTE.hullPlank;
  ctx.fillRect(-3.5, -0.6, 7, 1.2);
  ctx.fillStyle = WRECK_PALETTE.outline;
  ctx.fillRect(-3.5, -0.6, 7, 0.4);
  // Plank #2.
  ctx.save();
  ctx.translate(0.5, 1.2);
  ctx.rotate(0.6);
  ctx.fillStyle = WRECK_PALETTE.hullMid;
  ctx.fillRect(-2.5, -0.5, 5, 1);
  ctx.fillStyle = WRECK_PALETTE.outline;
  ctx.fillRect(-2.5, -0.5, 5, 0.3);
  ctx.restore();
  // Plank #3 (only sometimes).
  if (seed > 0.5) {
    ctx.save();
    ctx.translate(-1.6, -0.8);
    ctx.rotate(-0.3);
    ctx.fillStyle = WRECK_PALETTE.hullDark;
    ctx.fillRect(-2, -0.4, 4, 0.8);
    ctx.restore();
  }
  // Cause-color marker dot.
  ctx.fillStyle = causeColor;
  ctx.beginPath();
  ctx.arc(2.4, -0.6, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = WRECK_PALETTE.outline;
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.restore();
}

function drawGraveLogo(input: {
  causeColor: string;
  ctx: CanvasRenderingContext2D;
  emphasized: boolean;
  logo: ReturnType<PharosVilleAssetManager["getLogo"]>;
  major: boolean;
  mark: string;
  radius: number;
  x: number;
  y: number;
}) {
  const { causeColor, ctx, emphasized, logo, major, mark, radius, x, y } = input;
  const safeRadius = Math.max(2, radius);
  const plaqueWidth = safeRadius * 2.1;
  const plaqueHeight = safeRadius * 1.55;
  const plaqueAlpha = emphasized ? 0.95 : major ? 0.76 : 0.54;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (emphasized) {
    ctx.fillStyle = hexToRgba(causeColor, 0.22);
    ctx.beginPath();
    ctx.ellipse(0, 1.2 * safeRadius, safeRadius * 2.2, safeRadius * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  roundedRectPath(ctx, -plaqueWidth / 2, -plaqueHeight / 2, plaqueWidth, plaqueHeight, Math.max(1, safeRadius * 0.28));
  ctx.fillStyle = `rgba(226, 208, 166, ${plaqueAlpha})`;
  ctx.fill();
  ctx.strokeStyle = "rgba(47, 35, 24, 0.7)";
  ctx.lineWidth = Math.max(0.65, safeRadius * 0.13);
  ctx.stroke();

  if (emphasized || major) {
    ctx.strokeStyle = hexToRgba(causeColor, emphasized ? 0.78 : 0.48);
    ctx.lineWidth = Math.max(0.55, safeRadius * 0.1);
    roundedRectPath(
      ctx,
      -plaqueWidth / 2 + safeRadius * 0.16,
      -plaqueHeight / 2 + safeRadius * 0.16,
      plaqueWidth - safeRadius * 0.32,
      plaqueHeight - safeRadius * 0.32,
      Math.max(1, safeRadius * 0.22),
    );
    ctx.stroke();
  }

  if (logo) {
    ctx.save();
    roundedRectPath(
      ctx,
      -plaqueWidth * 0.34,
      -plaqueHeight * 0.36,
      plaqueWidth * 0.68,
      plaqueHeight * 0.72,
      Math.max(1, safeRadius * 0.2),
    );
    ctx.clip();
    ctx.globalAlpha = emphasized ? 0.95 : major ? 0.82 : 0.68;
    const size = Math.round(Math.max(2, Math.min(plaqueWidth * 0.68, plaqueHeight * 0.72)));
    ctx.drawImage(logo.image, -size / 2, -size / 2, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = `rgba(23, 33, 43, ${emphasized ? 0.88 : 0.62})`;
    ctx.font = `700 ${Math.max(4, safeRadius * 0.74)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mark.slice(0, 2).toUpperCase(), 0, 0.3, plaqueWidth * 0.64);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
}
