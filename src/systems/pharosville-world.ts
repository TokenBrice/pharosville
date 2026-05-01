import type {
  PegSummaryResponse,
  ReportCardsResponse,
  StablecoinData,
  StablecoinListResponse,
  StabilityIndexResponse,
  StressSignalsAllResponse,
} from "@shared/types";
import type { ChainsResponse } from "@shared/types/chains";
import { RUNTIME_ACTIVE_IDS, RUNTIME_ACTIVE_META_BY_ID } from "@shared/lib/stablecoins/runtime-registry";
import { RUNTIME_CEMETERY_ENTRIES, type CemeteryEntry } from "@shared/lib/cemetery-runtime";
import { canonicalizeChainCirculating } from "@shared/lib/chain-circulating";
import { PSI_HEX_COLORS } from "@shared/lib/psi-colors";
import { buildPegSummaryCoinMap, buildReportCardMap } from "@/lib/stablecoin-lookups";
import { logosById } from "@/lib/logos";
import { getCirculatingRaw } from "@/lib/supply";
import { buildChainDocks } from "./chain-docks";
import {
  detailForDock,
  detailForGrave,
  detailForLighthouse,
  detailForArea,
  detailForShip,
} from "./detail-model";
import { buildPharosVilleMap, clampMapTile, graveNodesFromEntries, LIGHTHOUSE_TILE, MAX_TILE_X, MAX_TILE_Y, nearestAvailableWaterTile, nearestWaterTile, REGION_TILES } from "./world-layout";
import { getRecentChange } from "./recent-change";
import { isStricterPlacement, resolveShipRiskPlacement } from "./risk-placement";
import {
  MAKER_SQUAD_FLAGSHIP_ID,
  isMakerSquadMember,
  makerSquadFormationOffsetForPlacement,
  makerSquadRole,
  type MakerSquadMemberId,
} from "./maker-squad";
import { isRiskPlacementWaterTile, nearestRiskPlacementWaterTile, riskPlacementWaterTiles } from "./risk-water-placement";
import {
  SHIP_SCATTER_RADIUS,
  SHIP_RISK_PLACEMENTS,
  SHIP_WATER_ANCHORS,
  riskWaterAreaForPlacement,
} from "./risk-water-areas";
import { resolveShipVisual } from "./ship-visuals";
import { stableHash, stableOffset, stableUnit } from "./stable-random";
import { buildVisualCueRegistry } from "./visual-cue-registry";
import type {
  DetailModel,
  DewsAreaBand,
  DockNode,
  LighthouseNode,
  PharosVilleFreshness,
  PharosVilleWorld,
  PlacementEvidence,
  ShipChainPresence,
  ShipDockVisit,
  ShipNode,
  ShipRiskPlacement,
} from "./world-types";

export { SHIP_WATER_ANCHORS, waterZoneForPlacement } from "./risk-water-areas";

export interface PharosVilleInputs {
  generatedAt?: number;
  stablecoins: StablecoinListResponse | null | undefined;
  chains: ChainsResponse | null | undefined;
  stability: StabilityIndexResponse | null | undefined;
  pegSummary: PegSummaryResponse | null | undefined;
  stress: StressSignalsAllResponse | null | undefined;
  reportCards: ReportCardsResponse | null | undefined;
  cemeteryEntries?: readonly CemeteryEntry[];
  freshness: PharosVilleFreshness;
  routeMode?: PharosVilleWorld["routeMode"];
}

function toEpochMs(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value < 10_000_000_000 ? value * 1000 : value;
}

function resolveGeneratedAt(inputs: PharosVilleInputs): number {
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

function activeAssets(stablecoins: StablecoinListResponse | null | undefined): StablecoinData[] {
  return (stablecoins?.peggedAssets ?? []).filter((asset) => (
    RUNTIME_ACTIVE_IDS.has(asset.id) && RUNTIME_ACTIVE_META_BY_ID.has(asset.id) && asset.frozen !== true
  ));
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

function normalizeDockVisitWeights(visits: ShipDockVisit[]): ShipDockVisit[] {
  const totalWeight = visits.reduce((sum, visit) => sum + visit.weight, 0);
  if (totalWeight <= 0) return visits;
  return visits.map((visit) => ({
    ...visit,
    weight: visit.weight / totalWeight,
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

function buildShips(inputs: PharosVilleInputs, docks: readonly DockNode[]): ShipNode[] {
  const pegById = buildPegSummaryCoinMap(inputs.pegSummary?.coins);
  const reportCardById = buildReportCardMap(inputs.reportCards?.cards) ?? {};
  const stressById = inputs.stress?.signals ?? {};
  const renderedDockChainIds = new Set(docks.map((dock) => dock.chainId));

  const assets = activeAssets(inputs.stablecoins);
  const flagshipAsset = assets.find((asset) => asset.id === MAKER_SQUAD_FLAGSHIP_ID);
  const flagshipMeta = flagshipAsset ? RUNTIME_ACTIVE_META_BY_ID.get(flagshipAsset.id) : undefined;
  const flagshipRisk = flagshipAsset && flagshipMeta
    ? resolveShipRiskPlacement({
        asset: flagshipAsset,
        meta: flagshipMeta,
        pegCoin: pegById.get(flagshipAsset.id),
        stress: stressById[flagshipAsset.id],
        freshness: inputs.freshness,
      })
    : null;
  const squadActive = flagshipRisk !== null;

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

    const isConsort = squadActive
      && isMakerSquadMember(asset.id)
      && asset.id !== MAKER_SQUAD_FLAGSHIP_ID;
    const risk = isConsort && flagshipRisk
      ? consortRisk(ownRisk, flagshipRisk, meta.flags.navToken === true)
      : ownRisk;

    const chainPresence = buildShipChainPresence(asset, renderedDockChainIds);
    const dominantChainId = chainPresence[0]?.chainId ?? null;
    const homeDockChainId = chainPresence.find((presence) => presence.hasRenderedDock)?.chainId ?? null;
    const recent = getRecentChange(asset);
    const riskTile = shipTile(asset, risk.placement);
    const riskWaterArea = riskWaterAreaForPlacement(risk.placement);
    const role = squadActive ? makerSquadRole(asset.id) : null;
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
      ...(role ? { squadId: "maker" as const, squadRole: role } : {}),
    };
  });
  return spreadShipRiskAnchorsAcrossWater(ships);
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
    ...(stricter ? { squadOverride: true } : {}),
  };
  return { placement: flagshipRisk.placement, evidence };
}

function dockMooringTile(dock: DockNode, index: number, occupied: ReadonlySet<string>): { x: number; y: number } {
  const outward = dockOutwardVector(dock);
  const fan = { x: -outward.y, y: outward.x };
  const depth = 2 + Math.floor(index / 7);
  const lane = (index % 7) - 3;

  return nearestAvailableWaterTile(clampMapTile({
    x: dock.tile.x + outward.x * depth + fan.x * lane,
    y: dock.tile.y + outward.y * depth + fan.y * lane,
  }), occupied);
}

function dockOutwardVector(dock: DockNode): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  const dx = dock.tile.x - MAX_TILE_X / 2;
  const dy = dock.tile.y - MAX_TILE_Y / 2;
  if (Math.abs(dx) >= Math.abs(dy)) return { x: dx < 0 ? -1 : 1, y: 0 };
  return { x: 0, y: dy < 0 ? -1 : 1 };
}

function assignDockVisits(ships: readonly ShipNode[], docks: readonly DockNode[]): ShipNode[] {
  const dockByChainId = new Map(docks.map((dock) => [dock.chainId, dock]));
  const occupied = new Set<string>();
  const dockedIndex = new Map<string, number>();

  return ships
    .toSorted((a, b) => b.marketCapUsd - a.marketCapUsd || a.id.localeCompare(b.id))
    .map((ship) => {
      // Squad consorts ride the flagship motion route — they don't dock.
      // Strip dockVisits and homeDockChainId so motion-planning sees a clean
      // dockless ship and consort routes inherit flagship route entirely.
      if (ship.squadRole === "consort") {
        return {
          ...ship,
          dockChainId: null,
          dockVisits: [],
          homeDockChainId: null,
          tile: ship.riskTile,
        };
      }

      const visits = ship.chainPresence
        .filter((presence) => presence.hasRenderedDock)
        .flatMap((presence) => {
          const dock = dockByChainId.get(presence.chainId);
          if (!dock) return [];

          const index = dockedIndex.get(dock.chainId) ?? 0;
          dockedIndex.set(dock.chainId, index + 1);
          const mooringTile = dockMooringTile(dock, index, occupied);
          occupied.add(`${mooringTile.x}.${mooringTile.y}`);
          return [{
            chainId: presence.chainId,
            dockId: dock.id,
            weight: Math.max(0.08, presence.share),
            mooringTile,
          }];
        });

      const normalizedVisits = normalizeDockVisitWeights(visits);
      return {
        ...ship,
        dockChainId: ship.homeDockChainId ?? null,
        dockVisits: normalizedVisits,
        tile: ship.riskTile,
      };
    });
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
  // 1) Place flagship and non-squad ships first (so flagship.tile is fixed)
  // 2) Snap consorts to flagship.tile + (placement-aware) formation offset
  // 3) Clamp via nearestRiskPlacementWaterTile — never generic water tiles —
  //    so the consort cannot spill outside the placement's motion zone.
  const consorts = ships.filter((s) => s.squadRole === "consort");
  const others = ships.filter((s) => s.squadRole !== "consort");

  const placedOthers = othersSpread(others, placement, occupied);
  const placedFlagship = placedOthers.find((s) => s.squadRole === "flagship") ?? null;

  const placedConsorts = consorts.map((consort) => {
    if (!placedFlagship) return consort; // squad inactive in this placement
    const offset = makerSquadFormationOffsetForPlacement(
      consort.id as MakerSquadMemberId,
      placement,
    );
    const target = clampMapTile({
      x: placedFlagship.tile.x + offset.dx,
      y: placedFlagship.tile.y + offset.dy,
    });
    // Fallback: when the placement's water set is too tight to host the
    // formation offset within radius 4, collapse onto the flagship's tile.
    // We choose tile overlap over generic-water spill because:
    //   - placement-scoped clamping protects motionZone invariants
    //     (consort.riskZone must match flagship.riskZone via riskWaterAreaForPlacement)
    //   - overlap is a tolerable visual artifact for a degenerate-tight pocket;
    //     spilling into adjacent zones would silently break DEWS-band contracts.
    const placementTile = nearestRiskPlacementWaterTile(target, placement, 4)
      ?? placedFlagship.tile;
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

function buildDetailIndex(world: Omit<PharosVilleWorld, "detailIndex" | "visualCues">): Record<string, DetailModel> {
  const details = [
    detailForLighthouse(world.lighthouse),
    ...world.docks.map(detailForDock),
    ...world.ships.map(detailForShip),
    ...world.areas.map(detailForArea),
    ...world.graves.map(detailForGrave),
  ];
  return Object.fromEntries(details.map((detail) => [detail.id, detail]));
}

export function buildPharosVilleWorld(inputs: PharosVilleInputs): PharosVilleWorld {
  const map = buildPharosVilleMap();
  const lighthouse = buildLighthouse(inputs.stability);
  const docks = buildChainDocks(inputs.chains);
  const areas = buildAreas(inputs.stress);
  const allShips = buildShips(inputs, docks);
  const dockedShips = assignDockVisits(allShips, docks);
  const graves = graveNodesFromEntries(inputs.cemeteryEntries ?? RUNTIME_CEMETERY_ENTRIES);
  const baseWorld = {
    generatedAt: resolveGeneratedAt(inputs),
    routeMode: inputs.routeMode ?? "world",
    freshness: inputs.freshness,
    map,
    lighthouse,
    docks,
    areas,
    ships: dockedShips,
    graves,
    effects: [],
    legends: [
      { id: "legend.psi", label: "Lighthouse", description: "PSI composite status" },
      { id: "legend.docks", label: "Docks", description: "Top chain harbors by stablecoin supply" },
      { id: "legend.ships", label: "Ships", description: "Active stablecoins" },
      { id: "legend.cemetery", label: "Cemetery", description: "Dead and frozen assets" },
    ],
  };
  return {
    ...baseWorld,
    detailIndex: buildDetailIndex(baseWorld),
    visualCues: buildVisualCueRegistry(),
  };
}
