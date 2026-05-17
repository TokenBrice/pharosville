import { describe, expect, it } from "vitest";
import type { PharosVilleMap, TerrainKind } from "../../systems/world-types";
import {
  seawallRippleAnchorsFromPlacements,
  watchBreakwaterSubzoneForTile,
  waterZoneBorderFeathersForMap,
} from "./terrain";

function makeMap(rows: TerrainKind[][]): PharosVilleMap {
  return {
    height: rows.length,
    tiles: rows.flatMap((row, y) => row.map((terrain, x) => ({
      kind: "water" as const,
      terrain,
      x,
      y,
    }))),
    waterRatio: 1,
    width: rows[0]?.length ?? 0,
  };
}

describe("water zone feathering", () => {
  it("caches direct cross-zone water borders by map identity", () => {
    const map = makeMap([
      ["calm-water", "calm-water", "calm-water"],
      ["calm-water", "calm-water", "watch-water"],
      ["calm-water", "storm-water", "storm-water"],
    ]);

    const first = waterZoneBorderFeathersForMap(map);
    const second = waterZoneBorderFeathersForMap(map);
    const center = first.get(1 * map.width + 1) ?? [];

    expect(second).toBe(first);
    expect(center.map((feather) => feather.edge).sort()).toEqual(["east", "south"]);
    expect(center.map((feather) => feather.terrain).sort()).toEqual(["storm-water", "watch-water"]);
    expect(first.has(0)).toBe(false);
  });

  it("does not create feathers against land or same-zone water", () => {
    const map: PharosVilleMap = {
      height: 2,
      tiles: [
        { kind: "water", terrain: "calm-water", x: 0, y: 0 },
        { kind: "water", terrain: "calm-water", x: 1, y: 0 },
        { kind: "water", terrain: "calm-water", x: 0, y: 1 },
        { kind: "land", x: 1, y: 1 },
      ],
      waterRatio: 0.75,
      width: 2,
    };

    expect(waterZoneBorderFeathersForMap(map).size).toBe(0);
  });
});

describe("Watch Breakwater subzones", () => {
  it("splits the east shelf from the south basin while keeping both in WATCH water", () => {
    expect(watchBreakwaterSubzoneForTile(55, 25)).toBe("east-shelf");
    expect(watchBreakwaterSubzoneForTile(50, 30)).toBe("east-shelf");
    expect(watchBreakwaterSubzoneForTile(31, 0)).toBe("east-shelf");
    expect(watchBreakwaterSubzoneForTile(48, 44)).toBe("south-basin");
    expect(watchBreakwaterSubzoneForTile(38, 52)).toBe("south-basin");
  });
});

describe("seawall ripple anchors", () => {
  it("samples a stable 8-12 point ripple set from authored seawall placements", () => {
    const placements = Array.from({ length: 30 }, (_value, index) => ({
      tile: { x: 15 + index * 0.5, y: 24 + (index % 6) * 0.7 },
    }));

    const anchors = seawallRippleAnchorsFromPlacements(placements);

    expect(anchors.length).toBeGreaterThanOrEqual(8);
    expect(anchors.length).toBeLessThanOrEqual(12);
    expect(new Set(anchors.map((anchor) => `${anchor.x}.${anchor.y}`)).size).toBe(anchors.length);
    expect(anchors[0]).toEqual({ x: 15, y: 24 });
    expect(anchors.at(-1)).toEqual({ x: 29.5, y: 27.5 });
  });
});
