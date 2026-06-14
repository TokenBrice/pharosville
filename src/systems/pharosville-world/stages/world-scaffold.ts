import { RUNTIME_CEMETERY_ENTRIES } from "@shared/lib/cemetery-runtime";
import { PSI_HEX_COLORS } from "@shared/lib/psi-colors";
import type { StabilityIndexResponse } from "@shared/types";
import { buildChainDocks } from "../../chain-docks";
import {
  buildPharosVilleMap,
  graveNodesFromEntries,
  LIGHTHOUSE_TILE,
  PIGEON_ISLAND_CENTER,
} from "../../world-layout";
import {
  SHIP_RISK_PLACEMENTS,
  riskWaterAreaForPlacement,
} from "../../risk-water-areas";
import { countShipsByRiskPlacement } from "./ship-placement";
import type {
  DewsAreaBand,
  DockNode,
  LighthouseNode,
  PharosVilleWorld,
  PigeonnierNode,
  ShipNode,
} from "../../world-types";
import type {
  BuildWorldScaffoldStage,
  PharosVilleInputs,
} from "../pipeline-types";

function toEpochMs(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value < 10_000_000_000 ? value * 1000 : value;
}

export function resolveGeneratedAt(inputs: PharosVilleInputs): number | null {
  const explicitGeneratedAt = toEpochMs(inputs.generatedAt);
  if (explicitGeneratedAt !== null) return explicitGeneratedAt;

  const candidates = [
    inputs.chains?.updatedAt,
    inputs.stability?.current?.computedAt,
    inputs.stability?.methodology?.asOf,
    inputs.pegSummary?.methodology?.asOf,
    inputs.stress?.updatedAt,
    inputs.reportCards?.updatedAt,
  ]
    .map(toEpochMs)
    .filter((value): value is number => value !== null);

  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function isConditionBand(value: string | null | undefined): value is keyof typeof PSI_HEX_COLORS {
  return !!value && value in PSI_HEX_COLORS;
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonEmptyString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

type StabilityCurrent = NonNullable<StabilityIndexResponse["current"]>;

function lighthouseComponents(current: StabilityCurrent | null): LighthouseNode["components"] | undefined {
  const severity = finiteNumber(current?.components?.severity);
  const breadth = finiteNumber(current?.components?.breadth);
  const trend = finiteNumber(current?.components?.trend);
  if (severity === null || breadth === null || trend === null) return undefined;
  const stressBreadth = finiteNumber(current?.components?.stressBreadth);
  return {
    severity,
    breadth,
    ...(stressBreadth !== null ? { stressBreadth } : {}),
    trend,
  };
}

function lighthouseContributors(current: StabilityCurrent | null): LighthouseNode["contributors"] | undefined {
  const contributors = (current?.contributors ?? []).flatMap((contributor) => {
    const id = nonEmptyString(contributor.id);
    const symbol = nonEmptyString(contributor.symbol);
    const bps = finiteNumber(contributor.bps);
    const mcapUsd = finiteNumber(contributor.mcapUsd);
    if (!id || !symbol || bps === null || mcapUsd === null) return [];
    const ageDays = finiteNumber(contributor.ageDays);
    const factor = finiteNumber(contributor.factor);
    return [{
      id,
      symbol,
      bps,
      mcapUsd,
      ...(ageDays !== null ? { ageDays } : {}),
      ...(factor !== null ? { factor } : {}),
    }];
  }).slice(0, 5);
  return contributors.length > 0 ? contributors : undefined;
}

function buildPigeonnier(): PigeonnierNode {
  return {
    id: "pigeonnier",
    kind: "pigeonnier",
    label: "Pigeonnier",
    tile: { ...PIGEON_ISLAND_CENTER },
    detailId: "pigeonnier",
  };
}

function buildLighthouse(
  stability: StabilityIndexResponse | null | undefined,
  pegSummary: PharosVilleInputs["pegSummary"],
): LighthouseNode {
  const current = stability?.current ?? null;
  const band = current?.band ?? null;
  const components = lighthouseComponents(current);
  const avg24h = finiteNumber(current?.avg24h);
  const avg24hBand = nonEmptyString(current?.avg24hBand);
  const contributors = lighthouseContributors(current);
  return {
    id: "lighthouse",
    kind: "lighthouse",
    label: "Pharos lighthouse",
    tile: { ...LIGHTHOUSE_TILE },
    psiBand: band,
    score: finiteNumber(current?.score),
    ...(components ? { components } : {}),
    ...(avg24h !== null ? { avg24h } : {}),
    ...(avg24hBand ? { avg24hBand } : {}),
    ...(contributors ? { contributors } : {}),
    color: isConditionBand(band) ? PSI_HEX_COLORS[band] : "#8aa0a6",
    unavailable: !current || !isConditionBand(band),
    detailId: "lighthouse",
    lastFleetDepegAt: lastFleetDepegAt(pegSummary),
  };
}

/** Most recent depeg event across the tracked fleet, epoch ms, or null. */
function lastFleetDepegAt(pegSummary: PharosVilleInputs["pegSummary"]): number | null {
  let latest: number | null = null;
  for (const coin of pegSummary?.coins ?? []) {
    const at = toEpochMs(coin.lastEventAt);
    if (at !== null && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

function areaIdForRiskWaterPlacement(placement: ShipNode["riskPlacement"], band: DewsAreaBand | null): string {
  return band ? `area.dews.${band.toLowerCase()}` : `area.risk-water.${placement}`;
}

function sourceFieldsForRiskWaterPlacement(placement: ShipNode["riskPlacement"], band: DewsAreaBand | null): string[] {
  if (band) return ["pegSummary.coins[]", "stress.signals[]", "freshness"];
  if (placement === "ledger-mooring") return ["meta.flags.navToken", "pegSummary.coins[]", "stress.signals[]"];
  return ["pegSummary.coins[]", "stress.signals[]"];
}

function summaryForRiskWaterPlacement(placement: ShipNode["riskPlacement"], band: DewsAreaBand | null): string {
  const area = riskWaterAreaForPlacement(placement);
  if (band) return `${area.label} uses ${area.waterStyle} for ships placed in the ${band} risk-water band.`;
  if (placement === "ledger-mooring") return "Ledger Mooring uses ledger water for NAV ledger assets, including assets that also have standard peg or DEWS rows.";
  return `${area.label} is a named risk-water area.`;
}

function buildAreas(shipCountsByRiskPlacement: ReadonlyMap<ShipNode["riskPlacement"], number>): PharosVilleWorld["areas"] {
  return SHIP_RISK_PLACEMENTS.map((placement) => {
    const riskWaterArea = riskWaterAreaForPlacement(placement);
    const band = riskWaterArea.band;
    const id = areaIdForRiskWaterPlacement(placement, band);
    const sourceFields = sourceFieldsForRiskWaterPlacement(placement, band);
    return {
      id,
      kind: "area" as const,
      label: riskWaterArea.label,
      tile: riskWaterArea.labelTile,
      ...(band ? { band } : {}),
      count: band ? shipCountsByRiskPlacement.get(placement) ?? 0 : null,
      detailId: id,
      facts: [
        { label: "Water style", value: riskWaterArea.waterStyle },
        { label: "Source", value: sourceFields.join(", ") },
      ],
      links: [{
        label: placement === "ledger-mooring" ? "Stablecoins" : "DEWS",
        href: placement === "ledger-mooring" ? "/stablecoins/" : "/depeg/",
      }],
      riskPlacement: placement,
      riskZone: riskWaterArea.motionZone,
      sourceFields,
      summary: summaryForRiskWaterPlacement(placement, band),
    };
  });
}

// P3 metaphor quick-win: ride the chain's backing-diversity health factor on
// the dock node so `detailForDock` and the dock congestion render cue read
// one field instead of re-joining the chains payload.
function withBackingDiversity(docks: DockNode[], chains: PharosVilleInputs["chains"]): DockNode[] {
  const diversityByChainId = new Map(
    (chains?.chains ?? []).map((chain) => [chain.id, chain.healthFactors?.backingDiversity ?? null] as const),
  );
  return docks.map((dock) => ({ ...dock, backingDiversity: diversityByChainId.get(dock.chainId) ?? null }));
}

export function buildWorldScaffoldStage(inputs: PharosVilleInputs): BuildWorldScaffoldStage {
  const docks = withBackingDiversity(buildChainDocks(inputs.chains), inputs.chains);
  return {
    map: buildPharosVilleMap(),
    lighthouse: buildLighthouse(inputs.stability, inputs.pegSummary),
    pigeonnier: buildPigeonnier(),
    docks,
    areas: buildAreas(countShipsByRiskPlacement(inputs, docks)),
    graves: graveNodesFromEntries(inputs.cemeteryEntries ?? RUNTIME_CEMETERY_ENTRIES),
  };
}
