import { describe, expect, it } from "vitest";
import { LIVE_RESERVE_ADAPTER_KEYS } from "@shared/types/live-reserves";
import {
  LiveReservesConfigSchema,
  LIVE_RESERVE_ADAPTER_REGISTRY,
} from "@shared/lib/live-reserve-adapters";

describe("live reserve adapter registry", () => {
  it("has a complete registry entry for every adapter key", () => {
    for (const adapterKey of LIVE_RESERVE_ADAPTER_KEYS) {
      const entry = LIVE_RESERVE_ADAPTER_REGISTRY[adapterKey];
      expect(entry.definition).toBeTruthy();
      expect(entry.inputKinds.length).toBeGreaterThan(0);
      expect(entry.paramsSchema).toBeTruthy();
    }
  });

  it("parses by adapter discriminator and rejects extra top-level fields", () => {
    const valid = {
      adapter: "accountable",
      version: 1,
      semantics: "collateral-mix",
      inputs: {
        primary: { kind: "http-json", url: "https://example.com/reserves.json" },
      },
    };

    expect(LiveReservesConfigSchema.safeParse(valid).success).toBe(true);
    expect(LiveReservesConfigSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  });

  it("rejects invalid adapter params and input kinds", () => {
    expect(LiveReservesConfigSchema.safeParse({
      adapter: "ethena",
      version: 1,
      semantics: "collateral-mix",
      inputs: {
        primary: { kind: "http-json", url: "https://example.com/reserves.json" },
      },
      params: { unexpected: true },
    }).success).toBe(false);

    expect(LiveReservesConfigSchema.safeParse({
      adapter: "gho",
      version: 1,
      semantics: "collateral-mix",
      inputs: {
        primary: { kind: "http-json", url: "https://example.com/reserves.json" },
      },
    }).success).toBe(false);
  });
});
