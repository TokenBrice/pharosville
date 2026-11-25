import DEAD_STABLECOINS from "virtual:pharosville-cemetery";
import LISTING_POLICY from "virtual:pharosville-listing-policy";
import brandColors from "../../../data/brand-colors.json";
import { logosById } from "../../lib/logos";
import { fnv1a, hashColor, hullClassFor, pierIdFor, rigFor } from "./classify";
import { asDewsBand, flowsReading, isMaiden, psiReading, seaStateReading, stormCones, stormFlags, tideFactsReading, weatherReading, weekAgoGapShare, wrecks } from "./readings";
import { allTruth } from "./truth";
import {
  isCoreBoat,
  isTokenizedFund,
  type Boat,
  type BoatState,
  type BuildOptions,
  type CircuitStop,
  type CoinRow,
  type FundMeta,
  type Harbour,
  type HarbourModel,
  type HarbourPayloads,
  type ReviewHoldEntry,
  type VariantSummary,
} from "./types";

/** At most this many pier stops per circuit (D10); the rest of the supply sails to the Far Ports. */
export const MAX_PIER_STOPS = 4;
/** A stop below this share is folded into the others. */
export const MIN_STOP_SHARE = 0.05;
/** Dock-time shares are quantized to this step so small supply drift does not re-plan the harbour. */
export const CIRCUIT_SHARE_STEP = 0.05;
export const DEFAULT_PIERED_CHAINS = 8;
export const FAR: string = "far";
export const RESERVE: string = "reserve";

const BRAND = brandColors as Record<string, string>;

const FUND_IDS = new Set(LISTING_POLICY.fundIds);
const REVIEW_HOLD_IDS = new Set(LISTING_POLICY.reviewHoldIds);
const VARIANT_IDS = new Set(LISTING_POLICY.variantIds);
const EXCLUDED_IDS = new Set(LISTING_POLICY.excludedIds);
const FROZEN_IDS = new Set(LISTING_POLICY.frozenIds);
const PARENT_OF_VARIANT = new Map<string, { parentId: string; meta: (typeof LISTING_POLICY.variantsByParent)[string][number] }>();
for (const [parentId, variants] of Object.entries(LISTING_POLICY.variantsByParent)) {
  for (const meta of variants) PARENT_OF_VARIANT.set(meta.id, { parentId, meta });
}

function sumBuckets(obj: Record<string, number> | null | undefined): number {
  if (!obj) return 0;
  let s = 0;
  for (const v of Object.values(obj)) if (typeof v === "number" && Number.isFinite(v)) s += v;
  return s;
}

function prevDaySupply(obj: Record<string, number> | null | undefined): number | null {
  if (obj == null) return null;
  const vals = Object.values(obj);
  return vals.length > 0 && vals.every((v) => Number.isFinite(v) && v >= 0) ? sumBuckets(obj) : null;
}

function sortedChainUsd(row: CoinRow): Array<[string, number]> {
  return Object.entries(row.chainCirculating ?? {})
    .map(([c, v]) => [c, typeof v?.current === "number" && v.current > 0 ? v.current : 0] as [string, number])
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
}

function brandColorOf(id: string): string {
  const brand = BRAND[id]?.split("|")[0];
  return brand && /^#[0-9a-f]{6}$/i.test(brand) ? brand.toLowerCase() : hashColor(id);
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

function fundMetaFor(a: CoinRow): FundMeta {
  const meta = LISTING_POLICY.funds[a.id];
  if (meta) {
    return {
      navToken: meta.navToken,
      pegCurrency: meta.pegCurrency,
      archetype: meta.archetype,
      backedIds: [...meta.backedIds],
      ...(meta.liveAdapterBackedIds ? { liveAdapterBackedIds: [...meta.liveAdapterBackedIds] } : {}),
    };
  }
  return {
    navToken: null,
    pegCurrency: a.pegType.replace(/^pegged/, "") || "USD",
    archetype: null,
    backedIds: [],
  };
}

/**
 * Payload → HarbourModel. Pure and deterministic in (payloads, nowMs, options).
 * Applies Policy 2.0 classification: core stablecoins trade in the harbour, tokenized funds anchor
 * in Reserve Anchorage outside core totals, and variants/review-hold/frozen/excluded rows stay off water.
 */
export function buildHarbourModel(payloads: HarbourPayloads, nowMs: number, options: BuildOptions = {}): HarbourModel {
  // Freshness is judged against wall time; nowMs is the simulation clock (equal in production, offset by dev pins).
  const truth = allTruth(payloads, options.truthNowMs ?? nowMs);
  const coins = payloads.stablecoins?.data?.peggedAssets ?? [];
  const peg = payloads.pegSummary?.data ?? null;
  const stress = payloads.stress?.data ?? null;
  const grades = payloads.safetyGrades?.data ?? null;
  const chainsPayload = payloads.chains?.data ?? null;
  const dead = options.dead ?? DEAD_STABLECOINS;
  const deadIds = new Set(dead.map((d) => d.id));

  const pegById = new Map((peg?.coins ?? []).map((c) => [c.id, c]));
  const gradeById = new Map((grades?.grades ?? []).map((g) => [g.id, g]));

  const coreRows: CoinRow[] = [];
  const fundRows: CoinRow[] = [];
  const variantsMap = new Map<string, VariantSummary[]>();
  const reviewHold: ReviewHoldEntry[] = [];
  let excludedCount = 0;

  for (const a of coins) {
    if (EXCLUDED_IDS.has(a.id) || /^\d+$/.test(a.id)) {
      excludedCount++;
      continue;
    }
    if (deadIds.has(a.id)) {
      coreRows.push(a);
      continue;
    }
    if (a.frozen === true || FROZEN_IDS.has(a.id)) {
      excludedCount++;
      continue;
    }
    if (VARIANT_IDS.has(a.id)) {
      excludedCount++;
      const info = PARENT_OF_VARIANT.get(a.id);
      if (info) {
        const list = variantsMap.get(info.parentId) ?? [];
        list.push({
          id: info.meta.id,
          symbol: info.meta.symbol,
          name: info.meta.name,
          kind: info.meta.kind,
          supply: sumBuckets(a.circulating),
        });
        variantsMap.set(info.parentId, list);
      }
      continue;
    }
    if (REVIEW_HOLD_IDS.has(a.id)) {
      excludedCount++;
      reviewHold.push({
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        supply: sumBuckets(a.circulating),
      });
      continue;
    }
    const gradeRow = gradeById.get(a.id);
    if (FUND_IDS.has(a.id) || Boolean(gradeRow?.notRatedReason?.startsWith("tokenized-fund"))) {
      fundRows.push(a);
      continue;
    }
    coreRows.push(a);
  }

  // Deterministic ordering for variantsByParent and reviewHold (supply desc, tie-break id asc)
  const bySupplyDesc = <T extends { id: string; supply: number }>(x: T, y: T) =>
    y.supply - x.supply || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  const variantsByParent: Record<string, VariantSummary[]> = {};
  for (const parentId of [...variantsMap.keys()].sort()) {
    variantsByParent[parentId] = variantsMap.get(parentId)!.sort(bySupplyDesc);
  }
  reviewHold.sort(bySupplyDesc);

  // Chain totals strictly from core stablecoins, so circuits, harbours and /api/chains reconcile
  const chainTot = new Map<string, number>();
  for (const a of coreRows) {
    for (const [c, v] of Object.entries(a.chainCirculating ?? {})) {
      const cur = v?.current;
      if (typeof cur === "number" && cur > 0) chainTot.set(c, (chainTot.get(c) ?? 0) + cur);
    }
  }
  const byChainSupply = [...chainTot.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const pieredList = options.pieredChains ?? byChainSupply.slice(0, DEFAULT_PIERED_CHAINS).map(([c]) => c);
  const piered = new Set(pieredList);

  const coinsCurrent = truth.stablecoins.state === "current";
  const gapShare = weekAgoGapShare(coreRows.filter((a) => !deadIds.has(a.id)));

  const coreBoats: Boat[] = coreRows.map((a) => {
    const supply = sumBuckets(a.circulating);
    const chainUsd = sortedChainUsd(a);
    const attributed = chainUsd.reduce((s, [, v]) => s + v, 0);
    const circuit = circuitFor(chainUsd, supply, a.chains ?? [], piered);
    const p = pegById.get(a.id);
    const sig = stress?.signals?.[a.id];
    const gradeRow = gradeById.get(a.id);
    const activeDepeg = p?.activeDepeg === true;
    const state: BoatState = deadIds.has(a.id) ? "wrecked" : activeDepeg ? "shoals" : circuit.length === 1 ? "moored" : "circuit";
    return {
      id: a.id,
      symbol: a.symbol,
      name: a.name,
      supply,
      supplyPrevDay: prevDaySupply(a.circulatingPrevDay),
      hullClass: hullClassFor(supply),
      rig: rigFor(a.pegType),
      pegType: a.pegType,
      brandColor: brandColorOf(a.id),
      logo: logosById[a.id] ?? null,
      chainShares: chainUsd.map(([chain, usd]) => ({ chain, usd, share: attributed > 0 ? usd / attributed : 0 })),
      circuit,
      home: circuit.reduce((best, s) => (s.share > best.share ? s : best), circuit[0]).where,
      pegDeviationBps: p && typeof p.currentDeviationBps === "number" ? p.currentDeviationBps : null,
      activeDepeg,
      nullPeg: !p || typeof p.currentDeviationBps !== "number",
      dews: asDewsBand(sig?.band),
      dewsScore: typeof sig?.score === "number" ? sig.score : null,
      grade: gradeRow?.grade ?? null,
      ratingStatus: gradeRow?.ratingStatus ?? null,
      gradeReason: gradeRow?.notRatedReason ?? null,
      listingClass: "core-stablecoin",
      fundMeta: null,
      state,
      maiden: state !== "wrecked" && isMaiden(a, coinsCurrent, gapShare),
      stormSignal: null,
    };
  });

  const reserveBoats: Boat[] = fundRows.map((a) => {
    const supply = sumBuckets(a.circulating);
    const chainUsd = sortedChainUsd(a);
    const attributed = chainUsd.reduce((s, [, v]) => s + v, 0);
    const gradeRow = gradeById.get(a.id);
    // Reserve Anchorage slots are authored to the `large` (18 m) envelope; cap $10B+ funds at `large` so adjacent hulls never collide.
    const rawCls = hullClassFor(supply);
    const hullClass = rawCls === "flagship" ? "large" : rawCls;
    return {
      id: a.id,
      symbol: a.symbol,
      name: a.name,
      supply,
      supplyPrevDay: prevDaySupply(a.circulatingPrevDay),
      hullClass,
      rig: rigFor(a.pegType),
      pegType: a.pegType,
      brandColor: brandColorOf(a.id),
      logo: logosById[a.id] ?? null,
      chainShares: chainUsd.map(([chain, usd]) => ({ chain, usd, share: attributed > 0 ? usd / attributed : 0 })),
      circuit: [{ chain: null, where: RESERVE, share: 1, rawShare: 1 }],
      home: RESERVE,
      pegDeviationBps: null,
      activeDepeg: false,
      nullPeg: true,
      dews: null,
      dewsScore: null,
      grade: gradeRow?.grade ?? "NR",
      ratingStatus: gradeRow?.ratingStatus ?? "not-rated",
      gradeReason: gradeRow?.notRatedReason ?? "tokenized-fund-not-graded",
      listingClass: "tokenized-fund",
      fundMeta: fundMetaFor(a),
      state: "reserve",
      maiden: false,
      stormSignal: null,
    };
  });

  const boats: Boat[] = [...coreBoats, ...reserveBoats];
  boats.sort(bySupplyDesc);

  const grand = byChainSupply.reduce((s, [, v]) => s + v, 0);
  const visitors = new Map<string, number>();
  for (const b of coreBoats) for (const s of b.circuit) if (s.chain) visitors.set(s.chain, (visitors.get(s.chain) ?? 0) + 1);
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

  const liveCore = boats.filter((b) => isCoreBoat(b) && b.state !== "wrecked");
  const liveCoreIds = new Set(liveCore.map((b) => b.id));
  const flags = coinsCurrent ? stormFlags(liveCore, truth.stress) : [];
  const flagById = new Map(flags.map((f) => [f.id, f.shape]));
  for (const b of boats) b.stormSignal = isCoreBoat(b) ? (flagById.get(b.id) ?? null) : null;
  const planKey = planKeyOf(boats);
  return {
    builtAtMs: nowMs,
    planKey,
    boats,
    harbours,
    readings: {
      psi: psiReading(payloads.stability?.data ?? null, truth.stability),
      tide: tideFactsReading(chainsPayload, truth.chains),
      seaState: seaStateReading(liveCore, peg != null, truth.pegSummary),
      weather: weatherReading(liveCore, stress != null, truth.stress),
      flows: flowsReading(payloads.mintBurn?.data ?? null, truth.mintBurn, liveCoreIds),
      stormCones: stormCones(liveCore, stress != null),
      stormFlags: flags,
      shoals: liveCore.filter((b) => b.activeDepeg).map((b) => ({ id: b.id, bps: b.pegDeviationBps, supply: b.supply })),
      wrecks: wrecks(dead),
    },
    truth,
    payloadCount: boats.length,
    supplyTotal: coreBoats.reduce((s, b) => s + b.supply, 0),
    coreCount: liveCore.length,
    reserveCount: reserveBoats.length,
    reserveSupplyTotal: reserveBoats.reduce((s, b) => s + b.supply, 0),
    variantsByParent,
    reviewHold,
    excludedCount,
    hasFleet: payloads.stablecoins?.data != null,
  };
}

/**
 * Everything that shapes the sailing plan: ids, hull classes, rig families, quantized circuits and whether a
 * hull is wrecked or in Reserve Anchorage. Peg state is deliberately absent: a boat on the Shoals keeps its reservations.
 */
function planKeyOf(boats: Boat[]): string {
  const parts: string[] = [];
  for (const b of boats) {
    const flag = b.state === "wrecked" ? "w" : isTokenizedFund(b) ? "r" : "";
    parts.push(`${b.id}:${b.hullClass}:${b.rig}:${flag}:${b.circuit.map((s) => `${s.where}=${Math.round(s.share * 100)}`).join(",")}`);
  }
  const s = parts.join("|");
  return `${boats.length}-${fnv1a(s).toString(16)}-${fnv1a("#" + s).toString(16)}`;
}
