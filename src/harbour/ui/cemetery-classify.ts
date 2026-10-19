import type { DeadStablecoin } from "../../../shared/types/market";

export type CauseFamily = "spiral" | "exploit" | "counterparty" | "run" | "wind-down" | "decree";

/** Shared by the build-time scenery projection and full obituary records: never classify stripped prose. */
const ATTACKED = /\b(?:was exploited|exploited via|an? (?:\$[\d.,]+[KMB]? )?(?:smart contract |flash[- ]loan |catastrophic |security )?(?:exploit|breach)\b|hack(?:ed)?\b|attacker|infinite mint|mint(?:ed)? [^.]{0,40}(?:out of thin air|unauthori[sz]ed|fraudulent)|rebasing bug|security (?:breach|flaw))/i;
const NOT_EXPLOITED: Record<string, true> = { "mod-move-dollar-2025-06": true, "yu-yu-2025-11": true, "usdx-stables-labs-usdx-2025-11": true };

export function causeFamily(d: Pick<DeadStablecoin, "id" | "causeOfDeath"> & { obituary?: string; family?: CauseFamily }): CauseFamily {
  if (d.family) return d.family;
  const c = d.causeOfDeath;
  if (c === "regulatory") return "decree";
  if (c === "abandoned") return "wind-down";
  if (!Object.hasOwn(NOT_EXPLOITED, d.id) && ATTACKED.test(d.obituary ?? "")) return "exploit";
  if (c === "algorithmic-failure") return "spiral";
  if (c === "counterparty-failure") return "counterparty";
  return "run";
}

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const BORN = new RegExp(`\\b(?:launched|created|founded|deployed|debuted|born|went live)\\b[^.;]{0,24}?\\b(?:in |on )?(?:(early|mid|late) )?(?:(${MONTHS}) )?(?:\\d{1,2}, )?((?:19|20)\\d{2})\\b`, "i");
const BORN_PAREN = /\bcreated \(((?:19|20)\d{2})\)/i;

/** The original obituary-derived launch label, also used when projecting records at build time. */
export function bornOf(obituary: string, deathDate: string): string | null {
  const m = BORN.exec(obituary);
  const p = m ? null : BORN_PAREN.exec(obituary);
  const year = m?.[3] ?? p?.[1];
  if (!year || year > deathDate.slice(0, 4)) return null;
  const qual = m?.[1]?.toLowerCase(), month = m?.[2];
  return [qual, month ? month.charAt(0).toUpperCase() + month.slice(1).toLowerCase() : null, year].filter(Boolean).join(" ");
}
