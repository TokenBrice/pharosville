import { describe, expect, it } from "vitest";
import { fixtureChains, fixtureMintBurn, fixturePegSummary, fixtureSafetyGrades, fixtureStability, fixtureStablecoins, fixtureStress } from "@/__fixtures__/pharosville-world";
import { isRenderableWorldPayload } from "./world-payload-guard";
import { issuanceContractDrift } from "@/__fixtures__/issuance-contract-drift";
import { MintBurnFlowsResponseSchema } from "@shared/types/mint-burn";
import { canonicalizeChainCirculating } from "@shared/lib/chain-circulating";

const payloads = { chains: fixtureChains, mintBurn: fixtureMintBurn, pegSummary: fixturePegSummary, safetyGrades: fixtureSafetyGrades, stability: fixtureStability, stablecoins: fixtureStablecoins, stress: fixtureStress } as const;
describe("render-critical payload guards", () => {
  it.each(Object.keys(payloads) as (keyof typeof payloads)[])("accepts the %s world fixture and rejects malformed containers", (key) => {
    expect(isRenderableWorldPayload(key, payloads[key])).toBe(true);
    for (const invalid of [null, [], "payload", {}, { ...payloads[key], ...Object.fromEntries(Object.keys(payloads[key]).map((field) => [field, "broken"])) }]) {
      expect(isRenderableWorldPayload(key, invalid)).toBe(false);
    }
  });
  it("rejects non-finite geometry inputs and non-array grades", () => {
    expect(isRenderableWorldPayload("chains", { ...fixtureChains, chains: [{ ...fixtureChains.chains[0], totalUsd: Infinity }] })).toBe(false);
    expect(isRenderableWorldPayload("safetyGrades", { ...fixtureSafetyGrades, grades: {} })).toBe(false);
  });
  it("accepts nullable history windows and an absent flow intensity, but not non-finite values in them", () => {
    const chain = { ...fixtureChains.chains[0], change7d: null, change7dPct: null, change30d: null, change30dPct: null };
    expect(isRenderableWorldPayload("chains", { ...fixtureChains, chains: [chain] })).toBe(true);
    expect(isRenderableWorldPayload("chains", { ...fixtureChains, chains: [{ ...chain, change30dPct: Number.NaN }] })).toBe(false);

    const { flowIntensity: _omitted, ...coin } = { ...fixtureMintBurn.coins[0], netFlow7dUsd: null, netFlow30dUsd: null, netFlow90dUsd: null };
    expect(isRenderableWorldPayload("mintBurn", { ...fixtureMintBurn, coins: [coin] })).toBe(true);
    expect(isRenderableWorldPayload("mintBurn", { ...fixtureMintBurn, coins: [{ ...coin, netFlow90dUsd: Infinity }] })).toBe(false);
    expect(isRenderableWorldPayload("mintBurn", { ...fixtureMintBurn, coins: [{ ...coin, netFlow24hUsd: null }] })).toBe(false);
  });

  it("accepts the diagnosed producer drift in both boundary validators", () => {
    expect(isRenderableWorldPayload("mintBurn", issuanceContractDrift)).toBe(true);
    const parsed = MintBurnFlowsResponseSchema.safeParse(issuanceContractDrift);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.coins[0]!.netFlow24hUsd).toBeNull();
  });

  it("preserves unknown canonical chain history when aliases merge into a known current holding", () => {
    const canonical = canonicalizeChainCirculating({
      Ethereum: { current: 10, circulatingPrevDay: null, circulatingPrevWeek: 8, circulatingPrevMonth: 0 },
      ethereum: { current: 5, circulatingPrevDay: 4, circulatingPrevWeek: 3 },
    });
    expect(canonical.get("ethereum")).toEqual({
      current: 15, circulatingPrevDay: null, circulatingPrevWeek: 11, circulatingPrevMonth: null,
    });
    expect(canonicalizeChainCirculating({ Ethereum: { current: 0, circulatingPrevDay: 0 } }).get("ethereum")!.circulatingPrevDay).toBe(0);
    expect(canonicalizeChainCirculating({
      Ethereum: { current: 1, circulatingPrevDay: undefined, circulatingPrevWeek: undefined, circulatingPrevMonth: undefined },
    }).get("ethereum")).toEqual({
      current: 1, circulatingPrevDay: null, circulatingPrevWeek: null, circulatingPrevMonth: null,
    });
  });

  it.each([
    { netFlow24hUsd: Infinity }, { netFlow24hUsd: "1" }, { mintVolume24hUsd: -1 },
    { burnVolume24hUsd: Number.NaN }, { mintCount24h: 0.5 }, { coverage: { status: "future" } },
    { valuation: undefined }, { valuation: { window24h: { completeness: "complete" } } },
  ])("rejects critical corruption without discarding valid nullable semantics: %j", (change) => {
    const payload = { ...issuanceContractDrift, coins: [{ ...issuanceContractDrift.coins[0], ...change }] };
    expect(isRenderableWorldPayload("mintBurn", payload)).toBe(false);
    expect(MintBurnFlowsResponseSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects negative hourly gross and unqualified hourly null nets", () => {
    for (const change of [{ mintVolumeUsd: -1 }, { netFlowUsd: Infinity }, { valuation: "complete" }]) {
      const payload = { ...issuanceContractDrift, hourly: [{ ...issuanceContractDrift.hourly[0], ...change }] };
      expect(isRenderableWorldPayload("mintBurn", payload)).toBe(false);
      expect(MintBurnFlowsResponseSchema.safeParse(payload).success).toBe(false);
    }
  });
});
