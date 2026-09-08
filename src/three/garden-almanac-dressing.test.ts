import { Mesh } from "three";
import { describe, expect, it } from "vitest";
import { createGardenDirector } from "../systems/garden-director";
import { gardenAlmanacEventForDate } from "../systems/garden-almanac";
import { createGardenAlmanacDressing, GARDEN_ALMANAC_FADE_SECONDS, GARDEN_HERON_PERCH_WORLD } from "./garden-almanac-dressing";
import { createGardenRimMesh } from "./garden-rim-mesh";

const rim = createGardenRimMesh();
const pathGeometry = (rim.root.getObjectByName("garden-rim-path") as Mesh).geometry;
const options = { pathGeometry, pathSegmentCount: rim.pathSegmentCount };
const frame = { activeEvent: null, deltaSeconds: 1, reducedMotion: false, timeSeconds: 0, hour: 18.5 };

describe("garden almanac dressing", () => {
  it("walks the actual uninterrupted ribbon for a three-minute admitted evening beat, then reverses at dawn", () => {
    const dressing = createGardenAlmanacDressing(options);
    const director = createGardenDirector("keeper-test");
    dressing.update({ ...frame, director });
    expect(director.active?.kind).toBe("keeper");
    expect(director.active?.foreground).toBe(false);
    expect(dressing.keeper.position.distanceTo(dressing.keeperPath[0]!)).toBeLessThan(0.001);
    dressing.update({ ...frame, director, timeSeconds: 90 });
    expect(dressing.keeperRitual.progress).toBe(0.5);
    expect(dressing.keeper.visible).toBe(true);
    const middle = dressing.keeper.position.clone();
    dressing.update({ ...frame, director, timeSeconds: 180 });
    expect(dressing.keeper.visible).toBe(false);
    expect(director.log).toHaveLength(1);
    dressing.update({ ...frame, director, hour: 5, timeSeconds: 1000 });
    expect(dressing.keeperRitual.direction).toBe("dawn");
    expect(dressing.keeper.position.distanceTo(dressing.keeperPath.at(-1)!)).toBeLessThan(0.001);
    dressing.update({ ...frame, director, hour: 5, timeSeconds: 1090 });
    expect(dressing.keeper.position.distanceTo(middle)).toBeLessThan(0.001);
    const tris = dressing.keeper.geometry.index!.count / 3;
    expect(tris).toBeLessThanOrEqual(60);
  });

  it("parks at the same mid-path pose without requesting beats under reduced motion", () => {
    const dressing = createGardenAlmanacDressing(options);
    const director = createGardenDirector("static");
    dressing.update({ ...frame, director, reducedMotion: true });
    const position = dressing.keeper.position.clone();
    dressing.update({ ...frame, director, reducedMotion: true, timeSeconds: 4000, hour: 5 });
    expect(dressing.keeper.position.equals(position)).toBe(true);
    expect(dressing.keeper.visible).toBe(true);
    expect(dressing.keeperRitual.active).toBe(false);
    expect(director.log).toHaveLength(0);
  });

  it("leaves a refused or preempted keeper off stage", () => {
    const dressing = createGardenAlmanacDressing(options);
    const director = createGardenDirector("busy");
    director.active = { id: "market", kind: "market", foreground: true, priority: 100, durationSeconds: 600, startSeconds: 0 };
    dressing.update({ ...frame, director });
    expect(dressing.keeper.visible).toBe(false);
  });

  it("retains the quiet heron sighting", () => {
    const dressing = createGardenAlmanacDressing();
    let heron = gardenAlmanacEventForDate(new Date(Date.UTC(2026, 7, 1)));
    for (let day = 2; heron.id !== "heron-dusk" && day <= 31; day += 1) {
      heron = gardenAlmanacEventForDate(new Date(Date.UTC(2026, 7, day)));
    }
    dressing.update({ ...frame, activeEvent: heron, deltaSeconds: GARDEN_ALMANAC_FADE_SECONDS });
    expect(dressing.heron.visible).toBe(true);
    expect(dressing.heron.position.x).toBe(GARDEN_HERON_PERCH_WORLD.x);
    expect(dressing.meteor.visible).toBe(false);
  });
});
