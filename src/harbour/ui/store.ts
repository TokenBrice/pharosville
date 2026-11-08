/**
 * The UI store: one immutable snapshot for React (useSyncExternalStore) plus a per-frame callback
 * list for things that must track the world exactly (tag positions, chart labels). The frame
 * callbacks run inside the engine frame (a WorldSystem registered last), after the camera rig and
 * the sim have advanced and before the composer renders, so DOM tags never lag the hulls.
 */
import * as THREE from "three";
import { primaryPointer, TOUCH_COMMIT_PX } from "../engine/input";
import { glideSeconds, glideTravel, type CameraPreset } from "../engine/camera-rig";
import type { Engine } from "../engine/engine";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { Boat, HarbourModel } from "../model/types";
import { PANEL_LANDMARKS, whereabouts, type Whereabouts } from "./facts";
import { UIPicking } from "./picking";
import { civicTop, inPoly, plotFor, seaZones } from "./places";
import { idleBreath, modelWatch, watchSources, WATCH_DWELL_S, type WatchStop } from "./watch";
import { truthCopy } from "./truth-copy";
import { nextPalette, registerPaletteTokens, type Palette } from "./palette";
import { ElementMeasurements } from "./measurements";
import { footprintBounds, frameSubject, usableSpace, type ScreenRect, type SubjectBounds } from "./camera-moves";
import { LEDGER_PANES_MIN_PX, newLedgerContext, type LedgerContext, type LedgerTab, type LedgerView } from "./ledger-state";
import { deadSummaries } from "../model/obituary";
import { yardCoins } from "./yard";
import { RouteLine } from "../fleet/route-line";
import { landmarkHover } from "../world/landmark-hover";
import { PH_APPROACHING, PH_CASTING_OFF, PH_SAILING } from "../sim/sim";
import { ensureMotionService, getCove, getLayout, getModel, getSim, sameHit, type MotionService, type PickHit, type PickingService } from "./services";

export interface UIState {
  model: HarbourModel | null;
  hover: PickHit | null;
  shipChoices: PickHit[];
  selected: PickHit | null;
  searchOpen: boolean;
  ledgerOpen: boolean;
  ledger?: LedgerContext;
  ledgerOrigin?: boolean;
  guideStop?: number | null;
  chartMode: boolean;
  reducedMotion: boolean;
  /** Slow clock (1 Hz) for text that changes as boats sail. */
  tick: number;
  /** The boat the camera is following (F), if any. */
  follow: string | null;
  /** The screen-reader live line for keyboard moves ([ / ] stepping, follow). */
  announce: string;
  /** A postcard frame is being taken: the overlay UI steps aside. */
  capturing: boolean;
  /** The harbourmaster's watch (W): the current stop's coin and why it is shown, or null. */
  watch: { symbol: string; line: string } | null;
  /** The overlay palette (palette.ts): the night bridge after dusk, from the clock's night factor. Absent reads as day. */
  palette?: Palette;
  /** The visitor's own Still world (Sound options), as the motion service reports it; its slip shows while it is on. */
  still?: boolean;
}

// Identifiers and research intent survive size-gate teardown; no readings or runtime are retained.
let readingSession: { selected: PickHit | null; ledger: LedgerContext; ledgerOpen: boolean; origin: boolean; fly: boolean } | null = null;

type FrameFn = (frame: FrameState) => void;

/** Touch: hold this long (still) for the hover tag. */
const LONG_PRESS_MS = 480;
/** Touch: a finger that travels further than this is panning, not tapping. */
const TAP_SLOP_PX = TOUCH_COMMIT_PX;
/** Touch: a second tap on open water landing this soon (after the first lifts) and this close flies home. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 40;

/** Right-hand panel footprint (width + margins) the camera keeps clear when it flies to a selection. */
export const PANEL_CLEARANCE_PX = 392;
/** Below this viewport width the panel is a bottom sheet (harbour-ui.css) of at most this share of the height. */
export const SHEET_BELOW_PX = 900;
export const SHEET_FRACTION = 0.5;

/** Arrow / WASD pan speed (screen px/s) and the +/− zoom step. */
const KEY_PAN_PX_S = 520;
const KEY_ZOOM = 1.25;
/** Follow spring stiffness (1/s): a critically damped spring lags about 2/ω ≈ 1.2 s behind a steady sail. */
export const FOLLOW_OMEGA = 1.7;
/** The watch frames each subject from this far (m). */
const WATCH_DIST = 260;

/** Exact critically damped spring step toward (gx, gz), independent of frame duration. */
export function springStep(p: { x: number; z: number; vx: number; vz: number }, gx: number, gz: number, omega: number, dt: number): void {
  const k = Math.exp(-omega * dt);
  const dx = p.x - gx, dz = p.z - gz;
  const bx = p.vx + omega * dx, bz = p.vz + omega * dz;
  p.x = gx + (dx + bx * dt) * k; p.z = gz + (dz + bz * dt) * k;
  p.vx = (p.vx - omega * bx * dt) * k; p.vz = (p.vz - omega * bz * dt) * k;
}

export class HarbourUIStore {
  private state: UIState;
  private readonly listeners = new Set<() => void>();
  private readonly frameFns = new Set<FrameFn>();
  private readonly frameWrites = new Set<FrameFn>();
  readonly picking: PickingService;
  readonly motion: MotionService;
  private pointer: { x: number; y: number; dirty: boolean; inside: boolean } = { x: 0, y: 0, dirty: false, inside: false };
  private lastPickAt = 0;
  private lastTick = 0;
  private dragging = false;
  private down: { x: number; y: number; t: number } | null = null;
  private lastPointerType = "";
  private readonly touch = {
    ids: new Set<number>(), x: 0, y: 0, at: 0, moved: false, multi: false, long: false,
    timer: 0 as ReturnType<typeof setTimeout> | 0,
    lastTap: null as { x: number; y: number; at: number } | null,
  };
  /** Where the pointer was first seen; hovering starts only once it has travelled from there. */
  private seen: { x: number; y: number } | null = null;
  private readonly cleanups: Array<() => void> = [];
  private readonly route: RouteLine;
  /** The framing the visitor landed on: Home / double-click on open water flies back to it. */
  private readonly home: CameraPreset;
  private readonly devStale = import.meta.env.DEV ? new URLSearchParams(location.search).get("stale") : null;
  private staleSrc: HarbourModel | null = null;
  private staleOut: HarbourModel | null = null;

  constructor(readonly engine: Engine) {
    const ctx = engine.ctx;
    this.picking = new UIPicking(ctx);
    this.motion = ensureMotionService(ctx);
    const { rig, camera } = ctx;
    this.home = {
      target: [rig.target.x, rig.target.y, rig.target.z], distance: rig.distance, fovDeg: camera.fov,
      pitchDeg: THREE.MathUtils.radToDeg(rig.pitch), yawDeg: THREE.MathUtils.radToDeg(rig.yaw),
    };
    registerPaletteTokens();
    this.state = {
      model: this.readModel(), hover: null, shipChoices: [], selected: null, searchOpen: false, ledgerOpen: false, chartMode: false,
      ledger: readingSession?.ledger ?? newLedgerContext(), ledgerOrigin: false, guideStop: null,
      reducedMotion: this.motion.reduced, tick: 0, follow: null, announce: "", capturing: false, watch: null,
      palette: nextPalette(null, ctx.uniforms.uNight.value), still: this.motion.still,
    };
    this.cleanups.push(this.motion.subscribe((reduced) => { this.set({ reducedMotion: reduced, still: this.motion.still }); if (reduced) { this.setFollow(null); this.ctx.rig.stop(); this.keyVel.x = this.keyVel.y = 0; } }));
    this.attachPointer(ctx.renderer.domElement);
    this.route = new RouteLine(ctx, (id) => getSim(this.ctx)?.itineraryOf?.(id) ?? null);
    this.cleanups.push(() => this.route.dispose());
    const resize = () => { this.measurements.invalidate(ctx.renderer.domElement); };
    addEventListener("resize", resize);
    this.cleanups.push(() => removeEventListener("resize", resize));
    engine.add(this.system());
  }

  get ctx(): EngineContext { return this.engine.ctx; }

  // ------------------------------------------------------------------ store protocol

  getSnapshot = (): UIState => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  set(patch: Partial<UIState>): void {
    // Opening research takes camera intent; the ledger must never trigger an unsolicited flight.
    if (patch.ledgerOpen && this.state.selected) this.selectionEpoch = null;
    let changed = false;
    for (const k in patch) if ((patch as Record<string, unknown>)[k] !== (this.state as unknown as Record<string, unknown>)[k]) { changed = true; break; }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
  onFrame(fn: FrameFn): () => void { this.frameFns.add(fn); return () => this.frameFns.delete(fn); }
  onFrameWrite(fn: FrameFn): () => void { this.frameWrites.add(fn); return () => this.frameWrites.delete(fn); }

  // ------------------------------------------------------------------ the frame hook

  private system(): WorldSystem {
    return {
      name: "ui",
      init: () => undefined,
      update: (frame) => this.frame(frame),
      dispose: () => undefined,
    };
  }

  private frame(frame: FrameState): void {
    this.picking.beginFrame();
    const model = this.readModel();
    if (model !== this.state.model) this.set({ model });
    this.restoreReadingSession();
    this.refreshPanelSpace();
    if (frame.nowMs - this.lastTick >= 1000) {
      this.lastTick = frame.nowMs;
      // the night bridge follows the clock's night factor (never a reading), with hysteresis (palette.ts)
      this.set({ tick: this.state.tick + 1, palette: nextPalette(this.state.palette, this.ctx.uniforms.uNight.value) });
    }
    // hover: re-pick on pointer motion, and every 120 ms while still (boats sail out from under it)
    if (!this.ledgerHover && this.pointer.inside && !this.hoverHeld && !this.dragging && !this.state.capturing && !this.state.watch && (this.pointer.dirty || frame.nowMs - this.lastPickAt > 120)) {
      this.pointer.dirty = false;
      this.lastPickAt = frame.nowMs;
      const hit = this.picking.pick(this.pointer.x, this.pointer.y);
      this.setHover(hit);
    }
    try {
      landmarkHover(this.ctx.uniforms).step(frame.delta, this.ctx.uniforms.uNight.value);
      if (this.ctx.rig.inputEpoch !== this.seenEpoch) { this.seenEpoch = this.ctx.rig.inputEpoch; this.noteInput(); }
      this.watchFrame(frame.delta);
      this.breathFrame(frame.delta);
      this.routeFrame(frame.delta);
      this.keyPanFrame(frame.delta);
      this.followFrame(frame.delta);
      for (const fn of this.frameFns) fn(frame);
      // All overlay reads/projections finish before the first style write.
      for (const fn of this.frameWrites) fn(frame);
    } finally {
      this.picking.endFrame();
    }
  }

  /**
   * The model as the UI reads it. Dev only: `?stale=1` (or `?stale=mintBurn,chains`) fogs the world
   * through the readings system; the same override marks those endpoints stale here, so the dot, the
   * wordmark and the panel footers say what the fog says.
   */
  private readModel(): HarbourModel | null {
    const m = getModel(this.ctx);
    if (!m || !this.devStale) return m;
    if (m === this.staleSrc) return this.staleOut;
    const keys = this.devStale === "1" ? ["stablecoins"] : this.devStale.split(",");
    const truth = { ...m.truth };
    for (const k of Object.keys(truth) as Array<keyof typeof truth>) {
      if (keys.includes(k)) truth[k] = { ...truth[k], state: "stale", ageSec: Math.max(truth[k].ageSec ?? 0, 2 * 3600) };
    }
    this.staleSrc = m;
    this.staleOut = { ...m, truth };
    return this.staleOut;
  }

  private hoverHeld = false;
  private suppressedHover: PickHit | null = null;
  holdHover(held: boolean): void {
    this.hoverHeld = held;
    if (!held && !this.pointer.inside && this.state.hover) this.setHover(null);
  }
  private ledgerHover = false;

  private setHover(hit: PickHit | null): void {
    if (this.suppressedHover) {
      if (sameHit(hit, this.suppressedHover)) return;
      this.suppressedHover = null;
    }
    if (sameHit(hit, this.state.hover)) return;
    this.picking.setHover(hit);
    this.ctx.renderer.domElement.style.cursor = hit && this.isOpenable(hit) ? "pointer" : "";
    this.set({ hover: hit });
  }

  private attachPointer(el: HTMLCanvasElement): void {
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") { this.touchMove(e); return; }
      if (this.touch.ids.size) return;
      // Chrome sends pointermoves for a cursor that merely rests over the page at load (and on layout
      // changes; a resting hand jitters it by a pixel): only a pointer that has really travelled may hover.
      if (!this.pointer.inside) {
        if (!this.seen) this.seen = { x: e.clientX, y: e.clientY };
        if (Math.hypot(e.clientX - this.seen.x, e.clientY - this.seen.y) < 6) return;
      }
      this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.dirty = true; this.pointer.inside = true;
      this.noteInput();
      if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) {
        this.dragging = true;
        this.setHover(null);
      }
    };
    const down = (e: PointerEvent) => {
      if (!primaryPointer(e)) return;
      this.lastPointerType = e.pointerType;
      this.noteInput();
      if (this.state.watch) this.stopWatch();
      if (e.pointerType === "touch") { this.touchDown(e); return; }
      if (e.button === 0) this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType === "touch") { this.touchUp(e); return; }
      const d = this.down;
      this.down = null;
      const wasDrag = this.dragging;
      this.dragging = false;
      if (!d || wasDrag || e.button !== 0) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 600) return;
      const choices = e.pointerType === "pen" ? this.picking.choices?.(e.clientX, e.clientY) ?? [] : [];
      if (choices.length > 1) { this.set({ shipChoices: choices }); return; }
      const hit = this.picking.pick(e.clientX, e.clientY, e.pointerType === "pen");
      if (hit && this.isOpenable(hit)) this.select(hit);
      else if (!hit) this.select(null);
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerType === "touch") this.touchCancel(e);
      this.down = null; this.dragging = false;
    };
    const blur = () => {
      this.touch.ids.clear(); this.touch.multi = true; clearTimeout(this.touch.timer);
      this.down = null; this.dragging = false; this.keyDirs.clear(); this.stopAutomation();
    };
    window.addEventListener("blur", blur);
    el.addEventListener("lostpointercapture", cancel);
    const leave = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // a lifted finger keeps the tag it asked for
      this.pointer.inside = false; this.seen = null;
      if (e.relatedTarget instanceof Element && e.relatedTarget.closest(".hb-tag-anchor")) { this.hoverHeld = true; return; }
      this.setHover(null);
    };
    // double-click on open water: back to the landing framing (touch has its own double tap)
    const dbl = (e: MouseEvent) => { if (this.lastPointerType !== "touch" && !this.picking.pick(e.clientX, e.clientY)) this.goHome(); };
    el.addEventListener("dblclick", dbl);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", leave);
    this.cleanups.push(() => {
      window.removeEventListener("blur", blur);
      el.removeEventListener("lostpointercapture", cancel);
      clearTimeout(this.touch.timer);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("dblclick", dbl);
    });
  }

  // ------------------------------------------------------------------ touch: tap, long press, double tap

  /**
   * Touch has no hover. A tap selects what it lands on (or shows the tag of a hover-only landmark); a
   * long press shows the tag without opening anything; a double tap on open water flies home. Pans and
   * pinches (engine/input.ts) are never taps: a gesture that moved or ever had two fingers down is not.
   */
  private touchDown(e: PointerEvent): void {
    const t = this.touch;
    this.pointer.inside = false; this.pointer.dirty = false; this.seen = null;
    t.ids.add(e.pointerId);
    clearTimeout(t.timer);
    if (t.ids.size > 1) { t.multi = true; return; }
    t.multi = false; t.moved = false; t.long = false;
    t.x = e.clientX; t.y = e.clientY; t.at = performance.now();
    if (this.state.hover) this.setHover(null);
    t.timer = setTimeout(() => {
      if (t.multi || t.moved || !t.ids.size) return;
      t.long = true;
      this.setHover(this.picking.pick(t.x, t.y));
    }, LONG_PRESS_MS);
  }

  private touchMove(e: PointerEvent): void {
    const t = this.touch;
    if (!t.ids.has(e.pointerId) || t.moved) return;
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP_PX) { t.moved = true; clearTimeout(t.timer); }
  }

  private touchUp(e: PointerEvent): void {
    this.touchMove(e);
    const t = this.touch;
    if (!t.ids.delete(e.pointerId) || t.ids.size) return;
    clearTimeout(t.timer);
    if (t.multi || t.moved || t.long) return;
    const now = performance.now();
    const choices = this.picking.choices?.(e.clientX, e.clientY) ?? [];
    if (choices.length > 1) { t.lastTap = null; this.set({ shipChoices: choices }); return; }
    const hit = this.picking.pick(e.clientX, e.clientY, true);
    const prev = t.lastTap;
    t.lastTap = hit ? null : { x: e.clientX, y: e.clientY, at: now };
    if (!hit && prev && t.at - prev.at < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_TAP_SLOP_PX) {
      t.lastTap = null;
      this.goHome();
      return;
    }
    if (!hit) { this.select(null); return; }
    if (this.isOpenable(hit)) this.select(hit);
    else this.setHover(hit);
  }

  private touchCancel(e: PointerEvent): void {
    const t = this.touch;
    t.ids.delete(e.pointerId);
    t.multi = true;
    clearTimeout(t.timer);
  }

  // ------------------------------------------------------------------ actions

  isOpenable(hit: PickHit): boolean {
    return hit.kind !== "landmark" || PANEL_LANDMARKS.has(hit.id);
  }

  select(hit: PickHit | null, opts: { fly?: boolean } = {}): void {
    if (this.state.watch) this.stopWatch();
    if (!sameHit(hit, this.state.selected) || !hit) this.setFollow(null);
    this.picking.setSelected(hit);
    this.route.show(hit?.kind === "boat" ? hit.id : null);
    this.set({ selected: hit, searchOpen: false, shipChoices: [], ...(hit && opts.fly !== false ? { ledgerOpen: false } : {}) });
    this.selectionEpoch = hit && opts.fly !== false ? this.ctx.rig.inputEpoch : null;
    if (hit && opts.fly !== false) this.flyTo(hit);
  }

  private selectionEpoch: number | null = null;
  private readonly measurements = new ElementMeasurements();
  private readonly panels = new Map<"panel" | "ledger", HTMLElement>();
  private spaceKey = "";
  private space: ScreenRect | null = null;

  measurePanel(kind: "panel" | "ledger", element: HTMLElement): () => void {
    this.panels.set(kind, element);
    return () => { this.measurements.forget(element); if (this.panels.get(kind) === element) this.panels.delete(kind); };
  }

  private refreshPanelSpace(reframe = true): void {
    const canvas = this.ctx.renderer.domElement, size = this.measurements.get(canvas);
    const width = size.w || canvas.clientWidth || innerWidth, height = size.h || canvas.clientHeight || innerHeight;
    const overlays: ScreenRect[] = [];
    for (const [kind, element] of this.panels) {
      if (kind === "ledger" && (!this.state.ledgerOpen || (this.state.selected && width < LEDGER_PANES_MIN_PX))) continue;
      if (kind === "panel" && !this.state.selected) continue;
      const { w, h } = this.measurements.get(element);
      if (!w || !h) continue;
      overlays.push(kind === "ledger" ? { left: 14, right: 14 + w, top: 14, bottom: height - 14 }
        : width < SHEET_BELOW_PX ? { left: 0, right: width, top: height - h, bottom: height }
          : { left: width - 14 - w, right: width - 14, top: 14, bottom: 14 + h });
    }
    const space = usableSpace(width, height, overlays), key = `${width},${height},${space.left},${space.right},${space.top},${space.bottom}`;
    this.space = space;
    if (key === this.spaceKey) return;
    this.spaceKey = key;
    if (reframe && this.state.selected && this.selectionEpoch === this.ctx.rig.inputEpoch) this.flyTo(this.state.selected);
  }

  private subjectBounds(hit: PickHit): SubjectBounds | null {
    const w = this.picking.worldPosition(hit);
    if (!w) return null;
    const layout = getLayout(this.ctx);
    if (hit.kind === "boat") {
      const b = this.boat(hit.id), top = b && layout ? (layout.deckY ?? 1.2) + (layout.hull.mastAboveDeck[b.hullClass] ?? 8) : 16;
      const length = b && layout ? layout.hull.loa[b.hullClass] / 2 : 12;
      return { center: [w[0], top / 2, w[2]], radius: Math.hypot(top / 2, length ?? 12) };
    }
    if (hit.kind === "landmark" && hit.id === "pharos") return { center: [w[0], w[1] + 45, w[2]], radius: 62 };
    if (hit.kind === "wreck") {
      const mark = getCove(this.ctx)?.mark(hit.id);
      if (mark) return { center: [mark.x, mark.y + mark.top / 2, mark.z], radius: Math.hypot(mark.top / 2, mark.len / 2) };
    }
    const plot = hit.kind === "landmark" ? plotFor(layout, hit.id) : null;
    if (plot) return { center: [w[0], w[1] + civicTop(plot.kind) / 2, w[2]], radius: Math.hypot(civicTop(plot.kind) / 2, plot.footprint[0] / 2, plot.footprint[1] / 2) };
    if (hit.kind === "harbour") {
      const pier = layout?.piers.find((p) => p.chain === hit.id);
      const bounds = pier && footprintBounds(pier.segments.flatMap((s) => [s.a, s.b]), 16);
      if (bounds && pier) { bounds.radius += Math.max(...pier.segments.map((s) => s.width)) / 2; return bounds; }
    }
    if (hit.kind === "landmark") {
      const polygon = seaZones(layout).find((z) => z.id === hit.id)?.polygon
        ?? (hit.id === "shoals" ? layout?.zones.shoals?.polygon : hit.id === "wreck-cove" ? layout?.zones.wreckCove?.polygon : hit.id === "far-ports" ? layout?.zones.farPorts?.polygon : undefined);
      const bounds = polygon && footprintBounds(polygon, 16);
      if (bounds) return bounds;
    }
    const landmark = layout?.landmarks.find((l) => l.id === hit.id);
    return { center: [w[0], w[1] + 8, w[2]], radius: landmark?.footprint ?? (hit.kind === "harbour" ? 24 : 16) };
  }

  /** Selection and Follow use the same measured free rectangle. */
  private selectionPose(hit: PickHit, distance?: number): CameraPreset | null {
    const subject = this.subjectBounds(hit);
    if (!subject) return null;
    const { rig, camera, renderer } = this.ctx;
    const width = renderer.domElement.clientWidth || innerWidth, height = renderer.domElement.clientHeight || innerHeight;
    const close = hit.kind === "boat" ? 210 : hit.kind === "yard" ? 170 : hit.kind === "wreck" ? 160 : hit.kind === "harbour" ? 300
      : hit.id === "far-ports" || hit.id === "wreck-cove" || hit.id === "the-roads" ? 420 : hit.id === "slipway" ? 340 : hit.id === "pharos" ? 440 : 300;
    return frameSubject(subject, this.space ?? usableSpace(width, height, []), width, height, {
      target: subject.center, distance: distance ?? Math.min(Math.max(rig.distance, close * 0.75), close), fovDeg: camera.fov,
      pitchDeg: THREE.MathUtils.radToDeg(rig.pitch), yawDeg: THREE.MathUtils.radToDeg(rig.yaw),
    });
  }

  flyTo(hit: PickHit): void {
    this.refreshPanelSpace(false);
    const pose = this.selectionPose(hit);
    if (pose) this.moveTo(pose);
  }

  updateLedger(patch: Partial<LedgerContext>): void { this.set({ ledger: { ...this.state.ledger!, ...patch } }); }
  updateLedgerView(tab: LedgerTab, patch: Partial<LedgerView>): void {
    const ledger = this.state.ledger!;
    this.updateLedger({ views: { ...ledger.views, [tab]: { ...ledger.views[tab], ...patch } } });
  }
  readLedger(hit: PickHit, locate = false): void {
    this.hoverLedger(null);
    if (!locate) this.stopAutomation();
    this.updateLedgerView(this.state.ledger!.tab, { row: hit.id });
    this.set({ ledgerOrigin: true, ledgerOpen: !locate });
    this.select(hit, { fly: locate });
  }
  returnToLedger(): void {
    this.select(null, { fly: false });
    this.updateLedger({ returning: true });
    this.set({ ledgerOpen: true, ledgerOrigin: false });
  }
  coinsOnChain(chain: string): void {
    this.updateLedger({ tab: "Coins", filters: { ...newLedgerContext().filters, chain }, returning: false });
    this.updateLedgerView("Coins", { query: "", scroll: 0, row: null });
    this.select(null, { fly: false });
    this.set({ ledgerOpen: true, ledgerOrigin: false });
  }
  hoverLedger(hit: PickHit | null): void { this.ledgerHover = !!hit; this.setHover(hit); }
  startGuide(stop = 0): void { this.stopAutomation(); this.set({ guideStop: Math.max(0, Math.min(4, stop)) }); }
  closeGuide(): void { this.set({ guideStop: null }); }

  private restoreReadingSession(): void {
    const saved = readingSession, model = this.state.model;
    if (!saved || !model?.hasFleet || model.truth.stablecoins.state !== "current") return;
    readingSession = null;
    const hit = saved.selected;
    const valid = !hit ? false : hit.kind === "boat" ? model.boats.some((b) => b.id === hit.id)
      : hit.kind === "wreck" ? deadSummaries().has(hit.id) || model.readings.wrecks.some((w) => w.id === hit.id)
        : hit.kind === "yard" ? yardCoins(this.ctx).some((c) => c.id === hit.id)
          : hit.kind === "harbour" ? model.harbours.some((h) => h.chain === hit.id) : PANEL_LANDMARKS.has(hit.id);
    this.set({ ledgerOpen: saved.ledgerOpen, ledgerOrigin: valid && saved.origin });
    if (valid) this.select(hit, { fly: saved.fly });
  }

  /** A programmatic camera move: a glide, or a cut under reduced motion. */
  moveTo(p: CameraPreset, opts?: { ms?: number; lift?: number }): void {
    if (this.state.reducedMotion) this.ctx.rig.applyPreset(p, true);
    else this.ctx.rig.glideTo(p, opts);
  }

  /** The landing framing for the current aspect (a tablet may have turned round since). */
  homeView(): CameraPreset {
    const fitted = this.ctx.services.get("home-view");
    return fitted?.() ?? this.home;
  }

  /**
   * Fly back to the framing the visitor landed on: an unhurried glide (at least 1.6 s, the crane lift
   * on long hops). Already home, it answers with a breath: a 4 % push-in and back ("here you are").
   */
  goHome(): void {
    this.stopAutomation();
    this.selectionEpoch = null;
    const p = this.homeView(), rig = this.ctx.rig;
    if (this.state.reducedMotion) { rig.applyPreset(p, true); return; }
    const settled = !rig.gliding && Math.abs(rig.distance - p.distance) < 1
      && Math.abs(rig.target.x - p.target[0]) < 1 && Math.abs(rig.target.z - p.target[2]) < 1;
    if (settled) { rig.glideTo(p, { ms: 1600, lift: -0.04 }); return; }
    const travel = glideTravel(rig.target.x, rig.target.z, rig.distance, p.target[0], p.target[2], p.distance);
    rig.glideTo(p, { ms: Math.max(1600, glideSeconds(travel) * 1000) });
  }

  /** The selected boat's rounds on the water (fleet/route-line.ts). */
  private routeFrame(dt: number): void {
    const sel = this.state.selected, sim = getSim(this.ctx);
    const i = sel?.kind === "boat" && sim ? sim.pose.ids.indexOf(sel.id) : -1;
    const at: [number, number] | null = i >= 0 && sim ? [sim.pose.position[i * 3], sim.pose.position[i * 3 + 2]] : null;
    this.route.update(dt, !this.ctx.rig.gliding, this.state.reducedMotion, at);
  }

  // ------------------------------------------------------------------ idle breath and the watch (W)

  private lastInputAt = performance.now();
  private seenEpoch = 0;
  private readonly breathGoal = { k: 0, dx: 0, dz: 0 };

  /** Any visitor input: the idle clock restarts (and a breath under way eases out). */
  noteInput(): void { this.lastInputAt = performance.now(); }

  /**
   * Idle breath (12-M7a): after 3 min with no input and nothing open, the view breathes ±3 % and a few
   * metres round where it rests over a 90 s sine; any input lets it ease back out. Render-only (the rig's
   * breath offset): it never travels and never moves the goal. Still under reduced motion.
   */
  private breathFrame(dt: number): void {
    const s = this.state, rig = this.ctx.rig;
    const active = !s.reducedMotion && !s.selected && !s.follow && !s.watch && !s.searchOpen && !s.ledgerOpen && !rig.gliding;
    const g = this.breathGoal;
    if (active) idleBreath((performance.now() - this.lastInputAt) / 1000, g); else g.k = g.dx = g.dz = 0;
    const b = rig.breath, k = s.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.5);
    b.k += (g.k - b.k) * k; b.dx += (g.dx - b.dx) * k; b.dz += (g.dz - b.dz) * k;
    if (Math.abs(b.k) < 1e-5 && Math.abs(b.dx) < 1e-3 && Math.abs(b.dz) < 1e-3) b.k = b.dx = b.dz = 0;
  }

  private watchRun: { stops: WatchStop[]; i: number; dwell: number; epoch: number; spring: { x: number; z: number; vx: number; vz: number } } | null = null;

  private watchRanked: { model: HarbourModel | null; second: number; stops: WatchStop[] } | null = null;
  private watchStops(): WatchStop[] {
    const model = this.state.model, second = Math.floor(Date.now() / 1000);
    if (this.watchRanked?.model !== model || this.watchRanked.second !== second) this.watchRanked = { model, second, stops: modelWatch(model, Date.now()) };
    return this.watchRanked.stops;
  }

  private watchEmpty(): string {
    const current = watchSources(this.state.model, Date.now());
    return truthCopy({ kind: "watch", waiting: !current.fleet || !current.peg });
  }

  toggleWatch(): void { if (this.state.watch) this.stopWatch(); else this.startWatch(); }

  /** W: glide between the day's data-ranked subjects, ~20 s at each, pinning the hover tag. Opt-in only. */
  startWatch(): void {
    const stops = this.watchStops();
    if (!stops.length) { this.set({ announce: this.watchEmpty() }); return; }
    if (this.state.selected) this.select(null);
    this.setFollow(null);
    this.set({ ledgerOpen: false, searchOpen: false, guideStop: null });
    const rig = this.ctx.rig;
    this.watchRun = { stops, i: -1, dwell: 0, epoch: rig.inputEpoch, spring: { x: rig.target.x, z: rig.target.z, vx: 0, vz: 0 } };
    this.watchNext();
  }

  stopWatch(cancelMotion = true): void {
    if (!this.watchRun && !this.state.watch) return;
    this.watchRun = null;
    if (cancelMotion) this.ctx.rig.stop();
    this.setHover(null);
    this.set({ watch: null, announce: "Watch ended." });
  }

  stopAutomation(): void {
    this.stopWatch(); this.setFollow(null); this.ctx.rig.stop();
    this.keyVel.x = this.keyVel.y = 0;
  }

  dismissHover(): boolean {
    if (!this.state.hover) return false;
    const hit = this.state.hover;
    this.hoverHeld = false; this.setHover(null); this.suppressedHover = hit;
    return true;
  }

  watchPrevious(): void { this.watchNext(-1); }

  inspectWatch(): void {
    const stop = this.watchRun?.stops[this.watchRun.i];
    if (stop && this.watchStops().some((s) => s.id === stop.id && s.reason === stop.reason)) this.select({ kind: "boat", id: stop.id });
  }

  watchNext(direction: 1 | -1 = 1): void {
    const w = this.watchRun;
    if (!w) return;
    const previous = w.stops[w.i];
    w.stops = this.watchStops();
    if (!w.stops.length) { this.stopWatch(); this.set({ announce: this.watchEmpty() }); return; }
    const at = previous ? w.stops.findIndex((s) => s.id === previous.id && s.reason === previous.reason) : -1;
    w.i = at < 0 ? (direction === 1 ? 0 : w.stops.length - 1) : (at + direction + w.stops.length) % w.stops.length;
    w.dwell = 0;
    const stop = w.stops[w.i], b = this.boat(stop.id);
    const pos = this.picking.worldPosition({ kind: "boat", id: stop.id });
    if (!b || !pos) { this.stopWatch(); return; }
    const { rig, camera } = this.ctx;
    this.moveTo({
      target: [pos[0], 0, pos[2]], distance: THREE.MathUtils.clamp(WATCH_DIST, rig.minDistance, rig.maxDistance), fovDeg: camera.fov,
      pitchDeg: THREE.MathUtils.radToDeg(rig.pitch), yawDeg: THREE.MathUtils.radToDeg(rig.yaw),
    });
    const hit: PickHit = { kind: "boat", id: stop.id };
    this.picking.setHover(hit);
    this.set({ hover: hit, watch: { symbol: b.symbol, line: stop.line }, announce: `Watch: ${b.symbol}, ${stop.line}.` });
  }

  private watchFrame(dt: number): void {
    const w = this.watchRun, rig = this.ctx.rig;
    if (!w) return;
    if (rig.inputEpoch !== w.epoch) { this.stopWatch(false); return; }
    const stops = this.watchStops();
    const previous = w.stops[w.i];
    const supported = stops.findIndex((s) => s.id === previous?.id && s.reason === previous.reason);
    if (!stops.length) {
      this.stopWatch(); this.set({ announce: this.watchEmpty() }); return;
    }
    w.stops = stops;
    if (supported < 0) {
      if (this.state.reducedMotion) { this.stopWatch(); return; }
      w.i = -1; this.watchNext(); return;
    }
    w.i = supported;
    const stop = stops[supported], boat = this.boat(stop.id);
    if (boat && (this.state.watch?.line !== stop.line || this.state.watch?.symbol !== boat.symbol)) this.set({ watch: { symbol: boat.symbol, line: stop.line } });
    if (rig.gliding) { Object.assign(w.spring, { x: rig.target.x, z: rig.target.z, vx: 0, vz: 0 }); return; }
    if (this.state.reducedMotion) return;
    w.dwell += dt;
    if (w.dwell >= WATCH_DWELL_S) { this.watchNext(); return; }
    // keep her in view while she sails (the follow spring, no panel to clear)
    if (this.state.reducedMotion) return;
    const p = this.picking.worldPosition({ kind: "boat", id: w.stops[w.i].id });
    if (!p) return;
    springStep(w.spring, p[0], p[2], FOLLOW_OMEGA, dt);
    rig.steer(w.spring.x, w.spring.z);
  }

  // ------------------------------------------------------------------ postcard (P)

  private readonly postcardFns = new Set<() => void>();
  onPostcard(fn: () => void): () => void { this.postcardFns.add(fn); return () => this.postcardFns.delete(fn); }
  requestPostcard(): void { for (const fn of this.postcardFns) fn(); }

  /**
   * The next rendered frame, copied at display resolution. The overlay UI and the hover step aside for
   * it (`capturing`); the copy is taken in a rAF callback queued after the engine's own, so the drawing
   * buffer still holds the frame just rendered (no preserveDrawingBuffer needed).
   */
  async captureFrame(): Promise<HTMLCanvasElement> {
    this.setHover(null);
    this.set({ capturing: true });
    try {
      // let the hover lift fade from the hulls (~250 ms) before the shutter
      await new Promise((r) => setTimeout(r, 320));
      return await new Promise<HTMLCanvasElement>((resolve, reject) => requestAnimationFrame(() => requestAnimationFrame(() => {
        try {
          const src = this.ctx.renderer.domElement;
          const c = document.createElement("canvas");
          c.width = src.width; c.height = src.height;
          c.getContext("2d")!.drawImage(src, 0, 0);
          resolve(c);
        } catch (error) { reject(error); }
      })));
    } finally { this.set({ capturing: false }); }
  }

  // ------------------------------------------------------------------ keyboard camera

  private readonly keyDirs = new Set<string>();
  private readonly keyVel = { x: 0, y: 0 };

  /** Arrows / WASD held: pan at a steady screen speed, eased in and out (one pan per frame). */
  keyPan(dir: "up" | "down" | "left" | "right", held: boolean): void {
    if (held) this.keyDirs.add(dir); else this.keyDirs.delete(dir);
  }

  private keyPanFrame(dt: number): void {
    const d = this.keyDirs, v = this.keyVel;
    const tx = (d.has("left") ? 1 : 0) - (d.has("right") ? 1 : 0);
    const ty = (d.has("up") ? 1 : 0) - (d.has("down") ? 1 : 0);
    if (!tx && !ty && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) { v.x = v.y = 0; return; }
    const len = Math.hypot(tx, ty) || 1;
    const gx = tx / len * KEY_PAN_PX_S, gy = ty / len * KEY_PAN_PX_S;
    const k = this.state.reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
    const dx = this.state.reducedMotion ? gx * dt : gx * dt + (v.x - gx) * k / 8;
    const dy = this.state.reducedMotion ? gy * dt : gy * dt + (v.y - gy) * k / 8;
    v.x += (gx - v.x) * k; v.y += (gy - v.y) * k;
    const vh = this.ctx.renderer.domElement.clientHeight || innerHeight;
    const [wx, wz] = this.ctx.rig.dragToWorld(dx, dy, vh);
    this.ctx.rig.pan(wx, wz);
  }

  /** + / −: accumulate steps on the pending distance with a 150 ms chase (a cut under reduction). */
  keyZoom(dir: 1 | -1): void {
    const rig = this.ctx.rig;
    this.setFollow(null);
    if (this.state.watch) this.stopWatch();
    rig.zoom(dir > 0 ? 1 / KEY_ZOOM : KEY_ZOOM, 1 / 0.15, this.state.reducedMotion);
  }

  private stepList: string[] = [];
  private stepAt = 0;
  private stepEpoch = -1;

  /**
   * [ / ]: step through the hulls in view, largest first. The list is taken on the first press and kept
   * while the visitor keeps stepping (the camera moves with each step); a pan, zoom or a pause of 15 s
   * takes a fresh one.
   */
  stepHull(dir: 1 | -1): void {
    const now = performance.now(), rig = this.ctx.rig;
    if (!this.stepList.length || now - this.stepAt > 15000 || rig.inputEpoch !== this.stepEpoch) this.stepList = this.hullsInView();
    this.stepAt = now;
    this.stepEpoch = rig.inputEpoch;
    const list = this.stepList;
    if (!list.length) { this.set({ announce: "No ships in view." }); return; }
    const cur = this.state.selected?.kind === "boat" ? list.indexOf(this.state.selected.id) : -1;
    const i = cur < 0 ? (dir > 0 ? 0 : list.length - 1) : (cur + dir + list.length) % list.length;
    const b = this.boat(list[i]);
    this.select({ kind: "boat", id: list[i] });
    if (b) this.set({ announce: `${b.symbol}, ${i + 1} of ${list.length} in view.` });
  }

  /** Boats whose hull is on screen and not hidden behind the island, biggest supply first. */
  hullsInView(): string[] {
    const sim = getSim(this.ctx);
    if (!sim) return [];
    const cam = this.ctx.camera;
    cam.updateMatrixWorld();
    const v = new THREE.Vector3(), out: Array<{ id: string; s: number }> = [];
    for (let i = 0; i < sim.pose.count; i++) {
      v.set(sim.pose.position[i * 3], 1, sim.pose.position[i * 3 + 2]).project(cam);
      if (v.z >= 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95) continue;
      const id = sim.pose.ids[i];
      if (this.picking.hidden(id)) continue;
      out.push({ id, s: this.boat(id)?.supply ?? 0 });
    }
    return out.sort((a, b) => b.s - a.s).map((o) => o.id);
  }

  // ------------------------------------------------------------------ follow (F)

  private readonly fol = { x: 0, z: 0, vx: 0, vz: 0, epoch: 0, still: 0 };

  /** Start or stop following a boat. Hidden under reduced motion (the world is still). */
  setFollow(id: string | null): void {
    if (id && this.state.reducedMotion) return;
    if (id === this.state.follow) return;
    if (id) {
      const rig = this.ctx.rig;
      this.selectionEpoch = rig.inputEpoch;
      this.set({ ledgerOpen: false });
      const pose = this.selectionPose({ kind: "boat", id }, rig.distance);
      if (pose) this.moveTo(pose);
      Object.assign(this.fol, { x: rig.target.x, z: rig.target.z, vx: 0, vz: 0, epoch: rig.inputEpoch, still: 0 });
    }
    const b = id ? this.boat(id) : null;
    this.set({ follow: id, announce: b ? `Following ${b.symbol}.` : this.state.follow ? "Stopped following." : this.state.announce });
  }

  toggleFollow(): void {
    const sel = this.state.selected;
    if (this.state.follow) this.setFollow(null);
    else if (sel?.kind === "boat") this.setFollow(sel.id);
  }

  /**
   * A critically damped spring (ω = FOLLOW_OMEGA, ~1.2 s lag) toward the boat's framed point, so heel
   * and bob never shake the view. Any pan or zoom lets go; so does a boat that has lain still at a
   * berth for 2 s (the view settles there).
   */
  private followFrame(dt: number): void {
    const id = this.state.follow;
    if (!id || dt <= 0) return;
    const rig = this.ctx.rig, f = this.fol;
    if (rig.inputEpoch !== f.epoch) { this.setFollow(null); return; }
    const sim = getSim(this.ctx);
    const i = sim ? sim.pose.ids.indexOf(id) : -1;
    if (!sim || i < 0) { this.setFollow(null); return; }
    const ph = sim.pose.phase[i];
    f.still = ph === PH_SAILING || ph === PH_CASTING_OFF || ph === PH_APPROACHING ? 0 : f.still + dt;
    if (f.still > 2) { this.setFollow(null); return; }
    // let a fly-to land first; the spring picks up from wherever the camera is
    if (rig.gliding) { Object.assign(f, { x: rig.target.x, z: rig.target.z, vx: 0, vz: 0 }); return; }
    const pose = this.selectionPose({ kind: "boat", id }, rig.distance);
    if (!pose) return;
    const [gx, , gz] = pose.target;
    springStep(f, gx, gz, FOLLOW_OMEGA, dt);
    rig.steer(f.x, f.z);
  }

  // ------------------------------------------------------------------ reads

  boat(id: string): Boat | null {
    return this.state.model?.boats.find((b) => b.id === id) ?? null;
  }

  whereaboutsOf(id: string): Whereabouts {
    const sim = getSim(this.ctx);
    if (!sim) return { kind: "unknown", place: null };
    const i = sim.pose.ids.indexOf(id);
    if (i < 0) return { kind: "unknown", place: null };
    const slot = sim.layout.slots[sim.pose.slot[i]] ?? null;
    const place = slot ? sim.layout.pierChains.get(slot.where) ?? null : null;
    return whereabouts(sim.pose.phase[i], slot?.kind ?? null, place, sim.pose.outing?.[i] === 1);
  }

  underWay(): number | null { return getSim(this.ctx)?.stats.underWay ?? null; }

  /** Boats lying in a sea zone right now (by the sim pose), biggest first; null without a sim or zone. */
  boatsInZone(zoneId: string): Boat[] | null {
    const sim = getSim(this.ctx), zone = seaZones(getLayout(this.ctx)).find((z) => z.id === zoneId);
    if (!sim || !zone) return null;
    const out: Boat[] = [];
    for (let i = 0; i < sim.pose.count; i++) {
      if (!inPoly(sim.pose.position[i * 3], sim.pose.position[i * 3 + 2], zone.polygon)) continue;
      const b = this.boat(sim.pose.ids[i]);
      if (b) out.push(b);
    }
    return out.sort((a, b) => b.supply - a.supply);
  }

  dispose(): void {
    readingSession = { selected: this.state.selected, ledger: this.state.ledger!, ledgerOpen: this.state.ledgerOpen,
      origin: !!this.state.ledgerOrigin, fly: this.selectionEpoch === this.ctx.rig.inputEpoch };
    this.measurements.dispose();
    for (const c of this.cleanups) c();
    this.picking.dispose();
    this.frameFns.clear();
    this.frameWrites.clear();
    this.listeners.clear();
  }
}
