import {
  InstancedMesh,
  Matrix4,
  Mesh,
  Vector3,
  type Object3D,
} from "three";
import { describe, expect, it } from "vitest";
import { gardenIslandDisplayTile } from "../systems/garden-observatory-slice";
import {
  createGardenGullFlock,
  createGardenFireflies,
  GARDEN_GULL_COUNT,
} from "./garden-harbor-life";

const LIGHTHOUSE_TILE = { x: 18, y: 28 };

describe("garden gull flock", () => {
  it("is one six-instance batch anchored to the displayed island", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE, { tileScale: 2 });
    const islandTile = gardenIslandDisplayTile(LIGHTHOUSE_TILE);

    expect(flock.root.name).toBe("garden-harbor-gull-flock");
    expect(flock.root.position.toArray()).toEqual([
      islandTile.x * 2,
      0,
      islandTile.y * 2,
    ]);
    expect(flock.gulls).toBeInstanceOf(InstancedMesh);
    expect(flock.gulls.count).toBe(GARDEN_GULL_COUNT);
    expect(objectCount(flock.root)).toBe(1);
  });

  it("moves deterministically, freezes for reduced motion, and hides when constrained", () => {
    const first = createGardenGullFlock(LIGHTHOUSE_TILE);
    const second = createGardenGullFlock(LIGHTHOUSE_TILE);

    first.update({
      constrained: false,
      reducedMotion: false,
      timeSeconds: 2,
    });
    second.update({
      constrained: false,
      reducedMotion: false,
      timeSeconds: 2,
    });
    expect(instanceMatrices(first.gulls)).toEqual(instanceMatrices(second.gulls));

    // The birds rest most of the time; somewhere in a long watch one lifts.
    const resting = instanceMatrices(first.gulls);
    let moved = false;
    for (let seconds = 5; seconds <= 900 && !moved; seconds += 5) {
      first.update({ constrained: false, reducedMotion: false, timeSeconds: seconds });
      moved = JSON.stringify(instanceMatrices(first.gulls)) !== JSON.stringify(resting);
    }
    expect(moved).toBe(true);

    first.update({
      constrained: false,
      reducedMotion: true,
      timeSeconds: 3,
    });
    const reduced = instanceMatrices(first.gulls);
    first.update({
      constrained: false,
      reducedMotion: true,
      timeSeconds: 300,
    });
    expect(instanceMatrices(first.gulls)).toEqual(reduced);

    first.update({
      constrained: true,
      reducedMotion: false,
      timeSeconds: 301,
    });
    expect(first.root.visible).toBe(false);
    first.update({
      constrained: false,
      reducedMotion: false,
      timeSeconds: 302,
    });
    expect(first.root.visible).toBe(true);
  });
});

describe("keeper harbor response", () => {
  it("settles the flock onto its authored perches during the evening ritual", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE);
    flock.update({ constrained: false, reducedMotion: true, timeSeconds: 0 });
    const perches = instanceMatrices(flock.gulls);
    flock.update({
      constrained: false, reducedMotion: false, timeSeconds: 45,
      keeperRitual: { active: true, progress: 1, direction: "evening" },
    });
    expect(instanceMatrices(flock.gulls)).toEqual(perches);
  });

  it("keeps fourteen quad fireflies on one dark arc and freezes wind under reduced motion", () => {
    const fireflies = createGardenFireflies([{ x: 0, y: 1, z: 0 }, { x: 100, y: 1, z: 100 }], LIGHTHOUSE_TILE);
    const motes = fireflies.root.children[0] as InstancedMesh;
    const frame = { fullTier: true, night: 1, reducedMotion: true, timeSeconds: 1 };
    fireflies.update(frame);
    const still = instanceMatrices(motes);
    fireflies.update({ ...frame, timeSeconds: 1000, weather: { wind: { x: 1, y: 0, speed: 1, gust: 1 } } });
    expect(instanceMatrices(motes)).toEqual(still);
    expect(motes.geometry.index!.count / 3 * motes.count).toBe(28);
    for (let index = 0; index < motes.count; index += 1) {
      const position = new Vector3().setFromMatrixPosition(instanceMatrix(motes, index));
      expect(Math.hypot(position.x, position.z)).toBeLessThan(6);
    }
    fireflies.update({ ...frame, night: 0 });
    expect(fireflies.root.visible).toBe(false);
  });
});

describe("island gull perches", () => {
  it("perches the island flock on the island, and lifts it only now and then", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE);
    // The reduced-motion pose IS the perch ring; capture it to measure reach.
    flock.update({ constrained: false, reducedMotion: true, timeSeconds: 0 });
    const roosts = Array.from({ length: GARDEN_GULL_COUNT }, (_, index) =>
      new Vector3().setFromMatrixPosition(instanceMatrix(flock.gulls, index)));
    const heights: number[][] = Array.from({ length: GARDEN_GULL_COUNT }, () => []);
    let maxReach = 0;
    for (let seconds = 0; seconds <= 900; seconds += 3) {
      flock.update({ constrained: false, reducedMotion: false, timeSeconds: seconds });
      for (let index = 0; index < GARDEN_GULL_COUNT; index += 1) {
        const position = new Vector3()
          .setFromMatrixPosition(instanceMatrix(flock.gulls, index));
        heights[index]!.push(position.y);
        const roost = roosts[index]!;
        maxReach = Math.max(maxReach, Math.hypot(position.x - roost.x, position.z - roost.z));
      }
    }
    // A bird's own floor over a long sweep IS her perch — she returns to the
    // exact spot she left. Clear of it means up.
    let airborne = 0;
    let samples = 0;
    for (const track of heights) {
      const perch = Math.min(...track);
      for (const height of track) {
        if (height > perch + 0.5) airborne += 1;
        samples += 1;
      }
    }
    const share = airborne / samples;
    // W4.9: rare sorties occupy a small share of the watch, never most of it.
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(0.2);
    // D2 amplitude: the widest turns swing well out from the roost, so a
    // sortie reads at the zoom-1.0 rest.
    expect(maxReach).toBeGreaterThan(8);
    // Six birds, six different perches: no two share a roost.
    const perches = roosts.map((roost) => `${roost.x.toFixed(2)},${roost.z.toFixed(2)}`);
    expect(new Set(perches).size).toBe(GARDEN_GULL_COUNT);

    // And under reduced motion none of them are up at all: the still frame is
    // the flock at rest on real island geometry, wings folded along the body,
    // not a freeze of an open chevron in mid-air.
    flock.update({ constrained: false, reducedMotion: true, timeSeconds: 0 });
    for (let index = 0; index < GARDEN_GULL_COUNT; index += 1) {
      const matrix = instanceMatrix(flock.gulls, index);
      const position = new Vector3().setFromMatrixPosition(matrix);
      expect(position.y).toBeLessThan(7.7);
      // On the island, not out over the water: the sea wall's own ellipse is
      // 17.2 x 12.9, and every perch is inside it.
      expect(Math.hypot(position.x, position.z)).toBeLessThan(19);
      const scale = new Vector3().setFromMatrixScale(matrix);
      expect(scale.x).toBeLessThan(scale.z * 0.5);
    }
  });

  it("opens the wings only while a bird is up", () => {
    const flock = createGardenGullFlock(LIGHTHOUSE_TILE);
    let spreadAloft = 0;
    for (let seconds = 0; seconds <= 900; seconds += 3) {
      flock.update({ constrained: false, reducedMotion: false, timeSeconds: seconds });
      for (let index = 0; index < GARDEN_GULL_COUNT; index += 1) {
        const scale = new Vector3().setFromMatrixScale(instanceMatrix(flock.gulls, index));
        if (scale.x > scale.z * 0.99) spreadAloft += 1;
      }
    }
    expect(spreadAloft).toBeGreaterThan(0);
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
  return Array.from({ length: mesh.count }, (_, index) => (
    instanceMatrix(mesh, index).toArray()
  ));
}

function instanceMatrix(mesh: InstancedMesh, index: number): Matrix4 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix;
}
