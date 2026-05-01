import { describe, expect, it } from "vitest";
import { fixtureStablecoins } from "@/__fixtures__/pharosville-world";
import { structuralFingerprint, structuralSerialize } from "./structural-hash";

describe("structuralFingerprint", () => {
  it("is stable for equivalent objects with different key order", () => {
    const first = { alpha: 1, nested: { beta: true, gamma: ["x", "y"] } };
    const second = { nested: { gamma: ["x", "y"], beta: true }, alpha: 1 };

    expect(structuralFingerprint(first)).toBe(structuralFingerprint(second));
  });

  it("treats array order as significant by default", () => {
    expect(structuralFingerprint(["a", "b"])).not.toBe(structuralFingerprint(["b", "a"]));
  });

  it("can treat array order as unordered for snapshot payloads", () => {
    const first = {
      symbols: ["USDC", "USDT"],
      nested: [{ id: "ethereum", totalUsd: 1 }, { id: "tron", totalUsd: 2 }],
    };
    const second = {
      symbols: ["USDT", "USDC"],
      nested: [{ totalUsd: 2, id: "tron" }, { totalUsd: 1, id: "ethereum" }],
    };

    expect(structuralFingerprint(first, { arrayOrder: "unordered" }))
      .toBe(structuralFingerprint(second, { arrayOrder: "unordered" }));
  });

  it("matches semantically identical stablecoin fixtures across array reorder", () => {
    const first = {
      peggedAssets: fixtureStablecoins.peggedAssets.map((asset) => ({
        ...asset,
        chains: [...(asset.chains ?? [])],
      })),
    };
    const second = {
      peggedAssets: [...first.peggedAssets].reverse(),
    };

    expect(structuralFingerprint(first, { arrayOrder: "unordered" }))
      .toBe(structuralFingerprint(second, { arrayOrder: "unordered" }));
  });

  it("changes when structural payload changes", () => {
    const base = {
      routeMode: "world",
      stablecoins: { count: 2, symbols: ["USDC", "USDT"] },
    };

    const changed = {
      routeMode: "world",
      stablecoins: { count: 3, symbols: ["USDC", "USDT", "DAI"] },
    };

    expect(structuralFingerprint(base, { arrayOrder: "unordered" }))
      .not.toBe(structuralFingerprint(changed, { arrayOrder: "unordered" }));
  });

  it("serializes cycles without throwing", () => {
    const cyclic: Record<string, unknown> = { id: "root" };
    cyclic.self = cyclic;

    expect(() => structuralSerialize(cyclic)).not.toThrow();
  });
});
