import { describe, expect, it } from "vitest";
import { denseFixtureChains, fixtureChains, makeChain } from "../__fixtures__/pharosville-world";
import type { DockNode } from "./world-types";
import { buildChainDocks } from "./chain-docks";
import {
  EVM_BAY_DOCK_TILES,
  EVM_BAY_STATION_SLOTS,
  isNavigableWaterTile,
  isWaterTileKind,
  MAX_TILE_X,
  MAX_TILE_Y,
  OUTER_HARBOR_DOCK_TILES,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_HARBOR_DOCK_TILE,
  PIGEONNIER_STATION_SLOT,
  PREFERRED_DOCK_TILES,
  tileKindAt,
} from "./world-layout";
import { dockSeawardVector } from "./dock-layout";
import { landWorldTile } from "./map-scale";
import { RIM_OPENINGS, rimDepthAt, rimLandAt } from "./garden-rim";

type StationType = DockNode["station"]["type"];

// The eight authored rim mouths and the archetype each one wears. The place
// owns the architecture; the chain brings its flag — every binding test
// below checks docks against this oracle, not against chain identity.
//
// `AUTHORED_MOUTH_IDS` stays the eight RIM mouths, because that is the set a
// full feed must inhabit. `SLOT_TYPE_BY_COVE` additionally carries the TON
// pigeonnier, which is a berth on its own detached track rather than part of
// the ring: without it, every cove→archetype check would read `undefined` for
// the ninth dock and pass or fail by accident.
const AUTHORED_SLOTS = [...EVM_BAY_STATION_SLOTS, ...OUTER_HARBOR_STATION_SLOTS];
const SLOT_TYPE_BY_COVE: Record<string, StationType> = Object.fromEntries(
  [...AUTHORED_SLOTS, PIGEONNIER_STATION_SLOT].map((slot) => [slot.cove.id, slot.type]),
);
const AUTHORED_MOUTH_IDS = new Set(AUTHORED_SLOTS.map((slot) => slot.cove.id));

// N1: the island (and its dock ring) is authored at design (31,31) in the
// original 56-tile space and offset onto the 112-tile grid.
const CIVIC_CORE_CENTER = landWorldTile({ x: 31, y: 31 });
const CLOSED_RIM_ARC_TOLERANCE_DEGREES = 0.5;

describe("buildChainDocks", () => {
  it("sizes docks from chain totalUsd and keeps concentration separate", () => {
    const docks = buildChainDocks(fixtureChains);

    expect(docks[0]?.chainId).toBe("ethereum");
    expect(docks[0]?.totalUsd).toBe(8_000_000_000);
    expect(docks[0]?.concentration).toBe(0.4);
    expect(docks[0]?.harborRank).toBe(1);
    expect(docks[0]?.harborCount).toBe(2);
    expect(docks[0]?.shareOfGlobal).toBeCloseTo(8 / 11);
    expect(docks[1]?.harborRank).toBe(2);
    expect(docks[0]?.size).toBeGreaterThan(docks[1]?.size ?? 0);
    expect(docks[0]?.size).toBeGreaterThanOrEqual(7);
    expect(docks[1]?.size).toBeGreaterThanOrEqual(6);
  });

  it("anchors rendered stations on cove water with open water seaward and rim land within the 14-tile landward allowance", () => {
    const docks = buildChainDocks(fixtureChains);

    expect(docks.find((dock) => dock.chainId === "ethereum")?.tile).toEqual(PREFERRED_DOCK_TILES.ethereum);
    expect(docks.find((dock) => dock.chainId === "tron")?.tile).toEqual(PREFERRED_DOCK_TILES.tron);
    expect(docks.every((dock) => isWaterTileKind(tileKindAt(dock.tile.x, dock.tile.y)))).toBe(true);
    // Anchoring here is the documented cove predicate — the RIM_COVES doc in
    // garden-rim.ts, enforced by the identical slot loop in
    // world-layout.test.ts — not the stricter legacy assumption that rim land
    // sits immediately one tile landward. Every mouth must still find open
    // water directly seaward (a mouth authored into land ahead fails here)
    // and rim land somewhere along the cardinal-snapped landward vector
    // within the authored 14-tile allowance (a mouth authored in open water
    // with no shore behind it fails here too). The eight shore stations hug
    // the bank and stay pinned to land at exactly one tile landward, so the
    // widened search cannot quietly absorb a drifted shore mouth. The
    // ethereum mole is the one authored exception (plan §5): its off-shore
    // foot stands the superstructure on its own quay without borrowing rim
    // land, leaving the promontory two tiles landward — still firmly inside
    // the allowance, and exempt from the one-tile pin on purpose.
    for (const dock of docks) {
      const seaward = dockSeawardVector(dock);
      expect(
        isWaterTileKind(tileKindAt(dock.tile.x + seaward.x, dock.tile.y + seaward.y)),
        `${dock.station.coveId} water immediately seaward`,
      ).toBe(true);
      expect(
        Array.from({ length: 14 }, (_, index) => index + 1).some((distance) => rimLandAt(
          dock.tile.x - seaward.x * distance,
          dock.tile.y - seaward.y * distance,
        )),
        `${dock.station.coveId} rim land within 14 tiles landward`,
      ).toBe(true);
      if (dock.station.coveId !== "ethereum-mole") {
        expect(
          rimLandAt(dock.tile.x - seaward.x, dock.tile.y - seaward.y),
          `${dock.station.coveId} rim land exactly one tile landward`,
        ).toBe(true);
      }
    }
  });

  it("binds each named chain to its authored berth and inherits the freed mouth for unberthed ranks", () => {
    const docks = buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({ id: "ethereum", name: "Ethereum", totalUsd: 100, logoPath: "/chains/ethereum.png" }),
        makeChain({ id: "tron", name: "Tron", totalUsd: 90 }),
        makeChain({ id: "bsc", name: "BSC", totalUsd: 80 }),
        makeChain({ id: "base", name: "Base", totalUsd: 70, logoPath: "/chains/base.png" }),
        makeChain({ id: "solana", name: "Solana", totalUsd: 60 }),
        makeChain({ id: "arbitrum", name: "Arbitrum", totalUsd: 50 }),
        makeChain({ id: "polygon", name: "Polygon", totalUsd: 40 }),
        makeChain({ id: "aptos", name: "Aptos", totalUsd: 30 }),
        makeChain({ id: "optimism", name: "Optimism", totalUsd: 20 }),
        makeChain({ id: "mantle", name: "Mantle", totalUsd: 10 }),
        makeChain({ id: "ton", name: "TON", totalUsd: 5, logoPath: "/chains/ton.png" }),
      ],
      globalTotalUsd: 555,
    });
    const byChain = new Map(docks.map((dock) => [dock.chainId, dock]));

    // The §4 binding: every named chain holds its explicit preferred berth
    // and that mouth's archetype. There is no precinct any more — the L2s
    // stand on their own arcs (base keeps the west fog-hook, arbitrum the
    // wreck shoal, polygon the south reed bank).
    expect(byChain.get("ethereum")?.tile).toEqual(PREFERRED_DOCK_TILES.ethereum);
    expect(byChain.get("base")?.tile).toEqual(PREFERRED_DOCK_TILES.base);
    expect(byChain.get("arbitrum")?.tile).toEqual(PREFERRED_DOCK_TILES.arbitrum);
    expect(byChain.get("polygon")?.tile).toEqual(PREFERRED_DOCK_TILES.polygon);
    expect(byChain.get("bsc")?.tile).toEqual(PREFERRED_DOCK_TILES.bsc);
    expect(byChain.get("tron")?.tile).toEqual(PREFERRED_DOCK_TILES.tron);
    expect(byChain.get("solana")?.tile).toEqual(PREFERRED_DOCK_TILES.solana);
    expect(byChain.get("ethereum")?.station.type).toBe("ethereum-mole");
    expect(byChain.get("base")?.station.type).toBe("hatago-wharf");
    expect(byChain.get("arbitrum")?.station.type).toBe("storm-mole");
    expect(byChain.get("polygon")?.station.type).toBe("reed-boathouse");
    expect(byChain.get("bsc")?.station.type).toBe("tea-house-quay");
    expect(byChain.get("tron")?.station.type).toBe("stepped-inlet");
    expect(byChain.get("solana")?.station.type).toBe("fishing-pier");
    expect(docks.map((dock) => dock.chainId)).not.toContain("optimism");
    expect(docks.map((dock) => dock.chainId)).not.toContain("mantle");

    // Aptos ranks eighth with no preferred berth, so it inherits the one
    // freed mouth — the east-bay market hall — and wears that place's
    // archetype. Only the flag differs from a named chain's berth.
    expect(byChain.get("aptos")?.station.coveId).toBe("watch-east-bay");
    expect(byChain.get("aptos")?.station.type).toBe("uogashi");

    // The mole is Ethereum's alone: no other rendered dock sits on it.
    expect(docks.filter((dock) => EVM_BAY_DOCK_TILES.some((tile) => (
      tile.x === dock.tile.x && tile.y === dock.tile.y
    ))).map((dock) => dock.chainId)).toEqual(["ethereum"]);
    expect(docks.every((dock) => SLOT_TYPE_BY_COVE[dock.station.coveId] === dock.station.type)).toBe(true);
    expect(new Set(docks.map((dock) => `${dock.tile.x}.${dock.tile.y}`)).size).toBe(docks.length);

    // Global spread: with no precinct left to exempt, no three rendered
    // stations (TON's pigeonnier wharf is the ninth dock in this feed) sit
    // within a 30-tile neighbourhood of one another.
    expectNoStationTrioWithin30(docks);

    expect(docks.every((dock) => rimDepthAt(Math.atan2(
      dock.tile.y - MAX_TILE_Y / 2,
      dock.tile.x - MAX_TILE_X / 2,
    )) > 0)).toBe(true);

    const reachable = floodNavigableWater(nearestIslandWaterTile());
    expect(docks.every((dock) => reachable.has(tileKey(dock.tile)))).toBe(true);
  });

  it("keeps the Ethereum mole out of reach when eight generic chains compete for stations", () => {
    const genericChains = Array.from({ length: 8 }, (_, index) => makeChain({
      id: `generic-${index + 1}`,
      name: `Generic ${index + 1}`,
      totalUsd: 800 - index,
    }));
    const docks = buildChainDocks({
      ...fixtureChains,
      chains: genericChains,
      globalTotalUsd: genericChains.reduce((sum, chain) => sum + chain.totalUsd, 0),
    });

    // The mole sits in the EVM-bay pool alone, so a feed without ethereum
    // fills the seven outer mouths and never the monument: the eighth
    // generic chain simply does not render. Reaching the mole from a
    // non-EVM chain would be a deliberate fallback to author, not an
    // accident to rely on.
    expect(docks).toHaveLength(OUTER_HARBOR_DOCK_TILES.length);
    expect(docks.every((dock) => OUTER_HARBOR_DOCK_TILES.some((tile) => (
      tile.x === dock.tile.x && tile.y === dock.tile.y
    )))).toBe(true);
    expect(docks.every((dock) => !EVM_BAY_DOCK_TILES.some((tile) => (
      tile.x === dock.tile.x && tile.y === dock.tile.y
    )))).toBe(true);
    expect(new Set(docks.map((dock) => dock.station.type)).size).toBe(docks.length);
    expect(docks.map((dock) => dock.station.type)).not.toContain("ethereum-mole");
  });

  it("spreads rendered harbor stations around the whole rim instead of massing them anywhere", () => {
    const docks = buildChainDocks(denseFixtureChains);
    // The dense fixture is the production shape — more than eight eligible
    // chains including ethereum — so every authored mouth binds (the ring is
    // exactly as large as the cap) and the spread below measures the whole
    // ring, not a fill subset.
    expect(docks).toHaveLength(8);
    expect(docks.every((dock) => SLOT_TYPE_BY_COVE[dock.station.coveId] === dock.station.type)).toBe(true);

    // The precinct exemption is retired: no three rendered stations anywhere
    // on the ring sit within a 30-tile neighbourhood of one another.
    expectNoStationTrioWithin30(docks);

    // Far-north budget (the operator's complaint was a ring massed north of
    // the lighthouse): at most two rendered stations at y <= 30. This stays a
    // ceiling, never a floor — a sparse feed may render none.
    expect(docks.filter((dock) => dock.tile.y <= 30).length).toBeLessThanOrEqual(2);

    // Camera-near southern arc (VISUAL_INVARIANTS contract): at least two
    // rendered stations at y >= 112, the foreground the old west-shore
    // cluster left empty.
    expect(docks.filter((dock) => dock.tile.y >= 112).length).toBeGreaterThanOrEqual(2);

    // Both horizontal extremes are inhabited — the west mole and fog-hook,
    // the east gorge and market bay — and all four rim arcs carry a station.
    expect(docks.some((dock) => dock.tile.x <= 30)).toBe(true);
    expect(docks.some((dock) => dock.tile.x >= 110)).toBe(true);
    const arcOf = (tile: { x: number; y: number }) =>
      tile.y <= 30 ? "north" : tile.y >= 112 ? "south" : tile.x >= 110 ? "east" : "west";
    expect(new Set(docks.map((dock) => arcOf(dock.tile)))).toEqual(new Set(["north", "east", "south", "west"]));

    // The slot tables express the same ring for any feed: the fill line (the
    // first four outer slots a non-preferred feed binds) never offers a west
    // mouth, and even the generic worst case that binds every outer cove
    // (plus TON's pigeonnier wharf) respects the north budget and inhabits
    // the south arc and both extremes.
    expect(OUTER_HARBOR_STATION_SLOTS.slice(0, 4).every((slot) => slot.cove.tile.x > 30)).toBe(true);
    const ring = [
      ...EVM_BAY_DOCK_TILES,
      ...OUTER_HARBOR_DOCK_TILES,
      PIGEONNIER_HARBOR_DOCK_TILE,
    ];
    const outerRing = [...OUTER_HARBOR_DOCK_TILES, PIGEONNIER_HARBOR_DOCK_TILE];
    expect(outerRing.filter((tile) => tile.y <= 30).length).toBeLessThanOrEqual(2);
    expect(outerRing.filter((tile) => tile.y >= 112).length).toBeGreaterThanOrEqual(2);
    expect(outerRing.some((tile) => tile.x <= 20)).toBe(true);
    expect(outerRing.some((tile) => tile.x >= 120)).toBe(true);
    expect(new Set(ring.map((tile) => `${tile.x}.${tile.y}`)).size).toBe(ring.length);
  });

  it("keeps the dense ring's closed-rim gap below the redistributed ceiling", () => {
    const docks = buildChainDocks(denseFixtureChains);
    const largestClosedRimArc = largestClosedRimArcDegrees(docks);

    // Provenance: the old clustered ring left 111° empty; this dense fixture
    // measures 48.954° after redistribution. The remaining south-centre `ma`
    // is intentional: predicate rules leave that unnamed open water without
    // a mouth.
    expect(largestClosedRimArc).toBeLessThanOrEqual(49 + CLOSED_RIM_ARC_TOLERANCE_DEGREES);
  });

  it("suppresses Optimism and reserves only the Ethereum mole before lower-ranked outer harbors", () => {
    const docks = buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({ id: "ethereum", totalUsd: 100 }),
        makeChain({ id: "tron", totalUsd: 90 }),
        makeChain({ id: "bsc", totalUsd: 80 }),
        makeChain({ id: "solana", totalUsd: 70 }),
        makeChain({ id: "hyperliquid", totalUsd: 60 }),
        makeChain({ id: "base", totalUsd: 50 }),
        makeChain({ id: "arbitrum", totalUsd: 40 }),
        makeChain({ id: "polygon", totalUsd: 30 }),
        makeChain({ id: "aptos", totalUsd: 20 }),
        makeChain({ id: "avalanche", totalUsd: 19 }),
        makeChain({ id: "xlayer", totalUsd: 18 }),
        makeChain({ id: "mantle", totalUsd: 5 }),
        makeChain({ id: "optimism", totalUsd: 4 }),
      ],
      globalTotalUsd: 586,
    });

    expect(docks).toHaveLength(8);
    expect(docks.map((dock) => dock.chainId)).toEqual([
      "ethereum",
      "tron",
      "bsc",
      "solana",
      "hyperliquid",
      "base",
      "arbitrum",
      "polygon",
    ]);
    expect(docks.map((dock) => dock.chainId)).not.toContain("optimism");
    expect(docks.map((dock) => dock.chainId)).not.toContain("aptos");
    expect(docks.map((dock) => dock.chainId)).not.toContain("avalanche");
    expect(docks.map((dock) => dock.chainId)).not.toContain("xlayer");
    expect(docks.map((dock) => dock.chainId)).not.toContain("mantle");
  });

  it("keeps billion-dollar hubs large even when their global share is modest", () => {
    const docks = buildChainDocks({
      ...fixtureChains,
      globalTotalUsd: 150_000_000_000,
      chains: [
        makeChain({ id: "ethereum", totalUsd: 95_000_000_000 }),
        makeChain({ id: "base", totalUsd: 6_000_000_000 }),
        makeChain({ id: "arbitrum", totalUsd: 2_500_000_000 }),
        makeChain({ id: "small", totalUsd: 20_000_000 }),
      ],
    });

    expect(docks.find((dock) => dock.chainId === "ethereum")?.size).toBe(10);
    expect(docks.find((dock) => dock.chainId === "base")?.size).toBe(7);
    expect(docks.find((dock) => dock.chainId === "arbitrum")?.size).toBe(6);
    expect(docks.find((dock) => dock.chainId === "small")?.size).toBe(1);
  });

  it("suppresses global supply share when the chains feed has no positive global total", () => {
    const docks = buildChainDocks({
      ...fixtureChains,
      globalTotalUsd: 0,
    });

    expect(docks[0]?.shareOfGlobal).toBeNull();
    expect(docks[0]?.harborRank).toBe(1);
  });

  it("does not synthesize a zero-dollar fallback stablecoin row for zero-total chains", () => {
    const docks = buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({
          id: "zero-chain",
          totalUsd: 0,
          dominantStablecoin: { id: "phantom", symbol: "PHAN", share: 1 },
          topStablecoins: [],
        }),
      ],
      globalTotalUsd: 0,
    });

    expect(docks).toHaveLength(1);
    expect(docks[0]?.harboredStablecoins).toEqual([]);
  });

  it("fills the outer mouths in rank order when no EVM chain competes and preserves top stablecoin cargo", () => {
    const chains = Array.from({ length: 12 }, (_, index) => makeChain({
      id: `chain-${index}`,
      totalUsd: 12_000_000_000 - index * 1_000_000_000,
      topStablecoins: [
        { id: `coin-${index}-a`, symbol: `A${index}`, share: 0.6, supplyUsd: 600_000_000 },
        { id: `coin-${index}-b`, symbol: `B${index}`, share: 0.4, supplyUsd: 400_000_000 },
      ],
    }));

    const docks = buildChainDocks({
      ...fixtureChains,
      chains,
      globalTotalUsd: 78_000_000_000,
    });

    // No EVM chain ranks, so the mole stays dark and the generic feed binds
    // the seven outer mouths in supply order; the eighth-ranked chain finds
    // no berth left and does not render.
    expect(docks).toHaveLength(OUTER_HARBOR_DOCK_TILES.length);
    expect(docks.map((dock) => dock.chainId)).toEqual([
      "chain-0",
      "chain-1",
      "chain-2",
      "chain-3",
      "chain-4",
      "chain-5",
      "chain-6",
    ]);
    expect(docks.map((dock) => dock.tile)).toEqual(OUTER_HARBOR_DOCK_TILES);
    expect(docks[0]?.harboredStablecoins.map((coin) => coin.symbol)).toEqual(["A0", "B0"]);
  });

  it("builds the TON pigeonnier wharf as a separate ninth dock attached to the pigeonnier islet", () => {
    const docks = buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({ id: "ethereum", totalUsd: 100 }),
        makeChain({ id: "tron", totalUsd: 90 }),
        makeChain({ id: "bsc", totalUsd: 80 }),
        makeChain({ id: "solana", totalUsd: 70 }),
        makeChain({ id: "base", totalUsd: 60 }),
        makeChain({ id: "arbitrum", totalUsd: 50 }),
        makeChain({ id: "polygon", totalUsd: 40 }),
        makeChain({ id: "aptos", totalUsd: 30 }),
        makeChain({ id: "ton", name: "TON", totalUsd: 5, logoPath: "/chains/ton.png" }),
      ],
      globalTotalUsd: 525,
    });

    expect(docks).toHaveLength(9);
    const ton = docks.find((dock) => dock.chainId === "ton");
    expect(ton).toBeDefined();
    expect(ton?.tile).toEqual(PIGEONNIER_HARBOR_DOCK_TILE);
    expect(isWaterTileKind(tileKindAt(ton!.tile.x, ton!.tile.y))).toBe(true);

    expect(docks.every((dock) => isWaterTileKind(tileKindAt(dock.tile.x, dock.tile.y)))).toBe(true);
    expect(ton?.station.type).toBe("pigeonnier-islet");
  });

  it("omits the TON pigeonnier wharf when the chains feed has no TON entry", () => {
    const docks = buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({ id: "ethereum", totalUsd: 100 }),
        makeChain({ id: "tron", totalUsd: 90 }),
      ],
      globalTotalUsd: 190,
    });

    expect(docks.map((dock) => dock.chainId)).not.toContain("ton");
  });

  it("does not let TON consume one of the eight standard chain harbor slots when chains overflow", () => {
    const docks = buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({ id: "ethereum", totalUsd: 100 }),
        makeChain({ id: "tron", totalUsd: 90 }),
        makeChain({ id: "bsc", totalUsd: 80 }),
        makeChain({ id: "solana", totalUsd: 70 }),
        makeChain({ id: "hyperliquid", totalUsd: 60 }),
        makeChain({ id: "base", totalUsd: 50 }),
        makeChain({ id: "arbitrum", totalUsd: 40 }),
        makeChain({ id: "polygon", totalUsd: 30 }),
        makeChain({ id: "aptos", totalUsd: 20 }),
        makeChain({ id: "ton", name: "TON", totalUsd: 1_000_000_000 }),
      ],
      globalTotalUsd: 540 + 1_000_000_000,
    });

    expect(docks.filter((dock) => dock.chainId !== "ton")).toHaveLength(8);
    expect(docks.find((dock) => dock.chainId === "ton")?.tile).toEqual(PIGEONNIER_HARBOR_DOCK_TILE);
  });

  it("binds all eight rim mouths with their slot archetypes whenever ethereum ranks, whatever else the top eight holds", () => {
    const expectFullRing = (docks: DockNode[]) => {
      expect(docks).toHaveLength(8);
      expect(new Set(docks.map((dock) => dock.station.coveId))).toEqual(AUTHORED_MOUTH_IDS);
      expect(docks.every((dock) => SLOT_TYPE_BY_COVE[dock.station.coveId] === dock.station.type)).toBe(true);
      expectNoStationTrioWithin30(docks);
    };

    // Polygon pushed below aptos: polygon loses its berth, aptos inherits the
    // freed south reed mouth and wears the reed boathouse.
    const polygonDisplaced = buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({ id: "ethereum", totalUsd: 100 }),
        makeChain({ id: "tron", totalUsd: 90 }),
        makeChain({ id: "bsc", totalUsd: 80 }),
        makeChain({ id: "solana", totalUsd: 70 }),
        makeChain({ id: "hyperliquid", totalUsd: 60 }),
        makeChain({ id: "base", totalUsd: 50 }),
        makeChain({ id: "arbitrum", totalUsd: 40 }),
        makeChain({ id: "aptos", totalUsd: 35 }),
        makeChain({ id: "polygon", totalUsd: 30 }),
      ],
      globalTotalUsd: 555,
    });
    expectFullRing(polygonDisplaced);
    expect(polygonDisplaced.map((dock) => dock.chainId)).not.toContain("polygon");
    expect(polygonDisplaced.find((dock) => dock.chainId === "aptos")?.station.coveId).toBe("watch-south-reed");
    expect(polygonDisplaced.find((dock) => dock.chainId === "aptos")?.station.type).toBe("reed-boathouse");

    // Arbitrum pushed below avalanche: avalanche inherits the wreck shoal and
    // wears the storm mole — the geography keeps its building, only the flag
    // changes.
    const arbitrumDisplaced = buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({ id: "ethereum", totalUsd: 100 }),
        makeChain({ id: "tron", totalUsd: 90 }),
        makeChain({ id: "bsc", totalUsd: 80 }),
        makeChain({ id: "solana", totalUsd: 70 }),
        makeChain({ id: "hyperliquid", totalUsd: 60 }),
        makeChain({ id: "base", totalUsd: 50 }),
        makeChain({ id: "polygon", totalUsd: 40 }),
        makeChain({ id: "avalanche", totalUsd: 38 }),
        makeChain({ id: "arbitrum", totalUsd: 35 }),
      ],
      globalTotalUsd: 563,
    });
    expectFullRing(arbitrumDisplaced);
    expect(arbitrumDisplaced.map((dock) => dock.chainId)).not.toContain("arbitrum");
    expect(arbitrumDisplaced.find((dock) => dock.chainId === "avalanche")?.station.coveId).toBe("wreck-shoal-east");
    expect(arbitrumDisplaced.find((dock) => dock.chainId === "avalanche")?.station.type).toBe("storm-mole");

    // A generic chain out-ranking a named one also claims mouths in
    // selection order — here sui ranks above hyperliquid but below every
    // other preferred chain, so when sui's turn comes the market bay is the
    // one open mouth and hyperliquid is pushed out of the eight entirely.
    // Coverage, spread and the archetype-of-place all hold; only which flag
    // flies over each building changes.
    const genericAhead = buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({ id: "ethereum", totalUsd: 100 }),
        makeChain({ id: "tron", totalUsd: 90 }),
        makeChain({ id: "bsc", totalUsd: 80 }),
        makeChain({ id: "solana", totalUsd: 70 }),
        makeChain({ id: "base", totalUsd: 50 }),
        makeChain({ id: "arbitrum", totalUsd: 40 }),
        makeChain({ id: "polygon", totalUsd: 30 }),
        makeChain({ id: "sui", name: "Sui", totalUsd: 25 }),
        makeChain({ id: "hyperliquid", totalUsd: 20 }),
      ],
      globalTotalUsd: 505,
    });
    expectFullRing(genericAhead);
    expect(genericAhead.map((dock) => dock.chainId)).not.toContain("hyperliquid");
    expect(genericAhead.find((dock) => dock.chainId === "sui")?.station.coveId).toBe("watch-east-bay");
    expect(genericAhead.find((dock) => dock.chainId === "sui")?.station.type).toBe("uogashi");
  });

  it("renders only valid assigned mouths on sparse feeds and flies the TON wharf iff TON has supply", () => {
    // A degraded feed is gated only on what is actually true of it: every
    // rendered dock sits on a valid assigned mouth wearing that mouth's
    // archetype, no three stations crowd a 30-tile neighbourhood, and TON
    // renders exactly when its supply is non-zero. Arc coverage and
    // universal fill are NOT asserted — three berths cannot inhabit four
    // arcs by definition.
    const sparseChains = (tonUsd: number) => buildChainDocks({
      ...fixtureChains,
      chains: [
        makeChain({ id: "ethereum", totalUsd: 100 }),
        makeChain({ id: "tron", totalUsd: 90 }),
        makeChain({ id: "bsc", totalUsd: 80 }),
        makeChain({ id: "ton", name: "TON", totalUsd: tonUsd, logoPath: "/chains/ton.png" }),
      ],
      globalTotalUsd: 270 + tonUsd,
    });

    const withoutTon = sparseChains(0);
    expect(withoutTon).toHaveLength(3);
    expect(withoutTon.map((dock) => dock.chainId)).not.toContain("ton");
    expect(withoutTon.every((dock) => SLOT_TYPE_BY_COVE[dock.station.coveId] === dock.station.type)).toBe(true);
    expectNoStationTrioWithin30(withoutTon);

    const withTon = sparseChains(5);
    expect(withTon).toHaveLength(4);
    const ton = withTon.find((dock) => dock.chainId === "ton");
    expect(ton?.tile).toEqual(PIGEONNIER_HARBOR_DOCK_TILE);
    expect(ton?.station.type).toBe("pigeonnier-islet");
    expect(withTon.filter((dock) => dock.chainId !== "ton")
      .every((dock) => SLOT_TYPE_BY_COVE[dock.station.coveId] === dock.station.type)).toBe(true);
    expectNoStationTrioWithin30(withTon);
  });
});

function cardinalDirections(): { x: number; y: number }[] {
  return [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
}

function tileKey(tile: { x: number; y: number }): string {
  return `${tile.x}.${tile.y}`;
}

/** No three rendered stations sit inside one 30-tile neighbourhood: every
 * trio's widest pairwise distance must clear 30 tiles. Global since the
 * 2026-09-04 ring rework retired the precinct exemption. */
function expectNoStationTrioWithin30(docks: DockNode[]): void {
  for (let a = 0; a < docks.length; a += 1) {
    for (let b = a + 1; b < docks.length; b += 1) {
      for (let c = b + 1; c < docks.length; c += 1) {
        const trio = [docks[a]!, docks[b]!, docks[c]!];
        const widest = Math.max(...[
          [trio[0]!, trio[1]!],
          [trio[0]!, trio[2]!],
          [trio[1]!, trio[2]!],
        ].map(([left, right]) => Math.hypot(
          left.tile.x - right.tile.x,
          left.tile.y - right.tile.y,
        )));
        expect(widest, trio.map((dock) => dock.station.coveId).join("/")).toBeGreaterThan(30);
      }
    }
  }
}

function nearestIslandWaterTile(): { x: number; y: number } {
  for (let radius = 1; radius < 24; radius += 1) {
    for (let y = CIVIC_CORE_CENTER.y - radius; y <= CIVIC_CORE_CENTER.y + radius; y += 1) {
      for (let x = CIVIC_CORE_CENTER.x - radius; x <= CIVIC_CORE_CENTER.x + radius; x += 1) {
        if (isNavigableWaterTile({ x, y })) return { x, y };
      }
    }
  }
  throw new Error("Expected navigable water beside the island");
}

function floodNavigableWater(start: { x: number; y: number }): Set<string> {
  const reached = new Set([tileKey(start)]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const direction of cardinalDirections()) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (next.x < 0 || next.y < 0 || next.x > MAX_TILE_X || next.y > MAX_TILE_Y) continue;
      const key = tileKey(next);
      if (reached.has(key) || !isNavigableWaterTile(next)) continue;
      reached.add(key);
      queue.push(next);
    }
  }
  return reached;
}

const TAU = Math.PI * 2;

function largestClosedRimArcDegrees(docks: readonly DockNode[]): number {
  const bearings = docks
    .map((dock) => Math.atan2(
      dock.tile.y - MAX_TILE_Y / 2,
      dock.tile.x - MAX_TILE_X / 2,
    ))
    .map((bearing) => bearing < 0 ? bearing + TAU : bearing)
    .toSorted((left, right) => left - right);
  let largest = 0;

  for (let index = 0; index < bearings.length; index += 1) {
    const start = bearings[index]!;
    const end = index + 1 < bearings.length ? bearings[index + 1]! : bearings[0]! + TAU;
    const gap = end - start;
    const openingSpan = RIM_OPENINGS.reduce((total, opening) => {
      const openingStart = opening.bearingStart < 0
        ? opening.bearingStart + TAU
        : opening.bearingStart;
      const openingEnd = opening.bearingEnd < 0
        ? opening.bearingEnd + TAU
        : opening.bearingEnd;
      return total + [-TAU, 0, TAU].reduce((overlap, offset) => (
        overlap + Math.max(
          0,
          Math.min(end, openingEnd + offset) - Math.max(start, openingStart + offset),
        )
      ), 0);
    }, 0);
    largest = Math.max(largest, Math.max(0, gap - openingSpan));
  }

  return largest * 180 / Math.PI;
}
