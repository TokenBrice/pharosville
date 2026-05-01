import { vi } from "vitest";
import type { DrawPharosVilleInput } from "../render-types";

type CanvasSpy = ReturnType<typeof vi.fn>;

export function createCanvasContextStub<TMethodName extends string>(
  methods: readonly TMethodName[],
  initialValues: Record<string, unknown> = {},
): CanvasRenderingContext2D & Record<TMethodName, CanvasSpy> {
  const ctx: Record<string, unknown> = { ...initialValues };
  for (const method of methods) {
    ctx[method] = vi.fn();
  }
  return ctx as CanvasRenderingContext2D & Record<TMethodName, CanvasSpy>;
}

function createDefaultMotionPlan(): DrawPharosVilleInput["motion"]["plan"] {
  return {
    animatedShipIds: new Set(),
    effectShipIds: new Set(),
    lighthouseFireFlickerPerSecond: 0,
    moverShipIds: new Set(),
    shipPhases: new Map(),
    shipRoutes: new Map(),
  };
}

export function createDrawInput(overrides: Partial<DrawPharosVilleInput> = {}): DrawPharosVilleInput {
  return {
    assets: null,
    camera: { offsetX: 0, offsetY: 0, zoom: 1 } as DrawPharosVilleInput["camera"],
    ctx: createCanvasContextStub([]),
    height: 600,
    hoveredTarget: null,
    motion: {
      plan: createDefaultMotionPlan(),
      reducedMotion: false,
      timeSeconds: 0,
      wallClockHour: 0,
    },
    selectedTarget: null,
    targets: [],
    width: 800,
    world: { ships: [] } as unknown as DrawPharosVilleInput["world"],
    ...overrides,
  };
}
