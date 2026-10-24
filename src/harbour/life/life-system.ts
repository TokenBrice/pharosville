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
import { Gulls } from "./gulls";
import { ChimneySmoke } from "./smoke";
import { SeasonalDrift } from "./drift";
import type { SeasonService } from "../season/season-system";
import { stormShare } from "./roles";
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

interface WindSource { wind?: { fromRad: number; strength: number } }

/**
 * LIFE — the declared-decorative inhabitants of the island: townsfolk, gulls, chimney smoke, flags and
 * bunting. Nothing here carries or implies data. Budget: ≤ 6 draw calls (folk + its shadow, gulls, smoke,
 * flags, seasonal drift = 6), ≤ 0.4 ms CPU per frame. Honours reduced motion (people stand, gulls perch, smoke holds still)
 * and the quality tier (fewer actors on Low).
 */
export class LifeSystem implements WorldSystem {
  readonly name = "life";
  private folk: Townsfolk | null = null;
  private gulls: Gulls | null = null;
  private smoke: ChimneySmoke | null = null;
  private flags: LandFlags | null = null;
  private drift: SeasonalDrift | null = null;
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
    if (import.meta.env.DEV) (window as unknown as { __harbourLife?: unknown }).__harbourLife = { roles: this.folk.roleCounts() };

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
    this.gulls = new Gulls({ circles, perches }, mats, GULLS);
    this.group.add(this.gulls.mesh);

    this.smoke = new ChimneySmoke(chimneys);
    this.group.add(this.smoke.mesh);

    this.drift = new SeasonalDrift(mats.ao);
    this.group.add(this.drift.mesh);

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
    const [spring, , autumn, winter] = season?.weights ?? [0, 1, 0, 0];
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
    this.gulls?.update(dt, moving, share > 0.5 ? 1 : 0.5, u.uNight.value);
    const hearth = 1 + 1.1 * winter + 0.3 * autumn;
    if (this.smoke) this.smoke.uniforms.uSmokeOpacity.value = 0.26 * (1 + 0.35 * winter);
    this.smoke?.update(dt, moving, smokeAmount(hour) * hearth * (0.6 + 0.4 * share), this.windTo, this.wind, u);
    this.drift?.update(dt, moving, autumn, spring, share, ctx.camera, ctx.rig.target, ctx.rig.distance, u);
    this.flags?.update(dt, moving, this.windTo, this.wind);
  }

  dispose(ctx: EngineContext): void {
    ctx.scene.remove(this.group);
    ctx.services.delete("life");
    this.folk?.dispose(); this.gulls?.dispose(); this.smoke?.dispose(); this.flags?.dispose(); this.drift?.dispose();
    this.folk = this.gulls = this.smoke = this.flags = null;
    this.drift = null;
  }
}
