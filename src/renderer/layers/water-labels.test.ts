import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRecordingCanvasContext, type RecordingCanvasStub } from "../__test-utils__/canvas-context-builder";
import {
  clearWaterLabelBitmapCache,
  drawCartographicWaterLabel,
  waterLabelBitmapCacheStats,
  waterLabelChromeStyleForTerrain,
  waterLabelPlaqueMetrics,
} from "./water-labels";

const originalOffscreenCanvas = globalThis.OffscreenCanvas;
type MutableOffscreenCanvasGlobal = { OffscreenCanvas?: typeof OffscreenCanvas };

function makeWaterLabelCtx(measuredWidth = 88): RecordingCanvasStub {
  return buildRecordingCanvasContext({
    methods: [
      "save",
      "restore",
      "beginPath",
      "closePath",
      "moveTo",
      "lineTo",
      "arc",
      "quadraticCurveTo",
      "fill",
      "stroke",
      "fillRect",
      "setTransform",
      "translate",
      "rotate",
      "drawImage",
      "fillText",
      "strokeText",
    ],
    returningMethods: {
      measureText: () => ({ width: measuredWidth }),
    },
  });
}

function drawTestLabel(ctx: CanvasRenderingContext2D, overrides: Partial<Parameters<typeof drawCartographicWaterLabel>[0]> = {}) {
  drawCartographicWaterLabel({
    accent: "#f4bd4f",
    align: "center",
    chromeStyle: "generic-board",
    ctx,
    dpr: 1,
    fill: "#fff4cf",
    label: "Calm Anchorage",
    maxWidth: 110,
    outline: "rgba(16, 20, 24, 0.9)",
    plaqueDark: "rgba(30, 18, 9, 0.8)",
    plaqueLight: "rgba(155, 118, 70, 0.7)",
    rotation: 0.08,
    x: 120,
    y: 80,
    zoom: 1,
    ...overrides,
  });
}

function restoreOffscreenCanvas(): void {
  const target = globalThis as unknown as MutableOffscreenCanvasGlobal;
  if (originalOffscreenCanvas) {
    target.OffscreenCanvas = originalOffscreenCanvas;
  } else {
    delete target.OffscreenCanvas;
  }
}

beforeEach(() => {
  clearWaterLabelBitmapCache();
  restoreOffscreenCanvas();
});

afterEach(() => {
  clearWaterLabelBitmapCache();
  restoreOffscreenCanvas();
});

describe("water label plaque chrome", () => {
  it("maps zone terrains to the requested plaque materials", () => {
    expect(waterLabelChromeStyleForTerrain("storm-water")).toBe("charred-wax");
    expect(waterLabelChromeStyleForTerrain("warning-water")).toBe("weathered-wood");
    expect(waterLabelChromeStyleForTerrain("calm-water")).toBe("calm-parchment");
    expect(waterLabelChromeStyleForTerrain("ledger-water")).toBe("ledger-vellum");
    expect(waterLabelChromeStyleForTerrain("watch-water")).toBe("generic-board");
  });

  it("keeps plaque metrics legible at the minimum label scale", () => {
    const metrics = waterLabelPlaqueMetrics({
      align: "center",
      maxWidth: 110,
      measuredWidthRaw: 88,
      scale: 0.72,
    });

    expect(metrics.width).toBeCloseTo(79.2);
    expect(metrics.plaqueWidth).toBe(metrics.width);
    expect(metrics.height).toBeGreaterThan(12);
    expect(metrics.plaqueX).toBeCloseTo(-39.6);
  });

  it("falls back to direct drawing when OffscreenCanvas is unavailable", () => {
    delete (globalThis as unknown as MutableOffscreenCanvasGlobal).OffscreenCanvas;
    const main = makeWaterLabelCtx();

    drawTestLabel(main.ctx);

    expect(main.callsTo("drawImage")).toHaveLength(0);
    expect(main.callsTo("strokeText")).toHaveLength(1);
    expect(main.callsTo("fillText")).toHaveLength(1);
    expect(waterLabelBitmapCacheStats().entryCount).toBe(0);
  });

  it("reuses retained label bitmaps by label, theme, zoom bucket, and DPR", () => {
    const offscreenContexts: RecordingCanvasStub[] = [];
    class TestOffscreenCanvas {
      height: number;
      width: number;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }

      getContext(type: string) {
        if (type !== "2d") return null;
        const offscreen = makeWaterLabelCtx();
        offscreenContexts.push(offscreen);
        return offscreen.ctx;
      }
    }
    (globalThis as unknown as MutableOffscreenCanvasGlobal).OffscreenCanvas =
      TestOffscreenCanvas as unknown as typeof OffscreenCanvas;
    const main = makeWaterLabelCtx();

    drawTestLabel(main.ctx, { dpr: 2, zoom: 1 });
    drawTestLabel(main.ctx, { dpr: 2, zoom: 1 });
    drawTestLabel(main.ctx, { dpr: 1, zoom: 1 });
    drawTestLabel(main.ctx, { dpr: 2, zoom: 1.001 });
    drawTestLabel(main.ctx, { dpr: 2, fill: "#fff5df", zoom: 1 });
    drawTestLabel(main.ctx, { dpr: 2, label: "Watch Breakwater", zoom: 1 });

    expect(main.callsTo("drawImage")).toHaveLength(6);
    expect(main.callsTo("strokeText")).toHaveLength(6);
    expect(main.callsTo("fillText")).toHaveLength(6);
    expect(offscreenContexts).toHaveLength(5);
    expect(offscreenContexts[0].callsTo("fillText")).toHaveLength(0);
    expect(waterLabelBitmapCacheStats().entryCount).toBe(5);
  });
});
