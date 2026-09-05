import { describe, expect, it } from "vitest";
import { fixtureChains, fixtureMintBurn, fixturePegSummary, fixtureReportCards, fixtureStability, fixtureStablecoins, fixtureStress } from "@/__fixtures__/pharosville-world";
import { isRenderableWorldPayload } from "./world-payload-guard";

const payloads = { chains: fixtureChains, mintBurn: fixtureMintBurn, pegSummary: fixturePegSummary, reportCards: fixtureReportCards, stability: fixtureStability, stablecoins: fixtureStablecoins, stress: fixtureStress } as const;
describe("render-critical payload guards", () => {
  it.each(Object.keys(payloads) as (keyof typeof payloads)[])("accepts the %s world fixture and rejects malformed containers", (key) => {
    expect(isRenderableWorldPayload(key, payloads[key])).toBe(true);
    for (const invalid of [null, [], "payload", {}, { ...payloads[key], ...Object.fromEntries(Object.keys(payloads[key]).map((field) => [field, "broken"])) }]) {
      expect(isRenderableWorldPayload(key, invalid)).toBe(false);
    }
  });
  it("rejects non-finite geometry inputs and missing nested graph structure", () => {
    expect(isRenderableWorldPayload("chains", { ...fixtureChains, chains: [{ ...fixtureChains.chains[0], totalUsd: Infinity }] })).toBe(false);
    expect(isRenderableWorldPayload("reportCards", { ...fixtureReportCards, dependencyGraph: {} })).toBe(false);
  });
});
