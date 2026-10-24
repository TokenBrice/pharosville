import type { EngineContext } from "../engine/types";
import type { HarbourLayout, Vec2, Vec3 } from "../layout/types";
import type { Ambience, AmbienceInputs } from "./ambience";

/**
 * The opt-in sound switch (D13). Off by default; the visitor's choice is remembered per browser.
 *
 * Autoplay: the page's Permissions-Policy denies autoplay, so the AudioContext is only ever created inside a
 * user gesture: the toggle's own click, or — when the visitor left sound on last time — their first
 * click / key press on this visit. The synth itself (ambience.ts) is loaded lazily on that first start.
 */

const KEY = "harbour.sound";

export interface SoundController {
  /** the visitor's choice */
  readonly on: boolean;
  /** audio is actually running (on, and started by a gesture) */
  readonly playing: boolean;
  /** Call from a click handler. */
  toggle(): void;
  subscribe(fn: () => void): () => void;
  /** Stop and release the audio (the choice stays). */
  stop(): void;
}

interface Readings { fog?: number }
interface Life { wind?: number }
/** P6 layout additions read here, all optional (older layouts simply have no Mint / no pharos block). */
interface CivicLayout { pharos?: { position: Vec3 }; civic?: Array<{ kind: string; position: Vec3 }> }
/** Optional civic service: the Mint's activity 0..1, when the civic layer publishes it. */
interface Civic { mintRate?: number }
/** Lights in the layout: the town's windows say where its roofs and quays are. */
interface LitLayout { lights?: Array<{ kind: string; position: Vec3 }> }

/**
 * The 'weather' service (src/harbour/weather), read structurally and every field optional: the sound
 * must never depend on it being there. DEWS level 0..4 (continuous), eased by the director.
 */
export interface WeatherLike {
  readonly state?: { readonly level?: number | null; readonly wind?: number; readonly rain?: number; readonly snow?: number; readonly wetness?: number };
  readonly band?: string | null;
  readonly precip?: { readonly rain?: number; readonly snow?: number };
  onLightning?(cb: (e: StrikeLike) => void): (() => void) | void;
}
export interface StrikeLike { distanceKm?: number; thunderDelaySec?: number; intensity?: number; azimuth?: number }
/** The 'season' service (calendar): weights in contract order spring, summer, autumn, winter. */
export interface SeasonLike { readonly weights?: readonly number[]; readonly snowCover?: number }
interface Motion { readonly reduced?: boolean }
interface Quality { readonly tier?: string }

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
interface Sources { coast: Vec2[]; berths: Vec2[]; reef: Vec2 | null; fire: Vec3 | null; mint: Vec3 | null; ship: Vec3 | null; town: Vec2[]; trees: Vec2[] }

function gatherSources(L: HarbourLayout & CivicLayout & LitLayout): Sources {
  const shoals = L.zones?.shoals?.polygon;
  const reef: Vec2 | null = shoals?.length
    ? [shoals.reduce((a, p) => a + p[0], 0) / shoals.length, shoals.reduce((a, p) => a + p[1], 0) / shoals.length]
    : null;
  const ph = L.pharos?.position ?? L.landmarks?.find((l) => l.id === "pharos")?.position;
  // the fire burns in the lantern near the top of the ~100 m tower
  const fire: Vec3 | null = ph ? [ph[0], ph[1] + (L.pharos ? 82 : 30), ph[2]] : null;
  const m = L.civic?.find((c) => c.kind === "mint")?.position ?? null;
  const y = L.civic?.find((c) => c.kind === "shipyard")?.position ?? null;
  return {
    coast: L.island?.coast ?? [],
    berths: (L.piers ?? []).flatMap((p) => p.berths.map((b) => [b.position[0], b.position[2]] as Vec2)),
    reef, fire, mint: m ? [m[0], m[1] + 12, m[2]] : null, ship: y ? [y[0], y[1] + 4, y[2]] : null,
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

/** How far behind a look along (fx, fz) the offset (dx, dz) lies: 0 ahead or beside … →1 straight behind (soft near the listener). */
export function behindOf(dx: number, dz: number, fx: number, fz: number): number {
  return Math.max(0, Math.min(1, -(dx * fx + dz * fz) / (Math.hypot(dx, dz) + 40)));
}

/** The visitor's attention from the seconds since their last input: 1 for 3 min, then down to 0 over 60 s. */
export function attentionFor(idleSec: number): number {
  return idleSec < 180 ? 1 : Math.max(0, 1 - (idleSec - 180) / 60);
}

/** Inputs that count as watching (pointer moves included: a hand on the mouse is attention). */
const ATTENTION_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel"] as const;

function readChoice(): boolean {
  try { return localStorage.getItem(KEY) === "on"; } catch { return false; }
}
function writeChoice(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private window: not remembered */ }
}

class Controller implements SoundController {
  on = readChoice();
  private amb: Ambience | null = null;
  private ac: AudioContext | null = null;
  private poll = 0;
  private starting = false;
  private src: Sources | null = null;
  private srcFor: unknown = null;
  private unsubStrike: (() => void) | null = null;
  /** the camera's right on the ground, kept for placing thunder */
  private readonly right: Vec2 = [1, 0];
  private readonly listeners = new Set<() => void>();
  private lastInput = 0;
  private readonly onInput = () => { this.lastInput = performance.now(); };
  private readonly onGesture = () => { this.disarm(); if (this.on) this.start(); };
  private readonly onVisibility = () => {
    if (!this.ac) return;
    if (document.hidden) void this.ac.suspend(); else if (this.on) void this.ac.resume();
  };

  constructor(private readonly ctx: EngineContext) {
    if (this.on) this.arm();
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  get playing(): boolean { return !!this.amb; }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private emit(): void { for (const fn of this.listeners) fn(); }

  toggle(): void {
    this.on = !this.on;
    writeChoice(this.on);
    if (this.on) { this.disarm(); this.start(); } else this.stop();
    this.emit();
  }

  /** Remembered "on": wait for the first gesture of this visit. */
  private arm(): void {
    addEventListener("pointerdown", this.onGesture, { capture: true });
    addEventListener("keydown", this.onGesture, { capture: true });
  }
  private disarm(): void {
    removeEventListener("pointerdown", this.onGesture, { capture: true });
    removeEventListener("keydown", this.onGesture, { capture: true });
  }

  /** Must run inside a user gesture: the context is created and resumed synchronously here. */
  private start(): void {
    if (this.amb || this.starting) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ac = new Ctor({ latencyHint: "playback" });
    void ac.resume();
    this.ac = ac;
    this.starting = true;
    void import("./ambience").then(({ Ambience }) => {
      this.starting = false;
      if (!this.on || this.ac !== ac) { void ac.close(); return; }
      this.amb = new Ambience(ac);
      this.lastInput = performance.now();
      for (const t of ATTENTION_EVENTS) addEventListener(t, this.onInput, { capture: true, passive: true });
      this.feed();
      this.poll = window.setInterval(() => this.feed(), 250);
      this.emit();
    }).catch(() => { this.starting = false; });
  }

  /**
   * World → sound: zoom, wind (DEWS), stale fog, night, and where the sources lie. The listener sits on the
   * camera ray, 45% of the way out from the target: nearness falls with the square of the distance to it,
   * and a source's pan is its bearing across the screen.
   */
  private feed(): void {
    const amb = this.amb;
    if (!amb) return;
    const { ctx } = this;
    const L = ctx.services.get("layout") as (HarbourLayout & CivicLayout) | undefined;
    const lo = L?.camera.minDistance ?? 90, hi = L?.camera.maxDistance ?? 1150;
    const zoom = Math.max(0, Math.min(1, (ctx.rig.distance - lo) / (hi - lo)));
    const fog = (ctx.services.get("readings") as Readings | undefined)?.fog ?? 0;
    const wind = (ctx.services.get("life") as Life | undefined)?.wind ?? 0.35;
    const weather = ctx.services.get("weather") as WeatherLike | undefined;
    const wetU = (ctx.uniforms as unknown as { uWetness?: { value: number } }).uWetness?.value ?? 0;
    const inputs: Partial<AmbienceInputs> = {
      zoom: Math.sqrt(zoom), fog, night: ctx.uniforms.uNight.value, hour: ctx.timeOfDay.hour,
      ...weatherInputs(weather, ctx.services.get("season") as SeasonLike | undefined, wind, wetU),
      reduced: !!(ctx.services.get("motion") as Motion | undefined)?.reduced,
      lean: (ctx.services.get("quality") as Quality | undefined)?.tier === "low",
      attention: attentionFor((performance.now() - this.lastInput) / 1000),
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
  }

  /** A lightning strike: its thunder, delayed by its distance, from where it struck (azimuth 0 = -z, +π/2 = +x). */
  private strike(e: StrikeLike): void {
    const amb = this.amb;
    if (!amb) return;
    const az = e.azimuth ?? 0, dx = Math.sin(az), dz = -Math.cos(az);
    const pan = Math.max(-1, Math.min(1, dx * this.right[0] + dz * this.right[1]));
    const km = e.distanceKm ?? 10;
    amb.thunder(km, e.intensity ?? 0.6, pan * 0.8, e.thunderDelaySec ?? (km * 1000) / 343);
  }

  stop(): void {
    clearInterval(this.poll);
    for (const t of ATTENTION_EVENTS) removeEventListener(t, this.onInput, { capture: true });
    this.unsubStrike?.(); this.unsubStrike = null;
    const amb = this.amb, ac = this.ac;
    this.amb = null; this.ac = null;
    if (amb) void amb.dispose(); else if (ac) void ac.close().catch(() => undefined);
    this.emit();
  }
}

/** One controller per engine (kept in ctx.services as 'sound'). */
export function getSoundController(ctx: EngineContext): SoundController {
  let c = ctx.services.get("sound") as SoundController | undefined;
  if (!c) { c = new Controller(ctx); ctx.services.set("sound", c); }
  return c;
}
