import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { QualityService, QualityTier } from "../engine/quality";
import type { HarbourLayout } from "../layout/types";
import type { LightsService } from "../lights/lights-service";
import type { SkyService } from "../sky/sky-system";
import { ensureMotionService, type MotionService } from "../ui/services";
import type { GroundService } from "../world/ground";
import { getHarbourMaterials } from "../world/materials";
import { LandFlags } from "./flags";
import { Townsfolk, type FolkGround } from "./folk";
import { Dolphins } from "./dolphins";
import { BEASTS_URL, beastGeometry, Herds, type CatSeat } from "./herds";
import type { OceanService } from "../ocean/ocean-system";
import type { WakeService } from "../ocean/wake";
import type { WeatherService } from "../weather/weather-system";
import { Gulls, type GullShips } from "./gulls";
import type { MastheadService } from "../fleet/mastheads";
import { ChimneySmoke } from "./smoke";
import { SeasonalDrift } from "./drift";
import type { SeasonService } from "../season/season-system";
import { roleDensity, stormShare } from "./roles";
import { smokeAmount, townDensity, type Walkways } from "./walkways";

export const WALKWAYS_URL = "/harbour/walkways.json";

/** Share of the cast on stage per quality tier (same art, fewer actors on Low). */
const TIER_SHARE: Record<QualityTier, number> = { high: 1, medium: 0.75, low: 0.45 };
const GULLS = 14;

/** 'life' service: the wind the life layer is showing (read by the ambience layer). */
export interface LifeService {
  /** 0..1 (DEWS wind via the sky) */
  readonly wind: number;
  /** downwind unit vector (x, z) */
  readonly windTo: readonly [number, number];
  /** share of townsfolk about, 0..1 */
  readonly bustle: number;
}

interface WindSource { wind?: { fromRad: number; strength: number }; pose?: GullShips }

/** 09-L7: up to six cats on the quay copings near the heart, well apart (a coping top under them, the sea in front). */
function catSeats(walk: Walkways, g: FolkGround, focus: [number, number] | undefined): CatSeat[] {
  const out: CatSeat[] = [];
  const edges = walk.spots.filter((s) => s.kind === "edge" && (!focus || Math.hypot(s.p[0] - focus[0], s.p[2] - focus[1]) < 260));
  // every sixth spot from the third: where a standing group stands back from the edge (the coping sitters use the others)
  for (let k = 3; k < edges.length && out.length < 6; k += 6) {
    const e = edges[k], fx = Math.sin(e.h), fz = Math.cos(e.h);
    for (const off of [0.95, 0.8, 1.1, 0.65, 1.25]) {
      const x = e.p[0] + fx * off, z = e.p[2] + fz * off;
      const y = g.seatHeight(x, z, fx, fz);
      if (y === null || out.some((c) => Math.hypot(c.x - x, c.z - z) < 30)) continue;
      // along the coping, or looking out to sea
      out.push({ x, y: y - 0.01, z, yaw: e.h + (k % 3 === 0 ? 0 : Math.PI / 2) });
      break;
    }
  }
  return out;
}

/**
 * LIFE — the declared-decorative inhabitants of the island: townsfolk, gulls, chimney smoke, flags and
 * bunting, dolphins at the mouth, goats, cats and a hay cart. Nothing here carries or implies data. Budget: ≤ 8 draw
 * calls (folk + its shadow, gulls, smoke, flags, seasonal drift, dolphins, herds = 8), ≤ 0.4 ms CPU per frame. Honours reduced motion (people stand, gulls perch, smoke holds still)
 * and the quality tier (fewer actors on Low).
 */
export class LifeSystem implements WorldSystem {
  readonly name = "life";
  private folk: Townsfolk | null = null;
  private gulls: Gulls | null = null;
  private smoke: ChimneySmoke | null = null;
  private flags: LandFlags | null = null;
  private drift: SeasonalDrift | null = null;
  private dolphins: Dolphins | null = null;
  private herds: Herds | null = null;
  private motion: MotionService | null = null;
  private quality: QualityService | null = null;
  readonly group = new THREE.Group();
  /** `?life=0` hides the layer (A/B captures). */
  private readonly enabled = new URLSearchParams(location.search).get("life") !== "0";
  private readonly windTo: [number, number] = [0.84, -0.54];
  private wind = 0.35;
  private bustle = 0;
  private covePerched = false;

  async init(ctx: EngineContext): Promise<void> {
    this.group.name = "life";
    const svc: LifeService = {
      get wind() { return sys.wind; },
      get windTo() { return sys.windTo; },
      get bustle() { return sys.bustle; },
    };
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the service getters read live state
    const sys = this;
    ctx.services.set("life", svc);
    if (!this.enabled) return;
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    if (!layout) return;
    let walk: Walkways;
    try {
      const r = await fetch(WALKWAYS_URL);
      if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return;
      walk = (await r.json()) as Walkways;
    } catch { return; }
    const mats = getHarbourMaterials(ctx);
    this.motion = ensureMotionService(ctx);
    this.quality = (ctx.services.get("quality") as QualityService | undefined) ?? null;

    const ground = ctx.services.get("ground") as GroundService | undefined;
    const ring = [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]] as const;
    const folkGround: FolkGround | undefined = ground && {
      // a node is inside something when most of a 1.8 m cross stands well above it (thin lamp posts don't count)
      // …or when there is nothing under it at all (a pier the island no longer builds, open water)
      blocked: (x, y, z) => ring.filter(([dx, dz]) => { const h = ground.heightAt(x + dx, z + dz); return h > y + 0.9 || h < y - 0.8; }).length >= 3,
      open: (x, y, z, r) => ring.every(([dx, dz]) => Math.abs(ground.heightAt(x + dx * r, z + dz * r) - y) < 0.6),
      seat: (x, y, z) => { const h = ground.heightAt(x, z) - y; return h > 0.25 && h < 1.3; },
      seatHeight: (x, z, fx, fz) => {
        // the coping stands ≈ 0.3 m proud of the 2.46 m quay paving, with the paving behind and the sea in front
        const h = ground.heightAt(x, z), back = ground.heightAt(x - fx * 0.7, z - fz * 0.7), front = ground.heightAt(x + fx * 1.2, z + fz * 1.2);
        return h > 2.6 && h < 3.0 && back > 2.3 && back < 3.0 && front < 1.5 ? h : null;
      },
    };
    const ht = layout.camera.presets.heart?.target;
    const lights = ctx.services.get("lights") as LightsService | undefined;
    this.folk = new Townsfolk(walk, mats, { walkers: 150, standers: 34 }, folkGround, ht ? [ht[0], ht[2]] : undefined, lights);
    this.group.add(this.folk.mesh);
    // dev captures: the cast by role (window.__harbourLife)
    if (import.meta.env.DEV) (window as unknown as { __harbourLife?: unknown }).__harbourLife = { roles: this.folk.roleCounts(), life: this, rig: ctx.rig };

    const V = (p: readonly number[], dy = 0) => new THREE.Vector3(p[0], p[1] + dy, p[2]);
    const lm = (id: string) => layout.landmarks.find((l) => l.id === id)?.position;
    const circles: THREE.Vector3[] = [];
    const pharos = lm("pharos"), bw = lm("breakwater"), heart = layout.camera.presets.heart?.target, customs = lm("customs-house");
    // wheeling low over the water reads best (white on teal): the Pharos, the mouth (twice: it is the gulls'
    // favourite), the bay; the Customs House circle sends some over the town
    if (pharos) circles.push(V(pharos, 16));
    if (pharos && bw) { const m = new THREE.Vector3((pharos[0] + bw[0]) / 2, 16, (pharos[2] + bw[2]) / 2); circles.push(m, m.clone().setY(22)); }
    if (heart) circles.push(V(heart, 14));
    if (customs) circles.push(V(customs, 24));
    if (!circles.length) circles.push(new THREE.Vector3(0, 30, 0));
    // chimneys that really stand on a roof (the exporter's list may hold a stray): something solid just below
    const chimneys = ground ? walk.chimneys.filter((c) => ground.heightAt(c[0], c[2]) > c[1] - 2.5) : walk.chimneys;
    const perches: THREE.Vector3[] = [];
    chimneys.forEach((c, i) => { if (i % 2 === 0) perches.push(V(c, 0.08)); });
    for (const l of layout.lights ?? []) {
      if (l.kind === "pierhead" || l.kind === "harbourlight") perches.push(V(l.position, 0.42));
    }
    const squares = walk.spots.filter((sp) => sp.kind === "square").map((sp) => V(sp.p));
    this.gulls = new Gulls({ circles, perches, squares }, mats, GULLS);
    this.gulls.busy = new URLSearchParams(location.search).get("gulls") === "busy";
    this.group.add(this.gulls.mesh);

    this.smoke = new ChimneySmoke(chimneys);
    this.group.add(this.smoke.mesh);

    this.drift = new SeasonalDrift(mats.ao);
    this.group.add(this.drift.mesh);

    // 09-L4 dolphins at the harbour mouth, between the Pharos and the breakwater head, in open water
    const bwl = layout.island?.breakwater;
    if (pharos && bwl && bwl.length) {
      const end = bwl[bwl.length - 1];                    // the breakwater head (its harbour light)
      const ocean = ctx.services.get("ocean") as OceanService | undefined;
      this.dolphins = new Dolphins({
        x: (pharos[0] + end[0]) / 2, z: (pharos[2] + end[1]) / 2, r: 22,
        clear: ocean ? (x, z) => ocean.coastAt(x, z) > 14 : undefined,
      }, mats, new URLSearchParams(location.search).get("dolphins"));
      this.group.add(this.dolphins.mesh);
    }

    // 09-L3 goats (and, in the same draw, the cats and the hay cart): the beasts kit
    if (ground && walk.pastures?.length) {
      try {
        const geo = beastGeometry(await ctx.assets.gltf(BEASTS_URL));
        this.herds = new Herds(geo, mats, ground, walk.pastures, folkGround ? catSeats(walk, folkGround, ht ? [ht[0], ht[2]] : undefined) : [], walk.cartway ?? []);
        this.group.add(this.herds.mesh);
      } catch { this.herds = null; }
    }

    if (walk.flagpoles.length || walk.bunting.length) {
      this.flags = new LandFlags(walk, mats);
      this.group.add(this.flags.mesh);
    }
    ctx.scene.add(this.group);
  }

  update(frame: FrameState, ctx: EngineContext): void {
    if (!this.folk) return;
    const dt = frame.delta;
    const moving = !(this.motion?.reduced ?? false);
    const share = TIER_SHARE[this.quality?.tier ?? "high"];
    const hour = ctx.timeOfDay.hour;
    const u = ctx.uniforms;

    // wind: strength from the sky (DEWS, smoothed), direction from the sim (the way the hulls lie)
    const sky = ctx.services.get("sky") as SkyService | undefined;
    const sim = ctx.services.get("sim") as WindSource | undefined;
    this.wind = sky?.shared.uWeatherSea.value.y ?? sim?.wind?.strength ?? 0.35;
    if (sim?.wind) { const to = sim.wind.fromRad + Math.PI; this.windTo[0] = Math.sin(to); this.windTo[1] = Math.cos(to); }

    // the calendar (declared decorative): fewer folk out in the cold, every hearth lit in winter
    const season = ctx.services.get("season") as SeasonService | undefined;
    const [spring, summer, autumn, winter] = season?.weights ?? [0, 1, 0, 0];
    // …and fewer in a storm (the DEWS wind): life withdraws from the weather, never the other way round
    const folkShare = share * (1 - 0.35 * winter) * stormShare(this.wind);
    this.bustle = townDensity(hour) * folkShare;
    this.folk.update(dt, hour, folkShare, u.uNight.value, u.uLamp.value * 0.22, moving);
    // gulls stand on the big hulks of Wreck Cove (the fleet's 'cove' service, once its kit has landed)
    if (!this.covePerched && this.gulls) {
      const marks = (ctx.services.get("cove") as { marks?: ReadonlyArray<{ perch: [number, number, number] | null; len: number }> } | undefined)?.marks ?? [];
      const pts = marks.filter((m) => m.perch).sort((a, b) => b.len - a.len).slice(0, 7).map((m) => new THREE.Vector3(...m.perch!));
      if (pts.length) { this.gulls.addPerches(pts, 4); this.covePerched = true; }
    }
    // 09-L6: the fleet for the gulls (hulls casting off to trail, mastheads to stand on)
    this.gulls?.setShips(sim?.pose ?? null, (ctx.services.get("mastheads") as MastheadService | undefined) ?? null);
    // 09-L7: swallows over the squares at dusk in spring and summer (fewer in a blow)
    const dusk = THREE.MathUtils.smoothstep(hour, 17.8, 18.5) * (1 - THREE.MathUtils.smoothstep(hour, 20.1, 20.8));
    this.gulls?.update(dt, moving, share > 0.5 ? 1 : 0.5, u.uNight.value, (spring + summer) * dusk * share * stormShare(this.wind));
    const hearth = 1 + 1.1 * winter + 0.3 * autumn;
    if (this.smoke) this.smoke.uniforms.uSmokeOpacity.value = 0.26 * (1 + 0.35 * winter);
    this.smoke?.update(dt, moving, smokeAmount(hour) * hearth * (0.6 + 0.4 * share), this.windTo, this.wind, u);
    // 09-L7: summer fireflies, 21–24 h, on calm nights only
    const fireHours = THREE.MathUtils.smoothstep(hour, 20.8, 21.4) * (1 - THREE.MathUtils.smoothstep(hour, 23.4, 23.95));
    const fire = THREE.MathUtils.smoothstep(summer, 0.3, 0.8) * fireHours * u.uNight.value * (this.wind < 0.5 ? 1 : 0);
    this.drift?.update(dt, moving, autumn, spring, share, ctx.camera, ctx.rig.target, ctx.rig.distance, u, fire);
    this.flags?.update(dt, moving, this.windTo, this.wind);
    // 08-T5 / 09-L9: the hay cart is out by day (the carter's hours), off the road at night
    this.herds?.update(dt, u.uNight.value, share * stormShare(this.wind), moving, roleDensity("carter", hour) > 0);
    this.folk.setCarter(this.herds?.carter() ?? null);
    if (this.dolphins) {
      // only in the calm bands (DEWS CALM / WATCH) of a fresh reading: no reading, stale fog or rough weather = none
      const level = (ctx.services.get("weather") as WeatherService | undefined)?.state.level ?? null;
      const fog = (ctx.services.get("readings") as { fog?: number } | undefined)?.fog ?? 0;
      this.dolphins.update(dt, level !== null && level < 1.5 && fog < 0.05, moving, 0, ctx.services.get("wake") as WakeService | undefined);
    }
  }

  dispose(ctx: EngineContext): void {
    ctx.scene.remove(this.group);
    ctx.services.delete("life");
    this.folk?.dispose(); this.gulls?.dispose(); this.smoke?.dispose(); this.flags?.dispose(); this.drift?.dispose(); this.dolphins?.dispose(); this.herds?.dispose();
    this.folk = this.gulls = this.smoke = this.flags = null;
    this.drift = null; this.dolphins = null; this.herds = null;
  }
}
