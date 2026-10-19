import DEAD_STABLECOINS from "virtual:pharosville-cemetery";
import brandColors from "../../../data/brand-colors.json";
import { logosById } from "../../lib/logos";
import { fnv1a, hashColor, hullClassFor, pierIdFor, rigFor } from "./classify";
import { asDewsBand, flowsReading, psiReading, seaStateReading, stormCones, weatherReading, wrecks } from "./readings";
import { allTruth } from "./truth";
import type { Boat, BoatState, BuildOptions, CircuitStop, Harbour, HarbourModel, HarbourPayloads } from "./types";

/** At most this many pier stops per circuit (D10); the rest of the supply sails to the Far Ports. */
export const MAX_PIER_STOPS = 4;
/** A stop below this share is folded into the others. */
export const MIN_STOP_SHARE = 0.05;
/** Dock-time shares are quantized to this step so small supply drift does not re-plan the harbour. */
export const CIRCUIT_SHARE_STEP = 0.05;
export const DEFAULT_PIERED_CHAINS = 8;
export const FAR: string = "far";

const BRAND = brandColors as Record<string, string>;

function sumBuckets(obj: Record<string, number> | null | undefined): number {
  if (!obj) return 0;
  let s = 0;
  for (const v of Object.values(obj)) if (typeof v === "number" && Number.isFinite(v)) s += v;
  return s;
}

/** Largest-remainder quantization to `step`, every stop keeping at least one step. */
export function quantizeShares(shares: number[], step = CIRCUIT_SHARE_STEP): number[] {
  const units = Math.round(1 / step);
  const raw = shares.map((s) => s * units);
  const q = raw.map((r) => Math.max(1, Math.floor(r)));
  let left = units - q.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) q[order[k][1]]++;
  while (left < 0) { // too many minimum steps: take from the largest
    let mi = 0;
    for (let i = 1; i < q.length; i++) if (q[i] > q[mi]) mi = i;
    q[mi]--; left++;
  }
  return q.map((v) => v / units);
}

function circuitFor(chainUsd: Array<[string, number]>, supply: number, chains: readonly string[], piered: Set<string>): CircuitStop[] {
  const attributed = chainUsd.reduce((a, [, v]) => a + v, 0);
  if (attributed <= 0) {
    const home = chains.find((c) => piered.has(c));
    return [{ chain: home ?? null, where: home ? pierIdFor(home) : FAR, share: 1, rawShare: 1 }];
  }
  const tot = Math.max(supply, attributed);
  const pierShares = chainUsd.filter(([c]) => piered.has(c)).map(([c, v]) => [c, v / tot] as const);
  const kept = pierShares.slice(0, MAX_PIER_STOPS).filter(([, s]) => s >= MIN_STOP_SHARE);
  const far = 1 - kept.reduce((a, [, s]) => a + s, 0);
  let cand: Array<[string | null, number]> = kept.map(([c, s]) => [c, s]);
  if (far >= MIN_STOP_SHARE) cand.push([null, far]);
  if (cand.length === 0) cand = pierShares.length ? [[pierShares[0][0], 1]] : [[null, 1]];
  const z = cand.reduce((a, [, s]) => a + s, 0);
  cand.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const q = quantizeShares(cand.map(([, s]) => s / z));
  return cand.map(([c, s], i) => ({ chain: c, where: c ? pierIdFor(c) : FAR, share: q[i], rawShare: s / z }));
}

/**
 * Payload → HarbourModel. Pure and deterministic in (payloads, nowMs, options).
 * Eligibility comes from the payload alone: every coin in /api/stablecoins is a boat.
 */
export function buildHarbourModel(payloads: HarbourPayloads, nowMs: number, options: BuildOptions = {}): HarbourModel {
  const truth = allTruth(payloads, nowMs);
  const coins = payloads.stablecoins?.data?.peggedAssets ?? [];
  const peg = payloads.pegSummary?.data ?? null;
  const stress = payloads.stress?.data ?? null;
  const grades = payloads.safetyGrades?.data ?? null;
  const chainsPayload = payloads.chains?.data ?? null;
  const dead = options.dead ?? DEAD_STABLECOINS;
  const deadIds = new Set(dead.map((d) => d.id));

  // chain totals from the coins themselves, so circuits and harbours reconcile
  const chainTot = new Map<string, number>();
  for (const a of coins) {
    for (const [c, v] of Object.entries(a.chainCirculating ?? {})) {
      const cur = v?.current;
      if (typeof cur === "number" && cur > 0) chainTot.set(c, (chainTot.get(c) ?? 0) + cur);
    }
  }
  const byChainSupply = [...chainTot.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const pieredList = options.pieredChains ?? byChainSupply.slice(0, DEFAULT_PIERED_CHAINS).map(([c]) => c);
  const piered = new Set(pieredList);

  const pegById = new Map((peg?.coins ?? []).map((c) => [c.id, c]));
  const gradeById = new Map((grades?.grades ?? []).map((g) => [g.id, g.grade]));

  const boats: Boat[] = coins.map((a) => {
    const supply = sumBuckets(a.circulating);
    const chainUsd = Object.entries(a.chainCirculating ?? {})
      .map(([c, v]) => [c, typeof v?.current === "number" && v.current > 0 ? v.current : 0] as [string, number])
      .filter(([, v]) => v > 0)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
    const attributed = chainUsd.reduce((s, [, v]) => s + v, 0);
    const circuit = circuitFor(chainUsd, supply, a.chains ?? [], piered);
    const p = pegById.get(a.id);
    const sig = stress?.signals?.[a.id];
    const activeDepeg = p?.activeDepeg === true;
    const state: BoatState = deadIds.has(a.id) ? "wrecked" : activeDepeg ? "shoals" : circuit.length === 1 ? "moored" : "circuit";
    const brand = BRAND[a.id]?.split("|")[0];
    return {
      id: a.id,
      symbol: a.symbol,
      name: a.name,
      supply,
      hullClass: hullClassFor(supply),
      rig: rigFor(a.pegType),
      pegType: a.pegType,
      brandColor: brand && /^#[0-9a-f]{6}$/i.test(brand) ? brand.toLowerCase() : hashColor(a.id),
      logo: logosById[a.id] ?? null,
      chainShares: chainUsd.map(([chain, usd]) => ({ chain, usd, share: attributed > 0 ? usd / attributed : 0 })),
      circuit,
      home: circuit.reduce((best, s) => (s.share > best.share ? s : best), circuit[0]).where,
      pegDeviationBps: p && typeof p.currentDeviationBps === "number" ? p.currentDeviationBps : null,
      activeDepeg,
      nullPeg: !p || typeof p.currentDeviationBps !== "number",
      dews: asDewsBand(sig?.band),
      dewsScore: typeof sig?.score === "number" ? sig.score : null,
      grade: gradeById.get(a.id) ?? null,
      state,
    };
  });
  boats.sort((a, b) => b.supply - a.supply || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const grand = byChainSupply.reduce((s, [, v]) => s + v, 0);
  const visitors = new Map<string, number>();
  for (const b of boats) for (const s of b.circuit) if (s.chain) visitors.set(s.chain, (visitors.get(s.chain) ?? 0) + 1);
  const chainRows = new Map((chainsPayload?.chains ?? []).map((c) => [c.name, c]));
  const harbours: Harbour[] = byChainSupply.map(([chain, usd]) => {
    const row = chainRows.get(chain);
    return {
      chain,
      where: piered.has(chain) ? pierIdFor(chain) : FAR,
      piered: piered.has(chain),
      supplyUsd: usd,
      share: grand > 0 ? usd / grand : 0,
      visitors: visitors.get(chain) ?? 0,
      chainsTotalUsd: row && Number.isFinite(Number(row.totalUsd)) ? Number(row.totalUsd) : null,
      healthScore: row?.healthScore ?? null,
    };
  });

  const live = boats.filter((b) => b.state !== "wrecked");
  const planKey = planKeyOf(boats);
  return {
    builtAtMs: nowMs,
    planKey,
    boats,
    harbours,
    readings: {
      psi: psiReading(payloads.stability?.data ?? null, truth.stability),
      seaState: seaStateReading(live, peg != null, truth.pegSummary),
      weather: weatherReading(live, stress != null, truth.stress),
      flows: flowsReading(payloads.mintBurn?.data ?? null, truth.mintBurn),
      stormCones: stormCones(live, stress != null),
      shoals: live.filter((b) => b.activeDepeg).map((b) => ({ id: b.id, bps: b.pegDeviationBps, supply: b.supply })),
      wrecks: wrecks(dead),
    },
    truth,
    payloadCount: coins.length,
    supplyTotal: boats.reduce((s, b) => s + b.supply, 0),
    hasFleet: payloads.stablecoins?.data != null,
  };
}

/**
 * Everything that shapes the sailing plan: ids, hull classes, quantized circuits and whether a
 * hull is wrecked. Peg state is deliberately absent: a boat on the Shoals keeps its reservations.
 */
function planKeyOf(boats: Boat[]): string {
  const parts: string[] = [];
  for (const b of boats) {
    parts.push(`${b.id}:${b.hullClass}:${b.state === "wrecked" ? "w" : ""}:${b.circuit.map((s) => `${s.where}=${Math.round(s.share * 100)}`).join(",")}`);
  }
  const s = parts.join("|");
  return `${boats.length}-${fnv1a(s).toString(16)}-${fnv1a("#" + s).toString(16)}`;
}
