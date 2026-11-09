import type { LabelBox } from "./cull";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

interface Dimensions { w: number; h: number; dirty: boolean }

/** Read only when content, fonts or layout actually change; never interleave overlay reads and writes. */
export class ElementMeasurements {
  private sizes = new WeakMap<HTMLElement, Dimensions>();
  private observer: ResizeObserver | undefined;

  get(el: HTMLElement | null | undefined): Dimensions {
    if (!el) return EMPTY;
    let size = this.sizes.get(el);
    if (!size) {
      size = { w: 0, h: 0, dirty: true };
      this.sizes.set(el, size);
      if (typeof ResizeObserver !== "undefined") {
        this.observer ??= new ResizeObserver((entries) => {
          for (const entry of entries) {
            const cached = this.sizes.get(entry.target as HTMLElement);
            if (cached) cached.dirty = true;
          }
        });
        this.observer.observe(el);
      }
    }
    if (size.dirty) {
      size.w = el.offsetWidth;
      size.h = el.offsetHeight;
      size.dirty = false;
    }
    return size;
  }
  forget(el: HTMLElement | null | undefined): void {
    if (!el) return;
    this.observer?.unobserve(el);
    this.sizes.delete(el);
  }
  invalidate(el: HTMLElement | null | undefined): void {
    if (!el) return;
    const size = this.sizes.get(el);
    if (size) size.dirty = true;
  }


  dispose(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.sizes = new WeakMap();
  }
}
const EMPTY: Dimensions = { w: 0, h: 0, dirty: false };

export function useMeasurements(): ElementMeasurements {
  const [cache] = useState(() => new ElementMeasurements());
  useEffect(() => () => cache.dispose(), [cache]);
  return cache;
}

type OverlayStyle = "visibility" | "opacity" | "transform" | "height";
const assignedStyles = new WeakMap<HTMLElement, Partial<Record<OverlayStyle, string>>>();

/** Keep requested strings, since CSSOM may serialize `10.0px` as `10px`. */
export function setStyle(el: HTMLElement, key: OverlayStyle, value: string): void {
  let assigned = assignedStyles.get(el);
  if (!assigned) { assigned = {}; assignedStyles.set(el, assigned); }
  if (assigned[key] === value) return;
  assigned[key] = value;
  if (el.style[key] !== value) el.style[key] = value;
}

/** A screen position on the device-pixel grid, so text under `will-change: transform` draws crisp, not soft. */
export const devicePx = (v: number): number => { const dpr = globalThis.devicePixelRatio || 1; return Math.round(v * dpr) / dpr; };

/**
 * Project the whole qualification box; the leader may shorten near an edge. `free` is the area left by the open
 * side panel, sheet or ledger (12 px in from every edge), so a tag never runs underneath them; without it, the viewport.
 */
export function tagPlacement(x: number, y: number, w: number, h: number, viewport: { w: number; h: number },
  free: { left: number; top: number; right: number; bottom: number } = { left: 12, top: 12, right: viewport.w - 12, bottom: viewport.h - 12 }) {
  const left = Math.max(free.left, Math.min(free.right - w, x - w / 2));
  const below = y - free.top < h + 15;
  const top = Math.max(free.top, Math.min(free.bottom - h, below ? y + 15 : y - h - 15));
  return { left, top, below };
}

/** Layout reads are batched on changes, never repeated in the engine's frame loop. */
export function useOverlayRects(root: RefObject<HTMLElement | null>) {
  const rects = useRef<LabelBox[]>([]);
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const surfaces = [...host.querySelectorAll<HTMLElement>(".hb-panel, .hb-ledger, .hb-search, .hb-help, .hb-sound-menu, .hb-back-controls, .hb-mark")]
        .filter((el) => el.dataset.shown !== "false" && !el.hidden);
      const boxes = surfaces.map((el) => ({ el, r: el.getBoundingClientRect() }));
      const controls = [...host.querySelectorAll<HTMLElement>(".hb-mark button")].map((el) => ({ el, r: el.getBoundingClientRect() }));
      rects.current = boxes.filter(({ r }) => r.width && r.height)
        .map(({ r }) => ({ x: r.left, y: r.top, w: r.width, h: r.height, visible: true }));
      const order = (el: HTMLElement) => el.matches(".hb-help") ? 4 : el.matches(".hb-search") ? 3 : el.matches(".hb-panel") ? 2 : el.matches(".hb-ledger") ? 1 : 0;
      for (const { el, r } of boxes) {
        if (!order(el)) continue;
        el.inert = boxes.some(({ el: higher, r: b }) => order(higher) > order(el) && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top);
      }
      for (const { el, r } of controls) {
        const covered = boxes.some(({ el: surface, r: b }) => !surface.contains(el) && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top);
        el.inert = covered;
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const observe = () => {
      resize?.disconnect();
      resize?.observe(host);
      host.querySelectorAll<HTMLElement>(".hb-panel, .hb-ledger, .hb-search, .hb-help, .hb-mark, .hb-sound-menu").forEach((el) => resize?.observe(el));
      schedule();
    };
    const mutation = new MutationObserver(observe);
    mutation.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-shown", "open", "hidden"] });
    observe();
    addEventListener("resize", schedule);
    host.addEventListener("transitionend", schedule);
    host.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame); mutation.disconnect(); resize?.disconnect();
      removeEventListener("resize", schedule); host.removeEventListener("transitionend", schedule); host.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [root]);
  return rects;
}

export function overlaps(a: Pick<LabelBox, "x" | "y" | "w" | "h">, b: Pick<LabelBox, "x" | "y" | "w" | "h">, pad = 0): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}
