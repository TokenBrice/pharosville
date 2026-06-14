import type { AreaNode, DewsAreaBand, LighthouseNode, PharosVilleWorld, ShipNode } from "./world-types";

export const SEA_STATE_SMOOTHING_TAU_SECONDS = 8;

export type SeaStateLabel = "Calm sea" | "Light chop" | "Fresh sea" | "Rough sea" | "Storm sea";

export interface SeaStateSource {
  maxDewsBand: DewsAreaBand | null;
  threatLevel: 0 | 1 | 2 | 3 | 4;
  psiStress: number;
  nightFactor: number;
}

export interface SeaState {
  /**
   * Normalized target swell in [0, 1]. Consumers map this to their own
   * amplitude ranges; the value is instantaneous and pure.
   */
  swell: number;
  /** Normalized target wind in [0, 1]. */
  wind: number;
  /** Normalized shared animation tempo in [0, 1]. */
  tempo: number;
  label: SeaStateLabel;
  reducedMotion: boolean;
  source: SeaStateSource;
}

export interface SeaStateInput {
  areas: readonly Pick<AreaNode, "band" | "count">[];
  lighthouse: Pick<LighthouseNode, "psiBand" | "score" | "unavailable">;
  reducedMotion?: boolean;
  wallClockHour?: number;
}

export interface SeaStateSmoothingInput {
  current: SeaState;
  target: SeaState;
  deltaSeconds: number;
  tauSeconds?: number;
}

export interface RecentFleetTrendEntry {
  detailId: string;
  symbol: string;
  change7dPct: number;
}

export interface RecentFleetTrendSummary {
  growers: RecentFleetTrendEntry[];
  shrinkers: RecentFleetTrendEntry[];
  elevatedShipCount: number;
}

const THREAT_LEVEL_FOR_BAND: Record<DewsAreaBand, SeaStateSource["threatLevel"]> = {
  CALM: 0,
  WATCH: 1,
  ALERT: 2,
  WARNING: 3,
  DANGER: 4,
};

const PSI_STRESS_FOR_BAND: Record<string, number> = {
  critical: 1,
  danger: 0.85,
  degraded: 0.58,
  warning: 0.68,
  steady: 0.18,
  stable: 0.18,
  normal: 0.2,
  healthy: 0.12,
};

const ELEVATED_SHIP_ZONES = new Set<ShipNode["riskZone"]>(["alert", "warning", "danger"]);
const RECENT_SUPPLY_MOVE_THRESHOLD_PCT = 5;
const RECENT_SUPPLY_MOVE_LIMIT = 3;

export function seaStateForWorld(
  world: Pick<PharosVilleWorld, "areas" | "lighthouse">,
  options: Pick<SeaStateInput, "reducedMotion" | "wallClockHour"> = {},
): SeaState {
  return seaStateForSources({
    areas: world.areas,
    lighthouse: world.lighthouse,
    ...options,
  });
}

export function seaStateForSources(input: SeaStateInput): SeaState {
  const maxDewsBand = maxActiveDewsBand(input.areas);
  const threatLevel = maxDewsBand ? THREAT_LEVEL_FOR_BAND[maxDewsBand] : 0;
  const threat = threatLevel / 4;
  const psiStress = lighthousePsiStress(input.lighthouse);
  const nightFactor = nightFactorForHour(input.wallClockHour ?? 12);
  const reducedMotion = input.reducedMotion === true;

  const swell = clamp01(0.12 + threat * 0.64 + psiStress * 0.16 + nightFactor * 0.08);
  const wind = clamp01(threat * 0.9 + psiStress * 0.08 + nightFactor * 0.04);
  const tempo = clamp01(0.14 + threat * 0.56 + psiStress * 0.2 + (1 - nightFactor) * 0.06 + nightFactor * 0.04);

  return {
    swell,
    wind,
    tempo,
    label: labelForIntensity((swell + wind + tempo) / 3),
    reducedMotion,
    source: {
      maxDewsBand,
      threatLevel,
      psiStress,
      nightFactor,
    },
  };
}

/**
 * Pure smoothing hook for a future stateful renderer owner. This module does
 * not retain previous frame state, so current consumers read the instantaneous
 * target and callers that own frame memory can apply this 8s tau lerp.
 */
export function smoothSeaState(input: SeaStateSmoothingInput): SeaState {
  const tau = input.tauSeconds ?? SEA_STATE_SMOOTHING_TAU_SECONDS;
  if (tau <= 0) return input.target;
  if (input.deltaSeconds <= 0) return input.current;
  const alpha = 1 - Math.exp(-input.deltaSeconds / tau);
  const swell = lerp(input.current.swell, input.target.swell, alpha);
  const wind = lerp(input.current.wind, input.target.wind, alpha);
  const tempo = lerp(input.current.tempo, input.target.tempo, alpha);
  return {
    ...input.target,
    swell,
    wind,
    tempo,
    label: labelForIntensity((swell + wind + tempo) / 3),
  };
}

export function seaStateSummary(state: SeaState): string {
  const band = state.source.maxDewsBand ?? "no active DEWS band";
  const reduced = state.reducedMotion ? "; reduced-motion holds animation phases flat" : "";
  return `${state.label}: swell ${formatScalar(state.swell)}, wind ${formatScalar(state.wind)}, tempo ${formatScalar(state.tempo)}; ${band}, PSI stress ${formatScalar(state.source.psiStress)}, night ${formatScalar(state.source.nightFactor)}${reduced}`;
}

export function recentFleetTrendSummary(
  world: Pick<PharosVilleWorld, "ships">,
): RecentFleetTrendSummary {
  const eligible = world.ships
    .filter((ship) => typeof ship.change7dPct === "number" && Number.isFinite(ship.change7dPct))
    .filter((ship) => Math.abs(ship.change7dPct!) > RECENT_SUPPLY_MOVE_THRESHOLD_PCT);
  const growers = eligible
    .filter((ship) => ship.change7dPct! > 0)
    .toSorted((left, right) => right.change7dPct! - left.change7dPct! || left.symbol.localeCompare(right.symbol))
    .slice(0, RECENT_SUPPLY_MOVE_LIMIT)
    .map(recentFleetTrendEntry);
  const shrinkers = eligible
    .filter((ship) => ship.change7dPct! < 0)
    .toSorted((left, right) => left.change7dPct! - right.change7dPct! || left.symbol.localeCompare(right.symbol))
    .slice(0, RECENT_SUPPLY_MOVE_LIMIT)
    .map(recentFleetTrendEntry);

  return {
    growers,
    shrinkers,
    elevatedShipCount: world.ships.filter((ship) => ELEVATED_SHIP_ZONES.has(ship.riskZone)).length,
  };
}

export function recentFleetTrendEntryLabel(entry: RecentFleetTrendEntry): string {
  return `${entry.symbol} supply ${formatSignedPercent(entry.change7dPct)} (7d)`;
}

export function recentFleetTrendSummaryText(summary: RecentFleetTrendSummary): string {
  const moves = [...summary.growers, ...summary.shrinkers].map(recentFleetTrendEntryLabel);
  const moveText = moves.length > 0 ? moves.join("; ") : "no notable supply moves this week";
  return `${moveText}; ${summary.elevatedShipCount} ships in elevated water`;
}

export function seaStateRoughnessMultiplier(state: SeaState | null | undefined): number {
  if (!state) return 1;
  return 0.6 + 0.4 * clamp01(state.swell);
}

export function seaStateMooringSwayMultiplier(state: SeaState | null | undefined): number {
  if (!state || state.reducedMotion) return 1;
  return 0.82 + 0.48 * clamp01(state.swell);
}

export function seaStateWindMultiplier(state: SeaState | null | undefined): number {
  if (!state || state.reducedMotion) return 1;
  return 1 + 0.85 * clamp01(state.wind);
}

export function seaStateTempoMultiplier(state: SeaState | null | undefined): number {
  if (!state || state.reducedMotion) return 1;
  return 0.78 + 0.62 * clamp01(state.tempo);
}

export function seaStateLighthouseFlickerMultiplier(state: SeaState | null | undefined): number {
  if (!state || state.reducedMotion) return 1;
  return 0.82 + 0.38 * clamp01(state.swell);
}

export function seaStateSmokeCadenceMultiplier(state: SeaState | null | undefined): number {
  if (!state || state.reducedMotion) return 1;
  return 0.74 + 0.56 * clamp01((state.swell + state.wind) / 2);
}

function maxActiveDewsBand(areas: readonly Pick<AreaNode, "band" | "count">[]): DewsAreaBand | null {
  let maxBand: DewsAreaBand | null = null;
  let maxThreat = -1;
  for (const area of areas) {
    if (!area.band || area.count === 0) continue;
    const threat = THREAT_LEVEL_FOR_BAND[area.band];
    if (threat > maxThreat) {
      maxThreat = threat;
      maxBand = area.band;
    }
  }
  return maxBand;
}

function lighthousePsiStress(lighthouse: Pick<LighthouseNode, "psiBand" | "score" | "unavailable">): number {
  if (lighthouse.unavailable) return 0.28;
  const bandStress = lighthouse.psiBand ? PSI_STRESS_FOR_BAND[lighthouse.psiBand.toLowerCase()] : undefined;
  const scoreStress = lighthouse.score == null ? undefined : clamp01(lighthouse.score / 100);
  if (bandStress === undefined && scoreStress === undefined) return 0.24;
  if (bandStress === undefined) return scoreStress!;
  if (scoreStress === undefined) return bandStress;
  return Math.max(bandStress, scoreStress);
}

function nightFactorForHour(hour: number): number {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized < 5) return 1;
  if (normalized < 7) return 1 - (normalized - 5) / 2;
  if (normalized < 18) return 0;
  if (normalized < 20) return (normalized - 18) / 2;
  return 1;
}

function labelForIntensity(value: number): SeaStateLabel {
  const v = clamp01(value);
  if (v < 0.24) return "Calm sea";
  if (v < 0.42) return "Light chop";
  if (v < 0.62) return "Fresh sea";
  if (v < 0.82) return "Rough sea";
  return "Storm sea";
}

function formatScalar(value: number): string {
  return clamp01(value).toFixed(2);
}

function recentFleetTrendEntry(ship: ShipNode): RecentFleetTrendEntry {
  return {
    detailId: ship.detailId,
    symbol: ship.symbol,
    change7dPct: ship.change7dPct!,
  };
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded >= 0 ? "+" : "";
  return `${sign}${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
