/**
 * The dead: each coin in shared/data/dead-stablecoins.json as Wreck Cove tells it. Pure.
 *
 * CAUSE FAMILY (research/04 §3: "wreck form = cause family"). The data's five causes, with the hacks pulled out
 * of them: a coin whose own contract or protocol was attacked (an exploit, an infinite or unauthorised mint) is
 * EXPLOITED whatever the data filed it under, unless the data says it was wound down or regulated away (a hack
 * that only hastened a vote to close stays a wind-down). The family picks the wreck's form; its size and its
 * place on the strand stay the peak-cap rank.
 */
import cemetery from "virtual:pharosville-cemetery";
import type { DeadStablecoin } from "@shared/types/market";
import { logosById, runtimeLogoPath } from "../../lib/logos";
import cemeteryLogos from "./cemetery-logos.json";

import { bornOf, causeFamily } from "../ui/cemetery-classify";
import type { CauseFamily } from "../ui/cemetery-classify";
export { bornOf, causeFamily };
export type { CauseFamily };

export interface FamilyInfo {
  /** The family as the tag and the obituary name it. */
  name: string;
  /** The wreck form, in words (the cove's legend). */
  form: string;
  /** Its chart ink (the UI's validated categorical inks, ui/bits.tsx CHAIN_INKS, + a warm grey): never the only cue. */
  ink: string;
}

export const FAMILIES: Record<CauseFamily, FamilyInfo> = {
  spiral: { name: "Death spiral", form: "capsized, keel to the sky", ink: "#b5382b" },
  exploit: { name: "Exploited", form: "burned to her bilges", ink: "#b8700f" },
  counterparty: { name: "Counterparty failure", form: "broken in two", ink: "#7a4ca6" },
  run: { name: "Drained", form: "swallowed by the sand to her mast", ink: "#1668a3" },
  "wind-down": { name: "Wound down", form: "left to rot to her ribs", ink: "#6b6253" },
  decree: { name: "Killed by decree", form: "laid up whole on the strand", ink: "#008c80" },
};
export const FAMILY_ORDER: readonly CauseFamily[] = ["spiral", "exploit", "counterparty", "run", "wind-down", "decree"];


export interface DeadRecord {
  id: string;
  name: string;
  symbol: string;
  pegCurrency: string;
  /** The data's own cause (shared/lib/cause-of-death.ts). */
  cause: string;
  family: CauseFamily;
  /** "2022-05" (month precision). */
  deathDate: string;
  /** As the obituary states it ("April 2022", "late 2021", "2014"), or null. */
  born: string | null;
  peakMcap: number | null;
  epitaph: string | null;
  obituary: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  logo: string | null;
  /** Its grave on pharos.watch (the cemetery register's anchor). */
  pharosUrl: string;
}

export const cemeteryUrl = (id: string) => `https://pharos.watch/cemetery/#${encodeURIComponent(id)}`;

const LOGOS = cemeteryLogos as Record<string, string>;

export function deadRecord(d: DeadStablecoin): DeadRecord {
  return {
    id: d.id, name: d.name, symbol: d.symbol, pegCurrency: d.pegCurrency, cause: d.causeOfDeath,
    family: causeFamily(d), deathDate: d.deathDate, born: bornOf(d.obituary ?? "", d.deathDate),
    peakMcap: d.peakMcap ?? null, epitaph: d.epitaph?.trim() || null, obituary: d.obituary,
    sourceUrl: d.sourceUrl || null, sourceLabel: d.sourceLabel || null,
    logo: LOGOS[d.id] ? runtimeLogoPath(LOGOS[d.id]) : (d.llamaId ? logosById[d.llamaId] ?? null : null),
    pharosUrl: cemeteryUrl(d.id),
  };
}

export type DeadSummary = Omit<DeadRecord, "obituary" | "sourceUrl" | "sourceLabel">;
let summaries: Map<string, DeadSummary> | null = null;
let records: Map<string, DeadRecord> | null = null;

/** Eager exact names, families, dates and epitaphs; no cemetery narrative dependency. */
export function deadSummaries(): Map<string, DeadSummary> {
  if (!summaries) summaries = new Map(cemetery.map((d) => [d.id, {
    id: d.id, name: d.name, symbol: d.symbol, pegCurrency: d.pegCurrency, cause: d.causeOfDeath,
    family: d.family, deathDate: d.deathDate, born: d.born, peakMcap: d.peakMcap ?? null,
    epitaph: d.epitaph?.trim() || null,
    logo: LOGOS[d.id] ? runtimeLogoPath(LOGOS[d.id]) : (d.llamaId ? logosById[d.llamaId] ?? null : null),
    pharosUrl: cemeteryUrl(d.id),
  }]));
  return summaries;
}

/** Installed by the deferred detail boundary before any narrative UI mounts. */
export function installDeadRecords(rows: readonly DeadStablecoin[]): void {
  records = new Map(rows.map((d) => [d.id, deadRecord(d)]));
}

export function deadRecords(): Map<string, DeadRecord> {
  if (!records) throw new Error("Cemetery narratives must load before detail UI mounts.");
  return records;
}

/** Days from a "YYYY-MM" (or "YYYY-MM-DD") death date's last possible day to `now`: a month-only date is read generously. */
export function daysSinceDeath(deathDate: string, now: number): number | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(deathDate);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  const t = m[3] ? Date.UTC(y, mo - 1, Number(m[3])) : Date.UTC(y, mo, 0); // the month's last day
  return Math.floor((now - t) / 86_400_000);
}
