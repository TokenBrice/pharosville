import { tileToScreen } from "../../systems/projection";
import type { AreaNode, DewsAreaBand, PharosVilleWorld } from "../../systems/world-types";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";

/**
 * Phase-2 DEWS-aware weather/atmosphere helpers. Centralizes the threat ->
 * scalar mappings consumed by sky.ts, ambient.ts, shoreline.ts, and the
 * lightning pass exported below.
 *
 * Threat band names follow `DewsAreaBand` (CALM, WATCH, ALERT, WARNING, DANGER).
 * The plan referenced "CRISIS / MELTDOWN" as aspirational labels; the live
 * data model only goes up to DANGER, so DANGER is the maximum threat that
 * can drive lightning. Ledger-mooring areas have `band === undefined`; they
 * are treated as CALM for atmosphere purposes.
 */

export type ThreatLevel = 0 | 1 | 2 | 3 | 4;

export const THREAT_LEVEL_FOR_BAND: Record<DewsAreaBand, ThreatLevel> = {
  CALM: 0,
  WATCH: 1,
  ALERT: 2,
  WARNING: 3,
  DANGER: 4,
};

export function threatLevelForArea(area: AreaNode): ThreatLevel {
  return area.band ? THREAT_LEVEL_FOR_BAND[area.band] : 0;
}

/**
 * Wind-drift multiplier. Higher threat → faster ambient drift on stars,
 * birds, mist, pennants. CALM = 1 (baseline); DANGER caps at ~1.85 so
 * existing oscillator amplitudes don't visibly tear at high cadences.
 */
export function windMultiplier(threat: ThreatLevel): number {
  // 1.0, 1.18, 1.36, 1.6, 1.85 — gentle ramp, monotonic.
  return 1 + threat * 0.21 + (threat >= 4 ? 0.01 : 0);
}

/**
 * Cloud-cover scalars. Returns multipliers applied to the per-cloud alpha
 * and a scale that thickens the ellipse as threat climbs. Values are derived
 * once per frame from the world's max active threat and reused for the three
 * canonical SKY_CLOUDS rather than recomputed inside the draw loop.
 */
export interface CloudThreatScalars {
  alphaScale: number;
  thicknessScale: number;
  /**
   * Vertical bias applied to cloud Y so heavier weather rides closer to the
   * horizon. Magnitude in normalized [0..1] viewport-height units; positive =
   * lower on screen. Capped at +0.04 so day-mood baselines stay readable.
   */
  yBias: number;
}

const CLOUD_SCALARS_BY_THREAT: readonly CloudThreatScalars[] = [
  { alphaScale: 1.0, thicknessScale: 1.0, yBias: 0 },
  { alphaScale: 1.15, thicknessScale: 1.05, yBias: 0.005 },
  { alphaScale: 1.4, thicknessScale: 1.18, yBias: 0.014 },
  { alphaScale: 1.7, thicknessScale: 1.32, yBias: 0.024 },
  { alphaScale: 2.05, thicknessScale: 1.5, yBias: 0.04 },
];

export function cloudScalarsForThreat(threat: ThreatLevel): CloudThreatScalars {
  return CLOUD_SCALARS_BY_THREAT[threat] ?? CLOUD_SCALARS_BY_THREAT[0]!;
}

/**
 * Maximum threat across all DEWS-banded areas in the world. Used by sky and
 * (indirectly via cloud scalars) by lightning. Ignores `ledger` areas, which
 * have `band === undefined` and are intentionally off the threat ladder.
 */
export function maxActiveThreatLevel(world: PharosVilleWorld): ThreatLevel {
  let max: ThreatLevel = 0;
  for (const area of world.areas) {
    const level = threatLevelForArea(area);
    if (level > max) max = level;
  }
  return max;
}

/**
 * Per-tile threat lookup for the sea-mist patches. Each mist patch lives at a
 * tile coord — we pick the closest banded area centroid and inherit its
 * threat. This is a small, stable, world-keyed map.
 */
const mistThreatByWorld = new WeakMap<PharosVilleWorld, ReadonlyArray<readonly [number, number, ThreatLevel]>>();

function bandedAreaCentroidsForWorld(
  world: PharosVilleWorld,
): ReadonlyArray<readonly [number, number, ThreatLevel]> {
  const cached = mistThreatByWorld.get(world);
  if (cached) return cached;
  const list: Array<readonly [number, number, ThreatLevel]> = [];
  for (const area of world.areas) {
    if (!area.band) continue;
    list.push([area.tile.x, area.tile.y, THREAT_LEVEL_FOR_BAND[area.band]]);
  }
  mistThreatByWorld.set(world, list);
  return list;
}

export function threatForPoint(world: PharosVilleWorld, x: number, y: number): ThreatLevel {
  const centroids = bandedAreaCentroidsForWorld(world);
  if (centroids.length === 0) return 0;
  let bestThreat: ThreatLevel = 0;
  let bestDistSq = Number.POSITIVE_INFINITY;
  for (const entry of centroids) {
    const dx = entry[0] - x;
    const dy = entry[1] - y;
    const d = dx * dx + dy * dy;
    if (d < bestDistSq) {
      bestDistSq = d;
      bestThreat = entry[2];
    }
  }
  return bestThreat;
}

// ---------------------------------------------------------------------------
// Lightning
// ---------------------------------------------------------------------------

/**
 * Stable 32-bit hash of a string. Used to derive a per-zone phase offset for
 * lightning so two DANGER zones don't flash in lockstep. Mirrors the splitmix
 * style used elsewhere; pure function, no Math.random.
 */
function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const LIGHTNING_MIN_INTERVAL_S = 6;
const LIGHTNING_MAX_INTERVAL_S = 12;
const LIGHTNING_FLASH_DURATION_S = 0.32;
const LIGHTNING_THUNDER_RIM_APEX_PROGRESS = 0.18;
const LIGHTNING_THUNDER_RIM_HALF_WIDTH = 0.03;
const LIGHTNING_GRADIENT_CACHE_LIMIT = 64;
const LIGHTNING_ALPHA_BUCKETS = 1000;
const lightningGradientCacheByContext = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();

interface LightningPlan {
  area: AreaNode;
  /** Window-local progress in [0, 1] — 0 at flash start, 1 at flash end. */
  progress: number;
  /** Threat level driving the flash. */
  threat: ThreatLevel;
}

/**
 * Compute (deterministically) the set of zones currently flashing. Bands
 * below WARNING never flash; WARNING flashes at the slow end of the cadence
 * window, DANGER at the fast end.
 */
function activeLightningPlans(
  world: PharosVilleWorld,
  timeSeconds: number,
  out: LightningPlan[],
): void {
  out.length = 0;
  for (const area of world.areas) {
    if (!area.band) continue;
    const threat = THREAT_LEVEL_FOR_BAND[area.band];
    if (threat < 3) continue;
    // Map threat to interval: WARNING -> ~12s, DANGER -> ~6s, with a stable
    // per-zone jitter so different zones desynchronize.
    const seed = hashString(area.id);
    const jitter = (seed % 1000) / 1000;
    const baseInterval = threat >= 4
      ? LIGHTNING_MIN_INTERVAL_S
      : LIGHTNING_MAX_INTERVAL_S;
    const interval = baseInterval + (jitter * 2 - 1) * 0.8;
    const phaseOffset = (seed % 10000) / 10000 * interval;
    const localT = ((timeSeconds + phaseOffset) % interval + interval) % interval;
    if (localT < LIGHTNING_FLASH_DURATION_S) {
      out.push({
        area,
        progress: localT / LIGHTNING_FLASH_DURATION_S,
        threat,
      });
    }
  }
}

const lightningPlanScratch: LightningPlan[] = [];
const thunderRimPlanScratch: LightningPlan[] = [];

/**
 * Drawn after night-tint and before any UI overlays. Two pieces per active
 * zone: a screen-space alpha flash (amplitude scaled by the dot product of
 * how centered the zone is in the viewport) plus a radial highlight at the
 * zone centroid. Reduced-motion short-circuits — no flash, no highlight.
 *
 * Returns the number of flashes painted this frame so detail-model.ts can
 * cite it without re-running the planner. (Out-param via a module-private
 * snapshot keeps the renderer signature stable.)
 */
export function drawWeather(input: DrawPharosVilleInput): void {
  const { ctx, motion, world, width, height, camera } = input;
  if (motion.reducedMotion) {
    activeLightningSnapshot.timeSeconds = motion.timeSeconds;
    activeLightningSnapshot.zones.length = 0;
    return;
  }
  activeLightningPlans(world, motion.timeSeconds, lightningPlanScratch);
  activeLightningSnapshot.timeSeconds = motion.timeSeconds;
  activeLightningSnapshot.zones.length = 0;
  if (lightningPlanScratch.length === 0) return;

  ctx.save();
  for (const plan of lightningPlanScratch) {
    activeLightningSnapshot.zones.push({
      areaId: plan.area.id,
      band: plan.area.band ?? "DANGER",
      label: plan.area.label,
    });
    const env = lightningEnvelope(plan.progress);
    if (env <= 0.001) continue;

    const centroid = tileToScreen(plan.area.tile, camera);
    const radius = Math.max(width, height) * 0.22;
    const coreAlpha = (plan.threat >= 4 ? 0.17 : 0.11) * env;
    const highlight = lightningHighlightGradient(ctx, {
      coreAlpha,
      cx: centroid.x,
      cy: centroid.y,
      ...(input.dpr !== undefined ? { dpr: input.dpr } : {}),
      innerRadius: Math.max(6, 18 * camera.zoom),
      radius,
    });
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.arc(centroid.x, centroid.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function lightningEnvelope(progress: number): number {
  // Attack 0..0.18 fast ramp, sustain 0.18..0.30 plateau, release 0.30..1
  // exponential. Keeps total flash visually under ~320ms.
  if (progress < 0.18) return progress / 0.18;
  if (progress < 0.30) return 1;
  const decay = (progress - 0.30) / 0.70;
  return Math.exp(-decay * 4);
}

function lightningHighlightGradient(
  ctx: CanvasRenderingContext2D,
  params: {
    coreAlpha: number;
    cx: number;
    cy: number;
    dpr?: number;
    innerRadius: number;
    radius: number;
  },
): CanvasGradient {
  const coreAlphaBucket = Math.max(0, Math.min(LIGHTNING_ALPHA_BUCKETS, Math.round(params.coreAlpha * LIGHTNING_ALPHA_BUCKETS)));
  const key = [
    dprBucket(params.dpr),
    Math.round(params.cx),
    Math.round(params.cy),
    Math.round(params.innerRadius),
    Math.round(params.radius),
    coreAlphaBucket,
  ].join(":");
  const cache = lightningCacheForContext(ctx);
  const cached = cache.get(key);
  if (cached) return cached;

  const coreAlpha = coreAlphaBucket / LIGHTNING_ALPHA_BUCKETS;
  const highlight = ctx.createRadialGradient(
    params.cx,
    params.cy,
    Math.max(1, params.innerRadius),
    params.cx,
    params.cy,
    Math.max(1, params.radius),
  );
  highlight.addColorStop(0, `rgba(255, 245, 214, ${coreAlpha.toFixed(3)})`);
  highlight.addColorStop(0.45, `rgba(255, 218, 160, ${(coreAlpha * 0.38).toFixed(3)})`);
  highlight.addColorStop(1, "rgba(255, 194, 120, 0)");
  cache.set(key, highlight);
  if (cache.size > LIGHTNING_GRADIENT_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return highlight;
}

function lightningCacheForContext(ctx: CanvasRenderingContext2D): Map<string, CanvasGradient> {
  let cache = lightningGradientCacheByContext.get(ctx);
  if (!cache) {
    cache = new Map();
    lightningGradientCacheByContext.set(ctx, cache);
  }
  return cache;
}

function dprBucket(dpr?: number): number {
  return Math.max(1, Math.round((dpr && dpr > 0 ? dpr : 1) * 100));
}

export function lightningThunderRimIntensityForWorld(
  world: PharosVilleWorld,
  timeSeconds: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion) return 0;
  activeLightningPlans(world, timeSeconds, thunderRimPlanScratch);
  let intensity = 0;
  for (const plan of thunderRimPlanScratch) {
    const apexDistance = Math.abs(plan.progress - LIGHTNING_THUNDER_RIM_APEX_PROGRESS);
    if (apexDistance > LIGHTNING_THUNDER_RIM_HALF_WIDTH) continue;
    const apex = 1 - apexDistance / LIGHTNING_THUNDER_RIM_HALF_WIDTH;
    const threatScale = plan.threat >= 4 ? 1 : 0.72;
    intensity = Math.max(intensity, apex * threatScale);
  }
  return intensity;
}

/**
 * Snapshot of which zones flashed last frame. Read by `detail-model.ts` and
 * `accessibility-ledger.tsx` so DOM parity surfaces lightning without
 * re-running the planner. (DOM consumers don't need the per-frame envelope —
 * the area list is enough to caption "lightning active" rows.)
 */
interface LightningSnapshot {
  timeSeconds: number;
  zones: Array<{ areaId: string; band: DewsAreaBand; label: string }>;
}

const activeLightningSnapshot: LightningSnapshot = {
  timeSeconds: 0,
  zones: [],
};

/**
 * Returns true if `band` is currently elevated enough to receive lightning
 * treatment in the renderer. Pure function — DOM consumers can call this
 * directly without a renderer snapshot. Matches `activeLightningPlans`'
 * `threat >= 3` gate.
 */
export function bandReceivesLightning(band: DewsAreaBand | null | undefined): boolean {
  if (!band) return false;
  return THREAT_LEVEL_FOR_BAND[band] >= 3;
}

/**
 * Human-friendly atmosphere descriptor for a DEWS area. Used by detail-model
 * and the accessibility ledger to caption per-area weather state.
 */
export function atmosphereDescriptionForArea(area: AreaNode): string {
  if (!area.band) return "Calm waters; no DEWS atmosphere modulation";
  const threat = THREAT_LEVEL_FOR_BAND[area.band];
  const cloudWord = threat >= 4
    ? "heavy storm clouds"
    : threat >= 3
      ? "thickening clouds"
      : threat >= 2
        ? "broken clouds"
        : threat >= 1
          ? "thin clouds"
          : "clear sky";
  const seaWord = threat >= 4
    ? "heavy chop"
    : threat >= 3
      ? "rough sea"
      : threat >= 2
        ? "moderate chop"
        : threat >= 1
          ? "light chop"
          : "calm sea";
  const lightning = bandReceivesLightning(area.band) ? ", lightning active" : "";
  return `${cloudWord}, ${seaWord}${lightning}`;
}

/**
 * Test-only helper: returns the current motion phase used by the wind
 * multiplier so unit tests can compare against the closed form without
 * exercising the renderer pipeline.
 */
export function windMultiplierForMotion(motion: PharosVilleCanvasMotion, world: PharosVilleWorld): number {
  if (motion.reducedMotion) return 1;
  return windMultiplier(maxActiveThreatLevel(world));
}
