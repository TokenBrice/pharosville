import { RUNTIME_ACTIVE_IDS, RUNTIME_ACTIVE_META_BY_ID } from "@shared/lib/stablecoins/runtime-registry";
import { canonicalizeChainCirculating } from "@shared/lib/chain-circulating";
import type { StablecoinData, StablecoinListResponse, StressSignalEntry } from "@shared/types";
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
  RISK_WATER_REGION_TILES as REGION_TILES,
  SHIP_RISK_PLACEMENTS,
  riskWaterAreaForPlacement,
} from "../../risk-water-areas";
import { seaBodyAnchors, seaBodyScatterRadius } from "../../sea-body-anchors";
import type { SeaBodyName } from "../../sea-bodies";
import { resolveShipVisual } from "../../ship-visuals";
import { stableHash, stableOffset, stableUnit } from "../../stable-random";
import { tileKey } from "../../tile-key";
import {
  clampMapTile,
  nearestAvailableWaterTile,
  nearestWaterTile,
} from "../../world-layout";
import type {
  DockNode,
  PlacementEvidence,
  ShipChainPresence,
  ShipDepegHistory,
  ShipDexCrossCheck,
  ShipNode,
  ShipRiskPlacement,
} from "../../world-types";
import type { BuildShipsStage, PharosVilleInputs } from "../pipeline-types";

/**
 * Tier 3 #13 — the peg trim ladder.
 *
 * Deliberately the SAME 50/200 bps steps `risk-placement.ts:deviationPlacement`
 * uses to move a ship out of the calm anchorage, so the hull starts riding
 * off-level at exactly the deviation the world already thinks is worth
 * relocating a ship for. `ship-placement.test.ts` asserts that agreement
 * against `resolveShipRiskPlacement` rather than trusting the comment.
 */
export const SHIP_TRIM_BPS_GATE = 50;
export const SHIP_TRIM_BPS_FULL = 200;

/**
 * One trim step, in ship-local units. The hull's topsides run from the
 * waterline to a gunwale at local y ≈ 0.47, so a step is about a sixth of the
 * freeboard and a full trim about a third — clearly legible on a hull you are
 * looking AT, and well under the ~0.7-unit isometric silhouette threshold at
 * fleet zoom even on the largest titan. That is the intended reading: the
 * direction of a peg break is an inspect-zoom fact, and the fleet-zoom fact is
 * which water the ship is anchored in, which `cue.ship.distance` already draws.
 */
export const SHIP_TRIM_STEP = 0.08;

/**
 * Signed waterline offset for a coin's live peg deviation.
 *
 * Positive bps means trading ABOVE par — demand outrunning redemption — and she
 * rides high; negative means below par, and she sits low and heavy. Stale peg
 * evidence yields an even keel, because `resolveShipRiskPlacement` refuses to
 * move a ship on stale deviation and the hull must not make a claim the berth
 * has already declined to make.
 */
export function shipWaterlineTrim(
  deviationBps: number | null | undefined,
  pegSummaryStale: boolean,
): number {
  if (pegSummaryStale) return 0;
  if (typeof deviationBps !== "number" || !Number.isFinite(deviationBps)) return 0;
  const magnitude = Math.abs(deviationBps);
  if (magnitude < SHIP_TRIM_BPS_GATE) return 0;
  const steps = magnitude >= SHIP_TRIM_BPS_FULL ? 2 : 1;
  return Math.sign(deviationBps) * steps * SHIP_TRIM_STEP;
}

/** Which sea body each risk placement's ships belong in. */
const SEA_BODY_FOR_PLACEMENT: Record<ShipRiskPlacement, SeaBodyName> = {
  "safe-harbor": "calm",
  "breakwater-edge": "watch",
  "harbor-mouth-watch": "alert",
  "outer-rough-water": "warning",
  "storm-shelf": "danger",
  "ledger-mooring": "ledger",
};

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

/**
 * Z3: anchors come from the BODY, not from a table describing one.
 *
 * These used to be ~60 hand-authored design-space tiles per placement. That is
 * a description of one particular partition, and it rots silently the moment
 * the partition changes: an anchor outside its own body fails the eligibility
 * test twelve times over and falls through to `nearestRiskPlacementWaterTile`,
 * which piles the ships onto whichever edge happens to be nearest. The Sea
 * Master reshape would have rotted every one of them at once.
 *
 * `seaBodyAnchors` farthest-point samples the body's real tiles instead, so the
 * fleet follows the coastline wherever it goes.
 */
const ANCHORS_PER_BODY = 14;

function shipPlacementAnchor(asset: StablecoinData, placement: ShipNode["riskPlacement"]): { x: number; y: number } {
  const body = SEA_BODY_FOR_PLACEMENT[placement];
  const anchors = body ? seaBodyAnchors(body, ANCHORS_PER_BODY) : [];
  if (anchors.length === 0) return REGION_TILES[placement];
  return anchors[stableHash(`${asset.id}.${placement}.anchor`) % anchors.length]!;
}

function shipTile(asset: StablecoinData, placement: ShipNode["riskPlacement"]): { x: number; y: number } {
  const base = shipPlacementAnchor(asset, placement);
  const body = SEA_BODY_FOR_PLACEMENT[placement];
  const radius = body ? seaBodyScatterRadius(body, ANCHORS_PER_BODY) : 6;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const angle = stableUnit(`${asset.id}.${placement}.angle.${attempt}`) * Math.PI * 2;
    const distance = 0.25 + Math.sqrt(stableUnit(`${asset.id}.${placement}.distance.${attempt}`)) * 0.75;
    const tile = {
      ...clampMapTile({
        x: Math.round(base.x + Math.cos(angle) * radius * distance + stableOffset(`${asset.id}.risk.x.${attempt}`, 1) * 0.3),
        y: Math.round(base.y + Math.sin(angle) * radius * distance + stableOffset(`${asset.id}.risk.y.${attempt}`, 1) * 0.3),
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
  squad: StablecoinSquad,
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
    reason: `${squad.label} squad member; inherits flagship placement (${flagshipRisk.evidence.reason})`,
    sourceFields,
    stale: flagshipRisk.evidence.stale || (stricter && ownRisk.evidence.stale),
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

// Epoch values in pegSummary arrive in seconds; normalize to ms so renderer
// and detail formatting share one unit. Mirrors `toEpochMs` in world-scaffold.
function depegEventEpochMs(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value < 10_000_000_000 ? value * 1000 : value;
}

/**
 * The second bearing on a coin's price, when one was taken.
 *
 * Everything here is a straight copy of what the pipeline reported, with one
 * rule enforced: a node exists only when a check actually ran. `dexPriceCheck`
 * is both optional and nullable upstream, and collapsing "no check" into a
 * default would make silence read as agreement — the one mistake this signal
 * cannot afford, because silence is the normal state for most of the fleet.
 */
function shipDexCrossCheck(
  pegCoin: { dexPriceCheck?: { dexPrice: number; dexDeviationBps: number; agrees: boolean; sourcePools: number; sourceTvl: number } | null | undefined } | undefined,
  asset: { price: number | null },
  oracleDeviationBps: number | null,
): ShipDexCrossCheck | undefined {
  const check = pegCoin?.dexPriceCheck;
  if (!check) return undefined;
  const dexPrice = finiteOrNull(check.dexPrice);
  const dexDeviationBps = finiteOrNull(check.dexDeviationBps);
  // A reading with no price and no deviation is not a bearing; it is a row the
  // pipeline could not fill, and it stays absent rather than becoming a buoy.
  if (dexPrice === null || dexDeviationBps === null) return undefined;
  return {
    dexPrice,
    dexDeviationBps,
    oraclePrice: finiteOrNull(asset.price),
    oracleDeviationBps: finiteOrNull(oracleDeviationBps),
    agrees: check.agrees === true,
    sourcePools: Math.max(0, Math.trunc(finiteOrNull(check.sourcePools) ?? 0)),
    sourceTvlUsd: Math.max(0, finiteOrNull(check.sourceTvl) ?? 0),
  };
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function shipDepegHistory(
  pegCoin: { eventCount: number; worstDeviationBps: number | null; lastEventAt: number | null } | undefined,
): ShipDepegHistory | null {
  if (!pegCoin || pegCoin.eventCount <= 0) return null;
  return {
    eventCount: pegCoin.eventCount,
    worstDeviationBps: pegCoin.worstDeviationBps ?? null,
    lastEventAt: depegEventEpochMs(pegCoin.lastEventAt),
  };
}

const ELEVATED_STRESS_PLACEMENTS = new Set<ShipRiskPlacement>([
  "harbor-mouth-watch",
  "outer-rough-water",
  "storm-shelf",
]);

const CONTAGION_AMPLIFIER_ACTIVE_MIN = 0.25;

const STRESS_SIGNAL_LABELS: Record<string, string> = {
  depeg: "peg deviation",
  depth: "liquidity depth",
  liquidity: "liquidity stress",
  peg: "peg deviation",
  peg_deviation: "peg deviation",
  price: "price deviation",
  redemption: "redemption stress",
  spread: "spread stress",
  volatility: "price volatility",
};

function stressSignalLabel(key: string): string {
  const label = STRESS_SIGNAL_LABELS[key];
  if (label) return label;
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function shipStressBreakdown(
  stress: StressSignalEntry | undefined,
  placement: ShipRiskPlacement,
): ShipNode["stressBreakdown"] {
  if (!stress || !ELEVATED_STRESS_PLACEMENTS.has(placement)) return null;
  const signals = Object.entries(stress.signals)
    .filter(([, signal]) => signal.available && Number.isFinite(signal.value) && signal.value > 0)
    .sort((left, right) => right[1].value - left[1].value || left[0].localeCompare(right[0]))
    .slice(0, 2)
    .map(([key]) => stressSignalLabel(key))
    .filter((label, index, labels) => label.length > 0 && labels.indexOf(label) === index);
  const contagionActive = (stress.amplifiers?.contagion ?? 0) >= CONTAGION_AMPLIFIER_ACTIVE_MIN;
  return signals.length > 0 || contagionActive ? { signals, contagionActive } : null;
}

function buildShips(inputs: PharosVilleInputs, docks: readonly DockNode[]): ShipNode[] {
  const pegById = buildPegSummaryCoinMap(inputs.pegSummary?.coins);
  const reportCardById = buildReportCardMap(inputs.reportCards?.cards) ?? {};
  const stressById = inputs.stress?.signals ?? {};
  // W7.7 — keep the per-coin rate reading on the ship that motion planning,
  // detail, and the ledger already share. Missing rows remain null so the
  // tempo derivation can choose neutral 1.0 rather than inventing calm.
  const flowIntensityById = new Map(
    (inputs.mintBurn?.coins ?? []).map((coin) => [coin.stablecoinId, coin.flowIntensity] as const),
  );
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
    const pegCoin = pegById.get(asset.id);
    const stress = stressById[asset.id];
    const ownRisk = resolveShipRiskPlacement({
      asset,
      meta,
      pegCoin,
      stress,
      freshness: inputs.freshness,
    });

    // If this asset belongs to an active squad and is a consort, inherit that
    // squad's flagship risk. Otherwise use the per-asset placement.
    const squad = squadForMember(asset.id);
    const flagshipRisk = squad ? flagshipRiskBySquad.get(squad.id) : undefined;
    const isConsort = !!squad && !!flagshipRisk && asset.id !== squad.flagshipId;
    const risk = isConsort && flagshipRisk
      ? consortRisk(ownRisk, flagshipRisk, squad, meta.flags.navToken === true)
      : ownRisk;

    const chainPresence = buildShipChainPresence(asset, renderedDockChainIds);
    const dominantChainId = chainPresence[0]?.chainId ?? null;
    const homeDockChainId = chainPresence.find((presence) => presence.hasRenderedDock)?.chainId ?? null;
    const recent = getRecentChange(asset);
    const riskTile = shipTile(asset, risk.placement);
    const riskWaterArea = riskWaterAreaForPlacement(risk.placement);
    const stressBreakdown = shipStressBreakdown(stress, risk.placement);
    const stamped = squad && flagshipRisk ? stampSquad(asset.id, squad) : null;
    const dexCrossCheck = shipDexCrossCheck(pegCoin, asset, pegCoin?.currentDeviationBps ?? null);
    const shipVisual = resolveShipVisual(asset, meta, reportCard);
    const waterline = shipWaterlineTrim(
      pegCoin?.currentDeviationBps,
      inputs.freshness.pegSummaryStale === true,
    );
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
      ...(stressBreakdown ? { stressBreakdown } : {}),
      visual: { ...shipVisual, hullForm: { ...shipVisual.hullForm, waterline } },
      change24hUsd: recent.change24hUsd,
      change24hPct: recent.change24hPct,
      flowIntensity: flowIntensityById.get(asset.id) ?? null,
      pegDeviationBps: pegCoin?.currentDeviationBps ?? null,
      pegCurrency: pegCoin?.pegCurrency ?? null,
      change7dPct: recent.change7dPct,
      change30dPct: recent.change30dPct,
      depegHistory: shipDepegHistory(pegCoin),
      ...(dexCrossCheck ? { dexCrossCheck } : {}),
      detailId: `ship.${asset.id}`,
      ...(stamped ? { squadId: stamped.squadId, squadRole: stamped.role } : {}),
    };
  });
  return spreadShipRiskAnchorsAcrossWater(ships);
}

// One world build asks for the fleet twice: the scaffold stage needs the
// per-placement counts to size the DEWS areas, then the ship stage needs the
// ships themselves. Both calls pass the same `inputs` and the same `docks`
// array, so a one-entry identity cache collapses them into a single run.
// Without it the whole placement pipeline — spread included — executed twice
// per build.
let lastShipsInputs: PharosVilleInputs | null = null;
let lastShipsDocks: readonly DockNode[] | null = null;
let lastShips: ShipNode[] | null = null;

function buildShipsCached(inputs: PharosVilleInputs, docks: readonly DockNode[]): ShipNode[] {
  if (lastShips && lastShipsInputs === inputs && lastShipsDocks === docks) return lastShips;
  const ships = buildShips(inputs, docks);
  lastShipsInputs = inputs;
  lastShipsDocks = docks;
  lastShips = ships;
  return ships;
}

export function countShipsByRiskPlacement(
  inputs: PharosVilleInputs,
  docks: readonly DockNode[],
): ReadonlyMap<ShipRiskPlacement, number> {
  const counts = new Map<ShipRiskPlacement, number>();
  for (const ship of buildShipsCached(inputs, docks)) {
    counts.set(ship.riskPlacement, (counts.get(ship.riskPlacement) ?? 0) + 1);
  }
  return counts;
}

/**
 * STICKY PLACEMENT — the previous build's risk tiles, keyed by ship id.
 *
 * The tile a ship gets is not a function of that ship alone. The spread below
 * is greedy farthest-point sampling walked in market-cap order, so a coin whose
 * supply ticked by a tenth of a percent reorders the walk and hands DIFFERENT
 * tiles to ships whose own data did not move at all. Measured on the full
 * active catalog, a 0.1% supply wiggle with ZERO placement changes still moved
 * 36 of 205 risk tiles. Each move is a new `pathKey`, so it also re-solves that
 * ship's A* routes — the ~320ms half of the refresh freeze that
 * `world-renderer.ts` measured — and it makes ships teleport on refresh, which
 * an ambient view can least afford.
 *
 * So the build is deterministic given (inputs, previous placements) rather than
 * inputs alone: a ship keeps its tile while its RISK PLACEMENT is unchanged and
 * the tile is still legal water for that placement. Consorts are never held —
 * they snap to their flagship's tile plus a formation offset, so holding the
 * flagship already holds them, and holding them independently would let a
 * formation break apart when its flagship moves.
 */
type HeldRiskTile = { placement: ShipRiskPlacement; tile: { x: number; y: number } };
let heldRiskTiles = new Map<string, HeldRiskTile>();

/** Drops sticky placement so a test starts from a cold build. */
export function resetHeldShipPlacements(): void {
  heldRiskTiles = new Map();
}

/**
 * Below this many held ships the packing measure below is noise, and holding
 * a handful of ships costs nothing to re-pack anyway.
 */
const REPACK_MIN_HELD_SHIPS = 4;

/**
 * Held tiles are a fossil of the population they were packed for. Ships leaving
 * a placement free up water that the survivors never spread into, so over a long
 * session a shrinking placement ends up huddled in a corner of its own sea.
 *
 * The re-pack trigger is therefore a DENSITY check, not a timer: compare the
 * closest pair among the held tiles against the spacing an even fill of that
 * placement's water would give the CURRENT ship count. Measured on the full
 * active catalog, a fresh greedy pack sits at 0.87-1.07 of that ideal and 120
 * simulated refreshes (supply wiggling, ships joining and leaving, placements
 * migrating) never fell below 0.76 — so 0.7 does not fire on a healthy hold,
 * and it does sit just under the worst drift a long session actually produces.
 * A re-pack reproduces exactly what a cold build would produce, so the failure
 * mode of firing too eagerly is a lost hold, never a bad map.
 */
const REPACK_MIN_SPACING_RATIO = 0.7;

function heldTilesForPlacement(
  ships: readonly ShipNode[],
  placement: ShipRiskPlacement,
): Map<string, { x: number; y: number }> {
  const held = new Map<string, { x: number; y: number }>();
  const claimed = new Set<string>();
  for (const ship of ships) {
    if (ship.squadRole === "consort") continue;
    const memory = heldRiskTiles.get(ship.id);
    if (!memory || memory.placement !== placement) continue;
    const key = tileKey(memory.tile);
    if (claimed.has(key)) continue;
    // The sea can be reshaped under a held tile (Sea Master, garden obstacles),
    // and a placement's water set is authored, not stored with the memory.
    if (!isRiskPlacementWaterTile(memory.tile, placement)) continue;
    claimed.add(key);
    held.set(ship.id, memory.tile);
  }
  return heldTilesStillPacked(held, ships, placement) ? held : new Map();
}

function heldTilesStillPacked(
  held: ReadonlyMap<string, { x: number; y: number }>,
  ships: readonly ShipNode[],
  placement: ShipRiskPlacement,
): boolean {
  if (held.size < REPACK_MIN_HELD_SHIPS) return true;
  const spreadShipCount = ships.filter((ship) => ship.squadRole !== "consort").length;
  if (spreadShipCount === 0) return true;
  const idealSpacing = Math.sqrt(riskPlacementWaterTiles(placement).length / spreadShipCount);
  const tiles = [...held.values()];
  let closestPair = Number.POSITIVE_INFINITY;
  for (let i = 0; i < tiles.length; i += 1) {
    for (let j = i + 1; j < tiles.length; j += 1) {
      const dx = tiles[i]!.x - tiles[j]!.x;
      const dy = tiles[i]!.y - tiles[j]!.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < closestPair) closestPair = distance;
    }
  }
  return closestPair >= idealSpacing * REPACK_MIN_SPACING_RATIO;
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

  // Every held berth is claimed before ANY placement spreads, because placements
  // that accept "any-water" overlap each other's tiles: an earlier placement's
  // greedy pass would otherwise take a tile a later placement is still holding.
  const heldByPlacement = new Map<ShipRiskPlacement, Map<string, { x: number; y: number }>>();
  for (const placement of SHIP_RISK_PLACEMENTS) {
    const placementShips = shipsByPlacement.get(placement) ?? [];
    if (placementShips.length === 0) continue;
    const held = heldTilesForPlacement(placementShips, placement);
    heldByPlacement.set(placement, held);
    for (const tile of held.values()) occupied.add(tileKey(tile));
  }

  for (const placement of SHIP_RISK_PLACEMENTS) {
    const placementShips = shipsByPlacement.get(placement) ?? [];
    if (placementShips.length === 0) continue;
    const held = heldByPlacement.get(placement) ?? new Map();

    for (const ship of spreadRiskPlacementShips(placementShips, placement, occupied, held)) {
      updatedShips.set(ship.id, ship);
    }
  }

  const placed = sortedShips.map((ship) => updatedShips.get(ship.id) ?? ship);
  heldRiskTiles = new Map(placed
    .filter((ship) => ship.squadRole !== "consort")
    .map((ship) => [ship.id, { placement: ship.riskPlacement, tile: ship.riskTile }]));
  return placed;
}

function spreadRiskPlacementShips(
  ships: readonly ShipNode[],
  placement: ShipRiskPlacement,
  occupied: Set<string>,
  held: ReadonlyMap<string, { x: number; y: number }>,
): ShipNode[] {
  // 1) Place flagships and non-squad ships first (so each squad's flagship.tile is fixed)
  // 2) For each consort, find its squad's flagship and snap to that flagship's
  //    tile + the squad's placement-aware formation offset.
  // 3) Clamp via nearestRiskPlacementWaterTile - never generic water tiles -
  //    so the consort cannot spill outside the placement's motion zone.
  const consorts = ships.filter((s) => s.squadRole === "consort");
  const others = ships.filter((s) => s.squadRole !== "consort");

  const placedOthers = othersSpread(others, placement, occupied, held);
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
  held: ReadonlyMap<string, { x: number; y: number }>,
): ShipNode[] {
  const candidates = riskPlacementWaterTiles(placement);
  // Distance from each candidate to the NEAREST already-placed ship in this
  // placement, maintained incrementally. Scoring used to recompute that
  // minimum from scratch for every candidate against every placed ship, which
  // is O(candidates x ships^2) — on the live fleet that was ~3.8s of the
  // startup block all by itself (Calm alone runs ~5000 candidates x ~110
  // ships). The same farthest-point-sampling trick `seaBodyAnchors` already
  // uses makes it O(candidates x ships) and leaves every chosen tile
  // unchanged. POSITIVE_INFINITY until the first ship lands, mirroring
  // `minTileDistance` over an empty list.
  const spacingToNearest = new Float64Array(candidates.length).fill(Number.POSITIVE_INFINITY);
  let placedCount = 0;

  const notePlaced = (riskTile: { x: number; y: number }): void => {
    occupied.add(tileKey(riskTile));
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      const dx = candidate.x - riskTile.x;
      const dy = candidate.y - riskTile.y;
      // sqrt of the exact integer sum, not Math.hypot: same value for tile
      // offsets (no overflow to guard against), several times cheaper, and
      // this loop runs once per candidate per ship.
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < spacingToNearest[index]!) spacingToNearest[index] = distance;
    }
    placedCount += 1;
  };

  // Held ships land before anything is scored, so the ships that DO need a new
  // tile spread away from the whole placement rather than only from each other.
  for (const ship of ships) {
    const heldTile = held.get(ship.id);
    if (heldTile) notePlaced(heldTile);
  }

  return ships.map((ship) => {
    const heldTile = held.get(ship.id);
    if (heldTile) return { ...ship, tile: heldTile, riskTile: heldTile };

    const riskTile = spacedRiskPlacementTile({
      candidates,
      hasPlaced: placedCount > 0,
      occupied,
      preferred: ship.riskTile,
      spacingToNearest,
      seed: `${ship.id}.${placement}.risk-spread`,
    }) ?? nearestAvailableWaterTile(ship.riskTile, occupied);

    notePlaced(riskTile);
    return { ...ship, tile: riskTile, riskTile };
  });
}

/** Upper bound on the deterministic tie-breaking jitter below. */
const SPREAD_JITTER_MAX = 0.001;

function spacedRiskPlacementTile(input: {
  candidates: readonly { x: number; y: number }[];
  hasPlaced: boolean;
  occupied: ReadonlySet<string>;
  preferred: { x: number; y: number };
  spacingToNearest: Float64Array;
  seed: string;
}): { x: number; y: number } | null {
  let bestTile: { x: number; y: number } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < input.candidates.length; index += 1) {
    const candidate = input.candidates[index]!;
    if (input.occupied.has(tileKey(candidate))) continue;
    const preferredDx = candidate.x - input.preferred.x;
    const preferredDy = candidate.y - input.preferred.y;
    const preferredDistance = Math.sqrt(preferredDx * preferredDx + preferredDy * preferredDy);
    const base = input.hasPlaced
      ? input.spacingToNearest[index]! * 1000 - preferredDistance * 0.1
      : -preferredDistance;
    // The jitter only ever breaks exact ties, so a candidate that cannot win
    // even at the jitter's upper bound never needs its hash computed. That
    // skips the string build + hash for all but a handful of candidates per
    // ship without changing which tile wins.
    if (base + SPREAD_JITTER_MAX <= bestScore) continue;
    const score = base + stableUnit(`${input.seed}.${candidate.x}.${candidate.y}`) * SPREAD_JITTER_MAX;

    if (score > bestScore) {
      bestScore = score;
      bestTile = candidate;
    }
  }

  return bestTile;
}

export function buildShipsStage(inputs: PharosVilleInputs, docks: readonly DockNode[]): BuildShipsStage {
  return {
    ships: buildShipsCached(inputs, docks),
  };
}
