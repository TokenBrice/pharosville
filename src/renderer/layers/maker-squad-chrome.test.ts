import { describe, expect, it } from "vitest";
import { MAKER_SQUAD, SKY_SQUAD } from "../../systems/maker-squad";
import type { AreaNode, PharosVilleWorld } from "../../systems/world-types";
import type { PharosVilleCanvasMotion } from "../render-types";
import {
  computeSquadBoundingEllipse,
  computeSquadPennantPath,
  drawSquadDistressFlag,
  drawSquadDistressFlags,
  drawSquadPennant,
  pennantWindTerm,
  SQUAD_DISTRESS_FLAG_HEX,
  type SquadAnchor,
} from "./maker-squad-chrome";

describe("maker-squad-chrome", () => {
  it("returns null pennant path when fewer than 2 squad members are visible", () => {
    expect(computeSquadPennantPath([], SKY_SQUAD.displayOrder)).toBeNull();
    expect(
      computeSquadPennantPath(
        [{ id: "usds-sky", mastTop: { x: 0, y: 0 } }],
        SKY_SQUAD.displayOrder,
      ),
    ).toBeNull();
  });

  it("orders the Sky pennant flagship -> vanguard -> savings cutter using the squad's displayOrder", () => {
    // Sky display order: usds-sky, stusds-sky, susds-sky.
    const path = computeSquadPennantPath(
      [
        { id: "susds-sky", mastTop: { x: 3, y: -2 } },
        { id: "stusds-sky", mastTop: { x: 0, y: -3 } },
        { id: "usds-sky", mastTop: { x: 0, y: 0 } },
      ],
      SKY_SQUAD.displayOrder,
    );
    expect(path).not.toBeNull();
    expect(path).toHaveLength(3);
    expect(path![0]).toEqual({ x: 0, y: 0 });   // flagship USDS first
    expect(path![1]).toEqual({ x: 0, y: -3 });  // stUSDS vanguard
    expect(path![2]).toEqual({ x: 3, y: -2 });  // sUSDS savings cutter
  });

  it("orders the Maker pennant flagship -> sDAI", () => {
    // Maker display order: dai-makerdao, sdai-sky.
    const path = computeSquadPennantPath(
      [
        { id: "sdai-sky", mastTop: { x: -2, y: -2 } },
        { id: "dai-makerdao", mastTop: { x: 0, y: 0 } },
      ],
      MAKER_SQUAD.displayOrder,
    );
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: -2, y: -2 },
    ]);
  });

  it("ignores anchors that are not in the supplied squad order", () => {
    // Cross-squad anchors (DAI fed into Sky pennant) must not appear.
    const path = computeSquadPennantPath(
      [
        { id: "dai-makerdao", mastTop: { x: -10, y: 5 } },
        { id: "usds-sky", mastTop: { x: 0, y: 0 } },
        { id: "stusds-sky", mastTop: { x: 0, y: -3 } },
      ],
      SKY_SQUAD.displayOrder,
    );
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: -3 },
    ]);
  });

  it("computes a bounding ellipse around all visible squad members", () => {
    const ellipse = computeSquadBoundingEllipse([
      { id: "usds-sky", mastTop: { x: 0, y: 0 } },
      { id: "dai-makerdao", mastTop: { x: 30, y: 0 } },
      { id: "stusds-sky", mastTop: { x: 15, y: 20 } },
    ]);
    expect(ellipse!.center.x).toBeCloseTo(15, 1);
    expect(ellipse!.radiusX).toBeGreaterThanOrEqual(15);
    expect(ellipse!.radiusY).toBeGreaterThanOrEqual(10);
  });

  it("returns null bounding ellipse when no anchors are supplied", () => {
    expect(computeSquadBoundingEllipse([])).toBeNull();
  });

  describe("pennant snap (3.4)", () => {
    function makeAreaWorld(band: AreaNode["band"]): PharosVilleWorld {
      const area: AreaNode = {
        id: "area-1",
        kind: "area",
        label: "Area 1",
        tile: { x: 0, y: 0 },
        band,
        detailId: "area-1",
      };
      return {
        generatedAt: 0,
        routeMode: "world",
        freshness: {},
        map: { width: 0, height: 0, tiles: [], waterRatio: 0 },
        lighthouse: {} as PharosVilleWorld["lighthouse"],
        pigeonnier: {} as PharosVilleWorld["pigeonnier"],
        docks: [],
        areas: [area],
        ships: [],
        graves: [],
        effects: [],
        detailIndex: {},
        entityById: {},
        legends: [],
        visualCues: [],
      };
    }

    function makeMotion(timeSeconds: number, reducedMotion = false): PharosVilleCanvasMotion {
      return {
        plan: {} as PharosVilleCanvasMotion["plan"],
        reducedMotion,
        timeSeconds,
        wallClockHour: 12,
      };
    }

    function makeStubCtx() {
      const recorded: Array<{ method: string; args: unknown[] }> = [];
      const record = (method: string) => (...args: unknown[]) => {
        recorded.push({ method, args });
      };
      const ctx = {
        save: record("save"),
        restore: record("restore"),
        beginPath: record("beginPath"),
        moveTo: record("moveTo"),
        quadraticCurveTo: record("quadraticCurveTo"),
        stroke: record("stroke"),
        fill: record("fill"),
        fillRect: record("fillRect"),
        lineTo: record("lineTo"),
        closePath: record("closePath"),
        ellipse: record("ellipse"),
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 0,
        lineCap: "",
      } as unknown as CanvasRenderingContext2D;
      return { ctx, recorded };
    }

    it("pennantWindTerm normalizes CALM=0 and DANGER=1 within bounds", () => {
      // windMultiplier(0) = 1; windMultiplier(4) ≈ 1.85.
      expect(pennantWindTerm(1)).toBe(0);
      expect(pennantWindTerm(1.85)).toBeCloseTo(1, 5);
      expect(pennantWindTerm(0.5)).toBe(0); // clamped
      expect(pennantWindTerm(3)).toBe(1); // clamped
    });

    it("renders a static catenary when no wind context is supplied", () => {
      const { ctx, recorded } = makeStubCtx();
      const path = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];
      drawSquadPennant(ctx, path);
      const quad = recorded.find((r) => r.method === "quadraticCurveTo");
      expect(quad).toBeDefined();
      // Static midpoint: midX=50, midY=0 + 100*0.1 = 10.
      expect(quad!.args[0]).toBeCloseTo(50, 5);
      expect(quad!.args[1]).toBeCloseTo(10, 5);
    });

    it("short-circuits to static catenary when reducedMotion is set", () => {
      const { ctx, recorded } = makeStubCtx();
      const path = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];
      drawSquadPennant(ctx, path, {
        motion: makeMotion(7.5, true),
        world: makeAreaWorld("DANGER"),
        squadId: "sky",
      });
      const quad = recorded.find((r) => r.method === "quadraticCurveTo");
      expect(quad!.args[0]).toBeCloseTo(50, 5);
      expect(quad!.args[1]).toBeCloseTo(10, 5);
    });

    it("perturbs the midpoint by ≤ 0.5 px at CALM (threat 0)", () => {
      const calm = makeAreaWorld("CALM");
      const path = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];
      // Sample 32 phases; max deviation from static (50, 10) must stay under 0.5 px.
      let maxDx = 0;
      let maxDy = 0;
      for (let step = 0; step < 32; step += 1) {
        const { ctx, recorded } = makeStubCtx();
        drawSquadPennant(ctx, path, {
          motion: makeMotion(step * 0.25),
          world: calm,
          squadId: "sky",
        });
        const quad = recorded.find((r) => r.method === "quadraticCurveTo")!;
        const dx = Math.abs((quad.args[0] as number) - 50);
        const dy = Math.abs((quad.args[1] as number) - 10);
        if (dx > maxDx) maxDx = dx;
        if (dy > maxDy) maxDy = dy;
      }
      expect(maxDx).toBeLessThanOrEqual(0.5);
      expect(maxDy).toBeLessThanOrEqual(0.5);
    });

    it("perturbs the midpoint by 3-4 px at DANGER (threat 4)", () => {
      const danger = makeAreaWorld("DANGER");
      const path = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];
      let maxDx = 0;
      let maxDy = 0;
      for (let step = 0; step < 32; step += 1) {
        const { ctx, recorded } = makeStubCtx();
        drawSquadPennant(ctx, path, {
          motion: makeMotion(step * 0.25),
          world: danger,
          squadId: "sky",
        });
        const quad = recorded.find((r) => r.method === "quadraticCurveTo")!;
        const dx = Math.abs((quad.args[0] as number) - 50);
        const dy = Math.abs((quad.args[1] as number) - 10);
        if (dx > maxDx) maxDx = dx;
        if (dy > maxDy) maxDy = dy;
      }
      expect(maxDx).toBeGreaterThanOrEqual(3);
      expect(maxDx).toBeLessThanOrEqual(4);
      expect(maxDy).toBeGreaterThanOrEqual(3);
      expect(maxDy).toBeLessThanOrEqual(4);
    });

    it("desynchronizes the two squads via a stable per-squad phase", () => {
      const danger = makeAreaWorld("DANGER");
      const path = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];
      const motion = makeMotion(0);
      const skyCtx = makeStubCtx();
      const makerCtx = makeStubCtx();
      drawSquadPennant(skyCtx.ctx, path, { motion, world: danger, squadId: "sky" });
      drawSquadPennant(makerCtx.ctx, path, { motion, world: danger, squadId: "maker" });
      const skyMid = skyCtx.recorded.find((r) => r.method === "quadraticCurveTo")!;
      const makerMid = makerCtx.recorded.find((r) => r.method === "quadraticCurveTo")!;
      // Different phases at t=0 produce different oscillator outputs.
      expect(skyMid.args[0]).not.toEqual(makerMid.args[0]);
    });
  });

  describe("distress flag (5.4)", () => {
    function makeStubCtx() {
      const calls: Array<{ method: string; args: unknown[] }> = [];
      const setStyles: Record<string, unknown> = {};
      const ctx = new Proxy(
        {
          save: () => calls.push({ method: "save", args: [] }),
          restore: () => calls.push({ method: "restore", args: [] }),
          beginPath: () => calls.push({ method: "beginPath", args: [] }),
          moveTo: (...args: unknown[]) => calls.push({ method: "moveTo", args }),
          lineTo: (...args: unknown[]) => calls.push({ method: "lineTo", args }),
          closePath: () => calls.push({ method: "closePath", args: [] }),
          fill: () => calls.push({ method: "fill", args: [] }),
          fillRect: (...args: unknown[]) => calls.push({ method: "fillRect", args }),
        } as Record<string, unknown>,
        {
          get(target, prop) {
            return target[prop as string];
          },
          set(target, prop, value) {
            setStyles[prop as string] = value;
            target[prop as string] = value;
            return true;
          },
        },
      ) as unknown as CanvasRenderingContext2D;
      return { ctx, calls, setStyles };
    }

    it("renders a small red triangular pennant above the mast-top", () => {
      const { ctx, calls, setStyles } = makeStubCtx();
      drawSquadDistressFlag(ctx, { x: 100, y: 50 });
      expect(setStyles.fillStyle).toBe(SQUAD_DISTRESS_FLAG_HEX);
      // 3 lineTo calls form the triangle (moveTo + 2× lineTo + closePath).
      const moveToCalls = calls.filter((c) => c.method === "moveTo");
      const lineToCalls = calls.filter((c) => c.method === "lineTo");
      expect(moveToCalls.length).toBeGreaterThanOrEqual(1);
      expect(lineToCalls.length).toBeGreaterThanOrEqual(2);
      // Mast and triangle paint above the mast top (y < mastTop.y).
      const fillRectCall = calls.find((c) => c.method === "fillRect");
      expect(fillRectCall).toBeDefined();
      const rectY = fillRectCall!.args[1] as number;
      expect(rectY).toBeLessThan(50);
    });

    it("uses the canonical deep red hex shared with the ledger swatch", () => {
      expect(SQUAD_DISTRESS_FLAG_HEX).toBe("#a02018");
    });

    it("drawSquadDistressFlags draws only for anchors flagged inDistress", () => {
      const { ctx, calls } = makeStubCtx();
      const anchors: SquadAnchor[] = [
        { id: "a", mastTop: { x: 10, y: 10 }, inDistress: true },
        { id: "b", mastTop: { x: 20, y: 20 } },
        { id: "c", mastTop: { x: 30, y: 30 }, inDistress: true },
      ];
      drawSquadDistressFlags(ctx, anchors);
      // 2 distressed anchors → 2 fillRect calls (one per mast).
      expect(calls.filter((c) => c.method === "fillRect")).toHaveLength(2);
      // 2 begin/close pairs (one per triangle).
      expect(calls.filter((c) => c.method === "closePath")).toHaveLength(2);
    });

    it("drawSquadDistressFlags is a no-op when no anchors are flagged", () => {
      const { ctx, calls } = makeStubCtx();
      drawSquadDistressFlags(ctx, [
        { id: "a", mastTop: { x: 10, y: 10 } },
        { id: "b", mastTop: { x: 20, y: 20 } },
      ]);
      expect(calls).toHaveLength(0);
    });
  });
});

