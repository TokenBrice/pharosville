import { CHAIN_META } from "@shared/lib/chains";
import { CAUSE_META } from "@shared/lib/cause-of-death";
import type { BluechipGrade, DimensionKey } from "@shared/types";
import { formatCompactUsd } from "../lib/format-detail";
import type { AreaNode, DetailModel, DewsAreaBand, DockNode, GraveNode, LighthouseNode, PigeonnierNode, ShipNode } from "./world-types";
import { ETHEREUM_L2_DOCK_CHAIN_IDS } from "./world-layout";
import { analyticalRouteHref } from "./route-links";
import { formationLabel, squadForMember, squadRole } from "./maker-squad";
import { shipCycleTempo, type ShipCycleTempoResult } from "./ship-cycle-tempo";

const usd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, style: "percent" });
const ELEVATED_DEWS_BANDS = new Set<DewsAreaBand>(["ALERT", "WARNING", "DANGER"]);

function marketCapLabel(value: number): string {
  return Number.isFinite(value) && value > 0 ? usd.format(value) : "Unavailable";
}

export interface ShipFleetRank {
  rank: number;
  total: number;
}

function normalizedMarketCap(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function precomputeFleetMarketCapRanks(ships: readonly ShipNode[]): Map<string, ShipFleetRank> {
  const total = ships.length;
  const ranked = [...ships].sort((a, b) => {
    const byMarketCap = normalizedMarketCap(b.marketCapUsd) - normalizedMarketCap(a.marketCapUsd);
    return byMarketCap !== 0 ? byMarketCap : a.id.localeCompare(b.id);
  });
  return new Map(ranked.map((ship, index) => [ship.id, { rank: index + 1, total }]));
}

export function fleetRankLabel(rank: number | null | undefined, total: number | null | undefined): string | null {
  if (
    rank == null
    || total == null
    || !Number.isInteger(rank)
    || !Number.isInteger(total)
    || total <= 1
    || rank < 1
    || rank > total
  ) {
    return null;
  }
  return `#${rank} of ${total}`;
}

export function shareOfFleetLabel(node: ShipNode, allShips: readonly ShipNode[]): string | null {
  if (allShips.length <= 1) return null;
  const totalMarketCap = allShips.reduce((sum, ship) => sum + normalizedMarketCap(ship.marketCapUsd), 0);
  const marketCap = normalizedMarketCap(node.marketCapUsd);
  if (totalMarketCap <= 0 || marketCap <= 0) return null;
  const share = marketCap / totalMarketCap;
  if (share < 0.001) return null;
  return `${percent.format(share)} of fleet`;
}

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function lighthouseBeamWarmCueLabel(areas?: readonly AreaNode[]): string {
  if (!areas) {
    return "Beam warms amber when active DEWS reaches ALERT, WARNING, or DANGER; Fleet PSI cue (not a per-zone reading).";
  }
  const elevatedAreas = areas.filter((area) => area.band && ELEVATED_DEWS_BANDS.has(area.band) && (area.count ?? 0) > 0);
  if (elevatedAreas.length === 0) {
    return "Beam at standard warmth; no active elevated DEWS stablecoins; Fleet PSI cue (not a per-zone reading).";
  }
  const areaList = elevatedAreas
    .map((area) => `${area.label} ${area.band}${area.count != null ? ` (${pluralize(area.count, "stablecoin")})` : ""}`)
    .join(", ");
  return `Beam warming amber under elevated DEWS: ${areaList}. Fleet PSI cue (not a per-zone reading).`;
}

function chainLabel(chainId: string): string {
  return CHAIN_META[chainId]?.name ?? chainId;
}

const ETHEREUM_L2_DOCK_CHAIN_ID_SET = new Set<string>(ETHEREUM_L2_DOCK_CHAIN_IDS);

// Per-band atmospheric descriptor used by the area detail panel. Mirrors the
// renderer's per-zone treatment in `src/renderer/layers/weather.ts` (Phase
// 2.6 DOM parity): cloud + chop wording escalates with the DEWS band, and
// WARNING+/DANGER receive a "lightning active" suffix matching the
// `bandReceivesLightning` gate (threat >= 3).
const ATMOSPHERE_DESCRIPTORS: Record<DewsAreaBand, string> = {
  CALM: "Clear sky, calm sea",
  WATCH: "Thin clouds, light chop",
  ALERT: "Broken clouds, moderate chop",
  WARNING: "Thickening clouds, rough sea, lightning active",
  DANGER: "Heavy storm clouds, heavy chop, lightning active",
};

function atmosphereForArea(area: AreaNode): string {
  if (!area.band) return "Calm waters; no DEWS atmosphere modulation";
  return `${area.label} — ${area.band}, ${ATMOSPHERE_DESCRIPTORS[area.band]}`;
}

function dockHarborGroupLabel(node: DockNode): string {
  if (node.chainId === "ethereum") return "Ethereum anchor harbor";
  if (ETHEREUM_L2_DOCK_CHAIN_ID_SET.has(node.chainId)) return "Ethereum L2 extension";
  return "Outer chain harbor";
}

function chainsPresentLabel(node: ShipNode): string {
  if (node.chainPresence.length === 0) return "0 positive chain deployments";
  const topChains = node.chainPresence
    .slice(0, 3)
    .map((presence) => `${chainLabel(presence.chainId)} ${percent.format(presence.share)}`)
    .join(", ");
  const remainingCount = node.chainPresence.length - 3;
  const suffix = remainingCount > 0 ? `, +${remainingCount} more` : "";
  return `${pluralize(node.chainPresence.length, "positive chain deployment")}: ${topChains}${suffix}`;
}

function chainFootprintLabel(node: ShipNode): string {
  const chainCount = node.chainPresence.length;
  const renderedDockCount = node.dockVisits.length;
  let footprint = "No chain footprint";
  if (chainCount === 1) {
    footprint = "Single-chain footprint";
  } else if (renderedDockCount >= 3 || chainCount >= 4) {
    footprint = "Broad footprint";
  } else if (renderedDockCount >= 2 || chainCount >= 3) {
    footprint = "Multi-chain footprint";
  } else if (chainCount >= 2 || renderedDockCount === 1) {
    footprint = "Narrow footprint";
  }
  // E3: signal extended dock dwell when chain breadth qualifies (≥4 positive chains).
  const dwellSuffix = chainCount >= 4 ? " (extended dwell)" : "";
  return `${footprint}${dwellSuffix}; ${pluralize(chainCount, "positive chain deployment")}, ${pluralize(renderedDockCount, "rendered dock stop")}`;
}

// E2: format change24hPct (percent units, e.g. 10 = +10%) for the detail panel.
function change24hPctLabel(change24hPct: number | null): string {
  if (change24hPct == null) return "—";
  const sign = change24hPct >= 0 ? "+" : "";
  return `${sign}${change24hPct.toFixed(1)}%`;
}

// Longer-window supply momentum, hidden when neither window has data.
export function supplyMomentumLabel(node: Pick<ShipNode, "change7dPct" | "change30dPct">): string | null {
  const week = node.change7dPct ?? null;
  const month = node.change30dPct ?? null;
  if (week == null && month == null) return null;
  const parts: string[] = [];
  if (week != null) parts.push(`7d ${change24hPctLabel(week)}`);
  if (month != null) parts.push(`30d ${change24hPctLabel(month)}`);
  return parts.join(", ");
}

function depegEventDateLabel(epochMs: number | null): string | null {
  if (epochMs == null || !Number.isFinite(epochMs) || epochMs <= 0) return null;
  return new Date(epochMs).toISOString().slice(0, 10);
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatPsiNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPsiComponent(value: number): string {
  if (Math.abs(value) <= 1) return percent.format(value);
  return formatPsiNumber(value);
}

function formatSignedPsiComponent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPsiComponent(value)}`;
}

function trendDirection(value: number, threshold: number): "improving" | "steady" | "deteriorating" {
  if (Math.abs(value) < threshold) return "steady";
  return value > 0 ? "deteriorating" : "improving";
}

export function psiTrendLabel(
  node: Pick<LighthouseNode, "score" | "components" | "avg24h" | "avg24hBand">,
): string | null {
  const score = finiteNumber(node.score);
  const avg24h = finiteNumber(node.avg24h);
  const trend = finiteNumber(node.components?.trend);
  const drift = score !== null && avg24h !== null ? score - avg24h : trend;
  if (drift === null && avg24h === null && !node.avg24hBand) return null;

  const threshold = score !== null && avg24h !== null ? 0.5 : 0.001;
  const parts = [`Observed 24h drift ${drift === null ? "steady" : trendDirection(drift, threshold)}`];
  if (avg24h !== null) parts.push(`24h average ${formatPsiNumber(avg24h)}`);
  if (node.avg24hBand) parts.push(`24h band ${node.avg24hBand}`);
  if (trend !== null) parts.push(`trend component ${formatSignedPsiComponent(trend)}`);
  return parts.join("; ");
}

export function psiCompositionLabel(node: Pick<LighthouseNode, "components">): string | null {
  const severity = finiteNumber(node.components?.severity);
  const breadth = finiteNumber(node.components?.breadth);
  const stressBreadth = finiteNumber(node.components?.stressBreadth);
  const parts = [
    severity !== null ? `severity ${formatPsiComponent(severity)}` : null,
    breadth !== null ? `breadth ${formatPsiComponent(breadth)}` : null,
    stressBreadth !== null ? `stress breadth ${formatPsiComponent(stressBreadth)}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : null;
}

function basisPointsLabel(value: number): string {
  const sign = value > 0 ? "+" : "";
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${sign}${formatted} bps`;
}

export function psiContributorLabel(contributor: NonNullable<LighthouseNode["contributors"]>[number]): string {
  return `${contributor.symbol} ${basisPointsLabel(contributor.bps)} (${formatCompactUsd(contributor.mcapUsd)})`;
}

/**
 * Severity of a ship's depeg record in [0, 1]. Zero (insignificant) below the
 * shared gate of 3+ events or a worst deviation beyond -3%. The same value
 * drives the hull-weathering render intensity and the "Depeg history"
 * detail/ledger row, so the canvas cue and its DOM parity always agree.
 */
export function depegHistorySeverity(history: ShipNode["depegHistory"]): number {
  if (!history || history.eventCount <= 0) return 0;
  const byCount = history.eventCount >= 3 ? Math.min(1, history.eventCount / 12) : 0;
  const worst = history.worstDeviationBps ?? 0;
  const byWorst = worst <= -300 ? Math.min(1, Math.abs(worst) / 2000) : 0;
  return Math.max(byCount, byWorst);
}

// "3 events on record; worst -8.2%; last 2026-05-30" — null when the record
// is empty or below the shared significance gate (see depegHistorySeverity).
export function depegHistoryLabel(history: ShipNode["depegHistory"]): string | null {
  if (!history || depegHistorySeverity(history) <= 0) return null;
  const parts = [`${pluralize(history.eventCount, "event")} on record`];
  if (history.worstDeviationBps != null) {
    parts.push(`worst ${(history.worstDeviationBps / 100).toFixed(1)}%`);
  }
  const lastDate = depegEventDateLabel(history.lastEventAt);
  if (lastDate) parts.push(`last ${lastDate}`);
  return parts.join("; ");
}

/**
 * Severity of a ship's price-feed degradation in [0, 1]. Zero (insignificant)
 * when the feed reports "high" confidence or carries no confidence data. The
 * same value drives the price-confidence render cue and the price-signal fold
 * in the Market cap detail row, so the canvas cue and its DOM parity always
 * agree.
 */
export function priceSignalSeverity(asset: Pick<ShipNode["asset"], "priceConfidence"> | null | undefined): number {
  switch (asset?.priceConfidence) {
    case "single-source": return 0.4;
    case "low": return 0.7;
    case "fallback": return 1;
    default: return 0;
  }
}

// "Low-confidence price feed" — null below the shared significance gate (see
// priceSignalSeverity), so healthy feeds spend no panel space.
const PRICE_CONFIDENCE_DESCRIPTORS: Partial<Record<NonNullable<ShipNode["asset"]["priceConfidence"]>, string>> = {
  "single-source": "Single-source price feed",
  low: "Low-confidence price feed",
  fallback: "Fallback price feed",
};

export function priceConfidenceLabel(asset: Pick<ShipNode["asset"], "priceConfidence"> | null | undefined): string | null {
  if (priceSignalSeverity(asset) <= 0 || !asset?.priceConfidence) return null;
  return PRICE_CONFIDENCE_DESCRIPTORS[asset.priceConfidence] ?? null;
}

/**
 * Source-consensus ratio for a ship's price feed: `agree / total` in [0, 1]
 * with the underlying counts, or null when the feed reports no consensus
 * sources. The same value drives the rigging-density render cue and the
 * "Source consensus" fold in the Market cap detail row.
 */
export function sourceConsensusRatio(
  asset: Pick<ShipNode["asset"], "consensusSources" | "agreeSources"> | null | undefined,
): { agree: number; total: number; ratio: number } | null {
  const total = asset?.consensusSources?.length ?? 0;
  if (total <= 0) return null;
  // agree ⊆ consensus upstream; clamp defensively so the ratio stays in [0, 1].
  const agree = Math.min(asset?.agreeSources?.length ?? 0, total);
  return { agree, total, ratio: agree / total };
}

// "2 of 3 price sources agree" — null when no consensus data or when every
// source agrees, so fully-agreed ships spend no panel space.
export function sourceConsensusLabel(
  asset: Pick<ShipNode["asset"], "consensusSources" | "agreeSources"> | null | undefined,
): string | null {
  const consensus = sourceConsensusRatio(asset);
  if (!consensus || consensus.ratio >= 1) return null;
  return `${consensus.agree} of ${consensus.total} price sources agree`;
}

/**
 * Audit shield for heritage-tier ships: non-null only for titan/unique hulls
 * whose report card carries a Bluechip grade. The `smartContractAudit`
 * boolean lives on `BluechipRating` (a separate bluechip-ratings payload not
 * wired into the world inputs), so the shield surfaces the grade alone. The
 * same state drives the audit-shield render cue and the Bluechip fold in the
 * Class detail row.
 */
export function auditShieldState(
  reportCard: ShipNode["reportCard"],
  sizeTier: ShipNode["visual"]["sizeTier"],
): { grade: BluechipGrade } | null {
  if (sizeTier !== "titan" && sizeTier !== "unique") return null;
  const grade = reportCard?.rawInputs.bluechipGrade ?? null;
  return grade ? { grade } : null;
}

// "Bluechip A" — null outside the auditShieldState gate.
export function auditShieldLabel(
  reportCard: ShipNode["reportCard"],
  sizeTier: ShipNode["visual"]["sizeTier"],
): string | null {
  const shield = auditShieldState(reportCard, sizeTier);
  return shield ? `Bluechip ${shield.grade}` : null;
}

export const DIMENSION_KEY_LABELS: Record<DimensionKey, string> = {
  pegStability: "Peg stability",
  liquidity: "Liquidity",
  resilience: "Resilience",
  decentralization: "Decentralization",
  dependencyRisk: "Dependency risk",
};

export function reportCardSafetyLabel(reportCard: ShipNode["reportCard"]): string | null {
  if (!reportCard || reportCard.overallGrade === "NR") return null;
  if (reportCard.overallScore == null || !Number.isFinite(reportCard.overallScore)) {
    return `Safety ${reportCard.overallGrade}`;
  }
  return `Safety ${reportCard.overallGrade} (score ${Math.round(reportCard.overallScore)})`;
}

function representativePositionLabel(node: ShipNode): string {
  if (node.riskPlacement === "ledger-mooring") return "Ledger Mooring idle";
  return `${node.riskWaterLabel} idle`;
}

function evidenceStatusLabel(node: ShipNode): string {
  return node.placementEvidence.stale ? `Caveat: ${node.placementEvidence.reason}` : "Fresh current placement evidence";
}

export function stressBreakdownLabel(node: Pick<ShipNode, "stressBreakdown">): string | null {
  const breakdown = node.stressBreakdown ?? null;
  if (!breakdown || (breakdown.signals.length === 0 && !breakdown.contagionActive)) return null;
  const parts = [...breakdown.signals];
  if (breakdown.contagionActive) parts.push("contagion amplifier active");
  return `Driven by: ${parts.join("; ")}`;
}

function shipLiveryLabel(node: ShipNode): string {
  const livery = node.visual.livery;
  return `${livery.label}; ${livery.logoShape} logo shape, ${livery.sailPanel} sail panel, ${livery.stripePattern} brand stripe`;
}


export const PHAROS_WATCH_TELEGRAM_HREF = "https://pharos.watch/telegram/";

export function detailForPigeonnier(node: PigeonnierNode): DetailModel {
  return {
    id: node.detailId,
    kind: node.kind,
    title: `${node.label} — PharosWatch dispatch`,
    summary:
      "Carrier-pigeon loft of the harbor watch. Subscribe to receive stablecoin depeg and safety-score alerts via the PharosWatch Telegram bot.",
    facts: [
      { label: "Channel", value: "PharosWatch" },
      { label: "Alerts", value: "Stablecoin depegs and safety-score changes" },
    ],
    links: [{ label: "Subscribe on Telegram", href: PHAROS_WATCH_TELEGRAM_HREF, target: "_blank" }],
  };
}

export function detailForLighthouse(node: LighthouseNode): DetailModel {
  const trend = psiTrendLabel(node);
  const composition = psiCompositionLabel(node);
  const contributors = node.contributors ?? [];
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.label,
    summary: node.unavailable
      ? "PSI is unavailable, so the beacon is unlit."
      : `PSI band ${node.psiBand}. Beam warmth tracks the fleet PSI composite; per-zone storms show in the water and sky, not the beam.`,
    facts: [
      { label: "Score", value: node.score == null ? "Unavailable" : String(node.score) },
      { label: "Band", value: node.psiBand ?? "Unavailable" },
      ...(trend ? [{ label: "Trend", value: trend }] : []),
      ...(composition ? [{ label: "Composition", value: composition }] : []),
      { label: "Beam warmth cue", value: lighthouseBeamWarmCueLabel() },
      {
        label: "Last fleet depeg",
        value: depegEventDateLabel(node.lastFleetDepegAt ?? null) ?? "None on record",
      },
    ],
    links: [{ label: "PSI", href: analyticalRouteHref("/stability-index/") }],
    ...(contributors.length > 0
      ? {
          membersHeading: "Top PSI contributors",
          members: contributors.map((contributor) => ({
            id: contributor.id,
            label: `${contributor.symbol} ${basisPointsLabel(contributor.bps)}`,
            href: analyticalRouteHref(`/stablecoin/${contributor.id}/`),
            value: formatCompactUsd(contributor.mcapUsd),
          })),
        }
      : {}),
  };
}

// Healthy floor for a chain's backing-diversity health factor; below it the
// dock congestion cue and the "Backing diversity" detail row escalate.
const BACKING_DIVERSITY_HEALTHY_MIN = 0.5;

/**
 * Severity of a dock's backing-concentration signal in [0, 1]. Zero
 * (insignificant) while the chain's `healthFactors.backingDiversity` score
 * stays at or above the healthy floor; rises linearly to 1 as diversity
 * approaches zero. The same value drives the dock congestion render cue and
 * the "Backing diversity" detail-row wording, so the two always agree.
 */
export function backingDiversitySeverity(backingDiversity: DockNode["backingDiversity"]): number {
  if (backingDiversity == null || !Number.isFinite(backingDiversity)) return 0;
  if (backingDiversity >= BACKING_DIVERSITY_HEALTHY_MIN) return 0;
  return Math.min(1, (BACKING_DIVERSITY_HEALTHY_MIN - backingDiversity) / BACKING_DIVERSITY_HEALTHY_MIN);
}

// "70% diversified" / "30% narrowing" / "10% concentrated" — null when the
// chain reports no backing-diversity factor.
export function backingDiversityLabel(backingDiversity: DockNode["backingDiversity"]): string | null {
  if (backingDiversity == null || !Number.isFinite(backingDiversity)) return null;
  const severity = backingDiversitySeverity(backingDiversity);
  const descriptor = severity <= 0 ? "diversified" : severity < 0.5 ? "narrowing" : "concentrated";
  return `${percent.format(Math.max(0, backingDiversity))} ${descriptor}`;
}

export function harborRankLabel(rank: number | null | undefined, count: number | null | undefined): string | null {
  if (
    rank == null
    || count == null
    || !Number.isInteger(rank)
    || !Number.isInteger(count)
    || rank < 1
    || count < 1
    || rank > count
  ) {
    return null;
  }
  return `#${rank} of ${count} rendered harbors`;
}

export function stablecoinSupplyShareLabel(shareOfGlobal: number | null | undefined): string | null {
  if (shareOfGlobal == null || !Number.isFinite(shareOfGlobal) || shareOfGlobal <= 0) return null;
  return `${percent.format(shareOfGlobal)} of stablecoin supply`;
}

export function dockConcentrationLabel(concentration: DockNode["concentration"]): string | null {
  if (concentration == null || !Number.isFinite(concentration)) return null;
  const clamped = Math.max(0, Math.min(1, concentration));
  const descriptor = clamped < 0.25 ? "diversified" : clamped < 0.45 ? "moderately concentrated" : "concentrated";
  return `${descriptor} (HHI ${clamped.toFixed(2)})`;
}

export interface DockDetailContext {
  inWorldDetailIds?: ReadonlySet<string>;
}

function matchingShipDetailId(stablecoinId: string, inWorldDetailIds: ReadonlySet<string> | undefined): string | undefined {
  const detailId = `ship.${stablecoinId}`;
  return inWorldDetailIds?.has(detailId) ? detailId : undefined;
}

export function detailForDock(node: DockNode, context: DockDetailContext | number = {}): DetailModel {
  const inWorldDetailIds = typeof context === "number" ? undefined : context.inWorldDetailIds;
  const topSymbols = node.harboredStablecoins.map((coin) => coin.symbol).join(", ");
  const harborGroup = dockHarborGroupLabel(node);
  const backingDiversity = backingDiversityLabel(node.backingDiversity);
  const harborRank = harborRankLabel(node.harborRank, node.harborCount);
  const supplyShare = stablecoinSupplyShareLabel(node.shareOfGlobal);
  const concentration = dockConcentrationLabel(node.concentration);
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.label,
    summary: topSymbols
      ? `${harborGroup} for ${topSymbols}; footprint is based on chain stablecoin supply.`
      : `${harborGroup}; footprint is based on chain stablecoin supply.`,
    facts: [
      { label: "Stablecoin supply", value: usd.format(node.totalUsd) },
      ...(harborRank ? [{ label: "Harbor rank", value: harborRank }] : []),
      ...(supplyShare ? [{ label: "Share of stablecoin supply", value: supplyShare }] : []),
      ...(concentration ? [{ label: "Concentration", value: concentration }] : []),
      { label: "Stablecoin count", value: String(node.stablecoinCount) },
      { label: "Health", value: node.healthBand ?? "Unavailable" },
      ...(backingDiversity ? [{ label: "Backing diversity", value: backingDiversity }] : []),
      { label: "Harbor group", value: harborGroup },
      { label: "Harbor style", value: node.assetId.replace("dock.", "").replaceAll("-", " ") },
    ],
    links: [{ label: "Chain", href: analyticalRouteHref(`/chains/${node.chainId}/`) }],
    membersHeading: "Harbored stablecoins",
    members: node.harboredStablecoins.map((coin) => {
      const inWorldDetailId = matchingShipDetailId(coin.id, inWorldDetailIds);
      return {
        id: coin.id,
        label: `${coin.symbol} (${percent.format(coin.share)})`,
        href: analyticalRouteHref(`/stablecoin/${coin.id}/`),
        value: usd.format(coin.supplyUsd),
        ...(inWorldDetailId ? { inWorldDetailId } : {}),
      };
    }),
  };
}

/**
 * W5.01 — Risk-band tack-out for the detail panel. Mirrors
 * `ShipMotionSample.riskTransition` from `motion-types.ts`, but with the
 * raw tile coordinates pre-resolved to risk-water-area labels by the
 * caller so detail-model.ts has no dependency on tile→label lookup.
 *
 * When supplied with `progress < 1`, the detail panel emits a "Tracking
 * new risk band" fact row at world-refresh cadence.
 */
export interface ShipRiskTransitionContext {
  fromLabel: string;
  toLabel: string;
  progress: number;
}

export interface ShipDetailContext {
  squadShips?: readonly ShipNode[];
  allShips?: readonly ShipNode[];
  fleetRank?: ShipFleetRank;
  /**
   * Optional precomputed cycle-tempo descriptor for this ship. When supplied,
   * it bypasses the internal `shipCycleTempo` call and the per-call sort.
   * Use `precomputeShipTempos(world.ships)` once at world build to amortize
   * the sort across many `detailForShip` calls.
   */
  cycleTempo?: ShipCycleTempoResult;
  /**
   * W5.01 — Active risk-band tack-out for this ship, sourced from
   * `ShipMotionSample.riskTransition` at world-refresh cadence (not
   * per-frame). The detail panel surfaces a "Tracking new risk band"
   * fact row when `progress < 1`. Null or `progress >= 1` suppresses
   * the row.
   */
  riskTransition?: ShipRiskTransitionContext | null;
}

export function riskTransitionLabel(transition: ShipRiskTransitionContext): string {
  return `from ${transition.fromLabel} to ${transition.toLabel}`;
}

/**
 * W5.01 — React-render-time patcher. The detail index is built at world-refresh
 * cadence and does not see the live risk-transition signal that the motion
 * planner surfaces per route. When a ship-kind detail is rendered with an
 * active transition, this helper inserts the "Tracking new risk band" row in
 * the same position `detailForShip` would have, without recomputing the rest
 * of the ship detail. Suppressed when `progress >= 1`.
 */
export function withRiskTransitionFact(
  baseDetail: DetailModel,
  transition: ShipRiskTransitionContext | null,
): DetailModel {
  if (!transition || transition.progress >= 1) return baseDetail;
  const insertAfter = baseDetail.facts.findIndex((fact) => fact.label === "Risk placement key");
  if (insertAfter < 0) return baseDetail;
  const factRow = { label: "Tracking new risk band", value: riskTransitionLabel(transition) };
  return {
    ...baseDetail,
    facts: [
      ...baseDetail.facts.slice(0, insertAfter + 1),
      factRow,
      ...baseDetail.facts.slice(insertAfter + 1),
    ],
  };
}

export function squadFormationLine(squadShips: readonly ShipNode[]): string {
  if (squadShips.length === 0) return "";
  // Use the squad's own display order so Sky and Maker each list their own
  // members in their own formation order, rather than the global all-squads order.
  const squad = squadForMember(squadShips[0]!.id);
  if (!squad) return "";
  const byId = new Map(squadShips.map((ship) => [ship.id, ship]));
  return squad.displayOrder
    .map((id) => {
      const ship = byId.get(id);
      if (!ship) return null;
      const role = squadRole(ship.id);
      if (!role) return null;
      return formationLabel(ship.id, role, ship.symbol);
    })
    .filter((label): label is string => label !== null)
    .join(", ");
}

export function squadOverrideBanner(node: ShipNode): string | null {
  const override = node.placementEvidence.squadOverride;
  if (!override) return null;
  const suffix = override.ownReason ? ` (${override.ownReason})` : "";
  return `${node.symbol} in distress — squad sheltering at flagship's position${suffix}`;
}

export function detailForShip(node: ShipNode, context: ShipDetailContext = {}): DetailModel {
  const isSquadShip = !!node.squadId;
  const squadShips = isSquadShip ? context.squadShips ?? [] : [];
  const formationLine = isSquadShip && squadShips.length > 0 ? squadFormationLine(squadShips) : "";
  const overrideBanner = isSquadShip ? squadOverrideBanner(node) : null;
  const allShips = context.allShips ?? [node];
  const cycleTempo = context.cycleTempo ?? shipCycleTempo(node, allShips);
  const fleetRank = context.fleetRank ? fleetRankLabel(context.fleetRank.rank, context.fleetRank.total) : null;
  const fleetShare = shareOfFleetLabel(node, allShips);

  const riskTransition = context.riskTransition ?? null;
  // W5.01 — surface the wired-but-silent risk-band tack-out from
  // `ShipMotionSample.riskTransition` (see `motion-types.ts:174`). The row
  // is suppressed when the transition is null or has completed
  // (progress >= 1) so the panel matches the canvas tack-out window.
  const riskTransitionFact = riskTransition && riskTransition.progress < 1
    ? [{ label: "Tracking new risk band", value: riskTransitionLabel(riskTransition) }]
    : [];

  const momentum = supplyMomentumLabel(node);
  const depegHistory = depegHistoryLabel(node.depegHistory);
  // P3 metaphor quick-wins — all significance-gated (see the label helpers),
  // and folded into existing panel rows by `buildDetailFactSections` so the
  // <= 8 fact-row density contract holds even when every gate fires.
  const priceConfidence = priceConfidenceLabel(node.asset);
  const sourceConsensus = sourceConsensusLabel(node.asset);
  const auditShield = auditShieldLabel(node.reportCard, node.visual.sizeTier);
  const safetyGrade = reportCardSafetyLabel(node.reportCard);
  const stressDriver = stressBreakdownLabel(node);
  const facts = [
    { label: "Market cap", value: marketCapLabel(node.marketCapUsd) },
    ...(fleetRank ? [{ label: "Fleet rank", value: fleetRank }] : []),
    ...(fleetShare ? [{ label: "Share of fleet", value: fleetShare }] : []),
    ...(priceConfidence ? [{ label: "Price confidence", value: priceConfidence }] : []),
    ...(sourceConsensus ? [{ label: "Source consensus", value: sourceConsensus }] : []),
    { label: "24h supply change", value: change24hPctLabel(node.change24hPct) },
    ...(momentum ? [{ label: "Supply momentum", value: momentum }] : []),
    ...(depegHistory ? [{ label: "Depeg history", value: depegHistory }] : []),
    { label: "Cycle tempo", value: cycleTempo.label },
    ...(safetyGrade ? [{ label: "Safety grade", value: safetyGrade }] : []),
    { label: "Ship class", value: node.visual.classLabel },
    { label: "Size tier", value: node.visual.sizeLabel },
    ...(auditShield ? [{ label: "Bluechip audit", value: auditShield }] : []),
    ...(node.visual.uniqueRationale
      ? [{ label: "Cultural significance", value: node.visual.uniqueRationale }]
      : []),
    { label: "Ship livery", value: shipLiveryLabel(node) },
    { label: "Representative position", value: representativePositionLabel(node) },
    { label: "Risk water area", value: node.riskWaterLabel },
    { label: "Risk water zone", value: node.riskZone },
    { label: "Risk placement key", value: node.riskPlacement },
    ...(stressDriver ? [{ label: "Stress driver", value: stressDriver }] : []),
    ...riskTransitionFact,
    { label: "Home dock", value: node.homeDockChainId ? chainLabel(node.homeDockChainId) : "No rendered dock" },
    { label: "Chains present", value: chainsPresentLabel(node) },
    { label: "Chain footprint", value: chainFootprintLabel(node) },
    ...(formationLine ? [{ label: "Sailing in formation", value: formationLine }] : []),
    ...(overrideBanner ? [{ label: "Squad override", value: overrideBanner }] : []),
    { label: "Route source", value: "stablecoins.chainCirculating, pegSummary.coins[], stress.signals[]" },
    { label: "Evidence status", value: evidenceStatusLabel(node) },
    { label: "Evidence", value: node.placementEvidence.sourceFields.join(", ") },
  ];

  return {
    id: node.detailId,
    kind: node.kind,
    title: node.label,
    summary: node.placementEvidence.reason,
    facts,
    links: [{ label: "Stablecoin", href: analyticalRouteHref(`/stablecoin/${node.id}/`) }],
  };
}

export function detailForGrave(node: GraveNode): DetailModel {
  const causeLabel = CAUSE_META[node.entry.causeOfDeath]?.label ?? node.entry.causeOfDeath;
  const sourceLink: DetailModel["links"][number] & { rel: "noopener noreferrer" } = {
    label: node.entry.sourceLabel,
    href: node.entry.sourceUrl,
    target: "_blank",
    rel: "noopener noreferrer",
  };
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.entry.name,
    summary: node.entry.epitaph ?? "",
    paragraphs: [node.entry.obituary],
    facts: [
      { label: "Symbol", value: node.entry.symbol },
      { label: "Cause", value: causeLabel },
      { label: "Date", value: node.entry.deathDate },
      ...(node.entry.peakMcap != null && Number.isFinite(node.entry.peakMcap)
        ? [{ label: "Peak market cap", value: usd.format(node.entry.peakMcap) }]
        : []),
    ],
    links: [
      { label: "Cemetery", href: analyticalRouteHref("/cemetery/") },
      sourceLink,
    ],
  };
}

export function detailForArea(node: AreaNode): DetailModel {
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.label,
    summary: node.summary ?? (node.band
      ? `${node.label} is a DEWS ${node.band} water area used for ship risk placement.`
      : `${node.label} is a named water area.`),
    facts: [
      ...(node.band ? [{ label: "DEWS band", value: node.band }] : []),
      ...(node.count != null ? [{ label: "Stablecoins", value: String(node.count) }] : []),
      ...(node.riskZone ? [{ label: "Risk water zone", value: node.riskZone }] : []),
      ...(node.riskPlacement ? [{ label: "Risk placement", value: node.riskPlacement }] : []),
      { label: "Atmosphere", value: atmosphereForArea(node) },
      ...(node.facts ?? []),
      ...(node.sourceFields?.length ? [{ label: "Source fields", value: node.sourceFields.join(", ") }] : []),
    ],
    links: node.links?.map((link) => ({ ...link, href: analyticalRouteHref(link.href) }))
      ?? [{ label: "DEWS", href: analyticalRouteHref("/depeg/") }],
  };
}
