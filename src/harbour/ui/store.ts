/**
 * The UI store: one immutable snapshot for React (useSyncExternalStore) plus a per-frame callback
 * list for things that must track the world exactly (tag positions, chart labels). The frame
 * callbacks run inside the engine frame (a WorldSystem registered last), after the camera rig and
 * the sim have advanced and before the composer renders, so DOM tags never lag the hulls.
 */
import * as THREE from "three";
import { glideSeconds, glideTravel, type CameraPreset } from "../engine/camera-rig";
import type { Engine } from "../engine/engine";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { Boat, HarbourModel } from "../model/types";
import { PANEL_LANDMARKS, whereabouts, type Whereabouts } from "./facts";
import { UIPicking } from "./picking";
import { inPoly, seaZones } from "./places";
import { RouteLine } from "../fleet/route-line";
import { landmarkHover } from "../world/landmark-hover";
import { PH_APPROACHING, PH_CASTING_OFF, PH_SAILING } from "../sim/sim";
import { ensureMotionService, getLayout, getModel, getSim, sameHit, type MotionService, type PickHit, type PickingService } from "./services";

export interface UIState {
  model: HarbourModel | null;
  hover: PickHit | null;
  selected: PickHit | null;
  searchOpen: boolean;
  ledgerOpen: boolean;
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
}

type FrameFn = (frame: FrameState) => void;

/** Touch: hold this long (still) for the hover tag. */
const LONG_PRESS_MS = 480;
/** Touch: a finger that travels further than this is panning, not tapping. */
const TAP_SLOP_PX = 10;
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

/** One step of a critically damped spring toward (gx, gz) (semi-implicit; stable for dt ≤ 0.1). */
export function springStep(p: { x: number; z: number; vx: number; vz: number }, gx: number, gz: number, omega: number, dt: number): void {
  const w2 = omega * omega, c = 2 * omega;
  p.vx += (w2 * (gx - p.x) - c * p.vx) * dt;
  p.vz += (w2 * (gz - p.z) - c * p.vz) * dt;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
}

export class HarbourUIStore {
  private state: UIState;
  private readonly listeners = new Set<() => void>();
  private readonly frameFns = new Set<FrameFn>();
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
    this.state = {
      model: this.readModel(), hover: null, selected: null, searchOpen: false, ledgerOpen: false, chartMode: false,
      reducedMotion: this.motion.reduced, tick: 0, follow: null, announce: "", capturing: false,
    };
    this.cleanups.push(this.motion.subscribe((reduced) => { this.set({ reducedMotion: reduced }); if (reduced) this.setFollow(null); }));
    this.attachPointer(ctx.renderer.domElement);
    this.route = new RouteLine(ctx, (id) => getSim(this.ctx)?.itineraryOf?.(id) ?? null);
    this.cleanups.push(() => this.route.dispose());
    engine.add(this.system());
  }

  get ctx(): EngineContext { return this.engine.ctx; }

  // ------------------------------------------------------------------ store protocol

  getSnapshot = (): UIState => this.state;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  set(patch: Partial<UIState>): void {
    let changed = false;
    for (const k in patch) if ((patch as Record<string, unknown>)[k] !== (this.state as unknown as Record<string, unknown>)[k]) { changed = true; break; }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }
  onFrame(fn: FrameFn): () => void { this.frameFns.add(fn); return () => this.frameFns.delete(fn); }

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
    const model = this.readModel();
    if (model !== this.state.model) this.set({ model });
    if (frame.nowMs - this.lastTick >= 1000) { this.lastTick = frame.nowMs; this.set({ tick: this.state.tick + 1 }); }
    // hover: re-pick on pointer motion, and every 120 ms while still (boats sail out from under it)
    if (this.pointer.inside && !this.dragging && !this.state.capturing && (this.pointer.dirty || frame.nowMs - this.lastPickAt > 120)) {
      this.pointer.dirty = false;
      this.lastPickAt = frame.nowMs;
      const hit = this.picking.pick(this.pointer.x, this.pointer.y);
      this.setHover(hit);
    }
    landmarkHover(this.ctx.uniforms).step(frame.delta, this.ctx.uniforms.uNight.value);
    this.routeFrame(frame.delta);
    this.keyPanFrame(frame.delta);
    this.followFrame(frame.delta);
    for (const fn of this.frameFns) fn(frame);
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

  private setHover(hit: PickHit | null): void {
    if (sameHit(hit, this.state.hover)) return;
    this.picking.setHover(hit);
    this.ctx.renderer.domElement.style.cursor = hit && this.isOpenable(hit) ? "pointer" : "";
    this.set({ hover: hit });
  }

  private attachPointer(el: HTMLCanvasElement): void {
    const move = (e: PointerEvent) => {
      if (e.pointerType === "touch") { this.touchMove(e); return; }
      // Chrome sends pointermoves for a cursor that merely rests over the page at load (and on layout
      // changes; a resting hand jitters it by a pixel): only a pointer that has really travelled may hover.
      if (!this.pointer.inside) {
        if (!this.seen) this.seen = { x: e.clientX, y: e.clientY };
        if (Math.hypot(e.clientX - this.seen.x, e.clientY - this.seen.y) < 6) return;
      }
      this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.dirty = true; this.pointer.inside = true;
      if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) {
        this.dragging = true;
        this.setHover(null);
      }
    };
    const down = (e: PointerEvent) => {
      this.lastPointerType = e.pointerType;
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
      const hit = this.picking.pick(e.clientX, e.clientY);
      if (hit && this.isOpenable(hit)) this.select(hit);
      else if (!hit) this.select(null);
    };
    const cancel = (e: PointerEvent) => { if (e.pointerType === "touch") this.touchCancel(e); };
    const leave = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // a lifted finger keeps the tag it asked for
      this.pointer.inside = false; this.seen = null; this.setHover(null);
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
    const t = this.touch;
    if (!t.ids.delete(e.pointerId) || t.ids.size) return;
    clearTimeout(t.timer);
    if (t.multi || t.moved || t.long) return;
    const now = performance.now();
    const hit = this.picking.pick(e.clientX, e.clientY);
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
    if (!sameHit(hit, this.state.selected) || !hit) this.setFollow(null);
    this.picking.setSelected(hit);
    this.route.show(hit?.kind === "boat" ? hit.id : null);
    this.set({ selected: hit, searchOpen: false });
    if (hit && opts.fly !== false) this.flyTo(hit);
  }

  /** Camera flight (a minimum-jerk glide; a cut under reduced motion), keeping the selection clear of the side panel. */
  flyTo(hit: PickHit): void {
    const w = this.picking.worldPosition(hit);
    if (!w) return;
    const { rig, camera } = this.ctx;
    const close = hit.kind === "boat" ? 210 : hit.kind === "yard" ? 170 : hit.kind === "wreck" ? 160 : hit.kind === "harbour" ? 300
      : hit.id === "far-ports" || hit.id === "wreck-cove" || hit.id === "the-roads" ? 420 : hit.id === "slipway" ? 340 : hit.id === "pharos" ? 440 : 300;
    // the Pharos stands ~100 m to its statue: aim at its middle so the beacon and its tag stay in frame
    const ty = hit.kind === "landmark" && hit.id === "pharos" ? 45 : 0;
    const dist = Math.min(Math.max(rig.distance, close * 0.75), close);
    const [tx, tz] = this.framed(w[0], w[2], dist);
    this.moveTo({
      target: [tx, ty, tz], distance: dist, fovDeg: camera.fov,
      pitchDeg: THREE.MathUtils.radToDeg(rig.pitch), yawDeg: THREE.MathUtils.radToDeg(rig.yaw),
    });
  }

  /** The rig target that frames a ground point clear of the side panel (or above the bottom sheet) at `dist`. */
  private framed(x: number, z: number, dist: number): [number, number] {
    const { rig, camera } = this.ctx;
    const vh = this.ctx.renderer.domElement.clientHeight || innerHeight;
    const vw = this.ctx.renderer.domElement.clientWidth || innerWidth;
    const perPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / vh;
    let tx = x, tz = z;
    if (vw >= SHEET_BELOW_PX) {
      // the side panel: aim right of the object so it sits in the clear left part; screen-right on the
      // ground plane is (cos yaw, 0, −sin yaw)
      const shift = (PANEL_CLEARANCE_PX / 2) * perPx;
      tx += Math.cos(rig.yaw) * shift; tz -= Math.sin(rig.yaw) * shift;
    } else {
      // the bottom sheet: aim below the object so it sits in the clear top part; screen-down on the
      // ground is (sin yaw, 0, cos yaw), foreshortened by the pitch
      const down = ((SHEET_FRACTION * vh) / 2) * perPx / Math.sin(rig.pitch);
      tx += Math.sin(rig.yaw) * down; tz += Math.cos(rig.yaw) * down;
    }
    return [tx, tz];
  }

  /** A programmatic camera move: a glide, or a cut under reduced motion. */
  moveTo(p: CameraPreset, opts?: { ms?: number; lift?: number }): void {
    if (this.state.reducedMotion) this.ctx.rig.applyPreset(p, true);
    else this.ctx.rig.glideTo(p, opts);
  }

  /** The landing framing for the current aspect (a tablet may have turned round since). */
  homeView(): CameraPreset {
    const fitted = this.ctx.services.get("home-view") as (() => CameraPreset) | undefined;
    return fitted?.() ?? this.home;
  }

  /**
   * Fly back to the framing the visitor landed on: an unhurried glide (at least 1.6 s, the crane lift
   * on long hops). Already home, it answers with a breath: a 4 % push-in and back ("here you are").
   */
  goHome(): void {
    this.setFollow(null);
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
      return await new Promise<HTMLCanvasElement>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const src = this.ctx.renderer.domElement;
        const c = document.createElement("canvas");
        c.width = src.width; c.height = src.height;
        c.getContext("2d")!.drawImage(src, 0, 0);
        resolve(c);
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
    const k = this.state.reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
    v.x += (tx * KEY_PAN_PX_S - v.x) * k; v.y += (ty * KEY_PAN_PX_S - v.y) * k;
    const vh = this.ctx.renderer.domElement.clientHeight || innerHeight;
    const [wx, wz] = this.ctx.rig.dragToWorld(v.x * dt, v.y * dt, vh);
    this.ctx.rig.pan(wx, wz);
  }

  /** + / −: a short glide in or out by one step (counts as a user zoom: follow and watch let go). */
  keyZoom(dir: 1 | -1): void {
    const rig = this.ctx.rig;
    rig.inputEpoch++;
    const p = this.currentGoal();
    p.distance = THREE.MathUtils.clamp(p.distance * (dir > 0 ? 1 / KEY_ZOOM : KEY_ZOOM), rig.minDistance, rig.maxDistance);
    this.moveTo(p, { ms: 700 });
  }

  /** The rig's pose as a preset (where it is now). */
  private currentGoal(): CameraPreset {
    const { rig, camera } = this.ctx;
    return {
      target: [rig.target.x, rig.target.y, rig.target.z], distance: rig.distance, fovDeg: camera.fov,
      pitchDeg: THREE.MathUtils.radToDeg(rig.pitch), yawDeg: THREE.MathUtils.radToDeg(rig.yaw),
    };
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
    const [gx, gz] = this.framed(sim.pose.position[i * 3], sim.pose.position[i * 3 + 2], rig.distance);
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

  dispose(): void { for (const c of this.cleanups) c(); }
}
