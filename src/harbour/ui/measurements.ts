import { useEffect, useState } from "react";

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
