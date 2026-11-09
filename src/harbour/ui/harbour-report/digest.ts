import { z } from "zod";
import type { HarbourModel, HarbourPayloads } from "../../model/types";
import { dated, byId, completeSupply, currentSource, input, moverSentence, movers, type ReportSentence, type SupplyChange } from "./report";
import { psiChange } from "../charts";

export const READING_KEY = "pharosville.reading.v1";
export const READING_LIMIT = 64 * 1024;
const time = z.number().finite().nonnegative().max(8.64e15);
const identity = z.string().min(1).max(256).refine((s) => !!s.trim());
const id = z.string().min(1).max(256);
const ObservationSchema = z.object({
  version: z.literal(1), savedAt: time,
  sourceTimes: z.object({ stablecoins: time, stability: time, pegSummary: time }).strict(),
  supplyMethod: z.literal("reported-usd-buckets-v1"),
  psi: z.object({ score: z.number().finite().min(0).max(100), band: z.enum(["BEDROCK", "STEADY", "TREMOR", "FRACTURE", "CRISIS", "MELTDOWN"]), date: time, method: identity, dewsUnavailable: z.boolean(), depegEventsUnavailable: z.boolean() }).strict(),
  pegMethod: identity,
  pegs: z.array(z.object({ id, offPeg: z.boolean(), method: identity }).strict()),
  supply: z.array(z.object({ id, symbol: id, usd: z.number().finite().nonnegative().nullable(), buckets: z.array(id).min(1) }).strict()),
}).strict();
export type BrowserObservation = z.infer<typeof ObservationSchema>;
export type ReadingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const byteSize = (s: string): number => new TextEncoder().encode(s).byteLength;
const unique = (ids: string[]): boolean => new Set(ids).size === ids.length;

export function parseObservation(raw: string | null, nowMs: number): BrowserObservation | null {
  if (raw == null || raw.length > READING_LIMIT || byteSize(raw) > READING_LIMIT) return null;
  try {
    const result = ObservationSchema.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    const r = result.data;
    const supplyIds = new Set(r.supply.map((s) => s.id));
    if (r.savedAt > nowMs || Object.values(r.sourceTimes).some((t) => t > r.savedAt)
      || r.psi.date > r.savedAt || !r.supply.length || !r.pegs.length
      || !unique(r.supply.map((s) => s.id)) || !unique(r.pegs.map((s) => s.id))
      || r.supply.some((s) => !unique(s.buckets)) || r.pegs.some((p) => !supplyIds.has(p.id))) return null;
    return r;
  } catch { return null; }
}

export function browserObservation(model: HarbourModel | null, payloads: HarbourPayloads, nowMs: number): BrowserObservation | null {
  if (!model?.hasFleet || !(["stablecoins", "stability", "pegSummary"] as const).every((key) => currentSource(model, payloads, key, nowMs))) return null;
  const psi = payloads.stability!.data!, peg = payloads.pegSummary!.data!, cur = psi.current;
  if (!cur || model.readings.psi.computedAt == null || model.readings.psi.band == null) return null;
  const live = new Set(model.boats.filter((b) => b.state !== "wrecked").map((b) => b.id));
  const supply = payloads.stablecoins!.data!.peggedAssets.filter((r) => live.has(r.id)).map((r) => ({ id: r.id, symbol: r.symbol, usd: completeSupply(r.circulating), buckets: Object.keys(r.circulating).sort() })).sort((a, b) => byId(a.id, b.id));
  const record = {
    version: 1, savedAt: nowMs, supplyMethod: "reported-usd-buckets-v1",
    sourceTimes: { stablecoins: model.truth.stablecoins.sourceUpdatedAtMs, stability: model.truth.stability.sourceUpdatedAtMs, pegSummary: model.truth.pegSummary.sourceUpdatedAtMs },
    psi: { score: model.readings.psi.score, band: model.readings.psi.band, date: model.readings.psi.computedAt * 1000, method: cur.methodologyVersion ?? psi.methodology?.version,
      dewsUnavailable: cur.inputDegradation?.dewsUnavailable === true, depegEventsUnavailable: cur.inputDegradation?.depegEventsUnavailable === true },
    pegMethod: peg.methodology?.version,
    pegs: peg.coins.filter((r) => live.has(r.id) && r.currentDeviationBps != null && Number.isFinite(r.currentDeviationBps)).map((r) => ({ id: r.id, offPeg: r.activeDepeg, method: r.methodologyVersion ?? peg.methodology?.version })).sort((a, b) => byId(a.id, b.id)),
    supply,
  };
  return parseObservation(JSON.stringify(record), nowMs);
}

export function returnDigest(previous: BrowserObservation | null, current: BrowserObservation | null): ReportSentence[] {
  if (!previous || !current || previous.savedAt > current.savedAt) return [{ text: "Comparison unavailable.", inputs: [input("Saved browser reading", previous ? dated(previous.savedAt) : null), input("Current comparable reading", current ? dated(current.savedAt) : null)] }];
  const dates = [input("Previous browser reading (UTC)", dated(previous.savedAt)), ...(["stablecoins", "stability", "pegSummary"] as const).flatMap((k) => [
    input(`${k}: previous source updated (UTC)`, dated(previous.sourceTimes[k])), input(`${k}: current source updated (UTC)`, dated(current.sourceTimes[k])),
  ])];
  const out: ReportSentence[] = [{ text: `Compared with this browser's reading at ${dated(previous.savedAt)}.`, inputs: dates }];
  const a = previous.psi, b = current.psi;
  const compatiblePsi = a.method === b.method && a.dewsUnavailable === b.dewsUnavailable && a.depegEventsUnavailable === b.depegEventsUnavailable;
  out.push({ text: compatiblePsi ? `PSI ${a.score.toFixed(1)} on ${dated(a.date)}; PSI ${b.score.toFixed(1)} on ${dated(b.date)}. ${psiChange([{ date: a.date / 1000, score: a.score, methodologyVersion: a.method }, { date: b.date / 1000, score: b.score, methodologyVersion: b.method }])}` : "PSI comparison unavailable.",
    inputs: [...dates, input("Previous PSI", a), input("Current PSI", b)] });
  const old = new Map(previous.supply.map((r) => [r.id, r])), changes: SupplyChange[] = [];
  for (const r of current.supply) {
    const p = old.get(r.id);
    if (p && r.usd != null && p.usd != null && JSON.stringify(p.buckets) === JSON.stringify(r.buckets) && Number.isFinite(r.usd - p.usd)) changes.push({ id: r.id, symbol: r.symbol, previous: p.usd, current: r.usd, delta: r.usd - p.usd });
  }
  for (const r of movers(changes)) out.push(moverSentence(r, dates));
  const oldPegs = new Map(previous.pegs.map((p) => [p.id, p]));
  const matched = current.pegs.filter((p) => oldPegs.get(p.id)?.method === p.method);
  const compatiblePeg = previous.pegMethod === current.pegMethod && matched.length > 0;
  const before = matched.filter((p) => oldPegs.get(p.id)!.offPeg).length, after = matched.filter((p) => p.offPeg).length;
  out.push({ text: compatiblePeg ? `Off-peg coins among ${matched.length} comparable covered coins: ${before} in the saved reading; ${after} in this reading.` : "Off-peg comparison unavailable.",
    inputs: [...dates, input("Previous peg methodology", previous.pegMethod), input("Current peg methodology", current.pegMethod), input("Previous covered peg readings", previous.pegs), input("Current covered peg readings", current.pegs)] });
  const currentIds = new Set(current.supply.map((r) => r.id)), oldIds = new Set(old.keys());
  const added = current.supply.filter((r) => !oldIds.has(r.id)).map((r) => r.id), removed = previous.supply.filter((r) => !currentIds.has(r.id)).map((r) => r.id);
  const oldPegIds = new Set(oldPegs.keys()), pegIds = new Set(current.pegs.map((r) => r.id));
  const addedPegs = current.pegs.filter((r) => !oldPegIds.has(r.id)).map((r) => r.id), removedPegs = previous.pegs.filter((r) => !pegIds.has(r.id)).map((r) => r.id);
  out.push({ text: `Coverage changes: ${added.length} added and ${removed.length} removed supply IDs; ${addedPegs.length} added and ${removedPegs.length} removed covered peg IDs.`,
    inputs: [...dates, input("Added supply IDs", added), input("Removed supply IDs", removed), input("Added covered peg IDs", addedPegs), input("Removed covered peg IDs", removedPegs), input("Comparable complete supply IDs", changes.map((r) => r.id))] });
  const comparableIds = new Set(changes.map((r) => r.id));
  const omitted = [...new Set([...oldIds, ...currentIds])].filter((id) => !comparableIds.has(id)).sort(byId);
  if (omitted.length) out.push({ text: `${omitted.length} coins lack a comparable reading.`, inputs: [...dates, ...omitted.map((id) => input(id, { previous: old.get(id) ?? null, current: current.supply.find((r) => r.id === id) ?? null }))] });
  return out;
}

/** One prior baseline for the visit, including after this visit's single replacement write. */
export function createReadingSession(storage: () => ReadingStorage, nowMs: number) {
  let prior: BrowserObservation | null = null, unavailable = false, saved = false;
  const listeners = new Set<() => void>();
  try { prior = parseObservation(storage().getItem(READING_KEY), nowMs); } catch { unavailable = true; }
  let state = { prior, unavailable };
  const publish = () => { state = { prior, unavailable }; for (const fn of listeners) fn(); };
  return {
    canSave: () => !saved && !unavailable,
    getSnapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    save(record: BrowserObservation): boolean {
      if (saved || unavailable) return false;
      saved = true;
      const serialized = JSON.stringify(record);
      if (!parseObservation(serialized, Date.now())) return false;
      try { storage().setItem(READING_KEY, serialized); return true; } catch { unavailable = true; publish(); return false; }
    },
    forget() {
      saved = true; prior = null;
      try { storage().removeItem(READING_KEY); } catch { unavailable = true; }
      publish();
    },
  };
}
