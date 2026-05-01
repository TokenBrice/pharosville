import { RUNTIME_ACTIVE_IDS, RUNTIME_ACTIVE_META_BY_ID } from "@shared/lib/stablecoins/runtime-registry";
import { canonicalizeChainCirculating } from "@shared/lib/chain-circulating";
import type { StablecoinData, StablecoinListResponse } from "@shared/types";
import { buildPegSummaryCoinMap, buildReportCardMap } from "@/lib/stablecoin-lookups";
import { logosById } from "@/lib/logos";
import { getCirculatingRaw } from "@/lib/supply";
import { getRecentChange } from "../../recent-change";
import { isStricterPlacement, resolveShipRiskPlacement } from "../../risk-placement";
import {
  STABLECOIN_SQUADS,
  squadFormationOffsetForPlacement,
  squadForMember,
  squadRole,
  type StablecoinSquad,
  type SquadId,
} from "../../maker-squad";
import {
  isRiskPlacementWaterTile,
  nearestRiskPlacementWaterTile,
  riskPlacementWaterTiles,
} from "../../risk-water-placement";
import {
  SHIP_SCATTER_RADIUS,
  SHIP_RISK_PLACEMENTS,
  SHIP_WATER_ANCHORS,
  riskWaterAreaForPlacement,
} from "../../risk-water-areas";
import { resolveShipVisual } from "../../ship-visuals";
import { stableHash, stableOffset, stableUnit } from "../../stable-random";
import {
  clampMapTile,
  nearestAvailableWaterTile,
  nearestWaterTile,
  REGION_TILES,
} from "../../world-layout";
import type {
  DockNode,
  PlacementEvidence,
  ShipChainPresence,
  ShipNode,
  ShipRiskPlacement,
} from "../../world-types";
import type { BuildShipsStage, PharosVilleInputs } from "../pipeline-types";

function activeAssets(stablecoins: StablecoinListResponse | null | undefined): StablecoinData[] {
  return (stablecoins?.peggedAssets ?? []).filter((asset) => (
    RUNTIME_ACTIVE_IDS.has(asset.id) && RUNTIME_ACTIVE_META_BY_ID.has(asset.id) && asset.frozen !== true
  ));
}

function buildShipChainPresence(asset: StablecoinData, renderedDockChainIds: ReadonlySet<string>): ShipChainPresence[] {
  const entries = [...canonicalizeChainCirculating(asset.chainCirculating).entries()]
    .filter(([, point]) => point.current > 0)
    .sort((a, b) => b[1].current - a[1].current || a[0].localeCompare(b[0]));
  const totalUsd = entries.reduce((sum, [, point]) => sum + point.current, 0);
  if (totalUsd <= 0) return [];

  return entries.map(([chainId, point]) => ({
    chainId,
    currentUsd: point.current,
    share: point.current / totalUsd,
    hasRenderedDock: renderedDockChainIds.has(chainId),
  }));
}

function shipPlacementAnchor(asset: StablecoinData, placement: ShipNode["riskPlacement"]): { x: number; y: number } {
  const anchors = SHIP_WATER_ANCHORS[placement];
  return anchors[stableHash(`${asset.id}.${placement}.anchor`) % anchors.length] ?? REGION_TILES[placement];
}

function shipTile(asset: StablecoinData, placement: ShipNode["riskPlacement"]): { x: number; y: number } {
  const base = shipPlacementAnchor(asset, placement);
  const radius = SHIP_SCATTER_RADIUS[placement];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const angle = stableUnit(`${asset.id}.${placement}.angle.${attempt}`) * Math.PI * 2;
    const distance = 0.25 + Math.sqrt(stableUnit(`${asset.id}.${placement}.distance.${attempt}`)) * 0.75;
    const tile = {
      ...clampMapTile({
        x: Math.round(base.x + Math.cos(angle) * radius.x * distance + stableOffset(`${asset.id}.risk.x.${attempt}`, 1) * 0.3),
        y: Math.round(base.y + Math.sin(angle) * radius.y * distance + stableOffset(`${asset.id}.risk.y.${attempt}`, 1) * 0.3),
      }),
    };
    if (isRiskPlacementWaterTile(tile, placement)) return tile;
  }
  return nearestRiskPlacementWaterTile(base, placement, 18) ?? nearestWaterTile(base, 18);
}

function stampSquad(id: string, squad: StablecoinSquad): { squadId: SquadId; role: "flagship" | "consort" } | null {
  const role = squadRole(id);
  if (!role) return null;
  return { squadId: squad.id, role };
}

function consortRisk(
  ownRisk: { placement: ShipRiskPlacement; evidence: PlacementEvidence },
  flagshipRisk: { placement: ShipRiskPlacement; evidence: PlacementEvidence },
  consortHasNavToken: boolean,
): { placement: ShipRiskPlacement; evidence: PlacementEvidence } {
  const stricter = isStricterPlacement(ownRisk.placement, flagshipRisk.placement);
  const sourceFields: string[] = [...flagshipRisk.evidence.sourceFields];
  if (consortHasNavToken && !sourceFields.includes("meta.flags.navToken")) {
    sourceFields.push("meta.flags.navToken");
  }
  if (stricter) {
    for (const field of ownRisk.evidence.sourceFields) {
      if (!sourceFields.includes(field)) sourceFields.push(field);
    }
  }
  const evidence: PlacementEvidence = {
    reason: `Maker squad member; inherits flagship placement (${flagshipRisk.evidence.reason})`,
    sourceFields,
    stale: flagshipRisk.evidence.stale,
    ...(stricter
      ? {
          squadOverride: {
            ownPlacement: ownRisk.placement,
            ownReason: ownRisk.evidence.reason,
          },
        }
      : {}),
  };
  return { placement: flagshipRisk.placement, evidence };
}

function buildShips(inputs: PharosVilleInputs, docks: readonly DockNode[]): ShipNode[] {
  const pegById = buildPegSummaryCoinMap(inputs.pegSummary?.coins);
  const reportCardById = buildReportCardMap(inputs.reportCards?.cards) ?? {};
  const stressById = inputs.stress?.signals ?? {};
  const renderedDockChainIds = new Set(docks.map((dock) => dock.chainId));

  const assets = activeAssets(inputs.stablecoins);
  // Per-squad flagship risk: a squad activates iff its flagship is in
  // activeAssets. Squads activate independently - Maker (DAI flagship) can sail
  // even if Sky (USDS flagship) is missing, and vice versa.
  type FlagshipRisk = { placement: ShipRiskPlacement; evidence: PlacementEvidence };
  const flagshipRiskBySquad = new Map<SquadId, FlagshipRisk>();
  for (const squad of STABLECOIN_SQUADS) {
    const flagshipAsset = assets.find((asset) => asset.id === squad.flagshipId);
    const flagshipMeta = flagshipAsset ? RUNTIME_ACTIVE_META_BY_ID.get(flagshipAsset.id) : undefined;
    if (!flagshipAsset || !flagshipMeta) continue;
    flagshipRiskBySquad.set(squad.id, resolveShipRiskPlacement({
      asset: flagshipAsset,
      meta: flagshipMeta,
      pegCoin: pegById.get(flagshipAsset.id),
      stress: stressById[flagshipAsset.id],
      freshness: inputs.freshness,
    }));
  }

  const ships = assets.map((asset) => {
    const meta = RUNTIME_ACTIVE_META_BY_ID.get(asset.id);
    if (!meta) throw new Error(`Active asset ${asset.id} is missing metadata`);
    const reportCard = reportCardById[asset.id] ?? null;
    const ownRisk = resolveShipRiskPlacement({
      asset,
      meta,
      pegCoin: pegById.get(asset.id),
      stress: stressById[asset.id],
      freshness: inputs.freshness,
    });

    // If this asset belongs to an active squad and is a consort, inherit that
    // squad's flagship risk. Otherwise use the per-asset placement.
    const squad = squadForMember(asset.id);
    const flagshipRisk = squad ? flagshipRiskBySquad.get(squad.id) : undefined;
    const isConsort = !!squad && !!flagshipRisk && asset.id !== squad.flagshipId;
    const risk = isConsort && flagshipRisk
      ? consortRisk(ownRisk, flagshipRisk, meta.flags.navToken === true)
      : ownRisk;

    const chainPresence = buildShipChainPresence(asset, renderedDockChainIds);
    const dominantChainId = chainPresence[0]?.chainId ?? null;
    const homeDockChainId = chainPresence.find((presence) => presence.hasRenderedDock)?.chainId ?? null;
    const recent = getRecentChange(asset);
    const riskTile = shipTile(asset, risk.placement);
    const riskWaterArea = riskWaterAreaForPlacement(risk.placement);
    const stamped = squad && flagshipRisk ? stampSquad(asset.id, squad) : null;
    return {
      id: asset.id,
      kind: "ship" as const,
      label: asset.name,
      symbol: asset.symbol,
      asset,
      meta,
      reportCard,
      logoSrc: logosById[asset.id] ?? null,
      tile: riskTile,
      riskTile,
      chainPresence,
      dockVisits: [],
      dominantChainId,
      homeDockChainId,
      dockChainId: homeDockChainId,
      marketCapUsd: getCirculatingRaw(asset),
      riskPlacement: risk.placement,
      riskZone: riskWaterArea.motionZone,
      riskWaterLabel: riskWaterArea.label,
      placementEvidence: risk.evidence,
      visual: resolveShipVisual(asset, meta, reportCard),
      change24hUsd: recent.change24hUsd,
      change24hPct: recent.change24hPct,
      detailId: `ship.${asset.id}`,
      ...(stamped ? { squadId: stamped.squadId, squadRole: stamped.role } : {}),
    };
  });
  return spreadShipRiskAnchorsAcrossWater(ships);
}

function spreadShipRiskAnchorsAcrossWater(ships: ShipNode[]): ShipNode[] {
  const sortedShips = ships.toSorted((a, b) => b.marketCapUsd - a.marketCapUsd || a.id.localeCompare(b.id));
  const occupied = new Set<string>();
  const shipsByPlacement = new Map<ShipRiskPlacement, ShipNode[]>();
  const updatedShips = new Map<string, ShipNode>();

  for (const ship of sortedShips) {
    const placementShips = shipsByPlacement.get(ship.riskPlacement) ?? [];
    placementShips.push(ship);
    shipsByPlacement.set(ship.riskPlacement, placementShips);
  }

  for (const placement of SHIP_RISK_PLACEMENTS) {
    const placementShips = shipsByPlacement.get(placement) ?? [];
    if (placementShips.length === 0) continue;

    for (const ship of spreadRiskPlacementShips(placementShips, placement, occupied)) {
      updatedShips.set(ship.id, ship);
    }
  }

  return sortedShips.map((ship) => updatedShips.get(ship.id) ?? ship);
}

function spreadRiskPlacementShips(
  ships: readonly ShipNode[],
  placement: ShipRiskPlacement,
  occupied: Set<string>,
): ShipNode[] {
  // 1) Place flagships and non-squad ships first (so each squad's flagship.tile is fixed)
  // 2) For each consort, find its squad's flagship and snap to that flagship's
  //    tile + the squad's placement-aware formation offset.
  // 3) Clamp via nearestRiskPlacementWaterTile - never generic water tiles -
  //    so the consort cannot spill outside the placement's motion zone.
  const consorts = ships.filter((s) => s.squadRole === "consort");
  const others = ships.filter((s) => s.squadRole !== "consort");

  const placedOthers = othersSpread(others, placement, occupied);
  const flagshipsBySquadId = new Map<string, ShipNode>();
  for (const placed of placedOthers) {
    if (placed.squadRole === "flagship" && placed.squadId) {
      flagshipsBySquadId.set(placed.squadId, placed);
    }
  }

  const placedConsorts = consorts.map((consort) => {
    const consortSquad = consort.squadId ? squadForMember(consort.id) : null;
    const flagship = consort.squadId ? flagshipsBySquadId.get(consort.squadId) : null;
    if (!consortSquad || !flagship) return consort; // squad inactive in this placement
    const offset = squadFormationOffsetForPlacement(consort.id, consortSquad, placement)
      ?? { dx: 0, dy: 0 };
    const target = clampMapTile({
      x: flagship.tile.x + offset.dx,
      y: flagship.tile.y + offset.dy,
    });
    // Fallback: when the placement's water set is too tight to host the
    // formation offset within radius 4, collapse onto the flagship's tile.
    // Placement-scoped clamping protects motionZone invariants; overlap is
    // tolerable, generic-water spill would break DEWS-band contracts.
    const placementTile = nearestRiskPlacementWaterTile(target, placement, 4)
      ?? flagship.tile;
    occupied.add(tileKey(placementTile));
    return { ...consort, tile: placementTile, riskTile: placementTile };
  });

  // Preserve original ship ordering.
  const byId = new Map<string, ShipNode>(
    [...placedOthers, ...placedConsorts].map((s) => [s.id, s]),
  );
  return ships.map((s) => byId.get(s.id) ?? s);
}

function othersSpread(
  ships: readonly ShipNode[],
  placement: ShipRiskPlacement,
  occupied: Set<string>,
): ShipNode[] {
  const candidates = riskPlacementWaterTiles(placement);
  const selectedTiles: { x: number; y: number }[] = [];

  return ships.map((ship) => {
    const riskTile = spacedRiskPlacementTile({
      candidates,
      occupied,
      preferred: ship.riskTile,
      selectedTiles,
      seed: `${ship.id}.${placement}.risk-spread`,
    }) ?? nearestAvailableWaterTile(ship.riskTile, occupied);

    occupied.add(tileKey(riskTile));
    selectedTiles.push(riskTile);
    return { ...ship, tile: riskTile, riskTile };
  });
}

function spacedRiskPlacementTile(input: {
  candidates: readonly { x: number; y: number }[];
  occupied: ReadonlySet<string>;
  preferred: { x: number; y: number };
  selectedTiles: readonly { x: number; y: number }[];
  seed: string;
}): { x: number; y: number } | null {
  let bestTile: { x: number; y: number } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of input.candidates) {
    if (input.occupied.has(tileKey(candidate))) continue;
    const spacing = input.selectedTiles.length > 0
      ? minTileDistance(candidate, input.selectedTiles)
      : 0;
    const preferredDistance = Math.hypot(candidate.x - input.preferred.x, candidate.y - input.preferred.y);
    const jitter = stableUnit(`${input.seed}.${candidate.x}.${candidate.y}`) * 0.001;
    const score = input.selectedTiles.length > 0
      ? spacing * 1000 - preferredDistance * 0.1 + jitter
      : -preferredDistance + jitter;

    if (score > bestScore) {
      bestScore = score;
      bestTile = candidate;
    }
  }

  return bestTile;
}

function minTileDistance(tile: { x: number; y: number }, others: readonly { x: number; y: number }[]): number {
  let distance = Number.POSITIVE_INFINITY;
  for (const other of others) {
    distance = Math.min(distance, Math.hypot(tile.x - other.x, tile.y - other.y));
  }
  return distance;
}

function tileKey(tile: { x: number; y: number }): string {
  return `${tile.x}.${tile.y}`;
}

export function buildShipsStage(inputs: PharosVilleInputs, docks: readonly DockNode[]): BuildShipsStage {
  return {
    ships: buildShips(inputs, docks),
  };
}
