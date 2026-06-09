import { CHAIN_META } from "@shared/lib/chains";
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

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function lighthouseBeamWarmCueLabel(areas?: readonly AreaNode[]): string {
  if (!areas) {
    return "Beam warms amber when active DEWS reaches ALERT, WARNING, or DANGER.";
  }
  const elevatedAreas = areas.filter((area) => area.band && ELEVATED_DEWS_BANDS.has(area.band) && (area.count ?? 0) > 0);
  if (elevatedAreas.length === 0) {
    return "Beam at standard warmth; no active elevated DEWS stablecoins.";
  }
  const areaList = elevatedAreas
    .map((area) => `${area.label} ${area.band}${area.count != null ? ` (${pluralize(area.count, "stablecoin")})` : ""}`)
    .join(", ");
  return `Beam warming amber under elevated DEWS: ${areaList}.`;
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

function dockingCadenceLabel(node: ShipNode): string {
  const chainCount = node.chainPresence.length;
  const renderedDockCount = node.dockVisits.length;
  let cadence = "No rendered dock cadence";
  if (renderedDockCount === 0) {
    cadence = "No rendered dock cadence";
  } else if (renderedDockCount >= 3 || chainCount >= 4) {
    cadence = "Frequent";
  } else if (renderedDockCount >= 2) {
    cadence = "Regular";
  } else if (renderedDockCount === 1) {
    cadence = "Occasional";
  }
  // E3: signal extended dock dwell when chain breadth qualifies (≥4 positive chains).
  const dwellSuffix = chainCount >= 4 ? " (extended dwell)" : "";
  return `${cadence}${dwellSuffix}; ${pluralize(chainCount, "positive chain deployment")}, ${pluralize(renderedDockCount, "rendered dock stop")}`;
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

function representativePositionLabel(node: ShipNode): string {
  if (node.riskPlacement === "ledger-mooring") return "Ledger Mooring idle";
  return `${node.riskWaterLabel} idle`;
}

function evidenceStatusLabel(node: ShipNode): string {
  return node.placementEvidence.stale ? `Caveat: ${node.placementEvidence.reason}` : "Fresh current placement evidence";
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
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.label,
    summary: node.unavailable ? "PSI is unavailable, so the beacon is unlit." : `PSI band ${node.psiBand}.`,
    facts: [
      { label: "Score", value: node.score == null ? "Unavailable" : String(node.score) },
      { label: "Band", value: node.psiBand ?? "Unavailable" },
      { label: "Beam warmth cue", value: lighthouseBeamWarmCueLabel() },
      {
        label: "Last fleet depeg",
        value: depegEventDateLabel(node.lastFleetDepegAt ?? null) ?? "None on record",
      },
    ],
    links: [{ label: "PSI", href: analyticalRouteHref("/stability-index/") }],
  };
}

export function detailForDock(node: DockNode): DetailModel {
  const topSymbols = node.harboredStablecoins.map((coin) => coin.symbol).join(", ");
  const harborGroup = dockHarborGroupLabel(node);
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.label,
    summary: topSymbols
      ? `${harborGroup} for ${topSymbols}; footprint is based on chain stablecoin supply.`
      : `${harborGroup}; footprint is based on chain stablecoin supply.`,
    facts: [
      { label: "Stablecoin supply", value: usd.format(node.totalUsd) },
      { label: "Stablecoin count", value: String(node.stablecoinCount) },
      { label: "Health", value: node.healthBand ?? "Unavailable" },
      { label: "Harbor group", value: harborGroup },
      { label: "Harbor style", value: node.assetId.replace("dock.", "").replaceAll("-", " ") },
    ],
    links: [{ label: "Chain", href: analyticalRouteHref(`/chains/${node.chainId}/`) }],
    membersHeading: "Harbored stablecoins",
    members: node.harboredStablecoins.map((coin) => ({
      id: coin.id,
      label: `${coin.symbol} (${percent.format(coin.share)})`,
      href: analyticalRouteHref(`/stablecoin/${coin.id}/`),
      value: usd.format(coin.supplyUsd),
    })),
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
  const facts = [
    { label: "Market cap", value: marketCapLabel(node.marketCapUsd) },
    { label: "24h supply change", value: change24hPctLabel(node.change24hPct) },
    ...(momentum ? [{ label: "Supply momentum", value: momentum }] : []),
    ...(depegHistory ? [{ label: "Depeg history", value: depegHistory }] : []),
    { label: "Cycle tempo", value: cycleTempo.label },
    { label: "Ship class", value: node.visual.classLabel },
    { label: "Size tier", value: node.visual.sizeLabel },
    ...(node.visual.uniqueRationale
      ? [{ label: "Cultural significance", value: node.visual.uniqueRationale }]
      : []),
    { label: "Ship livery", value: shipLiveryLabel(node) },
    { label: "Representative position", value: representativePositionLabel(node) },
    { label: "Risk water area", value: node.riskWaterLabel },
    { label: "Risk water zone", value: node.riskZone },
    { label: "Risk placement key", value: node.riskPlacement },
    ...riskTransitionFact,
    { label: "Home dock", value: node.homeDockChainId ? chainLabel(node.homeDockChainId) : "No rendered dock" },
    { label: "Chains present", value: chainsPresentLabel(node) },
    { label: "Docking cadence", value: dockingCadenceLabel(node) },
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
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.entry.name,
    summary: node.entry.epitaph ?? node.entry.obituary,
    facts: [
      { label: "Symbol", value: node.entry.symbol },
      { label: "Cause", value: node.entry.causeOfDeath },
      { label: "Date", value: node.entry.deathDate },
    ],
    links: [{ label: "Cemetery", href: analyticalRouteHref("/cemetery/") }],
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
