import { describe, expect, it } from "vitest";
import { denseFixtureChains, fixtureChains, makeChain } from "../__fixtures__/pharosville-world";
import { buildChainDocks } from "./chain-docks";
import {
  EVM_BAY_DOCK_TILES,
  isNavigableWaterTile,
  isWaterTileKind,
  MAX_TILE_X,
  MAX_TILE_Y,
  OUTER_HARBOR_DOCK_TILES,
  OUTER_HARBOR_STATION_SLOTS,
  PIGEONNIER_HARBOR_DOCK_TILE,
  PREFERRED_DOCK_TILES,
  tileKindAt,
  terrainKindAt,
} from "./world-layout";
import { dockSeawardVector } from "./dock-layout";
import { landWorldTile } from "./map-scale";
import { RIM_COVES, rimDepthAt, rimLandAt } from "./garden-rim";

// N1: the island (and its dock ring) is authored at design (31,31) in the
// original 56-tile space and offset onto the 112-tile grid.
const CIVIC_CORE_CENTER = landWorldTile({ x: 31, y: 31 });

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

  it("anchors rendered stations on their cove water with moorings facing seaward", () => {
    const docks = buildChainDocks(fixtureChains);

    expect(docks.find((dock) => dock.chainId === "ethereum")?.tile).toEqual(PREFERRED_DOCK_TILES.ethereum);
    expect(docks.find((dock) => dock.chainId === "tron")?.tile).toEqual(PREFERRED_DOCK_TILES.tron);
    expect(docks.every((dock) => isWaterTileKind(tileKindAt(dock.tile.x, dock.tile.y)))).toBe(true);
    expect(docks.every((dock) => {
      const seaward = dockSeawardVector(dock);
      return isWaterTileKind(tileKindAt(dock.tile.x + seaward.x, dock.tile.y + seaward.y))
        && rimLandAt(dock.tile.x - seaward.x, dock.tile.y - seaward.y);
    })).toBe(true);
  });

  it("forms one connected Ethereum precinct and keeps every station in connected cove water", () => {
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
        makeChain({ id: "ton", name: "TON", totalUsd: 5 }),
      ],
      globalTotalUsd: 555,
    });
    const byChain = new Map(docks.map((dock) => [dock.chainId, dock]));

    expect(byChain.get("ethereum")?.tile).toEqual(PREFERRED_DOCK_TILES.ethereum);
    expect(byChain.get("base")?.tile).toEqual(PREFERRED_DOCK_TILES.base);
    expect(byChain.get("arbitrum")?.tile).toEqual(PREFERRED_DOCK_TILES.arbitrum);
    expect(byChain.get("polygon")?.tile).toEqual(PREFERRED_DOCK_TILES.polygon);
    expect(docks.map((dock) => dock.chainId)).not.toContain("optimism");
    expect(byChain.get("bsc")?.tile).toEqual(PREFERRED_DOCK_TILES.bsc);
    expect(byChain.get("tron")?.tile).toEqual(PREFERRED_DOCK_TILES.tron);
    expect(byChain.get("solana")?.tile).toEqual(PREFERRED_DOCK_TILES.solana);
    expect(byChain.get("aptos")?.tile).toEqual(PREFERRED_DOCK_TILES.aptos);
    expect(docks.map((dock) => dock.chainId)).not.toContain("mantle");

    for (const chainId of ["ethereum", "base", "arbitrum", "polygon"]) {
      expect(EVM_BAY_DOCK_TILES).toContainEqual(byChain.get(chainId)?.tile);
    }
    for (const chainId of ["bsc", "tron", "solana", "aptos"]) {
      expect(EVM_BAY_DOCK_TILES).not.toContainEqual(byChain.get(chainId)?.tile);
      expect(OUTER_HARBOR_DOCK_TILES).toContainEqual(byChain.get(chainId)?.tile);
    }
    expect(new Set(docks.map((dock) => `${dock.tile.x}.${dock.tile.y}`)).size).toBe(docks.length);

    const precinct = ["ethereum", "arbitrum", "base", "polygon"].map((chainId) => byChain.get(chainId)!);
    expect(precinct[0]!.station.type).toBe("boathouse-precinct");
    expect(precinct.slice(1).every((dock) => dock.station.type === "annex-pavilion")).toBe(true);
    expect(Math.max(...precinct.map((dock) => dock.tile.y)) - Math.min(...precinct.map((dock) => dock.tile.y)))
      .toBeLessThanOrEqual(24);
    // Round three: the precinct reads as a stretch of coast, not a stack —
    // three distinct shore columns with pairwise-unequal mouth intervals.
    expect(new Set(precinct.map((dock) => dock.tile.x)).size).toBeGreaterThanOrEqual(3);
    const shoreY = precinct.map((dock) => dock.tile.y).toSorted((a, b) => a - b);
    const intervals = shoreY.slice(1).map((y, index) => y - shoreY[index]!);
    expect(new Set(intervals).size).toBe(intervals.length);

    const coveById = new Map(RIM_COVES.map((entry) => [entry.id, entry]));
    const alongShore = precinct.toSorted((left, right) => left.tile.y - right.tile.y);
    for (let index = 1; index < alongShore.length; index += 1) {
      const previous = coveById.get(alongShore[index - 1]!.station.coveId)!;
      const current = coveById.get(alongShore[index]!.station.coveId)!;
      const rimGap = current.tile.y - previous.tile.y - previous.width / 2 - current.width / 2;
      expect(rimGap).toBeGreaterThanOrEqual(1);
    }

    const outerTypes = docks
      .filter((dock) => !["ethereum", "arbitrum", "base", "polygon"].includes(dock.chainId))
      .map((dock) => dock.station.type);
    expect(new Set(outerTypes).size).toBe(outerTypes.length);
    expect(docks.every((dock) => rimDepthAt(Math.atan2(
      dock.tile.y - MAX_TILE_Y / 2,
      dock.tile.x - MAX_TILE_X / 2,
    )) > 0)).toBe(true);

    const reachable = floodNavigableWater(nearestIslandWaterTile());
    expect(docks.every((dock) => reachable.has(tileKey(dock.tile)))).toBe(true);
  });

  it("reserves every precinct form when eight generic chains compete for outer stations", () => {
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

    expect(docks).toHaveLength(OUTER_HARBOR_DOCK_TILES.length);
    expect(docks.every((dock) => OUTER_HARBOR_DOCK_TILES.some((tile) => (
      tile.x === dock.tile.x && tile.y === dock.tile.y
    )))).toBe(true);
    expect(docks.every((dock) => !EVM_BAY_DOCK_TILES.some((tile) => (
      tile.x === dock.tile.x && tile.y === dock.tile.y
    )))).toBe(true);
    expect(new Set(docks.map((dock) => dock.station.type)).size).toBe(docks.length);
    expect(docks.map((dock) => dock.station.type)).not.toContain("boathouse-precinct");
    expect(docks.map((dock) => dock.station.type)).not.toContain("annex-pavilion");
  });

  it("spreads rendered harbor stations around the rim instead of massing them north", () => {
    const docks = buildChainDocks(denseFixtureChains);
    // The dense fixture is the normal-feed shape: the four Ethereum-family
    // chains take the precinct, the next four by supply take outer slots.
    expect(docks).toHaveLength(8);

    const precinct = docks.filter((dock) => dock.station.type === "boathouse-precinct"
      || dock.station.type === "annex-pavilion");
    const outer = docks.filter((dock) => !precinct.includes(dock));

    // (a) The west shore belongs to the precinct alone: exactly its four
    // mouths render at x <= 30. Round two still moored Tron's gate-landing
    // on the western ledger shore, stacking a fifth station directly behind
    // the annexes — the remaining west-side mass the operator flagged.
    expect(precinct).toHaveLength(4);
    expect(precinct.every((dock) => dock.tile.x <= 30)).toBe(true);
    expect(outer.every((dock) => dock.tile.x > 30)).toBe(true);

    // Camera-near southern arc (VISUAL_INVARIANTS contract, restored round
    // three): at least two rendered stations at y >= 112, one of them the
    // south-rim reed boathouse — the two southern mouths are 67 tiles apart,
    // so the pair reads as two harbours, not a cluster.
    expect(docks.filter((dock) => dock.tile.y >= 112).length).toBeGreaterThanOrEqual(2);
    expect(docks.some((dock) => dock.station.coveId === "watch-south-reed")).toBe(true);

    // (b) At least two outer stations are camera-near (south rim or east
    // shore): the dense feed puts its outer quartet on the east shore, the
    // north warning shelf and the south rim.
    expect(outer.filter((dock) => dock.tile.y >= 112 || dock.tile.x >= 120).length).toBeGreaterThanOrEqual(2);

    // (c) The four outer mouths span at least three distinct rim arcs.
    const arcOf = (tile: { x: number; y: number }) =>
      tile.y <= 30 ? "north" : tile.y >= 112 ? "south" : tile.x >= 120 ? "east" : "inland";
    expect(new Set(outer.map((dock) => arcOf(dock.tile))).size).toBeGreaterThanOrEqual(3);


    // (d) Far-north budget: at most two rendered stations above y = 30 (the
    // operator's complaint was a ring massed north of the lighthouse).
    expect(docks.filter((dock) => dock.tile.y <= 30).length).toBeLessThanOrEqual(2);

    // Outside the precinct, no three rendered stations sit within a 30-tile
    // radius of one another (no pairwise-triple entirely inside 30 tiles).
    const spread = outer;
    for (let a = 0; a < spread.length; a += 1) {
      for (let b = a + 1; b < spread.length; b += 1) {
        for (let c = b + 1; c < spread.length; c += 1) {
          const trio = [spread[a]!, spread[b]!, spread[c]!];
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

    // (e) The precinct stays one connected calm-water group spread along its
    // shore: mutually within 24 tiles, three distinct columns with unequal
    // mouth intervals, every annex inside authorPrecinctBridge's 1..20.5 gate.
    for (const dock of precinct) {
      expect(terrainKindAt(dock.tile.x, dock.tile.y), dock.station.coveId).toBe("calm-water");
      for (const other of precinct) {
        expect(Math.hypot(dock.tile.x - other.tile.x, dock.tile.y - other.tile.y)).toBeLessThanOrEqual(24);
      }
    }
    const boathouse = precinct.find((dock) => dock.station.type === "boathouse-precinct")!;
    for (const annex of precinct.filter((dock) => dock !== boathouse)) {
      const bridgeSpan = Math.hypot(annex.tile.x - boathouse.tile.x, annex.tile.y - boathouse.tile.y);
      expect(bridgeSpan, annex.station.coveId).toBeGreaterThanOrEqual(6);
      expect(bridgeSpan, annex.station.coveId).toBeLessThanOrEqual(20.5);
    }
    expect(new Set(precinct.map((dock) => dock.tile.x)).size).toBeGreaterThanOrEqual(3);
    const shoreY = precinct.map((dock) => dock.tile.y).toSorted((a, b) => a - b);
    const intervals = shoreY.slice(1).map((y, index) => y - shoreY[index]!);
    expect(new Set(intervals).size).toBe(intervals.length);


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

  it("suppresses Optimism while reserving key Ethereum L2 extension slips before lower-ranked outer harbors", () => {
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

  it("emits only the top eight chain harbors and preserves top stablecoin cargo", () => {
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

    expect(docks).toHaveLength(8);
    expect(docks.map((dock) => dock.chainId)).toEqual([
      "chain-0",
      "chain-1",
      "chain-2",
      "chain-3",
      "chain-4",
      "chain-5",
      "chain-6",
      "chain-7",
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
