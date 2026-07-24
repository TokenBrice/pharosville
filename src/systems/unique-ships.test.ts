import { describe, expect, it } from "vitest";
import { TITAN_SHIPS } from "./ship-visuals";
import { UNIQUE_SHIP_DEFINITIONS, uniqueDefinitionFor } from "./unique-ships";

describe("UNIQUE_SHIP_DEFINITIONS", () => {
  const entries = Object.entries(UNIQUE_SHIP_DEFINITIONS);

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
    const titanIds = new Set(Object.keys(TITAN_SHIPS));
    for (const [id] of entries) {
      expect(titanIds.has(id), id).toBe(false);
    }
  });
});

describe("uniqueDefinitionFor", () => {
  it("returns the matching definition for known unique ids", () => {
    expect(uniqueDefinitionFor({ id: "crvusd-curve" })).toBe(UNIQUE_SHIP_DEFINITIONS["crvusd-curve"]);
    expect(uniqueDefinitionFor({ id: "paxg-paxos" })).toBe(UNIQUE_SHIP_DEFINITIONS["paxg-paxos"]);
  });

  it("returns null for non-unique ids", () => {
    expect(uniqueDefinitionFor({ id: "usdt-tether" })).toBeNull();
    expect(uniqueDefinitionFor({ id: "made-up" })).toBeNull();
  });
});
