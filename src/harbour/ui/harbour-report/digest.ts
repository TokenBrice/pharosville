import { z } from "zod";
import type { HarbourModel, HarbourPayloads } from "../../model/types";
import { dated, byId, completeSupply, currentSource, input, moverSentence, movers, type ReportSentence, type SupplyChange } from "./report";
import { psiChange } from "../charts";
import { truthCopy } from "../truth-copy";

export const READING_KEY = "pharosville.reading.v1";
export const READING_LIMIT = 64 * 1024;
const time = z.number().finite().nonnegative().max(8.64e15);
const identity = z.string().min(1).max(256).refine((s) => !!s.trim());
const id = z.string().min(1).max(256);
const ObservationSchema = z.object({
  version: z.literal(2), savedAt: time,
  sourceTimes: z.object({ stablecoins: time, stability: time, pegSummary: time }).strict(),
  supplyMethod: z.literal("reported-usd-buckets-v1"),
  psi: z.object({ score: z.number().finite().min(0).max(100), band: z.enum(["BEDROCK", "STEADY", "TREMOR", "FRACTURE", "CRISIS", "MELTDOWN"]), date: time, method: identity, dewsUnavailable: z.boolean().nullable(), depegEventsUnavailable: z.boolean().nullable() }).strict(),
  pegMethod: identity,
  pegs: z.array(z.object({ id, offPeg: z.boolean(), method: identity }).strict()),
  supply: z.array(z.object({ id, symbol: id, usd: z.number().finite().nonnegative().nullable(), buckets: z.array(id).min(1) }).strict()),
}).strict();
export type BrowserObservation = z.infer<typeof ObservationSchema>;
export type ReadingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const byteSize = (s: string): number => new TextEncoder().encode(s).byteLength;
const unique = (ids: string[]): boolean => new Set(ids).size === ids.length;

const index = z.number().int().nonnegative();
const StoredObservationSchema = z.object({
  v: z.literal(2), t: time, s: z.tuple([time, time, time]),
  m: z.array(identity), b: z.array(z.array(id).min(1)),
  p: z.tuple([ObservationSchema.shape.psi.shape.score, ObservationSchema.shape.psi.shape.band, time, index, z.boolean().nullable(), z.boolean().nullable()]),
  g: index, e: z.array(z.tuple([index, z.boolean(), index])),
  c: z.array(z.tuple([id, id, z.number().finite().nonnegative().nullable(), index])),
}).strict();

/** Intern repeated methods/bucket sets; peg rows reference the supply array by index. */
export function serializeObservation(r: BrowserObservation): string {
  const methods = [...new Set([r.psi.method, r.pegMethod, ...r.pegs.map((p) => p.method)])];
  const bucketKeys = [...new Set(r.supply.map((s) => JSON.stringify(s.buckets)))];
  const supplyIds = new Map(r.supply.map((s, i) => [s.id, i]));
  return JSON.stringify({
    v: r.version, t: r.savedAt, s: [r.sourceTimes.stablecoins, r.sourceTimes.stability, r.sourceTimes.pegSummary],
    m: methods, b: bucketKeys.map((key) => JSON.parse(key) as string[]),
    p: [r.psi.score, r.psi.band, r.psi.date, methods.indexOf(r.psi.method), r.psi.dewsUnavailable, r.psi.depegEventsUnavailable],
    g: methods.indexOf(r.pegMethod), e: r.pegs.map((p) => [supplyIds.get(p.id) ?? -1, p.offPeg, methods.indexOf(p.method)]),
    c: r.supply.map((s) => [s.id, s.symbol, s.usd, bucketKeys.indexOf(JSON.stringify(s.buckets))]),
  });
}

export function parseObservation(raw: string | null, nowMs: number): BrowserObservation | null {
  if (raw == null || raw.length > READING_LIMIT || byteSize(raw) > READING_LIMIT) return null;
  try {
    const stored = StoredObservationSchema.safeParse(JSON.parse(raw));
    if (!stored.success) return null;
    const w = stored.data;
    const result = ObservationSchema.safeParse({
      version: w.v, savedAt: w.t, supplyMethod: "reported-usd-buckets-v1",
      sourceTimes: { stablecoins: w.s[0], stability: w.s[1], pegSummary: w.s[2] },
      psi: { score: w.p[0], band: w.p[1], date: w.p[2], method: w.m[w.p[3]], dewsUnavailable: w.p[4], depegEventsUnavailable: w.p[5] },
      pegMethod: w.m[w.g], pegs: w.e.map(([i, offPeg, method]) => ({ id: w.c[i]?.[0], offPeg, method: w.m[method] })),
      supply: w.c.map(([id, symbol, usd, buckets]) => ({ id, symbol, usd, buckets: w.b[buckets] })),
    });
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
    version: 2, savedAt: nowMs, supplyMethod: "reported-usd-buckets-v1",
    sourceTimes: { stablecoins: model.truth.stablecoins.sourceUpdatedAtMs, stability: model.truth.stability.sourceUpdatedAtMs, pegSummary: model.truth.pegSummary.sourceUpdatedAtMs },
    psi: { score: model.readings.psi.score, band: model.readings.psi.band, date: model.readings.psi.computedAt * 1000, method: cur.methodologyVersion ?? psi.methodology?.version,
      dewsUnavailable: cur.inputDegradation?.dewsUnavailable ?? null, depegEventsUnavailable: cur.inputDegradation?.depegEventsUnavailable ?? null },
    pegMethod: peg.methodology?.version,
    pegs: peg.coins.filter((r) => live.has(r.id) && r.currentDeviationBps != null && Number.isFinite(r.currentDeviationBps)).map((r) => ({ id: r.id, offPeg: r.activeDepeg, method: r.methodologyVersion ?? peg.methodology?.version })).sort((a, b) => byId(a.id, b.id)),
    supply,
  };
  // Validate source fields before encoding can discard an invalid identity or value.
  const result = ObservationSchema.safeParse(record);
  return result.success ? parseObservation(serializeObservation(result.data), nowMs) : null;
}

export function returnDigest(previous: BrowserObservation | null, current: BrowserObservation | null): ReportSentence[] {
  if (!previous || !current || previous.savedAt > current.savedAt) return [{ text: "Comparison unavailable.", inputs: [input("Saved browser reading", previous ? dated(previous.savedAt) : null), input("Current comparable reading", current ? dated(current.savedAt) : null)] }];
  const dates = [input("Previous browser reading (UTC)", dated(previous.savedAt)), ...(["stablecoins", "stability", "pegSummary"] as const).flatMap((k) => [
    input(`${k}: previous source updated (UTC)`, dated(previous.sourceTimes[k])), input(`${k}: current source updated (UTC)`, dated(current.sourceTimes[k])),
  ])];
  const out: ReportSentence[] = [{ text: `Compared with this browser's reading at ${dated(previous.savedAt)}.`, inputs: dates }];
  const a = previous.psi, b = current.psi;
  const compatiblePsi = a.method === b.method && [a, b].every((p) => p.dewsUnavailable === false && p.depegEventsUnavailable === false);
  const qualifications = [...new Set([a, b].map((p) => truthCopy({ kind: "psi-qualification", dewsUnavailable: p.dewsUnavailable === true, depegEventsUnavailable: p.depegEventsUnavailable === true })).filter(Boolean))];
  out.push({ text: compatiblePsi ? `PSI ${a.score.toFixed(1)} on ${dated(a.date)}; PSI ${b.score.toFixed(1)} on ${dated(b.date)}. ${psiChange([{ date: a.date / 1000, score: a.score, methodologyVersion: a.method }, { date: b.date / 1000, score: b.score, methodologyVersion: b.method }])}` : ["PSI comparison unavailable.", ...qualifications].join(" "),
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
      if (!ObservationSchema.safeParse(record).success) return false;
      const serialized = serializeObservation(record);
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
