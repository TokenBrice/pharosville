import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import { AccessibilityLedger } from "../components/accessibility-ledger";
import { buildPharosVilleWorld } from "./pharosville-world";
import { RISK_SURFACE_SIGNATURES } from "./garden-sea-regions";
import { deriveReadingKey, READING_EXEMPLAR_IDS, READING_RISK_BODIES } from "./reading-key";

import cropManifest from "../../agents/2026-10-05-garden-levers/destination/reading-atlas-crops.json";
function keyWorld() {
  return buildPharosVilleWorld(makePharosVilleWorldInput());
}

describe("live reading key", () => {
  it("quotes official PSI, own evidence and observation rather than receipt time", () => {
    const world = keyWorld();
    world.generatedAt = 1_800_000_000_000;
    world.lighthouse.evidence.stability = {
      ...world.freshness.stability, state: "stale", observedAt: 1_700_000_000_000,
      publishedAt: 1_700_000_020_000, methodologyVersion: "fixture-psi", reason: "held upstream reading",
    };
    const key = deriveReadingKey(world);
    expect(key.lighthouse.description).toContain(`Official PSI ${world.lighthouse.score}`);
    expect(key.lighthouse.description).toContain(world.lighthouse.psiBand);
    expect(key.observedAt).toBe(1_700_000_000_000);
    expect(key.lighthouseEvidence).toContain("held");
    expect(key.lighthouseEvidence).toContain("2023-11-14T22:13:20.000Z");
    expect(key.lighthouseEvidence).toContain("fixture-psi");
    expect(key.lighthouseEvidence).toContain("held upstream reading");
    expect(key.lighthouseEvidence).not.toContain(new Date(world.generatedAt).toISOString());
  });

  it("keeps missing PSI and observation unknown instead of claiming a calm current state", () => {
    const world = keyWorld();
    world.lighthouse.unavailable = true;
    world.lighthouse.evidence.stability = { ...world.freshness.stability, state: "unavailable", observedAt: null, publishedAt: null };
    const key = deriveReadingKey(world);
    expect(key.lighthouse.description).toBe("Official PSI unavailable");
    expect(key.lighthouse.exemplarId).toBeNull();
    expect(key.observedAt).toBeNull();
    expect(key.lighthouseEvidence).toContain("observed unknown");
  });

  it("orders exactly five canonical surfaces and keeps both non-risk waters separate", () => {
    const world = keyWorld();
    const key = deriveReadingKey(world);
    expect(key.waters.map((entry) => entry.id)).toEqual(READING_RISK_BODIES.map((body) => `water.${body}`));
    expect(key.waters.map((entry) => entry.label)).toEqual(READING_RISK_BODIES.map((body) => RISK_SURFACE_SIGNATURES[body].label));
    expect(key.nonRiskWaters.map((entry) => entry.id)).toEqual(["water.ledger", "water.wreck"]);
    expect(key.nonRiskWaters.every((entry) => entry.description.includes("not a risk band"))).toBe(true);
    const ledger = renderToStaticMarkup(createElement(AccessibilityLedger, { world }));
    for (const entry of [...key.waters, ...key.nonRiskWaters]) {
      expect(entry.detailId).not.toBeNull();
      expect(world.detailIndex[entry.detailId!].title).toBe(entry.label);
      expect(ledger).toContain(entry.label);
      expect(READING_EXEMPLAR_IDS).toContain(entry.exemplarId);
    }
  });

  it("names the three leaders by actual supply, not tied compressed hull size", () => {
    const world = keyWorld();
    const first = world.ships[0]!, second = world.ships[1]!;
    world.ships = [{ ...first, marketCapUsd: 5e10 }, { ...second, marketCapUsd: 1e11 }, { ...first, id: "third", detailId: "ship.third", label: "Third", marketCapUsd: 2e10 }];
    const before = world.ships.map((ship) => ship.id);
    const key = deriveReadingKey(world);
    expect(key.leaders.map((entry) => entry.detailId)).toEqual([second.detailId, first.detailId, "ship.third"]);
    expect(key.leaders.map((entry) => entry.label.slice(0, 2))).toEqual(["#1", "#2", "#3"]);
    expect(key.scaleCaveat).toContain("qualitative, not proportional");
    expect(world.ships.map((ship) => ship.id)).toEqual(before);
  });

  it("uses deterministic identity ties and excludes non-finite or unknown supply", () => {
    const world = keyWorld();
    const ship = world.ships[0]!;
    world.ships = [
      { ...ship, id: "z", detailId: "ship.z", marketCapUsd: 10 },
      { ...ship, id: "a", detailId: "ship.a", marketCapUsd: 10 },
      { ...ship, id: "bad", marketCapUsd: Number.NaN },
      { ...ship, id: "none", marketCapUsd: 0 },
    ];
    expect(deriveReadingKey(world).leaders.map((entry) => entry.detailId)).toEqual(["ship.a", "ship.z"]);
  });

  it("qualifies held supply without replacing the independent lighthouse reading", () => {
    const world = keyWorld();
    world.freshness.stablecoins = { ...world.freshness.stablecoins, state: "stale", reason: "supply refresh failed" };
    const key = deriveReadingKey(world);
    expect(key.supplyEvidence).toContain("held");
    expect(key.supplyEvidence).toContain("supply refresh failed");
    expect(key.lighthouse.description).toContain("Official PSI");
    expect(key.leaders.length).toBeGreaterThan(0);
  });
});

describe("reading exemplar publication contract", () => {
  it("reserves every key id, including the conditional cloud slot, without faking missing states", () => {
    expect(cropManifest.slots.map((slot) => slot.id)).toEqual(READING_EXEMPLAR_IDS);
    expect(cropManifest.slots.find((slot) => slot.id === "cloud")?.file).toBeNull();
    const lighthouse = cropManifest.slots.filter((slot) => slot.id.startsWith("lighthouse.") && slot.file);
    expect(lighthouse.map((slot) => slot.id)).toEqual(["lighthouse.STEADY", "lighthouse.CRISIS"]);
    for (const slot of cropManifest.slots.filter((entry) => entry.file)) {
      expect(slot.file).toMatch(/-burst-00\.png$/);
      expect(slot.capture).toContain("outputs/cap.sh");
      expect(slot.capture).toContain("--burst 1 --clip");
    }
  });
});
