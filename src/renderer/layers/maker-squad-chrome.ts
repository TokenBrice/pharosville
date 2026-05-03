// Squad chrome: a continuous golden bunting that links visible squad hulls
// plus a thin secondary halo that signals "this hull is part of a squad".
// Both anchor on world-space mast-tops supplied by the caller, so the
// streamer follows hull bob/roll without needing a screen-space dashed
// fallback. Pennant order is supplied per squad so each squad gets its own
// streamer.

import type { PharosVilleWorld } from "../../systems/world-types";
import type { PharosVilleCanvasMotion } from "../render-types";
import { windMultiplierForMotion } from "./weather";

export interface SquadAnchor {
  id: string;
  // Mast-top in screen space, including hull pose (bob, roll). Caller must
  // supply the world-space-bobbed position so the pennant follows wake motion.
  mastTop: { x: number; y: number };
  /**
   * Optional distress flag. When true, the consort is sheltering at the
   * flagship's position (per `placementEvidence.squadOverride`). Renders a
   * small red signal pennant above the hull. Static — no oscillation needed.
   */
  inDistress?: boolean;
}

/**
 * Optional wind/motion context for `drawSquadPennant`. When supplied, the
 * pennant's mid-control points oscillate by a wind-scaled sin term so flags
 * snap harder during DANGER weather and barely flutter on CALM. When omitted,
 * the pennant renders as a static catenary (legacy behavior, also the
 * reduced-motion fallback).
 */
export interface PennantWindContext {
  motion: PharosVilleCanvasMotion;
  world: PharosVilleWorld;
  /** Stable per-squad seed so the two squads desynchronize. */
  squadId: string;
}

// Module-scope scratch storage — reset at the start of each call.
const _scratchByIdMap = new Map<string, { x: number; y: number }>();
const _scratchOrdered: { x: number; y: number }[] = [];

export function computeSquadPennantPath(
  anchors: readonly SquadAnchor[],
  order: readonly string[],
): { x: number; y: number }[] | null {
  if (anchors.length < 2) return null;
  _scratchByIdMap.clear();
  for (const anchor of anchors) {
    _scratchByIdMap.set(anchor.id, anchor.mastTop);
  }
  _scratchOrdered.length = 0;
  for (const id of order) {
    const pt = _scratchByIdMap.get(id);
    if (pt) _scratchOrdered.push(pt);
  }
  return _scratchOrdered.length >= 2 ? _scratchOrdered.slice() : null;
}

// Module-scope scratch arrays for bounding-ellipse min/max scan.
const _scratchXs: number[] = [];
const _scratchYs: number[] = [];

export function computeSquadBoundingEllipse(anchors: readonly SquadAnchor[]) {
  if (anchors.length === 0) return null;
  _scratchXs.length = 0;
  _scratchYs.length = 0;
  for (const anchor of anchors) {
    _scratchXs.push(anchor.mastTop.x);
    _scratchYs.push(anchor.mastTop.y);
  }
  let minX = _scratchXs[0]!;
  let maxX = _scratchXs[0]!;
  let minY = _scratchYs[0]!;
  let maxY = _scratchYs[0]!;
  for (let i = 1; i < _scratchXs.length; i++) {
    if (_scratchXs[i]! < minX) minX = _scratchXs[i]!;
    if (_scratchXs[i]! > maxX) maxX = _scratchXs[i]!;
    if (_scratchYs[i]! < minY) minY = _scratchYs[i]!;
    if (_scratchYs[i]! > maxY) maxY = _scratchYs[i]!;
  }
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 + 16 },
    radiusX: Math.max(40, (maxX - minX) / 2 + 36),
    radiusY: Math.max(28, (maxY - minY) / 2 + 24),
  };
}

// ---------------------------------------------------------------------------
// Pennant snap (Phase 3.4) — wind-driven oscillation calibration
// ---------------------------------------------------------------------------
//
// `windMultiplierForMotion` returns 1.0 at CALM, ~1.85 at DANGER (and 1.0
// when reducedMotion is set). We map that scalar to a normalized [0..1]
// wind term and drive amplitude + frequency linearly:
//
//   amplitude (px) = MIN_AMP + (MAX_AMP - MIN_AMP) * t    -> 0.4..3.9 px
//   frequency (rad/s) = MIN_HZ + (MAX_HZ - MIN_HZ) * t     -> 0.8..2.4 rad/s
//
// Targets per plan: CALM = barely perceptible (≤ 0.5 px), DANGER = 3-4 px
// flutter; frequency 0.8..2.4 rad/s linear ramp.

const PENNANT_MIN_AMPLITUDE_PX = 0.4;
const PENNANT_MAX_AMPLITUDE_PX = 3.9;
const PENNANT_MIN_FREQ_RAD_S = 0.8;
const PENNANT_MAX_FREQ_RAD_S = 2.4;
const WIND_MULTIPLIER_RANGE = 0.85; // windMultiplier(4) - windMultiplier(0) ≈ 0.85

/** Stable 32-bit hash → fractional phase in [0, 2π). Pure function. */
function pennantPhaseSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return ((h % 10000) / 10000) * Math.PI * 2;
}

/** Normalized wind term in [0, 1]. CALM → 0, DANGER → 1. */
export function pennantWindTerm(windMultiplier: number): number {
  const t = (windMultiplier - 1) / WIND_MULTIPLIER_RANGE;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

interface PennantOscillation {
  amplitude: number;
  frequency: number;
  phase: number;
  timeSeconds: number;
}

function pennantOscillation(wind: PennantWindContext): PennantOscillation {
  const w = windMultiplierForMotion(wind.motion, wind.world);
  const t = pennantWindTerm(w);
  return {
    amplitude: PENNANT_MIN_AMPLITUDE_PX + (PENNANT_MAX_AMPLITUDE_PX - PENNANT_MIN_AMPLITUDE_PX) * t,
    frequency: PENNANT_MIN_FREQ_RAD_S + (PENNANT_MAX_FREQ_RAD_S - PENNANT_MIN_FREQ_RAD_S) * t,
    phase: pennantPhaseSeed(wind.squadId),
    timeSeconds: wind.motion.timeSeconds,
  };
}

// Catenary-sagged bunting between adjacent mast tops. Sag depth scales with
// segment length so longer gaps droop more (reads as a physical streamer).
//
// When `wind` is supplied AND `motion.reducedMotion` is false, each segment's
// mid-control point gains a small wind-driven perturbation: amplitude and
// frequency both ramp with the world's max active threat band, so DANGER
// pennants flutter and CALM pennants are nearly static. Per-segment phase
// stagger keeps adjacent segments out of lockstep.
export function drawSquadPennant(
  ctx: CanvasRenderingContext2D,
  path: readonly { x: number; y: number }[],
  wind?: PennantWindContext,
) {
  if (path.length < 2) return;
  const osc = wind && !wind.motion.reducedMotion ? pennantOscillation(wind) : null;
  ctx.save();
  ctx.strokeStyle = "rgba(232, 187, 96, 0.78)";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(path[0]!.x, path[0]!.y);
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const segmentLength = Math.hypot(b.x - a.x, b.y - a.y);
    let midX = (a.x + b.x) / 2;
    let midY = (a.y + b.y) / 2 + segmentLength * 0.1;
    if (osc) {
      // Per-segment phase stagger (i * 0.7 rad) so adjacent segments don't
      // sync. Cosine on x, sine on y — mid-point sweeps a small ellipse.
      const segPhase = osc.phase + i * 0.7;
      const arg = osc.timeSeconds * osc.frequency + segPhase;
      midX += Math.cos(arg) * osc.amplitude;
      midY += Math.sin(arg) * osc.amplitude;
    }
    ctx.quadraticCurveTo(midX, midY, b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

// Drawn AFTER hulls; thinner and lower-alpha than the per-ship selected ring
// so the halo reads as squad context, not as the primary selection signal.
export function drawSquadSelectionHalo(
  ctx: CanvasRenderingContext2D,
  ellipse: NonNullable<ReturnType<typeof computeSquadBoundingEllipse>>,
) {
  ctx.save();
  ctx.strokeStyle = "rgba(232, 187, 96, 0.42)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(
    ellipse.center.x,
    ellipse.center.y,
    ellipse.radiusX,
    ellipse.radiusY,
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Distress signal flag (Phase 5.4) — DOM-parity for squadOverride consorts
// ---------------------------------------------------------------------------
//
// When a consort's `placementEvidence.squadOverride` is set, the ship is
// "in distress" — it sheltered at the flagship's position rather than its
// own assigned mooring. Today only the accessibility ledger surfaces that;
// canvas viewers see no difference. This adds a small red triangular signal
// pennant above the consort's mast-top so sighted users get parity.
//
// Static (no animation needed); reduced-motion is intrinsically fine.

/** Deep red used both on canvas and in the ledger swatch for parity. */
export const SQUAD_DISTRESS_FLAG_HEX = "#a02018";
const DISTRESS_FLAG_WIDTH_PX = 6;
const DISTRESS_FLAG_HEIGHT_PX = 7;
const DISTRESS_FLAG_VERTICAL_OFFSET_PX = 8; // above the mast-top point

export function drawSquadDistressFlag(
  ctx: CanvasRenderingContext2D,
  mastTop: { x: number; y: number },
) {
  ctx.save();
  ctx.fillStyle = SQUAD_DISTRESS_FLAG_HEX;
  // Tiny mast (1px) so the triangle reads as a flag, not a free shape.
  ctx.fillRect(mastTop.x, mastTop.y - DISTRESS_FLAG_VERTICAL_OFFSET_PX - DISTRESS_FLAG_HEIGHT_PX, 1, DISTRESS_FLAG_HEIGHT_PX);
  // Triangular pennant pointing right from the mast.
  ctx.beginPath();
  const baseX = mastTop.x + 1;
  const topY = mastTop.y - DISTRESS_FLAG_VERTICAL_OFFSET_PX - DISTRESS_FLAG_HEIGHT_PX;
  ctx.moveTo(baseX, topY);
  ctx.lineTo(baseX + DISTRESS_FLAG_WIDTH_PX, topY + DISTRESS_FLAG_HEIGHT_PX / 2);
  ctx.lineTo(baseX, topY + DISTRESS_FLAG_HEIGHT_PX);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Convenience: render a distress flag for every anchor flagged `inDistress`. */
export function drawSquadDistressFlags(
  ctx: CanvasRenderingContext2D,
  anchors: readonly SquadAnchor[],
) {
  for (const anchor of anchors) {
    if (anchor.inDistress) drawSquadDistressFlag(ctx, anchor.mastTop);
  }
}
