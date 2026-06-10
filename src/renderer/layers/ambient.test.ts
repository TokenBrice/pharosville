import { describe, expect, it, vi } from "vitest";
import type { PharosVilleWorld } from "../../systems/world-types";
import { buildRecordingCanvasContext } from "../__test-utils__/canvas-context-builder";
import { createCanvasContextStub, createDrawInput } from "../__test-utils__/draw-input";
import {
  BIRDS,
  bioluminescentSparkleWarmPathScaleForTest,
  birdAnchorTile,
  dispatchGapForThreat,
  drawBioluminescentSparkles,
  drawMoonReflection,
  sampleBird,
  sparklePointDensityStatsForTest,
  type BirdConfig,
} from "./ambient";

function makeWorld(): PharosVilleWorld {
  return {
    lighthouse: { tile: { x: 18, y: 28 } },
    pigeonnier: { tile: { x: 50, y: 50 } },
    areas: [],
    docks: [],
    ships: [],
    graves: [],
    map: { width: 56, height: 56, tiles: [], waterRatio: 0.86 },
    effects: [],
    detailIndex: {},
    entityById: {},
    legends: [],
    visualCues: [],
    routeMode: "world",
    freshness: {},
    generatedAt: 0,
  } as unknown as PharosVilleWorld;
}

describe("ambient birds", () => {
  it("includes both lighthouse gulls and pigeonnier residents", () => {
    const lighthouseOrbits = BIRDS.filter(
      (bird) => bird.route.kind === "orbit" && bird.route.anchor === "lighthouse",
    );
    const pigeonnierOrbits = BIRDS.filter(
      (bird) => bird.route.kind === "orbit" && bird.route.anchor === "pigeonnier",
    );
    expect(lighthouseOrbits.length).toBeGreaterThanOrEqual(9);
    expect(pigeonnierOrbits.length).toBeGreaterThanOrEqual(2);
    expect(BIRDS.some((bird) => bird.route.kind === "shuttle")).toBe(true);
    expect(BIRDS.some((bird) => bird.route.kind === "dispatch")).toBe(true);
  });

  it("orbits are deterministic given time + phase", () => {
    const world = makeWorld();
    const bird: BirdConfig = {
      species: "pigeon",
      scale: 0.6,
      phase: 0,
      route: { kind: "orbit", anchor: "pigeonnier", anchorX: 0, anchorY: 0, radiusX: 2, radiusY: 1, speed: 1 },
    };
    const a = sampleBird(bird, 0, world, 1, 0);
    expect(a.tile.x).toBeCloseTo(50 + 2);
    expect(a.tile.y).toBeCloseTo(50);
    expect(a.visible).toBe(true);
    const b = sampleBird(bird, Math.PI / 2, world, 1, 0);
    expect(b.tile.x).toBeCloseTo(50, 5);
    expect(b.tile.y).toBeCloseTo(50 + 1, 5);
  });

  it("designated gulls plunge during their dive window and recover after (V2.5)", () => {
    const world = makeWorld();
    const bird: BirdConfig = {
      species: "gull",
      scale: 0.7,
      phase: 0,
      route: {
        kind: "orbit",
        anchor: "lighthouse",
        anchorX: 0,
        anchorY: 0,
        radiusX: 0,
        radiusY: 0,
        speed: 0,
        dive: { depth: 2.5, duration: 2, period: 20 },
      },
    };
    // Mid-dive (t=1 → progress 0.5 → full depth).
    const diving = sampleBird(bird, 1, world, 1, 0);
    expect(diving.tile.y).toBeCloseTo(28 + 2.5, 5);
    // Outside the window the orbit is unchanged.
    const cruising = sampleBird(bird, 10, world, 1, 0);
    expect(cruising.tile.y).toBeCloseTo(28, 5);
    // Deterministic: same time → same plunge.
    const again = sampleBird(bird, 1, world, 1, 0);
    expect(again.tile.y).toBe(diving.tile.y);
  });

  it("ships exactly two diving gulls in the ambient set (V2.5 cap)", () => {
    const divers = BIRDS.filter((bird) => bird.route.kind === "orbit" && bird.route.dive);
    expect(divers.length).toBe(2);
    expect(divers.every((bird) => bird.species === "gull")).toBe(true);
  });

  it("shuttle hits both endpoints across one cycle", () => {
    const world = makeWorld();
    const bird: BirdConfig = {
      species: "pigeon",
      scale: 0.66,
      phase: 0,
      route: { kind: "shuttle", from: "pigeonnier", to: "lighthouse", basePeriod: 10, arcLift: 4 },
    };
    // At cycle progress 0 (t=0): at pigeonnier.
    const start = sampleBird(bird, 0, world, 1, 0);
    expect(start.tile.x).toBeCloseTo(50);
    expect(start.tile.y).toBeCloseTo(50);
    // At cycle progress 0.5 (t=5s of a 10s period): at lighthouse, lift = 0.
    const mid = sampleBird(bird, 5, world, 1, 0);
    expect(mid.tile.x).toBeCloseTo(18);
    expect(mid.tile.y).toBeCloseTo(28);
    // At cycle progress 0.25 (t=2.5s): outbound midpoint with arc lift.
    const outQuarter = sampleBird(bird, 2.5, world, 1, 0);
    expect(outQuarter.tile.x).toBeCloseTo((50 + 18) / 2);
    // y should be lifted (smaller than the linear midpoint).
    const linearY = (50 + 28) / 2;
    expect(outQuarter.tile.y).toBeLessThan(linearY);
  });

  it("shuttle period shortens under wind/threat scaling", () => {
    const world = makeWorld();
    const bird: BirdConfig = {
      species: "pigeon",
      scale: 0.66,
      phase: 0,
      route: { kind: "shuttle", from: "pigeonnier", to: "lighthouse", basePeriod: 10, arcLift: 4 },
    };
    // With windScale=2, period collapses to 5s — t=2.5s now lands at lighthouse.
    const fast = sampleBird(bird, 2.5, world, 2, 0);
    expect(fast.tile.x).toBeCloseTo(18);
    expect(fast.tile.y).toBeCloseTo(28);
  });

  it("dispatch is invisible during the gap and visible during flight", () => {
    const world = makeWorld();
    const bird: BirdConfig = {
      species: "pigeon",
      scale: 0.6,
      phase: 0,
      route: { kind: "dispatch", origin: "pigeonnier", destination: { x: 65, y: 60 }, flightDuration: 6, baseGapSeconds: 45, arcLift: 3 },
    };
    // CALM: gap = 45s, total cycle = 51s. t=5 is well inside the gap.
    expect(sampleBird(bird, 5, world, 1, 0).visible).toBe(false);
    // At t=46 (gap+1) we're 1s into the 6s flight.
    const launching = sampleBird(bird, 46, world, 1, 0);
    expect(launching.visible).toBe(true);
    // Tile is between origin and destination, with vertical lift.
    expect(launching.tile.x).toBeGreaterThan(50);
    expect(launching.tile.x).toBeLessThan(65);
  });

  it("dispatch cadence accelerates with threat level", () => {
    expect(dispatchGapForThreat(45, 0)).toBeCloseTo(45);
    expect(dispatchGapForThreat(45, 1)).toBeLessThan(45);
    expect(dispatchGapForThreat(45, 4)).toBeLessThan(dispatchGapForThreat(45, 3));
    expect(dispatchGapForThreat(45, 4)).toBeLessThan(10);
  });

  it("birdAnchorTile maps anchors to the correct world entity", () => {
    const world = makeWorld();
    expect(birdAnchorTile("lighthouse", world)).toEqual({ x: 18, y: 28 });
    expect(birdAnchorTile("pigeonnier", world)).toEqual({ x: 50, y: 50 });
  });

  it("reduced-motion freezes orbits at the phase-0 angle", () => {
    const world = makeWorld();
    const bird: BirdConfig = {
      species: "gull",
      scale: 1,
      phase: 0.5,
      route: { kind: "orbit", anchor: "lighthouse", anchorX: 0, anchorY: 0, radiusX: 4, radiusY: 1, speed: 0.2 },
    };
    // With time=0 (the reduced-motion contract in drawBirds), only the phase
    // contributes to the orbit angle — sample is deterministic.
    const a = sampleBird(bird, 0, world, 1, 0);
    expect(a.tile.x).toBeCloseTo(18 + 4 * Math.cos(0.5));
    expect(a.tile.y).toBeCloseTo(28 + 1 * Math.sin(0.5));
  });
});

describe("ambient sparkle density", () => {
  it("culls every other authored eastern-shelf sparkle", () => {
    const stats = sparklePointDensityStatsForTest();

    expect(stats.authoredEastern).toBeGreaterThan(0);
    expect(stats.renderedEastern).toBe(Math.ceil(stats.authoredEastern / 2));
    expect(stats.renderedTotal).toBe(stats.authoredTotal - Math.floor(stats.authoredEastern / 2));
  });

  it("attenuates sparkles in the warm pyre path while preserving edge contrast", () => {
    const firePoint = { x: 100, y: 80 };
    const core = bioluminescentSparkleWarmPathScaleForTest({ x: 8, y: 198 }, firePoint, 1, 0.5);
    const edge = bioluminescentSparkleWarmPathScaleForTest({ x: -252, y: 198 }, firePoint, 1, 2.61);
    const openWater = bioluminescentSparkleWarmPathScaleForTest({ x: -620, y: -220 }, firePoint, 1, 0.5);

    expect(core).toBeLessThan(0.1);
    expect(edge).toBeGreaterThan(core);
    expect(edge).toBeLessThan(0.55);
    expect(openWater).toBe(1);
  });

  it("keeps reduced-motion sparkle geometry deterministic across redraws", () => {
    function drawAt(timeSeconds: number) {
      const recording = buildRecordingCanvasContext({
        initialValues: {
          fillStyle: "",
          globalCompositeOperation: "source-over",
        },
      });
      const input = createDrawInput({
        camera: { offsetX: 620, offsetY: 80, zoom: 1 },
        ctx: recording.ctx,
        height: 720,
        motion: {
          plan: {
            animatedShipIds: new Set(),
            effectShipIds: new Set(),
            lighthouseFireFlickerPerSecond: 0,
            moverShipIds: new Set(),
            shipPhases: new Map(),
            shipRoutes: new Map(),
          },
          reducedMotion: true,
          timeSeconds,
          wallClockHour: 22,
        },
        width: 1280,
        world: makeWorld(),
      });

      drawBioluminescentSparkles(
        input,
        1,
        { firePoint: { x: 180, y: 180 } } as NonNullable<Parameters<typeof drawBioluminescentSparkles>[2]>,
      );
      return {
        calls: recording.calls.map((call) => ({
          args: call.args.map((arg) => (typeof arg === "number" ? Number(arg.toFixed(4)) : arg)),
          method: call.method,
        })),
        fillStyle: recording.setStyles.fillStyle,
      };
    }

    expect(drawAt(4.2)).toEqual(drawAt(92.8));
  });
});

describe("ambient moon reflection", () => {
  it("reuses the fullscreen reflection gradient for the same size and night bucket", () => {
    const gradient = { addColorStop: vi.fn() };
    const ctx = createCanvasContextStub(
      ["beginPath", "ellipse", "fill", "restore", "rotate", "save", "translate"],
      {
        createRadialGradient: vi.fn(() => gradient),
        fillStyle: "",
      },
    );
    const input = createDrawInput({ ctx, dpr: 2, height: 600, width: 800 });

    drawMoonReflection(input, 0.6);
    drawMoonReflection(input, 0.6);

    expect(ctx.createRadialGradient).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });

  it("keeps the moon reflection cool and weaker than the pyre light budget", () => {
    const stops: string[] = [];
    const gradient = {
      addColorStop: vi.fn((_offset: number, color: string) => stops.push(color)),
    };
    const ctx = createCanvasContextStub(
      ["beginPath", "ellipse", "fill", "restore", "rotate", "save", "translate"],
      {
        createRadialGradient: vi.fn(() => gradient),
        fillStyle: "",
      },
    );
    const input = createDrawInput({ ctx, dpr: 2, height: 600, width: 800 });

    drawMoonReflection(input, 1);

    const alphas = stops
      .map((color) => /rgba\(\d+, \d+, \d+, ([\d.]+)\)/.exec(color)?.[1])
      .filter((alpha): alpha is string => alpha !== undefined)
      .map(Number);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.034);
    expect(stops[0]).toContain("108, 152, 214");
    expect(stops[1]).toContain("78, 116, 178");
  });
});
