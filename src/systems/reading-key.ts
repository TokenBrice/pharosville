import { RISK_SURFACE_SIGNATURES } from "./garden-sea-regions";
import { seaBodyForArea } from "./sea-bodies";
import { nodeSourceEvidenceLabel } from "./source-evidence";
import type { PharosVilleWorld } from "./world-types";

export const READING_RISK_BODIES = ["calm", "watch", "alert", "warning", "danger"] as const;
export const READING_SURFACE_DESCRIPTIONS = {
  calm: "Mirror surface",
  watch: "Long bending ribbons",
  alert: "Paired interrupted strokes",
  warning: "Short oblique groups of three",
  danger: "Dense dark groups of four",
  ledger: "Widely spaced horizontal singles; NAV pricing, not a risk band",
  wreck: "Held silt; lifecycle water, not a risk band",
} as const;
export const READING_SCALE_CAVEAT = "Size is qualitative, not proportional: supply uses a compressed, capped scale. Exact rank and supply remain in each record.";
export const READING_EXEMPLAR_IDS = [
  ...READING_RISK_BODIES.map((body) => `water.${body}`), "water.ledger", "water.wreck",
  ...["BEDROCK", "STEADY", "TREMOR", "FRACTURE", "CRISIS", "MELTDOWN"].map((band) => `lighthouse.${band}`),
  "sail.1", "sail.2", "sail.3", "cloud",
] as const;

export interface ReadingKeyEntry {
  id: string;
  label: string;
  description: string;
  detailId: string | null;
  exemplarId: string | null;
}
export interface ReadingKeyModel {
  lighthouse: ReadingKeyEntry;
  lighthouseEvidence: string;
  observedAt: number | null;
  waters: ReadingKeyEntry[];
  nonRiskWaters: ReadingKeyEntry[];
  leaders: ReadingKeyEntry[];
  supplyEvidence: string;
  scaleCaveat: string;
}

/** A DOM reading of the world, never a second source or an appearance estimate. */
export function deriveReadingKey(world: PharosVilleWorld): ReadingKeyModel {
  const lighthouse = world.lighthouse;
  const status = lighthouse.evidence.stability ?? world.freshness.stability;
  const available = !lighthouse.unavailable && lighthouse.score !== null && Number.isFinite(lighthouse.score);
  const waterEntry = (body: keyof typeof RISK_SURFACE_SIGNATURES): ReadingKeyEntry => ({
    id: `water.${body}`,
    label: RISK_SURFACE_SIGNATURES[body].label,
    description: READING_SURFACE_DESCRIPTIONS[body],
    detailId: world.areas.find((area) => seaBodyForArea(area) === body)?.detailId ?? null,
    exemplarId: `water.${body}`,
  });
  const leaders = world.ships.filter((ship) => Number.isFinite(ship.marketCapUsd) && ship.marketCapUsd > 0)
    .toSorted((left, right) => right.marketCapUsd - left.marketCapUsd || left.id.localeCompare(right.id))
    .slice(0, 3).map((ship, index): ReadingKeyEntry => ({
      id: `sail.${index + 1}`,
      label: `#${index + 1} ${ship.label} (${ship.symbol})`,
      description: `Supply rank ${index + 1}; ${ship.visual.sizeLabel}.`,
      detailId: ship.detailId,
      exemplarId: `sail.${index + 1}`,
    }));
  return {
    lighthouse: {
      id: "lighthouse", label: "Lighthouse",
      description: available ? `Official PSI ${lighthouse.score} / 100 · ${lighthouse.psiBand ?? "band unavailable"}` : "Official PSI unavailable",
      detailId: lighthouse.detailId,
      exemplarId: available && lighthouse.psiBand ? `lighthouse.${lighthouse.psiBand}` : null,
    },
    lighthouseEvidence: nodeSourceEvidenceLabel({ stability: status }),
    observedAt: status.observedAt,
    waters: READING_RISK_BODIES.map(waterEntry),
    nonRiskWaters: (["ledger", "wreck"] as const).map(waterEntry),
    leaders,
    supplyEvidence: nodeSourceEvidenceLabel({ stablecoins: world.freshness.stablecoins }),
    scaleCaveat: READING_SCALE_CAVEAT,
  };
}
