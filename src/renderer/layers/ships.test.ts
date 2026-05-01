import { describe, expect, it, vi } from "vitest";
import { MAKER_SQUAD_FLAGSHIP_ID } from "../../systems/maker-squad";
import type { PharosVilleMotionPlan, ShipMotionSample } from "../../systems/motion";
import type { PharosVilleWorld, ShipNode } from "../../systems/world-types";
import type { LoadedPharosVilleAsset } from "../asset-manager";
import * as canvasPrimitives from "../canvas-primitives";
import type { ResolvedEntityGeometry } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";
import { SHIP_SAIL_TINT_MASKS } from "../ship-sail-tint";
import {
  drawShipBody,
  drawShipWake,
  drawSquadIdentityAccent,
  planShipRenderLod,
  SHIP_PEG_MARKS,
  SHIP_SAIL_MARKS,
  SHIP_TRIM_MARKS,
  shipMastTopScreenPoint,
  TITAN_SPRITE_IDS,
  type ShipRenderFrame,
} from "./ships";

vi.mock("../canvas-primitives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../canvas-primitives")>();
  return {
    ...actual,
    drawAsset: vi.fn(actual.drawAsset),
    drawAnimatedAsset: vi.fn(actual.drawAnimatedAsset),
  };
});

// --- Identity accent dispatch ----------------------------------------------

interface RecordingCtx {
  calls: Array<{ method: string; args: unknown[] }>;
}

function makeRecordingCtx(): CanvasRenderingContext2D & RecordingCtx {
  const calls: RecordingCtx["calls"] = [];
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return undefined;
  };
  const ctx: Record<string, unknown> = {
    calls,
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    rect: record("rect"),
    arc: record("arc"),
    ellipse: record("ellipse"),
    quadraticCurveTo: record("quadraticCurveTo"),
    fill: record("fill"),
    stroke: record("stroke"),
    fillRect: record("fillRect"),
    setLineDash: record("setLineDash"),
    translate: record("translate"),
    rotate: record("rotate"),
    scale: record("scale"),
    drawImage: record("drawImage"),
    fillText: record("fillText"),
    createRadialGradient: vi.fn(() => ({
      addColorStop: () => undefined,
    })),
  };
  return ctx as unknown as CanvasRenderingContext2D & RecordingCtx;
}

// These tests verify that the right helper fires for the right ship.id and
// that calls hit the canvas (counts of fills/strokes/rects). They do NOT
// verify rendered geometry — visual baselines (test:visual) are the canonical
// source of truth for shape correctness. Geometric assertions here would just
// duplicate the snapshot's job and brittle-fail on any tuning pass.
describe("drawSquadIdentityAccent", () => {
  it("renders the admiral's banner only for the USDS flagship", () => {
    const ctx = makeRecordingCtx();
    drawSquadIdentityAccent(ctx, "usds-sky", 0, 0, 1);
    // Banner draws two paths (rect + forked tip), each with fill+stroke.
    const fillCount = ctx.calls.filter((call) => call.method === "fill").length;
    const strokeCount = ctx.calls.filter((call) => call.method === "stroke").length;
    expect(fillCount).toBeGreaterThanOrEqual(2);
    expect(strokeCount).toBeGreaterThanOrEqual(2);
    // Rect is unique to the banner among the three accents.
    expect(ctx.calls.some((call) => call.method === "rect")).toBe(true);
  });

  it("renders a forge-glow radial gradient only for stUSDS", () => {
    const ctx = makeRecordingCtx();
    const radial = ctx.createRadialGradient as unknown as ReturnType<typeof vi.fn>;
    drawSquadIdentityAccent(ctx, "stusds-sky", 10, 20, 1);
    expect(radial).toHaveBeenCalledTimes(1);
    expect(ctx.calls.some((call) => call.method === "arc")).toBe(true);
    expect(ctx.calls.some((call) => call.method === "fill")).toBe(true);
  });

  it("renders weathered hull patches and admiral banner for Maker flagship DAI", () => {
    // DAI is the Maker squad's flagship, so it gets both the admiral's banner
    // (flagship signal, like USDS) and weathered patches (elder-consort lore).
    const ctx = makeRecordingCtx();
    drawSquadIdentityAccent(ctx, "dai-makerdao", 0, 0, 1);
    // Four weathered patches plus the banner contribute fills and rects.
    const rectCount = ctx.calls.filter((call) => call.method === "rect").length;
    expect(rectCount).toBeGreaterThanOrEqual(4);
    const fillCount = ctx.calls.filter((call) => call.method === "fill").length;
    expect(fillCount).toBeGreaterThanOrEqual(4);
  });

  it("renders nothing for ships outside the Maker squad", () => {
    for (const id of ["usdc-circle", "usdt-tether", "frax-finance", "susds-sky", "sdai-sky"]) {
      const ctx = makeRecordingCtx();
      drawSquadIdentityAccent(ctx, id, 0, 0, 1);
      expect(ctx.calls).toHaveLength(0);
    }
  });
});

// --- Per-titan offset table coverage ---------------------------------------

describe("Maker squad titan offset tables", () => {
  it("every Maker squad titan sprite is registered in all per-titan offset tables", () => {
    const titanIds = [
      "ship.usds-titan",
      "ship.dai-titan",
      "ship.susds-titan",
      "ship.sdai-titan",
      "ship.stusds-titan",
    ];
    for (const titanId of titanIds) {
      expect(TITAN_SPRITE_IDS.has(titanId)).toBe(true);
      expect(SHIP_SAIL_MARKS[titanId]).toBeDefined();
      expect(SHIP_PEG_MARKS[titanId]).toBeDefined();
      expect(SHIP_TRIM_MARKS[titanId]).toBeDefined();
      expect(SHIP_SAIL_TINT_MASKS[titanId]).toBeDefined();
    }
  });
});

// --- Per-unique offset table coverage --------------------------------------

describe("Unique ship offset tables", () => {
  it("every unique-tier sprite is registered in all per-sprite offset tables", () => {
    const uniqueIds = [
      "ship.crvusd-unique",
      "ship.xaut-unique",
      "ship.paxg-unique",
    ];
    for (const uniqueId of uniqueIds) {
      expect(SHIP_SAIL_MARKS[uniqueId]).toBeDefined();
      expect(SHIP_PEG_MARKS[uniqueId]).toBeDefined();
      expect(SHIP_TRIM_MARKS[uniqueId]).toBeDefined();
      expect(SHIP_SAIL_TINT_MASKS[uniqueId]).toBeDefined();
    }
  });
});

// --- Static draw path for unique sprites -----------------------------------

describe("drawShipBody for unique sprites", () => {
  it("renders unique ships through the static drawAsset path, not drawAnimatedAsset", () => {
    const drawAssetMock = vi.mocked(canvasPrimitives.drawAsset);
    const drawAnimatedAssetMock = vi.mocked(canvasPrimitives.drawAnimatedAsset);
    drawAssetMock.mockClear();
    drawAnimatedAssetMock.mockClear();

    const unique = makeShipNode({
      id: "crvusd-curve",
      tile: { x: 10, y: 10 },
      visual: {
        sizeTier: "unique",
        spriteAssetId: "ship.crvusd-unique",
        livery: {
          label: "Curve livery",
          source: "stablecoin-logo",
          sailColor: "#d9ecdf",
          primary: "#41956b",
          accent: "#e8d6a4",
          secondary: "#3a684a",
          logoMatte: "#fbf3df",
          logoShape: "circle",
          sailPanel: "center",
          stripePattern: "single",
        },
      },
    });

    const fakeAsset: LoadedPharosVilleAsset = {
      entry: {
        anchor: [68, 92],
        category: "ship",
        displayScale: 1,
        footprint: [46, 22],
        height: 100,
        hitbox: [30, 4, 92, 90],
        id: "ship.crvusd-unique",
        layer: "ships",
        loadPriority: "deferred",
        path: "ships/crvusd-unique.png",
        width: 136,
      },
      image: {} as HTMLImageElement,
    };

    const ctx = makeRecordingCtx();
    const input = {
      assets: null,
      camera: { offsetX: 0, offsetY: 0, zoom: 1 },
      ctx,
      height: 600,
      hoveredTarget: null,
      motion: {
        plan: makeMotionPlan([]),
        reducedMotion: false,
        timeSeconds: 0,
        wallClockHour: 12,
      },
      selectedTarget: null,
      shipMotionSamples: new Map<string, ShipMotionSample>(),
      targets: [],
      width: 800,
      world: { ships: [unique] } as unknown as PharosVilleWorld,
    } satisfies DrawPharosVilleInput;

    const frame: ShipRenderFrame = {
      cache: {
        assetForEntity: () => fakeAsset,
        geometryForEntity: () => makeGeometry(200, 100),
      },
      shipRenderStates: new Map(),
    };

    drawShipBody(input, frame, unique);

    expect(drawAnimatedAssetMock).not.toHaveBeenCalled();
    expect(drawAssetMock).toHaveBeenCalledTimes(1);
  });
});

// --- Synchronised squad wake ordering --------------------------------------

function makeShipNode(
  overrides: Omit<Partial<ShipNode>, "visual"> & Pick<ShipNode, "id" | "tile"> & { visual?: Partial<ShipNode["visual"]> },
): ShipNode {
  // Wake/render path only reads id, tile, squadId/squadRole, change24hPct,
  // riskZone, and visual.sizeTier/spriteAssetId on the no-asset/static
  // path. Build a minimal stub via `unknown` cast — the real ShipNode is
  // far wider, but we don't exercise those fields here.
  const visual = {
    hull: "treasury-galleon",
    sizeTier: "major",
    scale: 1,
    livery: {},
    ...overrides.visual,
  };
  const { visual: _visualOverride, ...rest } = overrides;
  const stub = {
    kind: "ship",
    label: overrides.id,
    symbol: overrides.id.toUpperCase(),
    riskTile: overrides.tile,
    riskZone: "calm",
    change24hUsd: 0,
    change24hPct: 0,
    detailId: `ship.${overrides.id}`,
    ...rest,
    visual,
  };
  return stub as unknown as ShipNode;
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

function makeMotionPlan(moverIds: readonly string[]): PharosVilleMotionPlan {
  return {
    animatedShipIds: new Set<string>(),
    effectShipIds: new Set<string>(),
    lighthouseFireFlickerPerSecond: 0,
    moverShipIds: new Set<string>(moverIds),
    shipPhases: new Map(),
    shipRoutes: new Map(),
  };
}

function makeMotionSample(shipId: string): ShipMotionSample {
  return {
    shipId,
    tile: { x: 0, y: 0 },
    state: "sailing",
    zone: "calm",
    currentDockId: null,
    currentRouteStopId: null,
    currentRouteStopKind: null,
    heading: { x: -1, y: 0 },
    wakeIntensity: 0.4,
  };
}

describe("drawShipWake squad ordering", () => {
  it("draws the flagship's wake before a consort's when both are mover ships", () => {
    const flagship = makeShipNode({
      id: MAKER_SQUAD_FLAGSHIP_ID, // "usds-sky"
      tile: { x: 10, y: 10 },
      squadId: "sky",
      squadRole: "flagship",
    });
    const consort = makeShipNode({
      id: "stusds-sky", // Sky-squad vanguard consort
      tile: { x: 12, y: 12 },
      squadId: "sky",
      squadRole: "consort",
    });

    // Distinct draw points so we can tell whose wake painted first.
    const FLAGSHIP_X = 100;
    const CONSORT_X = 250;
    const geometryById = new Map<string, ResolvedEntityGeometry>([
      [flagship.id, makeGeometry(FLAGSHIP_X, 50)],
      [consort.id, makeGeometry(CONSORT_X, 50)],
    ]);

    const ctx = makeRecordingCtx();
    const input = {
      assets: null,
      camera: { offsetX: 0, offsetY: 0, zoom: 1 },
      ctx,
      height: 600,
      hoveredTarget: null,
      motion: {
        plan: makeMotionPlan([flagship.id, consort.id]),
        reducedMotion: false,
        timeSeconds: 0,
        wallClockHour: 12,
      },
      selectedTarget: null,
      shipMotionSamples: new Map<string, ShipMotionSample>([
        [flagship.id, makeMotionSample(flagship.id)],
        [consort.id, makeMotionSample(consort.id)],
      ]),
      targets: [],
      width: 800,
      world: { ships: [flagship, consort] } as unknown as PharosVilleWorld,
    } satisfies DrawPharosVilleInput;

    const frame: ShipRenderFrame = {
      cache: {
        assetForEntity: () => null as LoadedPharosVilleAsset | null,
        geometryForEntity: (entity) => geometryById.get(entity.id) ?? makeGeometry(0, 0),
      },
      shipRenderStates: new Map(),
      visibleShips: [flagship, consort],
      wakeDrawnShipIds: new Set<string>(),
    };

    // Entity-pass ordering: consort first (e.g., closer iso depth) — the
    // squad wake reordering should still ensure flagship paints first.
    drawShipWake(input, frame, consort);
    drawShipWake(input, frame, flagship);

    const flagshipFirstIndex = ctx.calls.findIndex(
      (call) => call.args.includes(FLAGSHIP_X) || (call.method === "ellipse" && call.args[0] === FLAGSHIP_X),
    );
    const consortFirstIndex = ctx.calls.findIndex(
      (call) => call.args.includes(CONSORT_X) || (call.method === "ellipse" && call.args[0] === CONSORT_X),
    );

    expect(flagshipFirstIndex).toBeGreaterThanOrEqual(0);
    expect(consortFirstIndex).toBeGreaterThanOrEqual(0);
    expect(flagshipFirstIndex).toBeLessThan(consortFirstIndex);

    expect(frame.wakeDrawnShipIds!.has(flagship.id)).toBe(true);
    expect(frame.wakeDrawnShipIds!.has(consort.id)).toBe(true);
  });

  it("does not double-draw the flagship's wake when its turn arrives", () => {
    const flagship = makeShipNode({
      id: MAKER_SQUAD_FLAGSHIP_ID, // "usds-sky"
      tile: { x: 10, y: 10 },
      squadId: "sky",
      squadRole: "flagship",
    });
    const consort = makeShipNode({
      id: "stusds-sky", // Sky-squad vanguard consort
      tile: { x: 12, y: 12 },
      squadId: "sky",
      squadRole: "consort",
    });

    const FLAGSHIP_X = 100;
    const CONSORT_X = 250;
    const geometryById = new Map<string, ResolvedEntityGeometry>([
      [flagship.id, makeGeometry(FLAGSHIP_X, 50)],
      [consort.id, makeGeometry(CONSORT_X, 50)],
    ]);

    const ctx = makeRecordingCtx();
    const input = {
      assets: null,
      camera: { offsetX: 0, offsetY: 0, zoom: 1 },
      ctx,
      height: 600,
      hoveredTarget: null,
      motion: {
        plan: makeMotionPlan([flagship.id, consort.id]),
        reducedMotion: false,
        timeSeconds: 0,
        wallClockHour: 12,
      },
      selectedTarget: null,
      shipMotionSamples: new Map<string, ShipMotionSample>([
        [flagship.id, makeMotionSample(flagship.id)],
        [consort.id, makeMotionSample(consort.id)],
      ]),
      targets: [],
      width: 800,
      world: { ships: [flagship, consort] } as unknown as PharosVilleWorld,
    } satisfies DrawPharosVilleInput;

    const frame: ShipRenderFrame = {
      cache: {
        assetForEntity: () => null,
        geometryForEntity: (entity) => geometryById.get(entity.id) ?? makeGeometry(0, 0),
      },
      shipRenderStates: new Map(),
      visibleShips: [flagship, consort],
      wakeDrawnShipIds: new Set<string>(),
    };

    drawShipWake(input, frame, consort);
    drawShipWake(input, frame, flagship);

    const flagshipPaints = ctx.calls.filter(
      (call) => call.method === "ellipse" && call.args[0] === FLAGSHIP_X,
    ).length;
    // The contact-shadow ellipse fires exactly once per wake-raw call, so
    // a single ellipse at the flagship's x means the flagship was painted
    // exactly once even though both consort and flagship draw calls ran.
    expect(flagshipPaints).toBe(1);
  });
});

// --- Titan foam scaling regression -----------------------------------------

// Confirms the titan-chrome offsets in drawTitanHullFoam / drawTitanBowSpray
// are all multiplied by geometry.drawScale (no hardcoded pixel drift). This
// guards smaller squad consorts (e.g. sUSDS / sDAI at scale 1.35) from
// inheriting an oversized USDS-titan foam silhouette that would punch outside
// the hull bounds.
describe("titan foam scaling stays within hull bounds", () => {
  it("keeps all foam stroke coordinates near the ship origin for a small consort", () => {
    const consort = makeShipNode({
      id: "susds-sky",
      tile: { x: 8, y: 8 },
      squadId: "maker",
      squadRole: "consort",
    });
    (consort as { visual: { hull: string; spriteAssetId: string; sizeTier: string; scale: number; livery: unknown } }).visual = {
      hull: "chartered-brigantine",
      spriteAssetId: "ship.susds-titan",
      sizeTier: "titan",
      scale: 1.35,
      livery: {},
    };

    const ORIGIN_X = 200;
    const ORIGIN_Y = 100;
    const DRAW_SCALE = 1.35;
    const geometry: ResolvedEntityGeometry = {
      assetScale: null,
      depth: 0,
      depthTile: { x: 0, y: 0 },
      drawPoint: { x: ORIGIN_X, y: ORIGIN_Y },
      drawScale: DRAW_SCALE,
      followTile: { x: 0, y: 0 },
      screenPoint: { x: ORIGIN_X, y: ORIGIN_Y },
      selectionRect: { x: ORIGIN_X - 16, y: ORIGIN_Y - 16, width: 32, height: 32 },
      semanticTile: { x: 0, y: 0 },
      targetRect: { x: ORIGIN_X - 16, y: ORIGIN_Y - 16, width: 32, height: 32 },
    };

    const ctx = makeRecordingCtx();
    const input = {
      assets: null,
      camera: { offsetX: 0, offsetY: 0, zoom: 1 },
      ctx,
      height: 600,
      hoveredTarget: null,
      motion: {
        plan: makeMotionPlan([consort.id]),
        reducedMotion: false,
        timeSeconds: 0,
        wallClockHour: 12,
      },
      selectedTarget: null,
      shipMotionSamples: new Map<string, ShipMotionSample>([
        [consort.id, makeMotionSample(consort.id)],
      ]),
      targets: [],
      width: 800,
      world: { ships: [consort] } as unknown as PharosVilleWorld,
    } satisfies DrawPharosVilleInput;

    const frame: ShipRenderFrame = {
      cache: {
        assetForEntity: () => null as LoadedPharosVilleAsset | null,
        geometryForEntity: () => geometry,
      },
      shipRenderStates: new Map(),
      visibleShips: [consort],
      wakeDrawnShipIds: new Set<string>(),
    };

    drawShipWake(input, frame, consort);

    // Extract every coordinate emitted by stroke-path primitives. moveTo /
    // lineTo carry a single (x,y) pair; quadraticCurveTo carries (cx,cy,x,y).
    // ellipse calls also pass coordinates but those are contact-shadow / wake
    // primitives we're not regressing here — keep them out of the bound.
    const STROKE_METHODS = new Set(["moveTo", "lineTo", "quadraticCurveTo"]);
    const strokeCoords: Array<{ x: number; y: number }> = [];
    for (const call of ctx.calls) {
      if (!STROKE_METHODS.has(call.method)) continue;
      const args = call.args as number[];
      // quadraticCurveTo: (cx, cy, x, y) — record both control and endpoint.
      for (let index = 0; index + 1 < args.length; index += 2) {
        strokeCoords.push({ x: args[index], y: args[index + 1] });
      }
    }

    // Sanity: at least the foam strokes fired (drawTitanHullFoam draws two
    // quadratic curves; drawTitanBowSpray draws three line segments).
    expect(strokeCoords.length).toBeGreaterThan(0);

    // Coarse bound: every stroke coordinate stays within ±100px on x and
    // ±50px on y of the ship draw origin, even at the consort's draw scale.
    // If any titan-chrome offset were a hardcoded pixel value rather than
    // multiplied by drawScale, it would exceed this bound at scales >1.
    for (const { x, y } of strokeCoords) {
      const dx = x - ORIGIN_X;
      const dy = y - ORIGIN_Y;
      expect(Math.abs(dx), `dx ${dx} from origin`).toBeLessThanOrEqual(100);
      expect(Math.abs(dy), `dy ${dy} from origin`).toBeLessThanOrEqual(50);
    }
  });
});

// --- Mast-top fallback ------------------------------------------------------

describe("shipMastTopScreenPoint", () => {
  it("falls back to galleon offsets for unknown sprite/hull keys", () => {
    const ship = makeShipNode({
      id: "test-unknown",
      tile: { x: 5, y: 5 },
    });
    // Override visual to use a hull key that is NOT in SHIP_SAIL_MARKS.
    (ship as { visual: { hull: string; spriteAssetId?: string; sizeTier: string; scale: number; livery: unknown } }).visual = {
      hull: "fictional-hull",
      spriteAssetId: undefined,
      sizeTier: "major",
      scale: 1,
      livery: {},
    };

    const ctx = makeRecordingCtx();
    const input = {
      assets: null,
      camera: { offsetX: 0, offsetY: 0, zoom: 1 },
      ctx,
      height: 600,
      hoveredTarget: null,
      motion: {
        plan: makeMotionPlan([]),
        reducedMotion: false,
        timeSeconds: 0,
        wallClockHour: 12,
      },
      selectedTarget: null,
      shipMotionSamples: new Map<string, ShipMotionSample>(),
      targets: [],
      width: 800,
      world: { ships: [ship] } as unknown as PharosVilleWorld,
    } satisfies DrawPharosVilleInput;

    const frame: ShipRenderFrame = {
      cache: {
        assetForEntity: () => null,
        geometryForEntity: () => makeGeometry(120, 80),
      },
      shipRenderStates: new Map(),
    };

    const point = shipMastTopScreenPoint(input, frame, ship);
    expect(Number.isFinite(point.x)).toBe(true);
    expect(Number.isFinite(point.y)).toBe(true);
  });
});

describe("planShipRenderLod", () => {
  it("keeps selected, titan, and unique ships in wake/overlay sets while budget-throttling dense fleets", () => {
    const selected = makeShipNode({
      id: "selected-local",
      detailId: "ship.selected-local",
      tile: { x: 8, y: 8 },
      visual: { sizeTier: "local" },
    });
    const titan = makeShipNode({
      id: "titan-major",
      detailId: "ship.titan-major",
      tile: { x: 10, y: 10 },
      visual: { sizeTier: "titan", spriteAssetId: "ship.usdc-titan" },
    });
    const unique = makeShipNode({
      id: "unique-major",
      detailId: "ship.unique-major",
      tile: { x: 11, y: 11 },
      visual: { sizeTier: "unique", spriteAssetId: "ship.crvusd-unique" },
    });
    const filler = Array.from({ length: 48 }, (_unused, index) => makeShipNode({
      id: `ship-${index}`,
      detailId: `ship.ship-${index}`,
      tile: { x: 12 + index * 0.2, y: 10 + index * 0.2 },
      visual: { sizeTier: "local" },
    }));
    const visibleShips = [selected, titan, unique, ...filler];

    const input = {
      camera: { offsetX: 0, offsetY: 0, zoom: 0.9 },
      height: 760,
      hoveredTarget: null,
      motion: {
        plan: makeMotionPlan([]),
        reducedMotion: false,
        timeSeconds: 0,
        wallClockHour: 12,
      },
      selectedTarget: {
        detailId: selected.detailId,
        id: selected.id,
        kind: "ship",
        label: selected.label,
        priority: 0,
        rect: { height: 20, width: 20, x: 0, y: 0 },
      },
      shipMotionSamples: new Map<string, ShipMotionSample>(),
      width: 1280,
    } as const;

    const cache = {
      geometryForEntity: (entity: { id: string }) => {
        const index = visibleShips.findIndex((ship) => ship.id === entity.id);
        const x = 50 + index * 30;
        const y = index % 2 === 0 ? 160 : 900;
        return makeGeometry(x, y);
      },
    };

    const lod = planShipRenderLod(input, cache, visibleShips);
    expect(lod.drawOverlayShipIds.has(selected.id)).toBe(true);
    expect(lod.drawWakeShipIds.has(selected.id)).toBe(true);
    expect(lod.drawOverlayShipIds.has(titan.id)).toBe(true);
    expect(lod.drawWakeShipIds.has(titan.id)).toBe(true);
    expect(lod.drawOverlayShipIds.has(unique.id)).toBe(true);
    expect(lod.drawWakeShipIds.has(unique.id)).toBe(true);
    expect(lod.drawOverlayShipIds.size).toBeLessThan(visibleShips.length);
    expect(lod.drawWakeShipIds.size).toBeLessThan(visibleShips.length);
  });
});
