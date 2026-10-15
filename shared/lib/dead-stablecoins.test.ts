import { describe, expect, it } from "vitest";
import deadStablecoinAsset from "../data/dead-stablecoins.json";
import { DEAD_STABLECOINS } from "./dead-stablecoins";
import { parseDeadStablecoinAssets } from "./stablecoins/schema";

describe("dead-stablecoins.json", () => {
  it("passes shared/'s strict schema (the runtime only casts it)", () => {
    expect(parseDeadStablecoinAssets(deadStablecoinAsset, "shared/data/dead-stablecoins.json")).toEqual(DEAD_STABLECOINS);
  });
});
