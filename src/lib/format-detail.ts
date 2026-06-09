export function compactCurrency(input: string): string {
  if (!input) return input;
  const parsed = Number(input.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed)) return input;
  if (parsed < 1_000_000) return input;
  if (parsed >= 1_000_000_000_000) return `$${(parsed / 1_000_000_000_000).toFixed(1)}T`;
  if (parsed >= 1_000_000_000) return `$${(parsed / 1_000_000_000).toFixed(1)}B`;
  return `$${(parsed / 1_000_000).toFixed(1)}M`;
}

export function formatCompactUsd(input: number | string | null | undefined): string {
  if (typeof input === "number") {
    return Number.isFinite(input) ? compactCurrency(`$${Math.round(input)}`) : "unavailable";
  }
  if (typeof input === "string") return compactCurrency(input);
  return "unavailable";
}

export function formatChangePercent(input: number | null | undefined): string {
  if (typeof input !== "number" || !Number.isFinite(input)) return "unavailable";
  return `${input >= 0 ? "+" : ""}${input.toFixed(1)}%`;
}

const CALM_ZONE = /^calm/i;
const IDLE_SUFFIX = /\s+idle\s*$/i;

export interface CurrentlyParts {
  position?: string | null;
  area?: string | null;
  zone?: string | null;
}

export function composeCurrently(parts: CurrentlyParts): string {
  const position = parts.position?.trim() ?? "";
  const area = parts.area?.trim() ?? "";
  const zone = parts.zone?.trim() ?? "";

  if (zone && CALM_ZONE.test(zone) && area) {
    const isIdle = position && IDLE_SUFFIX.test(position);
    return isIdle ? `${area} (idle)` : area;
  }

  if (position) return position;
  if (area) return area;
  return "";
}

export type DetailFactKey =
  | "shipClass"
  | "sizeTier"
  | "marketCap"
  | "cycle24h"
  | "supplyMomentum"
  | "depegHistory"
  | "lastFleetDepeg"
  | "cycleTempo"
  | "homeDock"
  | "representativePosition"
  | "riskWaterArea"
  | "riskWaterZone"
  | "chainsPresent"
  | "sailingInFormation"
  | "culturalSignificance";

export interface DetailFactLike {
  label: string;
  value: string;
}

export interface DetailDisplayRow {
  key: string;
  label: string;
  value: string;
}

export interface DetailFactSections {
  identity: DetailDisplayRow[];
  position: DetailDisplayRow[];
}

const DETAIL_FACT_LABELS = {
  "ship class": "shipClass",
  "size tier": "sizeTier",
  "market cap": "marketCap",
  "24h supply change": "cycle24h",
  "supply momentum": "supplyMomentum",
  "depeg history": "depegHistory",
  "last fleet depeg": "lastFleetDepeg",
  "cycle tempo": "cycleTempo",
  "home dock": "homeDock",
  "representative position": "representativePosition",
  "risk water area": "riskWaterArea",
  "risk water zone": "riskWaterZone",
  "chain present": "chainsPresent",
  "chains present": "chainsPresent",
  "sailing in formation": "sailingInFormation",
  "cultural significance": "culturalSignificance",
} as const satisfies Record<string, DetailFactKey>;

export function classifyDetailFactLabel(label: string): DetailFactKey | null {
  const key = label.trim().replace(/\s+/g, " ").toLowerCase() as keyof typeof DETAIL_FACT_LABELS;
  return DETAIL_FACT_LABELS[key] ?? null;
}

export function detailFactValue(facts: readonly DetailFactLike[], key: DetailFactKey): string | null {
  for (const fact of facts) {
    if (classifyDetailFactLabel(fact.label) === key) return fact.value;
  }
  return null;
}

export function buildDetailFactSections(facts: readonly DetailFactLike[]): DetailFactSections {
  const lookup = new Map<DetailFactKey, string>();
  for (const fact of facts) {
    const key = classifyDetailFactLabel(fact.label);
    if (key) lookup.set(key, fact.value);
  }

  const identity: DetailDisplayRow[] = [];
  const tier = lookup.get("sizeTier");
  const klass = lookup.get("shipClass");
  if (tier || klass) {
    const composed = [tier, klass].filter(Boolean).join(" · ");
    identity.push({ key: "class", label: "Class", value: composed });
  }
  const marketCap = lookup.get("marketCap");
  if (marketCap) identity.push({ key: "marketCap", label: "Market cap", value: formatCompactUsd(marketCap) });
  // Momentum folds into the 24h row (not its own row) to respect the panel's
  // <= 8 fact-row density contract; the full label still reaches the
  // accessibility ledger as a standalone line.
  const cycle24h = lookup.get("cycle24h");
  const supplyMomentum = lookup.get("supplyMomentum");
  if (cycle24h || supplyMomentum) {
    const value = [cycle24h, supplyMomentum].filter(Boolean).join(" · ");
    identity.push({ key: "cycle24h", label: "24h change", value });
  }
  const depegHistory = lookup.get("depegHistory");
  if (depegHistory) identity.push({ key: "depegHistory", label: "Depeg history", value: depegHistory });
  const lastFleetDepeg = lookup.get("lastFleetDepeg");
  if (lastFleetDepeg) identity.push({ key: "lastFleetDepeg", label: "Last fleet depeg", value: lastFleetDepeg });
  const cycleTempo = lookup.get("cycleTempo");
  if (cycleTempo) identity.push({ key: "cycleTempo", label: "Cycle tempo", value: cycleTempo });
  const homeDock = lookup.get("homeDock");
  if (homeDock) identity.push({ key: "homeDock", label: "Home dock", value: homeDock });

  const position: DetailDisplayRow[] = [];
  const position_ = lookup.get("representativePosition");
  const area_ = lookup.get("riskWaterArea");
  const zone_ = lookup.get("riskWaterZone");
  const currently = composeCurrently({
    ...(position_ !== undefined ? { position: position_ } : {}),
    ...(area_ !== undefined ? { area: area_ } : {}),
    ...(zone_ !== undefined ? { zone: zone_ } : {}),
  });
  if (currently) position.push({ key: "currently", label: "Currently", value: currently });
  const chains = lookup.get("chainsPresent");
  if (chains) position.push({ key: "chains", label: "Chains", value: chains });
  const formation = lookup.get("sailingInFormation");
  if (formation) position.push({ key: "formation", label: "Sailing in formation", value: formation });

  return { identity, position };
}
