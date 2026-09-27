import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { setGardenDayScore } from "../systems/garden-score";
import { weatherForFrame } from "../systems/weather";
import {
  createGardenSeasonalDressing,
  GARDEN_SPRING_PETAL_COUNT,
} from "./garden-seasonal-dressing";
import { GARDEN_ENGAWA_KOI_WORLD } from "./garden-koi";

const NORTH = { latitudeRad: (35 * Math.PI) / 180, southern: false };
const SOUTH = { latitudeRad: -(35 * Math.PI) / 180, southern: true };
const BLOSSOM = new Date("2026-04-05T12:00:00Z");

describe("garden seasonal dressing", () => {
  const weather = weatherForFrame({ baseWind: 0.4, psiStress: 0.2, timeSeconds: 12 });
  const spring = () => createGardenSeasonalDressing(BLOSSOM, NORTH);

  it("lays a sparse petal drift only while the lee cherry flowers", () => {
    expect(GARDEN_SPRING_PETAL_COUNT).toBeLessThanOrEqual(64);
    const count = spring().petals?.count ?? 0;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(GARDEN_SPRING_PETAL_COUNT);
    // The rest of spring is not the blossom: the UTC quarter no longer decides.
    for (const iso of ["2026-03-02", "2026-05-20", "2026-07-01", "2026-10-12", "2026-12-12"]) {
      expect(createGardenSeasonalDressing(new Date(`${iso}T12:00:00Z`), NORTH).petals, iso).toBeNull();
    }
    // Half a year on in the southern hemisphere.
    expect(createGardenSeasonalDressing(BLOSSOM, SOUTH).petals).toBeNull();
    expect(createGardenSeasonalDressing(new Date("2026-10-07T12:00:00Z"), SOUTH).petals).not.toBeNull();
  });

  it("is deterministic and resolves reduced motion to one time-zero pose", () => {
    const dressing = spring();
    dressing.update({ reducedMotion: true, timeSeconds: 12, weather });
    const first = matrixAt(dressing, 0);
    dressing.update({ reducedMotion: true, timeSeconds: 900, weather });
    expect(matrixAt(dressing, 0)).toEqual(first);
    const position = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(first));
    expect(Math.hypot(
      position.x - GARDEN_ENGAWA_KOI_WORLD.x,
      position.z - GARDEN_ENGAWA_KOI_WORLD.z,
    )).toBeLessThan(6);
  });

  it("advects animated petals on the shared wind clock", () => {
    const dressing = spring();
    dressing.update({ reducedMotion: false, timeSeconds: 1, weather });
    const first = matrixAt(dressing, 0);
    dressing.update({ reducedMotion: false, timeSeconds: 8, weather });
    expect(matrixAt(dressing, 0)).not.toEqual(first);
  });
});

describe("one tree lets go", () => {
  const weather = weatherForFrame({ baseWind: 0.4, psiStress: 0.2, timeSeconds: 12 });
  const tree = () => ({ anchor: new Vector3(100, 8, 118), crown: { value: 0.45 } });

  it("walks the maple's crown to bare and lets its leaves down onto the water toward the seat", () => {
    const dressing = createGardenSeasonalDressing(new Date("2026-12-07T12:00:00Z"), NORTH);
    const maple = tree();
    dressing.setLetsGoTree(maple);
    dressing.update({ reducedMotion: false, timeSeconds: 0, weather });
    expect(dressing.letsGoLeaves.visible).toBe(false);
    dressing.letsGoRitual.start(1000);
    const crowns: number[] = [];
    let done = false;
    for (let t = 1000; t <= 1200 && !done; t += 5) {
      done = dressing.letsGoRitual.update(t, 5);
      dressing.update({ reducedMotion: false, timeSeconds: t, weather });
      crowns.push(maple.crown.value);
    }
    expect(done).toBe(true);
    // Monotonic, from what the day left down to bare, over minutes not seconds.
    expect(crowns.every((crown, index) => index === 0 || crown <= crowns[index - 1]!)).toBe(true);
    expect(crowns[1]).toBeGreaterThan(0.3);
    expect(maple.crown.value).toBe(0);
    expect(dressing.letsGoLeaves.visible).toBe(true);
    // Every leaf lies on the water, nearer the seat than the tree.
    const matrix = new Matrix4();
    for (let index = 0; index < dressing.letsGoLeaves.count; index += 1) {
      dressing.letsGoLeaves.getMatrixAt(index, matrix);
      const leaf = new Vector3().setFromMatrixPosition(matrix);
      expect(leaf.y).toBeLessThan(0.1);
      expect(leaf.z).toBeGreaterThan(maple.anchor.z);
    }
  });

  it("keeps what has gone when cancelled or when the island is rebuilt, and draws nothing before", () => {
    const dressing = createGardenSeasonalDressing(new Date("2026-12-07T12:00:00Z"), NORTH);
    const maple = tree();
    dressing.setLetsGoTree(maple);
    dressing.update({ reducedMotion: true, timeSeconds: 5, weather });
    expect(dressing.letsGoLeaves.visible).toBe(false);
    expect(maple.crown.value).toBe(0.45);
    dressing.letsGoRitual.start(0);
    dressing.letsGoRitual.update(70, 1);
    const half = maple.crown.value;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.45);
    dressing.letsGoRitual.cancel();
    const rebuilt = tree();
    dressing.setLetsGoTree(rebuilt);
    expect(rebuilt.crown.value).toBeCloseTo(half, 6);
  });
});

describe("early-summer fireflies", () => {
  const JUNE = new Date("2026-06-12T12:00:00Z");

  it("come only in their kō, rise with their ritual and stay out once it has passed", () => {
    expect(createGardenSeasonalDressing(new Date("2026-09-26T12:00:00Z"), NORTH).fireflyPresence(22)).toBe(0);
    const dressing = createGardenSeasonalDressing(JUNE, NORTH);
    expect(dressing.visitor).toBe("fireflies");
    setGardenDayScore([{ id: "seasonal-visitor:x", kind: "seasonal-visitor", startSec: 21.3 * 3600, windowSec: 600, holdSec: 70, foreground: true }]);
    expect(dressing.fireflyPresence(21)).toBe(0);
    expect(dressing.fireflyPresence(21.6)).toBe(1);
    expect(dressing.fireflyPresence(1)).toBe(1);
    dressing.ritual!.start(0);
    dressing.ritual!.update(10, 10);
    expect(dressing.fireflyPresence(21.3)).toBeGreaterThan(0);
    expect(dressing.fireflyPresence(21.3)).toBeLessThan(1);
    setGardenDayScore([]);
  });
});

function matrixAt(dressing: ReturnType<typeof createGardenSeasonalDressing>, index: number): number[] {
  const matrix = new Matrix4();
  dressing.petals!.getMatrixAt(index, matrix);
  return matrix.toArray();
}
