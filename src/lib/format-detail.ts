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
  | "bluechipAudit"
  | "safetyGrade"
  | "marketCap"
  | "fleetRank"
  | "shareOfFleet"
  | "priceConfidence"
  | "sourceConsensus"
  | "cycle24h"
  | "supplyMomentum"
  | "depegHistory"
  | "lastFleetDepeg"
  | "psiTrend"
  | "psiComposition"
  | "cycleTempo"
  | "homeDock"
  | "backingDiversity"
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
  "bluechip audit": "bluechipAudit",
  "safety grade": "safetyGrade",
  "market cap": "marketCap",
  "fleet rank": "fleetRank",
  "share of fleet": "shareOfFleet",
  "price confidence": "priceConfidence",
  "source consensus": "sourceConsensus",
  "24h supply change": "cycle24h",
  "supply momentum": "supplyMomentum",
  "depeg history": "depegHistory",
  "last fleet depeg": "lastFleetDepeg",
  "trend": "psiTrend",
  "composition": "psiComposition",
  "cycle tempo": "cycleTempo",
  "home dock": "homeDock",
  "backing diversity": "backingDiversity",
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
    // The heritage-gated Bluechip audit folds into the Class row (not its own
    // row) to respect the panel's <= 8 fact-row density contract.
    const composed = [tier, klass, lookup.get("bluechipAudit"), lookup.get("safetyGrade")]
      .filter(Boolean)
      .join(" · ");
    identity.push({ key: "class", label: "Class", value: composed });
  }
  const marketCap = lookup.get("marketCap");
  if (marketCap) {
    // Degraded price confidence and partial source consensus (both
    // significance-gated upstream) plus fleet-rank/share context fold into
    // the Market cap row — the figure they qualify — instead of spending rows
    // of their own.
    const value = [
      formatCompactUsd(marketCap),
      lookup.get("fleetRank"),
      lookup.get("shareOfFleet"),
      lookup.get("priceConfidence"),
      lookup.get("sourceConsensus"),
    ]
      .filter(Boolean)
      .join(" · ");
    identity.push({ key: "marketCap", label: "Market cap", value });
  }
  // Momentum and the (significance-gated) depeg record fold into the 24h row
  // (not their own rows) to respect the panel's <= 8 fact-row density
  // contract; the full labels still reach the accessibility ledger as
  // standalone lines.
  const cycle24h = lookup.get("cycle24h");
  const supplyMomentum = lookup.get("supplyMomentum");
  const depegHistory = lookup.get("depegHistory");
  if (cycle24h || supplyMomentum || depegHistory) {
    const value = [cycle24h, supplyMomentum, depegHistory ? `depeg history: ${depegHistory}` : null]
      .filter(Boolean)
      .join(" · ");
    identity.push({ key: "cycle24h", label: "24h change", value });
  }
  const lastFleetDepeg = lookup.get("lastFleetDepeg");
  if (lastFleetDepeg) identity.push({ key: "lastFleetDepeg", label: "Last fleet depeg", value: lastFleetDepeg });
  const psiTrend = lookup.get("psiTrend");
  if (psiTrend) identity.push({ key: "psiTrend", label: "Trend", value: psiTrend });
  const psiComposition = lookup.get("psiComposition");
  if (psiComposition) identity.push({ key: "psiComposition", label: "Composition", value: psiComposition });
  const cycleTempo = lookup.get("cycleTempo");
  if (cycleTempo) identity.push({ key: "cycleTempo", label: "Cycle tempo", value: cycleTempo });
  const homeDock = lookup.get("homeDock");
  if (homeDock) identity.push({ key: "homeDock", label: "Home dock", value: homeDock });
  // Dock panels: chain backing-diversity row (gated upstream on data
  // presence; dock panels carry far fewer rows than the ship cap).
  const backingDiversity = lookup.get("backingDiversity");
  if (backingDiversity) identity.push({ key: "backingDiversity", label: "Backing diversity", value: backingDiversity });

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
