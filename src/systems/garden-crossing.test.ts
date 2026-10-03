import { makeSourceStatuses } from "@/__fixtures__/pharosville-world";
import { afterEach, describe, expect, it } from "vitest";
import { denseFixtureChains, denseFixturePegSummary, denseFixtureSafetyGrades, denseFixtureStablecoins, denseFixtureStress, fixtureStability } from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import { buildBaseMotionPlan, resolveShipMotionSample } from "./motion";
import { __resetForcedInletCrossings, forceInletCrossing, inletCrossingTokensBetween } from "./motion-planning";
import { isGardenInletCoreTile } from "./garden-inlet";
import { createGardenDirector } from "./garden-director";
import { createGardenCrossingCeremonyState, stepGardenCrossingCeremony, type GardenCrossingCeremonyStep, type GardenCrossingSubject } from "./garden-crossing";
import type { PharosVilleMotionPlan } from "./motion-types";
import type { InletCrossingToken } from "./motion-planning";

const denseWorld = buildPharosVilleWorld({
  stablecoins: denseFixtureStablecoins,
  chains: denseFixtureChains,
  stability: fixtureStability,
  pegSummary: denseFixturePegSummary,
  stress: denseFixtureStress,
  safetyGrades: denseFixtureSafetyGrades,
  cemeteryEntries: [],
  freshness: makeSourceStatuses(),
});
/**
 * Only the ceremony subjects (unsquadded titan/heritage hulls with a harbour):
 * the real map, docks and routes, without routing the whole fleet's A* legs,
 * which no crossing contract reads.
 */
const world = {
  ...denseWorld,
  ships: denseWorld.ships.filter((ship) => (
    !ship.squadId && ship.dockVisits.length > 0 && (ship.visual.sizeTier === "titan" || ship.visual.sizeTier === "unique")
  )),
};

/** The first clock (from 0, in 10 s steps) at which a subject can be sent across. */
function forceAtFirstChance(plan: PharosVilleMotionPlan): { token: InletCrossingToken; at: number } {
  for (let at = 0; at < 7_200; at += 10) {
    const token = forceInletCrossing(plan, world, at);
    if (token) return { token, at };
  }
  throw new Error("no crossing subject could be forced in two hours");
}

afterEach(() => __resetForcedInletCrossings());

describe("W5.5 forced crossing", () => {
  it("sends one subject from its anchorage through the inlet to its berth, without a jump at either end", () => {
    const plan = buildBaseMotionPlan(world, 0);
    const { token, at } = forceAtFirstChance(plan);
    const ship = world.ships.find((entry) => entry.id === token.shipId)!;
    const before = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: at - 0.5 });
    expect(before.state).toBe("risk-drift");

    let previous = before.tile;
    let crossedCore = false;
    let maxStep = 0;
    for (let seconds = at; seconds <= token.endSeconds + 30; seconds += 0.5) {
      const sample = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: seconds });
      if (isGardenInletCoreTile(Math.round(sample.tile.x), Math.round(sample.tile.y))) crossedCore = true;
      maxStep = Math.max(maxStep, Math.hypot(sample.tile.x - previous.x, sample.tile.y - previous.y));
      previous = sample.tile;
    }
    expect(crossedCore).toBe(true);
    // Half a second at a brisk pace, plus the rode's reach when she weighs.
    expect(maxStep).toBeLessThan(0.9);
    const berthed = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: token.endSeconds + 30 });
    expect(berthed.state).toBe("moored");
    expect(berthed.currentDockId).toBe(token.dockId);

    // A plan rebuilt mid-crossing (the 600 s bucket flip) keeps the voyage.
    const rebuilt = buildBaseMotionPlan(world, at + 1);
    const mid = (at + token.endSeconds) / 2;
    const original = resolveShipMotionSample({ plan, reducedMotion: false, ship, timeSeconds: mid });
    const after = resolveShipMotionSample({ plan: rebuilt, reducedMotion: false, ship, timeSeconds: mid });
    expect(after.tile.x).toBeCloseTo(original.tile.x, 6);
    expect(after.tile.y).toBeCloseTo(original.tile.y, 6);
  });
});

describe("W5.5 crossing ceremony", () => {
  const subject = (shipId: string, dockId: string): GardenCrossingSubject => ({
    assetName: shipId,
    detailId: `ship.${shipId}`,
    harbourName: dockId,
    supplyTrend: null,
  });

  it("waits for the current frame, then gives the one caption and nameplate, and a fender at the berth", () => {
    const plan = buildBaseMotionPlan(world, 0);
    const { token } = forceAtFirstChance(plan);
    expect(inletCrossingTokensBetween(plan, token.startSeconds, token.endSeconds).some((entry) => entry.shipId === token.shipId)).toBe(true);
    const state = createGardenCrossingCeremonyState();
    const director = createGardenDirector("crossing");
    let inFrame = false;
    const steps: { at: number; step: GardenCrossingCeremonyStep }[] = [];
    for (let seconds = token.startSeconds; seconds <= token.endSeconds + 5; seconds += 1) {
      // The visitor looks away for the first two thirds of the voyage.
      inFrame = seconds - token.startSeconds > (token.endSeconds - token.startSeconds) * 0.66;
      const step = stepGardenCrossingCeremony(state, {
        director,
        inFrame: () => inFrame,
        motionTimeSeconds: seconds,
        plan,
        subject,
        wallTimeSeconds: 10_000 + seconds,
      });
      if (step) steps.push({ at: seconds, step });
    }
    const announced = steps.filter(({ step }) => step.caption !== null);
    expect(announced).toHaveLength(1);
    const { at, step } = announced[0]!;
    expect(at - token.startSeconds).toBeGreaterThan((token.endSeconds - token.startSeconds) * 0.66);
    expect(at).toBeLessThan(token.endSeconds);
    expect(step.caption!.text).toBe(`${token.shipId} arrives at ${token.dockId}`);
    expect(step.nameplate!.detailId).toBe(`ship.${token.shipId}`);
    expect(step.sounds).toEqual(["arrival-luff"]);
    expect(steps.filter(({ step: entry }) => entry.nameplate !== null)).toHaveLength(1);
    expect(steps.flatMap(({ step: entry }) => entry.sounds).filter((sound) => sound === "fender")).toHaveLength(1);
  });

  it("stays silent when the ship never enters the frame", () => {
    const plan = buildBaseMotionPlan(world, 0);
    const { token } = forceAtFirstChance(plan);
    const state = createGardenCrossingCeremonyState();
    const director = createGardenDirector("crossing-away");
    for (let seconds = token.startSeconds; seconds <= token.endSeconds + 5; seconds += 1) {
      expect(stepGardenCrossingCeremony(state, {
        director,
        inFrame: () => false,
        motionTimeSeconds: seconds,
        plan,
        subject,
        wallTimeSeconds: 10_000 + seconds,
      })).toBeNull();
    }
  });
});
