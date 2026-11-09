/**
 * The one-fact lines and the "why it is here" sentences. Pure functions of (model, whereabouts),
 * so the hover tag, the panel and the tests all read the same words.
 */
import type { Boat, DewsBand, HarbourModel, StormSignalShape } from "../model/types";
import { mastForBand, type OfficeState } from "../readings/bind";
import { deadSummaries, FAMILIES } from "../model/obituary";
import { bps, money, monthYear, pctChange, share, titleCase } from "./format";
import { flowValued, flowWindow, grossFlow, NET_UNAVAILABLE, VALUATION_UNKNOWN } from "./flow-copy";
import { observedEmpty, readingCoverage, readingSentence, sourceTruth } from "./source-state";

export type WhereKind = "alongside" | "moored" | "casting-off" | "sailing" | "outing" | "shoals" | "wreck" | "far" | "route-unavailable" | "unknown";
export interface Whereabouts { kind: WhereKind; /** Chain name, "the Far Ports", or null. */ place: string | null }

export const epitaphOf = (id: string): string | null => deadSummaries().get(id)?.epitaph ?? null;
/** “Epitaph.” with exactly one closing stop. */
export const quoted = (s: string) => `“${s}${/[.!?…]$/.test(s) ? "" : "."}”`;

const FAR_PORTS = "the Far Ports";
export const FAR_PORTS_LINE = "Far Ports includes small chain allocations, chains without a pier, and supply without a reported chain allocation.";
export const STATION_RULE = "The station repeats the supply-weighted stress band: Calm, no shapes; Watch, one cone; Alert, two cones; Warning, two cones and one drum; Danger, two cones and two drums with a red pennant.";
export const BOAT_SIGNALS_RULE = "The five highest-scoring Alert-or-worse coins may fly a masthead signal: Alert, a cone; Warning, a drum; Danger, a cone and a drum. Early warning, not a depeg.";
export { BY_EAR, SOUND_DECORATIVE, SOUND_FLOW, SOUND_FOG, SOUND_PHAROS, SOUND_SURF, SOUND_WEATHER } from "../audio/legend";

/** The renderer hoists the first N shapes: cone, cone, drum, drum. */
export function stationLine(band: DewsBand | null): string {
  const mast = mastForBand(band);
  if (mast.cones == null || band == null) return "Station: unavailable.";
  const shapes = ["no shapes", "one cone", "two cones", "two cones and one drum", "two cones and two drums"][mast.cones];
  return `Station: ${titleCase(band)}; ${shapes}${mast.pennant ? " with a red pennant" : ""}.`;
}

export function stationFact(m: HarbourModel | null): string {
  const w = m?.readings.weather;
  return stationLine(w && !w.stale && sourceTruth(m, "stress").state === "current" && sourceTruth(m, "stablecoins").state === "current" && (readingCoverage(m, "stress") ?? 0) > 0 && w.cloudCover != null && w.wind != null ? w.band : null);
}

export function alertCountLine(m: HarbourModel | null): string {
  const c = m?.readings.stormCones;
  if (!c || (readingCoverage(m, "stress") ?? 0) <= 0) return readingSentence(m, "stress");
  return sourceTruth(m, "stress").state === "current" && sourceTruth(m, "stablecoins").state === "current"
    ? `${c.count} covered coins are at Alert or worse.` : `Last received Alert-or-worse count: ${c.count}.`;
}

export function allocationLine(boats: readonly Boat[]): string | null {
  const gap = boats.reduce((s, b) => s + b.supply - b.chainShares.reduce((n, c) => n + c.usd, 0), 0);
  return gap > 0 ? `${money(gap)} has no reported chain allocation.` : gap < 0 ? "Reported totals do not reconcile." : null;
}

const ROUTE_UNAVAILABLE = "Route unavailable. Holding the last safe position.";

/**
 * Sim phase index (PHASES order) + slot facts → where the boat is, in words. `outing`: the sim's
 * pose flag for a decorative harbour outing (D22): out for a sail, bound back to her own berth.
 */
export function whereabouts(phase: number, slotKind: string | null, slotPlace: string | null, outing = false): Whereabouts {
  if (phase >= 1 && phase <= 3 && (slotKind === "wreck" || slotKind === "shoals")) return { kind: "sailing", place: slotKind === "wreck" ? "Wreck Cove" : "the Shoals" };
  if (slotKind === "wreck") return { kind: "wreck", place: null };
  if (slotKind === "shoals") return { kind: "shoals", place: null };
  const place = slotKind === "far" ? FAR_PORTS : slotPlace;
  if (outing && phase >= 1 && phase <= 3) return { kind: "outing", place };
  switch (phase) {
    case 0: return { kind: "alongside", place };
    case 1: return { kind: "casting-off", place };
    case 2: case 3: return { kind: "sailing", place };
    case 4: return { kind: slotKind === "far" ? "far" : "moored", place };
    case 5: return { kind: slotKind === "far" ? "far" : slotKind ? "moored" : "route-unavailable", place };
    default: return { kind: "unknown", place };
  }
}

export function whereLine(b: Boat, w: Whereabouts): string {
  switch (w.kind) {
    case "alongside": return w.place ? `alongside ${w.place}` : "alongside";
    case "moored": return w.place ? `moored off ${w.place}` : "at her mooring";
    case "far": return `in ${FAR_PORTS}`;
    case "casting-off": return w.place ? `casting off for ${w.place}` : "casting off";
    case "sailing": return w.place === "Wreck Cove" ? "under tow to Wreck Cove" : w.place === "the Shoals" ? "drifting to the Shoals" : w.place ? `sailing to ${w.place}` : "under sail";
    case "outing": return "out for a sail";
    case "shoals": return `on the Shoals ${bps(b.pegDeviationBps)}`;
    case "wreck": return "wrecked";
    case "route-unavailable": return ROUTE_UNAVAILABLE;
    default: return "";
  }
}

/** DA-04: the words for a hoisted masthead signal (hover and panel say the same). */
export const SIGNAL_HOISTED = "signal hoisted: early warning, not a depeg";
/** A signal on a coin that IS off peg: the depeg is told by the Shoals, never by the signal. */
export const SIGNAL_HOISTED_DEPEG = "signal hoisted: early warning; the Shoals tell the depeg";
const signalWords = (b: Boat) => (b.activeDepeg ? SIGNAL_HOISTED_DEPEG : SIGNAL_HOISTED);
const SHAPE_WORDS: Record<StormSignalShape, string> = { cone: "a cone", drum: "a drum", "cone+drum": "a cone and a drum" };

/** Shoals panel line for the depeg moment (life/moments-stage.ts). */
export const REEF_FLARE_LINE = "The beacon\u2019s fire flares three times when a coin is confirmed off its peg (two readings in a row); the Day book records it.";

/** DA-07 Boat panel line. */
export const MAIDEN_LINE = "new to the register this week";
/** DA-07 hover: the bunting she is dressed in, in the panel's words. */
export const MAIDEN_HOVER = `dressed overall: ${MAIDEN_LINE}`;
/** Hover for a coin launched during this visit, dressed for her first circuit (M8d: "launched today"). */
export const LAUNCH_HOVER = "Dressed overall: joined the tracked register this visit.";

/** "USDT · $184.0B · alongside Tron" (+ " · signal hoisted: early warning, not a depeg" under a DA-04 signal). */
export function boatFact(b: Boat, w: Whereabouts): string {
  return [b.symbol, money(b.supply), whereLine(b, w), b.stormSignal ? signalWords(b) : "", b.maiden ? MAIDEN_HOVER : ""].filter(Boolean).join(" · ");
}

/** DA-04 Boat panel line, or null when she flies no signal and is not at Alert or worse. */
export function stormSignalLine(b: Boat, stressCurrent: boolean): string | null {
  if (b.stormSignal) return `${SHAPE_WORDS[b.stormSignal]} at the masthead, ${signalWords(b)}`;
  if (stressCurrent && (b.dews === "ALERT" || b.dews === "WARNING" || b.dews === "DANGER")) return "none at the masthead: only the five worst early-warning scores hoist one";
  return null;
}


/** T6 chain panel line for an office state, from the same 30-day figure (a fraction), or null when neutral. */
export function officeLine(state: OfficeState | undefined, change30d: number | null | undefined): string | null {
  if (state === "works") return `Office under works: supply ${pctChange(change30d, 1)} over 30 d`;
  if (state === "furled") return `Awnings furled: ${pctChange(change30d, 1)} over 30 d`;
  return null;
}

/** The single sentence that explains the boat's position from the data. */
export function whyHere(b: Boat, w: Whereabouts): string {
  if (w.kind === "route-unavailable") return ROUTE_UNAVAILABLE;
  if (w.kind === "sailing" && w.place === "Wreck Cove") return "Under tow to Wreck Cove: this coin has died.";
  if (b.state === "wrecked" || w.kind === "wreck") {
    const ep = epitaphOf(b.id);
    return ep ? `Beached in Wreck Cove. ${quoted(ep)}` : "Beached in Wreck Cove: this coin has died.";
  }
  if (b.state === "shoals" || w.kind === "shoals") {
    const d = b.pegDeviationBps;
    const side = d == null ? "away from" : d < 0 ? "below" : "above";
    return `${w.kind === "sailing" && w.place === "the Shoals" ? "Drifting to" : "Anchored on"} the Shoals because it trades ${d == null ? "" : `${Math.abs(Math.round(d))} bps `}${side} its peg. It rejoins its circuit once the peg holds.`;
  }
  const top = b.chainShares[0];
  if (b.circuit.length <= 1) {
    if (!b.circuit[0]?.chain) return `It rides at anchor in ${FAR_PORTS}. ${FAR_PORTS_LINE}`;
    const out = w.kind === "outing" ? " Out for a sail just now (decorative): it comes back to the same berth." : "";
    return `Stays at ${b.circuit[0].chain} because ${top ? share(top.share) : "all"} of its reported chain-attributed holdings are there.${out}`;
  }
  const stops = circuitStops(b);
  const names = stops.map((s) => s.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const stop = stops.reduce((m, s) => (s.supplyShare > m.supplyShare ? s : m), stops[0]);
  return `Sails a circuit of ${stops.length} stops, ${list}, staying at each in proportion to its supply there. It stays longest at ${stop.name}, where ${share(stop.supplyShare)} of its supply sits.`;
}

export interface StopRow {
  /** Chain name, or "the Far Ports". */
  name: string;
  /** Pier chain (null for the Far Ports). */
  chain: string | null;
  /** Share of the coin's supply this stop stands for (drives the time docked there). */
  supplyShare: number;
  /** For the Far Ports: the chains folded into it (no pier, or too small a share for a call of their own). */
  folded: string[];
}

/** The circuit as the panel lists it: the stops in sailing order, the Far Ports naming what it absorbs. */
export function circuitStops(b: Boat): StopRow[] {
  const piered = new Set(b.circuit.map((c) => c.chain).filter((c): c is string => !!c));
  return b.circuit.map((c) => ({
    name: c.chain ?? FAR_PORTS,
    chain: c.chain,
    supplyShare: c.rawShare,
    folded: c.chain ? [] : b.chainShares.filter((x) => !piered.has(x.chain)).map((x) => x.chain),
  }));
}

/** 24 h mint and burn totals of the flows reading (null when there is none). */
export function flowTotals(m: HarbourModel | null): { mint: number; burn: number; net: number | null } | null {
  const f = m?.readings.flows;
  if (!f?.available || !f.hourly.length) return null;
  return { mint: f.hourly.reduce((s, h) => s + h.mintUsd, 0), burn: f.hourly.reduce((s, h) => s + h.burnUsd, 0), net: flowValued(f.hourly) ? f.net24hUsd : null };
}

/** Optional live counts a landmark tag can quote. */
export interface PlaceCounts { yard?: number | undefined; roads?: number | undefined }

/** Landmark tag facts. Decorative buildings say so, in italics (the caller styles `decorative`). */
export function landmarkFact(id: string, m: HarbourModel | null, underWay: number | null, counts: PlaceCounts = {}): { fact: string; decorative?: boolean } {
  const r = m?.readings;
  switch (id) {
    case "harbour-tug": return { fact: "tows the dead to Wreck Cove · carries no data", decorative: true };
    case "mint": {
      const t = flowTotals(m);
      return { fact: t ? `${grossFlow(t.mint, "mint", flowValued(r!.flows.hourly))} ${flowWindow(r!.flows.hourly)}.` : "fires banked · no flow reading" };
    }
    case "burn": {
      const t = flowTotals(m);
      return { fact: t ? `${grossFlow(t.burn, "burn", flowValued(r!.flows.hourly))} ${flowWindow(r!.flows.hourly)}.` : "fire banked · no flow reading" };
    }
    case "chartroom": {
      const p = r?.psi;
      return { fact: p?.avg24h != null ? `PSI history · 24 h average ${p.avg24h.toFixed(1)}` : "the Pharos’s history" };
    }
    case "keeperslog": {
      const lag = m ? Object.values(m.truth).filter((t) => t.state !== "current").length : null;
      return { fact: lag == null ? "awaiting data" : lag === 0 ? "every reading fresh" : `${lag} ${lag === 1 ? "reading" : "readings"} lagging` };
    }
    case "the-roads": return { fact: counts.roads != null ? `${counts.roads} ${counts.roads === 1 ? "boat" : "boats"} in the Roads` : "the outer mooring field" };
    case "pharos": {
      const p = r?.psi;
      if (!p || p.score == null) return { fact: "unlit · no stability reading" };
      return { fact: `${p.lit ? "" : "unlit · last received "}PSI ${p.score.toFixed(1)} · ${titleCase(p.band ?? "")}${p.stale ? " · stale" : ""}` };
    }
    case "shoals": {
      const n = r?.shoals.length ?? 0;
      return { fact: n === 0 ? observedEmpty(m, "shoals") : `${sourceTruth(m, "pegSummary").state === "current" ? "" : "Last observed: "}${n} ${n === 1 ? "boat" : "boats"} off peg` };
    }
    case "customs-house": case "tide-board": {
      const f = r?.flows;
      if (!f?.available || !f.hourly.length) return { fact: "no flow reading" };
      if (f.net24hUsd == null || !flowValued(f.hourly)) return { fact: f.hourly.some((h) => h.netUsd == null) ? NET_UNAVAILABLE : VALUATION_UNKNOWN };
      return { fact: `${money(f.net24hUsd, { signed: true })} net ${f.net24hUsd >= 0 ? "minted" : "burned"} · ${flowWindow(f.hourly)}` };
    }
    case "storm-mast": {
      return { fact: stationFact(m) };
    }
    case "tide-gauge": return { fact: tideFact(m) };
    case "wreck-cove": return { fact: `${r?.wrecks.length ?? 0} wrecks, with epitaphs` };
    case "far-ports": {
      const far = m?.harbours.filter((h) => !h.piered) ?? [];
      return { fact: `${far.length} chains without a pier · ${money(far.reduce((s, h) => s + h.supplyUsd, 0))}. ${FAR_PORTS_LINE}` };
    }
    case "registry": return { fact: `${m?.payloadCount ?? 0} coins on the register` };
    case "harbourmaster": return { fact: underWay == null ? "keeps the harbour" : `${underWay} boats under way` };
    case "slipway": return { fact: counts.yard != null ? `${counts.yard} records · Awaiting admission to the tracked fleet.` : "Awaiting admission to the tracked fleet." };
    case "keepers-cottage": return { fact: "the keeper’s home", decorative: true };
    case "oil-store": return { fact: "lamp oil for the Pharos", decorative: true };
    case "church": return { fact: "the town on the hill", decorative: true };
    case "warehouse": return { fact: "bonded goods", decorative: true };
    default: return { fact: "", decorative: true };
  }
}

/** The tide gauge's line: the 7-day change of all stablecoin supply (/api/chains globalChange7dPct, a fraction). */
export function tideFact(m: HarbourModel | null): string {
  const t = m?.readings.tide;
  if (!t?.available || t.change7d == null) return "no supply reading";
  return `all supply ${pctChange(t.change7d)} over 7 d${t.stale ? " · stale" : ""}`;
}

/** The harbour's hover; a T6 office state appends the chain panel's own line ("office under works: supply +12.0% over 30 d"). */
export function harbourFact(chain: string, m: HarbourModel | null, office?: OfficeState, change30d?: number | null): string {
  const h = m?.harbours.find((x) => x.chain === chain);
  if (!h) return "harbour";
  const line = officeLine(office, change30d);
  return [`${money(h.supplyUsd)} · ${h.visitors} ${h.visitors === 1 ? "boat calls" : "boats call"}`, line ? line[0].toLowerCase() + line.slice(1) : ""].filter(Boolean).join(" · ");
}

/** Landmarks that open a panel on click (the rest are hover-only). */
export const PANEL_LANDMARKS = new Set(["pharos", "shoals", "customs-house", "tide-board", "storm-mast", "wreck-cove", "far-ports", "registry", "harbourmaster", "slipway",
  "tide-gauge", "mint", "burn", "chartroom", "keeperslog", "the-roads"]);

export const wreckDate = (d: string) => monthYear(d);

/** A dead coin's tag line: its cause family and the year it died ("Death spiral · † 2022"). */
export function wreckFact(id: string): string {
  const r = deadSummaries().get(id);
  if (!r) return "wrecked";
  return [FAMILIES[r.family].name, /^\d{4}/.test(r.deathDate) ? `† ${r.deathDate.slice(0, 4)}` : ""].filter(Boolean).join(" · ");
}

/** The obituary as the panel prints it: the register's own housekeeping notes left out. */
export const obituaryText = (s: string) => s.replace(/\s*\((?:Excluded from|Note:)[^)]*\)/g, "").trim();

/** The declared visual key, shared by the ledger and subject explanations. */
export const SAIL_RULE = "Ordinary sail motion is decorative. Shoals placement, listing, distressed canvas and the checkered flag indicate an observed depeg; weather strength follows stress.";
export const SEA_RULE = "Sea-state thresholds are below 0.5%, 0.5% to below 2%, 2% to below 10%, and 10% or more of tracked supply observed off peg.";
export const LETTERING_RULE = "Sea zones are lettered on the water. Chain harbours use crests; optional chart labels name the chains.";
export const OFFICE_RULE = "Office works begin at +8% over 30 days and remain until below +6%; furled awnings begin at −8% and remain until above −6%. Unavailable or stale comparisons leave offices neutral.";
export const FLOW_RULE = "Mint and Burn activity uses 60% of the 24-hour mean and 40% of the latest completed hour, on a compressed scale. Direction is unavailable when net valuation is withheld.";
export const TIDE_RULE = "The tide gauge shows seven-day global supply change on a signed square-root scale, full at ±2%; changes smaller than 0.01% are slack.";
export const HULL_RULE = "Hull supply classes begin at $1M, $10M, $100M, $1B and $10B.";
export const PRINT_RULE = "Coin marks are printed on cloth. At a distance their contrast softens; hover, select or search to inspect a coin.";
export const WRECK_RULE = "Wreck form follows the recorded cause family; size follows peak-cap rank.";
export const WREATH_RULE = "A fresh wreath marks the newest recorded death within 90 days; month-only dates count from month end.";
export const ANNIVERSARY_RULE = "An anniversary requires a recorded full date from an earlier year; month-only dates have no anniversary day.";
export const CEREMONY_RULE = "Confirmed visit events may stage brief ceremonies; the Day book also records events that receive no ceremony. Night and seasons follow the calendar and carry no market reading.";

/** Shared guide/legend wording: teaching stays on demand and adds no analytical mapping. */
export const PHAROS_GUIDE = "A fire in the lantern, thrown out to sea by a bronze mirror. A slow, wide sweep is a calm market; a faster, shorter beam is stress. A dark lantern means no reading. Its light passes over the ships and walls it reaches; a horn shutter narrows it when the index was computed without stress signals or depeg events.";
export const BOATS_GUIDE = "Every stablecoin is one boat. Boats visit each chain in proportion to their supply there; sailing is not a bridge transfer.";
export const FOG_GUIDE = "When the feed stops refreshing, fog rolls in and every boat finishes its leg and holds. Nothing pretends to be live.";
