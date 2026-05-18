import { describe, expect, it } from "vitest";
import { TITAN_SHIP_ASSET_IDS } from "./ship-visuals";
import { UNIQUE_SHIP_DEFINITIONS, UNIQUE_SPRITE_IDS, uniqueDefinitionFor } from "./unique-ships";

describe("UNIQUE_SHIP_DEFINITIONS", () => {
  const entries = Object.entries(UNIQUE_SHIP_DEFINITIONS);

  it("uses the ship.<id>-unique sprite id pattern", () => {
    const pattern = /^ship\.[a-z0-9-]+-unique$/;
    for (const [id, def] of entries) {
      expect(def.spriteAssetId, id).toMatch(pattern);
    }
  });

  it("carries non-empty rationale strings under 90 characters", () => {
    for (const [id, def] of entries) {
      expect(def.rationale.length, id).toBeGreaterThan(0);
      expect(def.rationale.length, id).toBeLessThanOrEqual(90);
    }
  });

  it("uses scales in the heritage hull range [1.20, 1.32]", () => {
    for (const [id, def] of entries) {
      expect(def.scale, id).toBeGreaterThanOrEqual(1.20);
      expect(def.scale, id).toBeLessThanOrEqual(1.32);
    }
  });

  it("has no stablecoin id overlap with the titan registry", () => {
    const titanIds = new Set(Object.keys(TITAN_SHIP_ASSET_IDS));
    for (const [id] of entries) {
      expect(titanIds.has(id), id).toBe(false);
    }
  });

  it("exposes 6 distinct sprite ids in UNIQUE_SPRITE_IDS", () => {
    expect(UNIQUE_SPRITE_IDS.size).toBe(6);
    expect(UNIQUE_SPRITE_IDS.size).toBe(entries.length);
  });
});

describe("uniqueDefinitionFor", () => {
  it("returns the matching definition for known unique ids", () => {
    expect(uniqueDefinitionFor({ id: "crvusd-curve" })).toMatchObject({
      spriteAssetId: "ship.crvusd-unique",
    });
    expect(uniqueDefinitionFor({ id: "paxg-paxos" })).toMatchObject({
      spriteAssetId: "ship.paxg-unique",
    });
  });

  it("returns null for non-unique ids", () => {
    expect(uniqueDefinitionFor({ id: "usdt-tether" })).toBeNull();
    expect(uniqueDefinitionFor({ id: "made-up" })).toBeNull();
  });
});
