// @vitest-environment jsdom
import { createElement, useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import type { Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import layout from "../data/layout.json";
import { ElementMeasurements, overlaps, setStyle, tagPlacement, useOverlayRects } from "./measurements";
import { AnalyticPicking } from "./picking";

afterEach(() => vi.unstubAllGlobals());

describe("overlay measurements", () => {
  it("reads dimensions once, then invalidates for content and ResizeObserver changes", () => {
    let notify: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(cb: ResizeObserverCallback) { notify = cb; }
      observe = vi.fn(); unobserve = vi.fn(); disconnect = disconnect;
    });
    const el = document.createElement("span");
    const width = vi.fn(() => 80), height = vi.fn(() => 18);
    Object.defineProperty(el, "offsetWidth", { get: width });
    Object.defineProperty(el, "offsetHeight", { get: height });
    const cache = new ElementMeasurements();
    expect(cache.get(el)).toMatchObject({ w: 80, h: 18 });
    cache.get(el);
    expect(width).toHaveBeenCalledTimes(1);
    cache.invalidate(el);
    cache.get(el);
    expect(width).toHaveBeenCalledTimes(2);
    notify!([{ target: el } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    cache.get(el);
    expect(width).toHaveBeenCalledTimes(3);
    expect(height).toHaveBeenCalledTimes(3);
    cache.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not assign unchanged styles", () => {
    const el = document.createElement("span");
    const write = vi.spyOn(el.style, "transform", "set");
    setStyle(el, "transform", "translate3d(12px, 8px, 0)");
    setStyle(el, "transform", "translate3d(12px, 8px, 0)");
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("shares camera preparation per frame and keeps the canvas rect until resize", () => {
    const canvas = document.createElement("canvas");
    const rect = vi.spyOn(canvas, "getBoundingClientRect");
    const camera = new THREE.PerspectiveCamera(45, 1.6, 1, 1000);
    camera.position.set(0, 100, 100);
    camera.lookAt(0, 0, 0);
    const matrix = vi.spyOn(camera, "updateMatrixWorld");
    const ctx = { renderer: { domElement: canvas }, camera, services: new Map([["layout", layout]]) as unknown as Services } as unknown as EngineContext;
    const picker = new AnalyticPicking(ctx);
    picker.beginFrame();
    for (let i = 0; i < 20; i++) picker.screenPosition({ kind: "landmark", id: "pharos" });
    picker.endFrame();
    expect(rect).toHaveBeenCalledTimes(1);
    expect(matrix).toHaveBeenCalledTimes(1);
    picker.beginFrame();
    picker.screenPosition({ kind: "landmark", id: "pharos" });
    picker.endFrame();
    expect(rect).toHaveBeenCalledTimes(1);
    expect(matrix).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("resize"));
    picker.beginFrame();
    picker.screenPosition({ kind: "landmark", id: "pharos" });
    picker.endFrame();
    expect(rect).toHaveBeenCalledTimes(2);
    picker.dispose();
  });
});


it.each([[600, 720], [720, 600], [1100, 640]])("fits wrapped tags and cached heights within %d×%d", (w, h) => {
  for (const x of [0, w / 2, w]) for (const y of [0, 50, h / 2, h]) {
    const box = tagPlacement(x, y, w - 24, 220, { w, h });
    expect(box.left).toBe(12); expect(box.top).toBeGreaterThanOrEqual(12);
    expect(box.top + 220).toBeLessThanOrEqual(h - 12);
  }
  expect(tagPlacement(w / 2, 180, 200, 220, { w, h }).below).toBe(true);
  expect(tagPlacement(w / 2, 300, 200, 220, { w, h }).below).toBe(false);
});

it("keeps a tag in the area an open side panel or sheet leaves free, 12 px clear of it", () => {
  const panelFree = { left: 12, top: 12, right: 1222 - 12, bottom: 1000 - 12 }; // side panel from x 1222 at 1600×1000
  for (const x of [900, 1200, 1400, 1590]) {
    const box = tagPlacement(x, 500, 480, 64, { w: 1600, h: 1000 }, panelFree);
    expect(box.left + 480).toBeLessThanOrEqual(1210); expect(box.left).toBeGreaterThanOrEqual(12);
  }
  const sheetFree = { left: 12, top: 12, right: 834 - 12, bottom: 556 - 12 }; // bottom sheet from y 556 at 834×1112
  for (const y of [300, 540, 700, 1100]) expect(tagPlacement(400, y, 300, 64, { w: 834, h: 1112 }, sheetFree).top + 64).toBeLessThanOrEqual(544);
  // the leader flips below only when there is no room above within the free area's own top
  expect(tagPlacement(400, 90, 300, 64, { w: 1600, h: 1000 }, { left: 740, top: 12, right: 1588, bottom: 988 }).below).toBe(true);
  expect(tagPlacement(400, 120, 300, 64, { w: 1600, h: 1000 }, { left: 740, top: 12, right: 1588, bottom: 988 }).below).toBe(false);
});

it("treats every visible overlay as occupied, including overlapping tools", () => {
  const a = { x: 10, y: 10, w: 50, h: 100 }, b = { x: 40, y: 10, w: 100, h: 100 };
  const label = { x: 120, y: 30, w: 20, h: 20 };
  expect(overlaps(label, a, 6)).toBe(false); expect(overlaps(label, b, 6)).toBe(true);
});


it("caches visible overlay rectangles and makes only covered controls inert", async () => {
  let rects: ReturnType<typeof useOverlayRects> | undefined;
  const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;
  const read = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.matches(".hb-search") ? box(0, 0, 300, 100) : this.matches(".covered") ? box(10, 10, 32, 32) : box(400, 200, 32, 32);
  });
  function Probe() {
    const root = useRef<HTMLDivElement>(null); rects = useOverlayRects(root);
    return createElement("div", { ref: root }, createElement("div", { className: "hb-search" }),
      createElement("div", { className: "hb-mark" }, createElement("button", { className: "covered" }), createElement("button", { className: "free" })));
  }
  const ui = render(createElement(Probe));
  const settle = () => act(async () => { await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))); });
  await settle();
  expect(ui.container.querySelector<HTMLElement>(".covered")!.inert).toBe(true);
  expect(ui.container.querySelector<HTMLElement>(".free")!.inert).toBe(false);
  expect(rects!.current).toHaveLength(2);
  const reads = read.mock.calls.length; void rects!.current; void rects!.current; expect(read).toHaveBeenCalledTimes(reads);
  ui.container.querySelector<HTMLElement>(".hb-search")!.hidden = true;
  await settle(); expect(ui.container.querySelector<HTMLElement>(".covered")!.inert).toBe(false);
  expect(rects!.current).toHaveLength(1);
  cleanup(); read.mockRestore();
});
