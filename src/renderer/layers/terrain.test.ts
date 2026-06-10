import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PharosVilleMap, PharosVilleWorld, TerrainKind } from "../../systems/world-types";
import { buildRecordingCanvasContext } from "../__test-utils__/canvas-context-builder";
import { createDrawInput } from "../__test-utils__/draw-input";
import {
  drawWaterTerrainAccents,
  drawWaterTerrainStaticDetails,
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

function makeWaterWorld(terrain: TerrainKind): PharosVilleWorld {
  return {
    docks: [],
    effects: [],
    graves: [],
    lighthouse: {
      color: "#fff",
      detailId: "lighthouse",
      id: "lighthouse",
      kind: "lighthouse",
      label: "Lighthouse",
      psiBand: null,
      score: null,
      tile: { x: 10, y: 10 },
      unavailable: true,
    },
    map: makeMap([[terrain]]),
    ships: [],
  } as unknown as PharosVilleWorld;
}

function waterDrawInput(terrain: TerrainKind, timeSeconds: number, reducedMotion = false) {
  const recording = buildRecordingCanvasContext();
  return {
    recording,
    input: createDrawInput({
      camera: { offsetX: 120, offsetY: 96, zoom: 1 },
      ctx: recording.ctx,
      height: 240,
      motion: {
        plan: {
          animatedShipIds: new Set(),
          effectShipIds: new Set(),
          lighthouseFireFlickerPerSecond: 0,
          moverShipIds: new Set(),
          shipPhases: new Map(),
          shipRoutes: new Map(),
        },
        reducedMotion,
        timeSeconds,
        wallClockHour: 12,
      },
      width: 320,
      world: makeWaterWorld(terrain),
    }),
  };
}

function serializableCalls(calls: readonly { method: string; args: readonly unknown[] }[]) {
  return calls.map((call) => ({
    args: call.args.map((arg) => {
      if (typeof arg === "object" && arg !== null) return "[object]";
      return arg;
    }),
    method: call.method,
  }));
}

class TestPath2D {
  commands: string[] = [];

  moveTo(x: number, y: number) {
    this.commands.push(`M${x},${y}`);
  }

  lineTo(x: number, y: number) {
    this.commands.push(`L${x},${y}`);
  }
}

beforeEach(() => {
  vi.stubGlobal("Path2D", TestPath2D);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("water terrain pass split", () => {
  it("keeps static water details deterministic across clock time", () => {
    const early = waterDrawInput("warning-water", 1);
    const late = waterDrawInput("warning-water", 37);

    expect(drawWaterTerrainStaticDetails(early.input)).toBe(1);
    expect(drawWaterTerrainStaticDetails(late.input)).toBe(1);

    expect(serializableCalls(late.recording.calls)).toEqual(serializableCalls(early.recording.calls));
  });

  it("draws water accents directly with continuous time while reduced motion remains pinned", () => {
    const first = waterDrawInput("alert-water", 0);
    const later = waterDrawInput("alert-water", 4);
    const reducedFirst = waterDrawInput("alert-water", 0, true);
    const reducedLater = waterDrawInput("alert-water", 4, true);

    expect(drawWaterTerrainAccents(first.input)).toBe(1);
    expect(drawWaterTerrainAccents(later.input)).toBe(1);
    expect(drawWaterTerrainAccents(reducedFirst.input)).toBe(1);
    expect(drawWaterTerrainAccents(reducedLater.input)).toBe(1);

    expect(serializableCalls(later.recording.calls)).not.toEqual(serializableCalls(first.recording.calls));
    expect(serializableCalls(reducedLater.recording.calls)).toEqual(serializableCalls(reducedFirst.recording.calls));
  });

  it("thins full-tier accents to the constrained candidate set below the chrome zoom gate (V4.1)", () => {
    const rows = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => "alert-water" as TerrainKind));
    const world = {
      ...makeWaterWorld("alert-water"),
      map: makeMap(rows),
    } as PharosVilleWorld;
    const accentCountAtZoom = (zoom: number): number => {
      const recording = buildRecordingCanvasContext();
      const input = createDrawInput({
        camera: { offsetX: 600, offsetY: 200, zoom },
        ctx: recording.ctx,
        height: 800,
        motion: {
          plan: {
            animatedShipIds: new Set(),
            effectShipIds: new Set(),
            lighthouseFireFlickerPerSecond: 0,
            moverShipIds: new Set(),
            shipPhases: new Map(),
            shipRoutes: new Map(),
          },
          reducedMotion: false,
          timeSeconds: 1,
          wallClockHour: 12,
        },
        width: 1200,
        world,
      });
      return drawWaterTerrainAccents(input);
    };

    const farCount = accentCountAtZoom(0.5);
    const nearCount = accentCountAtZoom(1);
    expect(farCount).toBeLessThan(nearCount);
    expect(farCount).toBeGreaterThan(0);
  });
});
