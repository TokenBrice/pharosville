import { InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, Vector3, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { GARDEN_LIGHTHOUSE_ROOT_OFFSET, gardenIslandDisplayTile } from "../systems/garden-observatory-slice";
import { REST_SEAT_EYE_HEIGHT } from "../systems/rest-seat";
import {
  createGardenGullFlock,
  GARDEN_GULL_CEILING,
  GARDEN_GULL_COUNT,
  GARDEN_GULL_CROWN_EXCLUSION,
  gardenBirdSortie,
  gardenBirdSortieOffset,
} from "./garden-summit-birds";

const LIGHTHOUSE_TILE = { x: 18, y: 28 };

function flight(mesh: InstancedMesh, index: number): number {
  return (mesh.geometry.getAttribute("aFlight") as InstancedBufferAttribute).getX(index);
}

describe("garden bird choreography", () => {
  it("keeps the shared sorties closed and deterministic", () => {
    expect(gardenBirdSortie(0.41, 123)).toBe(gardenBirdSortie(0.41, 123));
    for (const progress of [0, 1]) {
      const [x, y, z] = gardenBirdSortieOffset(progress, 0.6, -0.8, 4.2, 5.5);
      expect(Math.hypot(x, y, z)).toBeLessThan(1e-8);
    }
  });
});

describe("W5.3 winged gull flock", () => {
  it("is one six-instance batch of winged birds anchored to the displayed island", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE, { tileScale: 2 });
    const islandTile = gardenIslandDisplayTile(LIGHTHOUSE_TILE);
    expect(flock.root.name).toBe("garden-harbor-gull-flock");
    expect(flock.root.position.toArray()).toEqual([islandTile.x * 2, 0, islandTile.y * 2]);
    expect(flock.gulls.count).toBe(GARDEN_GULL_COUNT);
    expect(objectCount(flock.root)).toBe(1);
    // Real wings: an inner and an outer panel per side with Y relief once
    // hinged — not a flat three-triangle chevron.
    const wing = flock.gulls.geometry.getAttribute("aWing");
    let wingVertices = 0;
    for (let index = 0; index < wing.count; index += 1) if (wing.getX(index) !== 0) wingVertices += 1;
    expect(wingVertices).toBeGreaterThanOrEqual(24);
  });

  it("moves deterministically, perches under reduced motion, and hides when constrained or at night", () => {
    const first = createGardenGullFlock(LIGHTHOUSE_TILE);
    const second = createGardenGullFlock(LIGHTHOUSE_TILE);
    first.update({ constrained: false, reducedMotion: false, timeSeconds: 2 });
    second.update({ constrained: false, reducedMotion: false, timeSeconds: 2 });
    expect(instanceMatrices(first.gulls)).toEqual(instanceMatrices(second.gulls));

    first.update({ constrained: false, reducedMotion: true, timeSeconds: 3 });
    const reduced = instanceMatrices(first.gulls);
    first.update({ constrained: false, reducedMotion: true, timeSeconds: 900 });
    expect(instanceMatrices(first.gulls)).toEqual(reduced);
    for (let index = 0; index < GARDEN_GULL_COUNT; index += 1) expect(flight(first.gulls, index)).toBe(0);

    first.update({ constrained: true, reducedMotion: false, timeSeconds: 301 });
    expect(first.root.visible).toBe(false);
    first.update({ constrained: false, reducedMotion: false, timeSeconds: 302 });
    expect(first.root.visible).toBe(true);
    first.update({ constrained: false, night: 0.6, reducedMotion: false, timeSeconds: 303 });
    expect(first.root.visible).toBe(false);
  });

  it("settles onto the authored perches during the keeper's evening ritual", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE);
    flock.update({ constrained: false, reducedMotion: true, timeSeconds: 0 });
    const perches = instanceMatrices(flock.gulls);
    flock.update({
      constrained: false, reducedMotion: false, timeSeconds: 45,
      keeperRitual: { active: true, progress: 1, direction: "evening" },
    });
    expect(instanceMatrices(flock.gulls)).toEqual(perches);
  });

  it("mostly perches, lifts now and then with open wings, and never nears the crown", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE);
    flock.update({ constrained: false, reducedMotion: true, timeSeconds: 0 });
    const roosts = Array.from({ length: GARDEN_GULL_COUNT }, (_, index) =>
      new Vector3().setFromMatrixPosition(instanceMatrix(flock.gulls, index)));
    let airborne = 0;
    let samples = 0;
    let maxReach = 0;
    for (const stormLevel of [0, 1]) {
      for (let seconds = 0; seconds <= 3600; seconds += 2) {
        flock.update({
          constrained: false, reducedMotion: false, timeSeconds: seconds,
          weather: { stormLevel, wind: { gust: 0, speed: 0.6, x: 1, y: 0 } },
        });
        for (let index = 0; index < GARDEN_GULL_COUNT; index += 1) {
          const position = new Vector3().setFromMatrixPosition(instanceMatrix(flock.gulls, index));
          const up = flight(flock.gulls, index) > 0;
          // Never above the rest eye (so never against the sky over the
          // horizon, where the crown stands), never inside the crown disc.
          expect(position.y).toBeLessThanOrEqual(GARDEN_GULL_CEILING + 1e-6);
          expect(GARDEN_GULL_CEILING).toBeLessThan(REST_SEAT_EYE_HEIGHT);
          if (up && position.y > 4.4) {
            expect(Math.hypot(
              position.x - GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
              position.z - GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
            )).toBeGreaterThanOrEqual(GARDEN_GULL_CROWN_EXCLUSION - 1e-6);
          }
          if (stormLevel === 0) {
            samples += 1;
            if (up) airborne += 1;
            const roost = roosts[index]!;
            maxReach = Math.max(maxReach, Math.hypot(position.x - roost.x, position.z - roost.z));
          }
        }
      }
    }
    // life-3: well under one bird in the air on average, but some sorties.
    expect(airborne / samples).toBeGreaterThan(0);
    expect(airborne / samples * GARDEN_GULL_COUNT).toBeLessThan(0.9);
    expect(maxReach).toBeGreaterThan(8);
    expect(new Set(roosts.map((roost) => `${roost.x.toFixed(2)},${roost.z.toFixed(2)}`)).size)
      .toBe(GARDEN_GULL_COUNT);
  });
});

function objectCount(root: Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof Mesh) count += 1;
  });
  return count;
}

function instanceMatrices(mesh: InstancedMesh): number[][] {
  return Array.from({ length: mesh.count }, (_, index) => instanceMatrix(mesh, index).toArray());
}

function instanceMatrix(mesh: InstancedMesh, index: number): Matrix4 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix;
}
