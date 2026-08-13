import { describe, expect, it } from "vitest";
import { Matrix4 } from "three";
import { weatherForFrame } from "../systems/weather";
import {
  createGardenSeasonalDressing,
  GARDEN_SPRING_PETAL_COUNT,
} from "./garden-seasonal-dressing";

describe("garden seasonal dressing", () => {
  const weather = weatherForFrame({ baseWind: 0.4, psiStress: 0.2, timeSeconds: 12 });

  it("creates only a sparse spring petal layer", () => {
    expect(GARDEN_SPRING_PETAL_COUNT).toBeLessThanOrEqual(64);
    expect(createGardenSeasonalDressing("spring").petals?.count).toBe(GARDEN_SPRING_PETAL_COUNT);
    for (const season of ["summer", "autumn", "winter"] as const) {
      expect(createGardenSeasonalDressing(season).petals).toBeNull();
    }
  });

  it("is deterministic and resolves reduced motion to one time-zero pose", () => {
    const dressing = createGardenSeasonalDressing("spring");
    dressing.update({ islandX: 10, islandZ: -4, reducedMotion: true, timeSeconds: 12, weather });
    const first = matrixAt(dressing, 0);
    dressing.update({ islandX: 10, islandZ: -4, reducedMotion: true, timeSeconds: 900, weather });
    expect(matrixAt(dressing, 0)).toEqual(first);
  });

  it("advects animated petals on the shared wind clock", () => {
    const dressing = createGardenSeasonalDressing("spring");
    dressing.update({ islandX: 0, islandZ: 0, reducedMotion: false, timeSeconds: 1, weather });
    const first = matrixAt(dressing, 0);
    dressing.update({ islandX: 0, islandZ: 0, reducedMotion: false, timeSeconds: 8, weather });
    expect(matrixAt(dressing, 0)).not.toEqual(first);
  });
});

function matrixAt(dressing: ReturnType<typeof createGardenSeasonalDressing>, index: number): number[] {
  const matrix = new Matrix4();
  dressing.petals!.getMatrixAt(index, matrix);
  return matrix.toArray();
}
