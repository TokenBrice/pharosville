import * as THREE from "three";
import { getBeamUniforms } from "../beam/uniforms";
import type { QualityService } from "../engine/quality";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import type { OceanService } from "../ocean/ocean-system";
import { acquireFxTextures, type FxTextures } from "../ocean/textures";
import type { ReadingsService } from "../readings/readings-system";
import type { SkyService } from "../sky/sky-system";
import { ensureMotionService, MotionClock } from "../ui/services";
import { getHarbourMaterials } from "../world/materials";
import {
  seasonForMonth, snowShare, weightsForSeason, WeatherDirector, type Season, type SeasonWeights, type WeatherBand, type WeatherState,
} from "./director";
import { Lightning, type StrikeEvent } from "./lightning";
import { MAX_SPRAY, PRECIP_BUDGET, Precipitation } from "./precip";
import { Rainbow } from "./rainbow";

/**
 * WEATHER: the director that turns the supply-weighted DEWS band (readings) and the calendar season
 * ('season' service; the visitor's local date otherwise) into the harbour's weather, eased over 20–60 s:
 * the sky's cloud deck and wind, the overcast and Danger's darkened light, rain or snow (type = season,
 * intensity = DEWS), rain rings on the sea, storm spray off the surf, lightning with thunder events, and
 * the recovery rainbow. No random weather: a storm always means data.
 *
 * Writes the shared uniforms uWetness, uPrecip (rain, snow), uLightning, uWindVec (wind on xz, with gusts).
 * Service 'weather' (WeatherService). Registered right after 'readings' and before 'sky', so the sky, the
 * sea and the island read this frame's weather.
 *
 * Dev: ?dews= / ?weather=CALM|WATCH|ALERT|WARNING|DANGER (readings) apply at once; ?rainbow=1 hangs the
 * bow; ?strike=1 forces frequent lightning (any band); ?season= / ?month= when no season system runs.
 */
export interface WeatherService {
  readonly state: Readonly<WeatherState>;
  readonly band: WeatherBand | null;
  /** rain, snow intensity 0..1 */
  readonly precip: { readonly rain: number; readonly snow: number };
  /** current lightning flash 0..1 */
  readonly lightning: number;
  /** Rainbow strength 0..1. */
  readonly rainbow: number;
  /** Darkened light at Danger, 0..1 (the sky applies it). */
  readonly gloom: number;
  /** Where the last strike lit the deck (world azimuth rad, elevation deg above the pretend horizon). */
  readonly flash: { readonly azimuth: number; readonly elevation: number };
  /** Wind on the ground plane (x, z) incl. gusts — same as uWindVec. */
  readonly wind: THREE.Vector2;
  /** A lightning strike (for thunder: play it `thunderDelaySec` later). Returns an unsubscribe. */
  onLightning(cb: (e: StrikeEvent) => void): () => void;
}

interface SeasonLike { readonly weights?: SeasonWeights; readonly snowShare?: number }
interface SimLike { readonly wind?: { fromRad: number } }

function calendarSeason(q: URLSearchParams): Season {
  const s = q.get("season");
  if (s === "spring" || s === "summer" || s === "autumn" || s === "winter") return s;
  const m = Number(q.get("month"));
  const now = new Date();
  const y = now.getFullYear();
  // a timezone whose DST runs in January is southern (the old index.html rule)
  const southern = new Date(y, 0, 1).getTimezoneOffset() < new Date(y, 6, 1).getTimezoneOffset();
  return seasonForMonth(m >= 1 && m <= 12 ? m : now.getMonth() + 1, southern);
}

export class WeatherSystem implements WorldSystem {
  readonly name = "weather";
  private readonly director = new WeatherDirector();
  private readonly q = new URLSearchParams(location.search);
  private precip!: Precipitation;
  private lightning!: Lightning;
  private rainbow!: Rainbow;
  private fx!: FxTextures;
  private clock: MotionClock | null = null;
  private fallbackWeights: SeasonWeights = [0, 1, 0, 0];
  private snapped = false;
  private anchorsBuilt = false;
  private elapsed = 0;
  private readonly windVec = new THREE.Vector2(0.84, -0.54);
  private readonly windTo = new THREE.Vector2(0.84, -0.54);
  private readonly amb = new THREE.Color();
  private readonly tmpC = new THREE.Color();
  private readonly target = new THREE.Vector3();
  private readonly viewport = new THREE.Vector2();
  private readonly flash = { azimuth: 0, elevation: 2 };

  init(ctx: EngineContext): void {
    this.fx = acquireFxTextures(ctx);
    const mats = getHarbourMaterials(ctx);
    this.precip = new Precipitation({
      uAOTex: mats.ao.uAOTex, uAOBounds: mats.ao.uAOBounds, uPoolTex: mats.pool.uPoolTex, uPoolBounds: mats.pool.uPoolBounds,
      uWindowGlow: ctx.uniforms.uWindowGlow, beam: getBeamUniforms(ctx), noise: this.fx.noise,
    });
    this.lightning = new Lightning();
    this.lightning.forced = import.meta.env.DEV && this.q.get("strike") === "1";
    this.rainbow = new Rainbow();
    ctx.scene.add(this.precip.fall, this.precip.ground, this.lightning.mesh, this.rainbow.mesh);
    this.fallbackWeights = weightsForSeason(calendarSeason(this.q));

    // eslint-disable-next-line @typescript-eslint/no-this-alias -- getters below read live system state
    const sys = this;
    const svc: WeatherService = {
      get state() { return sys.director.state; },
      get band() { return sys.director.state.band; },
      get precip() { return { rain: sys.director.state.rain, snow: sys.director.state.snow }; },
      get lightning() { return sys.lightning.flash; },
      get rainbow() { return sys.director.state.rainbow; },
      get gloom() { return sys.director.state.gloom; },
      get flash() { return sys.flash; },
      get wind() { return sys.windVec; },
      onLightning: (cb) => this.lightning.onStrike(cb),
    };
    ctx.services.set("weather", svc);
  }

  /** Spray anchors along the surf: the outer coast, the breakwater and mole, the islets, the Shoals reef. */
  private buildAnchors(ctx: EngineContext): void {
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    const ocean = ctx.services.get("ocean") as OceanService | undefined;
    if (!layout || !ocean) return;
    this.anchorsBuilt = true;
    const lines: Array<Array<[number, number]>> = [];
    const isl = layout.island;
    if (isl?.coast) lines.push(isl.coast as Array<[number, number]>);
    for (const l of [isl?.breakwater, isl?.mole]) if (l?.length) lines.push(l as Array<[number, number]>);
    for (const p of isl?.islets ?? []) lines.push(p as Array<[number, number]>);
    const shoals = layout.zones?.shoals?.polygon as Array<[number, number]> | undefined;
    if (shoals?.length) lines.push(shoals);
    // the sheltered bay (the harbours' water) gets no surf
    const bay = (isl?.bay ?? []) as Array<[number, number]>;
    const inBay = (x: number, z: number) => {
      let inside = false;
      for (let i = 0, j = bay.length - 1; i < bay.length; j = i++) {
        const [xi, zi] = bay[i], [xj, zj] = bay[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    };
    const out: Array<[number, number, number, number]> = [];
    const STEP = 9;
    for (const line of lines) {
      for (let i = 1; i < line.length; i++) {
        const [ax, az] = line[i - 1], [bx, bz] = line[i];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-3) continue;
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        for (let s = 0; s < len; s += STEP) {
          const x = ax + (bx - ax) * (s / len), z = az + (bz - az) * (s / len);
          // face the open water: the side whose coast distance is larger (and actually sea)
          const cp = ocean.coastAt(x + nx * 6, z + nz * 6), cm = ocean.coastAt(x - nx * 6, z - nz * 6);
          const sgn = cp >= cm ? 1 : -1;
          if (Math.max(cp, cm) < 2) continue;
          // only exposed surf: open water within reach outward (not the sheltered bay)
          const ox = x + nx * sgn * 30, oz = z + nz * sgn * 30;
          if (ocean.coastAt(ox, oz) < 12 || inBay(ox, oz) || inBay(x + nx * sgn * 8, z + nz * sgn * 8)) continue;
          out.push([x + nx * sgn * 2, z + nz * sgn * 2, nx * sgn, nz * sgn]);
        }
      }
    }
    // evenly thinned to the budget, deterministic
    const keep: Array<[number, number, number, number]> = [];
    const stride = Math.max(1, out.length / MAX_SPRAY);
    for (let i = 0; i < out.length && keep.length < MAX_SPRAY; i += stride) keep.push(out[Math.floor(i)]);
    this.precip.setSprayAnchors(keep);
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const dt = frame.delta;
    this.elapsed += dt;
    const U = ctx.uniforms;
    const readings = ctx.services.get("readings") as ReadingsService | undefined;
    const w = readings?.weather ?? null;
    const season = ctx.services.get("season") as SeasonLike | undefined;
    const share = season?.snowShare ?? snowShare(season?.weights ?? this.fallbackWeights);
    const sunUp = THREE.MathUtils.smoothstep(U.uSunDir.value.y, 0.03, 0.25) * (1 - U.uNight.value);
    const input = {
      level: w ? w.level : null, band: w?.band ?? null, snowShare: share, sunUp, time: this.elapsed,
      forceRainbow: this.q.get("rainbow") === "1",
    };
    // dev overrides (and the first reading) take effect at once, not over a minute
    const overridden = !!readings?.overridden && w != null;
    let snapNow = overridden;
    if (w && !this.snapped) { this.director.snap(input); this.snapped = true; snapNow = true; }
    const s = this.director.step(dt, input);

    // ---- wind: the prevailing direction (the hulls lie to it) × DEWS strength incl. gusts
    const sim = ctx.services.get("sim") as SimLike | undefined;
    if (sim?.wind) { const to = sim.wind.fromRad + Math.PI; this.windTo.set(Math.sin(to), Math.cos(to)); }
    this.windVec.copy(this.windTo).multiplyScalar(s.windNow);
    U.uWindVec.value.copy(this.windVec);
    U.uWetness.value = s.wetness;
    U.uPrecip.value.set(s.rain, s.snow);

    // ---- the sky: deck + wind (unless the engine's own ?cloud= / ?wind= pin them)
    const sky = ctx.services.get("sky") as SkyService | undefined;
    if (sky && this.snapped) {
      if (!this.q.has("cloud")) sky.setCloudCover(s.cloud, snapNow);
      if (!this.q.has("wind")) sky.setWind(s.windNow, snapNow);
    }
    // overcast mutes and greys the key light; under the deck the day grades darker and cooler (a clear
    // sky stays warm). Runs after TimeOfDay, before the sky's storm grade and the island's lights.
    const cover = this.q.has("cloud") ? Number(this.q.get("cloud")) || 0 : this.snapped ? s.cloud : 0;
    const oc = THREE.MathUtils.smoothstep(cover, 0.35, 1.0);
    if (oc > 1e-3) {
      const sun = U.uSunColor.value;
      const l = 0.2126 * sun.r + 0.7152 * sun.g + 0.0722 * sun.b;
      sun.lerp(this.tmpC.setRGB(l, l, l), 0.4 * oc).multiplyScalar(1 - 0.5 * oc);
      U.uHemiSky.value.multiplyScalar(1 + 0.15 * oc);
    }
    const cool = THREE.MathUtils.smoothstep(cover, 0.3, 0.8) * (1 - U.uNight.value);
    if (cool > 1e-3) {
      const g = ctx.timeOfDay.grade;
      g.gain = [g.gain[0] * (1 - 0.13 * cool), g.gain[1] * (1 - 0.07 * cool), g.gain[2] * (1 + 0.02 * cool)];
      g.lift = [g.lift[0] * (1 - 0.012 * cool), g.lift[1], g.lift[2] * (1 + 0.02 * cool)];
      g.warmSat *= 1 - 0.12 * cool;
    }

    // ---- motion + quality
    this.clock ??= new MotionClock(ensureMotionService(ctx));
    const ptime = this.clock.step(dt);
    const reduced = this.clock.live < 0.5;
    const tier = (ctx.services.get("quality") as QualityService | undefined)?.settings.tier ?? "high";

    // ---- lightning (Warning / Danger), flash → uLightning (the sky lights the deck and the world with it)
    const horizon = sky?.horizonDistance() ?? 1500;
    const cam = ctx.camera;
    const fwd = cam.getWorldDirection(this.target);
    const fwdAz = Math.atan2(fwd.x, -fwd.z);
    const vfov = cam.fov;
    const halfH = THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov / 2)) * cam.aspect));
    const pitch = Math.asin(THREE.MathUtils.clamp(-fwd.y, -1, 1));
    const depr = Math.atan(cam.position.y / horizon);
    const bandTop = Math.max(0.5, THREE.MathUtils.radToDeg(depr - (pitch - THREE.MathUtils.degToRad(vfov / 2))));
    this.lightning.update({
      dt, rate: s.strikesPerMin, strikeKm: s.strikeKm, suppressed: reduced, camera: cam, horizon,
      halfFovDeg: halfH, bandTopDeg: bandTop, fwdAz, night: U.uNight.value,
    });
    U.uLightning.value = this.lightning.flash;
    this.flash.azimuth = fwdAz + THREE.MathUtils.degToRad(this.lightning.flashTh);
    this.flash.elevation = this.lightning.flashE;

    // ---- precipitation + splashes + storm spray
    if (!this.anchorsBuilt) this.buildAnchors(ctx);
    const rig = ctx.rig;
    this.target.copy(rig.target).setY(0);
    const hemi = U.uHemiSky.value;
    const hl = 0.2126 * hemi.r + 0.7152 * hemi.g + 0.0722 * hemi.b;
    const sl = 0.2126 * U.uSunColor.value.r + 0.7152 * U.uSunColor.value.g + 0.0722 * U.uSunColor.value.b;
    this.amb.setRGB(0.92, 0.97, 1.05).multiplyScalar((hl * 2.2 + sl * 0.05) * (1 - 0.3 * s.gloom));
    this.viewport.set(ctx.renderer.domElement.width, ctx.renderer.domElement.height);
    const spray = THREE.MathUtils.smoothstep(s.windNow, 0.62, 0.98) * (s.level == null ? 0 : THREE.MathUtils.smoothstep(s.level, 2.5, 3.6));
    this.precip.update({
      camera: cam, distance: rig.distance, target: this.target, rain: s.rain, snow: s.snow, wind: this.windVec,
      spray, flash: this.lightning.flash, ambient: this.amb, time: ptime, viewport: this.viewport, budget: PRECIP_BUDGET[tier],
    });

    // ---- the recovery rainbow
    this.rainbow.update(s.rainbow, cam, U.uSunDir.value, U.uSunColor.value, rig.distance, horizon);
  }

  dispose(ctx: EngineContext): void {
    this.precip.dispose();
    this.lightning.dispose();
    this.rainbow.dispose();
    this.fx.release();
    ctx.services.delete("weather");
  }
}
