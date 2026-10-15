/**
 * The Shipyard's book: the pre-launch coins as the UI lists them (D20). Pure where it can be.
 *
 * Source order: the 'civic' service's yard list when it publishes one (it owns which hull sits on
 * which slip), else the pre-launch book synced from the pharos-watch registry
 * (src/harbour/data/prelaunch.json, every tracked launch on pharos.watch/upcoming), else this repo's
 * registry snapshot (`status: "pre-launch"`). Rows are read structurally and every field is guarded.
 */
import type { LaunchMilestone, LaunchPhase } from "@shared/types/core";
// the slim cut of the registry (scripts/harbour/sync-check.mjs), not runtime-registry: the full registry stays server-side
import runtimeSlim from "@shared/data/stablecoins/runtime-slim.json";
import prelaunchBook from "../data/prelaunch.json";
import { logosById } from "../../lib/logos";
import type { EngineContext } from "../engine/types";

export const UPCOMING_URL = "https://pharos.watch/upcoming/";

/** Launch phases in the order a hull is built; `null` (unphased) sorts first, as a bare keel. */
export const PHASES: readonly LaunchPhase[] = ["announced", "testnet", "auditing", "beta", "launching-soon"];
export const PHASE_NAME: Record<LaunchPhase, string> = {
  announced: "Announced", testnet: "Testnet", auditing: "Auditing", beta: "Beta", "launching-soon": "Launching soon",
};
/** Construction stage on the slip, by phase (D20: keel → ribs → planking → painted → rigged). */
export type HullStage = "keel" | "ribs" | "planked" | "painted" | "rigged";
export const STAGE_OF: Record<LaunchPhase, HullStage> = {
  announced: "keel", testnet: "ribs", auditing: "planked", beta: "painted", "launching-soon": "rigged",
};
export const STAGE_NAME: Record<HullStage, string> = {
  keel: "keel laid", ribs: "in frame", planked: "planked", painted: "painted", rigged: "rigged, awaiting launch",
};

export interface YardCoin {
  id: string;
  symbol: string;
  name: string;
  phase: LaunchPhase | null;
  phaseDetail: string | null;
  /** Raw expected date ("2026-Q2", "2026-09", "2027"), or null. */
  expected: string | null;
  milestones: LaunchMilestone[];
  logo: string | null;
  stage: HullStage;
  /** Pegged currency code when the registry knows it ("USD", "EUR", "GOLD"…). */
  peg: string | null;
  /** The DefiLlama id it will carry once live, when known (a launch can appear under it). */
  llamaId: string | null;
  /** The issuer, when the book names one. */
  issuer: string | null;
}

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
/** "launching-soon", "Launching Soon", "launching soon" → "launching-soon"; anything else → null. */
function phaseOf(v: unknown): LaunchPhase | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return (PHASES as readonly string[]).includes(k) ? (k as LaunchPhase) : null;
}

function milestonesOf(v: unknown): LaunchMilestone[] {
  if (!Array.isArray(v)) return [];
  return v.filter((m): m is LaunchMilestone => !!m && typeof m === "object" && typeof (m as Raw).date === "string" && typeof (m as Raw).title === "string")
    .slice().sort((a, b) => b.date.localeCompare(a.date));
}

/** One row (registry meta, or a civic yard entry carrying the same fields) → YardCoin; null when it has no id. */
export function toYardCoin(r: unknown): YardCoin | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Raw;
  const id = str(o.id);
  if (!id) return null;
  const phase = phaseOf(o.launchPhase ?? o.phase);
  const flags = o.flags as Raw | undefined;
  const pegCurrency = str(flags?.pegCurrency) ?? str(o.pegCurrency);
  return {
    id,
    symbol: str(o.symbol) ?? id,
    name: str(o.name) ?? str(o.symbol) ?? id,
    phase,
    phaseDetail: str(o.launchPhaseDetail) ?? str(o.phaseDetail),
    expected: str(o.expectedLaunchDate) ?? str(o.expected),
    milestones: milestonesOf(o.milestones),
    logo: str(o.logo) ?? logosById[id] ?? null,
    stage: phase ? STAGE_OF[phase] : "keel",
    peg: pegCurrency,
    llamaId: str(o.llamaId),
    issuer: str(o.issuer),
  };
}

/** "2026-Q2" → "Q2 2026", "2026-H2" → "H2 2026", "2026-09" → "Sep 2026", "2026-09-14" → "14 Sep 2026", null → "not stated". */
export function expectedLabel(s: string | null): string {
  if (!s) return "not stated";
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let m = /^(\d{4})-([QH][1-4])$/i.exec(s);
  if (m) return `${m[2].toUpperCase()} ${m[1]}`;
  m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (m) return `${m[3] ? `${Number(m[3])} ` : ""}${MON[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
  return s;
}

/** Sort key for an expected date ("2026-Q2", "Q2 2026", "2026-09", "Oct 2026", "2027"): sooner first, unstated last. */
export function expectedKey(s: string | null): string {
  if (!s) return "9999";
  const t = s.trim();
  const end = (y: string, m: number) => `${y}-${String(m).padStart(2, "0")}-31`;
  let m = /^(\d{4})-([QH])([1-4])$/i.exec(t) ?? null;
  if (m) return end(m[1], m[2].toUpperCase() === "Q" ? Number(m[3]) * 3 : Number(m[3]) * 6);
  m = /^([QH])([1-4])\s+(\d{4})$/i.exec(t);
  if (m) return end(m[3], m[1].toUpperCase() === "Q" ? Number(m[2]) * 3 : Number(m[2]) * 6);
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(t);
  const mon = m ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].toLowerCase()) : -1;
  if (m && mon >= 0) return `${m[2]}-${String(mon + 1).padStart(2, "0")}-15`;
  if (/^\d{4}$/.test(t)) return `${t}-12-31`;
  return /^\d{4}-\d{2}/.test(t) ? t : "9998";
}

/** The yard's coins, furthest along first (launching soon → announced), then soonest expected. */
export function sortYard(coins: readonly YardCoin[]): YardCoin[] {
  const rank = (c: YardCoin) => (c.phase ? PHASES.indexOf(c.phase) : -1);
  return [...coins].sort((a, b) => rank(b) - rank(a) || expectedKey(a.expected).localeCompare(expectedKey(b.expected)) || a.name.localeCompare(b.name));
}

/** Group by phase in build order, furthest along first; unphased rows close the list. */
export function groupYard(coins: readonly YardCoin[]): Array<{ phase: LaunchPhase | null; label: string; coins: YardCoin[] }> {
  const order: Array<LaunchPhase | null> = [...PHASES].reverse();
  order.push(null);
  return order.map((p) => ({ phase: p, label: p ? PHASE_NAME[p] : "Phase not stated", coins: sortYard(coins.filter((c) => c.phase === p)) }))
    .filter((g) => g.coins.length > 0);
}

const fromRows = (rows: readonly unknown[]) => rows.map(toYardCoin).filter((c): c is YardCoin => c != null);
const SNAPSHOT = fromRows(runtimeSlim.filter((c) => c.status === "pre-launch"));
const BOOK = fromRows(((prelaunchBook as { coins?: unknown[] }).coins) ?? []);

/** The pre-launch book (the synced pharos-watch list); the repo's registry snapshot only when the book is empty. */
export const REGISTRY_YARD: YardCoin[] = (() => {
  if (!BOOK.length) return SNAPSHOT;
  // the snapshot's milestones carry source links the synced book drops: keep them where the coin is in both
  const snap = new Map(SNAPSHOT.map((c) => [c.id, c]));
  return BOOK.map((c) => {
    const old = snap.get(c.id);
    if (!old) return c;
    const src = new Map(old.milestones.filter((m) => m.sourceUrl).map((m) => [`${m.date}|${m.title}`, m.sourceUrl]));
    return { ...c, milestones: c.milestones.map((m) => (m.sourceUrl || !src.get(`${m.date}|${m.title}`) ? m : { ...m, sourceUrl: src.get(`${m.date}|${m.title}`) })) };
  });
})();

/**
 * The 'civic' service, read structurally (src/harbour/civic). Any of these may be absent; the UI never
 * assumes more than it finds.
 */
export interface CivicLike {
  yard?: {
    coins?: unknown[];
    /** World position of a coin's hull on its slip / berth. */
    hullPosition?: (id: string) => readonly [number, number, number] | null | undefined;
    hulls?: Array<{ id?: string; coinId?: string; position?: readonly number[] }>;
  };
}

export const getCivic = (ctx: EngineContext) => (ctx.services.get("civic") as CivicLike | undefined) ?? null;

let civicSrc: unknown[] | null = null, civicOut: YardCoin[] = [];
/** The coins in the yard: the civic list when it has one, else the registry. */
export function yardCoins(ctx: EngineContext): YardCoin[] {
  const list = getCivic(ctx)?.yard?.coins;
  if (!Array.isArray(list) || list.length === 0) return REGISTRY_YARD;
  if (list !== civicSrc) {
    civicSrc = list;
    const reg = new Map(REGISTRY_YARD.map((c) => [c.id, c]));
    // a civic row may carry only an id (+ slot): fill it from the registry
    civicOut = list.map((r) => {
      const own = toYardCoin(r);
      const base = own ? reg.get(own.id) : undefined;
      if (!own) return null;
      return base ? { ...base, ...Object.fromEntries(Object.entries(own).filter(([k, v]) => v != null && !(Array.isArray(v) && v.length === 0) && !(k === "symbol" && v === own.id) && !(k === "name" && v === own.id))) } as YardCoin : own;
    }).filter((c): c is YardCoin => c != null);
  }
  return civicOut;
}

/** A yard hull's world position, if the civic system has placed it. */
export function yardHullPosition(ctx: EngineContext, id: string): [number, number, number] | null {
  const y = getCivic(ctx)?.yard;
  if (!y) return null;
  const p = y.hullPosition?.(id) ?? y.hulls?.find((h) => (h.coinId ?? h.id) === id)?.position;
  return p && p.length >= 3 && p.every((n) => Number.isFinite(n)) ? [p[0], p[1], p[2]] : null;
}

/** Tracked launches that are live now: in the fleet under their id (or their DefiLlama id). */
export function launchedFromYard(model: { boats: ReadonlyArray<{ id: string; symbol: string }> } | null): Array<{ id: string; symbol: string }> {
  if (!model) return [];
  const live = new Map(model.boats.map((b) => [b.id, b]));
  return REGISTRY_YARD.flatMap((c) => {
    const b = live.get(c.id) ?? (c.llamaId ? live.get(c.llamaId) : undefined);
    return b ? [{ id: b.id, symbol: b.symbol }] : [];
  });
}
