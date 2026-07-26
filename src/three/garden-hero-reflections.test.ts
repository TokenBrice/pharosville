import { Color } from "three";
import { describe, expect, it } from "vitest";
import { SEA_REGION_ID } from "../systems/garden-sea-regions";
import {
  createGardenHeroReflections,
  heroReflectionSeaStrength,
  heroReflectionStrengthForRegion,
} from "./garden-hero-reflections";

function alphaAt(
  reflections: ReturnType<typeof createGardenHeroReflections>,
  index: number,
): number {
  const attribute = reflections.mesh.geometry.getAttribute("aReflectAlpha");
  return attribute.getX(index);
}

const CALM_TILE = { x: 0, y: 0 };

describe("heroReflectionStrengthForRegion", () => {
  it("falls monotonically as the water worsens", () => {
    // This IS the reading: a hull's reflection reports the water it is riding,
    // so it has to track the region reflectivity ladder the sea surface uses.
    const ladder = [
      SEA_REGION_ID.calm,
      SEA_REGION_ID.watch,
      SEA_REGION_ID.alert,
      SEA_REGION_ID.warning,
      SEA_REGION_ID.danger,
    ].map((regionId) => heroReflectionStrengthForRegion(regionId));

    expect(ladder[0]).toBe(1);
    for (const [index, value] of ladder.entries()) {
      if (index === 0) continue;
      expect(value).toBeLessThan(ladder[index - 1]!);
    }
    expect(ladder.at(-1)).toBeLessThan(0.2);
  });

  it("never returns zero, so a failing reflection is not an absent one", () => {
    for (const tile of [{ x: 0, y: 0 }, { x: 55, y: 55 }, { x: 111, y: 3 }]) {
      const strength = heroReflectionSeaStrength(tile.x, tile.y);
      expect(strength).toBeGreaterThan(0);
      expect(strength).toBeLessThanOrEqual(1);
    }
  });
});

describe("createGardenHeroReflections", () => {
  it("draws the whole hero fleet in one call", () => {
    const reflections = createGardenHeroReflections(29);
    expect(reflections.mesh.count).toBe(29);
    expect(reflections.mesh.isInstancedMesh).toBe(true);
  });

  it("scales the column to the hull's mast and footprint", () => {
    const reflections = createGardenHeroReflections(1);
    reflections.place({
      color: new Color("#8a6840"),
      index: 0,
      mastheadHeight: 10,
      strength: 1,
      tileX: CALM_TILE.x,
      tileY: CALM_TILE.y,
      width: 6,
      worldX: 3,
      worldZ: -4,
    });
    reflections.flush(1);

    const matrix = reflections.mesh.instanceMatrix;
    // The column is intentionally narrower than the hull footprint so the
    // instanced plane cannot read as a rectangular smear.
    expect(matrix.array[0]).toBeCloseTo(6 * 0.68 * Math.cos(Math.PI / 4), 5);
    expect(alphaAt(reflections, 0)).toBeGreaterThan(0);
  });

  it("collapses the column when the caller's gate is shut", () => {
    const reflections = createGardenHeroReflections(1);
    reflections.place({
      color: new Color("#8a6840"),
      index: 0,
      mastheadHeight: 10,
      strength: 0,
      tileX: CALM_TILE.x,
      tileY: CALM_TILE.y,
      width: 6,
      worldX: 0,
      worldZ: 0,
    });
    reflections.flush(1);

    expect(alphaAt(reflections, 0)).toBe(0);
  });

  it("freezes the band drift when handed a frozen clock", () => {
    const reflections = createGardenHeroReflections(1);
    reflections.flush(0);
    expect(reflections.mesh.material.uniforms.uTime!.value).toBe(0);
    reflections.flush(12);
    expect(reflections.mesh.material.uniforms.uTime!.value).toBe(12);
  });
});
