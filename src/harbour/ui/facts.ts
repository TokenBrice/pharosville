/**
 * The one-fact lines and the "why it is here" sentences. Pure functions of (model, whereabouts),
 * so the hover tag, the panel and the tests all read the same words.
 */
import deadJson from "@shared/data/dead-stablecoins.json";
import type { Boat, HarbourModel } from "../model/types";
import { bps, money, monthYear, share, titleCase } from "./format";

export type WhereKind = "alongside" | "moored" | "casting-off" | "sailing" | "shoals" | "wreck" | "far" | "unknown";
export interface Whereabouts { kind: WhereKind; /** Chain name, "the Far Ports", or null. */ place: string | null }

interface DeadRow { id: string; epitaph?: string; obituary?: string; causeOfDeath?: string; deathDate?: string }
const DEAD = new Map((deadJson as DeadRow[]).map((d) => [d.id, d]));
export const epitaphOf = (id: string): string | null => DEAD.get(id)?.epitaph ?? null;
/** “Epitaph.” with exactly one closing stop. */
export const quoted = (s: string) => `“${s}${/[.!?…]$/.test(s) ? "" : "."}”`;
export const obituaryOf = (id: string): string | null => DEAD.get(id)?.obituary ?? null;

const FAR_PORTS = "the Far Ports";

/** Sim phase index (PHASES order) + slot facts → where the boat is, in words. */
export function whereabouts(phase: number, slotKind: string | null, slotPlace: string | null): Whereabouts {
  if (slotKind === "wreck") return { kind: "wreck", place: null };
  if (slotKind === "shoals") return { kind: "shoals", place: null };
  const place = slotKind === "far" ? FAR_PORTS : slotPlace;
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
    return `Stays at ${b.circuit[0].chain} because ${top ? share(top.share) : "all"} of its supply is there.`;
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

/** Landmark tag facts. Decorative buildings say so, in italics (the caller styles `decorative`). */
export function landmarkFact(id: string, m: HarbourModel | null, underWay: number | null): { fact: string; decorative?: boolean } {
  const r = m?.readings;
  switch (id) {
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
      if (!f?.available || f.net24hUsd == null) return { fact: "tide board dark · no flow reading" };
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
    case "slipway": return { fact: "where new coins are launched" };
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
export const PANEL_LANDMARKS = new Set(["pharos", "shoals", "customs-house", "tide-board", "storm-mast", "wreck-cove", "far-ports", "registry", "harbourmaster", "slipway"]);

export const wreckDate = (d: string) => monthYear(d);
