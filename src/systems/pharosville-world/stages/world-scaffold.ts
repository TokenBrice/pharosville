import { RUNTIME_CEMETERY_ENTRIES } from "@shared/lib/cemetery-runtime";
import { resolveChainId } from "@shared/lib/chains";
import { PSI_HEX_COLORS } from "@shared/lib/psi-colors";
import type { StabilityIndexResponse } from "@shared/types";
import { getCirculatingRaw } from "@/lib/supply";
import type { ChainSummary } from "@shared/types/chains";
import { buildGardenMonthRecord } from "../../garden-month-record";
import { buildLongRecord, type LongRecordDeath } from "../../long-record";
import { buildChainDocks } from "../../chain-docks";
import { buildSupplyTide } from "../../supply-tide";
import {
  buildPharosVilleMap,
  graveNodesFromEntries,
  LIGHTHOUSE_TILE,
  PIGEON_ISLAND_CENTER,
} from "../../world-layout";
import {
  SHIP_RISK_PLACEMENTS,
  WRECK_SHOAL_AREA,
  riskWaterAreaForPlacement,
} from "../../risk-water-areas";
import { countShipsByRiskPlacement } from "./ship-placement";
import { observationEpochMs, rowSourceEvidence } from "../../source-evidence";
import type {
  DewsAreaBand,
  DockNode,
  LighthouseBeamDwell,
  LighthouseHighWaterMark,
  LighthouseNode,
  PharosVilleWorld,
  PharosVilleSourceStatus,
  PigeonnierNode,
  ShipNode,
  SignalMastNode,
} from "../../world-types";
import {
  HIGH_WATER_MARK_WINDOW_DAYS,
  psiBandSeverity,
  SIGNAL_MAST_LEADER_COUNT,
  SIGNAL_MAST_MAX_PENNANTS,
  SIGNAL_MAST_STORM_SUPPLY_SHARE,
} from "../../world-types";
import type {
  BuildWorldScaffoldStage,
  PharosVilleInputs,
} from "../pipeline-types";

function toEpochMs(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value < 10_000_000_000 ? value * 1000 : value;
}

export function resolveGeneratedAt(inputs: PharosVilleInputs): number | null {
  const explicitGeneratedAt = toEpochMs(inputs.generatedAt);
  if (explicitGeneratedAt !== null) return explicitGeneratedAt;

  const candidates = [
    inputs.chains?.updatedAt,
    inputs.stability?.current?.computedAt,
    inputs.stability?.methodology?.asOf,
    inputs.pegSummary?.methodology?.asOf,
    inputs.stress?.updatedAt,
    inputs.safetyGrades?.updatedAt,
    inputs.mintBurn?.updatedAt,
    ...Object.values(inputs.freshness).map((status) => status.publishedAt),
  ]
    .map(toEpochMs)
    .filter((value): value is number => value !== null);

  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function isConditionBand(value: string | null | undefined): value is keyof typeof PSI_HEX_COLORS {
  return !!value && value in PSI_HEX_COLORS;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

type StabilityCurrent = NonNullable<StabilityIndexResponse["current"]>;

function lighthouseComponents(current: StabilityCurrent | null): LighthouseNode["components"] | undefined {
  const severity = finiteNumber(current?.components?.severity);
  const breadth = finiteNumber(current?.components?.breadth);
  const trend = finiteNumber(current?.components?.trend);
  if (severity === null || breadth === null || trend === null) return undefined;
  const stressBreadth = finiteNumber(current?.components?.stressBreadth);
  return {
    severity,
    breadth,
    ...(stressBreadth !== null ? { stressBreadth } : {}),
    trend,
  };
}

function lighthouseContributors(current: StabilityCurrent | null): LighthouseNode["contributors"] | undefined {
  const contributors = (current?.contributors ?? []).flatMap((contributor) => {
    const id = nonEmptyString(contributor.id);
    const symbol = nonEmptyString(contributor.symbol);
    const bps = finiteNumber(contributor.bps);
    const mcapUsd = finiteNumber(contributor.mcapUsd);
    if (!id || !symbol || bps === null || mcapUsd === null) return [];
    const ageDays = finiteNumber(contributor.ageDays);
    const factor = finiteNumber(contributor.factor);
    return [{
      id,
      symbol,
      bps,
      mcapUsd,
      ...(ageDays !== null ? { ageDays } : {}),
      ...(factor !== null ? { factor } : {}),
    }];
  }).slice(0, 5);
  return contributors.length > 0 ? contributors : undefined;
}

function buildPigeonnier(): PigeonnierNode {
  return {
    id: "pigeonnier",
    kind: "pigeonnier",
    label: "Pigeonnier",
    tile: { ...PIGEON_ISLAND_CENTER },
    detailId: "pigeonnier",
    notableMovers: [],
    roost: {
      capped: false,
      comparison: null,
      eventsToday: null,
      eventsYesterday: null,
      visualCount: 0,
    },
  };
}

function buildLighthouse(
  stability: StabilityIndexResponse | null | undefined,
  pegSummary: PharosVilleInputs["pegSummary"],
  stablecoins: PharosVilleInputs["stablecoins"],
  deaths: readonly LongRecordDeath[],
  source: PharosVilleSourceStatus,
): LighthouseNode {
  const current = stability?.current ?? null;
  const band = current?.band ?? null;
  const components = lighthouseComponents(current);
  const avg24h = finiteNumber(current?.avg24h);
  const avg24hBand = nonEmptyString(current?.avg24hBand);
  const contributors = lighthouseContributors(current);
  const beamDwell = buildBeamDwell(contributors);
  const degraded = current?.inputDegradation?.dewsUnavailable || current?.inputDegradation?.depegEventsUnavailable;
  const psiEvidence = rowSourceEvidence("stability", degraded ? { ...source, state: "stale", reason: "PSI inputs degraded" } : source, {
    available: !!current && isConditionBand(band),
    observedAt: observationEpochMs(current?.computedAt),
    methodologyVersion: current?.methodologyVersion ?? null,
    coverage: { state: current ? "complete" : "unknown" },
    reason: current ? null : "PSI reading missing",
  });
  return {
    id: "lighthouse",
    kind: "lighthouse",
    label: "Pharos lighthouse",
    tile: { ...LIGHTHOUSE_TILE },
    psiBand: band,
    score: finiteNumber(current?.score),
    ...(components ? { components } : {}),
    ...(avg24h !== null ? { avg24h } : {}),
    ...(avg24hBand ? { avg24hBand } : {}),
    ...(contributors ? { contributors } : {}),
    color: isConditionBand(band) ? PSI_HEX_COLORS[band] : "#8aa0a6",
    unavailable: !current || !isConditionBand(band),
    evidence: { stability: psiEvidence },
    ...(current?.inputDegradation ? { inputDegradation: current.inputDegradation } : {}),
    detailId: "lighthouse",
    lastFleetDepegAt: lastFleetDepegAt(pegSummary),
    signalMast: buildSignalMast(pegSummary, stablecoins),
    highWaterMark: buildHighWaterMark(stability),
    gardenMonthRecord: buildGardenMonthRecord(stability, source),
    longRecord: buildLongRecord(stability, deaths),
    ...(beamDwell ? { beamDwell } : {}),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The worst PSI band of the trailing window, for the lighthouse Worst band, 30d row.
 *
 * The window is measured back from the NEWEST point in the history, not from
 * the wall clock. A producer that stopped writing a week ago should still show
 * the mark it left; anchoring on `Date.now()` would quietly erase the record as
 * the payload aged, which is the opposite of what a high-water mark is for.
 * `spanDays` then carries how much window there really was, so the DOM can say
 * "9 days on record" instead of implying thirty.
 *
 * Ties break toward the OLDER point: the mark is where the sea first reached,
 * and a later touch of the same band did not raise it.
 */
export function buildHighWaterMark(
  stability: StabilityIndexResponse | null | undefined,
): LighthouseHighWaterMark {
  const points = (stability?.history ?? []).flatMap((point) => {
    const at = toEpochMs(point.date);
    const severity = psiBandSeverity(point.band);
    // A point whose band this build does not recognize is dropped rather than
    // ranked: an unknown band is not a calm one.
    if (at === null || severity === null) return [];
    return [{ at, severity, band: point.band, score: finiteNumber(point.score) }];
  });
  if (points.length === 0) {
    return {
      band: null,
      severity: null,
      score: null,
      at: null,
      sampleCount: 0,
      spanDays: 0,
      unavailable: true,
    };
  }

  const newest = Math.max(...points.map((point) => point.at));
  const cutoff = newest - HIGH_WATER_MARK_WINDOW_DAYS * DAY_MS;
  const inWindow = points.filter((point) => point.at >= cutoff);
  const oldest = Math.min(...inWindow.map((point) => point.at));
  let worst = inWindow[0]!;
  for (const point of inWindow) {
    if (point.severity > worst.severity || (point.severity === worst.severity && point.at < worst.at)) {
      worst = point;
    }
  }
  return {
    band: worst.band,
    severity: worst.severity,
    score: worst.score,
    at: worst.at,
    sampleCount: inWindow.length,
    spanDays: Math.round((newest - oldest) / DAY_MS),
    unavailable: false,
  };
}

/**
 * The ship the beam settles toward: the largest PSI contributor.
 *
 * `contributors` arrives ordered by contribution — that ordering is what the
 * existing "Top PSI contributors" panel list and ledger clause have always
 * presented, so taking the head keeps the beam pointing at the same coin the
 * DOM already names first. Re-sorting here on `bps` would be a second, quietly
 * different answer to the same question.
 */
export function buildBeamDwell(
  contributors: LighthouseNode["contributors"],
): LighthouseBeamDwell | undefined {
  const top = contributors?.[0];
  if (!top) return undefined;
  return { shipId: top.id, symbol: top.symbol, bps: top.bps };
}

/**
 * Fleet-wide peg condition for the observatory hoist (O17b).
 *
 * The peg readings are WEIGHED by circulating supply before they reach the
 * cloth: the pennants count the `SIGNAL_MAST_LEADER_COUNT` largest tracked
 * coins that are off peg, and the storm cone flies only when the coins off peg
 * hold at least `SIGNAL_MAST_STORM_SUPPLY_SHARE` of tracked supply. Counting
 * every depeg, and hoisting the cone on the single worst deviation, kept the
 * mast saturated on calm days — nineteen dust coins and one tiny
 * precious-metal coin read as a storm over a BEDROCK harbour.
 *
 * "Tracked" is the peg summary's own coin list; supply comes from the
 * stablecoin list by id. Absent summary is NOT calm — a mast with nothing to go
 * on stands bare and says so, because a bare mast that means "all clear" and a
 * bare mast that means "no dispatches arrived" cannot be told apart by looking.
 * A summary with no supply to weigh it against stands bare the same way
 * (`leaderCount` 0), and the Signal mast row says which.
 */
export function buildSignalMast(
  pegSummary: PharosVilleInputs["pegSummary"],
  stablecoins: PharosVilleInputs["stablecoins"],
): SignalMastNode {
  const summary = pegSummary?.summary ?? null;
  if (!summary) {
    return {
      activeDepegCount: 0,
      leaderCount: 0,
      leadersOffPeg: [],
      pennantCount: 0,
      capped: false,
      offPegSupplyShare: null,
      stormCone: false,
      worstBps: null,
      worstSymbol: null,
      medianDeviationBps: null,
      coinsAtPeg: null,
      totalTracked: null,
      eventsToday: null,
      unavailable: true,
    };
  }

  const supplyById = new Map<string, number>();
  for (const asset of stablecoins?.peggedAssets ?? []) {
    const supply = getCirculatingRaw(asset);
    if (Number.isFinite(supply) && supply > 0) supplyById.set(asset.id, supply);
  }
  const weighed = (pegSummary?.coins ?? []).flatMap((coin) => {
    const supply = supplyById.get(coin.id);
    return supply === undefined ? [] : [{ coin, supply }];
  });
  // Largest first; ties by id so a refresh cannot reshuffle the hoist.
  weighed.sort((left, right) => right.supply - left.supply || left.coin.id.localeCompare(right.coin.id));

  let trackedSupply = 0;
  let offPegSupply = 0;
  for (const { coin, supply } of weighed) {
    trackedSupply += supply;
    if (coin.activeDepeg) offPegSupply += supply;
  }
  const leaders = weighed.slice(0, SIGNAL_MAST_LEADER_COUNT);
  const leadersOffPeg = leaders
    .filter(({ coin }) => coin.activeDepeg)
    .map(({ coin }) => nonEmptyString(coin.symbol) ?? coin.id);
  const offPegSupplyShare = trackedSupply > 0 ? offPegSupply / trackedSupply : null;

  return {
    activeDepegCount: Math.max(0, Math.trunc(finiteNumber(summary.activeDepegCount) ?? 0)),
    leaderCount: leaders.length,
    leadersOffPeg,
    pennantCount: Math.min(leadersOffPeg.length, SIGNAL_MAST_MAX_PENNANTS),
    capped: leadersOffPeg.length > SIGNAL_MAST_MAX_PENNANTS,
    offPegSupplyShare,
    stormCone: offPegSupplyShare !== null && offPegSupplyShare >= SIGNAL_MAST_STORM_SUPPLY_SHARE,
    worstBps: finiteNumber(summary.worstCurrent?.bps),
    worstSymbol: nonEmptyString(summary.worstCurrent?.symbol),
    medianDeviationBps: finiteNumber(summary.medianDeviationBps),
    coinsAtPeg: finiteNumber(summary.coinsAtPeg),
    totalTracked: finiteNumber(summary.totalTracked),
    eventsToday: finiteNumber(summary.depegEventsToday),
    unavailable: false,
  };
}

/** Most recent depeg event across the tracked fleet, epoch ms, or null. */
function lastFleetDepegAt(pegSummary: PharosVilleInputs["pegSummary"]): number | null {
  let latest: number | null = null;
  for (const coin of pegSummary?.coins ?? []) {
    const at = toEpochMs(coin.lastEventAt);
    if (at !== null && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

function areaIdForRiskWaterPlacement(placement: ShipNode["riskPlacement"], band: DewsAreaBand | null): string {
  return band ? `area.dews.${band.toLowerCase()}` : `area.risk-water.${placement}`;
}

function sourceFieldsForRiskWaterPlacement(placement: ShipNode["riskPlacement"], band: DewsAreaBand | null): string[] {
  if (band) return ["pegSummary.coins[]", "stress.signals[]", "freshness"];
  if (placement === "ledger-mooring") return ["meta.flags.navToken", "pegSummary.coins[]", "stress.signals[]"];
  return ["pegSummary.coins[]", "stress.signals[]"];
}

// Panel-facing prose, in the harbor's voice rather than the renderer's: the
// water style and band key stay in the fact rows and the ledger.
function summaryForRiskWaterPlacement(placement: ShipNode["riskPlacement"], band: DewsAreaBand | null): string {
  const area = riskWaterAreaForPlacement(placement);
  if (band) return `${area.label} — ${area.reading}. Ships whose evidence reads ${band} ride at anchor here.`;
  if (placement === "ledger-mooring") return "Ledger Mooring holds NAV-priced ledger assets, moored where attestation rather than the market peg sets the price. A coin can moor here and still carry peg or early-warning rows.";
  return `${area.label} — ${area.reading}.`;
}

function buildAreas(shipCountsByRiskPlacement: ReadonlyMap<ShipNode["riskPlacement"], number>): PharosVilleWorld["areas"] {
  const riskAreas = SHIP_RISK_PLACEMENTS.map((placement) => {
    const riskWaterArea = riskWaterAreaForPlacement(placement);
    const band = riskWaterArea.band;
    const id = areaIdForRiskWaterPlacement(placement, band);
    const sourceFields = sourceFieldsForRiskWaterPlacement(placement, band);
    return {
      id,
      kind: "area" as const,
      label: riskWaterArea.label,
      tile: riskWaterArea.labelTile,
      ...(band ? { band } : {}),
      count: band ? shipCountsByRiskPlacement.get(placement) ?? 0 : null,
      detailId: id,
      facts: [
        { label: "Water style", value: riskWaterArea.waterStyle },
        { label: "Source", value: sourceFields.join(", ") },
      ],
      links: [{
        label: placement === "ledger-mooring" ? "Stablecoins" : "DEWS",
        href: placement === "ledger-mooring" ? "/stablecoins/" : "/depeg/",
      }],
      riskPlacement: placement,
      riskZone: riskWaterArea.motionZone,
      sourceFields,
      summary: summaryForRiskWaterPlacement(placement, band),
    };
  });
  return [
    ...riskAreas,
    {
      id: WRECK_SHOAL_AREA.id,
      kind: "area" as const,
      label: WRECK_SHOAL_AREA.label,
      tile: WRECK_SHOAL_AREA.labelTile,
      detailId: WRECK_SHOAL_AREA.id,
      facts: [
        { label: "Water style", value: WRECK_SHOAL_AREA.waterStyle },
        { label: "Source", value: WRECK_SHOAL_AREA.sourceFields.join(", ") },
      ],
      links: [{ label: "Cemetery", href: "/cemetery/" }],
      sourceFields: [...WRECK_SHOAL_AREA.sourceFields],
      summary: `${WRECK_SHOAL_AREA.label} — ${WRECK_SHOAL_AREA.reading}. The stone garden on its south shore keeps one stone for every coin that died; the area itself is not a live-ship risk placement.`,
    },
  ];
}

// P3 metaphor quick-win, extended for Tier 3 #13: ride the per-chain readings
// the dock cares about on the dock node itself, so `detailForDock`, the ledger
// and the render cues read one field each instead of re-joining the chains
// payload. `change24hPct` / `change7dPct` arrived in the browser from the first
// build and drove nothing until this.
function withChainSignals(docks: DockNode[], chains: PharosVilleInputs["chains"]): DockNode[] {
  const byChainId = new Map((chains?.chains ?? []).map((chain) => [chain.id, chain] as const));
  return docks.map((dock) => {
    const chain = byChainId.get(dock.chainId);
    return {
      ...dock,
      backingDiversity: chain?.healthFactors?.backingDiversity ?? null,
      healthFactors: chain?.healthFactors ?? null,
      change24hPct: Number.isFinite(chain?.change24hPct) ? chain!.change24hPct : null,
      change7dPct: Number.isFinite(chain?.change7dPct) ? chain!.change7dPct : null,
    };
  });
}

// The chains payload is the one door raw upstream chain ids walk through, and
// every consumer below keys on `chain.id`: `buildChainDocks` (slot binding,
// suppression, cap rank), `withChainSignals` above (this file's own join) and
// `buildSupplyTide`. Upstream aliases (`hyperliquid-l1`, `OP Mainnet`) would
// otherwise put one chain on a different berth, a different flag dye and —
// worst of the four reproduced defects — a harbour no ship ever moors at,
// depending on which spelling the feed chose that day. So every id
// canonicalises exactly once, here, and all three consumers receive the same
// normalized object. Normalizing only one consumer is worse than none: the
// `withChainSignals` join is self-consistent today precisely because both
// sides read the same raw payload.
//
// `?? chain.id` is load-bearing: `resolveChainId` returns null for anything
// outside `CHAIN_META`, and the API names ~90 chains while `CHAIN_META` lists
// far fewer. Dropping the unlisted would silently shrink harbor eligibility
// and the supply totals, so an unknown id passes through raw.
function normalizeChainsResponse(chains: PharosVilleInputs["chains"]): PharosVilleInputs["chains"] {
  if (!chains) return chains;

  const survivorByCanonicalId = new Map<string, ChainSummary>();
  const rawIdsByCanonicalId = new Map<string, string[]>();
  for (const chain of chains.chains) {
    const canonicalId = resolveChainId(chain.id) ?? chain.id;
    const incumbent = survivorByCanonicalId.get(canonicalId);
    if (incumbent) survivorByCanonicalId.set(canonicalId, survivesAliasCollapse(incumbent, chain, canonicalId));
    else survivorByCanonicalId.set(canonicalId, chain);
    const rawIds = rawIdsByCanonicalId.get(canonicalId);
    if (rawIds) rawIds.push(chain.id);
    else rawIdsByCanonicalId.set(canonicalId, [chain.id]);
  }

  // Emit each canonical group once, at its first occurrence, wearing the
  // canonical id — so an alias-free feed keeps its input order untouched.
  const canonicalized: ChainSummary[] = [];
  const emittedCanonicalIds = new Set<string>();
  for (const chain of chains.chains) {
    const canonicalId = resolveChainId(chain.id) ?? chain.id;
    if (emittedCanonicalIds.has(canonicalId)) continue;
    emittedCanonicalIds.add(canonicalId);
    canonicalized.push({ ...survivorByCanonicalId.get(canonicalId)!, id: canonicalId });
  }

  if (import.meta.env.DEV) {
    for (const [canonicalId, rawIds] of rawIdsByCanonicalId) {
      if (rawIds.length < 2 || warnedAliasCollapses.has(canonicalId)) continue;
      warnedAliasCollapses.add(canonicalId);
      console.warn(
        `[pharosville] chains feed reported "${canonicalId}" under raw ids ` +
        `${[...new Set(rawIds)].join(", ")}; kept one entry by the alias-collapse rule ` +
        `and did not sum supply — if these are genuinely different chains, this is a data bug`,
      );
    }
  }

  return { ...chains, chains: canonicalized };
}

// Collapsing aliases creates a hazard of its own: a feed carrying both
// spellings would hand `selectChainHarbors` two entries under one canonical
// id, whose Map keeps whichever inserted last — a different `totalUsd`, a
// different `healthBand`, possibly a different cap outcome on every load. So
// duplicates collapse deterministically BEFORE `buildChainDocks` sees them:
// prefer the entry already named by the canonical id; else the largest
// `totalUsd`; else the lexicographically first raw id. NEVER sum — the API is
// not documented to partition one chain across spellings, and supply drives
// dock size, harbor rank and the share-of-global fact, so a double-count is
// the worse failure. The dev warning above makes a genuine partition surface
// as a bug report instead of a quiet halving.
function survivesAliasCollapse(
  incumbent: ChainSummary,
  candidate: ChainSummary,
  canonicalId: string,
): ChainSummary {
  const candidateIsCanonical = candidate.id === canonicalId;
  const incumbentIsCanonical = incumbent.id === canonicalId;
  if (candidateIsCanonical !== incumbentIsCanonical) return candidateIsCanonical ? candidate : incumbent;
  if (candidate.totalUsd !== incumbent.totalUsd) return candidate.totalUsd > incumbent.totalUsd ? candidate : incumbent;
  return candidate.id < incumbent.id ? candidate : incumbent;
}

// One warning per canonical id per session, mirroring `logSchemaDriftOnce` in
// `src/lib/api.ts` — the world rebuilds on every live update, and a feed that
// really partitions a chain should page a developer, not flood the console.
const warnedAliasCollapses = new Set<string>();

export function buildWorldScaffoldStage(inputs: PharosVilleInputs): BuildWorldScaffoldStage {
  const chains = normalizeChainsResponse(inputs.chains);
  const docks = withChainSignals(buildChainDocks(chains), chains);
  const cemetery = inputs.cemeteryEntries ?? RUNTIME_CEMETERY_ENTRIES;
  return {
    supplyTide: buildSupplyTide(chains),
    map: buildPharosVilleMap(),
    lighthouse: buildLighthouse(inputs.stability, inputs.pegSummary, inputs.stablecoins, cemetery, inputs.freshness.stability),
    pigeonnier: buildPigeonnier(),
    docks,
    areas: buildAreas(countShipsByRiskPlacement(inputs, docks)),
    graves: graveNodesFromEntries(cemetery),
  };
}
