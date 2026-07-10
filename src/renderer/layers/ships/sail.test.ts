import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShipLivery } from "../../../systems/world-types";
import { buildRecordingCanvasContext, type RecordingCanvasStub } from "../../__test-utils__/canvas-context-builder";
import {
  drawSailLogo,
  getSailLogoSpriteCacheStats,
  resetSailLogoSpriteCache,
  SAIL_LOGO_SPRITE_CACHE_MAX,
} from "./sail";

// Node test env has no `document`; the sprite path needs createElement("canvas")
// plus a 2D context stub. Each fake canvas records into its own context so
// tests can assert per-canvas identity for the free-list reuse path.
const SPRITE_CTX_METHODS = [
  "save",
  "restore",
  "translate",
  "rotate",
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "arc",
  "ellipse",
  "quadraticCurveTo",
  "fill",
  "stroke",
  "fillRect",
  "strokeRect",
  "clip",
  "fillText",
  "drawImage",
] as const;

interface FakeCanvas {
  width: number;
  height: number;
  getContext: (kind: string) => CanvasRenderingContext2D;
}

function createFakeCanvas(): FakeCanvas {
  const recording = buildRecordingCanvasContext({ methods: SPRITE_CTX_METHODS });
  return {
    width: 0,
    height: 0,
    getContext: () => recording.ctx,
  };
}

const TEST_LIVERY: ShipLivery = {
  accent: "#8a5a2b",
  label: "Test Livery",
  logoMatte: "#f4ead2",
  logoShape: "circle",
  primary: "#1f4f7a",
  sailColor: "#d9ecdf",
  sailPanel: "field",
  secondary: "#c2b49a",
  source: "brand-color",
  stripePattern: "double",
};

function drawWithSize(ctx: CanvasRenderingContext2D, width: number, height: number, sailColor = "#d9ecdf") {
  drawSailLogo({
    ctx,
    height,
    livery: TEST_LIVERY,
    logo: null,
    mark: "USDT",
    sailColor,
    stripeColor: "#7a2f2f",
    width,
    x: 100,
    y: 80,
  });
}

describe("sail logo sprite cache", () => {
  let createdCanvases: FakeCanvas[];
  let mainCtx: RecordingCanvasStub;

  beforeEach(() => {
    createdCanvases = [];
    vi.stubGlobal("document", {
      createElement: vi.fn(() => {
        const canvas = createFakeCanvas();
        createdCanvases.push(canvas);
        return canvas;
      }),
    });
    resetSailLogoSpriteCache();
    mainCtx = buildRecordingCanvasContext({ methods: SPRITE_CTX_METHODS });
  });

  afterEach(() => {
    resetSailLogoSpriteCache();
    vi.unstubAllGlobals();
  });

  it("shares one sprite across px sizes inside the same 4px bucket and scales the blit to the exact size", () => {
    // width 34 → widthPx 39, height 36 → heightPx 40 → 40x40 bucket.
    drawWithSize(mainCtx.ctx, 34, 36);
    // width 36 → widthPx 41, height 37 → heightPx 41 → same 40x40 bucket.
    drawWithSize(mainCtx.ctx, 36, 37);

    const stats = getSailLogoSpriteCacheStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.size).toBe(1);
    expect(createdCanvases).toHaveLength(1);

    const blits = mainCtx.callsTo("drawImage");
    expect(blits).toHaveLength(2);
    const [firstBlit, secondBlit] = blits as [readonly unknown[], readonly unknown[]];
    // Both blits reuse the single bucketed sprite canvas.
    expect(firstBlit[0]).toBe(createdCanvases[0]);
    expect(secondBlit[0]).toBe(createdCanvases[0]);
    // 40x40 bucket pads by 2px → 44x44 sprite canvas; the blit scales it back
    // to the exact px footprint (39/40 and 41/40 of the bucket size).
    const spriteCanvas = createdCanvases[0]!;
    expect(spriteCanvas.width).toBe(44);
    expect(firstBlit[3]).toBeCloseTo(spriteCanvas.width * (39 / 40));
    expect(firstBlit[4]).toBeCloseTo(spriteCanvas.height * (40 / 40));
    expect(secondBlit[3]).toBeCloseTo(spriteCanvas.width * (41 / 40));
    expect(secondBlit[4]).toBeCloseTo(spriteCanvas.height * (41 / 40));
  });

  it("blits at natural sprite size when the px size already sits on a 4px boundary", () => {
    // width 35 → widthPx 40, height 36.4 → heightPx 40: scale is exactly 1.
    drawWithSize(mainCtx.ctx, 35, 36.4);

    const blits = mainCtx.callsTo("drawImage");
    expect(blits).toHaveLength(1);
    const blit = blits[0]!;
    const spriteCanvas = blit[0] as FakeCanvas;
    expect(blit[3]).toBe(spriteCanvas.width);
    expect(blit[4]).toBe(spriteCanvas.height);
  });

  it("recycles evicted sprite canvases through the free-list instead of allocating fresh ones", () => {
    // Fill the cache one entry past capacity with unique sail colors; the
    // overflow insert evicts the oldest sprite and parks its canvas on the
    // free-list.
    for (let index = 0; index <= SAIL_LOGO_SPRITE_CACHE_MAX; index += 1) {
      drawWithSize(mainCtx.ctx, 34, 36, `#${index.toString(16).padStart(6, "0")}`);
    }
    const createdAtCapacity = createdCanvases.length;
    expect(createdAtCapacity).toBe(SAIL_LOGO_SPRITE_CACHE_MAX + 1);
    const statsAtCapacity = getSailLogoSpriteCacheStats();
    expect(statsAtCapacity.size).toBe(SAIL_LOGO_SPRITE_CACHE_MAX);
    expect(statsAtCapacity.evictions).toBe(1);

    // The next unique sprite build must reuse the evicted canvas: no new
    // createElement, and the blit uses the very first canvas object again.
    drawWithSize(mainCtx.ctx, 34, 36, "#fedcba");
    expect(createdCanvases.length).toBe(createdAtCapacity);
    const blits = mainCtx.callsTo("drawImage");
    expect(blits[blits.length - 1]![0]).toBe(createdCanvases[0]);
  });
});
