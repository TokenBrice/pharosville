// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import layout from "../data/layout.json";
import { ElementMeasurements, setStyle } from "./measurements";
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
    const ctx = { renderer: { domElement: canvas }, camera, services: new Map([["layout", layout]]) } as unknown as EngineContext;
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
