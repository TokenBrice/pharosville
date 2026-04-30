import { CAUSE_HEX, type CauseOfDeath } from "@shared/lib/cause-of-death";
import type { ScreenPoint } from "../../systems/projection";
import type { PharosVilleWorld } from "../../systems/world-types";
import type { PharosVilleAssetManager } from "../asset-manager";
import { drawAsset, hexToRgba, roundedRectPath, stableVisualVariant } from "../canvas-primitives";
import type { RenderFrameCache } from "../frame-cache";
import type { ResolvedEntityGeometry } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";

const GRAVE_CAUSE_COLORS: Record<CauseOfDeath, string> = CAUSE_HEX;

type GraveNodeMarker = PharosVilleWorld["graves"][number]["visual"]["marker"];

const GRAVE_ASSET_IDS: Record<GraveNodeMarker, string> = {
  cross: "prop.regulatory-obelisk",
  headstone: "prop.memorial-headstone",
  ledger: "prop.ledger-slab",
  reliquary: "prop.reliquary-marker",
  tablet: "prop.ledger-slab",
};

const GRAVE_ASSET_SCALE: Record<GraveNodeMarker, number> = {
  cross: 0.6,
  headstone: 0.64,
  ledger: 0.7,
  reliquary: 0.58,
  tablet: 0.68,
};

const GRAVE_LOGO_OFFSET: Record<GraveNodeMarker, number> = {
  cross: 13.2,
  headstone: 8.6,
  ledger: 5.7,
  reliquary: 10.4,
  tablet: 6.2,
};

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
  drawGraveShadow(ctx, geometry.drawPoint.x, geometry.drawPoint.y, graveZoom, causeColor, emphasized);
}

export function drawGraveBody(input: DrawPharosVilleInput, frame: GraveRenderFrame, grave: PharosVilleWorld["graves"][number]) {
  const { assets, camera, ctx } = input;
  const { causeColor, emphasized, geometry, p } = graveRenderState(input, frame, grave);
  const graveAsset = assets?.get(GRAVE_ASSET_IDS[grave.visual.marker]) ?? null;
  if (graveAsset) {
    ctx.save();
    ctx.globalAlpha = emphasized || grave.visual.scale >= 0.41 ? 1 : 0.84;
    drawAsset(
      ctx,
      graveAsset,
      geometry.drawPoint.x,
      geometry.drawPoint.y + graveAssetYOffset(grave.visual.marker, camera.zoom),
      camera.zoom * grave.visual.scale * GRAVE_ASSET_SCALE[grave.visual.marker],
    );
    ctx.restore();
    drawGraveCauseChip(
      ctx,
      geometry.drawPoint.x,
      geometry.drawPoint.y - (GRAVE_LOGO_OFFSET[grave.visual.marker] + 3.4) * camera.zoom * grave.visual.scale,
      causeColor,
      camera.zoom * grave.visual.scale,
    );
    return;
  }
  drawProceduralGrave(
    ctx,
    p.x,
    p.y,
    camera.zoom,
    causeColor,
    grave.visual.marker,
    grave.visual.scale,
    grave.entry.causeOfDeath,
  );
}

function graveAssetYOffset(marker: GraveNodeMarker, zoom: number) {
  if (marker === "ledger" || marker === "tablet") return 3.2 * zoom;
  if (marker === "reliquary") return 1.2 * zoom;
  return 1.8 * zoom;
}

function drawGraveCauseChip(ctx: CanvasRenderingContext2D, x: number, y: number, causeColor: string, scale: number) {
  ctx.save();
  ctx.fillStyle = hexToRgba(causeColor, 0.68);
  ctx.strokeStyle = "rgba(52, 42, 28, 0.58)";
  ctx.lineWidth = Math.max(0.7, 0.8 * scale);
  roundedRectPath(ctx, x - 2.9 * scale, y - 1.6 * scale, 5.8 * scale, 3.2 * scale, 1.1 * scale);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawGraveOverlay(input: DrawPharosVilleInput, frame: GraveRenderFrame, grave: PharosVilleWorld["graves"][number]) {
  const { assets, camera, ctx } = input;
  const { causeColor, emphasized, geometry } = graveRenderState(input, frame, grave);
  const major = grave.visual.scale >= 0.41;
  if (!emphasized && !major) return;
  drawGraveLogo({
    ctx,
    causeColor,
    emphasized,
    major,
    logo: assets?.getLogo(grave.logoSrc) ?? null,
    mark: grave.label,
    radius: Math.max(1, 2.05 * camera.zoom * Math.sqrt(grave.visual.scale)),
    x: geometry.drawPoint.x,
    y: geometry.drawPoint.y - GRAVE_LOGO_OFFSET[grave.visual.marker] * camera.zoom * grave.visual.scale,
  });
}

function drawGraveShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  causeColor: string,
  emphasized: boolean,
) {
  ctx.save();
  ctx.fillStyle = emphasized ? `${causeColor}66` : "rgba(13, 18, 14, 0.38)";
  ctx.beginPath();
  ctx.ellipse(x, y + 5 * zoom, 12 * zoom, 5 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const GRAVE_STONE = {
  cap: "#9aa49a",
  dark: "#35413f",
  face: "#748078",
  highlight: "rgba(224, 232, 215, 0.28)",
  moss: "#416c3f",
  outline: "#1b2021",
  side: "#52605c",
  weather: "rgba(17, 23, 21, 0.26)",
} as const;

function drawProceduralGrave(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  causeColor: string,
  marker: GraveNodeMarker,
  markerScale: number,
  causeOfDeath: CauseOfDeath,
) {
  ctx.save();
  ctx.translate(x, y + 2 * zoom);
  ctx.scale(zoom * markerScale, zoom * markerScale);
  ctx.scale(1.1, 1.06);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  drawGraveTufts(ctx, marker);
  if (marker === "cross") {
    drawCrossMarker(ctx, causeColor, causeOfDeath);
  } else if (marker === "reliquary") {
    drawReliquaryMarker(ctx, causeColor, causeOfDeath);
  } else if (marker === "tablet") {
    drawTabletMarker(ctx, causeColor, causeOfDeath);
  } else if (marker === "ledger") {
    drawLedgerMarker(ctx, causeColor, causeOfDeath);
  } else {
    drawHeadstoneMarker(ctx, causeColor, causeOfDeath);
  }
  ctx.restore();
}

function drawHeadstoneMarker(ctx: CanvasRenderingContext2D, causeColor: string, causeOfDeath: CauseOfDeath) {
  drawGraveBase(ctx, 19);
  drawStonePolygon(ctx, [[8.2, -4], [10.8, -6], [10.8, -13.2], [8.2, -12.6]], GRAVE_STONE.side);

  ctx.beginPath();
  ctx.moveTo(-8.2, -4);
  ctx.lineTo(-8.2, -12.6);
  ctx.quadraticCurveTo(-7.6, -18.6, 0, -19.8);
  ctx.quadraticCurveTo(7.6, -18.6, 8.2, -12.6);
  ctx.lineTo(8.2, -4);
  ctx.closePath();
  fillStone(ctx, GRAVE_STONE.face);

  drawStoneHighlight(ctx, -4.8, -15, 9.6);
  drawWeatherCracks(ctx, "headstone");
  drawCausePlaque(ctx, -5.6, -8.3, 11.2, 3.4, causeColor, causeOfDeath);
}

function drawTabletMarker(ctx: CanvasRenderingContext2D, causeColor: string, causeOfDeath: CauseOfDeath) {
  drawGraveBase(ctx, 22);
  drawStonePolygon(ctx, [[8.8, -4.4], [11.6, -6.4], [11.6, -20.6], [8.8, -19]], GRAVE_STONE.side);

  ctx.beginPath();
  ctx.moveTo(-8.8, -4.4);
  ctx.lineTo(-8.8, -20.8);
  ctx.lineTo(5.6, -20.8);
  ctx.lineTo(8.8, -18.4);
  ctx.lineTo(8.8, -4.4);
  ctx.closePath();
  fillStone(ctx, GRAVE_STONE.face);

  drawStonePolygon(ctx, [[-8.8, -20.8], [-5.5, -20.8], [-8.8, -17.8]], GRAVE_STONE.dark, "rgba(27, 32, 33, 0.74)");
  drawStoneHighlight(ctx, -5.2, -15.6, 10.2);
  drawStoneHighlight(ctx, -4.3, -12.9, 8.2);
  drawWeatherCracks(ctx, "tablet");
  drawCausePlaque(ctx, -6, -8.9, 12, 3.3, causeColor, causeOfDeath);
}

function drawReliquaryMarker(ctx: CanvasRenderingContext2D, causeColor: string, causeOfDeath: CauseOfDeath) {
  drawGraveBase(ctx, 24);

  ctx.beginPath();
  ctx.moveTo(-10.4, -4.4);
  ctx.lineTo(-10.4, -14.4);
  ctx.quadraticCurveTo(-9.7, -21.2, 0, -23.8);
  ctx.quadraticCurveTo(9.7, -21.2, 10.4, -14.4);
  ctx.lineTo(10.4, -4.4);
  ctx.closePath();
  fillStone(ctx, GRAVE_STONE.dark);

  ctx.beginPath();
  ctx.moveTo(-6.8, -4.6);
  ctx.lineTo(-6.8, -13.2);
  ctx.quadraticCurveTo(-6, -18.2, 0, -20.4);
  ctx.quadraticCurveTo(6, -18.2, 6.8, -13.2);
  ctx.lineTo(6.8, -4.6);
  ctx.closePath();
  fillStone(ctx, GRAVE_STONE.face, "rgba(27, 32, 33, 0.8)");

  drawStonePolygon(ctx, [[-11.6, -4.2], [-8.2, -4.2], [-8.2, -15.2], [-11.6, -14.1]], GRAVE_STONE.side);
  drawStonePolygon(ctx, [[8.2, -4.2], [11.6, -4.2], [11.6, -14.1], [8.2, -15.2]], GRAVE_STONE.side);
  drawStoneHighlight(ctx, -4.3, -14, 8.6);
  drawWeatherCracks(ctx, "reliquary");
  drawCausePlaque(ctx, -5.9, -8.8, 11.8, 3.4, causeColor, causeOfDeath);
}

function drawCrossMarker(ctx: CanvasRenderingContext2D, causeColor: string, causeOfDeath: CauseOfDeath) {
  drawGraveBase(ctx, 19);
  drawGraveBase(ctx, 13, -4.2);

  ctx.beginPath();
  ctx.moveTo(-3.4, -23);
  ctx.lineTo(3.4, -23);
  ctx.lineTo(3.4, -17.6);
  ctx.lineTo(10.2, -18.2);
  ctx.lineTo(10.2, -12.8);
  ctx.lineTo(3.4, -12.8);
  ctx.lineTo(3.4, -4.4);
  ctx.lineTo(-3.4, -4.4);
  ctx.lineTo(-3.4, -12.8);
  ctx.lineTo(-10.2, -12.8);
  ctx.lineTo(-10.2, -18.2);
  ctx.lineTo(-3.4, -17.6);
  ctx.closePath();
  fillStone(ctx, GRAVE_STONE.face);

  drawStonePolygon(ctx, [[3.4, -23], [5.8, -21.3], [5.8, -16.4], [10.2, -16.4], [10.2, -12.8], [3.4, -12.8]], GRAVE_STONE.side, "rgba(27, 32, 33, 0.74)");
  drawWeatherCracks(ctx, "cross");
  drawCausePlaque(ctx, -5.8, -7.5, 11.6, 3.2, causeColor, causeOfDeath);
}

function drawLedgerMarker(ctx: CanvasRenderingContext2D, causeColor: string, causeOfDeath: CauseOfDeath) {
  drawGraveBase(ctx, 21);
  drawStonePolygon(ctx, [[8.8, -4.2], [11.4, -6.1], [11.4, -16.6], [8.8, -15.7]], GRAVE_STONE.side);

  ctx.beginPath();
  ctx.moveTo(-8.8, -4.2);
  ctx.lineTo(-8.8, -17.4);
  ctx.lineTo(8.8, -16.1);
  ctx.lineTo(8.8, -4.2);
  ctx.closePath();
  fillStone(ctx, GRAVE_STONE.face);

  drawStoneHighlight(ctx, -5.4, -12.8, 10.8);
  drawStoneHighlight(ctx, -4.5, -10.1, 9.2);
  drawWeatherCracks(ctx, "ledger");
  drawCausePlaque(ctx, -6.2, -7.7, 12.4, 3.3, causeColor, causeOfDeath);
}

function drawGraveBase(ctx: CanvasRenderingContext2D, width: number, y = 0) {
  const half = width / 2;
  drawStonePolygon(ctx, [[-half, y - 1.5], [half, y - 1.5], [half + 2.4, y + 0.8], [-half + 2.2, y + 2.8]], GRAVE_STONE.dark);
  drawStonePolygon(ctx, [[-half + 2.2, y - 3.8], [half - 2.2, y - 3.8], [half + 1.5, y - 1.5], [-half, y - 1.5]], GRAVE_STONE.cap);
  drawStonePolygon(ctx, [[half - 2.2, y - 3.8], [half + 1.5, y - 1.5], [half + 2.4, y + 0.8], [half, y - 1.5]], GRAVE_STONE.side, "rgba(27, 32, 33, 0.78)");
}

function drawGraveTufts(ctx: CanvasRenderingContext2D, marker: GraveNodeMarker) {
  const left = marker === "ledger" ? -12 : -11;
  const right = marker === "ledger" ? 11 : 10;
  ctx.save();
  ctx.strokeStyle = GRAVE_STONE.moss;
  ctx.lineWidth = 1.1;
  for (const [tuftX, tuftY, height] of [[left, 3.3, 3.8], [left + 2.4, 2.6, 2.7], [right, 3.1, 3.4], [right - 2.7, 2.4, 2.5]] as const) {
    ctx.beginPath();
    ctx.moveTo(tuftX, tuftY);
    ctx.lineTo(tuftX - 1.6, tuftY - height);
    ctx.moveTo(tuftX, tuftY);
    ctx.lineTo(tuftX + 1.4, tuftY - height * 0.86);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStonePolygon(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number]>,
  fill: string,
  stroke: string = GRAVE_STONE.outline,
) {
  ctx.beginPath();
  points.forEach(([pointX, pointY], index) => {
    if (index === 0) ctx.moveTo(pointX, pointY);
    else ctx.lineTo(pointX, pointY);
  });
  ctx.closePath();
  fillStone(ctx, fill, stroke);
}

function fillStone(ctx: CanvasRenderingContext2D, fill: string, stroke: string = GRAVE_STONE.outline) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 0.95;
  ctx.stroke();
}

function drawStoneHighlight(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  ctx.save();
  ctx.strokeStyle = GRAVE_STONE.highlight;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width * 0.56, y - 0.7);
  ctx.moveTo(x + width * 0.2, y + 3.1);
  ctx.lineTo(x + width, y + 2.1);
  ctx.stroke();
  ctx.restore();
}

function drawWeatherCracks(ctx: CanvasRenderingContext2D, marker: GraveNodeMarker) {
  ctx.save();
  ctx.strokeStyle = GRAVE_STONE.weather;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  if (marker === "cross") {
    ctx.moveTo(-0.8, -22.4);
    ctx.lineTo(1.1, -19.6);
    ctx.lineTo(-0.5, -17.6);
  } else if (marker === "ledger") {
    ctx.moveTo(3.2, -14.2);
    ctx.lineTo(1.1, -11.7);
    ctx.lineTo(3, -9.4);
  } else {
    ctx.moveTo(2.4, -20.2);
    ctx.lineTo(0.8, -17.8);
    ctx.lineTo(2.2, -15.4);
    ctx.moveTo(-4.2, -12.2);
    ctx.lineTo(-1.4, -13.2);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCausePlaque(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  causeColor: string,
  causeOfDeath: CauseOfDeath,
) {
  const chipWidth = Math.max(2.6, Math.min(3.8, height * 0.92));
  const chipHeight = Math.max(4.2, Math.min(6.3, width * 0.48));
  const chipX = x + width / 2 - chipWidth / 2;
  const chipY = y + height / 2 - chipHeight / 2;
  ctx.save();
  roundedRectPath(ctx, chipX, chipY, chipWidth, chipHeight, 1.2);
  ctx.fillStyle = hexToRgba(causeColor, 0.88);
  ctx.fill();
  ctx.strokeStyle = "rgba(15, 17, 17, 0.65)";
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.translate(chipX + chipWidth / 2, chipY + chipHeight / 2);
  drawCauseGlyph(ctx, causeOfDeath, Math.min(chipWidth, chipHeight));
  ctx.restore();
}

function drawCauseGlyph(ctx: CanvasRenderingContext2D, causeOfDeath: CauseOfDeath, size: number) {
  const span = Math.max(1.8, size * 0.54);
  ctx.save();
  ctx.strokeStyle = "rgba(15, 17, 17, 0.72)";
  ctx.fillStyle = "rgba(15, 17, 17, 0.72)";
  ctx.lineWidth = 0.62;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (causeOfDeath === "algorithmic-failure") {
    ctx.moveTo(-span, -0.5);
    ctx.lineTo(-span * 0.35, 0.55);
    ctx.lineTo(span * 0.15, -0.55);
    ctx.lineTo(span, 0.55);
    ctx.stroke();
  } else if (causeOfDeath === "liquidity-drain") {
    ctx.moveTo(0, -span * 0.75);
    ctx.lineTo(0, span * 0.6);
    ctx.moveTo(-span * 0.52, span * 0.1);
    ctx.lineTo(0, span * 0.65);
    ctx.lineTo(span * 0.52, span * 0.1);
    ctx.stroke();
  } else if (causeOfDeath === "counterparty-failure") {
    ctx.rect(-span * 0.75, -span * 0.55, span * 1.5, span * 1.1);
    ctx.moveTo(-span * 0.25, -span * 0.55);
    ctx.lineTo(-span * 0.25, span * 0.55);
    ctx.stroke();
  } else if (causeOfDeath === "regulatory") {
    ctx.moveTo(0, -span * 0.8);
    ctx.lineTo(0, span * 0.78);
    ctx.moveTo(-span * 0.7, -span * 0.16);
    ctx.lineTo(span * 0.7, -span * 0.16);
    ctx.stroke();
  } else {
    ctx.moveTo(-span * 0.7, 0);
    ctx.lineTo(span * 0.7, 0);
    ctx.stroke();
  }
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

