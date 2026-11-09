import type { CoinRow, EndpointKey, HarbourModel, HarbourPayloads } from "../../model/types";
import { endpointTruth } from "../../model/truth";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { psiObservations, utcObservation } from "../charts";
import { coinNet, coverageLine, NET_UNAVAILABLE, VALUATION_UNKNOWN, type CoinFlow } from "../flow-copy";
import { money, pctChange, share } from "../format";
import { scopeName } from "../places";
import { qualificationCopy, READING_NAMES, sourceTruth } from "../source-state";
import { truthCopy } from "../truth-copy";

export interface ReportSentence { text: string; inputs: Array<[string, string]> }
const plainNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
function evidenceValue(label: string, value: unknown): string {
  if (value == null) return "Unavailable";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "Unavailable";
    if (/usd|^pegged/i.test(label)) return money(value);
    if (/ratio|share/i.test(label)) return share(value);
    if (/^(computedAt|historyStartAt)$/.test(label)) return dated(value * 1000);
    if (label === "date") return dated(value);
    return plainNumber.format(value);
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) return dated(Date.parse(value));
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => evidenceValue(label, v)).join(/previous\/current/i.test(label) ? " → " : ", ") || "None";
  if (typeof value === "object") {
    const fields = Object.entries(value);
    if (fields.length === 2 && "previous" in value && "current" in value) {
      return `previous: ${evidenceValue(label, value.previous)} → current: ${evidenceValue(label, value.current)}`;
    }
    return fields.map(([key, v]) => `${key}: ${evidenceValue(key, v)}`).join("; ") || "None";
  }
  return String(value);
}
export const input = (label: string, value: unknown): [string, string] => [label, evidenceValue(label, value)];
export const dated = (ms: number | null | undefined): string => ms != null && Number.isFinite(ms) ? `${utcObservation(ms / 1000)} UTC` : "Unavailable";
export const byId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Do not combine a newly fetched payload with the previous installed model. Age it at read time too. */
export function currentSource(model: HarbourModel | null, payloads: HarbourPayloads, key: EndpointKey, nowMs: number): boolean {
  const snap = payloads[key];
  return !!model && model.truth[key].state === "current" && snap?.fetchedAtMs != null
    && model.truth[key].receivedAtMs === snap.fetchedAtMs && endpointTruth(key, snap, nowMs).state === "current";
}

/** A null/absent bucket is unknown, never zero; all bucket identities must match. */
export function completeSupply(buckets: unknown): number | null {
  if (!buckets || typeof buckets !== "object" || Array.isArray(buckets)) return null;
  const values = Object.values(buckets);
  if (!values.length || values.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0)) return null;
  const total = values.reduce<number>((sum, v) => sum + (v as number), 0);
  return Number.isFinite(total) ? total : null;
}
export function sameBuckets(a: unknown, b: unknown): boolean {
  return !!a && !!b && JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());
}
export interface SupplyChange { id: string; symbol: string; current: number; previous: number; delta: number }
export const movers = (changes: SupplyChange[]): SupplyChange[] => changes.filter((r) => Math.abs(r.delta) >= 1e6).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || byId(a.id, b.id)).slice(0, 3);
export function moverSentence(row: SupplyChange, inputs: ReportSentence["inputs"]): ReportSentence {
  return { text: `${row.symbol}: ${money(row.delta, { signed: true })} reported USD supply value.`, inputs: [
    ...inputs, input("Coin ID", row.id), input("Previous USD supply value", row.previous), input("Current USD supply value", row.current),
    input("Change in USD supply value", row.delta), ...(row.previous > 0 && Number.isFinite(row.delta / row.previous) ? [input("Change (%)", pctChange(row.delta / row.previous))] : []),
  ] };
}

export function harbourReport(model: HarbourModel | null, payloads: HarbourPayloads, days: 1 | 7, nowMs: number): ReportSentence[] {
  const out: ReportSentence[] = [], window = days === 1 ? "24 hours" : "seven days";
  const sourceInputs = (key: EndpointKey) => {
    const installed = sourceTruth(model, key);
    const truth = installed.state === "current" ? endpointTruth(key, payloads[key], nowMs) : installed;
    return [input("Source", PHAROSVILLE_ENDPOINT_REGISTRY[key].path), input("Source updated (UTC)", dated(truth.sourceUpdatedAtMs)), input("Reading state", truthCopy({ kind: "reading", reading: READING_NAMES[key], truth }))];
  };
  const supplyInputs = [...sourceInputs("stablecoins"), input("Comparison bucket", days === 1 ? "circulatingPrevDay" : "circulatingPrevWeek"), input("Reported comparison window", window), input("Previous bucket observation time", "Not supplied by source")];
  if (currentSource(model, payloads, "stablecoins", nowMs)) {
    const rows = payloads.stablecoins!.data!.peggedAssets;
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    const changes: SupplyChange[] = [], omitted: CoinRow[] = [];
    for (const r of rows) {
      const previousBuckets = days === 1 ? r.circulatingPrevDay : r.circulatingPrevWeek;
      const current = completeSupply(r.circulating), previous = completeSupply(previousBuckets);
      if (counts.get(r.id) !== 1 || current == null || previous == null || !sameBuckets(r.circulating, previousBuckets) || !Number.isFinite(current - previous)) { omitted.push(r); continue; }
      changes.push({ id: r.id, symbol: r.symbol, current, previous, delta: current - previous });
    }
    const previous = changes.reduce((s, r) => s + r.previous, 0), current = changes.reduce((s, r) => s + r.current, 0), delta = current - previous;
    const evidence = [...supplyInputs, ...changes.map((r) => input(`${r.id}: previous/current USD supply value`, [r.previous, r.current]))];
    if (changes.length && Number.isFinite(previous) && Number.isFinite(current) && Number.isFinite(delta)) out.push({
      text: `Reported USD supply value changed by ${money(delta, { signed: true })} across ${changes.length} comparable coins.`,
      inputs: [...evidence, input("Previous total USD supply value", previous), input("Current total USD supply value", current), input("Change in USD supply value", delta),
        ...(previous > 0 && Number.isFinite(delta / previous) ? [input("Change (%)", pctChange(delta / previous))] : [])],
    });
    else out.push({ text: "Comparison unavailable.", inputs: evidence });
    for (const r of movers(changes)) out.push(moverSentence(r, supplyInputs));
    out.push({ text: `${omitted.length} coins lack a comparable reading.`, inputs: [...supplyInputs, input("Omitted coins", omitted.length), ...omitted.map((r) => input(r.id, { current: r.circulating, previous: days === 1 ? r.circulatingPrevDay ?? null : r.circulatingPrevWeek ?? null }))] });
  } else out.push({ text: "Comparison unavailable.", inputs: supplyInputs });

  const psiInputs = sourceInputs("stability");
  const stability = payloads.stability?.data;
  const cur = stability?.current;
  const rows = psiObservations([...(stability?.history ?? []), ...(cur?.computedAt != null ? [{ date: cur.computedAt, score: cur.score, methodologyVersion: cur.methodologyVersion ?? stability?.methodology?.version ?? null }] : [])]).filter((r) => r.date * 1000 <= nowMs);
  psiInputs.push(input("Current PSI", cur), ...rows.map((r) => input(`PSI at ${dated(r.date * 1000)}`, { score: r.score, methodology: r.methodologyVersion ?? null })));
  // History supplies no input-degradation evidence, so compatible coverage cannot be established.
  out.push({ text: ["PSI comparison unavailable.", qualificationCopy(payloads)].filter(Boolean).join(" "), inputs: psiInputs });

  const flowInputs = [...sourceInputs("mintBurn"), input("Reported window", window)];
  // The projected rows retain every field these formatters consume, but omit unrelated upstream block heights.
  const flows = model?.readings.flows, scope = flows?.scope ?? [], coins = (flows?.coins ?? []) as Array<CoinFlow & { stablecoinId: string }>;
  flowInputs.push(input("Reported chain IDs", scope));
  for (const r of coins) flowInputs.push(input(r.stablecoinId, { netFlow24hUsd: r.netFlow24hUsd, netFlow7dUsd: r.netFlow7dUsd, coverage: r.coverage ?? null, valuation: r.valuation ?? null }));
  const asOf = model?.truth.mintBurn.sourceUpdatedAtMs;
  const nets = coins.map((r) => coinNet(r, days, asOf == null ? null : asOf / 1000));
  const net = nets.every((v) => v != null && Number.isFinite(v)) ? nets.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
  const qualifiers = [...new Set(coins.flatMap((r) => {
    const coverage = coverageLine(r.coverage);
    const valuation = days === 1 ? r.valuation?.window24h.completeness : r.valuation?.netFlow7d;
    return [coverage, valuation === "partial" || (days === 1 ? r.netFlow24hUsd : r.netFlow7dUsd) == null ? NET_UNAVAILABLE : valuation !== "complete" ? VALUATION_UNKNOWN : null,
      days === 7 && (asOf == null || r.coverage?.historyStartAt == null || r.coverage.historyStartAt > asOf / 1000 - 7 * 86400) ? "Partial history" : null].filter((s): s is string => !!s);
  }))];
  const flowLine = !scope.length ? "Flow scope is unavailable." : !currentSource(model, payloads, "mintBurn", nowMs) || !coins.length ? "Flow reading unavailable."
    : net != null && Number.isFinite(net) ? `${money(net, { signed: true })} net flow.` : qualifiers.join(" ") || "Flow reading unavailable.";
  out.push({ text: `Reported flow across ${scope.length ? scope.map(scopeName).join(", ") : "an unavailable scope"} over ${window}: ${flowLine}`, inputs: flowInputs });
  return out;
}
