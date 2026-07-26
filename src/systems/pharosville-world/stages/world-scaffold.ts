import { RUNTIME_CEMETERY_ENTRIES } from "@shared/lib/cemetery-runtime";
import { PSI_HEX_COLORS } from "@shared/lib/psi-colors";
import { STATUS_COINGECKO_PRICE_DIFF_THRESHOLD_PCT } from "@shared/lib/status-thresholds";
import type { StabilityIndexResponse } from "@shared/types";
import { buildChainDocks } from "../../chain-docks";
import {
  buildPharosVilleMap,
  graveNodesFromEntries,
  LIGHTHOUSE_TILE,
  PIGEON_ISLAND_CENTER,
} from "../../world-layout";
import {
  SHIP_RISK_PLACEMENTS,
  riskWaterAreaForPlacement,
} from "../../risk-water-areas";
import { countShipsByRiskPlacement } from "./ship-placement";
import type {
  DewsAreaBand,
  DockNode,
  LighthouseBeamDwell,
  LighthouseHighWaterMark,
  LighthouseNode,
  PharosVilleWorld,
  PigeonnierNode,
  ShipNode,
  SignalMastNode,
} from "../../world-types";
import {
  HIGH_WATER_MARK_WINDOW_DAYS,
  psiBandSeverity,
  SIGNAL_MAST_MAX_PENNANTS,
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
    inputs.reportCards?.updatedAt,
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
  };
}

function buildLighthouse(
  stability: StabilityIndexResponse | null | undefined,
  pegSummary: PharosVilleInputs["pegSummary"],
): LighthouseNode {
  const current = stability?.current ?? null;
  const band = current?.band ?? null;
  const components = lighthouseComponents(current);
  const avg24h = finiteNumber(current?.avg24h);
  const avg24hBand = nonEmptyString(current?.avg24hBand);
  const contributors = lighthouseContributors(current);
  const beamDwell = buildBeamDwell(contributors);
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
    detailId: "lighthouse",
    lastFleetDepegAt: lastFleetDepegAt(pegSummary),
    signalMast: buildSignalMast(pegSummary),
    highWaterMark: buildHighWaterMark(stability),
    ...(beamDwell ? { beamDwell } : {}),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The worst PSI band of the trailing window, for the lighthouse tide-stain.
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
 * Deviation, in basis points, at which the mast hoists its storm cone.
 *
 * Derived rather than invented: `STATUS_COINGECKO_PRICE_DIFF_THRESHOLD_PCT` is
 * the pipeline's existing shared answer to "how far apart do two readings of
 * the same price have to be before we treat the gap as real and not noise",
 * and a peg deviation is exactly that question asked against par. Reusing it
 * means the cone moves when that gate moves, instead of drifting from it.
 */
export const SIGNAL_MAST_STORM_CONE_BPS = STATUS_COINGECKO_PRICE_DIFF_THRESHOLD_PCT * 100;

/**
 * Fleet-wide peg condition for the observatory hoist.
 *
 * `pegSummary.summary` is the only payload that speaks for the whole fleet at
 * once; every other peg reading in the world is per-coin. Absent summary is
 * NOT calm — a mast with nothing to go on stands bare and says so, because a
 * bare mast that means "all clear" and a bare mast that means "no dispatches
 * arrived" cannot be told apart by looking.
 */
export function buildSignalMast(pegSummary: PharosVilleInputs["pegSummary"]): SignalMastNode {
  const summary = pegSummary?.summary ?? null;
  if (!summary) {
    return {
      activeDepegCount: 0,
      pennantCount: 0,
      capped: false,
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

  const activeDepegCount = Math.max(0, Math.trunc(finiteNumber(summary.activeDepegCount) ?? 0));
  const worstBps = finiteNumber(summary.worstCurrent?.bps);
  return {
    activeDepegCount,
    pennantCount: Math.min(activeDepegCount, SIGNAL_MAST_MAX_PENNANTS),
    capped: activeDepegCount > SIGNAL_MAST_MAX_PENNANTS,
    // The gate is on MAGNITUDE: a coin trading above par as far as this is as
    // much a broken peg as one trading below it.
    stormCone: worstBps !== null && Math.abs(worstBps) >= SIGNAL_MAST_STORM_CONE_BPS,
    worstBps,
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
  return SHIP_RISK_PLACEMENTS.map((placement) => {
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
}

// P3 metaphor quick-win: ride the chain's backing-diversity health factor on
// the dock node so `detailForDock` and the dock congestion render cue read
// one field instead of re-joining the chains payload.
function withBackingDiversity(docks: DockNode[], chains: PharosVilleInputs["chains"]): DockNode[] {
  const diversityByChainId = new Map(
    (chains?.chains ?? []).map((chain) => [chain.id, chain.healthFactors?.backingDiversity ?? null] as const),
  );
  return docks.map((dock) => ({ ...dock, backingDiversity: diversityByChainId.get(dock.chainId) ?? null }));
}

export function buildWorldScaffoldStage(inputs: PharosVilleInputs): BuildWorldScaffoldStage {
  const docks = withBackingDiversity(buildChainDocks(inputs.chains), inputs.chains);
  return {
    map: buildPharosVilleMap(),
    lighthouse: buildLighthouse(inputs.stability, inputs.pegSummary),
    pigeonnier: buildPigeonnier(),
    docks,
    areas: buildAreas(countShipsByRiskPlacement(inputs, docks)),
    graves: graveNodesFromEntries(inputs.cemeteryEntries ?? RUNTIME_CEMETERY_ENTRIES),
  };
}
