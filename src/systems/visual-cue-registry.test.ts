import { describe, expect, it } from "vitest";
import type { PharosVilleWorld, VisualCue, VisualCueChannel } from "./world-types";
import { buildVisualCueRegistry, LEGEND_MARK_ROWS } from "./visual-cue-registry";

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
  it("documents visual cues with source and DOM equivalents", () => {
    const cues = buildVisualCueRegistry();

    expect(cues.map((cue) => cue.id)).toContain("cue.lighthouse.psi");
    expect(cues.map((cue) => cue.id)).toEqual(expect.arrayContaining([
      "cue.ship.motion",
      "cue.ship.hull",
      "cue.ship.scale",
      "cue.ship.safety-watch",
      "cue.water.semantic-terrain",
    ]));
    expect(cues.find((cue) => cue.id === "cue.ship.motion")).toMatchObject({
      failureState: "reduced-motion static risk-water idle position with evidence caveat",
      target: { kind: "ship" },
      primaryChannels: ["motion", "position", "opacity"],
    });
    expect(cues.find((cue) => cue.id === "cue.ship.safety-watch")).toMatchObject({
      failureState: "no watch overlay; detail row absent for NR or missing report cards",
      target: { kind: "ship" },
      primaryChannels: ["shape", "color"],
      sourceField: "reportCards.cards[].overallGrade (D/F)",
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

  it("does not expose removed data-building cue targets", () => {
    const cues = buildVisualCueRegistry();
    expect(cues.map((cue) => cue.id).filter((id) => id.startsWith("cue.building."))).toEqual([]);
    expect(cues).toContainEqual(expect.objectContaining({ target: { kind: "area" } }));
  });

  it("covers world node kinds", () => {
    const cues = buildVisualCueRegistry();
    const targetKeys = new Set(cues.map(cueKey));
    const coveredWorldFields = {
      areas: targetKeys.has("area"),
      docks: targetKeys.has("dock"),
      graves: targetKeys.has("grave"),
      lighthouse: targetKeys.has("lighthouse"),
      ships: targetKeys.has("ship"),
    } as const satisfies Partial<Record<keyof PharosVilleWorld, boolean>>;

    expect(coveredWorldFields).toEqual({
      areas: true,
      docks: true,
      graves: true,
      lighthouse: true,
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
      "cue.ship.zone-weathering",
      "cue.dock.congestion",
      "cue.dock.cargo-tide",
      "cue.fleet.flight-to-quality",
      "cue.lighthouse.signal-mast",
      "cue.world.supply-tide",
      "cue.lighthouse.high-water-mark",
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

  it("describes area cues as printed cartographic labels instead of signs or posts", () => {
    const areaCues = buildVisualCueRegistry().filter((cue) => cue.target.kind === "area");

    expect(areaCues.map((cue) => cue.visual)).toEqual(expect.arrayContaining([
      expect.stringContaining("printed cartographic"),
    ]));
    for (const cue of areaCues) {
      expect(cue.visual).not.toMatch(/\b(sign|post|board|badge)\b/i);
    }
  });

});
