import { describe, expect, it } from "vitest";
import type { PharosVilleMap, TerrainKind } from "../systems/world-types";
import { scanVisibleTiles, terrainKindForTile } from "./visible-tiles";

function makeMap(rows: TerrainKind[][]): PharosVilleMap {
  return {
    height: rows.length,
    tiles: rows.flatMap((row, y) => row.map((terrain, x) => ({
      kind: "water" as const,
      terrain,
      x,
      y,
    }))),
    waterRatio: 0,
    width: rows[0]?.length ?? 0,
  };
}

describe("visible tile scanning", () => {
  it("visits visible tiles in row-major bounds order without allocating visit records", () => {
    const map = makeMap([
      ["water", "land"],
      ["deep-water", "shore"],
    ]);
    const visited: string[] = [];

    const count = scanVisibleTiles({
      bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      camera: { offsetX: 20, offsetY: 20, zoom: 1 },
      map,
      viewportHeight: 100,
      viewportMarginX: 0,
      viewportMarginY: 0,
      viewportWidth: 100,
      visit: (tile, terrain, screenX, screenY, tileIndex) => {
        visited.push(`${tileIndex}:${tile.x},${tile.y}:${terrain}:${screenX},${screenY}`);
      },
    });

    expect(count).toBe(4);
    expect(visited).toEqual([
      "0:0,0:water:20,20",
      "1:1,0:land:36,28",
      "2:0,1:deep-water:4,28",
      "3:1,1:shore:20,36",
    ]);
  });

  it("uses terrain overrides when present", () => {
    expect(terrainKindForTile({ kind: "water", terrain: "ledger-water", x: 0, y: 0 })).toBe("ledger-water");
  });
});
