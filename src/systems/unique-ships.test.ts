import { describe, expect, it } from "vitest";
import canonicalOrder from "@shared/data/stablecoins/canonical-order.json";
import { GARDEN_HERO_MODEL_IDS } from "../three/garden-models";
import { TITAN_SHIPS } from "./ship-visuals";
import {
  BESPOKE_HULL_OWNER,
  HERO_HULL_BY_ASSET,
  HERO_HULL_MODEL_IDS,
  heroHullModelFor,
  UNIQUE_SHIP_DEFINITIONS,
  uniqueDefinitionFor,
} from "./unique-ships";

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

describe("hero hull assignment", () => {
  const heroTierIds = [
    ...Object.keys(TITAN_SHIPS),
    ...Object.keys(UNIQUE_SHIP_DEFINITIONS),
  ];

  it("names exactly the hero hulls the model manifest ships", () => {
    expect([...HERO_HULL_MODEL_IDS]).toEqual([...GARDEN_HERO_MODEL_IDS]);
  });

  it("gives every hero-tier stablecoin an explicit hull", () => {
    for (const id of heroTierIds) {
      expect(HERO_HULL_BY_ASSET[id], id).toBeDefined();
    }
  });

  it("covers the 24 largest stablecoins with a hero hull", () => {
    const heroTier = new Set(heroTierIds);
    for (const id of (canonicalOrder as string[]).slice(0, 24)) {
      expect(heroTier.has(id), id).toBe(true);
    }
  });

  it("uses every hull, so no model is authored and never seen", () => {
    const used = new Set(heroTierIds.map((id) => heroHullModelFor(id)));
    expect([...used].sort()).toEqual([...HERO_HULL_MODEL_IDS].sort());
  });

  it("gives each bespoke titan hull to exactly one coin (N5b)", () => {
    for (const [hull, owner] of Object.entries(BESPOKE_HULL_OWNER)) {
      expect(heroHullModelFor(owner), owner).toBe(hull);
      const others = heroTierIds.filter((id) => id !== owner);
      for (const id of others) {
        expect(heroHullModelFor(id), `${id} must not sail ${hull}`).not.toBe(hull);
      }
    }
  });

  it("never hands a bespoke titan hull to an unlisted coin", () => {
    // The hash fallback must draw only from the shared pool.
    for (let index = 0; index < 400; index += 1) {
      const hull = heroHullModelFor(`unlisted-coin-${index}`);
      expect(BESPOKE_HULL_OWNER[hull], hull).toBeUndefined();
    }
  });

  it("keeps the Sky squadron on related but distinct hulls", () => {
    // DAI and USDS are a matched pair built from shared hull DNA, not clones.
    expect(heroHullModelFor("dai-makerdao")).toBe("garden-hero-maker");
    expect(heroHullModelFor("usds-sky")).toBe("garden-hero-sky");
    expect(heroHullModelFor("dai-makerdao")).not.toBe(heroHullModelFor("usds-sky"));
  });

  it("is stable: the same id always resolves to the same hull", () => {
    // The contract is that a coin never changes ship between refreshes or
    // sessions, so these are pinned literals rather than recomputed from the
    // table. A deliberate reassignment (N5(b) moved six titans onto bespoke
    // hulls) is a release-time decision and updates these pins with it; drift
    // that nobody chose is what this test exists to catch.
    expect(heroHullModelFor("usdt-tether")).toBe("garden-hero-tether");
    expect(heroHullModelFor("usdc-circle")).toBe("garden-hero-circle");
    expect(heroHullModelFor("dai-makerdao")).toBe("garden-hero-maker");
    expect(heroHullModelFor("usde-ethena")).toBe("garden-hero-ethena");
    expect(heroHullModelFor("usyc-hashnote")).toBe("garden-hero-dhow");
    expect(heroHullModelFor("bold-liquity")).toBe("garden-hero-cog");
  });

  it("keeps issuer siblings on the same hull", () => {
    for (const [parent, child] of [
      ["usdai-usd-ai", "susdai-usd-ai"],
    ]) {
      expect(heroHullModelFor(child), child).toBe(heroHullModelFor(parent));
    }
  });

  it("falls back to a deterministic hash for unlisted ids", () => {
    const first = heroHullModelFor("not-a-listed-coin");
    expect(HERO_HULL_MODEL_IDS).toContain(first);
    expect(heroHullModelFor("not-a-listed-coin")).toBe(first);
    // A different id must not silently collapse onto the same answer by
    // returning a constant.
    const others = ["alpha-issuer", "beta-issuer", "gamma-issuer", "delta-issuer"]
      .map((id) => heroHullModelFor(id));
    expect(new Set(others).size).toBeGreaterThan(1);
  });
});
