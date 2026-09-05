import { formatCompactUsd } from "../lib/format-detail";
import { riskWaterAreaForPlacement } from "./risk-water-areas";
import type { AreaNode, DewsAreaBand, PharosVilleWorld, ShipNode } from "./world-types";

export type ObserveBeatKind = "lighthouse" | "risk" | "supply" | "concentration";

export interface ObserveBeat {
  detailId: string;
  kind: ObserveBeatKind;
  label: string;
  tile: { x: number; y: number };
}

const RISK_RANK: Record<ShipNode["riskZone"], number> = {
  calm: 0,
  ledger: 1,
  watch: 2,
  alert: 3,
  warning: 4,
  danger: 5,
};

const AREA_RISK_RANK: Record<DewsAreaBand, number> = {
  CALM: 0,
  WATCH: 1,
  ALERT: 2,
  WARNING: 3,
  DANGER: 4,
};

export function selectGardenObservatoryAreas(
  areas: readonly AreaNode[],
): AreaNode[] {
  const activeAreas = areas
    .filter((area): area is AreaNode & { band: DewsAreaBand; count: number } => (
      area.band !== undefined
      && area.band !== "CALM"
      && typeof area.count === "number"
      && area.count > 0
    ))
    .toSorted((left, right) => (
      AREA_RISK_RANK[right.band] - AREA_RISK_RANK[left.band]
      || right.count - left.count
      || left.id.localeCompare(right.id)
    ));
  const primary = activeAreas[0];
  if (!primary) return [];
  const secondary = activeAreas
    .slice(1)
    .toSorted((left, right) => (
      right.count - left.count
      || AREA_RISK_RANK[right.band] - AREA_RISK_RANK[left.band]
      || left.id.localeCompare(right.id)
    ))[0];
  return secondary ? [primary, secondary] : [primary];
}

export function buildObserveSequence(
  world: Pick<PharosVilleWorld, "docks" | "lighthouse" | "ships"> & Partial<Pick<PharosVilleWorld, "freshness">>,
): ObserveBeat[] {
  const beats: ObserveBeat[] = [{
    detailId: world.lighthouse.detailId,
    kind: "lighthouse",
    label: lighthouseBeatLabel(world.lighthouse),
    tile: world.lighthouse.tile,
  }];

  const riskShip = world.ships
    .filter((ship) => RISK_RANK[ship.riskZone] >= RISK_RANK.watch)
    .toSorted(compareRiskShips)[0];
  if (riskShip) {
    beats.push({
      detailId: riskShip.detailId,
      kind: "risk",
      label: `${riskShip.symbol} is the observatory's leading risk watch in ${riskWaterAreaForPlacement(riskShip.riskPlacement).label}.`,
      tile: riskShip.riskTile,
    });
  }

  const supplyShip = world.ships
    .filter((ship) => Number.isFinite(ship.change7dPct))
    .filter((ship) => ship.detailId !== riskShip?.detailId)
    .toSorted(compareSupplyShips)[0]
    ?? world.ships.filter((ship) => Number.isFinite(ship.change7dPct)).toSorted(compareSupplyShips)[0];
  if (supplyShip && supplyShip.change7dPct != null) {
    beats.push({
      detailId: supplyShip.detailId,
      kind: "supply",
      label: `${supplyShip.symbol} has the observatory's largest weekly percentage supply change${riskShip && supplyShip.detailId !== riskShip.detailId ? " outside the leading risk watch" : ""} at ${formatSignedPercent(supplyShip.change7dPct)}; ${formatCompactUsd(supplyShip.marketCapUsd)} market cap.`,
      tile: supplyShip.tile,
    });
  }

  const concentrationDock = world.docks
    .filter((dock) => Number.isFinite(dock.concentration))
    .toSorted((left, right) => (
      right.concentration! - left.concentration!
      || right.totalUsd - left.totalUsd
      || left.id.localeCompare(right.id)
    ))[0];
  if (concentrationDock && concentrationDock.concentration != null) {
    beats.push({
      detailId: concentrationDock.detailId,
      kind: "concentration",
      label: `${concentrationDock.label} has the observatory's highest dock concentration at HHI ${concentrationDock.concentration.toFixed(2)} — higher means supply is concentrated in fewer stablecoins; ${formatCompactUsd(concentrationDock.totalUsd)} total supply.`,
      tile: concentrationDock.tile,
    });
  }

  const freshness = world.freshness;
  for (const beat of beats) {
    const stale = beat.kind === "lighthouse" ? freshness?.stabilityStale
      : beat.kind === "concentration" ? freshness?.chainsStale
      : beat.kind === "supply" ? freshness?.stablecoinsStale
      : freshness?.pegSummaryStale || freshness?.stressStale || freshness?.stablecoinsStale;
    if (stale) beat.label += " This reading uses stale or unavailable evidence; inspect the ledger for provenance.";
  }
  return beats;
}

function compareRiskShips(left: ShipNode, right: ShipNode): number {
  return RISK_RANK[right.riskZone] - RISK_RANK[left.riskZone]
    || Math.abs(right.pegDeviationBps ?? 0) - Math.abs(left.pegDeviationBps ?? 0)
    || Math.abs(right.change7dPct ?? 0) - Math.abs(left.change7dPct ?? 0)
    || right.marketCapUsd - left.marketCapUsd
    || left.id.localeCompare(right.id);
}

function compareSupplyShips(left: ShipNode, right: ShipNode): number {
  return Math.abs(right.change7dPct ?? 0) - Math.abs(left.change7dPct ?? 0)
    || right.marketCapUsd - left.marketCapUsd
    || left.id.localeCompare(right.id);
}

function lighthouseBeatLabel(lighthouse: PharosVilleWorld["lighthouse"]): string {
  if (lighthouse.unavailable || lighthouse.score == null) {
    return "The Pharos lighthouse is waiting for a current PSI reading.";
  }
  return `The Pharos lighthouse reports PSI ${Math.round(lighthouse.score)}, ${lighthouse.psiBand ?? "unbanded"}.`;
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(Number.isInteger(rounded) ? 0 : 1)}%`;
}
