import type { EngineContext } from "../engine/types";
import type { HarbourLayout, Vec2, Vec3 } from "../layout/types";
import { anniversaryToday, worldToday } from "../model/anniversary";
import { TITANS } from "../fleet/titans";
import { FRONT_HERE, FRONT_MIN, targetsForLevel } from "../weather/director";
import type { Ambience, AmbienceInputs } from "./ambience";

/**
 * World → sound, loaded lazily with the ambience (none of this is in the main chunk): every 250 ms the
 * Feeder reads the engine's services (layout, camera, weather, season, civic, lighthouse, model) into the
 * ambience's inputs, places the sources, answers lightning with thunder, the beam's passing and the
 * anniversary bell. Every service is read structurally and optional: the sound never depends on one.
 */

interface Readings { fog?: number }
interface Life { wind?: number }
/** P6 layout additions read here, all optional (older layouts simply have no Mint / no pharos block). */
interface CivicLayout { pharos?: { position: Vec3 }; civic?: Array<{ kind: string; position: Vec3 }> }
/** Optional civic service: the Mint's activity 0..1, when the civic layer publishes it. */
interface Civic { mintRate?: number; burnRate?: number; banked?: boolean }
/** Lights in the layout: the town's windows say where its roofs and quays are. */
interface LitLayout { lights?: Array<{ kind: string; position: Vec3 }> }

/**
 * The 'weather' service (src/harbour/weather), read structurally and every field optional: the sound
 * must never depend on it being there. DEWS level 0..4 (continuous), eased by the director.
 */
export interface WeatherLike {
  readonly state?: { readonly front?: FrontLike | null; readonly level?: number | null; readonly wind?: number; readonly rain?: number; readonly snow?: number; readonly wetness?: number };
  readonly band?: string | null;
  readonly precip?: { readonly rain?: number; readonly snow?: number };
  onLightning?(cb: (e: StrikeLike) => void): (() => void) | void;
}
/** The weather director's W01 front (sky lane): from/to DEWS levels and its sweep 0 (upwind horizon) … 1. */
export interface FrontLike { readonly from: number; readonly to: number; readonly progress: number }
export interface StrikeLike { distanceKm?: number; thunderDelaySec?: number; intensity?: number; azimuth?: number }
/** The 'season' service (calendar): weights in contract order spring, summer, autumn, winter. */
export interface SeasonLike { readonly weights?: readonly number[]; readonly snowCover?: number }
interface Motion { readonly reduced?: boolean }
interface Quality { readonly tier?: string }
/** The 'lighthouse' service: the sweep heading (layout convention: the beam points along (sin h, 0, cos h)). */
interface LighthouseLike { readonly lanternPosition?: Vec3Like; sweepAngle?(): number; readonly lit?: boolean; readonly period?: number }
interface Vec3Like { readonly x: number; readonly z: number }
/** The 'beam' service: a reach() getter (0..1, the PSI beam) when the beam layer publishes one. */
interface BeamLike { reach?(): number }
/** The 'model' service: the dead coins (Wreck Cove), read structurally. */
interface WreckModel { readonly readings?: { readonly wrecks?: ReadonlyArray<{ readonly deathDate?: string }> } }
/** The shared gust field (weather/gust.ts, service 'gust'): the field now at (x, z), 0..1 unscaled. */
interface GustLike { at?(x: number, z: number): number; readonly dirX?: number; readonly dirZ?: number }
/** The 'events' service (model/event-hub.ts): staged moments only, already budgeted by the scheduler. */
interface EventsLike { readonly current?: unknown; onMoment?(fn: (m: { event: { kind: string; coinId: string | null } }) => void): () => void }
/** The 'sim' service: its events (dockings) and the poses (positions, speeds, phases), read structurally. */
export interface SimLike {
  onEvent?(cb: (e: { id: string; kind: string; x: number; z: number }) => void): () => void;
  indexOf?(id: string): number;
  readonly pose?: { readonly count: number; readonly position: Float32Array; readonly heading: Float32Array; readonly speed: Float32Array; readonly phase: Uint8Array };
}
interface PsiReadings { readonly psi?: { readonly lit?: boolean; readonly reach?: number } }

const BAND_LEVEL: Record<string, number> = { CALM: 0, WATCH: 1, ALERT: 2, WARNING: 3, DANGER: 4 };
const clamp01 = (x: number) => (x > 0 ? (x < 1 ? x : 1) : 0);

/** Weather and season → the ambience's weather inputs. Absent services read as fair weather, no season colour. */
export function weatherInputs(w: WeatherLike | undefined, s: SeasonLike | undefined, fallbackWind: number, fallbackWet: number): Partial<AmbienceInputs> {
  const st = w?.state;
  const level = st?.level ?? (w?.band ? BAND_LEVEL[w.band.toUpperCase()] : undefined);
  const storm = level == null ? 0 : clamp01(level / 4);
  const wt = s?.weights;
  return {
    storm,
    // the director's gust amplitude grows with the band (0.04 + 0.11 · level): 0..1 here
    gust: level == null ? 0.2 : clamp01((0.04 + 0.11 * level) / 0.48),
    wind: clamp01(st?.wind ?? fallbackWind),
    rain: clamp01(w?.precip?.rain ?? st?.rain ?? 0),
    snow: clamp01(w?.precip?.snow ?? st?.snow ?? 0),
    wet: clamp01(st?.wetness ?? fallbackWet),
    spring: clamp01(wt?.[0] ?? 0), summer: clamp01(wt?.[1] ?? 0), autumn: clamp01(wt?.[2] ?? 0), winter: clamp01(wt?.[3] ?? 0),
    snowCover: clamp01(s?.snowCover ?? 0),
  };
}

/** Where the sound sources sit, gathered once per layout. */
interface Sources { coast: Vec2[]; berths: Vec2[]; reef: Vec2 | null; fire: Vec3 | null; mint: Vec3 | null; burn: Vec3 | null; ship: Vec3 | null; cove: Vec2 | null; town: Vec2[]; trees: Vec2[] }

function gatherSources(L: HarbourLayout & CivicLayout & LitLayout): Sources {
  const shoals = L.zones?.shoals?.polygon, wc = L.zones?.wreckCove?.polygon;
  const reef: Vec2 | null = shoals?.length
    ? [shoals.reduce((a, p) => a + p[0], 0) / shoals.length, shoals.reduce((a, p) => a + p[1], 0) / shoals.length]
    : null;
  const ph = L.pharos?.position ?? L.landmarks?.find((l) => l.id === "pharos")?.position;
  // the fire burns in the lantern near the top of the ~100 m tower
  const fire: Vec3 | null = ph ? [ph[0], ph[1] + (L.pharos ? 82 : 30), ph[2]] : null;
  const m = L.civic?.find((c) => c.kind === "mint")?.position ?? null;
  const y = L.civic?.find((c) => c.kind === "shipyard")?.position ?? null;
  const bu = L.civic?.find((c) => c.kind === "burn")?.position ?? null;
  return {
    coast: L.island?.coast ?? [],
    berths: (L.piers ?? []).flatMap((p) => p.berths.map((b) => [b.position[0], b.position[2]] as Vec2)),
    cove: wc?.length ? [wc.reduce((a, p) => a + p[0], 0) / wc.length, wc.reduce((a, p) => a + p[1], 0) / wc.length] : null,
    reef, fire, mint: m ? [m[0], m[1] + 12, m[2]] : null, ship: y ? [y[0], y[1] + 4, y[2]] : null, burn: bu ? [bu[0], bu[1] + 8, bu[2]] : null,
    town: (L.lights ?? []).filter((l) => l.kind === "window").map((l) => [l.position[0], l.position[2]] as Vec2),
    // the cove hamlets sit among the island's groves
    trees: (L.landmarks ?? []).filter((l) => l.id.startsWith("hamlet")).map((l) => [l.position[0], l.position[2]] as Vec2),
  };
}

/** Distance from (px, pz) to the segment ab; the closest point is left in `hit`. */
const hit: Vec2 = [0, 0];
function segDist(px: number, pz: number, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l)) : 0;
  hit[0] = a[0] + t * dx; hit[1] = a[1] + t * dz;
  return Math.hypot(px - hit[0], pz - hit[1]);
}

/** Even-odd point in polygon. */
function inside(px: number, pz: number, poly: Vec2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > pz) !== (b[1] > pz) && px < ((b[0] - a[0]) * (pz - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** Nearest of `pts` to (x, z): its distance, the point left in `hit`. */
function nearest(x: number, z: number, pts: Vec2[]): number {
  let d = Infinity;
  for (const p of pts) {
    const e = Math.hypot(p[0] - x, p[1] - z);
    if (e < d) { d = e; hit[0] = p[0]; hit[1] = p[1]; }
  }
  return d;
}

/** The Burn's activity for the furnace's voice: 0 when the civic layer is absent, banked or stale. */
export function burnRateOf(c: { burnRate?: number; banked?: boolean } | undefined): number {
  if (!c || c.banked || !Number.isFinite(c.burnRate)) return 0;
  return clamp01(c.burnRate ?? 0);
}

/**
 * The beam's passing: the peak gain (before the master) of the soft low breath when the sweep crosses the
 * camera. Follows the beam's reach (PSI, the beam's own signal: no new mapping, no pitch), fuller at night,
 * nothing when the lamp is unlit, and muted as stale fog shows (stale data owns the voice: the foghorn).
 * Never above 0.045 (≈ −30 dBFS after the master).
 */
export function beamBreathPeak(reach: number, lit: boolean, night: number, fog: number): number {
  if (!lit || !Number.isFinite(reach)) return 0;
  const c = (x: number) => Math.max(0, Math.min(1, x));
  return 0.045 * (0.35 + 0.65 * c(reach)) * (0.45 + 0.55 * c(night)) * (1 - c(fog * 2.5));
}

const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/**
 * The sweep crossed the camera's bearing between two readings: the signed angle beam − bearing changed sign
 * while small (a jump through ±π is the far side, not a crossing).
 */
export function beamCrossed(prev: number, now: number): boolean {
  return Math.abs(prev) < 1 && Math.abs(now) < 1 && (prev < 0) !== (now < 0);
}

/** How far behind a look along (fx, fz) the offset (dx, dz) lies: 0 ahead or beside … →1 straight behind (soft near the listener). */
export function behindOf(dx: number, dz: number, fx: number, fz: number): number {
  return Math.max(0, Math.min(1, -(dx * fx + dz * fz) / (Math.hypot(dx, dz) + 40)));
}

/** Where in a rising front's sweep its far thunder rolls: two, while it is still out over the upwind sea. */
export const FRONT_ROLLS = [0.07, 0.21] as const;

/**
 * Thunder ahead of a storm front: how many far rolls are due by now (0..2), or -1 when there are none to come
 * — no front, an easing (clearing) front, a jump under FRONT_MIN, a front that brings no lightning (below
 * Warning: the same `strikesPerMin` the sky's lightning uses), or one already overhead (the local storm then
 * speaks for itself). The director never sends a front on the first reading or under reduced motion.
 */
export function frontThunderDue(f: FrontLike | null | undefined): number {
  if (!f || !(f.to - f.from >= FRONT_MIN) || !(targetsForLevel(f.to).strikesPerMin > 0) || !(f.progress < FRONT_HERE[0])) return -1;
  return FRONT_ROLLS.filter((p) => f.progress >= p).length;
}

/** The titans' conch: at most one per this many seconds, whatever the dockings. */
export const CONCH_GAP_SEC = 180;

/** The staged-moment kinds the harbour answers by ear (depeg and recovery deliberately none: never alarming). */
export type MomentCue = "launch-bell" | "cove-bell" | null;
export function momentCue(kind: string): MomentCue {
  return kind === "launch" ? "launch-bell" : kind === "death" ? "cove-bell" : null;
}

/**
 * A titan home at her berth (sim docking of one of the four TITANS): the conch sounds unless one sounded in
 * the last CONCH_GAP_SEC, or a staged moment holds the stage (the scheduler's moment is never talked over).
 */
export function conchDue(id: string, nowSec: number, lastSec: number, staging: boolean): boolean {
  return !!TITANS[id] && !staging && !(nowSec - lastSec < CONCH_GAP_SEC);
}

/** The visitor's attention from the seconds since their last input: 1 for 3 min, then down to 0 over 60 s. */
export function attentionFor(idleSec: number): number {
  return idleSec < 180 ? 1 : Math.max(0, 1 - (idleSec - 180) / 60);
}

export class Feeder {
  private src: Sources | null = null;
  private srcFor: unknown = null;
  private unsubStrike: (() => void) | null = null;
  /** the beam's heading minus the camera's bearing from the tower, last reading; and the last breath's time */
  private beamDelta = Number.NaN;
  private beamAt = 0;
  /** the anniversary bell rings at most once per visit; it waits until the sound has played a while */
  private rang = false;
  private readonly startedAt = performance.now();
  /** the rising front being heard, and how many of its far rolls have sounded */
  private front: FrontLike | null = null;
  private frontRolled = 0;
  /** the camera's right on the ground, kept for placing thunder */
  private readonly right: Vec2 = [1, 0];
  /** the listener (on the camera ray) and the last inputs, for placing the event cues between readings */
  private readonly ear: Vec3 = [0, 0, 0];
  private last: Partial<AmbienceInputs> = {};
  private unsubMoment: (() => void) | null = null;
  private unsubSim: (() => void) | null = null;
  private conchAt = -Infinity;

  constructor(private readonly ctx: EngineContext, private readonly amb: Ambience) {}

  /**
   * World → sound: zoom, wind (DEWS), stale fog, night, and where the sources lie. The listener sits on the
   * camera ray, 45% of the way out from the target: nearness falls with the square of the distance to it,
   * and a source's pan is its bearing across the screen.
   */
  feed(idleSec: number): Partial<AmbienceInputs> {
    const { ctx, amb } = this;
    const L = ctx.services.get("layout") as (HarbourLayout & CivicLayout) | undefined;
    const lo = L?.camera.minDistance ?? 90, hi = L?.camera.maxDistance ?? 1150;
    const zoom = Math.max(0, Math.min(1, (ctx.rig.distance - lo) / (hi - lo)));
    const fog = (ctx.services.get("readings") as Readings | undefined)?.fog ?? 0;
    const wind = (ctx.services.get("life") as Life | undefined)?.wind ?? 0.35;
    const weather = ctx.services.get("weather") as WeatherLike | undefined;
    const wetU = (ctx.uniforms as unknown as { uWetness?: { value: number } }).uWetness?.value ?? 0;
    const inputs: Partial<AmbienceInputs> = {
      zoom: Math.sqrt(zoom), fog, night: ctx.uniforms.uNight.value, hour: ctx.timeOfDay.hour, clock: ctx.timeOfDay.clockHour,
      ...weatherInputs(weather, ctx.services.get("season") as SeasonLike | undefined, wind, wetU),
      reduced: !!(ctx.services.get("motion") as Motion | undefined)?.reduced,
      lean: (ctx.services.get("quality") as Quality | undefined)?.tier === "low",
      attention: attentionFor(idleSec),
    };
    // thunder answers the weather's lightning (subscribed once the service is there)
    if (!this.unsubStrike && weather?.onLightning) this.unsubStrike = weather.onLightning((e) => this.strike(e)) ?? (() => undefined);
    if (L) {
      if (this.srcFor !== L) { this.src = gatherSources(L); this.srcFor = L; }
      const S = this.src!;
      const t = ctx.rig.target, cam = ctx.rig.camera.position, e = ctx.rig.camera.matrixWorld.elements;
      const lx = t.x + (cam.x - t.x) * 0.45, ly = t.y + (cam.y - t.y) * 0.45, lz = t.z + (cam.z - t.z) * 0.45;
      const rl = Math.hypot(e[0], e[2]) || 1, rx = e[0] / rl, rz = e[2] / rl;   // the camera's right, on the ground
      this.right[0] = rx; this.right[1] = rz;
      this.ear[0] = lx; this.ear[1] = ly; this.ear[2] = lz;
      const near = (dg: number, h: number, ref: number) => Math.min(1, (ref * ref) / (dg * dg + h * h + 1));
      const pan = (x: number, z: number) => { const dx = x - lx, dz = z - lz; return Math.max(-1, Math.min(1, (dx * rx + dz * rz) / (Math.hypot(dx, dz) + 40))); };
      // the camera looks down its -z: its forward on the ground; how far behind the listener's look a source lies
      const fl = Math.hypot(e[8], e[10]) || 1, fx = -e[8] / fl, fz = -e[10] / fl;
      const back = (x: number, z: number) => behindOf(x - lx, z - lz, fx, fz);
      let dc = Infinity, cx = lx, cz = lz;
      for (let i = 0, n = S.coast.length; i < n; i++) {
        const d = segDist(lx, lz, S.coast[i], S.coast[(i + 1) % n]);
        if (d < dc) { dc = d; cx = hit[0]; cz = hit[1]; }
      }
      let db = Infinity;
      for (const b of S.berths) db = Math.min(db, Math.hypot(b[0] - lx, b[1] - lz));
      inputs.shore = S.coast.length ? near(dc, ly, 150) : 0.4;
      inputs.shorePan = pan(cx, cz); inputs.shoreBack = back(cx, cz);
      inputs.harbour = S.berths.length ? near(db, ly, 120) : 0.3;
      if (S.reef) { inputs.reef = near(Math.hypot(S.reef[0] - lx, S.reef[1] - lz), ly, 160); inputs.reefPan = pan(S.reef[0], S.reef[1]); inputs.reefBack = back(S.reef[0], S.reef[1]); }
      if (S.fire) { inputs.fire = near(Math.hypot(S.fire[0] - lx, S.fire[2] - lz), ly - S.fire[1], 70); inputs.firePan = pan(S.fire[0], S.fire[2]); }
      if (S.mint) {
        inputs.mint = near(Math.hypot(S.mint[0] - lx, S.mint[2] - lz), ly - S.mint[1], 80);
        inputs.mintPan = pan(S.mint[0], S.mint[2]); inputs.mintBack = back(S.mint[0], S.mint[2]);
        inputs.mintRate = (ctx.services.get("civic") as Civic | undefined)?.mintRate ?? 0.5;
      } else inputs.mint = 0;
      // the Burn's furnace answers the Mint: its roar follows the burn activity, and it is silent (embers drawn
      // apart) whenever the mint-burn reading is stale or missing: never a faked fire
      if (S.burn) {
        const civic = ctx.services.get("civic") as Civic | undefined;
        inputs.burn = near(Math.hypot(S.burn[0] - lx, S.burn[2] - lz), ly - S.burn[1], 70);
        inputs.burnPan = pan(S.burn[0], S.burn[2]); inputs.burnBack = back(S.burn[0], S.burn[2]);
        inputs.burnRate = burnRateOf(civic);
      } else inputs.burn = 0;
      // the wind's gusts are the shared cat's-paws (the ones that heel the fleet), felt where the listener is
      const g = ctx.services.get("gust") as GustLike | undefined;
      const paw = g?.at?.(lx, lz);
      inputs.paw = paw != null && Number.isFinite(paw) ? Math.max(0, Math.min(1, paw)) : -1;
      if (S.cove) { inputs.cove = near(Math.hypot(S.cove[0] - lx, S.cove[1] - lz), ly, 120); inputs.covePan = pan(S.cove[0], S.cove[1]); }
      this.knell(amb, inputs);
      if (S.ship) {
        inputs.ship = near(Math.hypot(S.ship[0] - lx, S.ship[2] - lz), ly - S.ship[1], 80);
        inputs.shipPan = pan(S.ship[0], S.ship[2]); inputs.shipBack = back(S.ship[0], S.ship[2]);
      } else inputs.ship = 0;
      if (S.town.length) { inputs.town = near(nearest(lx, lz, S.town), ly, 120); inputs.townPan = pan(hit[0], hit[1]); inputs.townBack = back(hit[0], hit[1]); }
      const onLand = S.coast.length > 2 && inside(lx, lz, S.coast);
      inputs.land = onLand ? near(0, ly, 170) : 0.4 * (inputs.shore ?? 0);
      inputs.trees = Math.max(S.trees.length ? near(nearest(lx, lz, S.trees), ly, 140) : 0, 0.6 * inputs.land);
      if (S.trees.length) inputs.treesPan = pan(hit[0], hit[1]);
    }
    amb.set(inputs);
    this.last = inputs;
    this.listen();
    this.beam(amb, inputs);
    this.frontThunder(amb, weather?.state?.front);
    return inputs;
  }

  /** Pan and nearness (0..1, `ref` m) of a world point for the listener. */
  private place(x: number, z: number, ref: number): { pan: number; near: number } {
    const [lx, ly, lz] = this.ear, dx = x - lx, dz = z - lz;
    return {
      pan: Math.max(-1, Math.min(1, (dx * this.right[0] + dz * this.right[1]) / (Math.hypot(dx, dz) + 40))),
      near: Math.min(1, (ref * ref) / (dx * dx + dz * dz + ly * ly + 1)),
    };
  }

  /** Subscribe (once each service is there) to the staged moments and to the sim's dockings. */
  private listen(): void {
    const { ctx } = this;
    const ev = ctx.services.get("events") as EventsLike | undefined;
    const sim = ctx.services.get("sim") as SimLike | undefined;
    if (!this.unsubMoment && ev?.onMoment) this.unsubMoment = ev.onMoment((m) => this.moment(m.event.kind, m.event.coinId));
    if (!this.unsubSim && sim?.onEvent) {
      this.unsubSim = sim.onEvent((e) => {
        if (e.kind !== "docking") return;
        const t = performance.now() / 1000;
        if (!conchDue(e.id, t, this.conchAt, !!(ctx.services.get("events") as EventsLike | undefined)?.current)) return;
        this.conchAt = t;
        const p = this.place(e.x, e.z, 160);
        this.amb.conch(0.45 + 0.4 * p.near, p.pan * 0.7);
      });
    }
  }

  /** A staged moment (the scheduler's: rare, budgeted, nothing under reduced motion): its sound, if any. */
  private moment(kind: string, coinId: string | null): void {
    const cue = momentCue(kind), I = this.last;
    if (cue === "cove-bell") this.amb.coveBell(0.45 + 0.4 * (I.cove ?? 0), (I.covePan ?? 0) * 0.6);
    else if (cue === "launch-bell") {
      const sim = this.ctx.services.get("sim") as SimLike | undefined;
      const i = coinId && sim?.indexOf ? sim.indexOf(coinId) : -1, pos = sim?.pose?.position;
      this.amb.launchBell(i >= 0 && pos ? this.place(pos[i * 3], pos[i * 3 + 2], 160).pan * 0.6 : (I.shipPan ?? 0) * 0.6);
    }
  }

  /** A storm front rising over the upwind horizon: two far, low rolls from that side before its rain arrives. */
  private frontThunder(amb: Ambience, f: FrontLike | null | undefined): void {
    const due = frontThunderDue(f);
    if (due < 0 || !f) { this.front = null; return; }
    // a new front (the director's object): heard from now on, at most one roll at once if it is already under way
    if (f !== this.front) { this.front = f; this.frontRolled = Math.max(0, due - 1); amb.prepare("rumble"); }
    if (due <= this.frontRolled) return;
    this.frontRolled = due;
    // from upwind: against the gust field's downwind direction, across the camera's right
    const g = this.ctx.services.get("gust") as GustLike | undefined;
    const ux = -(g?.dirX ?? 0), uz = -(g?.dirZ ?? 0);
    const pan = Math.max(-1, Math.min(1, ux * this.right[0] + uz * this.right[1]));
    amb.thunder(20 + 8 * due, 0.3, pan * 0.8, 0.4);
  }

  /** A dead coin's anniversary today (the panel's "anniversary today"): the cove's bell, once per visit. */
  private knell(amb: Ambience, inputs: Partial<AmbienceInputs>): void {
    if (this.rang || performance.now() - this.startedAt < 12_000) return;
    const wrecks = (this.ctx.services.get("model") as WreckModel | undefined)?.readings?.wrecks;
    if (!wrecks?.length) return;
    this.rang = true;
    const today = worldToday();
    if (!wrecks.some((w) => anniversaryToday(w.deathDate, today))) return;
    amb.anniversary(0.55 + 0.45 * (inputs.cove ?? 0), (inputs.covePan ?? 0) * 0.6);
  }

  /** The beam's passing: one breath each time the sweep crosses the camera (never when held: reduced motion). */
  private beam(amb: Ambience, inputs: Partial<AmbienceInputs>): void {
    const { ctx } = this;
    const lh = ctx.services.get("lighthouse") as LighthouseLike | undefined;
    const lp = lh?.lanternPosition;
    if (!lh?.sweepAngle || !lp) { this.beamDelta = Number.NaN; return; }
    const cam = ctx.rig.camera.position;
    const d = wrapPi(lh.sweepAngle() - Math.atan2(cam.x - lp.x, cam.z - lp.z));
    const prev = this.beamDelta;
    this.beamDelta = d;
    if (!beamCrossed(prev, d)) return;
    const t = performance.now();
    if (t - this.beamAt < 1500) return;
    this.beamAt = t;
    const psi = (ctx.services.get("readings") as PsiReadings | undefined)?.psi;
    const reach = (ctx.services.get("beam") as BeamLike | undefined)?.reach?.() ?? psi?.reach ?? 0;
    const lit = (lh.lit ?? true) && (psi?.lit ?? true);
    amb.beamPass(beamBreathPeak(reach, lit, inputs.night ?? 0, inputs.fog ?? 0), (inputs.firePan ?? 0) * 0.5);
  }

  /** A lightning strike: its thunder, delayed by its distance, from where it struck (azimuth 0 = -z, +π/2 = +x). */
  private strike(e: StrikeLike): void {
    const { amb } = this;
    const az = e.azimuth ?? 0, dx = Math.sin(az), dz = -Math.cos(az);
    const pan = Math.max(-1, Math.min(1, dx * this.right[0] + dz * this.right[1]));
    const km = e.distanceKm ?? 10;
    amb.thunder(km, e.intensity ?? 0.6, pan * 0.8, e.thunderDelaySec ?? (km * 1000) / 343);
  }

  dispose(): void {
    this.unsubStrike?.(); this.unsubStrike = null;
    this.unsubMoment?.(); this.unsubMoment = null;
    this.unsubSim?.(); this.unsubSim = null;
  }
}
