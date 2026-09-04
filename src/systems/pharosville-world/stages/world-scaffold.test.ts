import { STATUS_COINGECKO_PRICE_DIFF_THRESHOLD_PCT } from "@shared/lib/status-thresholds";
import type { PegSummaryResponse, PegSummaryStats, StabilityIndexResponse } from "@shared/types";
import type { ChainsResponse, ChainSummary } from "@shared/types/chains";
import { Color } from "three";
import { describe, expect, it, vi } from "vitest";
import { psiBandSeverity, SIGNAL_MAST_MAX_PENNANTS } from "../../world-types";
import type { PharosVilleWorld } from "../../world-types";
import {
  buildBeamDwell,
  buildHighWaterMark,
  buildSignalMast,
  SIGNAL_MAST_STORM_CONE_BPS,
} from "./world-scaffold";
import { buildGardenMonthRecord } from "../../garden-month-record";
import { buildPharosVilleWorld } from "../../pharosville-world";
import { RIM_COVES } from "../../garden-rim";
import { assignGardenChainFlagCell, resetGardenChainFlagAtlas } from "../../../three/garden-chain-flag";
import {
  fixtureChains,
  makeAsset,
  makeChain,
  makePharosVilleWorldInput,
} from "../../../__fixtures__/pharosville-world";

function pegSummary(summary: Partial<PegSummaryStats> | null): PegSummaryResponse {
  return {
    coins: [],
    summary: summary === null
      ? null
      : {
          activeDepegCount: 0,
          medianDeviationBps: 2,
          worstCurrent: null,
          coinsAtPeg: 214,
          totalTracked: 214,
          depegEventsToday: 0,
          depegEventsYesterday: 0,
          ...summary,
        },
    methodology: { asOf: 0 } as PegSummaryResponse["methodology"],
  };
}

describe("buildSignalMast (3a)", () => {
  it("takes the storm gate from the shared price-materiality threshold", () => {
    expect(SIGNAL_MAST_STORM_CONE_BPS).toBe(STATUS_COINGECKO_PRICE_DIFF_THRESHOLD_PCT * 100);
  });

  it("flies one pennant per coin off peg", () => {
    const mast = buildSignalMast(pegSummary({ activeDepegCount: 3 }));

    expect(mast.activeDepegCount).toBe(3);
    expect(mast.pennantCount).toBe(3);
    expect(mast.capped).toBe(false);
    expect(mast.unavailable).toBe(false);
  });

  it("caps the hoist and records that it did, so the DOM can carry the count", () => {
    const mast = buildSignalMast(pegSummary({ activeDepegCount: 17 }));

    expect(mast.pennantCount).toBe(SIGNAL_MAST_MAX_PENNANTS);
    expect(mast.capped).toBe(true);
    // The exact figure survives the cap — the mast rounds, the model does not.
    expect(mast.activeDepegCount).toBe(17);
  });

  it("hoists the cone on magnitude, so a coin above par counts as much as one below", () => {
    const below = buildSignalMast(pegSummary({
      activeDepegCount: 1,
      worstCurrent: { id: "x", symbol: "XUSD", bps: -SIGNAL_MAST_STORM_CONE_BPS },
    }));
    const above = buildSignalMast(pegSummary({
      activeDepegCount: 1,
      worstCurrent: { id: "x", symbol: "XUSD", bps: SIGNAL_MAST_STORM_CONE_BPS },
    }));
    const under = buildSignalMast(pegSummary({
      activeDepegCount: 1,
      worstCurrent: { id: "x", symbol: "XUSD", bps: -(SIGNAL_MAST_STORM_CONE_BPS - 1) },
    }));

    expect(below.stormCone).toBe(true);
    expect(above.stormCone).toBe(true);
    expect(under.stormCone).toBe(false);
    expect(under.worstSymbol).toBe("XUSD");
  });

  it("stands bare and says so when no peg summary arrived", () => {
    for (const input of [pegSummary(null), null, undefined]) {
      const mast = buildSignalMast(input);

      expect(mast.unavailable).toBe(true);
      expect(mast.pennantCount).toBe(0);
      expect(mast.stormCone).toBe(false);
      // Absent evidence must not read as a calm fleet.
      expect(mast.coinsAtPeg).toBeNull();
      expect(mast.totalTracked).toBeNull();
    }
  });

  it("drops non-finite figures rather than hoisting nonsense", () => {
    const mast = buildSignalMast(pegSummary({
      activeDepegCount: Number.NaN,
      medianDeviationBps: Number.NaN,
      worstCurrent: { id: "x", symbol: "XUSD", bps: Number.NaN },
    }));

    expect(mast.activeDepegCount).toBe(0);
    expect(mast.pennantCount).toBe(0);
    expect(mast.worstBps).toBeNull();
    expect(mast.medianDeviationBps).toBeNull();
    expect(mast.stormCone).toBe(false);
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 26);

function history(
  points: ReadonlyArray<{ daysAgo: number; band: string; score?: number }>,
): StabilityIndexResponse {
  return {
    current: null,
    history: points.map(({ daysAgo, band, score }) => ({
      date: NOW - daysAgo * DAY_MS,
      score: score ?? 50,
      band,
      methodologyVersion: "test",
    })),
    methodology: { asOf: 0 } as StabilityIndexResponse["methodology"],
  };
}

describe("garden month record (W6.2)", () => {
  it("copies the trailing PSI record onto the lighthouse scaffold", () => {
    const input = makePharosVilleWorldInput();
    input.stability = history([
      { daysAgo: 0, band: "STEADY", score: 90 },
      { daysAgo: 15, band: "STEADY", score: 80 },
      { daysAgo: 40, band: "FRACTURE", score: 10 },
    ]);
    const world = buildPharosVilleWorld(input);
    expect(world.lighthouse.gardenMonthRecord).toEqual(buildGardenMonthRecord(input.stability));
    expect(world.lighthouse.gardenMonthRecord).toMatchObject({ averagePsi: 85, growth: 1, sampleCount: 2 });
  });
});

describe("buildHighWaterMark (3c)", () => {
  it("marks the worst band the window reached, not the latest one", () => {
    // The whole point: a harbour calm today that spent last week in FRACTURE
    // must not look like one that has never been anything else.
    const mark = buildHighWaterMark(history([
      { daysAgo: 0, band: "BEDROCK" },
      { daysAgo: 6, band: "FRACTURE", score: 31 },
      { daysAgo: 12, band: "TREMOR" },
    ]));

    expect(mark.band).toBe("FRACTURE");
    expect(mark.severity).toBe(psiBandSeverity("FRACTURE"));
    expect(mark.score).toBe(31);
    expect(mark.at).toBe(NOW - 6 * DAY_MS);
    expect(mark.sampleCount).toBe(3);
    expect(mark.spanDays).toBe(12);
    expect(mark.unavailable).toBe(false);
  });

  it("measures the window back from the newest reading, not from now", () => {
    // A producer that stopped writing must not have its record silently erased
    // as the payload ages — a high-water mark that forgets is not one.
    const mark = buildHighWaterMark(history([
      { daysAgo: 200, band: "STEADY" },
      { daysAgo: 210, band: "CRISIS" },
      { daysAgo: 260, band: "MELTDOWN" },
    ]));

    expect(mark.band).toBe("CRISIS");
    expect(mark.sampleCount).toBe(2);
  });

  it("drops readings older than the window", () => {
    const mark = buildHighWaterMark(history([
      { daysAgo: 0, band: "STEADY" },
      { daysAgo: 45, band: "MELTDOWN" },
    ]));

    expect(mark.band).toBe("STEADY");
    expect(mark.sampleCount).toBe(1);
    expect(mark.spanDays).toBe(0);
  });

  it("keeps the earlier of two readings that tie", () => {
    // The mark is where the sea FIRST reached; a later touch of the same band
    // did not raise it.
    const mark = buildHighWaterMark(history([
      { daysAgo: 2, band: "CRISIS" },
      { daysAgo: 9, band: "CRISIS" },
    ]));

    expect(mark.at).toBe(NOW - 9 * DAY_MS);
  });

  it("reports BEDROCK as a real record rather than as nothing", () => {
    const mark = buildHighWaterMark(history([
      { daysAgo: 0, band: "BEDROCK" },
      { daysAgo: 20, band: "BEDROCK" },
    ]));

    expect(mark.band).toBe("BEDROCK");
    expect(mark.severity).toBe(0);
    // Nothing is stained, but the evidence exists and the DOM must say so.
    expect(mark.unavailable).toBe(false);
  });

  it("stands unavailable rather than calm when there is no history", () => {
    for (const stability of [null, undefined, history([])]) {
      const mark = buildHighWaterMark(stability);
      expect(mark.unavailable).toBe(true);
      expect(mark.band).toBeNull();
      expect(mark.severity).toBeNull();
      expect(mark.sampleCount).toBe(0);
    }
  });

  it("ignores readings whose band this build does not know", () => {
    // An unrecognized band is not a calm one, and it must not set the mark.
    const mark = buildHighWaterMark(history([
      { daysAgo: 1, band: "SPICY" },
      { daysAgo: 3, band: "TREMOR" },
    ]));

    expect(mark.band).toBe("TREMOR");
    expect(mark.sampleCount).toBe(1);
  });
});

describe("buildBeamDwell (3d)", () => {
  it("points the beam at the head of the contributor list the DOM already shows", () => {
    const dwell = buildBeamDwell([
      { id: "usdx", symbol: "USDX", bps: -412, mcapUsd: 9e8 },
      { id: "eurz", symbol: "EURZ", bps: -900, mcapUsd: 4e6 },
    ]);

    // NOT the largest |bps| — the payload orders by contribution, and the
    // panel's "Top PSI contributors" list already presents that order. A second
    // sort here would be a second, quietly different answer.
    expect(dwell).toEqual({ shipId: "usdx", symbol: "USDX", bps: -412 });
  });

  it("has nothing to point at when the index named no contributor", () => {
    expect(buildBeamDwell(undefined)).toBeUndefined();
    expect(buildBeamDwell([])).toBeUndefined();
  });
});

describe("dock supply change (Tier 3 #13)", () => {
  it("carries each chain's own 24h and 7d held-supply change onto its harbour", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: {
        ...fixtureChains,
        chains: fixtureChains.chains.map((chain) => (
          chain.id === "ethereum"
            ? { ...chain, change24hPct: 2.4, change7dPct: -5 }
            : { ...chain, change24hPct: -1.1, change7dPct: 0.3 }
        )),
      },
    }));

    const ethereum = world.docks.find((dock) => dock.chainId === "ethereum");
    const tron = world.docks.find((dock) => dock.chainId === "tron");
    expect(ethereum?.change24hPct).toBe(2.4);
    expect(ethereum?.change7dPct).toBe(-5);
    // Each harbour reads its OWN chain, not the fleet's or its neighbour's.
    expect(tron?.change24hPct).toBe(-1.1);
    expect(tron?.change7dPct).toBe(0.3);
  });

  it("reports null rather than a bogus figure when the chain's number is not one", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: {
        ...fixtureChains,
        chains: fixtureChains.chains.map((chain) => (
          { ...chain, change24hPct: Number.NaN, change7dPct: Number.NaN }
        )),
      },
    }));

    expect(world.docks).not.toHaveLength(0);
    expect(world.docks.every((dock) => dock.change24hPct === null)).toBe(true);
    expect(world.docks.every((dock) => dock.change7dPct === null)).toBe(true);
  });
});

// --- Chain-id normalization boundary (D8) -----------------------------------
//
// The chains payload is the one door raw upstream chain ids walk through, and
// every downstream consumer keys on `chain.id`: slot binding and suppression
// (`buildChainDocks`), the flag dye (`CHAIN_FLAG_FIELD` in garden-chain-flag),
// ship moorings (`assignDockVisits`) and the mint-burn scope join
// (`buildCargoTideStage`). These tests drive the real `buildPharosVilleWorld`
// with feeds an upstream alias day can actually produce, and assert only what
// the world observes — a berth, a painted colour, a moored ship.

/** `CHAIN_FLAG_FIELD.hyperliquid` — the sanctioned brand dye the flag cloth wears. */
const HYPERLIQUID_FLAG_DYE = "#97fce4";

/** A stand-in health accent, chosen to share no hex with any painted flag colour. */
const FALLBACK_HEALTH_ACCENT = "#4d7fbe";

function chainsFeed(chains: ChainSummary[]): ChainsResponse {
  const globalTotalUsd = chains.reduce((sum, chain) => sum + chain.totalUsd, 0);
  return {
    ...fixtureChains,
    chains,
    globalTotalUsd,
    chainAttributedTotalUsd: globalTotalUsd,
  };
}

/** The aliased feed a DefiLlama day can hand us: hyperliquid arrives as `hyperliquid-l1`. */
function aliasedHyperliquidFeed(): ChainsResponse {
  return chainsFeed([
    makeChain({ id: "ethereum", name: "Ethereum", totalUsd: 8_000_000_000, stablecoinCount: 2 }),
    makeChain({ id: "hyperliquid-l1", name: "Hyperliquid L1", totalUsd: 3_500_000_000 }),
  ]);
}

describe("chain id normalization boundary (D8)", () => {
  it("berths an aliased chain on its canonical mouth in its own station form", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: aliasedHyperliquidFeed(),
    }));

    // Exactly the canonical spelling, on the authored binding: un-normalized,
    // `hyperliquid-l1` has no PREFERRED_DOCK_STATIONS entry and falls through
    // to the first open outer mouth (watch-south-reed, reed-boathouse).
    expect(world.docks.map((dock) => dock.chainId)).toEqual(["ethereum", "hyperliquid"]);
    const hyperliquid = world.docks.find((dock) => dock.chainId === "hyperliquid")!;
    expect(hyperliquid.station.coveId).toBe("watch-east-bay");
    expect(hyperliquid.station.type).toBe("uogashi");
  });

  it("flies the canonical chain's flag dye rather than the shared health accent (L6)", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: aliasedHyperliquidFeed(),
    }));
    const hyperliquid = world.docks.find((dock) => dock.chainId === "hyperliquid")!;

    // Resolve the dye the way the renderer does, through the real flag atlas:
    // a recording 2D context stands in for canvas, so the colours actually
    // painted onto the cloth are the observable. The fallback handed in is the
    // shared health accent — if the join missed, the cloth would wear that.
    const paintedFillStyles: string[] = [];
    let lastFillStyle = "";
    const context = {
      clearRect: () => {},
      fillRect: () => {},
      fillText: () => {},
      restore: () => {},
      save: () => {},
      translate: () => {},
      get fillStyle() { return lastFillStyle; },
      set fillStyle(value: string) {
        lastFillStyle = value;
        paintedFillStyles.push(value);
      },
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal("document", { createElement: () => canvas });
    try {
      resetGardenChainFlagAtlas();
      assignGardenChainFlagCell(hyperliquid, new Color(FALLBACK_HEALTH_ACCENT));
    } finally {
      resetGardenChainFlagAtlas();
      vi.unstubAllGlobals();
    }

    expect(paintedFillStyles).toContain(HYPERLIQUID_FLAG_DYE);
    expect(paintedFillStyles).not.toContain(FALLBACK_HEALTH_ACCENT);
  });

  it("keeps a chain id no alias table knows on a real mouth", () => {
    // The API names ~90 chains while CHAIN_META lists far fewer, and a bare
    // `resolveChainId` returns null for every unlisted one. Dropping them
    // would silently shrink the harbor fill pool, so an unknown id passes
    // through raw and stays eligible for a mouth.
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: chainsFeed([
        makeChain({ id: "ethereum", name: "Ethereum", totalUsd: 8_000_000_000, stablecoinCount: 2 }),
        makeChain({ id: "unknown-harbor-chain", name: "Unknown Harbor Chain", totalUsd: 2_000_000_000 }),
      ]),
    }));

    expect(world.docks.map((dock) => dock.chainId)).toEqual(["ethereum", "unknown-harbor-chain"]);
    const authoredCoveIds = new Set(RIM_COVES.map((cove) => cove.id));
    const unknown = world.docks.find((dock) => dock.chainId === "unknown-harbor-chain")!;
    expect(authoredCoveIds.has(unknown.station.coveId)).toBe(true);
  });

  it("suppresses OP Mainnet after normalizing it, so a hidden chain occupies no mouth (L14)", () => {
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: chainsFeed([
        makeChain({ id: "ethereum", name: "Ethereum", totalUsd: 8_000_000_000, stablecoinCount: 2 }),
        makeChain({ id: "OP Mainnet", name: "OP Mainnet", totalUsd: 5_000_000_000 }),
        makeChain({ id: "tron", name: "TRON", totalUsd: 3_000_000_000 }),
      ]),
    }));

    // Raw, `OP Mainnet` escapes SUPPRESSED_CHAIN_HARBOR_IDS and still consumes
    // one of the eight mouths; normalized it reads `optimism`, which the world
    // deliberately hides. Either spelling occupying a mouth is the defect.
    expect(world.docks.map((dock) => dock.chainId)).toEqual(["ethereum", "tron"]);
  });

  it("collapses both hyperliquid spellings into one dock, deterministically across orderings (D8a)", () => {
    // The canonical entry deliberately carries MORE supply than the alias: a
    // collapse that simply dropped one spelling would leave the survivor to
    // `selectChainHarbors`' insertion order — which its descending sort
    // launders into "smallest figure wins" — and summing would double-count
    // supply that drives dock size, harbor rank and share-of-global. All
    // three failures differ from the canonical entry's own figure.
    const ethereum = makeChain({ id: "ethereum", name: "Ethereum", totalUsd: 8_000_000_000, stablecoinCount: 2 });
    const canonical = makeChain({ id: "hyperliquid", name: "Hyperliquid", totalUsd: 4_100_000_000 });
    const alias = makeChain({ id: "hyperliquid-l1", name: "Hyperliquid L1", totalUsd: 3_500_000_000 });

    const projectDocks = (world: PharosVilleWorld) => world.docks.map((dock) => ({
      chainId: dock.chainId,
      harborRank: dock.harborRank,
      healthBand: dock.healthBand,
      id: dock.id,
      label: dock.label,
      shareOfGlobal: dock.shareOfGlobal,
      size: dock.size,
      station: { ...dock.station },
      tile: { ...dock.tile },
      totalUsd: dock.totalUsd,
    }));

    const canonicalFirst = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: chainsFeed([ethereum, canonical, alias]),
    }));
    const aliasFirst = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: chainsFeed([alias, canonical, ethereum]),
    }));

    // One dock wearing the canonical entry's figures — not two, not the sum,
    // not the smallest spelling, not whichever happened to insert last.
    const hyperliquid = canonicalFirst.docks.filter((dock) => dock.chainId === "hyperliquid");
    expect(hyperliquid).toHaveLength(1);
    expect(hyperliquid[0]!.totalUsd).toBe(4_100_000_000);
    expect(projectDocks(aliasFirst)).toEqual(projectDocks(canonicalFirst));
  });

  it("prefers the canonical spelling over an alias reporting more supply", () => {
    // The survivor rule's first branch: the entry already named by the
    // canonical id wins even when the alias carries the larger figure. A
    // largest-totalUsd rule would pick the alias here and move the harbour's
    // size, rank and share to numbers the canonical entry never reported.
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: chainsFeed([
        makeChain({ id: "ethereum", name: "Ethereum", totalUsd: 8_000_000_000, stablecoinCount: 2 }),
        makeChain({ id: "hyperliquid", name: "Hyperliquid", totalUsd: 3_500_000_000 }),
        makeChain({ id: "hyperliquid-l1", name: "Hyperliquid L1", totalUsd: 4_100_000_000 }),
      ]),
    }));

    const hyperliquid = world.docks.filter((dock) => dock.chainId === "hyperliquid");
    expect(hyperliquid).toHaveLength(1);
    expect(hyperliquid[0]!.totalUsd).toBe(3_500_000_000);
  });

  it("still moors ships at an aliased chain's harbour (L12)", () => {
    // The reproduced defect: `assignDockVisits` joins canonical chain presence
    // against `dock.chainId`, so a raw feed id left the harbour with ZERO ship
    // visits — no ship ever moored there. The generic "a moored ship at every
    // berth" check cannot see this, because under the alias there is no berth
    // to check; this drives the aliased feed directly.
    const world = buildPharosVilleWorld(makePharosVilleWorldInput({
      chains: aliasedHyperliquidFeed(),
      stablecoins: {
        peggedAssets: [
          // The coin's supply is reported under the SAME upstream spelling
          // the chains feed used, so only the scaffold boundary can join them.
          makeAsset({
            id: "usdc-circle",
            symbol: "USDC",
            name: "USD Coin",
            chainCirculating: {
              Ethereum: {
                current: 6_000_000_000,
                circulatingPrevDay: 6_000_000_000,
                circulatingPrevWeek: 6_000_000_000,
                circulatingPrevMonth: 6_000_000_000,
              },
              "hyperliquid-l1": {
                current: 4_000_000_000,
                circulatingPrevDay: 4_000_000_000,
                circulatingPrevWeek: 4_000_000_000,
                circulatingPrevMonth: 4_000_000_000,
              },
            },
          }),
        ],
      },
    }));

    const visits = world.ships
      .flatMap((ship) => ship.dockVisits)
      .filter((visit) => visit.chainId === "hyperliquid");
    expect(visits).toHaveLength(1);
    expect(visits[0]!.dockId).toBe("dock.hyperliquid");
  });
});
