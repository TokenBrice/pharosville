/**
 * The dead: each coin in shared/data/dead-stablecoins.json as Wreck Cove tells it. Pure.
 *
 * CAUSE FAMILY (research/04 §3: "wreck form = cause family"). The data's five causes, with the hacks pulled out
 * of them: a coin whose own contract or protocol was attacked (an exploit, an infinite or unauthorised mint) is
 * EXPLOITED whatever the data filed it under, unless the data says it was wound down or regulated away (a hack
 * that only hastened a vote to close stays a wind-down). The family picks the wreck's form; its size and its
 * place on the strand stay the peak-cap rank.
 */
import { DEAD_STABLECOINS } from "@shared/lib/dead-stablecoins";
import type { DeadStablecoin } from "@shared/types/market";
import { logosById } from "../../lib/logos";
import cemeteryLogos from "./cemetery-logos.json";

export type CauseFamily = "spiral" | "exploit" | "counterparty" | "run" | "wind-down" | "decree";

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

/** Its own contract or protocol attacked: an exploit, a hack, an attacker, an unauthorised or infinite mint. */
const ATTACKED = /\b(?:was exploited|exploited via|an? (?:\$[\d.,]+[KMB]? )?(?:smart contract |flash[- ]loan |catastrophic |security )?(?:exploit|breach)\b|hack(?:ed)?\b|attacker|infinite mint|mint(?:ed)? [^.]{0,40}(?:out of thin air|unauthori[sz]ed|fraudulent)|rebasing bug|security (?:breach|flaw))/i;
/**
 * Read by hand where the words mislead: an exploit it survived before dying of something else (the funds came
 * back; a second, unrelated collapse; contagion that outweighed a small hack).
 */
const NOT_EXPLOITED = new Set(["mod-move-dollar-2025-06", "yu-yu-2025-11", "usdx-stables-labs-usdx-2025-11"]);

export function causeFamily(d: Pick<DeadStablecoin, "id" | "causeOfDeath" | "obituary">): CauseFamily {
  const c = d.causeOfDeath;
  if (c === "regulatory") return "decree";
  if (c === "abandoned") return "wind-down";
  if (!NOT_EXPLOITED.has(d.id) && ATTACKED.test(d.obituary ?? "")) return "exploit";
  if (c === "algorithmic-failure") return "spiral";
  if (c === "counterparty-failure") return "counterparty";
  return "run";
}

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const BORN = new RegExp(`\\b(?:launched|created|founded|deployed|debuted|born|went live)\\b[^.;]{0,24}?\\b(?:in |on )?(?:(early|mid|late) )?(?:(${MONTHS}) )?(?:\\d{1,2}, )?((?:19|20)\\d{2})\\b`, "i");
const BORN_PAREN = /\bcreated \(((?:19|20)\d{2})\)/i;

/**
 * When it was launched, as the obituary itself says it ("launched in April 2022", "created (2014)",
 * "launched in late 2021"); null when it does not say. Never later than its death.
 */
export function bornOf(obituary: string, deathDate: string): string | null {
  const m = BORN.exec(obituary);
  const p = m ? null : BORN_PAREN.exec(obituary);
  const year = m?.[3] ?? p?.[1];
  if (!year || year > deathDate.slice(0, 4)) return null;
  const qual = m?.[1]?.toLowerCase(), month = m?.[2];
  return [qual, month ? month.charAt(0).toUpperCase() + month.slice(1).toLowerCase() : null, year].filter(Boolean).join(" ");
}

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
    logo: LOGOS[d.id] ?? (d.llamaId ? logosById[d.llamaId] ?? null : null),
    pharosUrl: cemeteryUrl(d.id),
  };
}

let cache: Map<string, DeadRecord> | null = null;
/** Every dead coin by id (the default dead list). */
export function deadRecords(): Map<string, DeadRecord> {
  if (!cache) cache = new Map(DEAD_STABLECOINS.map((d) => [d.id, deadRecord(d)]));
  return cache;
}

/** Days from a "YYYY-MM" (or "YYYY-MM-DD") death date's last possible day to `now`: a month-only date is read generously. */
export function daysSinceDeath(deathDate: string, now: number): number | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(deathDate);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  const t = m[3] ? Date.UTC(y, mo - 1, Number(m[3])) : Date.UTC(y, mo, 0); // the month's last day
  return Math.floor((now - t) / 86_400_000);
}
