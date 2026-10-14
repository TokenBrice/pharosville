import { PSI_SWEEP_DURATION } from "@shared/lib/psi-colors";
import type { DeadStablecoin } from "@shared/types/market";
import type {
  Boat, ConditionBand, DewsBand, EndpointTruth, FlowsReading, HarbourReadings, MintBurnPayload,
  PsiReading, SeaStateReading, StabilityPayload, WeatherReading,
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
    .map((d) => ({ id: d.id, name: d.name, symbol: d.symbol, cause: d.causeOfDeath, deathDate: d.deathDate, peakMcap: d.peakMcap ?? null }));
}
