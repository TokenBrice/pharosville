// Identity pass P4 — ticker nameplates at near zoom. A small parchment chip
// with the ship's symbol drawn under every visible hull once the camera is
// close enough to inspect individual ships. Runs as its own fleet-wide pass
// (not inside the LOD-budgeted overlay) so the "no hover needed" guarantee
// holds for every ship, including standard skiffs hidden from the overlay
// plan under constrained scheduler tiers.
//
// Canvas is not the only carrier of this meaning: the symbol is already the
// primary field of the detail panel and the accessibility ledger; the plate
// duplicates it for glanceability, so no parity work is required.
import type { PharosVilleWorld } from "../../../systems/world-types";
import type { DrawPharosVilleInput } from "../../render-types";
import { SHIP_NAMEPLATE_MIN_ZOOM } from "../../ship-visual-config";
import { shipRenderState, type ShipRenderFrame } from "./draw-ship";

const PLATE_FONT_WEIGHT = 700;
const PLATE_PADDING_X = 3;
const PLATE_PADDING_Y = 1.5;
const PLATE_GAP_Y = 3;
const PLATE_FILL = "rgba(26, 18, 11, 0.78)";
const PLATE_STROKE = "rgba(232, 213, 163, 0.34)";
const PLATE_INK = "rgba(240, 227, 194, 0.96)";

const SHIP_NAMEPLATE_TIER_PRIORITY: Record<PharosVilleWorld["ships"][number]["visual"]["sizeTier"], number> = {
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

interface PlacedPlateRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

function plateFontPx(zoom: number): number {
  return Math.max(8, Math.min(13, Math.round(6.5 * zoom)));
}

function rectsOverlap(a: PlacedPlateRect, b: PlacedPlateRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// Module-level scratch reused across frames; cleared at the start of each
// pass. Holds the chip rects placed so far for greedy overlap rejection.
const placedPlatesScratch: PlacedPlateRect[] = [];

/**
 * Draws ticker nameplates for all visible ships at near zoom. Higher-priority
 * ships (selected/hovered, then larger size tiers) claim screen space first;
 * lower-priority plates that would overlap an already-placed plate are
 * skipped, so dense moorings degrade to "biggest names win" instead of label
 * soup. Returns the number of plates drawn (for tests/telemetry).
 */
export function drawShipNameplates(
  input: DrawPharosVilleInput,
  frame: ShipRenderFrame,
  visibleShips: readonly PharosVilleWorld["ships"][number][],
): number {
  const zoom = input.camera.zoom;
  if (zoom < SHIP_NAMEPLATE_MIN_ZOOM) return 0;
  if (visibleShips.length === 0) return 0;
  const { ctx } = input;

  // Priority order: selected first, hovered second, then size tier, then id
  // for determinism.
  const ordered = visibleShips.toSorted((a, b) => {
    const aState = shipRenderState(input, frame, a);
    const bState = shipRenderState(input, frame, b);
    const aPriority = (aState.selected ? 200 : 0) + (aState.hovered ? 100 : 0)
      + (SHIP_NAMEPLATE_TIER_PRIORITY[a.visual.sizeTier] ?? 0);
    const bPriority = (bState.selected ? 200 : 0) + (bState.hovered ? 100 : 0)
      + (SHIP_NAMEPLATE_TIER_PRIORITY[b.visual.sizeTier] ?? 0);
    if (aPriority !== bPriority) return bPriority - aPriority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  placedPlatesScratch.length = 0;
  const fontPx = plateFontPx(zoom);
  let drawnCount = 0;
  ctx.save();
  ctx.font = `${PLATE_FONT_WEIGHT} ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const ship of ordered) {
    const state = shipRenderState(input, frame, ship);
    if (state.mapVisibilityAlpha <= 0) continue;
    const label = ship.symbol.toUpperCase();
    if (!label) continue;
    const rect = state.geometry.selectionRect;
    if (rect.x + rect.width < 0 || rect.x > input.width || rect.y + rect.height < 0 || rect.y > input.height) continue;
    const textWidth = ctx.measureText(label).width;
    const plateWidth = Math.ceil(textWidth + PLATE_PADDING_X * 2);
    const plateHeight = Math.ceil(fontPx + PLATE_PADDING_Y * 2);
    const plate: PlacedPlateRect = {
      height: plateHeight,
      width: plateWidth,
      x: Math.round(rect.x + rect.width / 2 - plateWidth / 2),
      y: Math.round(rect.y + rect.height + state.bob + PLATE_GAP_Y),
    };
    if (placedPlatesScratch.some((placed) => rectsOverlap(placed, plate))) continue;
    placedPlatesScratch.push(plate);

    ctx.save();
    if (state.mapVisibilityAlpha < 1) ctx.globalAlpha *= state.mapVisibilityAlpha;
    ctx.fillStyle = PLATE_FILL;
    ctx.strokeStyle = PLATE_STROKE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(plate.x, plate.y, plate.width, plate.height, 2);
    } else {
      ctx.rect(plate.x, plate.y, plate.width, plate.height);
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PLATE_INK;
    ctx.fillText(label, plate.x + plate.width / 2, plate.y + plate.height / 2 + 0.5, plate.width - PLATE_PADDING_X);
    ctx.restore();
    drawnCount += 1;
  }
  ctx.restore();
  return drawnCount;
}
