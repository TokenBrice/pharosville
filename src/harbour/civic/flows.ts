/**
 * THE MINT AND THE BURN (P6 D19): the pure half. Turns the mint/burn flow reading (24 closed hours of
 * /api/mint-burn-flows, scope Ethereum · Base · Arbitrum) into how hard each works:
 *
 *   activity 0..1  = log-scaled hourly rate, 60 % the 24 h mean + 40 % the latest closed hour
 *                    ($4M/h → 0 … $400M/h → 1), so a busy hour shows without one spike owning the day
 *   dominance -1..1 = which side the 24 h NET leans to: < 0 the Burn dominates (bigger fire, darker plume),
 *                    > 0 the Mint dominates; a visible minimum once the net is more than noise
 *   banked         = stale or no reading: the fires bank to embers and the chimneys go quiet (truth, D11)
 *
 * No renderer, no clock: unit-tested (civic.test.ts).
 */
import type { FlowsReading } from "../model/types";

export interface FlowSide {
  /** 0..1 how hard it works (0 when banked). */
  activity: number;
  /** Sum of the 24 closed hours (USD), or null with no reading. */
  volume24hUsd: number | null;
  /** The latest closed hour (USD), or null. */
  lastHourUsd: number | null;
  stale: boolean;
}

export interface CivicFlows {
  mint: FlowSide;
  burn: FlowSide;
  net24hUsd: number | null;
  /** -1 (the Burn dominates) … 0 (balanced / unknown) … +1 (the Mint dominates). */
  dominance: number;
  /** Stale or unavailable: fires banked, chimneys quiet. */
  banked: boolean;
  /** Chains the flows cover (Ethereum · Base · Arbitrum today). */
  scope: string[];
}

/** Hourly rate (USD) that reads as idle / flat out. */
export const RATE_IDLE_USD = 4e6;
export const RATE_FULL_USD = 4e8;
/** |net| / gross below this is noise: neither side dominates. */
export const NET_NOISE = 0.002;
/** Smallest visible dominance once the net is real. */
export const DOMINANCE_MIN = 0.35;

export function activityForRate(usdPerHour: number): number {
  if (!(usdPerHour > 0)) return 0;
  const a = (Math.log10(usdPerHour) - Math.log10(RATE_IDLE_USD)) / (Math.log10(RATE_FULL_USD) - Math.log10(RATE_IDLE_USD));
  return Math.min(1, Math.max(0, a));
}

/** Blend of the 24 h mean and the last closed hour. */
export function activityFor(volume24hUsd: number, lastHourUsd: number | null): number {
  const mean = volume24hUsd / 24;
  return activityForRate(lastHourUsd == null ? mean : 0.6 * mean + 0.4 * lastHourUsd);
}

export function dominanceFor(mint24: number, burn24: number): number {
  const gross = mint24 + burn24;
  if (!(gross > 0)) return 0;
  const r = (mint24 - burn24) / gross;
  if (Math.abs(r) < NET_NOISE) return 0;
  return Math.sign(r) * Math.min(1, Math.max(DOMINANCE_MIN, Math.abs(r) * 12));
}

export function civicFlows(f: Pick<FlowsReading, "hourly" | "net24hUsd" | "scope" | "stale" | "available"> | null | undefined): CivicFlows {
  if (!f || !f.available || f.hourly.length === 0) {
    const none: FlowSide = { activity: 0, volume24hUsd: null, lastHourUsd: null, stale: !!f?.stale };
    return { mint: none, burn: { ...none }, net24hUsd: null, dominance: 0, banked: true, scope: f?.scope ?? [] };
  }
  let mint = 0, burn = 0;
  for (const h of f.hourly) { mint += h.mintUsd || 0; burn += h.burnUsd || 0; }
  const last = f.hourly[f.hourly.length - 1];
  const banked = f.stale;
  const side = (v: number, lastV: number): FlowSide => ({
    activity: banked ? 0 : activityFor(v, lastV), volume24hUsd: v, lastHourUsd: lastV, stale: f.stale,
  });
  return {
    mint: side(mint, last.mintUsd || 0),
    burn: side(burn, last.burnUsd || 0),
    net24hUsd: f.net24hUsd ?? mint - burn,
    dominance: banked ? 0 : dominanceFor(mint, burn),
    banked,
    scope: f.scope,
  };
}

/**
 * Dev overrides (the caller gates on import.meta.env.DEV): ?mint=…&burn=… where a value ≤ 1 is an activity and a
 * larger one a 24 h volume in USD (?mint=9e9&burn=1e9 = a heavy minting day). The other side keeps its reading.
 */
export function applyFlowOverrides(c: CivicFlows, q: URLSearchParams): CivicFlows {
  const vol = (key: "mint" | "burn"): number | null => {
    const raw = q.get(key);
    if (raw == null) return null;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0) return null;
    // an activity → the 24 h volume that produces it (log scale)
    return v <= 1 ? 24 * 10 ** (Math.log10(RATE_IDLE_USD) + v * (Math.log10(RATE_FULL_USD) - Math.log10(RATE_IDLE_USD))) : v;
  };
  const m = vol("mint"), b = vol("burn");
  if (m == null && b == null) return c;
  const mint24 = m ?? c.mint.volume24hUsd ?? 0, burn24 = b ?? c.burn.volume24hUsd ?? 0;
  const side = (v: number): FlowSide => ({ activity: activityFor(v, v / 24), volume24hUsd: v, lastHourUsd: v / 24, stale: false });
  return { ...c, mint: side(mint24), burn: side(burn24), net24hUsd: mint24 - burn24, dominance: dominanceFor(mint24, burn24), banked: false };
}

/**
 * How each works on screen, 0..~1.4: activity, swollen by dominance (the dominant side up to +45 %, the other
 * down to −35 %). Banked: 0 (the embers are drawn apart).
 */
export function workLevels(c: CivicFlows): { mint: number; burn: number } {
  if (c.banked) return { mint: 0, burn: 0 };
  const d = c.dominance;
  return {
    mint: c.mint.activity * (1 + 0.45 * Math.max(d, 0)) * (1 - 0.35 * Math.max(-d, 0)),
    burn: c.burn.activity * (1 + 0.45 * Math.max(-d, 0)) * (1 - 0.35 * Math.max(d, 0)),
  };
}
