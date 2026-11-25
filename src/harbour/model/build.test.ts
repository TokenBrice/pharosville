import { describe, expect, it } from "vitest";
import LISTING_POLICY from "virtual:pharosville-listing-policy";
import { makeCoins, makePayloads, PIERED, T0_MS } from "../sim/test-fixtures";
import { buildHarbourModel, quantizeShares } from "./build";
import { hullClassFor, rigFor } from "./classify";
import { isCoreBoat, isTokenizedFund, type CoinRow, type HarbourPayloads } from "./types";

const opts = { pieredChains: PIERED, dead: [] };

describe("buildHarbourModel", () => {
  it.each([-1, Infinity, NaN, 9e15])("omits an unrepresentable PSI computation time (%s)", (computedAt) => {
    const payloads = makePayloads();
    payloads.stability!.data!.current!.computedAt = computedAt;
    expect(buildHarbourModel(payloads, T0_MS, opts).readings.psi.computedAt).toBeNull();
  });

  it("makes one boat per payload coin, eligibility from the payload alone", () => {
    const m = buildHarbourModel(makePayloads(), T0_MS, opts);
    expect(m.payloadCount).toBe(625);
    expect(m.boats.length).toBe(625);
    expect(new Set(m.boats.map((b) => b.id)).size).toBe(625);
    const unknown = buildHarbourModel(makePayloads({ coins: [{ id: "never-heard-of-it", name: "X", symbol: "X", pegType: "peggedUSD", circulating: { peggedUSD: 5e6 }, chainCirculating: { Ethereum: { current: 5e6 } }, chains: ["Ethereum"] }] }), T0_MS, opts);
    expect(unknown.boats.map((b) => b.id)).toEqual(["never-heard-of-it"]);
    expect(unknown.boats[0].brandColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(unknown.boats[0].logo).toBeNull();
  });

  it("is pure and deterministic", () => {
    const p = makePayloads();
    const a = buildHarbourModel(p, T0_MS, opts), b = buildHarbourModel(p, T0_MS, opts);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(b.planKey).toBe(a.planKey);
    // payload order does not matter
    const shuffled = makePayloads({ coins: [...makeCoins()].reverse() });
    expect(buildHarbourModel(shuffled, T0_MS, opts).planKey).toBe(a.planKey);
  });

  it("classes hulls by supply decade and rigs by peg", () => {
    expect([1e11, 2e9, 3e8, 4e7, 5e6, 6e5].map(hullClassFor)).toEqual(["flagship", "large", "medium", "small", "boat", "skiff"]);
    expect(["peggedUSD", "peggedEUR", "peggedGOLD", "peggedSILVER", "peggedVAR", "peggedJPY"].map(rigFor)).toEqual(["usd", "eur", "gold", "gold", "other", "fiat"]);
  });

  it("builds circuits: ≤ 4 piered stops + Far Ports, dock shares quantized and summing to 1", () => {
    const m = buildHarbourModel(makePayloads(), T0_MS, opts);
    for (const b of m.boats) {
      expect(b.circuit.filter((s) => s.chain !== null).length).toBeLessThanOrEqual(4);
      expect(b.circuit.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 9);
      for (const s of b.circuit) {
        expect(Math.abs(s.share * 20 - Math.round(s.share * 20))).toBeLessThan(1e-9);
        if (s.chain) expect(PIERED).toContain(s.chain);
      }
      expect(b.state === "moored").toBe(b.circuit.length === 1 && !b.activeDepeg);
    }
    expect(m.boats.filter((b) => b.state === "circuit").length).toBeGreaterThan(80);
    expect(quantizeShares([0.62, 0.38])).toEqual([0.6, 0.4]);
    expect(quantizeShares([0.97, 0.03]).every((v) => v >= 0.05)).toBe(true);
  });

  it("small supply drift keeps the plan key; a portfolio change moves it", () => {
    const coins = makeCoins();
    const base = buildHarbourModel(makePayloads({ coins }), T0_MS, opts);
    const drift = coins.map((c) => ({ ...c, chainCirculating: Object.fromEntries(Object.entries(c.chainCirculating).map(([k, v]) => [k, { current: (v.current ?? 0) * 1.001 }])) }));
    expect(buildHarbourModel(makePayloads({ coins: drift }), T0_MS, opts).planKey).toBe(base.planKey);
    const moved = coins.map((c, i) => (i === 5 ? { ...c, chainCirculating: { Solana: { current: 1e10 } }, chains: ["Solana"] } : c));
    expect(buildHarbourModel(makePayloads({ coins: moved }), T0_MS, opts).planKey).not.toBe(base.planKey);
  });

  it("depegs go to the Shoals (and do not move the plan key)", () => {
    const quiet = buildHarbourModel(makePayloads(), T0_MS, opts);
    const m = buildHarbourModel(makePayloads({ depegIds: ["coin-small-3", "coin-large-1"] }), T0_MS, opts);
    expect(m.boats.find((b) => b.id === "coin-small-3")!.state).toBe("shoals");
    expect(m.readings.shoals.map((s) => s.id).sort()).toEqual(["coin-large-1", "coin-small-3"]);
    expect(m.planKey).toBe(quiet.planKey);
    expect(m.readings.seaState.offPegShare).toBeGreaterThan(0);
  });

  it("unknown is never calm: null PSI → unlit, missing peg/stress → null readings", () => {
    const noPsi = buildHarbourModel(makePayloads({ psi: null }), T0_MS, opts);
    expect(noPsi.readings.psi.lit).toBe(false);
    expect(noPsi.readings.psi.sweepSec).toBeNull();
    expect(noPsi.readings.psi.lamp).toBeNull();
    const oddBand = buildHarbourModel(makePayloads({ psi: { score: 90, band: "WHATEVER" } }), T0_MS, opts);
    expect(oddBand.readings.psi.lit).toBe(false);
    const lit = buildHarbourModel(makePayloads(), T0_MS, opts);
    expect(lit.readings.psi).toMatchObject({ lit: true, band: "BEDROCK", sweepSec: 12, lamp: "white" });

    const p = makePayloads();
    const partial: HarbourPayloads = { stablecoins: p.stablecoins!, chains: p.chains! };
    const m = buildHarbourModel(partial, T0_MS, opts);
    expect(m.readings.psi.lit).toBe(false);
    expect(m.readings.seaState.step).toBeNull();
    expect(m.readings.weather.level).toBeNull();
    expect(m.readings.stormCones).toBeNull();
    expect(m.readings.flows.available).toBe(false);
    expect(m.truth.stability.state).toBe("unavailable");
    expect(m.boats.every((b) => b.nullPeg && b.dews === null && !b.activeDepeg)).toBe(true);
    // a null deviation is an unlit stern lamp even when the peg feed is up
    expect(lit.boats.some((b) => b.nullPeg)).toBe(true);
  });

  it("no data → no fleet (AWAITING DATA), never a fixture fleet", () => {
    const m = buildHarbourModel({}, T0_MS, opts);
    expect(m.hasFleet).toBe(false);
    expect(m.boats).toEqual([]);
    expect(Object.values(m.truth).every((t) => t.state === "unavailable")).toBe(true);
  });

  it("freshness: payloads age into stale after the fetch, per endpoint", () => {
    const p = makePayloads();
    expect(buildHarbourModel(p, T0_MS, opts).truth.stablecoins.state).toBe("current");
    // 600 s budget × 12 → stale ~2 h after the producer write, even with no new fetch
    expect(buildHarbourModel(p, T0_MS + 3 * 3600_000, opts).truth.stablecoins.state).toBe("stale");
    expect(buildHarbourModel(makePayloads({ stale: true }), T0_MS, opts).truth.stablecoins.state).toBe("stale");
  });

  it("readings: weather by supply-weighted DEWS, cones per ALERT+, 24 hourly flow bars with gaps", () => {
    const m = buildHarbourModel(makePayloads(), T0_MS, opts);
    expect(m.readings.stormCones).toEqual({ count: 4, shown: 4, extra: 0 });
    expect(m.readings.weather.level).toBeGreaterThan(0);
    expect(m.readings.weather.coverage).toBeGreaterThan(0);
    expect(m.readings.weather.coverage).toBeLessThan(1);
    expect(m.readings.flows.hourly).toHaveLength(24);
    expect(m.readings.flows.hourly[5].netUsd).toBeNull();
    expect(m.readings.flows.net24hUsd).toBeNull(); // a partial hour makes the 24 h net unknown, not 0
    expect(m.readings.flows.scope).toEqual(["ethereum", "base", "arbitrum"]);
    expect(m.readings.seaState.step).toBe(0);
  });

  it("harbours reconcile with the boats' chain supply", () => {
    const m = buildHarbourModel(makePayloads(), T0_MS, opts);
    const fromBoats = m.boats.reduce((a, b) => a + b.chainShares.reduce((x, s) => x + s.usd, 0), 0);
    const fromHarbours = m.harbours.reduce((a, h) => a + h.supplyUsd, 0);
    expect(fromHarbours).toBeCloseTo(fromBoats, -2);
    expect(m.harbours.reduce((a, h) => a + h.share, 0)).toBeCloseTo(1, 9);
    expect(m.harbours.filter((h) => h.piered).map((h) => h.chain).sort()).toEqual([...PIERED].sort());
  });

  it("wrecks come from the dead-coin list; a payload coin on it is wrecked", () => {
    const dead = [{ id: "coin-boat-1", name: "Gone", symbol: "GONE", pegCurrency: "USD" as const, causeOfDeath: "abandoned" as const, deathDate: "2024-01-01", obituary: "x", sourceUrl: "x", sourceLabel: "x" }];
    const m = buildHarbourModel(makePayloads(), T0_MS, { pieredChains: PIERED, dead });
    expect(m.readings.wrecks.map((w) => w.id)).toEqual(["coin-boat-1"]);
    expect(m.boats.find((b) => b.id === "coin-boat-1")!.state).toBe("wrecked");
    expect(buildHarbourModel(makePayloads(), T0_MS, { pieredChains: PIERED }).readings.wrecks.length).toBeGreaterThan(50);
  });
});

describe("verified source freshness", () => {
  it("never dates unverified evidence from receipt time", () => {
    const p = makePayloads();
    p.stablecoins = { ...p.stablecoins!, meta: null, fetchedAtMs: T0_MS - 3600_000 };
    const truth = buildHarbourModel(p, T0_MS, opts).truth.stablecoins;
    expect(truth).toMatchObject({ state: "unknown", ageSec: null, sourceUpdatedAtMs: null, receivedAtMs: T0_MS - 3600_000, reason: "unverified-source" });
  });
  it("keeps a young fallback stale and an ordinary dated degraded input current", () => {
    const p = makePayloads();
    p.stablecoins = { ...p.stablecoins!, staleFallback: true };
    p.stability = { ...p.stability!, meta: { ...p.stability!.meta!, status: "degraded" } };
    const model = buildHarbourModel(p, T0_MS, opts);
    expect(model.truth.stablecoins.state).toBe("stale");
    expect(model.truth.stability.state).toBe("current");
  });
  it("preserves the twelve-times source tolerance boundary and rejects invalid ages", () => {
    const p = makePayloads();
    const tolerance = 600 * 12;
    p.stablecoins = { ...p.stablecoins!, meta: { updatedAt: T0_MS / 1000 - tolerance, ageSeconds: tolerance, status: "degraded" } };
    expect(buildHarbourModel(p, T0_MS, opts).truth.stablecoins.state).toBe("current");
    expect(buildHarbourModel(p, T0_MS + 1000, opts).truth.stablecoins.state).toBe("stale");
    for (const ageSeconds of [-1, NaN, Infinity]) {
      p.stablecoins = { ...p.stablecoins, meta: { updatedAt: T0_MS / 1000, ageSeconds, status: "fresh" } };
      expect(buildHarbourModel(p, T0_MS, opts).truth.stablecoins).toMatchObject({ state: "unknown", ageSec: null });
    }
  });
});

describe("Policy 2.0 classification and strict core-aggregate separation", () => {
  const mkRow = (id: string, supply: number, extra: Partial<CoinRow> = {}, omitHistory = false): CoinRow => {
    const pegType = extra.pegType ?? "peggedUSD";
    return {
      id,
      name: extra.name ?? id,
      symbol: extra.symbol ?? id.toUpperCase(),
      pegType,
      circulating: { [pegType]: supply },
      chainCirculating: extra.chainCirculating ?? { Ethereum: { current: supply } },
      chains: extra.chains ?? ["Ethereum"],
      ...(omitHistory ? {} : {
        circulatingPrevWeek: extra.circulatingPrevWeek ?? { [pegType]: supply },
        circulatingPrevMonth: extra.circulatingPrevMonth ?? { [pegType]: supply },
      }),
      ...extra,
    };
  };

  it("filters frozen, excluded, untracked numeric, variant, and review-hold rows while recording variant/review-hold metadata", () => {
    const core = mkRow("usde-ethena", 5e9, { symbol: "USDe", name: "Ethena USDe" });
    const core2 = mkRow("bold-liquity", 2e8, { symbol: "BOLD", name: "Liquity BOLD" });
    const frozenByFlag = mkRow("custom-frozen-coin", 3e8, { frozen: true });
    const frozenByPolicy = mkRow(LISTING_POLICY.frozenIds[0], 4e8);
    const excludedByPolicy = mkRow(LISTING_POLICY.excludedIds[0], 6e8);
    const untrackedNumeric = mkRow("436", 1e8, { symbol: "EURR", name: "Revolut Euro" });
    const variant1 = mkRow("susde-ethena", 2.5e9, { symbol: "sUSDe", name: "Ethena Staked USDe" });
    const variant2 = mkRow("ybold-yearn", 5e7, { symbol: "yBOLD", name: "Yearn BOLD" });
    const variant3 = mkRow("sbold-k3-capital", 8e7, { symbol: "sBOLD", name: "sBOLD by K3 Capital" });
    const holdId = LISTING_POLICY.reviewHoldIds[0];
    const holdRow = mkRow(holdId, 9e7, { symbol: "rcUSD", name: "R25 rcUSD" });

    const p = makePayloads({
      coins: [core, core2, frozenByFlag, frozenByPolicy, excludedByPolicy, untrackedNumeric, variant1, variant2, variant3, holdRow],
    });
    const m = buildHarbourModel(p, T0_MS, opts);

    expect(m.boats.map((b) => b.id)).toEqual(["usde-ethena", "bold-liquity"]);
    expect(m.payloadCount).toBe(2);
    expect(m.coreCount).toBe(2);
    expect(m.reserveCount).toBe(0);
    expect(m.reserveSupplyTotal).toBe(0);
    expect(m.excludedCount).toBe(8);
    expect(m.supplyTotal).toBe(5.2e9);
    expect(m.harbours.find((h) => h.chain === "Ethereum")!.supplyUsd).toBe(5.2e9);

    expect(m.variantsByParent).toEqual({
      "bold-liquity": [
        { id: "sbold-k3-capital", symbol: "sBOLD", name: "sBOLD by K3 Capital", kind: "risk-absorption", supply: 8e7 },
        { id: "ybold-yearn", symbol: "yBOLD", name: "Yearn BOLD", kind: "strategy-vault", supply: 5e7 },
      ],
      "usde-ethena": [
        { id: "susde-ethena", symbol: "sUSDe", name: "Ethena Staked USDe", kind: "savings-passthrough", supply: 2.5e9 },
      ],
    });
    expect(m.reviewHold).toEqual([
      { id: holdId, symbol: "rcUSD", name: "R25 rcUSD", supply: 9e7 },
    ]);
  });

  it("routes policy and dynamically-detected tokenized funds to Reserve Anchorage strictly outside core totals and market readings", () => {
    const coreA = mkRow("usdc-circle", 10e9, { symbol: "USDC", name: "USD Coin", chainCirculating: { Ethereum: { current: 6e9 }, Base: { current: 4e9 } }, chains: ["Ethereum", "Base"] });
    const coreB = mkRow("usdt-tether", 10e9, { symbol: "USDT", name: "Tether", chainCirculating: { Tron: { current: 10e9 } }, chains: ["Tron"] });
    const buidl = mkRow("buidl-blackrock", 3e9, {
      symbol: "BUIDL", name: "BlackRock BUIDL",
      chainCirculating: { Ethereum: { current: 2e9 }, Solana: { current: 1e9 } }, chains: ["Ethereum", "Solana"],
    }, true);
    const dynamicFund = mkRow("future-tbill-fund", 15e9, {
      symbol: "FTBL", name: "Future T-Bill Fund", pegType: "peggedEUR",
      chainCirculating: { Solana: { current: 15e9 } }, chains: ["Solana"],
    }, true);

    const p = makePayloads({ coins: [coreA, coreB, buidl, dynamicFund] });
    // Even if upstream peg/stress feeds carry extreme signals on funds, reserve vessels must ignore them
    p.pegSummary!.data!.coins = [
      { id: coreA.id, currentDeviationBps: 2, activeDepeg: false },
      { id: coreB.id, currentDeviationBps: -3, activeDepeg: false },
      { id: buidl.id, currentDeviationBps: -900, activeDepeg: true },
      { id: dynamicFund.id, currentDeviationBps: -600, activeDepeg: true },
    ];
    p.stress!.data!.signals = {
      [coreA.id]: { score: 8, band: "CALM" },
      [coreB.id]: { score: 12, band: "CALM" },
      [buidl.id]: { score: 95, band: "DANGER" },
      [dynamicFund.id]: { score: 88, band: "WARNING" },
    };
    p.safetyGrades!.data!.grades = [
      { id: coreA.id, grade: "A", ratingStatus: "rated", notRatedReason: null },
      { id: buidl.id, grade: "NR", ratingStatus: "not-rated", notRatedReason: "tokenized-fund-not-graded" },
      { id: dynamicFund.id, grade: "NR", ratingStatus: "not-rated", notRatedReason: "tokenized-fund-not-graded" },
    ];

    const m = buildHarbourModel(p, T0_MS, opts);
    expect(m.payloadCount).toBe(4);
    expect(m.boats).toHaveLength(4);
    expect(m.coreCount).toBe(2);
    expect(m.reserveCount).toBe(2);
    expect(m.excludedCount).toBe(0);
    expect(m.supplyTotal).toBe(20e9);
    expect(m.reserveSupplyTotal).toBe(18e9);

    const bBuidl = m.boats.find((b) => b.id === "buidl-blackrock")!;
    const bDyn = m.boats.find((b) => b.id === "future-tbill-fund")!;
    const bCore = m.boats.find((b) => b.id === "usdc-circle")!;
    expect(isCoreBoat(bCore)).toBe(true);
    expect(bCore.listingClass).toBe("core-stablecoin");
    expect(bCore.fundMeta).toBeNull();
    expect(bCore.ratingStatus).toBe("rated");

    for (const f of [bBuidl, bDyn]) {
      expect(isTokenizedFund(f)).toBe(true);
      expect(isCoreBoat(f)).toBe(false);
      expect(f.listingClass).toBe("tokenized-fund");
      expect(f.state).toBe("reserve");
      expect(f.home).toBe("reserve");
      expect(f.circuit).toEqual([{ chain: null, where: "reserve", share: 1, rawShare: 1 }]);
      expect(f.pegDeviationBps).toBeNull();
      expect(f.activeDepeg).toBe(false);
      expect(f.nullPeg).toBe(true);
      expect(f.dews).toBeNull();
      expect(f.dewsScore).toBeNull();
      expect(f.stormSignal).toBeNull();
      expect(f.maiden).toBe(false);
      expect(f.grade).toBe("NR");
      expect(f.ratingStatus).toBe("not-rated");
      expect(f.gradeReason).toBe("tokenized-fund-not-graded");
      expect(f.chainShares.length).toBeGreaterThan(0);
    }
    expect(bBuidl.fundMeta).toMatchObject({ navToken: false, pegCurrency: "USD", archetype: "tbill" });
    expect(bBuidl.fundMeta!.backedIds.length).toBeGreaterThan(0);
    // Unsynced fallback fund uses navToken: null (not fabricated) and caps hullClass at "large" even at $15B AUM
    expect(bDyn.fundMeta).toEqual({ navToken: null, pegCurrency: "EUR", archetype: null, backedIds: [] });
    expect(bDyn.hullClass).toBe("large");

    // Flows reading coins exclude tokenized funds; coreCount excludes wrecked core coins
    const pFlows = makePayloads({ coins: [coreA, coreB, buidl] });
    pFlows.mintBurn = {
      meta: { updatedAt: T0_MS / 1000, ageSeconds: 0, status: "fresh" }, fetchedAtMs: T0_MS,
      data: {
        hourly: [{ hourTs: Math.floor(T0_MS / 1000) - 3600, netFlowUsd: 1e6, mintVolumeUsd: 2e6, burnVolumeUsd: 1e6 }],
        coins: [
          { stablecoinId: coreA.id, mintVolume24hUsd: 2e6, burnVolume24hUsd: 1e6, netFlow24hUsd: 1e6, netFlow7dUsd: 1e6 },
          { stablecoinId: buidl.id, mintVolume24hUsd: 9e7, burnVolume24hUsd: 0, netFlow24hUsd: 9e7, netFlow7dUsd: 9e7 },
        ],
      },
    };
    const mFlows = buildHarbourModel(pFlows, T0_MS, {
      pieredChains: opts.pieredChains,
      dead: [{ id: coreB.id, symbol: "USDT", name: "Tether", causeOfDeath: "algorithmic-failure", deathDate: "2024-01", peakMcap: 1e9, pegCurrency: "USD", obituary: "test", sourceUrl: "https://example.com", sourceLabel: "Test" }],
    });
    expect(mFlows.coreCount).toBe(1);
    expect((mFlows.readings.flows.coins ?? []).map((c) => c.stablecoinId)).toEqual([coreA.id]);

    // Harbours strictly reflect core boats only (Solana only had funds -> excluded from harbours)
    expect(m.harbours.map((h) => h.chain).sort()).toEqual(["Base", "Ethereum", "Tron"]);
    expect(m.harbours.reduce((s, h) => s + h.supplyUsd, 0)).toBe(20e9);

    // Market readings strictly reflect core boats only (no depeg, no storm cones/flags, calm weather)
    expect(m.readings.shoals).toEqual([]);
    expect(m.readings.seaState).toMatchObject({ offPegShare: 0, step: 0 });
    expect(m.readings.weather).toMatchObject({ band: "CALM", level: 0, coverage: 1 });
    expect(m.readings.stormCones).toEqual({ count: 0, shown: 0, extra: 0 });
    expect(m.readings.stormFlags).toEqual([]);

    // Plan key reacts to a core <-> reserve state transition
    const withoutFundGrade = makePayloads({ coins: [coreA, coreB, buidl, dynamicFund] });
    withoutFundGrade.safetyGrades!.data!.grades = [{ id: coreA.id, grade: "A" }];
    expect(buildHarbourModel(withoutFundGrade, T0_MS, opts).planKey).not.toBe(m.planKey);
  });
});
