/** Proposed acceptance fixtures for PharosVille main 599c8225839702e3d1baf047ab3b46f04137d01b.
 * Counterfactual data-contract and quiet representative preview fixtures.
 * Uses the current repository's aliases, helpers, types and copied API schemas.
 * Shape-valid fixtures do not imply desired behavior is implemented or tested.
 */
import {
  makeAsset, makePegCoin, makePharosVilleWorldInput, makeSourceStatuses,
  fixtureStablecoins, fixtureChains, fixtureStability, fixturePegSummary,
  fixtureStress, fixtureSafetyGrades, fixtureMintBurn,
  denseFixtureStablecoins, denseFixtureChains, denseFixturePegSummary,
  denseFixtureStress, denseFixtureSafetyGrades,
} from "@/__fixtures__/pharosville-world";
import type { PharosVilleInputs } from "@/systems/pharosville-world/pipeline-types";
import type { MintBurnCoinFlow, MintBurnCoinCoverage } from "@shared/types/mint-burn";
import type { ApiMeta } from "@shared/types/api-meta";
import type { ApiQueryWithMetaResult } from "@/hooks/use-api-query";
import type { PharosVilleApiPayload, PharosVilleApiEndpointKey } from "@shared/types/pharosville";
import { PHAROSVILLE_API_PAYLOAD_SCHEMAS } from "@shared/types/pharosville";
import { CHAIN_META, resolveChainId } from "@shared/lib/chains";
import type { ChainSummary } from "@shared/types/chains";
import { getCirculatingRaw } from "@/lib/supply";

export const T = 1_700_000_000; // Unix seconds; freeze the observer clock at this time too.
export const NOW_MS = T * 1000;
export const FRESH_META: ApiMeta = { updatedAt: T, ageSeconds: 0, status: "fresh" };
export const FULL_COVERAGE: MintBurnCoinCoverage = {
  startBlock: 0, lastSyncedBlock: 100, lagBlocks: 0,
  historyStartAt: T - 90 * 86400, has24hWindow: true, has30dWindow: true,
  has90dWindow: true, isPartial: false, status: "full",
};

function flow(row: MintBurnCoinFlow, mint: number, burn: number): MintBurnCoinFlow {
  const net = mint - burn;
  return {
    ...row, mintVolume24hUsd: mint, burnVolume24hUsd: burn, netFlow24hUsd: net,
    mintCount24h: mint > 0 ? 10 : 0, burnCount24h: burn > 0 ? 10 : 0,
    flowIntensity: 0, has24hActivity: mint + burn > 0,
    netFlowDirection24h: mint + burn === 0 ? "inactive" : net > 0 ? "minting" : net < 0 ? "burning" : "flat",
    coverage: { ...FULL_COVERAGE }, largestEvent24h: null,
  };
}

/** Fixture-only bookkeeping, NOT a new production methodology or API reconciliation rule.
 * Maintains stock lists, aggregate totals and dominant holdings after a synthetic universe change.
 * Producer PSI/gauge outputs stay deliberately frozen for single-signal counterfactuals.
 */
export function reconcileSyntheticStocks(input: PharosVilleInputs): PharosVilleInputs {
  if (!input.stablecoins || !input.chains) return input;
  const assets = input.stablecoins.peggedAssets.map((asset) => ({ ...asset,
    chains: Object.entries(asset.chainCirculating).filter(([, point]) => point.current > 0)
      .map(([rawId]) => CHAIN_META[resolveChainId(rawId) ?? rawId]?.name ?? rawId),
  }));
  const globalTotalUsd = assets.reduce((total, asset) => total + getCirculatingRaw(asset), 0);
  const holdings = new Map<string, Array<{ id: string; symbol: string; supplyUsd: number }>>();
  for (const asset of assets) for (const [rawId, point] of Object.entries(asset.chainCirculating)) {
    if (point.current <= 0) continue;
    const chainId = resolveChainId(rawId) ?? rawId;
    const rows = holdings.get(chainId) ?? [];
    rows.push({ id: asset.id, symbol: asset.symbol, supplyUsd: point.current });
    holdings.set(chainId, rows);
  }
  const chains: ChainSummary[] = input.chains.chains.flatMap((chain) => {
    const chainId = resolveChainId(chain.id) ?? chain.id;
    const rows = holdings.get(chainId);
    if (!rows?.length) return [];
    const totalUsd = rows.reduce((total, row) => total + row.supplyUsd, 0);
    const top = rows.toSorted((a, b) => b.supplyUsd - a.supplyUsd || a.id.localeCompare(b.id));
    const dominant = top[0]!;
    return [{ ...chain, id: chainId, totalUsd, stablecoinCount: rows.length,
      dominantStablecoin: { id: dominant.id, symbol: dominant.symbol, share: dominant.supplyUsd / totalUsd },
      dominanceShare: dominant.supplyUsd / totalUsd,
      topStablecoins: top.slice(0, 5).map((row) => ({ ...row, share: row.supplyUsd / totalUsd })),
    }];
  });
  const chainAttributedTotalUsd = chains.reduce((total, chain) => total + chain.totalUsd, 0);
  const flowIds = new Set(input.mintBurn?.coins.map((row) => row.stablecoinId));
  const pegRows = input.pegSummary?.coins;
  const deviations = (pegRows ?? []).flatMap((coin) => coin.currentDeviationBps == null ? [] : [coin.currentDeviationBps]).toSorted((a, b) => a - b);
  const middle = Math.floor(deviations.length / 2);
  const median = deviations.length === 0 ? 0 : deviations.length % 2 ? deviations[middle]! : (deviations[middle - 1]! + deviations[middle]!) / 2;
  const worst = [...(pegRows ?? [])].filter((coin) => coin.currentDeviationBps != null)
    .toSorted((a, b) => Math.abs(b.currentDeviationBps!) - Math.abs(a.currentDeviationBps!) || a.id.localeCompare(b.id))[0];
  return { ...input, stablecoins: { ...input.stablecoins, peggedAssets: assets },
    chains: { ...input.chains, chains, globalTotalUsd, chainAttributedTotalUsd,
      unattributedTotalUsd: Math.max(0, globalTotalUsd - chainAttributedTotalUsd) },
    pegSummary: input.pegSummary ? { ...input.pegSummary, summary: {
      activeDepegCount: pegRows!.filter((coin) => coin.activeDepeg).length,
      medianDeviationBps: median,
      worstCurrent: worst ? { id: worst.id, symbol: worst.symbol, bps: worst.currentDeviationBps! } : null,
      coinsAtPeg: pegRows!.filter((coin) => !coin.activeDepeg && Math.abs(coin.currentDeviationBps ?? Infinity) < 50).length,
      totalTracked: pegRows!.length,
      depegEventsToday: pegRows!.filter((coin) => coin.lastEventAt != null && coin.lastEventAt > T - 86400).length,
      depegEventsYesterday: 0,
    } } : input.pegSummary,
    mintBurn: input.mintBurn ? { ...input.mintBurn, gauge: { ...input.mintBurn.gauge,
      trackedCoins: input.mintBurn.coins.length,
      trackedMcapUsd: assets.filter((asset) => flowIds.has(asset.id)).reduce((total, asset) => total + getCirculatingRaw(asset), 0),
    } } : input.mintBurn,
  };
}

export function quietNormalInput(): PharosVilleInputs {
  const assets = fixtureStablecoins.peggedAssets.map((asset) => ({
    ...asset,
    chainCirculating: asset.id === "usdt-tether"
      ? { Ethereum: { current: 7e9, circulatingPrevDay: 7e9, circulatingPrevWeek: 7e9, circulatingPrevMonth: 7e9 },
          Tron: { current: 3e9, circulatingPrevDay: 3e9, circulatingPrevWeek: 3e9, circulatingPrevMonth: 3e9 } }
      : asset.chainCirculating,
  }));
  return reconcileSyntheticStocks(makePharosVilleWorldInput({
    generatedAt: NOW_MS, stablecoins: { peggedAssets: assets },
    chains: { ...fixtureChains, globalChange7dPct: 0 },
    stability: { ...fixtureStability, current: { ...fixtureStability.current, score: 98, band: "BEDROCK" } },
    pegSummary: { ...fixturePegSummary, coins: fixturePegSummary.coins.map((coin) => ({
      ...coin, priceConfidence: "high", priceObservedAt: T, priceObservedAtMode: "upstream",
      priceUpdatedAt: T, priceSyncedAt: T, primaryTrust: "authoritative",
    })) },
    stress: { ...fixtureStress, signals: Object.fromEntries(assets.map((asset) => [asset.id, {
      band: "CALM", score: 8, signals: { peg: { available: true, value: 0 } },
      computedAt: T, methodologyVersion: "fixture",
    }])) },
    safetyGrades: fixtureSafetyGrades,
    mintBurn: { ...fixtureMintBurn, gauge: { ...fixtureMintBurn.gauge, score: 0, band: "FLAT", intensitySemantics: "signed-v2" },
      coins: fixtureMintBurn.coins.map((row) => flow(row, 0, 0)), windowHours: 24,
      sync: { lastSuccessfulSyncAt: T, freshnessStatus: "fresh", warning: null, criticalLaneHealthy: true } },
    freshness: makeSourceStatuses(),
  }));
}

function coinFlowScenario(mint: number, burn: number): PharosVilleInputs {
  const base = quietNormalInput();
  return { ...base, mintBurn: { ...base.mintBurn!, coins: base.mintBurn!.coins.map((row) => (
    row.stablecoinId === "usdc-circle" ? flow(row, mint, burn) : row
  )) } };
}

function depegScenario(): PharosVilleInputs {
  const base = quietNormalInput();
  return reconcileSyntheticStocks({ ...base, pegSummary: { ...base.pegSummary!, coins: base.pegSummary!.coins.map((coin) => (
    coin.id === "usdc-circle" ? { ...coin, activeDepeg: true, currentDeviationBps: -600 } : coin
  )) } });
}

function stressScenario(band: string, score: number): PharosVilleInputs {
  const base = quietNormalInput();
  return { ...base, stress: { ...base.stress!, signals: { ...base.stress!.signals,
    "usdc-circle": { ...base.stress!.signals["usdc-circle"]!, band, score },
  } } };
}

function smallOutlierScenario(acute: boolean): PharosVilleInputs {
  const base = quietNormalInput();
  const id = "dai-makerdao";
  const asset = makeAsset({ id, symbol: "DAI", circulating: { peggedUSD: 1e6 },
    circulatingPrevDay: { peggedUSD: 1e6 }, circulatingPrevWeek: { peggedUSD: 1e6 }, circulatingPrevMonth: { peggedUSD: 1e6 },
    chainCirculating: { Ethereum: { current: 1e6, circulatingPrevDay: 1e6, circulatingPrevWeek: 1e6, circulatingPrevMonth: 1e6 } } });
  return reconcileSyntheticStocks({ ...base, stablecoins: { peggedAssets: [...base.stablecoins!.peggedAssets, asset] },
    pegSummary: { ...base.pegSummary!, coins: [...base.pegSummary!.coins, makePegCoin({ id, symbol: "DAI", activeDepeg: acute, currentDeviationBps: acute ? -600 : 0 })] },
    stress: { ...base.stress!, signals: { ...base.stress!.signals, [id]: {
      band: acute ? "DANGER" : "CALM", score: acute ? 90 : 8, signals: {}, computedAt: T, methodologyVersion: "fixture",
    } } },
    safetyGrades: { ...base.safetyGrades!, grades: [...base.safetyGrades!.grades, { id, grade: "A", score: 90 }] },
  });
}

function acuteConsortScenario(acute: boolean): PharosVilleInputs {
  const base = quietNormalInput();
  const members = [makeAsset({ id: "usds-sky", symbol: "USDS" }), makeAsset({ id: "susds-sky", symbol: "sUSDS" })];
  return reconcileSyntheticStocks({ ...base, stablecoins: { peggedAssets: members },
    pegSummary: { ...base.pegSummary!, coins: members.map((asset) => makePegCoin({
      id: asset.id, symbol: asset.symbol, activeDepeg: acute && asset.id === "susds-sky",
      currentDeviationBps: acute && asset.id === "susds-sky" ? -600 : 0,
      priceConfidence: "high", priceObservedAt: T, priceObservedAtMode: "upstream", priceUpdatedAt: T, priceSyncedAt: T, primaryTrust: "authoritative",
    })) },
    stress: { ...base.stress!, signals: Object.fromEntries(members.map((asset) => [asset.id, {
      band: "CALM", score: 8, signals: {}, computedAt: T, methodologyVersion: "fixture",
    }])) },
    safetyGrades: { ...base.safetyGrades!, grades: members.map((asset) => ({ id: asset.id, grade: "A" as const, score: 90 })) },
    mintBurn: { ...base.mintBurn!, coins: members.map((asset) => flow({ ...fixtureMintBurn.coins[0]!, stablecoinId: asset.id, symbol: asset.symbol }, 0, 0)) },
  });
}

/** Separate full-fleet art/capacity fixtures. Never use the two-ship unit baseline for taste approval. */
export function denseQuietArtInput(): PharosVilleInputs {
  const base = quietNormalInput();
  const assets = denseFixtureStablecoins.peggedAssets.map((asset) => {
    const circulating = getCirculatingRaw(asset);
    const attributed = Object.values(asset.chainCirculating).reduce((sum, point) => sum + point.current, 0);
    // Seven original dense rows overallocate 102%. Normalize only those synthetic rows,
    // retaining the same chain proportions/IDs and the original ship stock/size.
    const factor = attributed > circulating && attributed > 0 ? circulating / attributed : 1;
    return { ...asset,
      circulatingPrevDay: { ...asset.circulating }, circulatingPrevWeek: { ...asset.circulating }, circulatingPrevMonth: { ...asset.circulating },
      chainCirculating: Object.fromEntries(Object.entries(asset.chainCirculating).map(([id, point]) => {
        const current = point.current * factor;
        return [id, { current, circulatingPrevDay: current, circulatingPrevWeek: current, circulatingPrevMonth: current }];
      })),
    };
  });
  return reconcileSyntheticStocks({ ...base, stablecoins: { peggedAssets: assets },
    chains: { ...denseFixtureChains, globalChange24hPct: 0, globalChange7dPct: 0, globalChange30dPct: 0,
      chains: denseFixtureChains.chains.map((chain) => ({ ...chain, change24h: 0, change24hPct: 0, change7d: 0, change7dPct: 0, change30d: 0, change30dPct: 0 })) },
    stability: { ...base.stability!, current: { ...base.stability!.current!, score: 82, band: "STEADY", totalMcapUsd: assets.reduce((sum, asset) => sum + getCirculatingRaw(asset), 0) } },
    pegSummary: { ...denseFixturePegSummary, coins: denseFixturePegSummary.coins.map((coin) => ({ ...coin,
      currentDeviationBps: 0, activeDepeg: false, pegScore: 100, severityScore: 0,
      eventCount: 0, worstDeviationBps: 0, lastEventAt: null,
      priceConfidence: "high", priceObservedAt: T, priceObservedAtMode: "upstream", priceUpdatedAt: T, priceSyncedAt: T, primaryTrust: "authoritative",
    })) },
    stress: { ...denseFixtureStress, signals: Object.fromEntries(assets.map((asset) => [asset.id, {
      band: "CALM", score: 8, signals: { peg: { available: true, value: 0 } }, computedAt: T, methodologyVersion: "fixture",
    }])) },
    safetyGrades: { ...denseFixtureSafetyGrades, grades: assets.map((asset) => ({ id: asset.id, grade: "A", score: 90 })) },
    mintBurn: { ...base.mintBurn!, coins: assets.map((asset) => flow({ ...fixtureMintBurn.coins[0]!, stablecoinId: asset.id, symbol: asset.symbol }, 0, 0)),
      scope: { chainIds: denseFixtureChains.chains.map((chain) => resolveChainId(chain.id) ?? chain.id), label: "Synthetic fixture chains" } },
  });
}

export function denseMixedCapacityInput(): PharosVilleInputs {
  const base = denseQuietArtInput();
  return reconcileSyntheticStocks({ ...base, pegSummary: denseFixturePegSummary, stress: denseFixtureStress,
    safetyGrades: denseFixtureSafetyGrades,
    stability: { ...base.stability!, current: { ...base.stability!.current!, score: 25, band: "CRISIS" } },
  });
}

export const SCENARIOS = {
  quietNormal: quietNormalInput(),
  severeSingleCoinDepeg: depegScenario(),
  marketWideStress: (() => { const base = quietNormalInput(); return { ...base,
    stability: { ...base.stability!, current: { ...base.stability!.current!, score: 25, band: "CRISIS" } },
    stress: { ...base.stress!, signals: Object.fromEntries(Object.entries(base.stress!.signals).map(([id, row]) => [id, { ...row, band: "WARNING", score: 78 }])) },
  }; })(),
  missingEnrichment: { ...quietNormalInput(), stability: undefined, pegSummary: undefined, stress: undefined,
    safetyGrades: undefined, mintBurn: undefined },
  staleRisk: { ...depegScenario(), freshness: makeSourceStatuses({ pegSummary: { state: "stale" }, stress: { state: "stale" } }) },
  largeMint: coinFlowScenario(100e6, 0),
  largeRedemption: coinFlowScenario(0, 100e6),
  largeBalancedGross: coinFlowScenario(100e6, 100e6),
  oneDollarNet: coinFlowScenario(1, 0),
  partialFlow: (() => { const base = coinFlowScenario(100e6, 0); return { ...base,
    mintBurn: { ...base.mintBurn!, coins: base.mintBurn!.coins.map((row) => ({ ...row,
      // Only six hours of history, rather than a contradictory full ninety-day baseline.
      coverage: { ...FULL_COVERAGE, status: "partial-history" as const, historyStartAt: T - 6 * 3600,
        has24hWindow: false, has30dWindow: false, has90dWindow: false, isPartial: true },
    })) },
  }; })(),
  smallCoinCalmBaseline: smallOutlierScenario(false),
  smallCoinOutlier: smallOutlierScenario(true),
  unknownStressBand: stressScenario("UNRECOGNIZED_TEST_BAND", 999),
  mildDeviationStrongDews: (() => { const base = stressScenario("DANGER", 90); return reconcileSyntheticStocks({ ...base,
    pegSummary: { ...base.pegSummary!, coins: base.pegSummary!.coins.map((coin) => coin.id === "usdc-circle" ? { ...coin, currentDeviationBps: 60 } : coin) },
  }); })(),
  calmConsortBaseline: acuteConsortScenario(false),
  acuteConsort: acuteConsortScenario(true),
  oldStressRowFreshEnvelope: (() => { const base = stressScenario("DANGER", 90); return { ...base,
    stress: { ...base.stress!, updatedAt: T, signals: { ...base.stress!.signals,
      "usdc-circle": { ...base.stress!.signals["usdc-circle"]!, computedAt: T - 86400 },
    } },
  }; })(),
  psiInputDegraded: (() => { const base = quietNormalInput(); return { ...base,
    stability: { ...base.stability!, current: { ...base.stability!.current!, inputDegradation: {
      dewsUnavailable: true, dewsFailureReason: "fixture unavailable", depegEventsUnavailable: false, depegEventsFailureReason: null,
    } } },
  }; })(),
  legacyFlowSemantics: (() => { const base = coinFlowScenario(100e6, 0); return { ...base,
    mintBurn: { ...base.mintBurn!, gauge: { ...base.mintBurn!.gauge, score: 50, intensitySemantics: "midpoint-v1" as const },
      coins: base.mintBurn!.coins.map((row) => ({ ...row, flowIntensity: 50 })),
    },
  }; })(),
  denseQuietArt: denseQuietArtInput(),
  denseMixedCapacity: denseMixedCapacityInput(),
} satisfies Record<string, PharosVilleInputs>;

// Deliberately outside copied endpoint schema: raw transport probes, never typed as valid inputs.
export const INVALID_CRITICAL_PAYLOADS: Record<string, unknown> = {
  unrecognizedIntensitySemantics: { ...SCENARIOS.largeMint.mintBurn!,
    gauge: { ...SCENARIOS.largeMint.mintBurn!.gauge, intensitySemantics: "UNRECOGNIZED_TEST_SEMANTICS" },
  },
  negativeGrossVolume: { ...SCENARIOS.largeMint.mintBurn!,
    coins: SCENARIOS.largeMint.mintBurn!.coins.map((row) => ({ ...row, mintVolume24hUsd: -1 })),
  },
};

type Stub<K extends PharosVilleApiEndpointKey> = Pick<ApiQueryWithMetaResult<PharosVilleApiPayload<K>>,
  "data" | "meta" | "error" | "isLoading" | "isError" | "isSuccess" | "observedNowMs">;
export const MISSING_STRESS_QUERY = {
  data: undefined, meta: null, error: new Error("fixture stress failed"),
  isLoading: false, isError: true, isSuccess: false,
  observedNowMs: NOW_MS,
} satisfies Stub<"stress">;
export const PENDING_STRESS_QUERY = { ...MISSING_STRESS_QUERY, error: null, isLoading: true, isError: false } satisfies Stub<"stress">;
export const STALE_RETAINED_STRESS_QUERY = {
  data: SCENARIOS.severeSingleCoinDepeg.stress!, meta: { ...FRESH_META, status: "stale" },
  error: new Error("fixture offline"), isLoading: false, isError: true, isSuccess: false,
  observedNowMs: NOW_MS,
} satisfies Stub<"stress">;
export const FAILED_RETAINED_FRESH_STRESS_QUERY = {
  ...STALE_RETAINED_STRESS_QUERY, meta: FRESH_META,
} satisfies Stub<"stress">;

/** Validate input shapes only. This deliberately does not assert proposed scene behavior. */
export function validateFixturePayloads(): Record<string, string[]> {
  const validation: Record<string, string[]> = {};
  for (const [name, input] of Object.entries(SCENARIOS)) {
    const validKeys: string[] = [];
    for (const key of Object.keys(PHAROSVILLE_API_PAYLOAD_SCHEMAS) as PharosVilleApiEndpointKey[]) {
      const payload = input[key];
      if (payload == null) continue;
      const result = PHAROSVILLE_API_PAYLOAD_SCHEMAS[key].safeParse(payload);
      if (!result.success) throw new Error(`${name}.${key}: ${JSON.stringify(result.error.issues)}`);
      validKeys.push(key);
    }
    validation[name] = validKeys;
  }
  return validation;
}

/** Extra synthetic bookkeeping assertions; these are not producer-methodology checks. */
export function validateSyntheticBookkeeping(): void {
  for (const [name, input] of Object.entries(SCENARIOS)) {
    if (!input.stablecoins || !input.chains) continue;
    const stocks = input.stablecoins.peggedAssets;
    const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(a) * 1e-12);
    const global = stocks.reduce((sum, asset) => sum + getCirculatingRaw(asset), 0);
    if (!close(global, input.chains.globalTotalUsd)) throw new Error(`${name}: global stock mismatch`);
    const attributed = input.chains.chains.reduce((sum, chain) => sum + chain.totalUsd, 0);
    if (!close(attributed, input.chains.chainAttributedTotalUsd)) throw new Error(`${name}: attributed stock mismatch`);
    if (!close(global, attributed + input.chains.unattributedTotalUsd)) throw new Error(`${name}: unattributed stock mismatch`);
    const idSet = new Set(stocks.map((asset) => asset.id));
    for (const grade of input.safetyGrades?.grades ?? []) if (!idSet.has(grade.id)) throw new Error(`${name}: unrelated grade row`);
    for (const asset of stocks) {
      const held = Object.values(asset.chainCirculating).reduce((sum, point) => sum + point.current, 0);
      const circulating = getCirculatingRaw(asset);
      if (held > circulating + Math.max(1e-6, circulating * 1e-12)) throw new Error(`${name}: per-coin held stock exceeds circulating`);
      const expected = Object.entries(asset.chainCirculating).filter(([, point]) => point.current > 0)
        .map(([id]) => CHAIN_META[resolveChainId(id) ?? id]?.name ?? id).toSorted();
      if (JSON.stringify(expected) !== JSON.stringify([...asset.chains].toSorted())) throw new Error(`${name}: chain list mismatch`);
    }
    if (input.pegSummary?.summary && input.pegSummary.summary.activeDepegCount !== input.pegSummary.coins.filter((row) => row.activeDepeg).length)
      throw new Error(`${name}: active-depeg summary mismatch`);
    if (input.mintBurn) {
      const flowIds = new Set(input.mintBurn.coins.map((row) => row.stablecoinId));
      const tracked = stocks.filter((asset) => flowIds.has(asset.id)).reduce((sum, asset) => sum + getCirculatingRaw(asset), 0);
      if (!close(tracked, input.mintBurn.gauge.trackedMcapUsd) || input.mintBurn.coins.length !== input.mintBurn.gauge.trackedCoins)
        throw new Error(`${name}: flow coverage stock mismatch`);
    }
  }
}

