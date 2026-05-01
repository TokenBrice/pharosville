import { RUNTIME_CEMETERY_ENTRIES } from "@shared/lib/cemetery-runtime";
import { PSI_HEX_COLORS } from "@shared/lib/psi-colors";
import type { StabilityIndexResponse, StressSignalsAllResponse } from "@shared/types";
import { buildChainDocks } from "../../chain-docks";
import {
  buildPharosVilleMap,
  graveNodesFromEntries,
  LIGHTHOUSE_TILE,
} from "../../world-layout";
import {
  SHIP_RISK_PLACEMENTS,
  riskWaterAreaForPlacement,
} from "../../risk-water-areas";
import type {
  DewsAreaBand,
  LighthouseNode,
  PharosVilleWorld,
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

export function resolveGeneratedAt(inputs: PharosVilleInputs): number {
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

  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function isConditionBand(value: string | null | undefined): value is keyof typeof PSI_HEX_COLORS {
  return !!value && value in PSI_HEX_COLORS;
}

function buildLighthouse(stability: StabilityIndexResponse | null | undefined): LighthouseNode {
  const current = stability?.current ?? null;
  const band = current?.band ?? null;
  return {
    id: "lighthouse",
    kind: "lighthouse",
    label: "Pharos lighthouse",
    tile: { ...LIGHTHOUSE_TILE },
    psiBand: band,
    score: current?.score ?? null,
    color: isConditionBand(band) ? PSI_HEX_COLORS[band] : "#8aa0a6",
    unavailable: !current || !isConditionBand(band),
    detailId: "lighthouse",
  };
}

function buildDewsBandCounts(stress: StressSignalsAllResponse | null | undefined): Record<DewsAreaBand, number> {
  const counts: Record<DewsAreaBand, number> = {
    DANGER: 0,
    WARNING: 0,
    ALERT: 0,
    WATCH: 0,
    CALM: 0,
  };
  for (const entry of Object.values(stress?.signals ?? {})) {
    const band = entry.band.toUpperCase();
    if (band in counts) counts[band as DewsAreaBand] += 1;
  }
  return counts;
}

function areaIdForRiskWaterPlacement(placement: ShipNode["riskPlacement"], band: DewsAreaBand | null): string {
  return band ? `area.dews.${band.toLowerCase()}` : `area.risk-water.${placement}`;
}

function sourceFieldsForRiskWaterPlacement(placement: ShipNode["riskPlacement"], band: DewsAreaBand | null): string[] {
  if (band) return ["stress.signals[]"];
  if (placement === "ledger-mooring") return ["meta.flags.navToken", "pegSummary.coins[]", "stress.signals[]"];
  return ["pegSummary.coins[]", "stress.signals[]"];
}

function summaryForRiskWaterPlacement(placement: ShipNode["riskPlacement"], band: DewsAreaBand | null): string {
  const area = riskWaterAreaForPlacement(placement);
  if (band) return `${area.label} uses ${area.waterStyle} for DEWS ${band} placement.`;
  if (placement === "ledger-mooring") return "Ledger Mooring uses ledger water for NAV ledger assets, including assets that also have standard peg or DEWS rows.";
  return `${area.label} is a named risk-water area.`;
}

function buildAreas(stress: StressSignalsAllResponse | null | undefined): PharosVilleWorld["areas"] {
  const counts = buildDewsBandCounts(stress);
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
      band: band ?? undefined,
      count: band ? counts[band] : null,
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

export function buildWorldScaffoldStage(inputs: PharosVilleInputs): BuildWorldScaffoldStage {
  return {
    map: buildPharosVilleMap(),
    lighthouse: buildLighthouse(inputs.stability),
    docks: buildChainDocks(inputs.chains),
    areas: buildAreas(inputs.stress),
    graves: graveNodesFromEntries(inputs.cemeteryEntries ?? RUNTIME_CEMETERY_ENTRIES),
  };
}
