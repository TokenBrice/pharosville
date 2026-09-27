import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
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

function matrixAt(dressing: ReturnType<typeof createGardenSeasonalDressing>, index: number): number[] {
  const matrix = new Matrix4();
  dressing.petals!.getMatrixAt(index, matrix);
  return matrix.toArray();
}
