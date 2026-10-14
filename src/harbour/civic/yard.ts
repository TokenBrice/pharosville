/**
 * THE SHIPYARD (P6 D20): the pure half. Every coin in the pharos-watch registry's pre-launch book
 * (src/harbour/data/prelaunch.json, scripts/harbour/sync-prelaunch.mjs) is a hull under construction:
 *
 *   announced / no phase → keel laid on a building berth      testnet  → in frame (ribs)
 *   auditing             → planked                              beta     → painted
 *   launching-soon       → fully rigged on a big slipway, dressed overall in flags
 *
 * The slips take the rigged hulls first (then painted ones, if a slip is free); the berths take the rest,
 * furthest along nearest the slips. When a pre-launch id turns up live in /api/stablecoins its hull is
 * gone from the yard (the sim's Slipway voyage sails the new boat out). No renderer: civic.test.ts.
 */

export type LaunchPhase = "announced" | "testnet" | "auditing" | "beta" | "launching-soon";
export type HullStage = "keel" | "ribs" | "planked" | "painted" | "rigged";

export interface PrelaunchMilestone { date: string; type: string; title: string }

export interface PrelaunchCoin {
  id: string;
  name: string;
  symbol: string;
  pegCurrency: string | null;
  pegType: string;
  launchPhase: LaunchPhase | null;
  launchPhaseDetail: string | null;
  expectedLaunchDate: string | null;
  announcedDate: string | null;
  milestones: PrelaunchMilestone[];
  issuer: string | null;
  logo: string | null;
  brandColor: string | null;
  llamaId: string | null;
  geckoId: string | null;
}

export interface PrelaunchBook { count: number; coins: PrelaunchCoin[] }

export const STAGE_ORDER: readonly HullStage[] = ["keel", "ribs", "planked", "painted", "rigged"];

export function stageFor(phase: LaunchPhase | null | undefined): HullStage {
  switch (phase) {
    case "testnet": return "ribs";
    case "auditing": return "planked";
    case "beta": return "painted";
    case "launching-soon": return "rigged";
    default: return "keel";
  }
}

/** Sort key for an expected date ("2026-Q4", "2026-H2", "2026-10", "2027"): sooner first, unstated last. */
export function expectedKey(s: string | null | undefined): string {
  if (!s) return "9999";
  const q = /^(\d{4})-([QH])([1-4])$/i.exec(s);
  if (q) return `${q[1]}-${String(q[2].toUpperCase() === "Q" ? Number(q[3]) * 3 : Number(q[3]) * 6).padStart(2, "0")}-31`;
  return /^\d{4}$/.test(s) ? `${s}-12-31` : s;
}

export interface YardSlot { kind: "slip" | "berth"; index: number }
export interface YardPlace { coin: PrelaunchCoin; stage: HullStage; slot: YardSlot | null }

/**
 * Deterministic yard plan. `slipOrder` / `berthOrder` list the slot indices in the order they fill
 * (the system passes the launch slip first, where the sim's Slipway voyage starts, and the berths nearest the slips first).
 * A coin past the yard's capacity gets slot null (listed, not drawn).
 */
export function allocateYard(coins: readonly PrelaunchCoin[], slipOrder: readonly number[], berthOrder: readonly number[]): YardPlace[] {
  const rank = (c: PrelaunchCoin) => STAGE_ORDER.indexOf(stageFor(c.launchPhase));
  const sorted = [...coins].sort((a, b) => rank(b) - rank(a)
    || expectedKey(a.expectedLaunchDate).localeCompare(expectedKey(b.expectedLaunchDate))
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: YardPlace[] = [];
  let s = 0, k = 0;
  for (const coin of sorted) {
    const stage = stageFor(coin.launchPhase);
    let slot: YardSlot | null = null;
    // the slips: rigged hulls first, then painted ones while a slip is free
    if ((stage === "rigged" || stage === "painted") && s < slipOrder.length) slot = { kind: "slip", index: slipOrder[s++] };
    else if (k < berthOrder.length) slot = { kind: "berth", index: berthOrder[k++] };
    out.push({ coin, stage, slot });
  }
  return out;
}

/**
 * Pre-launch coins that are live now: their id or DefiLlama id is in the payload, or a live coin carries the same
 * name AND symbol (the registry's slug, e.g. "eurr-revolut", and the payload's numeric id, "436", can differ).
 */
export function launchedIds(coins: readonly PrelaunchCoin[], live: Iterable<{ id: string; symbol?: string; name?: string }>): Set<string> {
  const ids = new Set<string>(), named = new Set<string>();
  const nameKey = (name: string, symbol: string) => `${name.trim().toLowerCase()}|${symbol.trim().toLowerCase()}`;
  for (const b of live) { ids.add(b.id); if (b.name && b.symbol) named.add(nameKey(b.name, b.symbol)); }
  const out = new Set<string>();
  for (const c of coins) {
    if (ids.has(c.id) || (c.llamaId != null && ids.has(c.llamaId)) || named.has(nameKey(c.name, c.symbol))) out.add(c.id);
  }
  return out;
}

/** The Registry's grade board: live (not wrecked) boats by grade letter, "—" for unrated (as the Registry panel counts). */
export function gradeTally(boats: ReadonlyArray<{ grade: string | null; state: string }>): Map<string, number> {
  const t = new Map<string, number>();
  for (const b of boats) {
    if (b.state === "wrecked") continue;
    const g = b.grade && /^[A-F]/i.test(b.grade) ? b.grade.charAt(0).toUpperCase() : "—";
    t.set(g, (t.get(g) ?? 0) + 1);
  }
  return t;
}

export interface ChainMove { name: string; change24hPct?: number | null }

/**
 * The Harbourmaster's movers hoist: among the harbours with a crest (`slugs`), the largest 24 h supply gain
 * (only if > 0) and the largest loss (only if < 0). Chain names map to crest slugs as "Hyperliquid L1" → "hyperliquid-l1".
 */
export function topMovers(rows: readonly ChainMove[], slugs: readonly string[]): { up: { slug: string; pct: number } | null; down: { slug: string; pct: number } | null } {
  const known = new Set(slugs);
  let up: { slug: string; pct: number } | null = null, down: { slug: string; pct: number } | null = null;
  for (const r of rows) {
    const slug = String(r?.name ?? "").trim().toLowerCase().replace(/\s+/g, "-"), pct = r?.change24hPct;
    if (!known.has(slug) || typeof pct !== "number" || !Number.isFinite(pct)) continue;
    if (pct > 0 && (!up || pct > up.pct)) up = { slug, pct };
    if (pct < 0 && (!down || pct < down.pct)) down = { slug, pct };
  }
  return { up, down };
}
