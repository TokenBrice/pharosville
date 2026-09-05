import { describe, expect, it } from "vitest";
import type { PharosVilleWorld, VisualCue, VisualCueChannel } from "./world-types";
import {
  buildVisualCueRegistry,
  DECORATIVE_VISUAL_NOTES,
  LEGEND_MARK_ROWS,
} from "./visual-cue-registry";

const ALLOWED_CHANNELS = [
  "color",
  "glow",
  "motion",
  "opacity",
  "position",
  "shape",
  "size",
] as const satisfies readonly VisualCueChannel[];

function cueKey(cue: VisualCue): string {
  return cue.target.kind;
}

describe("buildVisualCueRegistry", () => {
  it("records sea-edge geography as decorative without adding a ledger cue", () => {
    expect(DECORATIVE_VISUAL_NOTES.seaEdgeGeography).toContain("carry no meaning");
    expect(DECORATIVE_VISUAL_NOTES.heroWaterfall).toContain("carry no meaning");
    expect(DECORATIVE_VISUAL_NOTES.heroWaterfall).toContain("displaces");
    expect(DECORATIVE_VISUAL_NOTES.engawaKoi).toContain("carry no meaning");
    expect(DECORATIVE_VISUAL_NOTES.engawaKoi).toContain("displace");
    expect(DECORATIVE_VISUAL_NOTES.sharedGardenWind).toContain("carry no meaning");
    expect(DECORATIVE_VISUAL_NOTES.sharedGardenWind).toContain("no new oscillator");
    expect(DECORATIVE_VISUAL_NOTES.seasonalLandmarks).toContain("carry no meaning");
    expect(DECORATIVE_VISUAL_NOTES.seasonalLandmarks).toContain("displace");
    expect(DECORATIVE_VISUAL_NOTES.landRim).toContain("carry no meaning");
    expect(DECORATIVE_VISUAL_NOTES.shakkeiSky).toContain("carry no meaning");
    expect(DECORATIVE_VISUAL_NOTES.engawaForeground).toContain("carry no meaning");
    expect(buildVisualCueRegistry().some((cue) => cue.id.includes("sea-edge"))).toBe(false);
    expect(buildVisualCueRegistry().some((cue) => cue.id.includes("waterfall"))).toBe(false);
  });

  it("documents visual cues with source and DOM equivalents", () => {
    const cues = buildVisualCueRegistry();

    expect(cues.map((cue) => cue.id)).toContain("cue.lighthouse.psi");
    expect(cues.map((cue) => cue.id)).toContain("cue.pigeonnier.notable-movers");
    expect(cues.map((cue) => cue.id)).toContain("cue.lighthouse.lamp-status");
    expect(cues.map((cue) => cue.id)).toContain("cue.lighthouse.garden-month-record");
    expect(cues.map((cue) => cue.id)).toEqual(expect.arrayContaining([
      "cue.ship.motion",
      "cue.ship.hull",
      "cue.ship.scale",
      "cue.ship.safety-watch",
      "cue.water.semantic-terrain",
    ]));
    expect(cues.find((cue) => cue.id === "cue.ship.motion")).toMatchObject({
      failureState: expect.stringContaining("reduced-motion static risk-water or Ledger Mooring idle position"),
      target: { kind: "ship" },
      primaryChannels: ["motion", "position", "opacity"],
    });
    expect(cues.find((cue) => cue.id === "cue.ship.safety-watch")).toMatchObject({
      failureState: "no watch overlay; detail row absent for NR or missing report cards",
      target: { kind: "ship" },
      primaryChannels: ["shape", "color"],
      sourceField: "reportCards.cards[].overallGrade (D/F), reportCards.cards[].dimensions",
    });
    expect(cues.every((cue) => cue.sourceField && cue.domEquivalent && cue.failureState && cue.reducedMotionEquivalent)).toBe(true);
  });

  it("registers the observatory signal mast against the fleet-wide peg summary", () => {
    const cue = buildVisualCueRegistry().find((entry) => entry.id === "cue.lighthouse.signal-mast");

    expect(cue).toMatchObject({
      target: { kind: "lighthouse" },
      primaryChannels: ["shape", "size"],
      sourceField: "pegSummary.summary.activeDepegCount, pegSummary.summary.worstCurrent",
    });
    // Tone contract: the hoist reports, it does not alarm. No cue copy here
    // may reach for emergency language.
    expect(`${cue?.visual} ${cue?.questionAnswered}`).not.toMatch(/\b(alert|alarm|urgent|critical|emergency)\b/i);
  });

  it("registers bounded leg/rest cadence with route-presence caveats", () => {
    const cue = buildVisualCueRegistry().find((entry) => entry.id === "cue.ship.motion");

    expect(cue?.visual).toContain("90–180 second logical legs");
    expect(cue?.visual).toContain("240–480 second rests");
    expect(cue?.visual).toContain("paired arrivals and departures");
    expect(cue?.visual).toContain("risk order");
    expect(cue?.domEquivalent).toContain("rendered-chain/risk presence only");
    expect(`${cue?.visual} ${cue?.domEquivalent}`).not.toMatch(/mooring orbit|chain-breadth dwell|extended dwell/i);
  });

  it("registers seven cedar boundary boards with ledger redundancy", () => {
    const cue = buildVisualCueRegistry().find((entry) => entry.id === "cue.water.semantic-terrain");

    expect(cue?.visual).toContain("seven low cedar boundary boards");
    expect(cue?.visual).toContain("Wreck Shoal");
    expect(cue?.visual).toContain("hovered or inspected");
    expect(cue?.failureState).toContain("authoritative water field retains classification");
    expect(cue?.domEquivalent).toContain("ledger is the redundant channel");
    expect(`${cue?.visual} ${cue?.reducedMotionEquivalent}`).not.toContain("printed");
  });

  it("registers wreck silhouette-to-cause lifecycle semantics", () => {
    const cue = buildVisualCueRegistry().find((entry) => entry.id === "cue.grave.lifecycle");

    expect(cue?.visual).toContain("substantial hull");
    expect(cue?.visual).toContain("broken keel");
    expect(cue?.visual).toContain("bare remains");
    expect(cue?.visual).toContain("cause colour");
    expect(cue?.domEquivalent).toContain("Wreck silhouette");
    expect(cue?.domEquivalent).toContain("cause-colour swatch legend");
  });

  it("documents all six hull-family silhouettes and their complete classification source", () => {
    const cue = buildVisualCueRegistry().find((entry) => entry.id === "cue.ship.hull");

    for (const family of ["bezaisen", "kobaya", "paired-hull", "takasebune", "junk", "scow"]) {
      expect(cue?.visual).toContain(family);
    }
    expect(cue?.sourceField).toContain("governance");
    expect(cue?.sourceField).toContain("backing");
    expect(cue?.sourceField).toContain("yieldBearing");
    expect(cue?.sourceField).toContain("pegCurrency");
    expect(cue?.domEquivalent).toContain("accessibility-ledger");
  });

  it("registers the per-ship issuance workset with complete parity", () => {
    expect(buildVisualCueRegistry().find((entry) => entry.id === "cue.ship.issuance-work")).toMatchObject({
      target: { kind: "ship" },
      primaryChannels: ["position", "shape", "motion"],
      sourceField: expect.stringContaining("largestEvent24h"),
      failureState: expect.stringContaining("neutral issuance draft"),
      reducedMotionEquivalent: expect.stringContaining("static representative composition"),
    });
  });

  it("registers static report-card fittings with complete parity", () => {
    expect(buildVisualCueRegistry().find((entry) => entry.id === "cue.ship.seaworthiness-fittings")).toMatchObject({
      target: { kind: "ship" },
      primaryChannels: ["shape", "position"],
      sourceField: expect.stringContaining("redemptionImmediateCapacityRatio"),
      failureState: expect.stringContaining("no corresponding fitting"),
      reducedMotionEquivalent: expect.stringContaining("static fittings"),
    });
  });

  it("keeps age patina separate from risk-water streaking and honest when unavailable", () => {
    const cue = buildVisualCueRegistry().find((entry) => entry.id === "cue.ship.age-patina");

    expect(cue).toMatchObject({
      target: { kind: "ship" },
      primaryChannels: ["color", "shape"],
      sourceField: expect.stringContaining("trackingSpanDays"),
      failureState: expect.stringContaining("neutral original hull finish"),
    });
    expect(cue?.visual).toContain("sail cloth and issuer hue are untouched");
    expect(cue?.visual).toContain("no bands or streaks");
    expect(cue?.domEquivalent).toContain("accessibility-ledger age-patina clause");
  });

  it("does not expose removed data-building cue targets", () => {
    const cues = buildVisualCueRegistry();
    expect(cues.map((cue) => cue.id).filter((id) => id.startsWith("cue.building."))).toEqual([]);
    expect(cues).toContainEqual(expect.objectContaining({ target: { kind: "area" } }));
  });

  it("retires the deleted L2-precinct scenery instead of rewording it", () => {
    // boathouse-precinct, annex-pavilion, salvage-slip, signal-jetty and
    // gate-landing are deleted archetypes; ethereum-precinct and the annex
    // coves are retired with them. No cue may promise a structure the world
    // cannot draw — most of all in reduced motion, which is a complete
    // static composition.
    const retired = /boathouse[- ]precinct|\bannex|covered bridge|bridge lantern|salvage-slip|signal-jetty|gate-landing|ethereum-precinct|wreck-salvage-cut|wreck-west-ledge/i;
    const cueCopy = buildVisualCueRegistry().map((cue) =>
      `${cue.visual} ${cue.questionAnswered} ${cue.failureState} ${cue.domEquivalent} ${cue.reducedMotionEquivalent}`,
    );
    const legendCopy = LEGEND_MARK_ROWS.map((row) => row.text);
    const decorativeCopy = Object.values(DECORATIVE_VISUAL_NOTES);

    for (const copy of [...cueCopy, ...legendCopy, ...decorativeCopy]) {
      expect(copy).not.toMatch(retired);
    }
  });

  it("cues the standalone Ethereum Mole monument and its enclosed basin", () => {
    const cues = buildVisualCueRegistry();
    const monument = cues.find((cue) => cue.id === "cue.dock.mole-monument");
    const basin = cues.find((cue) => cue.id === "cue.dock.mole-basin");

    expect(monument).toMatchObject({
      target: { kind: "dock" },
      primaryChannels: ["shape", "size", "position"],
    });
    expect(monument?.visual).toContain("stone mole");
    expect(monument?.visual).toContain("offset campanile");
    expect(monument?.visual).toContain("stands alone");
    // The monument is authored, never inherited: a feed without ethereum
    // leaves the cove empty instead of promoting another harbor.
    expect(monument?.failureState).toContain("absent rather than handed to whichever harbor ranks first");
    expect(basin).toMatchObject({
      target: { kind: "dock" },
      primaryChannels: ["shape", "motion"],
    });
    expect(basin?.visual).toContain("water void");
    expect(basin?.visual).toContain("still");
    expect(basin?.visual).toContain("every other harbor keeps its own ripple");
    expect(basin?.failureState).toContain("explicitly cleared rather than moved onto whichever harbor ranks first");
  });

  it("covers world node kinds", () => {
    const cues = buildVisualCueRegistry();
    const targetKeys = new Set(cues.map(cueKey));
    const coveredWorldFields = {
      areas: targetKeys.has("area"),
      docks: targetKeys.has("dock"),
      graves: targetKeys.has("grave"),
      lighthouse: targetKeys.has("lighthouse"),
      pigeonnier: targetKeys.has("pigeonnier"),
      ships: targetKeys.has("ship"),
    } as const satisfies Partial<Record<keyof PharosVilleWorld, boolean>>;

    expect(coveredWorldFields).toEqual({
      areas: true,
      docks: true,
      graves: true,
      lighthouse: true,
      pigeonnier: true,
      ships: true,
    });
  });

  it("requires source, question, failure, DOM parity, target, and non-color-only channels", () => {
    const cues = buildVisualCueRegistry();
    const allowed = new Set<VisualCueChannel>(ALLOWED_CHANNELS);

    expect(cues).not.toHaveLength(0);
    for (const cue of cues) {
      expect(cue.sourceField.trim()).not.toBe("");
      expect(cue.questionAnswered.trim()).not.toBe("");
      expect(cue.failureState.trim()).not.toBe("");
      expect(cue.domEquivalent.trim()).not.toBe("");
      expect(cue.reducedMotionEquivalent.trim()).not.toBe("");
      expect(cue.target.kind).toBeTruthy();
      expect(cue.primaryChannels.length).toBeGreaterThan(0);
      expect(cue.primaryChannels.every((channel) => allowed.has(channel))).toBe(true);
      expect(cue.primaryChannels).not.toEqual(["color"]);
    }
  });

  it("requires motion cues to document reduced-motion equivalents", () => {
    const motionCues = buildVisualCueRegistry().filter((cue) => cue.primaryChannels.includes("motion"));

    expect(motionCues).not.toHaveLength(0);
    for (const cue of motionCues) {
      expect(cue.reducedMotionEquivalent).toMatch(/static|without RAF|frozen|representative/i);
    }
  });

  it("keeps legend mark rows one-to-one with registered click-only cues", () => {
    const cues = buildVisualCueRegistry();
    const cueIds = new Set(cues.map((cue) => cue.id));
    const markCueIds = LEGEND_MARK_ROWS.map((row) => row.cueId);

    expect(markCueIds).toEqual([
      "cue.pigeonnier.notable-movers",
      "cue.world.epistemic-haze",
      "cue.ship.age-patina",
      "cue.ship.zone-weathering",
      "cue.ship.issuance-work",
      "cue.ship.seaworthiness-fittings",
      "cue.dock.congestion",
      "cue.dock.cargo-tide",
      "cue.fleet.flight-to-quality",
      "cue.lighthouse.signal-mast",
      "cue.world.supply-tide",
      "cue.lighthouse.high-water-mark",
      "cue.lighthouse.garden-month-record",
      "cue.lighthouse.lamp-status",
      "cue.ship.cross-bearing-buoy",
      "cue.ship.peg-trim",
      "cue.ship.audit-shield",
      "cue.ship.nav-signal",
      "cue.ship.yield-signal",
    ]);
    expect(new Set(markCueIds).size).toBe(markCueIds.length);
    for (const cueId of markCueIds) {
      expect(cueIds.has(cueId)).toBe(true);
    }
  });

  it("describes physical timber signs and their serif lettering", () => {
    const cue = buildVisualCueRegistry().find((entry) => entry.id === "cue.water.semantic-terrain");

    expect(cue?.visual).toContain("paired pilings");
    expect(cue?.visual).toContain("mixed-case serif lettering");
  });

});
