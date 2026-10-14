/**
 * The UI store: one immutable snapshot for React (useSyncExternalStore) plus a per-frame callback
 * list for things that must track the world exactly (tag positions, chart labels). The frame
 * callbacks run inside the engine frame (a WorldSystem registered last), after the camera rig and
 * the sim have advanced and before the composer renders, so DOM tags never lag the hulls.
 */
import * as THREE from "three";
import type { CameraPreset } from "../engine/camera-rig";
import type { Engine } from "../engine/engine";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { Boat, HarbourModel } from "../model/types";
import { PANEL_LANDMARKS, whereabouts, type Whereabouts } from "./facts";
import { UIPicking } from "./picking";
import { inPoly, seaZones } from "./places";
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
}

type FrameFn = (frame: FrameState) => void;

/** Right-hand panel footprint (width + margins) the camera keeps clear when it flies to a selection. */
export const PANEL_CLEARANCE_PX = 392;

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
  /** Where the pointer was first seen; hovering starts only once it has travelled from there. */
  private seen: { x: number; y: number } | null = null;
  private readonly cleanups: Array<() => void> = [];
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
      reducedMotion: this.motion.reduced, tick: 0,
    };
    this.cleanups.push(this.motion.subscribe((reduced) => this.set({ reducedMotion: reduced })));
    this.attachPointer(ctx.renderer.domElement);
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
    if (this.pointer.inside && !this.dragging && (this.pointer.dirty || frame.nowMs - this.lastPickAt > 120)) {
      this.pointer.dirty = false;
      this.lastPickAt = frame.nowMs;
      const hit = this.picking.pick(this.pointer.x, this.pointer.y);
      this.setHover(hit);
    }
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
    const down = (e: PointerEvent) => { if (e.button === 0) this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const up = (e: PointerEvent) => {
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
    const leave = () => { this.pointer.inside = false; this.seen = null; this.setHover(null); };
    // double-click on open water: back to the landing framing
    const dbl = (e: MouseEvent) => { if (!this.picking.pick(e.clientX, e.clientY)) this.goHome(); };
    el.addEventListener("dblclick", dbl);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", leave);
    this.cleanups.push(() => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("dblclick", dbl);
    });
  }

  // ------------------------------------------------------------------ actions

  isOpenable(hit: PickHit): boolean {
    return hit.kind !== "landmark" || PANEL_LANDMARKS.has(hit.id);
  }

  select(hit: PickHit | null, opts: { fly?: boolean } = {}): void {
    this.picking.setSelected(hit);
    this.set({ selected: hit, searchOpen: false });
    if (hit && opts.fly !== false) this.flyTo(hit);
  }

  /** Damped camera flight (CameraRig goal), keeping the selection clear of the side panel. */
  flyTo(hit: PickHit): void {
    const w = this.picking.worldPosition(hit);
    if (!w) return;
    const { rig, camera } = this.ctx;
    const close = hit.kind === "boat" ? 210 : hit.kind === "yard" ? 170 : hit.kind === "harbour" ? 300
      : hit.id === "far-ports" || hit.id === "wreck-cove" || hit.id === "the-roads" ? 420 : hit.id === "slipway" ? 340 : hit.id === "pharos" ? 440 : 300;
    // the Pharos stands ~100 m to its statue: aim at its middle so the beacon and its tag stay in frame
    const ty = hit.kind === "landmark" && hit.id === "pharos" ? 45 : 0;
    const dist = Math.min(Math.max(rig.distance, close * 0.75), close);
    const vh = this.ctx.renderer.domElement.clientHeight || innerHeight;
    const vw = this.ctx.renderer.domElement.clientWidth || innerWidth;
    const perPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / vh;
    const shift = vw > 900 ? (PANEL_CLEARANCE_PX / 2) * perPx : 0;
    // screen-right on the ground plane is (cos yaw, 0, −sin yaw)
    const tx = w[0] + Math.cos(rig.yaw) * shift, tz = w[2] - Math.sin(rig.yaw) * shift;
    rig.applyPreset({
      target: [tx, ty, tz], distance: dist, fovDeg: camera.fov,
      pitchDeg: THREE.MathUtils.radToDeg(rig.pitch), yawDeg: THREE.MathUtils.radToDeg(rig.yaw),
    }, this.state.reducedMotion);
  }

  /** Fly back to the framing the visitor landed on. */
  goHome(): void {
    this.ctx.rig.applyPreset(this.home, this.state.reducedMotion);
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
