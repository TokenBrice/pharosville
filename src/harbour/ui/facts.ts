/**
 * The one-fact lines and the "why it is here" sentences. Pure functions of (model, whereabouts),
 * so the hover tag, the panel and the tests all read the same words.
 */
import type { Boat, HarbourModel } from "../model/types";
import { deadSummaries, FAMILIES } from "../model/obituary";
import { bps, money, monthYear, share, titleCase } from "./format";

export type WhereKind = "alongside" | "moored" | "casting-off" | "sailing" | "outing" | "shoals" | "wreck" | "far" | "unknown";
export interface Whereabouts { kind: WhereKind; /** Chain name, "the Far Ports", or null. */ place: string | null }

export const epitaphOf = (id: string): string | null => deadSummaries().get(id)?.epitaph ?? null;
/** “Epitaph.” with exactly one closing stop. */
export const quoted = (s: string) => `“${s}${/[.!?…]$/.test(s) ? "" : "."}”`;

const FAR_PORTS = "the Far Ports";

/**
 * Sim phase index (PHASES order) + slot facts → where the boat is, in words. `outing`: the sim's
 * pose flag for a decorative harbour outing (D22): out for a sail, bound back to her own berth.
 */
export function whereabouts(phase: number, slotKind: string | null, slotPlace: string | null, outing = false): Whereabouts {
  if (slotKind === "wreck") return { kind: "wreck", place: null };
  if (slotKind === "shoals") return { kind: "shoals", place: null };
  const place = slotKind === "far" ? FAR_PORTS : slotPlace;
  if (outing && phase >= 1 && phase <= 3) return { kind: "outing", place };
  switch (phase) {
    case 0: return { kind: "alongside", place };
    case 1: return { kind: "casting-off", place };
    case 2: case 3: return { kind: "sailing", place };
    case 4: return { kind: slotKind === "far" ? "far" : "moored", place };
    case 5: return { kind: "shoals", place: null };
    default: return { kind: "unknown", place };
  }
}

export function whereLine(b: Boat, w: Whereabouts): string {
  switch (w.kind) {
    case "alongside": return w.place ? `alongside ${w.place}` : "alongside";
    case "moored": return w.place ? `moored off ${w.place}` : "at her mooring";
    case "far": return `in ${FAR_PORTS}`;
    case "casting-off": return w.place ? `casting off for ${w.place}` : "casting off";
    case "sailing": return w.place ? `sailing to ${w.place}` : "under sail";
    case "outing": return "out for a sail";
    case "shoals": return `on the Shoals ${bps(b.pegDeviationBps)}`;
    case "wreck": return "wrecked";
    default: return "";
  }
}

/** "USDT · $184.0B · alongside Tron". */
export function boatFact(b: Boat, w: Whereabouts): string {
  return [b.symbol, money(b.supply), whereLine(b, w)].filter(Boolean).join(" · ");
}

/** The single sentence that explains the boat's position from the data. */
export function whyHere(b: Boat, w: Whereabouts): string {
  if (b.state === "wrecked" || w.kind === "wreck") {
    const ep = epitaphOf(b.id);
    return ep ? `Beached in Wreck Cove. ${quoted(ep)}` : "Beached in Wreck Cove: this coin has died.";
  }
  if (b.state === "shoals" || w.kind === "shoals") {
    const d = b.pegDeviationBps;
    const side = d == null ? "away from" : d < 0 ? "below" : "above";
    return `Anchored on the Shoals because it trades ${d == null ? "" : `${Math.abs(Math.round(d))} bps `}${side} its peg. It rejoins its circuit once the peg holds.`;
  }
  const top = b.chainShares[0];
  if (b.circuit.length <= 1) {
    if (!b.circuit[0]?.chain) return `Its supply sits on chains without a pier of their own, so it rides at anchor in ${FAR_PORTS}.`;
    const out = w.kind === "outing" ? " Out for a sail just now (decorative): it comes back to the same berth." : "";
    return `Stays at ${b.circuit[0].chain} because ${top ? share(top.share) : "all"} of its supply is there.${out}`;
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
  if (!f?.available) return null;
  return { mint: f.hourly.reduce((s, h) => s + h.mintUsd, 0), burn: f.hourly.reduce((s, h) => s + h.burnUsd, 0), net: f.net24hUsd };
}

/** Optional live counts a landmark tag can quote. */
export interface PlaceCounts { yard?: number | undefined; roads?: number | undefined }

/** Landmark tag facts. Decorative buildings say so, in italics (the caller styles `decorative`). */
export function landmarkFact(id: string, m: HarbourModel | null, underWay: number | null, counts: PlaceCounts = {}): { fact: string; decorative?: boolean } {
  const r = m?.readings;
  switch (id) {
    case "mint": {
      const t = flowTotals(m);
      return { fact: t ? `${money(t.mint)} minted in 24 h` : "fires banked · no flow reading" };
    }
    case "burn": {
      const t = flowTotals(m);
      return { fact: t ? `${money(t.burn)} burned in 24 h` : "fire banked · no flow reading" };
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
      if (!p || !p.lit || p.score == null) return { fact: "unlit · no stability reading" };
      return { fact: `PSI ${p.score.toFixed(1)} · ${titleCase(p.band ?? "")}${p.stale ? " · stale" : ""}` };
    }
    case "shoals": {
      const n = r?.shoals.length ?? 0;
      return { fact: n === 0 ? "clear water · nobody off peg" : `${n} ${n === 1 ? "boat" : "boats"} off peg` };
    }
    case "customs-house": case "tide-board": {
      const f = r?.flows;
      if (!f?.available || f.net24hUsd == null) return { fact: "no flow reading" };
      return { fact: `${money(f.net24hUsd, { signed: true })} net ${f.net24hUsd >= 0 ? "minted" : "burned"} in 24 h` };
    }
    case "storm-mast": {
      const c = r?.stormCones;
      if (!c) return { fact: "no stress reading" };
      return { fact: c.count === 0 ? "no cones hoisted" : `${c.count} ${c.count === 1 ? "cone" : "cones"} · early-warning alerts` };
    }
    case "wreck-cove": return { fact: `${r?.wrecks.length ?? 0} wrecks, with epitaphs` };
    case "far-ports": {
      const far = m?.harbours.filter((h) => !h.piered) ?? [];
      return { fact: `${far.length} chains without a pier · ${money(far.reduce((s, h) => s + h.supplyUsd, 0))}` };
    }
    case "registry": return { fact: `${m?.payloadCount ?? 0} coins on the register` };
    case "harbourmaster": return { fact: underWay == null ? "keeps the harbour" : `${underWay} boats under way` };
    case "slipway": return { fact: counts.yard != null ? `${counts.yard} ${counts.yard === 1 ? "coin" : "coins"} building · pre-launch` : "where new coins are built" };
    case "keepers-cottage": return { fact: "the keeper’s home", decorative: true };
    case "oil-store": return { fact: "lamp oil for the Pharos", decorative: true };
    case "church": return { fact: "the town on the hill", decorative: true };
    case "warehouse": return { fact: "bonded goods", decorative: true };
    default: return { fact: "", decorative: true };
  }
}

export function harbourFact(chain: string, m: HarbourModel | null): string {
  const h = m?.harbours.find((x) => x.chain === chain);
  if (!h) return "harbour";
  return `${money(h.supplyUsd)} · ${h.visitors} ${h.visitors === 1 ? "boat calls" : "boats call"}`;
}

/** Landmarks that open a panel on click (the rest are hover-only). */
export const PANEL_LANDMARKS = new Set(["pharos", "shoals", "customs-house", "tide-board", "storm-mast", "wreck-cove", "far-ports", "registry", "harbourmaster", "slipway",
  "mint", "burn", "chartroom", "keeperslog", "the-roads"]);

export const wreckDate = (d: string) => monthYear(d);

/** A dead coin's tag line: its cause family and the year it died ("Death spiral · † 2022"). */
export function wreckFact(id: string): string {
  const r = deadSummaries().get(id);
  if (!r) return "wrecked";
  return [FAMILIES[r.family].name, /^\d{4}/.test(r.deathDate) ? `† ${r.deathDate.slice(0, 4)}` : ""].filter(Boolean).join(" · ");
}

/** The obituary as the panel prints it: the register's own housekeeping notes left out. */
export const obituaryText = (s: string) => s.replace(/\s*\((?:Excluded from|Note:)[^)]*\)/g, "").trim();
