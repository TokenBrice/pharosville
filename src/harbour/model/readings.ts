import { PSI_SWEEP_DURATION } from "@shared/lib/psi-colors";
import type { DeadStablecoin } from "@shared/types/market";
import { causeFamily } from "./obituary";
import type {
  Boat, ChainsPayload, ConditionBand, DewsBand, EndpointTruth, FlowsReading, HarbourReadings, MintBurnPayload,
  CoinRow, PsiReading, SeaStateReading, StabilityPayload, StormFlag, StormSignalShape, TideFactsReading, WeatherReading,
} from "./types";

const PSI_BANDS = new Set<string>(Object.keys(PSI_SWEEP_DURATION));
export const DEWS_LEVEL: Record<DewsBand, number> = { CALM: 0, WATCH: 1, ALERT: 2, WARNING: 3, DANGER: 4 };
const DEWS_BY_LEVEL: DewsBand[] = ["CALM", "WATCH", "ALERT", "WARNING", "DANGER"];

export function asDewsBand(band: string | null | undefined): DewsBand | null {
  return band != null && band in DEWS_LEVEL ? (band as DewsBand) : null;
}

/** PSI → the Pharos. Unknown band = unlit lantern (never BEDROCK). */
export function psiReading(stability: StabilityPayload | null, truth: EndpointTruth): PsiReading {
  const cur = stability?.current ?? null;
  const band = cur && PSI_BANDS.has(cur.band) ? (cur.band as ConditionBand) : null;
  const score = cur && Number.isFinite(cur.score) ? cur.score : null;
  const lit = band != null && score != null && truth.state !== "unavailable";
  return {
    lit,
    score,
    band,
    avg24h: cur?.avg24h ?? null,
    sweepSec: lit && band ? PSI_SWEEP_DURATION[band] : null,
    reach: lit && score != null ? Math.min(1, Math.max(0, score / 100)) : null,
    lamp: !lit || !band ? null : band === "BEDROCK" || band === "STEADY" ? "white"
      : band === "TREMOR" || band === "FRACTURE" ? "amber" : "red",
    stale: truth.state === "stale",
  };
}

/** Sea state: supply-weighted share off peg, in 4 declared steps. */
export function seaStateReading(boats: Boat[], pegAvailable: boolean, truth: EndpointTruth): SeaStateReading {
  if (!pegAvailable || boats.length === 0) return { offPegShare: null, step: null, stale: truth.state === "stale" };
  let tot = 0, off = 0;
  for (const b of boats) {
    if (b.state === "wrecked") continue;
    tot += b.supply;
    if (b.activeDepeg) off += b.supply;
  }
  const share = tot > 0 ? off / tot : 0;
  const step = share < 0.005 ? 0 : share < 0.02 ? 1 : share < 0.1 ? 2 : 3;
  return { offPegShare: share, step, stale: truth.state === "stale" };
}

/** Weather: supply-weighted DEWS band over the supply that has a reading. */
export function weatherReading(boats: Boat[], stressAvailable: boolean, truth: EndpointTruth): WeatherReading {
  const stale = truth.state === "stale";
  if (!stressAvailable) return { level: null, band: null, cloudCover: null, wind: null, coverage: null, stale };
  let tot = 0, seen = 0, acc = 0;
  for (const b of boats) {
    if (b.state === "wrecked") continue;
    tot += b.supply;
    if (b.dews == null) continue;
    seen += b.supply;
    acc += b.supply * DEWS_LEVEL[b.dews];
  }
  if (seen <= 0) return { level: null, band: null, cloudCover: null, wind: null, coverage: tot > 0 ? 0 : null, stale };
  const level = acc / seen;
  return {
    level,
    band: DEWS_BY_LEVEL[Math.min(4, Math.round(level))],
    cloudCover: Math.min(1, 0.15 + level * 0.22),
    wind: Math.min(1, 0.2 + level * 0.2),
    coverage: tot > 0 ? seen / tot : null,
    stale,
  };
}

const frac = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Global supply change from /api/chains (fractions, as sent), for the tide gauge's panel and hover. */
export function tideFactsReading(chains: ChainsPayload | null, truth: EndpointTruth): TideFactsReading {
  const available = chains != null && truth.state !== "unavailable";
  return {
    change24h: available ? frac(chains?.globalChange24hPct) : null,
    change7d: available ? frac(chains?.globalChange7dPct) : null,
    change30d: available ? frac(chains?.globalChange30dPct) : null,
    available,
    stale: truth.state === "stale",
  };
}

export function flowsReading(mint: MintBurnPayload | null, truth: EndpointTruth): FlowsReading {
  if (!mint) return { hourly: [], net24hUsd: null, scope: [], stale: truth.state === "stale", available: false };
  const hourly = [...mint.hourly]
    .sort((a, b) => a.hourTs - b.hourTs)
    .slice(-24)
    .map((h) => ({ hourTs: h.hourTs, netUsd: h.netFlowUsd, mintUsd: h.mintVolumeUsd, burnUsd: h.burnVolumeUsd }));
  let net: number | null = 0;
  for (const h of hourly) net = net == null || h.netUsd == null ? null : net + h.netUsd;
  return {
    hourly,
    net24hUsd: hourly.length ? net : null,
    scope: mint.scope?.chainIds ?? [],
    stale: truth.state === "stale",
    available: true,
  };
}

export function stormCones(boats: Boat[], stressAvailable: boolean): HarbourReadings["stormCones"] {
  if (!stressAvailable) return null;
  let n = 0;
  for (const b of boats) if (b.state !== "wrecked" && b.dews != null && DEWS_LEVEL[b.dews] >= DEWS_LEVEL.ALERT) n++;
  return { count: n, shown: Math.min(5, n), extra: Math.max(0, n - 5) };
}

export function wrecks(dead: readonly DeadStablecoin[]): HarbourReadings["wrecks"] {
  return [...dead]
    .sort((a, b) => (a.deathDate < b.deathDate ? -1 : a.deathDate > b.deathDate ? 1 : a.id < b.id ? -1 : 1))
    .map((d) => ({ id: d.id, name: d.name, symbol: d.symbol, cause: d.causeOfDeath, family: causeFamily(d), deathDate: d.deathDate, peakMcap: d.peakMcap ?? null }));
}

// ------------------------------------------------------------------ D-3 cues (PLAN §6)

/** DA-04: at most this many coins fly a masthead storm signal (the station's "up to five"). */
export const STORM_FLAGS_MAX = 5;
/** DA-04: the masthead shape per band, the Storm-signal Station's vocabulary. */
export const STORM_SIGNAL_SHAPE: Partial<Record<DewsBand, StormSignalShape>> = { ALERT: "cone", WARNING: "drum", DANGER: "cone+drum" };

/**
 * DA-04: live coins at DEWS ALERT or worse, worst score first (supply breaks ties), at most STORM_FLAGS_MAX, each
 * with its shape. Stale or unavailable stress → [] (the neutral pose: no signal, never a calm one claimed).
 */
export function stormFlags(boats: readonly Boat[], stress: EndpointTruth): StormFlag[] {
  if (stress.state !== "current") return [];
  const out: StormFlag[] = [];
  for (const b of boats) {
    if (b.state === "wrecked" || b.dews == null) continue;
    const shape = STORM_SIGNAL_SHAPE[b.dews];
    if (shape) out.push({ id: b.id, symbol: b.symbol, band: b.dews, score: b.dewsScore, shape });
  }
  const sup = new Map(boats.map((b) => [b.id, b.supply]));
  return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (sup.get(b.id) ?? 0) - (sup.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1)).slice(0, STORM_FLAGS_MAX);
}

/**
 * DA-07: above this share of coins without a week-ago supply, the gaps are the producer's, not a week of
 * launches, and no coin is called new. (Live 2026-10-24: 83 of 624 coins, PAXG among them, had no
 * `circulatingPrevWeek`, so the cue stays dark until the producer fills the bucket.)
 */
export const MAIDEN_MAX_GAP_SHARE = 0.02;

const bucketSum = (o: Record<string, number> | null | undefined) => {
  let s = 0;
  for (const v of Object.values(o ?? {})) if (typeof v === "number" && Number.isFinite(v)) s += v;
  return s;
};

/** No week-ago supply (absent or 0) while supply now is positive. */
export function lacksWeekAgo(row: Pick<CoinRow, "circulating" | "circulatingPrevWeek">): boolean {
  return bucketSum(row.circulating) > 0 && bucketSum(row.circulatingPrevWeek) <= 0;
}

/** Share of coins with supply now that lack a week-ago supply (the producer-gap test). */
export function weekAgoGapShare(rows: ReadonlyArray<Pick<CoinRow, "circulating" | "circulatingPrevWeek">>): number {
  let n = 0, gap = 0;
  for (const r of rows) {
    if (bucketSum(r.circulating) <= 0) continue;
    n++;
    if (bucketSum(r.circulatingPrevWeek) <= 0) gap++;
  }
  return n > 0 ? gap / n : 0;
}

/**
 * DA-07 maiden voyage: `circulatingPrevWeek` absent/0 AND `circulatingPrevMonth` absent/0 (a coin with a
 * month-ago supply is not new this week) AND `circulating` > 0 AND /api/stablecoins current AND the feed-wide
 * gap share ≤ MAIDEN_MAX_GAP_SHARE.
 */
export function isMaiden(row: Pick<CoinRow, "circulating" | "circulatingPrevWeek" | "circulatingPrevMonth">, feedCurrent: boolean, gapShare: number): boolean {
  return feedCurrent && gapShare <= MAIDEN_MAX_GAP_SHARE && lacksWeekAgo(row) && bucketSum(row.circulatingPrevMonth) <= 0;
}
