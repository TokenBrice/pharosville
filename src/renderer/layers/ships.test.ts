import { describe, expect, it, vi } from "vitest";
import { MAKER_SQUAD_FLAGSHIP_ID } from "../../systems/maker-squad";
import type { PharosVilleMotionPlan, ShipMotionSample } from "../../systems/motion";
import type { PharosVilleWorld, ShipNode } from "../../systems/world-types";
import type { LoadedPharosVilleAsset } from "../asset-manager";
import type { ResolvedEntityGeometry } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";
import { drawShipWake, drawSquadIdentityAccent, type ShipRenderFrame } from "./ships";

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

  it("renders weathered hull patches only for DAI", () => {
    const ctx = makeRecordingCtx();
    drawSquadIdentityAccent(ctx, "dai-makerdao", 0, 0, 1);
    // Four patches, each with a fill and a stroke.
    const rectCount = ctx.calls.filter((call) => call.method === "rect").length;
    expect(rectCount).toBe(4);
    const fillCount = ctx.calls.filter((call) => call.method === "fill").length;
    expect(fillCount).toBe(4);
  });

  it("renders nothing for ships outside the Maker squad", () => {
    for (const id of ["usdc-circle", "usdt-tether", "frax-finance", "susds-sky", "sdai-sky"]) {
      const ctx = makeRecordingCtx();
      drawSquadIdentityAccent(ctx, id, 0, 0, 1);
      expect(ctx.calls).toHaveLength(0);
    }
  });
});

// --- Synchronised squad wake ordering --------------------------------------

function makeShipNode(overrides: Partial<ShipNode> & Pick<ShipNode, "id" | "tile">): ShipNode {
  // Wake/render path only reads id, tile, squadId/squadRole, change24hPct,
  // riskZone, and visual.sizeTier/spriteAssetId on the no-asset/static
  // path. Build a minimal stub via `unknown` cast — the real ShipNode is
  // far wider, but we don't exercise those fields here.
  const stub = {
    kind: "ship",
    label: overrides.id,
    symbol: overrides.id.toUpperCase(),
    riskTile: overrides.tile,
    riskZone: "calm",
    visual: {
      hull: "treasury-galleon",
      sizeTier: "major",
      scale: 1,
      livery: {},
    },
    change24hUsd: 0,
    change24hPct: 0,
    detailId: `ship.${overrides.id}`,
    ...overrides,
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
      id: MAKER_SQUAD_FLAGSHIP_ID,
      tile: { x: 10, y: 10 },
      squadId: "maker",
      squadRole: "flagship",
    });
    const consort = makeShipNode({
      id: "dai-makerdao",
      tile: { x: 12, y: 12 },
      squadId: "maker",
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
      id: MAKER_SQUAD_FLAGSHIP_ID,
      tile: { x: 10, y: 10 },
      squadId: "maker",
      squadRole: "flagship",
    });
    const consort = makeShipNode({
      id: "dai-makerdao",
      tile: { x: 12, y: 12 },
      squadId: "maker",
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
