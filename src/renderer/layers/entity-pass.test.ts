import { describe, expect, it } from "vitest";
import type { PharosVilleMotionPlan } from "../../systems/motion";
import type { PharosVilleWorld, ShipNode } from "../../systems/world-types";
import type { RenderFrameCache } from "../frame-cache";
import type { ResolvedEntityGeometry } from "../geometry";
import type { DrawPharosVilleInput } from "../render-types";
import { drawEntityLayer } from "./entity-pass";

function makeShip(
  overrides: Omit<Partial<ShipNode>, "visual"> & Pick<ShipNode, "id" | "tile"> & { visual?: Partial<ShipNode["visual"]> },
): ShipNode {
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

function makeGeometry(depth: number, x: number, y: number): ResolvedEntityGeometry {
  return {
    assetScale: null,
    depth,
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

function motionPlan(overrides?: Partial<PharosVilleMotionPlan>): PharosVilleMotionPlan {
  return {
    animatedShipIds: new Set(),
    effectShipIds: new Set(),
    lighthouseFireFlickerPerSecond: 0,
    moverShipIds: new Set(),
    shipPhases: new Map(),
    shipRoutes: new Map(),
    ...overrides,
  };
}

describe("drawEntityLayer", () => {
  it("keeps mixed descriptor draw order stable", () => {
    const dock = { id: "dock.a", kind: "dock", detailId: "dock.a", label: "dock-a" } as unknown as PharosVilleWorld["docks"][number];
    const ship = makeShip({ id: "ship.a", tile: { x: 2, y: 2 } });
    const grave = { id: "grave.a", kind: "grave", detailId: "grave.a", label: "grave-a" } as unknown as PharosVilleWorld["graves"][number];
    const lighthouse = { id: "lighthouse", kind: "lighthouse", detailId: "lighthouse", label: "lighthouse" } as unknown as PharosVilleWorld["lighthouse"];
    const geometryById = new Map<string, ResolvedEntityGeometry>([
      [dock.id, makeGeometry(100, 120, 120)],
      [ship.id, makeGeometry(120, 220, 150)],
      [grave.id, makeGeometry(130, 280, 180)],
      [lighthouse.id, makeGeometry(125, 240, 140)],
    ]);

    const world = {
      docks: [dock],
      graves: [grave],
      lighthouse,
      ships: [ship],
    } as unknown as PharosVilleWorld;
    const input = {
      assets: null,
      camera: { offsetX: 0, offsetY: 0, zoom: 1 },
      ctx: {} as CanvasRenderingContext2D,
      height: 760,
      hoveredTarget: null,
      motion: {
        plan: motionPlan(),
        reducedMotion: false,
        timeSeconds: 0,
        wallClockHour: 12,
      },
      selectedTarget: null,
      shipMotionSamples: new Map(),
      targets: [],
      width: 1280,
      world,
    } satisfies DrawPharosVilleInput;
    const cache = {
      geometryForEntity: (entity: { id: string }) => geometryById.get(entity.id) ?? makeGeometry(0, 0, 0),
    } as unknown as RenderFrameCache;
    const calls: string[] = [];

    drawEntityLayer(
      input,
      cache,
      [{
        depth: 110,
        detailId: "scenery.extra",
        draw: () => calls.push("scenery-extra"),
        entityId: "scenery-extra",
        kind: "scenery",
        pass: "body",
        screenBounds: { x: 140, y: 140, width: 24, height: 24 },
        tieBreaker: "scenery-extra",
      }],
      {
        drawDockBody: () => calls.push("dock-body"),
        drawDockOverlay: () => calls.push("dock-overlay"),
        drawGraveBody: () => calls.push("grave-body"),
        drawGraveOverlay: () => calls.push("grave-overlay"),
        drawGraveUnderlay: () => calls.push("grave-underlay"),
        drawLighthouseBody: () => calls.push("lighthouse-body"),
        drawLighthouseOverlay: () => calls.push("lighthouse-overlay"),
        drawShipBody: () => calls.push("ship-body"),
        drawShipOverlay: () => calls.push("ship-overlay"),
        drawShipWake: () => calls.push("ship-wake"),
        isBackgroundedHarborDock: () => false,
        lighthouseOverlayScreenBounds: (rect) => rect,
        visibleShips: [ship],
      },
    );

    expect(calls).toEqual([
      "dock-body",
      "dock-overlay",
      "scenery-extra",
      "ship-wake",
      "ship-body",
      "ship-overlay",
      "lighthouse-body",
      "lighthouse-overlay",
      "grave-underlay",
      "grave-body",
      "grave-overlay",
    ]);
  });

  it("applies dense-ship LOD budgets while keeping selected/titan wake and overlay draws", () => {
    const selected = makeShip({
      id: "selected-local",
      detailId: "ship.selected-local",
      tile: { x: 1, y: 1 },
      visual: { sizeTier: "local" },
    });
    const titan = makeShip({
      id: "usdc-circle",
      detailId: "ship.usdc-circle",
      tile: { x: 2, y: 2 },
      visual: { sizeTier: "titan", spriteAssetId: "ship.usdc-titan" },
    });
    const filler = Array.from({ length: 48 }, (_unused, index) => makeShip({
      id: `ship-${index}`,
      detailId: `ship.ship-${index}`,
      tile: { x: 3 + index * 0.1, y: 3 + index * 0.1 },
      visual: { sizeTier: "local" },
    }));
    const visibleShips = [selected, titan, ...filler];
    const docks: PharosVilleWorld["docks"] = [];
    const graves: PharosVilleWorld["graves"] = [];
    const lighthouse = { id: "lighthouse", kind: "lighthouse", detailId: "lighthouse", label: "lighthouse" } as unknown as PharosVilleWorld["lighthouse"];
    const world = {
      docks,
      graves,
      lighthouse,
      ships: visibleShips,
    } as unknown as PharosVilleWorld;
    const geometryById = new Map<string, ResolvedEntityGeometry>();
    for (const [index, ship] of visibleShips.entries()) {
      const x = 40 + (index % 10) * 110;
      const y = 120 + Math.floor(index / 10) * 90;
      geometryById.set(ship.id, makeGeometry(200 + index, x, y));
    }
    geometryById.set(lighthouse.id, makeGeometry(150, 260, 200));
    const cache = {
      geometryForEntity: (entity: { id: string }) => geometryById.get(entity.id) ?? makeGeometry(0, 0, 0),
    } as unknown as RenderFrameCache;
    const overlayCalls: string[] = [];
    const wakeCalls: string[] = [];

    drawEntityLayer(
      {
        assets: null,
        camera: { offsetX: 0, offsetY: 0, zoom: 0.9 },
        ctx: {} as CanvasRenderingContext2D,
        height: 760,
        hoveredTarget: null,
        motion: {
          plan: motionPlan(),
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
          rect: { x: 0, y: 0, width: 10, height: 10 },
        },
        shipMotionSamples: new Map(),
        targets: [],
        width: 1280,
        world,
      } satisfies DrawPharosVilleInput,
      cache,
      [],
      {
        drawDockBody: () => undefined,
        drawDockOverlay: () => undefined,
        drawGraveBody: () => undefined,
        drawGraveOverlay: () => undefined,
        drawGraveUnderlay: () => undefined,
        drawLighthouseBody: () => undefined,
        drawLighthouseOverlay: () => undefined,
        drawShipBody: () => undefined,
        drawShipOverlay: (ship) => overlayCalls.push(ship.id),
        drawShipWake: (ship) => wakeCalls.push(ship.id),
        isBackgroundedHarborDock: () => false,
        lighthouseOverlayScreenBounds: (rect) => rect,
        visibleShips,
      },
    );

    expect(overlayCalls).toContain(selected.id);
    expect(overlayCalls).toContain(titan.id);
    expect(wakeCalls).toContain(selected.id);
    expect(wakeCalls).toContain(titan.id);
    expect(overlayCalls.length).toBeLessThan(visibleShips.length);
    expect(wakeCalls.length).toBeLessThan(visibleShips.length);
  });
});
