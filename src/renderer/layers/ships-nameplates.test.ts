import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PharosVilleMotionPlan, ShipMotionSample } from "../../systems/motion";
import type { PharosVilleWorld, ShipNode } from "../../systems/world-types";
import { buildRecordingCanvasContext, type RecordedCanvasCall } from "../__test-utils__/canvas-context-builder";
import type { ResolvedEntityGeometry } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";
import { drawShipNameplates, plateSpriteCacheStats, resetPlateSpriteCache } from "./ships/nameplates";
import type { ShipRenderFrame } from "./ships/draw-ship";

interface RecordingCtx {
  calls: readonly RecordedCanvasCall[];
}

function makeCtx(): CanvasRenderingContext2D & RecordingCtx {
  const recording = buildRecordingCanvasContext({
    methods: [
      "save",
      "restore",
      "beginPath",
      "rect",
      "roundRect",
      "fill",
      "stroke",
      "fillText",
      "drawImage",
    ],
    returningMethods: {
      measureText: () => ({ width: 24 }),
    },
  });
  return new Proxy(recording.ctx, {
    get(target, prop) {
      if (prop === "calls") return recording.calls;
      return Reflect.get(target, prop);
    },
  }) as CanvasRenderingContext2D & RecordingCtx;
}

function makeShip(id: string, sizeTier: ShipNode["visual"]["sizeTier"]): ShipNode {
  return {
    kind: "ship",
    id,
    detailId: `ship.${id}`,
    label: id,
    symbol: id.slice(0, 4).toUpperCase(),
    tile: { x: 0, y: 0 },
    riskTile: { x: 0, y: 0 },
    riskZone: "calm",
    change24hUsd: 0,
    change24hPct: 0,
    visual: {
      hull: "treasury-galleon",
      sizeTier,
      scale: 1,
      livery: {},
    },
  } as unknown as ShipNode;
}

function makeGeometry(x: number, y: number): ResolvedEntityGeometry {
  return {
    assetScale: null,
    depth: 0,
    depthTile: { x: 0, y: 0 },
    drawPoint: { x, y },
    drawScale: 1,
    followTile: { x: 0, y: 0 },
    screenPoint: { x, y },
    selectionRect: { x: x - 16, y: y - 16, width: 32, height: 32 },
    semanticTile: { x: 0, y: 0 },
    targetRect: { x: x - 16, y: y - 16, width: 32, height: 32 },
  };
}

function makePlan(): PharosVilleMotionPlan {
  return {
    animatedShipIds: new Set<string>(),
    effectShipIds: new Set<string>(),
    lighthouseFireFlickerPerSecond: 0,
    moverShipIds: new Set<string>(),
    shipPhases: new Map(),
    shipRoutes: new Map(),
  };
}

function makeInput(
  ctx: CanvasRenderingContext2D,
  ships: readonly ShipNode[],
  zoom: number,
): DrawPharosVilleInput {
  return {
    assets: null,
    camera: { offsetX: 0, offsetY: 0, zoom },
    ctx,
    height: 600,
    hoveredTarget: null,
    motion: {
      plan: makePlan(),
      reducedMotion: true,
      timeSeconds: 0,
      wallClockHour: 12,
    },
    selectedTarget: null,
    shipMotionSamples: new Map<string, ShipMotionSample>(),
    targets: [],
    width: 800,
    world: { ships } as unknown as PharosVilleWorld,
  };
}

function makeFrame(positions: ReadonlyMap<string, { x: number; y: number }>): ShipRenderFrame {
  return {
    cache: {
      assetForEntity: () => null,
      geometryForEntity: (entity: ShipNode) => {
        const position = positions.get(entity.id) ?? { x: 0, y: 0 };
        return makeGeometry(position.x, position.y);
      },
    } as unknown as ShipRenderFrame["cache"],
    shipRenderStates: new Map(),
  };
}

describe("drawShipNameplates", () => {
  beforeEach(() => {
    resetPlateSpriteCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("draws nothing below the zoom gate", () => {
    const ships = [makeShip("usdt-tether", "titan")];
    const ctx = makeCtx();
    const frame = makeFrame(new Map([["usdt-tether", { x: 200, y: 200 }]]));
    const drawn = drawShipNameplates(makeInput(ctx, ships, 0.9), frame, ships);
    expect(drawn).toBe(0);
    expect(ctx.calls.filter((call) => call.method === "fillText")).toHaveLength(0);
  });

  it("draws one plate per visible ship at near zoom", () => {
    const ships = [
      makeShip("alpha-dollar", "major"),
      makeShip("bravo-dollar", "skiff"),
    ];
    const ctx = makeCtx();
    const frame = makeFrame(new Map([
      ["alpha-dollar", { x: 150, y: 150 }],
      ["bravo-dollar", { x: 500, y: 400 }],
    ]));
    const drawn = drawShipNameplates(makeInput(ctx, ships, 1.5), frame, ships);
    expect(drawn).toBe(2);
    const labels = ctx.calls.filter((call) => call.method === "fillText").map((call) => call.args[0]);
    expect(labels).toContain("ALPH");
    expect(labels).toContain("BRAV");
  });

  it("rejects overlapping plates, keeping the higher size tier", () => {
    const ships = [
      makeShip("small-dollar", "skiff"),
      makeShip("big-dollar", "flagship"),
    ];
    const ctx = makeCtx();
    // Same position: both plates would land on the same rect.
    const frame = makeFrame(new Map([
      ["small-dollar", { x: 300, y: 300 }],
      ["big-dollar", { x: 300, y: 300 }],
    ]));
    const drawn = drawShipNameplates(makeInput(ctx, ships, 1.5), frame, ships);
    expect(drawn).toBe(1);
    const labels = ctx.calls.filter((call) => call.method === "fillText").map((call) => call.args[0]);
    expect(labels).toEqual(["BIG-"]);
  });

  it("skips ships fully outside the viewport", () => {
    const ships = [makeShip("offmap-dollar", "major")];
    const ctx = makeCtx();
    const frame = makeFrame(new Map([["offmap-dollar", { x: -500, y: -500 }]]));
    const drawn = drawShipNameplates(makeInput(ctx, ships, 1.5), frame, ships);
    expect(drawn).toBe(0);
  });

  // --- V1.5 plate sprite cache ----------------------------------------------

  it("blits cached plate sprites via drawImage when offscreen canvases are available", () => {
    const offscreenRecorders: Array<{ calls: readonly RecordedCanvasCall[] }> = [];
    // Node test env has no document; provide a canvas-factory stand-in so the
    // sprite path activates.
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag !== "canvas") throw new Error(`unexpected createElement(${tag})`);
        const recording = buildRecordingCanvasContext({
          methods: ["scale", "beginPath", "rect", "roundRect", "fill", "stroke", "fillText"],
          returningMethods: { measureText: () => ({ width: 24 }) },
        });
        offscreenRecorders.push({ calls: recording.calls });
        return {
          width: 0,
          height: 0,
          getContext: () => recording.ctx,
        } as unknown as HTMLCanvasElement;
      },
    });

    const ships = [makeShip("alpha-dollar", "major")];
    const ctx = makeCtx();
    const frame = makeFrame(new Map([["alpha-dollar", { x: 150, y: 150 }]]));
    const drawn = drawShipNameplates(makeInput(ctx, ships, 1.5), frame, ships);

    expect(drawn).toBe(1);
    // The main ctx blits the sprite instead of rasterizing text directly.
    expect(ctx.calls.filter((call) => call.method === "drawImage")).toHaveLength(1);
    expect(ctx.calls.filter((call) => call.method === "fillText")).toHaveLength(0);
    // The sprite itself rendered the plate once.
    expect(offscreenRecorders).toHaveLength(1);
    expect(offscreenRecorders[0]!.calls.filter((call) => call.method === "fillText")).toHaveLength(1);

    // Second draw of the same label reuses the cached sprite (no new canvas).
    const ctx2 = makeCtx();
    const frame2 = makeFrame(new Map([["alpha-dollar", { x: 150, y: 150 }]]));
    drawShipNameplates(makeInput(ctx2, ships, 1.5), frame2, ships);
    expect(offscreenRecorders).toHaveLength(1);
    expect(plateSpriteCacheStats().hits).toBeGreaterThan(0);
  });

  it("falls back to direct text rendering when offscreen 2D contexts are unavailable", () => {
    // jsdom default: createElement("canvas").getContext("2d") → null.
    const ships = [makeShip("alpha-dollar", "major")];
    const ctx = makeCtx();
    const frame = makeFrame(new Map([["alpha-dollar", { x: 150, y: 150 }]]));
    const drawn = drawShipNameplates(makeInput(ctx, ships, 1.5), frame, ships);
    expect(drawn).toBe(1);
    expect(ctx.calls.filter((call) => call.method === "fillText")).toHaveLength(1);
  });
});
