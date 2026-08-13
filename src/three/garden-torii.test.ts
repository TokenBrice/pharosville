import { Box3, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { terrainKindAt } from "../systems/world-layout";
import { TILE_SCALE } from "./garden-util";
import {
  createGardenTorii,
  GARDEN_TORII_TILE,
  GARDEN_TORII_YAW,
} from "./garden-torii";

describe("garden torii (W5.5)", () => {
  it("stands at the seaward mouth of the Calm Anchorage", () => {
    expect(terrainKindAt(GARDEN_TORII_TILE.x, GARDEN_TORII_TILE.y)).toBe("calm-water");
    const torii = createGardenTorii();
    expect(torii.root.position.toArray()).toEqual([
      GARDEN_TORII_TILE.x * TILE_SCALE,
      GARDEN_WATER_Y,
      GARDEN_TORII_TILE.y * TILE_SCALE,
    ]);
    expect(torii.root.rotation.y).toBe(GARDEN_TORII_YAW);
    expect(Math.abs(Math.sin(GARDEN_TORII_YAW * 2))).toBeGreaterThan(0.2);
    torii.dispose();
  });

  it("merges the stone feet and weathered-shu gate into one draw call", () => {
    const torii = createGardenTorii();
    expect(torii.drawCallCount).toBe(1);
    expect(torii.root.children).toHaveLength(1);
    const gate = torii.root.children[0];
    expect(gate).toBeInstanceOf(Mesh);
    expect((gate as Mesh).geometry.getAttribute("color")).toBeDefined();
    expect(torii.triangleCount).toBeGreaterThan(100);
    torii.dispose();
  });

  it("keeps classic low-landmark proportions with submerged stone bases", () => {
    const torii = createGardenTorii();
    const bounds = new Box3().setFromObject(torii.root.children[0]!);
    const size = bounds.getSize(new Vector3());
    expect(size.x).toBeGreaterThan(8.5);
    expect(size.y).toBeGreaterThan(7.5);
    expect(size.y).toBeLessThan(9);
    expect(bounds.min.y).toBeLessThan(-1);
    expect(bounds.max.y).toBeGreaterThan(6.5);
    torii.dispose();
  });
});
