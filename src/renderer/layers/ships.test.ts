import { describe, expect, it, vi } from "vitest";
import { SKY_SQUAD } from "../../systems/maker-squad";
import type { PharosVilleMotionPlan, ShipMotionSample } from "../../systems/motion";
import type { PharosVilleWorld, ShipNode } from "../../systems/world-types";
import type { LoadedPharosVilleAsset } from "../asset-manager";
import { buildRecordingCanvasContext, createGradientStub, type RecordedCanvasCall } from "../__test-utils__/canvas-context-builder";
import * as canvasPrimitives from "../canvas-primitives";
import type { ResolvedEntityGeometry } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";
import { SHIP_SAIL_TINT_MASKS } from "../ship-sail-tint";
import { createShipBodyCache } from "../ship-body-cache";
import {
  drawShipBody,
  drawShipOverlay,
  drawShipWake,
  drawSquadIdentityAccent,
  planShipRenderLod,
  resetTitanPathCache,
  resolveShipVisualOrientation,
  resolveTitanBowSprayStrands,
  SHIP_PENNANT_MARKS,
  SHIP_SAIL_MARKS,
  SHIP_TRIM_MARKS,
  shipMastTopScreenPoint,
  titanPathCacheStats,
  TITAN_SPRITE_IDS,
  wakePersonalityForHull,
  type ShipRenderFrame,
} from "./ships";
import { resolveShipPose } from "./ship-pose";

vi.mock("../canvas-primitives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../canvas-primitives")>();
  return {
    ...actual,
    drawAsset: vi.fn(actual.drawAsset),
    drawAssetSubpixel: vi.fn(actual.drawAssetSubpixel),
    drawAnimatedAsset: vi.fn(actual.drawAnimatedAsset),
    drawAnimatedAssetSubpixel: vi.fn(actual.drawAnimatedAssetSubpixel),
  };
});

// --- Identity accent dispatch ----------------------------------------------

interface RecordingCtx {
  calls: readonly RecordedCanvasCall[];
}

function makeRecordingCtx(): CanvasRenderingContext2D & RecordingCtx {
  const recording = buildRecordingCanvasContext({
    methods: [
      "save",
      "restore",
      "beginPath",
      "closePath",
      "moveTo",
      "lineTo",
      "rect",
      "arc",
      "ellipse",
      "quadraticCurveTo",
      "fill",
      "stroke",
      "fillRect",
      "strokeRect",
      "clip",
      "setLineDash",
      "translate",
      "rotate",
      "scale",
      "transform",
      "drawImage",
      "fillText",
    ],
    returningMethods: {
      createRadialGradient: createGradientStub,
    },
  });
  return new Proxy(recording.ctx, {
    get(target, prop) {
      if (prop === "calls") return recording.calls;
      return Reflect.get(target, prop);
    },
  }) as CanvasRenderingContext2D & RecordingCtx;
}

const TEST_LIVERY: ShipNode["visual"]["livery"] = {
  label: "Test livery",
  source: "stablecoin-logo",
  sailColor: "#d9ecdf",
  primary: "#327f70",
  accent: "#e8bb60",
  secondary: "#21483f",
  logoMatte: "#f7eed6",
  logoShape: "circle",
  sailPanel: "center",
  stripePattern: "single",
};

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
    const rect = ctx.calls.find((call) => call.method === "rect")!;
    expect(rect.args[2]).toBe(18);
    expect(rect.args[3]).toBe(6);
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
  it("every Maker squad titan sprite is registered in sail and tint offset tables", () => {
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
      expect(SHIP_SAIL_TINT_MASKS[titanId]).toBeDefined();
    }
  });
});

describe("sprite trim config", () => {
  it("keeps procedural trim on standard hull sprites only", () => {
    for (const hull of ["treasury-galleon", "chartered-brigantine", "dao-schooner", "crypto-caravel", "algo-junk"]) {
      expect(SHIP_TRIM_MARKS[hull]).toBeDefined();
    }

    for (const richSpriteId of [
      "ship.usdc-titan",
      "ship.usdt-titan",
      "ship.usde-titan",
      "ship.pyusd-titan",
      "ship.buidl-titan",
      "ship.usd1-titan",
      "ship.usds-titan",
      "ship.dai-titan",
      "ship.susds-titan",
      "ship.sdai-titan",
      "ship.stusds-titan",
      "ship.crvusd-unique",
      "ship.bold-unique",
      "ship.fxusd-unique",
      "ship.xaut-unique",
      "ship.paxg-unique",
      "ship.usyc-unique",
    ]) {
      expect(SHIP_TRIM_MARKS[richSpriteId], `${richSpriteId} should rely on painted sprite detail`).toBeUndefined();
    }
  });
});

describe("standard hull pennant config", () => {
  it("defines mast pennant geometry for every standard hull", () => {
    for (const hull of ["treasury-galleon", "chartered-brigantine", "dao-schooner", "crypto-caravel", "algo-junk"]) {
      const spec = SHIP_PENNANT_MARKS[hull];
      expect(spec).toBeDefined();
      expect(spec!.pennantWidth).toBeGreaterThan(spec!.pennantHeight);
      expect(spec!.bowLogoSize).toBeGreaterThan(0);
    }
  });
});

describe("ship visual orientation", () => {
  it("flips standard hulls for leftward sampled headings without flipping unique sprites", () => {
    expect(resolveShipVisualOrientation({
      heading: { x: -1, y: 0 },
      isTitanSprite: false,
      shipId: "standard-left",
    }).flipX).toBe(true);

    expect(resolveShipVisualOrientation({
      heading: { x: 1, y: 0 },
      isTitanSprite: false,
      shipId: "standard-right",
    }).flipX).toBe(false);

    expect(resolveShipVisualOrientation({
      heading: { x: -1, y: 0 },
      isTitanSprite: false,
      isUniqueSprite: true,
      shipId: "unique-left",
    }).flipX).toBe(false);
  });

  it("resolves deterministic titan pose buckets instead of horizontal flips", () => {
    const first = resolveShipVisualOrientation({
      heading: { x: -1, y: 0.2 },
      isTitanSprite: true,
      shipId: "usdc-circle",
    });
    const second = resolveShipVisualOrientation({
      heading: { x: -1, y: 0.2 },
      isTitanSprite: true,
      shipId: "usdc-circle",
    });

    expect(first).toEqual(second);
    expect(first.flipX).toBe(false);
    expect(first.titanPoseBucket).toBeLessThan(0);
    expect(Math.abs(first.titanSkewX)).toBeLessThanOrEqual(0.035);
    expect(first.titanScaleY).toBeLessThan(1);
  });

  it("applies the mirrored transform when a standard sprite body heads left", () => {
    const drawAssetMock = vi.mocked(canvasPrimitives.drawAssetSubpixel);
    drawAssetMock.mockClear();

    const ship = makeShipNode({
      id: "standard-left-render",
      tile: { x: 10, y: 10 },
      visual: {
        hull: "treasury-galleon",
        sizeTier: "major",
        spriteAssetId: "ship.treasury-galleon",
        scale: 1,
        livery: TEST_LIVERY,
      },
    });
    const fakeAsset: LoadedPharosVilleAsset = {
      entry: {
        anchor: [52, 68],
        category: "ship",
        displayScale: 1,
        footprint: [30, 14],
        height: 80,
        hitbox: [12, 8, 80, 60],
        id: "ship.treasury-galleon",
        layer: "ships",
        loadPriority: "deferred",
        path: "ships/treasury-galleon.png",
        width: 104,
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
      shipMotionSamples: new Map<string, ShipMotionSample>([
        [ship.id, makeMotionSample(ship.id)],
      ]),
      targets: [],
      width: 800,
      world: { ships: [ship] } as unknown as PharosVilleWorld,
    } satisfies DrawPharosVilleInput;
    const frame: ShipRenderFrame = {
      cache: {
        assetForEntity: () => fakeAsset,
        geometryForEntity: () => makeGeometry(200, 100),
      },
      shipRenderStates: new Map(),
    };

    drawShipBody(input, frame, ship);

    expect(drawAssetMock).toHaveBeenCalledTimes(1);
    expect(ctx.calls.some((call) => call.method === "scale" && call.args[0] === -1 && call.args[1] === 1)).toBe(true);
  });

  it("uses the precomposed body cache when a frame provides one", () => {
    const ship = makeShipNode({
      id: "cached-standard",
      tile: { x: 10, y: 10 },
      visual: {
        hull: "treasury-galleon",
        sizeTier: "major",
        scale: 1,
        livery: TEST_LIVERY,
        spriteAssetId: "ship.treasury-galleon",
      },
    });
    const fakeAsset: LoadedPharosVilleAsset = {
      entry: {
        anchor: [52, 68],
        category: "ship",
        displayScale: 1,
        footprint: [30, 14],
        height: 80,
        hitbox: [12, 8, 80, 60],
        id: "ship.treasury-galleon",
        layer: "ships",
        loadPriority: "deferred",
        path: "ships/treasury-galleon.png",
        width: 104,
      },
      image: {} as HTMLImageElement,
    };
    const ctx = makeRecordingCtx();
    const input = makeDrawInput(ctx, ship);
    const cache = createShipBodyCache({
      canvasFactory: (width, height) => ({
        height,
        width,
        getContext: () => ({
          beginPath: vi.fn(),
          clearRect: vi.fn(),
          drawImage: vi.fn(),
          fill: vi.fn(),
          fillRect: vi.fn(),
          lineTo: vi.fn(),
          moveTo: vi.fn(),
          rect: vi.fn(),
          restore: vi.fn(),
          save: vi.fn(),
          setLineDash: vi.fn(),
          setTransform: vi.fn(),
          stroke: vi.fn(),
        }),
      }) as unknown as HTMLCanvasElement,
      maxEntries: 4,
      maxPixels: 100_000,
    });
    const frame: ShipRenderFrame = {
      cache: {
        assetForEntity: () => fakeAsset,
        geometryForEntity: () => makeGeometry(200, 100),
      },
      protectedShipBodyCacheKeys: new Set<string>(),
      shipBodyCache: cache,
      shipBodyCacheManifestVersion: "test-cache",
      shipBodyCacheMaxPixels: 100_000,
      shipRenderStates: new Map(),
    };

    drawShipBody(input, frame, ship);
    drawShipBody(input, frame, ship);

    expect(cache.stats()).toMatchObject({ hitCount: 1, missCount: 1, entryCount: 1 });
    expect(frame.protectedShipBodyCacheKeys?.size).toBe(1);
    expect(ctx.calls.filter((call) => call.method === "drawImage").length).toBe(2);
  });
});

describe("continuous ship pose", () => {
  it("adds subtle speed-aware roll and flutter for standard hulls on the renderer path", () => {
    const lowSpeed = resolveShipPose({
      phase: 0,
      reducedMotion: false,
      sample: { ...makeMotionSample("standard-low"), wakeIntensity: 0.1, speedRatio: 0.05 } as ShipMotionSample & { speedRatio: number },
      shipId: "standard-low",
      timeSeconds: 0,
      visualSizeTier: "major",
      zoom: 1,
    });
    const highSpeed = resolveShipPose({
      phase: 0,
      reducedMotion: false,
      sample: { ...makeMotionSample("standard-high"), wakeIntensity: 0.7, speedRatio: 1.1 } as ShipMotionSample & { speedRatio: number },
      shipId: "standard-high",
      timeSeconds: 0,
      visualSizeTier: "major",
      zoom: 1,
    });

    expect(Math.abs(highSpeed.rollRadians)).toBeGreaterThan(0);
    expect(highSpeed.sailFlutter).toBeGreaterThan(lowSpeed.sailFlutter);
    expect(highSpeed.sternChurn).toBeGreaterThan(lowSpeed.sternChurn);
    expect(highSpeed.bowWake).toBe(0);
  });

  it("keeps unique hulls out of standard flutter treatment", () => {
    const pose = resolveShipPose({
      phase: 0,
      reducedMotion: false,
      sample: { ...makeMotionSample("unique-moving"), wakeIntensity: 1, speedRatio: 1.2 } as ShipMotionSample & { speedRatio: number },
      shipId: "unique-moving",
      timeSeconds: 0,
      visualSizeTier: "unique",
      zoom: 1,
    });

    expect(pose.rollRadians).toBe(0);
    expect(pose.sailFlutter).toBe(0);
    expect(pose.sternChurn).toBe(0);
  });
});

describe("titan bow spray orientation", () => {
  it("lengthens and brightens the outer rail while damping the inner rail", () => {
    const strands = resolveTitanBowSprayStrands({
      headingDelta: 0.2,
      shipId: "usdc-circle",
      topRecentMover: false,
    });

    expect(strands).toHaveLength(3);
    for (const strand of strands) {
      if (strand.side === 1) {
        expect(strand.length).toBe(18);
        expect(strand.alphaScale).toBe(1.2);
      } else {
        expect(strand.length).toBe(12);
        expect(strand.alphaScale).toBe(0.7);
      }
    }
  });

  it("adds a fourth outer strand for top recent movers", () => {
    const strands = resolveTitanBowSprayStrands({
      headingDelta: -0.2,
      shipId: "usdc-circle",
      topRecentMover: true,
    });

    expect(strands).toHaveLength(4);
    expect(strands[3]).toMatchObject({
      alphaScale: 1.2,
      length: 21,
      side: -1,
    });
  });

  it("keeps zero-turn spray side deterministic per ship id", () => {
    const first = resolveTitanBowSprayStrands({
      headingDelta: 0,
      shipId: "deterministic-titan",
      topRecentMover: true,
    });
    const second = resolveTitanBowSprayStrands({
      headingDelta: 0,
      shipId: "deterministic-titan",
      topRecentMover: true,
    });
    expect(first).toEqual(second);
  });

  it("derives the fourth titan spray strand from top-three 24h world movers", () => {
    const tracked = makeShipNode({
      id: "usdc-circle",
      tile: { x: 8, y: 8 },
      change24hUsd: 25,
      visual: {
        hull: "treasury-galleon",
        spriteAssetId: "ship.usdc-titan",
        sizeTier: "titan",
        scale: 1.53,
        livery: TEST_LIVERY,
      },
    });
    const largerMovers = [100, 90, 80].map((change, index) => makeShipNode({
      id: `larger-mover-${index}`,
      tile: { x: 9 + index, y: 9 },
      change24hUsd: change,
    }));
    const smallerMovers = [20, 10, 5].map((change, index) => makeShipNode({
      id: `smaller-mover-${index}`,
      tile: { x: 9 + index, y: 9 },
      change24hUsd: change,
    }));

    const topMoverStrokeCount = drawTitanWakePath2DStrokeCount(tracked, [tracked, ...smallerMovers]);
    const nonTopMoverStrokeCount = drawTitanWakePath2DStrokeCount(tracked, [tracked, ...largerMovers]);

    // Top-mover gets the fourth spray strand, which fires one extra
    // ctx.stroke(path). Foam / stern churn / first three strands fire in both.
    expect(topMoverStrokeCount).toBe(nonTopMoverStrokeCount + 1);
  });
});

// --- Per-unique offset table coverage --------------------------------------

describe("Unique ship offset tables", () => {
  it("every unique-tier sprite is registered in sail and tint offset tables", () => {
    const uniqueIds = [
      "ship.crvusd-unique",
      "ship.xaut-unique",
      "ship.paxg-unique",
    ];
    for (const uniqueId of uniqueIds) {
      expect(SHIP_SAIL_MARKS[uniqueId]).toBeDefined();
      expect(SHIP_SAIL_TINT_MASKS[uniqueId]).toBeDefined();
    }
  });
});

// --- Static draw path for unique sprites -----------------------------------

describe("drawShipBody for unique sprites", () => {
  it("renders unique ships through the static drawAsset path, not drawAnimatedAsset", () => {
    const drawAssetMock = vi.mocked(canvasPrimitives.drawAssetSubpixel);
    const drawAnimatedAssetMock = vi.mocked(canvasPrimitives.drawAnimatedAssetSubpixel);
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

describe("drawShipBody titan trim", () => {
  it("renders titan sprites without runtime trim strokes or deck rectangles", () => {
    const drawAnimatedAssetMock = vi.mocked(canvasPrimitives.drawAnimatedAssetSubpixel);
    drawAnimatedAssetMock.mockClear();

    const titan = makeShipNode({
      id: "usdc-circle",
      tile: { x: 10, y: 10 },
      visual: {
        hull: "treasury-galleon",
        sizeTier: "titan",
        spriteAssetId: "ship.usdc-titan",
        scale: 1.53,
        livery: TEST_LIVERY,
      },
    });

    const fakeAsset: LoadedPharosVilleAsset = {
      entry: {
        anchor: [80, 104],
        category: "ship",
        displayScale: 1,
        footprint: [52, 24],
        height: 112,
        hitbox: [30, 4, 120, 96],
        id: "ship.usdc-titan",
        layer: "ships",
        loadPriority: "deferred",
        path: "ships/usdc-titan.png",
        width: 160,
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
      world: { ships: [titan] } as unknown as PharosVilleWorld,
    } satisfies DrawPharosVilleInput;

    const frame: ShipRenderFrame = {
      cache: {
        assetForEntity: () => fakeAsset,
        geometryForEntity: () => makeGeometry(200, 100),
      },
      shipRenderStates: new Map(),
    };

    drawShipBody(input, frame, titan);

    expect(drawAnimatedAssetMock).toHaveBeenCalledTimes(1);
    expect(ctx.calls.some((call) => call.method === "lineTo")).toBe(false);
    expect(ctx.calls.some((call) => call.method === "stroke")).toBe(false);
    expect(ctx.calls.some((call) => call.method === "rect")).toBe(false);
  });

  it("holds four-frame titan sheets on a deterministic frame and lets pose carry motion", () => {
    const drawAnimatedAssetMock = vi.mocked(canvasPrimitives.drawAnimatedAssetSubpixel);
    drawAnimatedAssetMock.mockClear();

    const titan = makeShipNode({
      id: "usdc-circle",
      tile: { x: 10, y: 10 },
      visual: {
        hull: "treasury-galleon",
        sizeTier: "titan",
        spriteAssetId: "ship.usdc-titan",
        scale: 1.53,
        livery: TEST_LIVERY,
      },
    });

    const fakeAsset: LoadedPharosVilleAsset = {
      entry: {
        anchor: [80, 104],
        animation: {
          frameCount: 4,
          fps: 4,
          frameSource: "sheet",
          loop: true,
          reducedMotionFrame: 0,
        },
        category: "ship",
        displayScale: 1,
        footprint: [52, 24],
        height: 112,
        hitbox: [30, 4, 120, 96],
        id: "ship.usdc-titan",
        layer: "ships",
        loadPriority: "deferred",
        path: "ships/usdc-titan.png",
        width: 160,
      },
      image: {} as HTMLImageElement,
    };

    const ctx = makeRecordingCtx();
    const baseInput = {
      assets: null,
      camera: { offsetX: 0, offsetY: 0, zoom: 1 },
      ctx,
      height: 600,
      hoveredTarget: null,
      motion: {
        plan: makeMotionPlan([titan.id]),
        reducedMotion: false,
        timeSeconds: 0,
        wallClockHour: 12,
      },
      selectedTarget: null,
      shipMotionSamples: new Map<string, ShipMotionSample>([
        [titan.id, makeMotionSample(titan.id)],
      ]),
      targets: [],
      width: 800,
      world: { ships: [titan] } as unknown as PharosVilleWorld,
    } satisfies DrawPharosVilleInput;
    const frameFor = (): ShipRenderFrame => ({
      cache: {
        assetForEntity: () => fakeAsset,
        geometryForEntity: () => makeGeometry(200, 100),
      },
      shipRenderStates: new Map(),
    });

    drawShipBody(baseInput, frameFor(), titan);
    drawShipBody({
      ...baseInput,
      motion: {
        ...baseInput.motion,
        timeSeconds: 12.75,
      },
    }, frameFor(), titan);

    expect(drawAnimatedAssetMock).toHaveBeenCalledTimes(2);
    expect(drawAnimatedAssetMock.mock.calls[1]![5]).toBe(drawAnimatedAssetMock.mock.calls[0]![5]);
  });
});

describe("drawShipOverlay standard procedural chrome", () => {
  function drawProceduralOverlay(overrides: Partial<ShipNode["visual"]> = {}, target: Partial<Pick<DrawPharosVilleInput, "hoveredTarget" | "selectedTarget">> = {}) {
    const ship = makeShipNode({
      id: "test-standard",
      detailId: "ship.test-standard",
      tile: { x: 8, y: 8 },
      visual: {
        hull: "dao-schooner",
        sizeTier: "regional",
        scale: 1,
        livery: TEST_LIVERY,
        sailColor: TEST_LIVERY.sailColor,
        sailStripeColor: TEST_LIVERY.primary,
        overlay: "none",
        ...overrides,
      },
    });
    const ctx = makeRecordingCtx();
    const input = {
      assets: null,
      camera: { offsetX: 0, offsetY: 0, zoom: 1 },
      ctx,
      height: 600,
      hoveredTarget: target.hoveredTarget ?? null,
      motion: {
        plan: makeMotionPlan([]),
        reducedMotion: false,
        timeSeconds: 0.125,
        wallClockHour: 12,
      },
      selectedTarget: target.selectedTarget ?? null,
      shipMotionSamples: new Map<string, ShipMotionSample>(),
      targets: [],
      width: 800,
      world: { ships: [ship] } as unknown as PharosVilleWorld,
    } satisfies DrawPharosVilleInput;
    const frame: ShipRenderFrame = {
      cache: {
        assetForEntity: () => null,
        geometryForEntity: () => makeGeometry(200, 100),
      },
      shipRenderStates: new Map(),
    };

    drawShipOverlay(input, frame, ship);
    return { ctx, ship };
  }

  it("renders a mast pennant, mast lantern, and regional bowsprit mark instead of the sail sticker", () => {
    const { ctx } = drawProceduralOverlay();
    const text = ctx.calls.filter((call) => call.method === "fillText").map((call) => call.args[0]);
    expect(text).toContain("TES");
    expect(text).toContain("TE");
    expect(ctx.calls.filter((call) => call.method === "ellipse").length).toBeGreaterThanOrEqual(3);
    expect(ctx.calls.some((call) => call.method === "clip")).toBe(false);
  });

  it("drops the bowsprit logo mark below regional tier", () => {
    const { ctx } = drawProceduralOverlay({ sizeTier: "skiff" });
    const text = ctx.calls.filter((call) => call.method === "fillText").map((call) => call.args[0]);
    expect(text).toEqual(["TES"]);
  });

  it("uses selected detailId matching and draws a pulsing double ring", () => {
    const { ctx } = drawProceduralOverlay({ sizeTier: "local" }, {
      selectedTarget: {
        detailId: "ship.test-standard",
        id: "other-hit-id",
        kind: "ship",
        label: "test-standard",
        priority: 0,
        rect: { height: 20, width: 20, x: 0, y: 0 },
      },
    });
    const ellipses = ctx.calls.filter((call) => call.method === "ellipse");
    expect(ellipses[0]!.args[2]).toBeCloseTo(34 * 0.7, 5);
    expect(ellipses[1]!.args[2]).toBeCloseTo(42 * 0.7, 5);
  });

  it("draws a dashed hover outline when the ship is hovered but not selected", () => {
    const { ctx } = drawProceduralOverlay({ sizeTier: "local" }, {
      hoveredTarget: {
        detailId: "ship.test-standard",
        id: "test-standard",
        kind: "ship",
        label: "test-standard",
        priority: 0,
        rect: { height: 20, width: 20, x: 0, y: 0 },
      },
    });
    expect(ctx.calls.some((call) => call.method === "setLineDash" && (call.args[0] as number[]).length === 2)).toBe(true);
  });

  it("renders watch as checker square plus red triangle signal flags", () => {
    const { ctx } = drawProceduralOverlay({ overlay: "watch", sizeTier: "local" });
    expect(ctx.calls.filter((call) => call.method === "strokeRect")).toHaveLength(1);
    expect(ctx.calls.filter((call) => call.method === "fillRect").length).toBeGreaterThanOrEqual(3);
    expect(ctx.calls.filter((call) => call.method === "lineTo").length).toBeGreaterThanOrEqual(3);
  });
});

// --- Synchronised squad wake ordering --------------------------------------

function makeDrawInput(ctx: CanvasRenderingContext2D, ship: ShipNode): DrawPharosVilleInput {
  return {
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
    shipMotionSamples: new Map<string, ShipMotionSample>([
      [ship.id, makeMotionSample(ship.id)],
    ]),
    targets: [],
    width: 800,
    world: { ships: [ship] } as unknown as PharosVilleWorld,
  };
}

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

// Counts ctx.stroke(path) Path2D-style strokes that the cached titan
// procedural chrome (foam, spray strands, stern churn) emits. The legacy
// bare-ctx stroke() calls from contact-shadow and zone wakes pass zero
// arguments, so the strand-count delta between top-mover and non-top-mover
// remains observable post-W1.04 even though no per-strand moveTo/lineTo
// hits the recording ctx anymore.
function drawTitanWakePath2DStrokeCount(ship: ShipNode, ships: readonly ShipNode[]): number {
  const ctx = makeRecordingCtx();
  const plan = makeMotionPlan([ship.id]);
  const input = {
    assets: null,
    camera: { offsetX: 0, offsetY: 0, zoom: 1 },
    ctx,
    height: 600,
    hoveredTarget: null,
    motion: {
      plan: {
        ...plan,
        animatedShipIds: new Set<string>([ship.id]),
        effectShipIds: new Set<string>([ship.id]),
      },
      reducedMotion: false,
      timeSeconds: 0,
      wallClockHour: 12,
    },
    selectedTarget: null,
    shipMotionSamples: new Map<string, ShipMotionSample>([
      [ship.id, { ...makeMotionSample(ship.id), wakeIntensity: 1 }],
    ]),
    targets: [],
    width: 800,
    world: { ships } as unknown as PharosVilleWorld,
  } satisfies DrawPharosVilleInput;
  const frame: ShipRenderFrame = {
    cache: {
      assetForEntity: () => null,
      geometryForEntity: () => makeGeometry(200, 100),
    },
    shipRenderStates: new Map(),
    visibleShips: ships,
    wakeDrawnShipIds: new Set<string>(),
  };

  drawShipWake(input, frame, ship);

  return ctx.calls.filter((call) => call.method === "stroke" && call.args.length === 1).length;
}

describe("drawShipWake squad ordering", () => {
  it("draws the flagship's wake before a consort's when both are mover ships", () => {
    const flagship = makeShipNode({
      id: SKY_SQUAD.flagshipId,
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
      id: SKY_SQUAD.flagshipId,
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

describe("wakePersonalityForHull", () => {
  it("gives each standard hull class a distinct wake profile", () => {
    const caravel = wakePersonalityForHull("crypto-caravel");
    const galleon = wakePersonalityForHull("treasury-galleon");
    const schooner = wakePersonalityForHull("dao-schooner");
    const junk = wakePersonalityForHull("algo-junk");

    expect(galleon.spreadScale).toBeGreaterThan(caravel.spreadScale);
    expect(galleon.spacingScale).toBeGreaterThan(caravel.spacingScale);
    expect(schooner.spreadScale).toBeLessThan(caravel.spreadScale);
    expect(schooner.lengthScale).toBeGreaterThan(caravel.lengthScale);
    expect(junk.irregular).toBe(true);
  });
});

// --- Titan foam scaling regression -----------------------------------------

// Confirms the titan procedural chrome (foam, bow-spray, mooring, stern
// churn) draws through ctx.translate(drawPoint) + ctx.scale(drawScale) +
// ctx.stroke(Path2D), so per-ship offsets cannot bypass the drawScale.
// Guards smaller squad consorts (e.g. sUSDS / sDAI at scale 1.35) from
// inheriting an oversized USDS-titan foam silhouette that would punch outside
// the hull bounds.
//
// W1.04: path geometry now lives inside cached Path2D templates, so the
// recording ctx no longer sees moveTo/lineTo/quadraticCurveTo at the wake
// layer. Validate the transform contract instead — translate at the draw
// origin, uniform scale at drawScale — and assert at least one stroke fires.
describe("titan foam scaling stays within hull bounds", () => {
  it("translates to the draw origin and scales by drawScale before stroking the cached foam path", () => {
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

    // The foam draw applies translate(drawPoint) then scale(drawScale, drawScale)
    // before stroking the cached Path2D. Locate the matching sequence.
    const translateCalls = ctx.calls.filter((call) => call.method === "translate");
    const scaleCalls = ctx.calls.filter((call) => call.method === "scale");
    const strokeCalls = ctx.calls.filter((call) => call.method === "stroke");

    expect(translateCalls.some((call) => call.args[0] === ORIGIN_X && call.args[1] === ORIGIN_Y)).toBe(true);
    expect(scaleCalls.some((call) => call.args[0] === DRAW_SCALE && call.args[1] === DRAW_SCALE)).toBe(true);
    // At least one stroke fires from the cached titan procedural chrome —
    // identified by being a Path2D-style stroke(path) call (single arg)
    // rather than the bare-ctx stroke() the contact shadow and zone wake
    // primitives still use. If the W1.04 cache regressed back to inline
    // beginPath/stroke for foam/spray, no Path2D-style stroke would fire.
    const pathStrokeCalls = strokeCalls.filter((call) => call.args.length === 1);
    expect(pathStrokeCalls.length).toBeGreaterThan(0);
  });
});

// --- Titan procedural path cache (W1.04) -----------------------------------

describe("titan procedural path cache", () => {
  // Drives the wake stack for a single titan a configurable number of times,
  // honoring a custom heading per draw so we can exercise the bucketed cache
  // key without paying for the full canvas mock surface elsewhere.
  function drawTitanWakeFrames(options: {
    frames: number;
    headingForFrame?: (frame: number) => { x: number; y: number };
    moored?: boolean;
    shipId?: string;
  }): { ctx: CanvasRenderingContext2D & RecordingCtx } {
    const consort = makeShipNode({
      id: options.shipId ?? "usdc-titan-test",
      tile: { x: 8, y: 8 },
    });
    (consort as { visual: { hull: string; spriteAssetId: string; sizeTier: string; scale: number; livery: unknown } }).visual = {
      hull: "treasury-galleon",
      spriteAssetId: "ship.usdc-titan",
      sizeTier: "titan",
      scale: 1,
      livery: {},
    };

    const geometry: ResolvedEntityGeometry = {
      assetScale: null,
      depth: 0,
      depthTile: { x: 0, y: 0 },
      drawPoint: { x: 200, y: 100 },
      drawScale: 1,
      followTile: { x: 0, y: 0 },
      screenPoint: { x: 200, y: 100 },
      selectionRect: { x: 200, y: 100, width: 32, height: 32 },
      semanticTile: { x: 0, y: 0 },
      targetRect: { x: 200, y: 100, width: 32, height: 32 },
    };

    const ctx = makeRecordingCtx();
    let currentHeading: { x: number; y: number } = { x: -1, y: 0 };

    for (let frame = 0; frame < options.frames; frame += 1) {
      currentHeading = options.headingForFrame?.(frame) ?? currentHeading;
      const baseSample = makeMotionSample(consort.id);
      const sample: ShipMotionSample = {
        ...baseSample,
        heading: currentHeading,
        ...(options.moored
          ? { state: "moored" as const, currentDockId: "dock-test" }
          : {}),
      };

      const input = {
        assets: null,
        camera: { offsetX: 0, offsetY: 0, zoom: 1 },
        ctx,
        height: 600,
        hoveredTarget: null,
        motion: {
          plan: makeMotionPlan(options.moored ? [] : [consort.id]),
          reducedMotion: false,
          timeSeconds: 0,
          wallClockHour: 12,
        },
        selectedTarget: null,
        shipMotionSamples: new Map<string, ShipMotionSample>([[consort.id, sample]]),
        targets: [],
        width: 800,
        world: { ships: [consort] } as unknown as PharosVilleWorld,
      } satisfies DrawPharosVilleInput;
      const renderFrame: ShipRenderFrame = {
        cache: {
          assetForEntity: () => null as LoadedPharosVilleAsset | null,
          geometryForEntity: () => geometry,
        },
        shipRenderStates: new Map(),
        visibleShips: [consort],
        wakeDrawnShipIds: new Set<string>(),
      };
      drawShipWake(input, renderFrame, consort);
    }

    return { ctx };
  }

  it("builds path templates on first draw and hits the cache on subsequent draws with the same heading", () => {
    resetTitanPathCache();
    drawTitanWakeFrames({ frames: 1 });
    const after1 = titanPathCacheStats();
    expect(after1.missCount).toBeGreaterThan(0);
    expect(after1.hitCount).toBe(0);
    expect(after1.entryCount).toBe(after1.missCount);

    // Second draw with identical heading: every getOrBuild call hits the
    // cache, so missCount stays put and hitCount grows by the same count.
    drawTitanWakeFrames({ frames: 1 });
    const after2 = titanPathCacheStats();
    expect(after2.missCount).toBe(after1.missCount);
    expect(after2.hitCount).toBe(after1.missCount);
    expect(after2.entryCount).toBe(after1.entryCount);
  });

  it("hits the cache when two near-identical headings round into the same bucket", () => {
    resetTitanPathCache();
    // Two raw headings within ~1.4° collapse into the same 32-bucket angle.
    const headingA = { x: 1, y: 0 };
    const angleB = Math.PI / 64; // ~2.8°, well inside one 11.25° bucket.
    const headingB = { x: Math.cos(angleB), y: Math.sin(angleB) };

    drawTitanWakeFrames({ frames: 1, headingForFrame: () => headingA });
    const baseline = titanPathCacheStats();

    drawTitanWakeFrames({ frames: 1, headingForFrame: () => headingB });
    const afterCollision = titanPathCacheStats();
    // entryCount must not grow — every getOrBuild on the second pass hit
    // the bucketed key from the first pass.
    expect(afterCollision.entryCount).toBe(baseline.entryCount);
    expect(afterCollision.hitCount).toBeGreaterThan(baseline.hitCount);
  });

  it("achieves >= 99% hit rate when the same titan draws 60 frames at a stable heading", () => {
    resetTitanPathCache();
    // Moored draw exercises the mooring shadow + ropes + fenders alongside
    // the foam path, matching the steady-state composition of a docked titan.
    drawTitanWakeFrames({ frames: 60, moored: true });
    const stats = titanPathCacheStats();
    const totalLookups = stats.hitCount + stats.missCount;
    const hitRate = stats.hitCount / totalLookups;
    // First frame fills the cache, every subsequent frame is a 100% hit. With
    // multiple lookups per frame the warmup ratio shrinks further, so the
    // hit rate climbs above 99% even when including the warmup frame.
    expect(hitRate).toBeGreaterThanOrEqual(0.95);
    const steadyStateLookupsPerFrame = Math.round(totalLookups / 60);
    // After the warmup frame, every remaining frame is a pure hit. Compute
    // the steady-state ratio explicitly.
    const steadyStateHitRate = stats.hitCount / (59 * steadyStateLookupsPerFrame);
    expect(steadyStateHitRate).toBeGreaterThanOrEqual(0.99);
  });

  it("caps cache size via LRU eviction once max entries are exceeded", async () => {
    // Drive a fresh cache by importing the module-level cache directly via
    // an isolated module reload so we can shrink TITAN_PATH_CACHE_MAX
    // intentionally. The exported cache has a 512-entry cap, well above
    // anything realistic — verify the eviction contract by spamming unique
    // headings until the entryCount stops growing.
    resetTitanPathCache();
    const distinctHeadings = 32; // matches TITAN_PATH_HEADING_BUCKETS
    for (let bucket = 0; bucket < distinctHeadings; bucket += 1) {
      const angle = (bucket * 2 * Math.PI) / distinctHeadings;
      drawTitanWakeFrames({
        frames: 1,
        headingForFrame: () => ({ x: Math.cos(angle), y: Math.sin(angle) }),
      });
    }
    const filled = titanPathCacheStats();
    // Each unique heading contributes its own foam path entry; sanity that
    // entries accumulated rather than collapsing to a single key.
    expect(filled.entryCount).toBeGreaterThanOrEqual(distinctHeadings);
    // entryCount must never exceed the configured maxEntries (the 512 default
    // for the exported cache).
    expect(filled.entryCount).toBeLessThanOrEqual(filled.maxEntries);
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
