import { describe, expect, it } from "vitest";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import {
  PIGEONNIER_ROOST_VISUAL_CAP,
  pigeonnierRoostLabel,
  pigeonnierWatchForWorld,
} from "./pigeonnier-watch";

describe("pigeonnier watch", () => {
  it("reuses the canonical notable-mover selection and keeps in-world ids", () => {
    const inputs = makePharosVilleWorldInput();
    const world = buildPharosVilleWorld(inputs);
    const watch = pigeonnierWatchForWorld(world, inputs.pegSummary);
    expect(world.pigeonnier.notableMovers).toEqual(watch.notableMovers);
    expect(world.pigeonnier.roost).toEqual(watch.roost);
    expect(watch.notableMovers.length).toBeLessThanOrEqual(5);
    expect(watch.notableMovers.every((mover) => mover.detailId.startsWith("ship."))).toBe(true);
  });

  it("tracks today's roost against yesterday and caps only the visual flock", () => {
    const inputs = makePharosVilleWorldInput();
    const pegSummary = {
      ...inputs.pegSummary!,
      summary: {
        ...inputs.pegSummary!.summary!,
        depegEventsToday: 19,
        depegEventsYesterday: 7,
      },
    };
    const watch = pigeonnierWatchForWorld({ ships: [] }, pegSummary);
    expect(watch.roost).toEqual({
      capped: true,
      comparison: 12,
      eventsToday: 19,
      eventsYesterday: 7,
      visualCount: PIGEONNIER_ROOST_VISUAL_CAP,
    });
    expect(pigeonnierRoostLabel(watch.roost)).toBe("19 today; 7 yesterday (12 more than yesterday)");
  });

  it("states unavailable yesterday honestly rather than inferring it", () => {
    const watch = pigeonnierWatchForWorld({ ships: [] }, null);
    expect(watch.roost.eventsYesterday).toBeNull();
    expect(pigeonnierRoostLabel({
      ...watch.roost,
      eventsToday: 2,
    })).toBe("2 today; yesterday unavailable");
  });
});
