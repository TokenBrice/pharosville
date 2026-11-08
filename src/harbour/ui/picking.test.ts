// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticPicking, UIPicking } from "./picking";
import { FleetSystem, type PickingService as FleetPicking } from "../fleet/fleet-system";
import type { EngineContext } from "../engine/types";
import type { HarbourLayout } from "../layout/types";

const disposals: Array<() => void> = [];
afterEach(() => { for (const dispose of disposals.splice(0)) dispose(); });
function fixture(boats = [{ id: "hidden", x: 0, z: 0 }, { id: "visible", x: 0, z: 15 }], height = (_x: number, _z: number) => -10, top = 8, loa = 1) {
  const camera = new THREE.PerspectiveCamera(25, 1.6, 1, 5000);
  camera.position.set(0, 80, 160); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 1000 }) as DOMRect;
  const layout = { deckY: 0, hull: { mastAboveDeck: { boat: top }, loa: { boat: loa } }, landmarks: [], piers: [], zones: {}, seaLevel: 0 } as unknown as HarbourLayout;
  const sim = { pose: { count: boats.length, ids: boats.map((b) => b.id), position: boats.flatMap((b) => [b.x, 0, b.z]) }, model: { boats: boats.map((b) => ({ id: b.id, hullClass: "boat" })) }, tugs: { count: 0 } };
  const ground = { heightAt: vi.fn(height) };
  const ctx = { camera, renderer: { domElement: canvas }, services: new Map<string, unknown>([["layout", layout], ["sim", sim], ["ground", ground]]) } as unknown as EngineContext;
  const analytic = new AnalyticPicking(ctx), ui = new UIPicking(ctx);
  disposals.push(() => analytic.dispose(), () => ui.dispose());
  const point = (x: number, y: number, z: number) => { const v = new THREE.Vector3(x, y, z).project(camera); return [(v.x + 1) * 800, (1 - v.y) * 500] as const; };
  const fleet = new FleetSystem();
  Object.assign(fleet, { ctx, layout, boats: boats.map((b) => ({ ...b, visible: true, cx: b.x, cy: 2, cz: b.z, r: 7 })) });
  const rendered = (fleet as unknown as { pickingService(): FleetPicking }).pickingService();
  return { ctx, analytic, ui, point, ground, rendered, fleet };
}

describe("visible candidate selection", () => {
  it("rejects a hidden nearer candidate inside both searches and keeps looking", () => {
    // A narrow ridge hides the nearest screen-space axis, but leaves its neighbour visible.
    const f = fixture([{ id: "hidden", x: 0, z: 0 }, { id: "visible", x: 0.4, z: 0 }], (x, z) => Math.abs(x) < 0.15 && z > 2 && z < 8 ? 40 : -10);
    const [x, y] = f.point(0, 2, 0);
    expect(f.analytic.pick(x, y)).toEqual({ kind: "boat", id: "visible" });
    // The larger neighbour's visible bow is in front of the ridge.
    (f.fleet as unknown as { boats: Array<{ r: number }> }).boats[1].r = 20;
    expect(f.rendered.pick(x, y)).toEqual({ kind: "boat", id: "visible" });
  });

  it("preserves a visible mast even when the lower hull is hidden", () => {
    const f = fixture([{ id: "mast", x: 0, z: 0 }], (_x, z) => z > 2 && z < 8 ? 10 : -10, 25);
    expect(f.analytic.hidden("mast")).toBe(true);
    expect(f.analytic.pick(...f.point(0, 24, 0))).toEqual({ kind: "boat", id: "mast" });
    expect(f.analytic.pick(...f.point(0, 1, 0))).toBeNull();
  });

  it("uses 7px fine and 12px touch/pen targets, with deterministic proximity/depth/id priority", () => {
    const f = fixture([{ id: "b", x: 0, z: 0 }, { id: "a", x: 0, z: 0 }]);
    const [x, y] = f.point(0, 4, 0);
    expect(f.analytic.boatCandidates(x + 8, y)).toHaveLength(0);
    expect(f.analytic.boatCandidates(x + 8, y, true).map((c) => c.id)).toEqual(["a", "b"]);
    expect(f.ui.choices(x + 8, y).map((c) => c.id)).toEqual(["a", "b"]);
    expect(f.ui.choices(x, y)).toEqual([]); // direct hit needs no chooser
  });

  it("puts a direct hit before a closer expanded target and caps overlap choices at five", () => {
    const f = fixture(Array.from({ length: 8 }, (_, i) => ({ id: `ship-${i}`, x: 0, z: 0 })));
    const [x, y] = f.point(0, 4, 0);
    expect(f.ui.choices(x + 9, y)).toHaveLength(5);
    f.ctx.services.set("picking", { pick: () => ({ kind: "boat", id: "ship-7" }) });
    expect(f.ui.pick(x + 9, y, true)).toEqual({ kind: "boat", id: "ship-7" });
    expect(f.ui.choices(x + 9, y)).toEqual([]);
  });

  it("does no terrain work for a 625-boat screen-space miss", () => {
    const f = fixture(Array.from({ length: 625 }, (_, i) => ({ id: `${i}`, x: i / 100, z: 0 })));
    expect(f.analytic.boatCandidates(0, 0)).toEqual([]);
    expect(f.ground.heightAt).not.toHaveBeenCalled();
  });
});
