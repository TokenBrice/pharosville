import { describe, expect, it } from "vitest";
import { fixtureChains, fixtureMintBurn, fixturePegSummary, fixtureSafetyGrades, fixtureStability, fixtureStablecoins, fixtureStress } from "@/__fixtures__/pharosville-world";
import { isRenderableWorldPayload } from "./world-payload-guard";

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
});
