import type { CameraRig } from "./camera-rig";
import type { MotionService } from "../ui/services";

export const TOUCH_COMMIT_PX = 10;
export const primaryPointer = (e: Pick<PointerEvent, "pointerType" | "button">): boolean => e.pointerType === "touch" || e.button === 0;

/** Release speed (px/s) below which a fling is a plain stop. */
const FLING_MIN = 60;
/** Inertia decay rate (1/s): the glide loses ~63% of its speed every 1/DECAY s. */
const DECAY = 3.5;
/** Fastest glide we start (px/s): a wild flick must not throw the camera across the chart. */
const FLING_MAX = 4200;

/**
 * Camera input on the canvas: mouse drag pans, the wheel zooms about the cursor; touch: one finger pans (with a glide
 * on release), two fingers pinch-zoom toward their midpoint and pan together. Taps, long-presses and
 * double-taps (selection, the hover tag, home) belong to the UI store, which listens to the same
 * pointer events. The canvas takes `touch-action: none`, so the browser neither scrolls nor
 * page-zooms under the world; the DOM UI above it keeps its own scrolling.
 */
export class CameraInput {
  private readonly pts = new Map<number, { x: number; y: number; startX: number; startY: number; touch: boolean }>();
  /** last two-finger midpoint and spread */
  private mid: { x: number; y: number; d: number } | null = null;
  /** glide velocity (px/s), measured on the last touch moves */
  private vx = 0;
  private vy = 0;
  private lastMoveAt = 0;
  private gliding = false;
  /** a touch has been seen: long presses must not open the context menu */
  private touchSeen = false;
  private committed = false;
  private stopEpoch = 0;
  private readonly off: Array<() => void> = [];

  constructor(private readonly el: HTMLElement, private readonly rig: CameraRig, private readonly motion?: MotionService) {
    el.style.touchAction = "none";
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on("pointerdown", (e) => this.down(e));
    on("pointermove", (e) => this.move(e));
    on("pointerup", (e) => this.up(e));
    on("pointercancel", () => this.cancel());
    on("lostpointercapture", (e) => { if (this.pts.has(e.pointerId)) this.cancel(); });
    const blur = () => this.cancel();
    window.addEventListener("blur", blur);
    this.off.push(() => window.removeEventListener("blur", blur));
    if (motion) this.off.push(motion.subscribe((reduced) => { if (reduced) this.cancel(); }));
    // the wheel zooms about the cursor, as a pinch zooms about the fingers
    on("wheel", (e) => {
      e.preventDefault();
      this.cancel();
      const r = this.el.getBoundingClientRect();
      this.rig.zoomAt(Math.min(1.25, Math.max(0.8, Math.exp(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1) * 0.0012))), e.clientX - r.left - this.width / 2, e.clientY - r.top - this.height / 2, this.height);
    }, { passive: false });
    // a long press is the hover tag, not the browser's context menu / iOS callout
    on("contextmenu", (e) => { if (this.touchSeen) e.preventDefault(); });
  }

  private get height(): number { return this.el.clientHeight || innerHeight; }
  private get width(): number { return this.el.clientWidth || innerWidth; }

  private down(e: PointerEvent): void {
    if (!primaryPointer(e)) return;
    if (e.pointerType !== "touch" && this.pts.size) return;
    if (e.pointerType === "touch" && [...this.pts.values()].some((p) => !p.touch)) this.cancel();
    if (!this.pts.size) {
      if (this.gliding) this.rig.stop();
      this.committed = e.pointerType !== "touch";
    }
    if (e.pointerType === "touch") this.touchSeen = true;
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, touch: e.pointerType === "touch" });
    this.el.setPointerCapture?.(e.pointerId);
    this.gliding = false;
    this.vx = this.vy = 0;
    this.lastMoveAt = performance.now();
    this.stopEpoch = this.rig.stopEpoch;
    this.mid = this.pts.size === 2 ? this.spread() : null;
  }

  private move(e: PointerEvent): void {
    const p = this.pts.get(e.pointerId);
    if (!p) return;
    let dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pts.size === 1) {
      if (!this.committed) {
        dx = p.x - p.startX; dy = p.y - p.startY;
        if (Math.hypot(dx, dy) <= TOUCH_COMMIT_PX) return;
        this.committed = true;
      }
      this.panBy(dx, dy);
      if (e.pointerType === "touch") this.track(dx, dy);
      return;
    }
    if (this.pts.size !== 2 || !this.mid) return;
    const m = this.spread();
    if (!this.committed) {
      if (![...this.pts.values()].some((p) => Math.hypot(p.x - p.startX, p.y - p.startY) > TOUCH_COMMIT_PX)) return;
      this.committed = true;
    }
    // pan with the midpoint, then zoom about it (the ground under the fingers stays under them)
    this.panBy(m.x - this.mid.x, m.y - this.mid.y);
    if (this.mid.d > 0 && m.d > 0) {
      this.rig.zoomAt(this.mid.d / m.d, m.x - this.width / 2, m.y - this.height / 2, this.height);
    }
    this.track(m.x - this.mid.x, m.y - this.mid.y);
    this.mid = m;
  }

  private up(e: PointerEvent): void {
    if (!this.pts.delete(e.pointerId)) return;
    if (this.pts.size === 1) {
      // a pinch became a one-finger pan: no jump, and the glide is measured afresh
      this.mid = null;
      for (const p of this.pts.values()) { p.startX = p.x; p.startY = p.y; }
      this.vx = this.vy = 0;
      return;
    }
    if (this.pts.size > 0) { this.mid = this.pts.size === 2 ? this.spread() : null; this.vx = this.vy = 0; return; }
    this.mid = null;
    // a finger that rested before lifting does not fling
    const speed = Math.hypot(this.vx, this.vy);
    if (e.pointerType === "touch" && this.committed && !this.motion?.reduced && performance.now() - this.lastMoveAt < 80 && speed > FLING_MIN) {
      const k = Math.min(1, FLING_MAX / speed);
      this.vx *= k; this.vy *= k;
      this.gliding = true;
    }
  }

  /** Cancellation never turns a partial gesture into a fling. */
  cancel(): void {
    if (this.gliding || this.pts.size) this.rig.stop();
    this.stopEpoch = this.rig.stopEpoch;
    this.pts.clear(); this.mid = null; this.committed = false;
    this.gliding = false; this.vx = this.vy = 0;
  }

  /** Smoothed finger velocity (px/s) over the last moves. */
  private track(dx: number, dy: number): void {
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMoveAt) / 1000;
    this.lastMoveAt = now;
    const a = Math.min(1, dt / 0.05);   // ≈ 50 ms window
    this.vx += (dx / dt - this.vx) * a;
    this.vy += (dy / dt - this.vy) * a;
  }

  private spread(): { x: number; y: number; d: number } {
    const [a, b] = [...this.pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  private panBy(dx: number, dy: number): void {
    if (!dx && !dy) return;
    const [wx, wz] = this.rig.dragToWorld(dx, dy, this.height);
    this.rig.pan(wx, wz);
  }

  /** Per frame, before the rig: the glide after a fling. */
  update(delta: number): void {
    if (this.stopEpoch !== this.rig.stopEpoch || this.motion?.reduced) { this.stopEpoch = this.rig.stopEpoch; this.gliding = false; this.vx = this.vy = 0; }
    if (!this.gliding || delta <= 0) return;
    const speed = Math.hypot(this.vx, this.vy);
    // End at the exact speed threshold, including the last partial frame at any refresh rate.
    const k = Math.max(Math.exp(-DECAY * delta), 12 / speed);
    this.panBy(this.vx * (1 - k) / DECAY, this.vy * (1 - k) / DECAY);
    this.vx *= k; this.vy *= k;
    if (speed * k <= 12) this.gliding = false;
  }

  dispose(): void { for (const f of this.off) f(); this.off.length = 0; }
}
