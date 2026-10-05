import { PHAROSVILLE_API_ENDPOINT_KEYS } from "@shared/types/pharosville-endpoint-keys";
import { PHAROSVILLE_ENDPOINT_REGISTRY } from "@shared/lib/pharosville-endpoint-registry";
import { CHAIN_META } from "@shared/lib/chains";
import { CAUSE_META } from "@shared/lib/cause-of-death";

import { formatCompactUsd } from "../lib/format-detail";
import type { DayCycleBeats, DayCycleBeatName } from "./day-cycle-beats";
import type { AreaNode, DetailModel, DewsAreaBand, DockNode, GraveNode, LighthouseNode, PharosVilleWorld, PigeonnierNode, ShipNode, ShipWaterZone } from "./world-types";
import { pigeonnierRoostLabel } from "./pigeonnier-watch";
import { analyticalRouteHref } from "./route-links";
import { formationLabel, squadForMember, squadRole } from "./maker-squad";
import { zoneThemeForTerrain } from "./palette";
import { RISK_WATER_AREAS } from "./risk-water-areas";
import { cycleTempoDetailLabel, shipCycleTempo, type ShipCycleTempoResult } from "./ship-cycle-tempo";
import type { SupplyTide } from "./supply-tide";
import { quayMasonryLabel } from "./dock-health";
export { quayMasonryHealth, quayMasonryLabel } from "./dock-health";
import { farShoreLabel, skyCoverLabel, skyCoverWord } from "./psi-sky";
import { deriveLampStatus, hasCompleteCurrentSources, lampStatusReading } from "./lamp-status";
import { gardenMonthRecordLabel } from "./garden-month-record";
import { shipIssuanceDetailLabel } from "./ship-issuance";
import type { PharosVilleFreshness } from "./world-types";
import { nodeSourceEvidenceLabel, sourceCoverageLabel, sourceStatusLabel } from "./source-evidence";
import { SIGNAL_MAST_STORM_SUPPLY_SHARE } from "./world-types";
import { deriveEpistemicHaze, quayHazeLabel, riskWaterHazeLabel } from "./epistemic-haze";
import { motionCadenceDetailLabel } from "./motion-config";
import { gardenMoonPhrase } from "./sky-almanac";

const usd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, style: "percent" });


export interface NowCaptionTransition {
  observedAt: number | null;
  symbol: string;
  toLabel: string;
}

export interface NowCaptionInput {
  arrivalAnnotation: string | null;
  beats: DayCycleBeats;
  freshness: PharosVilleFreshness;
  hour: number;
  latestTransition: NowCaptionTransition | null;
  psi: number | null;
  /**
   * X3: the PSI band, for the cover word ("a clear sky" … "overcast") the
   * painted cloud field draws. Omitted or unavailable → no cover word.
   */
  psiBand?: string | null;
  /** A first-visit teaching or the return-visit sentence; outranked only by a stale feed. */
  visitorLine?: string | null;
}

/**
 * The now-line as one sentence in three voices (W6.2): the minute clock (only
 * for the ambient phase), the phrase, and a quieter provenance clause. A
 * `warning` phrase is a truth warning (a stale feed): the line sets it roman
 * with a glyph so it never reads as poetry or relies on colour alone.
 */
export interface NowCaptionParts {
  clock: string | null;
  phrase: string;
  clause: string | null;
  warning: boolean;
}


function clockLabel(hourInput: number): string {
  const totalMinutes = Math.round((((Number.isFinite(hourInput) ? hourInput : 0) % 24) + 24) % 24 * 60) % (24 * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function observedTimeLabel(observedAt: number | null): string {
  if (observedAt === null || !Number.isFinite(observedAt) || observedAt <= 0) return "an unknown time";
  return new Date(observedAt).toISOString().slice(11, 16);
}

function dominantDayBeat(beats: DayCycleBeats): DayCycleBeatName {
  const names: DayCycleBeatName[] = ["dawn", "day", "golden", "blue", "night"];
  return names.reduce((dominant, candidate) => (
    beats[candidate] > beats[dominant] ? candidate : dominant
  ), names[0]!);
}

function phaseCaption(hour: number, beats: DayCycleBeats, psi: number | null): string {
  const beat = dominantDayBeat(beats);
  const watchful = psi !== null && Number.isFinite(psi) && psi < 50;
  if (beat === "golden") return "the golden hour";
  if (beat === "blue") return "the blue hour";
  const tone = watchful ? "watchful" : "quiet";
  if (beat === "dawn") return `a ${tone} dawn`;
  if (beat === "night") return `a ${tone} night`;
  if (hour >= 11 && hour < 13.5) return `a ${tone} noon`;
  return hour < 11 ? `a ${tone} morning` : `a ${tone} afternoon`;
}

/**
 * The caption's words without the minute clock. Its precedence is
 * deliberate: a stale feed is a truth warning and outranks everything, then a
 * visitor's teaching, then a ceremony is the present moment, then a market
 * move, then the ambient phase.
 */
function nowCaptionPhrase({
  arrivalAnnotation,
  beats,
  freshness,
  hour,
  latestTransition,
  psi,
  psiBand,
  visitorLine,
}: NowCaptionInput, moon: string | null = null): Omit<NowCaptionParts, "clock"> & { clocked: boolean } {
  const qualifiedKey = PHAROSVILLE_API_ENDPOINT_KEYS.find((key) => freshness[key].state !== "current");
  if (qualifiedKey) {
    const status = freshness[qualifiedKey];
    // One line beside the controls: the minute it was held since; the exact
    // as-of instant stays in the record and the ledger.
    const state = status.state === "stale"
      ? `held since ${observedTimeLabel(status.observedAt ?? status.publishedAt)}`
      : status.state;
    return {
      clocked: false,
      phrase: `${PHAROSVILLE_ENDPOINT_REGISTRY[qualifiedKey].label} ${state}`,
      clause: status.reason,
      warning: true,
    };
  }
  const unclocked = visitorLine || arrivalAnnotation || (latestTransition
    ? `${latestTransition.symbol} risk reading: ${latestTransition.toLabel}, observed ${observedTimeLabel(latestTransition.observedAt)}`
    : null);
  if (unclocked) return { clocked: false, phrase: unclocked, clause: null, warning: false };
  // X3: the sky's cover is a reading (market stability), so it is spoken too;
  // it changes only when an accepted PSI band does.
  const cover = skyCoverWord(psiBand);
  return {
    clocked: true,
    phrase: `${phaseCaption(hour, beats, psi)}${cover ? ` · ${cover}` : ""}${moon ? ` · ${moon}` : ""}`,
    clause: hasCompleteCurrentSources(freshness) ? "readings complete and current" : "endpoints current; coverage qualified",
    warning: false,
  };
}

/**
 * The visible scene caption in its three voices; the ambient phase leads with
 * the minute clock. After dusk the ambient slot also names the moon when it is
 * up (W2.6: the text equivalent of the disc). It is decorative, so it lives
 * only here and never in `nowCaptionAnnouncement` — the moon rising must not
 * speak.
 */
export function nowCaptionParts(input: NowCaptionInput): NowCaptionParts {
  const beat = dominantDayBeat(input.beats);
  // Low cloud and overcast hide the moon, so the line does not name it.
  const hidden = ["CRISIS", "MELTDOWN"].includes(input.psiBand?.toUpperCase() ?? "");
  const moon = (beat === "night" || beat === "blue") && !hidden ? gardenMoonPhrase(input.hour) : null;
  const { clocked, ...parts } = nowCaptionPhrase(input, moon);
  return { clock: clocked ? clockLabel(input.hour) : null, ...parts };
}

/** The now-line as one plain sentence: the text form of `nowCaptionParts`. */
export function nowCaption(input: NowCaptionInput): string {
  const { clock, phrase, clause } = nowCaptionParts(input);
  return `${clock ? `${clock} — ` : ""}${phrase}${clause ? ` · ${clause}` : ""}`;
}

/**
 * What the caption's status region speaks: the same phrase without the minute
 * clock, so a screen reader hears it only when the phrase itself changes.
 */
export function nowCaptionAnnouncement(input: NowCaptionInput): string {
  const { phrase, clause } = nowCaptionPhrase(input);
  return clause ? `${phrase} · ${clause}` : phrase;
}

function marketCapLabel(value: number): string {
  return Number.isFinite(value) && value > 0 ? usd.format(value) : "Unavailable";
}

/** X1: where the grave's stone lies in the stone garden, by cause family. */
export function gardenStoneLabel(family: GraveNode["visual"]["family"]): string {
  if (family === "lost-peg") return "A reclining stone in the west islands — the peg broke";
  if (family === "counterparty") return "An arching stone in the centre island — a counterparty failed";
  return "A flat stone in the east islands — wound down";
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

function formattedDays(days: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(days);
}

/**
 * W7.3 parity wording. Tracking-only evidence is named as a lower bound and a
 * missing profile explicitly says why the finish remains neutral; neither can
 * masquerade as a known launch date.
 */
export function shipAgeDetailLabel(node: ShipNode): string {
  const age = node.age;
  if (!age || age.source === "unavailable" || age.ageDays === null) {
    return "Unavailable — neutral finish; no launch or tracking history";
  }
  const tracked = age.trackingSpanDays === null
    ? null
    : `tracked ${formattedDays(age.trackingSpanDays)} days`;
  if (age.serviceSince) {
    return [
      age.serviceSince,
      tracked,
      `${age.era} hull`,
    ].filter(Boolean).join("; ");
  }
  if (age.source === "tracking-only") {
    return `Launch date unavailable; ${tracked ?? `tracked ${formattedDays(age.ageDays)} days`} (lower bound); ${age.era} hull`;
  }
  return [
    `about ${formattedDays(age.ageDays)} days in service`,
    tracked,
    `${age.era} hull`,
  ].filter(Boolean).join("; ");
}

/** Text intended verbatim for the accessibility-ledger ship clause. */
export function shipAgeLedgerClause(node: ShipNode): string {
  return `age patina ${shipAgeDetailLabel(node)}`;
}

/** PSI character and source qualification are separate, even in one lamp. */
export function lighthouseBeamCharacterLabel(): string {
  return "Beacon and beam character follow the Pharos Stability Index (PSI); Harbor light separately qualifies all seven sources. Warmth alone does not decode PSI.";
}

function lampAsOfLabel(generatedAt: number | null | undefined): string {
  if (generatedAt == null || !Number.isFinite(generatedAt) || generatedAt <= 0) return "unknown time";
  return new Date(generatedAt).toISOString().slice(11, 16);
}

/** The lighthouse detail row shared by the lamp cue's DOM parity surfaces. */
export function lighthouseLampStatusLabel(
  freshness?: PharosVilleFreshness,
  generatedAt?: number | null,
): string {
  return `${lampStatusReading(deriveLampStatus(freshness))}; snapshot as of ${lampAsOfLabel(generatedAt)}`;
}

export function chainLabel(chainId: string): string {
  return CHAIN_META[chainId]?.name ?? chainId;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Named risk waters describe their local surfaces; the sky belongs to PSI.
const AREA_NARRATIVES: Record<DewsAreaBand, string> = {
  CALM: "steady water, where ships with clean peg evidence ride at anchor.",
  WATCH: "early-warning water, where the signals worth watching gather.",
  ALERT: "a channel under building pressure, where elevated alerts take their berth.",
  WARNING: "shallow, hazardous shoals, where serious peg stress runs aground.",
  DANGER: "critical-risk water, where live depegs and critical risk take their berth.",
};

/** Shared verbatim by area details and the accessibility ledger. */
export function atmosphereForArea(area: AreaNode): string {
  const surface = waterSurfaceForArea(area);
  return `${surface ?? "No risk-surface classification"}; sky and far-shore clarity follow fleet PSI, not this water's DEWS band`;
}

// K7 (Hour-Print W3.3): the water itself carries each body's reading as the
// state of its surface — how much sky it holds and which engraved crest line
// it prints — with hue a quiet second voice. These are the DOM words for it.
const WATER_SURFACE_BY_ZONE: Record<ShipWaterZone, string> = {
  calm: "Glass — a still mirror of sky and tower, no drawn lines",
  watch: "Ripple — long, slowly bending crest lines",
  alert: "Streaks — broken current lines along the channel",
  warning: "Chop — short broken dashes over pale shoals",
  danger: "Leaden — dense steady lines on dark, matte water that mirrors little",
  ledger: "Glass — a flat, faintly striated mirror, no drawn lines",
};

const WATER_ZONE_BY_BAND: Record<DewsAreaBand, ShipWaterZone> = {
  CALM: "calm",
  WATCH: "watch",
  ALERT: "alert",
  WARNING: "warning",
  DANGER: "danger",
};

/** The named water's surface state, as the sea itself draws it; null for unbanded waters. */
export function waterSurfaceForArea(area: Pick<AreaNode, "band" | "riskZone">): string | null {
  const zone = area.band ? WATER_ZONE_BY_BAND[area.band] : area.riskZone;
  return zone ? WATER_SURFACE_BY_ZONE[zone] : null;
}

function stationTypeLabel(type: DockNode["station"]["type"]): string {
  return type.split("-").map((part) => part[0]!.toUpperCase() + part.slice(1)).join(" ");
}

export function chainsPresentLabel(node: ShipNode): string {
  if (node.chainPresence.length === 0) return "0 positive chain deployments";
  const topChains = node.chainPresence
    .slice(0, 3)
    .map((presence) => `${chainLabel(presence.chainId)} ${percent.format(presence.share)}`)
    .join(", ");
  const remainingCount = node.chainPresence.length - 3;
  const suffix = remainingCount > 0 ? `, +${remainingCount} more` : "";
  return `${pluralize(node.chainPresence.length, "positive chain deployment")}: ${topChains}${suffix}`;
}

export function chainFootprintLabel(node: ShipNode): string {
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
  return `${footprint}; ${pluralize(chainCount, "positive chain deployment")}, ${pluralize(renderedDockCount, "rendered dock stop")}`;
}

// E2: format change24hPct (percent units, e.g. 10 = +10%) for the detail panel.
function change24hPctLabel(change24hPct: number | null): string {
  if (change24hPct == null) return "—";
  const rounded = Math.round(change24hPct * 10) / 10;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const sign = normalized > 0 ? "+" : "";
  return `${sign}${normalized.toFixed(1)}%`;
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

// PSI score is higher-is-better (BEDROCK ~100 … MELTDOWN ~0), so a positive
// drift above the 24h average means the fleet is stabilizing.
function trendDirection(value: number, threshold: number): "improving" | "steady" | "deteriorating" {
  if (Math.abs(value) < threshold) return "steady";
  return value > 0 ? "improving" : "deteriorating";
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
 * shared gate of 3+ events or a worst deviation beyond +/-3%. The same value
 * drives the hull-weathering render intensity and the "Depeg history"
 * detail/ledger row, so the canvas cue and its DOM parity always agree.
 */
export function depegHistorySeverity(history: ShipNode["depegHistory"]): number {
  if (!history || history.eventCount <= 0) return 0;
  const byCount = history.eventCount >= 3 ? Math.min(1, history.eventCount / 12) : 0;
  const worst = history.worstDeviationBps ?? 0;
  const absWorst = Math.abs(worst);
  const byWorst = absWorst >= 300 ? Math.min(1, absWorst / 2000) : 0;
  return Math.max(byCount, byWorst);
}

function signedBpsPercentLabel(value: number): string {
  const percentage = value / 100;
  const sign = percentage > 0 ? "+" : "";
  return `${sign}${percentage.toFixed(1)}%`;
}

// "3 events on record; worst -8.2%; last 2026-05-30" — null when the record
// is empty or below the shared significance gate (see depegHistorySeverity).
export function depegHistoryLabel(history: ShipNode["depegHistory"]): string | null {
  if (!history || depegHistorySeverity(history) <= 0) return null;
  const parts = [`${pluralize(history.eventCount, "event")} on record`];
  if (history.worstDeviationBps != null) {
    parts.push(`worst ${signedBpsPercentLabel(history.worstDeviationBps)}`);
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
 * sources. The value drives the "Source consensus" fold in the Market cap
 * detail row.
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

export function safetyGradeLabel(safetyGrade: ShipNode["safetyGrade"]): string | null {
  if (!safetyGrade || safetyGrade.grade === "NR") return null;
  if (safetyGrade.score == null || !Number.isFinite(safetyGrade.score)) {
    return `Safety ${safetyGrade.grade}`;
  }
  return `Safety ${safetyGrade.grade} (score ${Math.round(safetyGrade.score)})`;
}

function representativePositionLabel(node: ShipNode): string {
  if (node.riskPlacement === "ledger-mooring") return "Ledger Mooring idle";
  return `${node.riskWaterLabel} idle`;
}

export function dewsScoreLabel(
  node: Pick<ShipNode, "dewsScore" | "evidence">,
): string | null {
  const score = node.dewsScore;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const status = node.evidence.stress;
  const qualifier = !status ? "evidence unavailable" : status.state !== "current" ? sourceStatusLabel(status)
    : status.coverage.state !== "complete" ? sourceCoverageLabel(status) : null;
  return `DEWS ${Math.round(Math.max(0, Math.min(100, score)))}/100${qualifier ? ` — ${qualifier}` : ""}`;
}

export function evidenceStatusLabel(node: ShipNode): string {
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
  const movers = node.notableMovers ?? [];
  return {
    id: node.detailId,
    kind: node.kind,
    title: `${node.label} — PharosWatch dispatch`,
    summary:
      "Carrier-pigeon loft of the harbor watch. Subscribe to receive stablecoin depeg and safety-score alerts via the PharosWatch Telegram bot.",
    facts: [
      { label: "Channel", value: "PharosWatch" },
      { label: "Alerts", value: "Stablecoin depegs and safety-score changes" },
      {
        label: "Depeg roost",
        value: node.roost
          ? pigeonnierRoostLabel(node.roost)
          : "Unavailable — no peg summary to count",
      },
      {
        label: "Notable movers",
        value: movers.length > 0
          ? movers.map((mover) => mover.symbol).join(", ")
          : "None today",
      },
    ],
    links: [{ label: "Subscribe on Telegram", href: PHAROS_WATCH_TELEGRAM_HREF, target: "_blank" }],
    ...(movers.length > 0 ? {
      membersHeading: "Today's notable movers",
      members: movers.map((mover) => ({
        href: analyticalRouteHref(`/stablecoin/${mover.id}/`),
        id: mover.id,
        inWorldDetailId: mover.detailId,
        label: mover.symbol,
        value: `${mover.change24hUsdLabel}; ${mover.change24hPctLabel}; ${mover.riskWaterLabel}`,
      })),
    } : {}),
  };
}

/**
 * What the observatory hoist is showing, in words — the DOM parity for the
 * signal mast. Describes the CLOTH first and then what it stands for: a reader
 * who cannot see the mast should be able to picture it — pennants for the
 * largest coins by supply that are off peg, a cone only when enough of the
 * tracked supply is off peg — and then read the figures.
 */
export function signalMastLabel(mast: LighthouseNode["signalMast"]): string {
  if (!mast || mast.unavailable) return "Bare — no peg summary tonight";
  if (mast.leaderCount === 0 || mast.offPegSupplyShare === null) {
    return "Bare — no supply figures to weigh the peg readings against";
  }
  const leaders = `the ${mast.leaderCount} largest coins by supply`;
  const hoist = mast.leadersOffPeg.length === 0
    ? `none of ${leaders} off peg`
    : `${pluralize(mast.pennantCount, "pennant")} for ${mast.leadersOffPeg.join(", ")} — ${mast.leadersOffPeg.length} of ${leaders} off peg${mast.capped ? " (hoist caps the count)" : ""}`;
  const share = `${supplySharePercentLabel(mast.offPegSupplyShare)} of tracked supply off peg`;
  const gate = supplySharePercentLabel(SIGNAL_MAST_STORM_SUPPLY_SHARE);
  const cone = mast.stormCone
    ? `storm cone hoisted — ${share}`
    : `no storm cone — ${share}, under the ${gate} gate`;
  return `${mast.pennantCount === 0 && !mast.stormCone ? "Bare — " : ""}${hoist}; ${cone}`;
}

/** A supply share as a percentage precise enough to sit either side of a 1% gate. */
function supplySharePercentLabel(share: number): string {
  if (share <= 0) return "0%";
  if (share < 0.0001) return "under 0.01%";
  const figure = (share * 100).toFixed(share < 0.1 ? 2 : 1).replace(/\.?0+$/, "");
  return `${figure}%`;
}

/**
 * The figures behind the hoist. Null when there is no summary to read, so the
 * row is omitted rather than padded with unavailables.
 */
export function fleetPegLabel(mast: LighthouseNode["signalMast"]): string | null {
  if (!mast || mast.unavailable) return null;
  const parts: string[] = [];
  if (mast.worstBps !== null) {
    const symbol = mast.worstSymbol ? `${mast.worstSymbol} ` : "";
    parts.push(`Worst ${symbol}${signedBpsPercentLabel(mast.worstBps)}`);
  }
  if (mast.medianDeviationBps !== null) {
    parts.push(`median ${basisPointsLabel(mast.medianDeviationBps)}`);
  }
  if (mast.coinsAtPeg !== null && mast.totalTracked !== null) {
    parts.push(`${mast.coinsAtPeg} of ${mast.totalTracked} at peg`);
  }
  if (mast.eventsToday !== null) {
    parts.push(`${pluralize(mast.eventsToday, "event")} today`);
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

/**
 * The worst PSI band of the trailing 30 days, in words: how far the index fell
 * and how much window there was to fall in. A DOM record (X2 retired its salt
 * courses on the terrace).
 *
 * Never says "calm". A BEDROCK record says the index never left its calmest
 * band — a claim about the RECORD — while an absent history says nothing was
 * read, which is a claim about the evidence. The two must not collapse into
 * one sentence.
 */
export function highWaterMarkLabel(mark: LighthouseNode["highWaterMark"]): string {
  if (!mark || mark.unavailable) return "Unavailable — no index history to read";
  const window = mark.spanDays > 0
    ? `${pluralize(mark.spanDays, "day")} on record`
    : "a single reading on record";
  const score = mark.score === null ? "" : ` at PSI ${formatPsiNumber(mark.score)}`;
  const dated = depegEventDateLabel(mark.at);
  const when = dated ? ` on ${dated}` : "";
  if (mark.severity === 0) {
    return `${mark.band}${score}${when} — the index never left its calmest band; ${window}`;
  }
  return `${mark.band}${score}${when}; ${window}`;
}

/**
 * Where the beam is holding. The wording is fixed: "largest PSI contributor",
 * which states the arithmetic and nothing else. The panel's own top-contributor
 * list stays the ground truth; this row only says which of those rows the light
 * is pointing at.
 */
export function beamDwellLabel(dwell: LighthouseNode["beamDwell"]): string | null {
  if (!dwell) return null;
  return `Holding on ${dwell.symbol}, largest PSI contributor (${basisPointsLabel(dwell.bps)})`;
}

/**
 * Flight to quality, in words.
 *
 * The canvas puts tenders on the water round the biggest hulls; this says the
 * same thing outright, and it is the only place the reader learns what those
 * boats are. The row exists whenever the mint/burn gauge landed, so "the gauge
 * says no flight" and "no gauge arrived" stay apart: the first reads here, the
 * second leaves the row off entirely. An empty sea means either, which is why
 * it can never be the only account of this signal.
 */
export function flightToQualityLabel(
  issuance: PharosVilleWorld["fleetIssuance"] | undefined,
): string | null {
  if (!issuance) return null;
  if (issuance.flightToQuality === null) return "Unavailable — incomplete USD valuation; no tenders on the water";
  if (!issuance.flightToQuality) return "None reported — no tenders on the water";
  const intensity = issuance.flightIntensity !== null && Number.isFinite(issuance.flightIntensity)
    ? `${Math.round(Math.abs(issuance.flightIntensity))} of 100`
    : "unavailable";
  return `Active — capital rotating toward the strongest issuers (intensity ${intensity}); tenders run in on the largest hulls`;
}

export function detailForLighthouse(
  node: LighthouseNode,
  supplyTide?: SupplyTide,
  fleetIssuance?: PharosVilleWorld["fleetIssuance"],
  freshness?: PharosVilleFreshness,
  generatedAt?: number | null,
): DetailModel {
  const tide = supplyTideLabel(supplyTide);
  const flightToQuality = flightToQualityLabel(fleetIssuance);
  const trend = psiTrendLabel(node);
  const composition = psiCompositionLabel(node);
  const fleetPeg = fleetPegLabel(node.signalMast);
  const beamDwell = beamDwellLabel(node.beamDwell);
  const contributors = node.contributors ?? [];
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.label,
    summary: node.unavailable
      ? "Market stability is unavailable; the sky holds its authored neutral clarity."
      : `Market stability reads ${node.psiBand}. Sky clarity correlates with the observed PSI band; it is not a weather or market forecast.${node.evidence.stability?.state !== "current" ? " PSI is held; appearance holds the last accepted current reading." : ""}`,
    facts: [
      { label: "Score", value: node.score == null || node.unavailable ? "Unavailable" : String(node.score) },
      { label: "Band", value: node.psiBand ?? "Unavailable" },
      { label: "Market stability", value: `${nodeSourceEvidenceLabel(node.evidence) || "PSI unavailable; observed unknown"}. Sky appearance is delayed and eases separately (60 continuous current seconds); held evidence holds the last accepted appearance, or neutral if none.` },
      { label: "Far shore", value: farShoreLabel(node.psiBand, node.unavailable) },
      { label: "Sky cover", value: skyCoverLabel(node.psiBand, node.unavailable) },
      { label: "Snapshot as of", value: generatedAt != null && Number.isFinite(generatedAt) && generatedAt > 0 ? new Date(generatedAt).toISOString() : "Unavailable" },
      ...(trend ? [{ label: "Trend", value: trend }] : []),
      ...(composition ? [{ label: "Composition", value: composition }] : []),
      { label: "Beam character", value: lighthouseBeamCharacterLabel() },
      { label: "Harbor light", value: lighthouseLampStatusLabel(freshness, generatedAt) },
      ...(beamDwell ? [{ label: "Beam bearing", value: beamDwell }] : []),
      { label: "Worst band, 30d", value: highWaterMarkLabel(node.highWaterMark) },
      { label: "Garden record, 30d", value: gardenMonthRecordLabel(node.gardenMonthRecord) },
      ...(tide ? [{ label: "Supply tide 7d", value: tide }] : []),
      ...(flightToQuality ? [{ label: "Flight to quality", value: flightToQuality }] : []),
      { label: "Signal mast", value: signalMastLabel(node.signalMast) },
      ...(fleetPeg ? [{ label: "Fleet peg", value: fleetPeg }] : []),
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
    ...(node.longRecord ? { longRecord: node.longRecord } : {}),
    ...(node.gardenMonthRecord ? { gardenMonthRecord: node.gardenMonthRecord } : {}),
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

/** `+$7.2M` / `-$3.0M` — sign first, because the sign IS the reading here. */
function signedCompactUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "unavailable";
  const magnitude = formatCompactUsd(Math.abs(value));
  return `${value < 0 ? "-" : "+"}${magnitude}`;
}

/** Fleet gross that could not be allocated to rendered quays, not missing issuance. */
export function unattributedIssuanceLabel(
  allocation: NonNullable<PharosVilleWorld["fleetIssuance"]>["unattributed"],
): string | null {
  if (!allocation) return null;
  const reasons = Object.entries(allocation.byReason)
    .filter(([, grossUsd]) => grossUsd > 0)
    .map(([reason, grossUsd]) => `${reason}: ${formatCompactUsd(grossUsd)}`);
  return `Fleet unattributed gross 24h: ${formatCompactUsd(allocation.grossUsd)}${reasons.length > 0 ? ` — ${reasons.join("; ")}` : ""}`;
}

/**
 * The harbour's 24h issuance, in words.
 *
 * The canvas cue puts cargo on the pier for minting and on the quay for
 * burning; this row is the same statement in text, and it must never be vaguer
 * than the crates. So the DIRECTION is named outright rather than left to be
 * inferred from a sign, and the gross mint and burn behind the net figure are
 * quoted so a small net between two large flows cannot read as a quiet day.
 *
 * An untracked harbour says so. "This chain's issuance is not measured" and
 * "this chain issued nothing" are opposite claims about the world, and a blank
 * or a zero would collapse them.
 */
export function cargoTideLabel(tide: DockNode["cargoTide"]): string | null {
  if (!tide) return null;
  const unattributed = unattributedIssuanceLabel(tide.unattributed);
  const disclosure = `\n${nodeSourceEvidenceLabel({ mintBurn: tide.evidence })}${unattributed ? `\n${unattributed}` : ""}`;
  if (!tide.tracked) {
    const reading = tide.reason === "chain-not-in-scope" ? "Not measured on this chain"
      : tide.reason === "scope-unreported" ? "Unavailable — issuance scope unreported"
      : tide.reason === "unattributed" ? "Unavailable — 24h issuance could not be matched to this harbor's coins"
      : "Unavailable — no issuance feed";
    return `${reading}${disclosure}`;
  }
  const volumes = `mint ${formatCompactUsd(tide.mintVolumeUsd)}, burn ${formatCompactUsd(tide.burnVolumeUsd)}${tide.completeWindow ? "" : " (known-valuation subtotal lower bounds)"}`;
  const allocationBasis = "Estimated 24h allocation by held supply across the reported scope: ";
  const reading = tide.direction === "minting" ? `${signedCompactUsd(tide.netFlowUsd)} minting — ${volumes}`
    : tide.direction === "burning" ? `${signedCompactUsd(tide.netFlowUsd)} burning — ${volumes}`
    : tide.direction === "flat" ? `Balanced — ${volumes}`
    : tide.completeWindow ? "No issuance activity in 24h" : `Activity unmeasured — retained ${volumes}`;
  return `${allocationBasis}${reading}${disclosure}`;
}

/**
 * The tide line, in words.
 *
 * The canvas puts the strandline against a fixed datum notch; this says the
 * same thing outright. Direction is NAMED ("rising"/"falling") rather than left
 * to the sign, and the figure is quoted to two decimals because a fleet this
 * size moves in hundredths of a percent and one decimal would round most real
 * weeks to "0.0%".
 */
export function supplyTideLabel(tide: SupplyTide | undefined): string | null {
  if (!tide || tide.state === "unavailable") return null;
  const figure = `${tide.change7dPct! > 0 ? "+" : ""}${tide.change7dPct!.toFixed(2)}%`;
  // X2: the words for what the tidal flat shows (its offset is √-compressed
  // against a 2% week, so "mostly" starts at a 0.5% move).
  const extent = Math.abs(tide.offset) >= 0.5 ? "mostly" : "partly";
  switch (tide.state) {
    case "flood":
      return `${figure} rising — supply grew this week; the tidal flat stands ${extent} covered`;
    case "ebb":
      return `${figure} falling — supply shrank this week; the tidal flat lies ${extent} bare`;
    default:
      return `${figure} slack — supply held flat this week; the water stands at the tide-stone`;
  }
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

/**
 * Tier 3 #13: is this harbour filling or draining?
 *
 * `chains[].change24hPct` and `change7dPct` have been arriving in the browser
 * since the world was built and nothing has read them. Deliberately worded as
 * "held supply" so it cannot be confused with the Net flow 24h row beside it,
 * which counts issuance — coins minted and burned. Supply that bridges onto a
 * chain moves this figure and not that one.
 */
export function dockSupplyChangeLabel(node: Pick<DockNode, "change24hPct">): string | null {
  const day = finiteNumber(node.change24hPct);
  if (day === null) return null;
  return `${change24hPctLabel(day)} held supply`;
}

/** The 7d window on the same reading; folds into the 24h row. */
export function dockSupplyMomentumLabel(node: Pick<DockNode, "change7dPct">): string | null {
  const week = finiteNumber(node.change7dPct);
  if (week === null) return null;
  return `7d ${change24hPctLabel(week)}`;
}

export function dockConcentrationLabel(concentration: DockNode["concentration"]): string | null {
  if (concentration == null || !Number.isFinite(concentration)) return null;
  const clamped = Math.max(0, Math.min(1, concentration));
  const descriptor = clamped < 0.25 ? "diversified" : clamped < 0.45 ? "moderately concentrated" : "concentrated";
  return `${descriptor} (HHI ${clamped.toFixed(2)})`;
}

export interface DockDetailContext {
  freshness?: PharosVilleFreshness;
  inWorldDetailIds?: ReadonlySet<string>;
}

function matchingShipDetailId(stablecoinId: string, inWorldDetailIds: ReadonlySet<string> | undefined): string | undefined {
  const detailId = `ship.${stablecoinId}`;
  return inWorldDetailIds?.has(detailId) ? detailId : undefined;
}

export function detailForDock(node: DockNode, context: DockDetailContext | number = {}): DetailModel {
  const inWorldDetailIds = typeof context === "number" ? undefined : context.inWorldDetailIds;
  const haze = deriveEpistemicHaze(typeof context === "number" ? undefined : context.freshness);
  const topSymbols = node.harboredStablecoins.map((coin) => coin.symbol).join(", ");
  const stationType = stationTypeLabel(node.station.type);
  const backingDiversity = backingDiversityLabel(node.backingDiversity);
  const quayMasonry = quayMasonryLabel(node);
  const supplyChange = dockSupplyChangeLabel(node);
  const supplyMomentum = dockSupplyMomentumLabel(node);
  const netFlow24h = cargoTideLabel(node.cargoTide);
  const harborRank = harborRankLabel(node.harborRank, node.harborCount);
  const supplyShare = stablecoinSupplyShareLabel(node.shareOfGlobal);
  const concentration = dockConcentrationLabel(node.concentration);
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.label,
    summary: topSymbols
      ? `${stationType} at ${node.station.coveId}, harboring ${topSymbols}. Its size follows the stablecoin supply held on this chain — not bridge traffic, not transfers.`
      : `${stationType} at ${node.station.coveId}. Its size follows the stablecoin supply held on this chain — not bridge traffic, not transfers.`,
    facts: [
      { label: "Stablecoin supply", value: usd.format(node.totalUsd) },
      ...(harborRank ? [{ label: "Harbor rank", value: harborRank }] : []),
      ...(supplyShare ? [{ label: "Share of stablecoin supply", value: supplyShare }] : []),
      ...(concentration ? [{ label: "Concentration", value: concentration }] : []),
      { label: "Stablecoin count", value: String(node.stablecoinCount) },
      { label: "Health", value: node.healthBand ?? "Unavailable" },
      ...(backingDiversity ? [{ label: "Backing diversity", value: backingDiversity }] : []),
      ...(quayMasonry ? [{ label: "Quay condition", value: quayMasonry }] : []),
      // The two windows share one row (`buildDetailFactSections` folds
      // "Supply momentum" into the 24h row), so the harbour's direction reads as
      // one line rather than two competing ones.
      ...(supplyChange ? [{ label: "24h supply change", value: supplyChange }] : []),
      ...(supplyMomentum ? [{ label: "Supply momentum", value: supplyMomentum }] : []),
      ...(netFlow24h ? [{ label: "Net flow 24h", value: netFlow24h }] : []),
      { label: "Station type", value: stationType },
      { label: "Rim cove", value: node.station.coveId },
      ...(haze.quays ? [{ label: "Quay haze", value: quayHazeLabel(haze) }] : []),
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

// C4 observatory voice: the panel summary tells the ship's story in the
// world's maritime register; the raw evidence reason stays available to the
// ledger and evidence rows. Keyed by the canonical placement-evidence reason
// strings from risk-placement.ts, falling back to the raw reason for any
// wording this map does not know.
const PLACEMENT_NARRATIVES: Record<string, string> = {
  "Active depeg event": "A live depeg has driven this ship into storm water.",
  "Current peg deviation": "The live peg reading is holding this ship off the calm anchorage.",
  "DEWS stress escalation": "Early-warning stress set this berth; nothing has broken yet.",
  "NAV token Ledger Mooring idle preference":
    "A NAV-priced ledger asset, moored where attestation — not the market peg — sets the price.",
  "Active depeg evidence is stale": "The last depeg evidence has gone stale, so this ship rides calm water under caveat.",
  "Missing or low-confidence price evidence": "Price evidence is thin here, so this ship rides calm water under caveat.",
  "Risk evidence is stale": "Risk evidence has gone stale, so this ship rides calm water under caveat.",
  "No active peg or DEWS stress": "Sailing clean — no active peg break, no early-warning stress.",
};

export function placementNarrative(reason: string): string {
  return PLACEMENT_NARRATIVES[reason] ?? reason;
}

/** Nav/yield mast-signal parity: the drawn square must be explained in the
    detail panel and ledger (VISUAL_INVARIANTS parity rule). The overlay is
    exclusive: nav wins over yield, both over safety-watch. */
export function mastSignalLabel(node: Pick<ShipNode, "visual">): string | null {
  if (node.visual.overlay === "nav") return "NAV-priced (blue mast signal)";
  if (node.visual.overlay === "yield") return "Yield-bearing (gold mast signal)";
  return null;
}

/** "The peg reading itself is the promise": live signed deviation vs the peg. */
export function pegDeviationLabel(node: Pick<ShipNode, "pegDeviationBps" | "pegCurrency">): string | null {
  const bps = node.pegDeviationBps;
  if (typeof bps !== "number" || !Number.isFinite(bps)) return null;
  const rounded = Math.round(bps);
  // A typographic minus (U+2212), not a hyphen: it reads as a sign, not a dash.
  const sign = rounded > 0 ? "+" : rounded < 0 ? "\u2212" : "";
  const currency = node.pegCurrency || "peg";
  return `${sign}${Math.abs(rounded)} bps vs ${currency}`;
}

/**
 * Tier 3 #13: the same reading, with its DIRECTION said out loud.
 *
 * A leading `+` or `-` is a sign, not a statement, and the two directions mean
 * opposite things: above par is demand outrunning redemption, below par is
 * redemption pressure. This is the DOM parity for `cue.ship.peg-trim`, so the
 * trim clause is read off the hull's actual `waterline` rather than recomputed
 * from bps — a stale peg row leaves the hull level and this row silent about
 * trim, in one place, by construction.
 */
export function pegDeviationFactLabel(
  node: Pick<ShipNode, "pegDeviationBps" | "pegCurrency" | "visual">,
): string | null {
  const reading = pegDeviationLabel(node);
  if (reading === null) return null;
  const rounded = Math.round(node.pegDeviationBps as number);
  const direction = rounded > 0 ? "above peg" : rounded < 0 ? "below peg" : "at peg";
  const waterline = node.visual?.hullForm?.waterline ?? 0;
  const trim = waterline > 0
    ? "; hull rides high"
    : waterline < 0 ? "; hull rides low" : "";
  return `${reading} — ${direction}${trim}`;
}

const priceFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 4,
  style: "currency",
  currency: "USD",
});

/**
 * The two bearings and the evidence behind the second one.
 *
 * Non-null whenever a check RAN, agreeing or not, because the ledger is the
 * exhaustive record and "the pipeline checked and the two agreed" is worth
 * saying there. The panel spends a row only on the disagreement — see
 * `detailForShip` — so the ship panel keeps its density while the sr-only
 * ledger keeps the whole story. Absent returns null and no surface says
 * anything, which is the only honest reading of a check that never ran.
 */
export function dexCrossCheckLabel(check: ShipNode["dexCrossCheck"]): string | null {
  if (!check) return null;
  const dex = `DEX ${priceFormat.format(check.dexPrice)} (${basisPointsLabel(check.dexDeviationBps)})`;
  const oracle = check.oraclePrice === null
    ? (check.oracleDeviationBps === null ? null : `feed ${basisPointsLabel(check.oracleDeviationBps)}`)
    : `feed ${priceFormat.format(check.oraclePrice)}${
      check.oracleDeviationBps === null ? "" : ` (${basisPointsLabel(check.oracleDeviationBps)})`
    }`;
  const evidence = `${pluralize(check.sourcePools, "pool")}, ${formatCompactUsd(check.sourceTvlUsd)} TVL`;
  const heading = check.agrees
    ? "Both bearings agree"
    : "Bearings cross — the two readings disagree";
  return [heading, [dex, oracle].filter(Boolean).join(" vs "), evidence].join("; ");
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
  // Significance-gated qualifiers fold into authored host rows: D10 permits
  // at most 11 core ship rows, including Formation and a DEX exception.
  const priceConfidence = priceConfidenceLabel(node.asset);
  const sourceConsensus = sourceConsensusLabel(node.asset);
  const safetyGrade = safetyGradeLabel(node.safetyGrade);
  const stressDriver = stressBreakdownLabel(node);
  const dewsScore = dewsScoreLabel(node);
  // The header figure stays the bare reading — it is a headline number, not a
  // sentence — while the fact row carries the direction and the trim.
  const pegDeviation = pegDeviationLabel(node);
  const pegDeviationFact = pegDeviationFactLabel(node);
  const mastSignal = mastSignalLabel(node);
  // 3b: the cross-check earns a row of its own ONLY when the two instruments
  // disagree. Agreement is the fleet's normal state, so a row for it would land
  // on nearly every ship and buy nothing; the ledger carries that case instead.
  // A disagreement is a caveat on the peg figure in the panel's header, and
  // burying it inside a fold with three other price qualifiers is exactly how a
  // reader would miss it.
  const dexCrossCheck = node.dexCrossCheck?.agrees === false
    ? dexCrossCheckLabel(node.dexCrossCheck)
    : null;
  const facts = [
    ...(pegDeviationFact ? [{ label: "Peg deviation", value: pegDeviationFact }] : []),
    { label: "Market cap", value: marketCapLabel(node.marketCapUsd) },
    ...(fleetRank ? [{ label: "Fleet rank", value: fleetRank }] : []),
    ...(fleetShare ? [{ label: "Share of fleet", value: fleetShare }] : []),
    ...(priceConfidence ? [{ label: "Price confidence", value: priceConfidence }] : []),
    ...(sourceConsensus ? [{ label: "Source consensus", value: sourceConsensus }] : []),
    ...(dexCrossCheck ? [{ label: "DEX cross-check", value: dexCrossCheck }] : []),
    { label: "24h supply change", value: change24hPctLabel(node.change24hPct) },
    ...(momentum ? [{ label: "Supply momentum", value: momentum }] : []),
    ...(depegHistory ? [{ label: "Depeg history", value: depegHistory }] : []),
    { label: "In service since / tracked", value: shipAgeDetailLabel(node) },
    { label: "Cycle tempo", value: cycleTempoDetailLabel(cycleTempo) },
    ...(safetyGrade ? [{ label: "Safety grade", value: safetyGrade }] : []),
    { label: "Route cadence", value: motionCadenceDetailLabel() },
    { label: "Issuance work, 24h", value: shipIssuanceDetailLabel(node) },
    { label: "Ship class", value: node.visual.classLabel },
    { label: "Size tier", value: node.visual.sizeLabel },
    ...(mastSignal ? [{ label: "Mast signal", value: mastSignal }] : []),
    ...(node.visual.uniqueRationale
      ? [{ label: "Cultural significance", value: node.visual.uniqueRationale }]
      : []),
    { label: "Ship livery", value: shipLiveryLabel(node) },
    { label: "Representative position", value: representativePositionLabel(node) },
    { label: "Risk water area", value: node.riskWaterLabel },
    { label: "Risk water zone", value: node.riskZone },
    { label: "Risk placement key", value: node.riskPlacement },
    ...(dewsScore ? [{ label: "DEWS score", value: dewsScore }] : []),
    ...(stressDriver ? [{ label: "Stress driver", value: stressDriver }] : []),
    ...riskTransitionFact,
    { label: "Home dock", value: node.homeDockChainId ? chainLabel(node.homeDockChainId) : "No rendered dock" },
    { label: "Chains present", value: chainsPresentLabel(node) },
    { label: "Chain footprint", value: chainFootprintLabel(node) },
    ...(formationLine ? [{ label: "Sailing in formation", value: formationLine }] : []),
    ...(overrideBanner ? [{ label: "Squad override", value: overrideBanner }] : []),
    { label: "Route source", value: "stablecoins.chainCirculating, pegSummary.coins[], stress.signals[]" },
    { label: "Evidence status", value: evidenceStatusLabel(node) },
    { label: "Source observations", value: nodeSourceEvidenceLabel(node.evidence) },
    { label: "Evidence", value: node.placementEvidence.sourceFields.join(", ") },
  ];

  const zoneArea = RISK_WATER_AREAS[node.riskPlacement];
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.label,
    summary: placementNarrative(node.placementEvidence.reason),
    status: {
      swatchColor: zoneThemeForTerrain(zoneArea.terrain).base,
      label: zoneArea.label,
      reading: zoneArea.reading,
      ...(pegDeviation ? { figure: pegDeviation } : {}),
    },
    facts,
    links: [{ label: "Stablecoin", href: analyticalRouteHref(`/stablecoin/${node.id}/`) }],
  };
}

export function detailForGrave(node: GraveNode): DetailModel {
  const causeLabel = CAUSE_META[node.entry.causeOfDeath]?.label ?? node.entry.causeOfDeath;
  const sourceLink: (DetailModel["links"][number] & { rel: "noopener noreferrer" }) | null = isHttpUrl(node.entry.sourceUrl)
    ? {
        label: node.entry.sourceLabel,
        href: node.entry.sourceUrl,
        target: "_blank",
        rel: "noopener noreferrer",
      }
    : null;
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.entry.name,
    summary: node.entry.epitaph ?? "",
    paragraphs: [node.entry.obituary],
    facts: [
      { label: "Symbol", value: node.entry.symbol },
      { label: "Cause", value: causeLabel },
      { label: "Stone garden", value: gardenStoneLabel(node.visual.family) },
      { label: "Date", value: node.entry.deathDate },
      ...(node.entry.peakMcap != null && Number.isFinite(node.entry.peakMcap)
        ? [{ label: "Peak market cap", value: usd.format(node.entry.peakMcap) }]
        : []),
    ],
    links: [
      { label: "Cemetery", href: analyticalRouteHref("/cemetery/") },
      ...(sourceLink ? [sourceLink] : []),
    ],
  };
}

export function detailForArea(node: AreaNode, freshness?: PharosVilleFreshness): DetailModel {
  const haze = deriveEpistemicHaze(freshness);
  const waterSurface = waterSurfaceForArea(node);
  return {
    id: node.detailId,
    kind: node.kind,
    title: node.label,
    summary: node.summary ?? (node.band
      ? `${node.label}: ${AREA_NARRATIVES[node.band]}`
      : `${node.label} is a named water area.`),
    facts: [
      ...(node.band ? [{ label: "DEWS band", value: node.band }] : []),
      ...(node.count != null ? [{ label: "Stablecoins", value: String(node.count) }] : []),
      ...(node.riskZone ? [{ label: "Risk water zone", value: node.riskZone }] : []),
      ...(node.riskPlacement ? [{ label: "Risk placement", value: node.riskPlacement }] : []),
      { label: "Atmosphere", value: atmosphereForArea(node) },
      ...(waterSurface ? [{ label: "Water surface", value: waterSurface }] : []),
      ...(haze.riskWaters ? [{ label: "Risk-water haze", value: riskWaterHazeLabel(haze) }] : []),
      ...(node.facts ?? []),
      ...(node.sourceFields?.length ? [{ label: "Source fields", value: node.sourceFields.join(", ") }] : []),
    ],
    links: node.links?.map((link) => ({ ...link, href: analyticalRouteHref(link.href) }))
      ?? [{ label: "DEWS", href: analyticalRouteHref("/depeg/") }],
  };
}
