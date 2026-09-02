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
  const rounded = Math.round(input * 10) / 10;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(1)}%`;
}

const CALM_ZONE = /^calm/i;
const IDLE_SUFFIX = /\s+idle\s*$/i;

export interface CurrentlyParts {
  position?: string | null;
  area?: string | null;
  zone?: string | null;
  stressDriver?: string | null;
}

export function composeCurrently(parts: CurrentlyParts): string {
  const position = parts.position?.trim() ?? "";
  const area = parts.area?.trim() ?? "";
  const zone = parts.zone?.trim() ?? "";
  const stressDriver = parts.stressDriver?.trim() ?? "";

  const appendStressDriver = (value: string) => [value, stressDriver].filter(Boolean).join(" · ");

  if (zone && CALM_ZONE.test(zone) && area) {
    const isIdle = position && IDLE_SUFFIX.test(position);
    return appendStressDriver(isIdle ? `${area} (idle)` : area);
  }

  if (position) return appendStressDriver(position);
  if (area) return appendStressDriver(area);
  return stressDriver;
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
  | "signalMast"
  | "fleetPeg"
  | "beamBearing"
  | "highWaterMark"
  | "dexCrossCheck"
  | "cycleTempo"
  | "homeDock"
  | "backingDiversity"
  | "netFlow24h"
  | "supplyTide"
  | "flightToQuality"
  | "representativePosition"
  | "riskWaterArea"
  | "riskWaterZone"
  | "stressDriver"
  | "chainsPresent"
  | "sailingInFormation"
  | "culturalSignificance"
  | "pegDeviation"
  | "mastSignal"
  | "serviceAge"
  | "issuanceWork"
  | "redemptionFitting"
  | "collateralCargo"
  | "customsAuthority"
  | "pegStability"
  | "liquidity"
  | "resilience"
  | "decentralization"
  | "dependencyRisk"
  | "waterStyle"
  | "atmosphere"
  | "sourceFields";

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
  "signal mast": "signalMast",
  "fleet peg": "fleetPeg",
  "beam bearing": "beamBearing",
  "worst band, 30d": "highWaterMark",
  "dex cross-check": "dexCrossCheck",
  "cycle tempo": "cycleTempo",
  "home dock": "homeDock",
  "backing diversity": "backingDiversity",
  "net flow 24h": "netFlow24h",
  "supply tide 7d": "supplyTide",
  "flight to quality": "flightToQuality",
  "representative position": "representativePosition",
  "risk water area": "riskWaterArea",
  "risk water zone": "riskWaterZone",
  "stress driver": "stressDriver",
  "chain present": "chainsPresent",
  "chains present": "chainsPresent",
  "sailing in formation": "sailingInFormation",
  "cultural significance": "culturalSignificance",
  "peg deviation": "pegDeviation",
  "mast signal": "mastSignal",
  "in service since / tracked": "serviceAge",
  "issuance work, 24h": "issuanceWork",
  "redemption fitting": "redemptionFitting",
  "collateral cargo": "collateralCargo",
  "customs authority": "customsAuthority",
  "peg stability": "pegStability",
  "liquidity": "liquidity",
  "resilience": "resilience",
  "decentralization": "decentralization",
  "dependency risk": "dependencyRisk",
  "water style": "waterStyle",
  "atmosphere": "atmosphere",
  "source": "sourceFields",
  "source fields": "sourceFields",
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

// The first screen quotes at most three figures — the panel's "reading line".
// Everything else waits inside the record disclosure, so a first look stays a
// plaque rather than a table (interface revamp DU5/DU12).
const READING_LINE_MAX_FIGURES = 3;

interface ReadingLineFigure {
  /** Raw fact label, as authored in `systems/detail-model.ts`. */
  label: string;
  format?: (value: string) => string;
}

const compactFigure = (value: string) => formatCompactUsd(value);

const READING_LINE_FIGURES: Record<string, readonly ReadingLineFigure[]> = {
  area: [
    { label: "DEWS band" },
    { label: "Stablecoins", format: (value) => `${value} ${value === "1" ? "ship" : "ships"}` },
  ],
  dock: [
    { label: "Stablecoin supply", format: compactFigure },
    { label: "Stablecoin count", format: (value) => `${value} ${value === "1" ? "stablecoin" : "stablecoins"}` },
    { label: "Health", format: (value) => `${value} health` },
  ],
  grave: [
    { label: "Cause" },
    { label: "Date" },
    { label: "Peak market cap", format: compactFigure },
  ],
  lighthouse: [
    { label: "Score", format: (value) => `PSI ${value}` },
    { label: "Band" },
  ],
  ship: [
    { label: "Market cap", format: compactFigure },
    { label: "Fleet rank" },
    { label: "24h supply change", format: (value) => `${value} 24h` },
    // The fact row spells the direction out ("+42 bps vs USD — above peg; hull
    // rides high"); the reading line quotes figures, so it takes the figure and
    // leaves the sentence to the row below it.
    { label: "Peg deviation", format: (value) => value.split(" — ")[0]!.trim() },
    { label: "Cycle tempo" },
  ],
};

const EMPTY_FIGURE = /^(?:—|-|unavailable|none on record)$/i;

function normalizeFactLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Up to three figures for the panel's first screen — the "reading line". The
 * order is fixed per kind and never reshuffled by how the entity is doing, so
 * the line reads the same way every time (interface revamp DU12). Returns null
 * when nothing is worth quoting (an unlit lighthouse, the pigeonnier); the
 * panel then omits the line rather than padding it with "None on record".
 */
export function buildDetailReadingLine(
  kind: string,
  facts: readonly DetailFactLike[],
): string | null {
  const wanted = READING_LINE_FIGURES[normalizeFactLabel(kind)];
  if (!wanted) return null;

  const byLabel = new Map<string, string>();
  for (const fact of facts) {
    const key = normalizeFactLabel(fact.label);
    if (!byLabel.has(key)) byLabel.set(key, fact.value);
  }

  const figures: string[] = [];
  for (const figure of wanted) {
    if (figures.length >= READING_LINE_MAX_FIGURES) break;
    const value = byLabel.get(normalizeFactLabel(figure.label))?.trim();
    if (!value || EMPTY_FIGURE.test(value)) continue;
    figures.push(figure.format ? figure.format(value) : value);
  }
  return figures.length > 0 ? figures.join(" · ") : null;
}

export function buildDetailFactSections(facts: readonly DetailFactLike[]): DetailFactSections {
  const lookup = new Map<DetailFactKey, string>();
  for (const fact of facts) {
    const key = classifyDetailFactLabel(fact.label);
    if (key) lookup.set(key, fact.value);
  }

  const identity: DetailDisplayRow[] = [];
  // The live peg reading renders in the header status line (DetailModelStatus
  // figure), not as a fact row, to hold the <= 8 fact-row density contract.
  const tier = lookup.get("sizeTier");
  const klass = lookup.get("shipClass");
  if (tier || klass) {
    // The heritage-gated Bluechip audit and the nav/yield mast signal fold
    // into the Class row (not their own rows) to respect the panel's <= 8
    // fact-row density contract.
    const composed = [tier, klass, lookup.get("bluechipAudit"), lookup.get("safetyGrade"), lookup.get("mastSignal")]
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
  // 3b: the crossed bearings sit next to the figure they qualify rather than
  // folding into it. Upstream this row only exists when the two instruments
  // DISAGREE, so it is an exception report, not a permanent ninth row.
  const dexCrossCheck = lookup.get("dexCrossCheck");
  if (dexCrossCheck) identity.push({ key: "dexCrossCheck", label: "DEX cross-check", value: dexCrossCheck });
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
  // The observatory hoist and the figures behind it. Two rows rather than one
  // fold: the mast row is the canvas cue's parity (what is flying) and the
  // fleet-peg row is the evidence (what it was read from), and running them
  // together produced a line no one could scan.
  const signalMast = lookup.get("signalMast");
  if (signalMast) identity.push({ key: "signalMast", label: "Signal mast", value: signalMast });
  const fleetPeg = lookup.get("fleetPeg");
  if (fleetPeg) identity.push({ key: "fleetPeg", label: "Fleet peg", value: fleetPeg });
  // 3d and 3c, in the order the eye meets them on the monument: where the light
  // is pointing, then how high the water got. Both are lighthouse-only, so they
  // spend no rows on any ship panel.
  const beamBearing = lookup.get("beamBearing");
  if (beamBearing) identity.push({ key: "beamBearing", label: "Beam bearing", value: beamBearing });
  const highWaterMark = lookup.get("highWaterMark");
  if (highWaterMark) identity.push({ key: "highWaterMark", label: "Worst band, 30d", value: highWaterMark });
  // Task 14: DOM parity for the tide line on the shore rock and quay walls.
  // Sits beside the high-water mark because both are read off stonework, and
  // the pairing is what keeps a reader from confusing the two marks.
  const supplyTide = lookup.get("supplyTide");
  if (supplyTide) identity.push({ key: "supplyTide", label: "Supply tide 7d", value: supplyTide });
  // The flight-to-quality tenders' DOM parity, and the only place a reader
  // learns what the boats round the biggest hulls are. Lighthouse-only, and
  // present only once the mint/burn gauge has landed, so it spends no row on
  // any ship or dock panel and never claims a reading it did not get.
  const flightToQuality = lookup.get("flightToQuality");
  if (flightToQuality) identity.push({ key: "flightToQuality", label: "Flight to quality", value: flightToQuality });
  const cycleTempo = lookup.get("cycleTempo");
  if (cycleTempo) identity.push({ key: "cycleTempo", label: "Cycle tempo", value: cycleTempo });
  const serviceAge = lookup.get("serviceAge");
  if (serviceAge) identity.push({ key: "serviceAge", label: "In service since / tracked", value: serviceAge });
  const issuanceWork = lookup.get("issuanceWork");
  if (issuanceWork) identity.push({ key: "issuanceWork", label: "Issuance work, 24h", value: issuanceWork });
  const redemptionFitting = lookup.get("redemptionFitting");
  if (redemptionFitting) identity.push({ key: "redemptionFitting", label: "Redemption fitting", value: redemptionFitting });
  const collateralCargo = lookup.get("collateralCargo");
  if (collateralCargo) identity.push({ key: "collateralCargo", label: "Collateral cargo", value: collateralCargo });
  const customsAuthority = lookup.get("customsAuthority");
  if (customsAuthority) identity.push({ key: "customsAuthority", label: "Customs authority", value: customsAuthority });
  for (const [key, label] of [
    ["pegStability", "Peg stability"],
    ["liquidity", "Liquidity"],
    ["resilience", "Resilience"],
    ["decentralization", "Decentralization"],
    ["dependencyRisk", "Dependency risk"],
  ] as const) {
    const value = lookup.get(key);
    if (value) identity.push({ key, label, value });
  }
  const homeDock = lookup.get("homeDock");
  if (homeDock) identity.push({ key: "homeDock", label: "Home dock", value: homeDock });
  // Dock panels: chain backing-diversity row (gated upstream on data
  // presence; dock panels carry far fewer rows than the ship cap).
  const backingDiversity = lookup.get("backingDiversity");
  if (backingDiversity) identity.push({ key: "backingDiversity", label: "Backing diversity", value: backingDiversity });
  // Dock panels: the harbour's 24h issuance flow, and the DOM parity for the
  // cargo-tide crates. A row of its own rather than a fold, because direction is
  // the whole reading and folding it behind a separator would bury it.
  const netFlow24h = lookup.get("netFlow24h");
  if (netFlow24h) identity.push({ key: "netFlow24h", label: "Net flow 24h", value: netFlow24h });
  const waterStyle = lookup.get("waterStyle");
  if (waterStyle) identity.push({ key: "waterStyle", label: "Water style", value: waterStyle });
  const atmosphere = lookup.get("atmosphere");
  if (atmosphere) identity.push({ key: "atmosphere", label: "Atmosphere", value: atmosphere });
  const sourceFields = lookup.get("sourceFields");
  if (sourceFields) identity.push({ key: "sourceFields", label: "Source fields", value: sourceFields });

  const position: DetailDisplayRow[] = [];
  const position_ = lookup.get("representativePosition");
  const area_ = lookup.get("riskWaterArea");
  const zone_ = lookup.get("riskWaterZone");
  const stressDriver = lookup.get("stressDriver");
  const currently = composeCurrently({
    ...(position_ !== undefined ? { position: position_ } : {}),
    ...(area_ !== undefined ? { area: area_ } : {}),
    ...(zone_ !== undefined ? { zone: zone_ } : {}),
    ...(stressDriver !== undefined ? { stressDriver } : {}),
  });
  if (currently) position.push({ key: "currently", label: "Currently", value: currently });
  const chains = lookup.get("chainsPresent");
  if (chains) position.push({ key: "chains", label: "Chains", value: chains });
  const formation = lookup.get("sailingInFormation");
  if (formation) position.push({ key: "formation", label: "Sailing in formation", value: formation });

  return { identity, position };
}
