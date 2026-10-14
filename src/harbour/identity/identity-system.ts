import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import { getLightsStore } from "../lights/lights-service";
import type { OceanService } from "../ocean/ocean-system";
import { ensureMotionService, type MotionService } from "../ui/services";
import { CrestFlags } from "./crest-flags";
import { fitLabel, labelSpecs, type FitObstacle, type LabelSpec } from "./labels";
import { ChartLettering } from "./lettering";
import { OfficeDresser, officePlots } from "./offices";
import type { ChartFont, CrestAtlas, IdentityLayout } from "./types";

/**
 * IDENTITY & LEGIBILITY (P6, D17/D18): the harbours and sea zones name themselves without hover.
 *   - chart lettering printed on the sea (lettering.ts / labels.ts);
 *   - each harbour office dressed in its chain's heraldry: facade crest, chain-colour awning, and the crest
 *     flown as a large house flag on a topmast over the office (offices.ts / crest-flags.ts);
 *   - anchorage buoy lights across the Far Ports at night.
 * Atlases: scripts/harbour/build-crests.mjs → public/harbour/crests.* and chart-lettering.*.
 *
 * Service 'identity': { chains } (chain → field/rim/ink colours) for any system that wants the heraldry.
 */
export interface IdentityService { readonly chains: CrestAtlas["chains"]; readonly labels: readonly LabelSpec[] }

/** The dominant harbour's house flag reads first: larger cloth on a taller topmast. */
const FLAG_SCALE: Record<string, number> = { ethereum: 1.65 };

interface LifeWind { readonly wind: number; readonly windTo: readonly [number, number] }

async function json<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok && (r.headers.get("content-type") ?? "").includes("json") ? ((await r.json()) as T) : null;
  } catch { return null; }
}

export class IdentitySystem implements WorldSystem {
  readonly name = "identity";
  private lettering: ChartLettering | null = null;
  private flags: CrestFlags | null = null;
  private dresser: OfficeDresser | null = null;
  private atlas: CrestAtlas | null = null;
  private motion: MotionService | null = null;
  private scanIn = 0;
  private scans = 0;
  private readonly light = new THREE.Color();
  private labels: LabelSpec[] = [];

  async init(ctx: EngineContext): Promise<void> {
    const layout = ctx.services.get("layout") as IdentityLayout | undefined;
    if (!layout) return;
    this.motion = ensureMotionService(ctx);
    const [font, atlas, sdfTex, crestTex] = await Promise.all([
      json<ChartFont>("/harbour/chart-lettering.json"),
      json<CrestAtlas>("/harbour/crests.json"),
      ctx.assets.texture("/harbour/chart-lettering.png", false).catch(() => null),
      ctx.assets.texture("/harbour/crests.png", true).catch(() => null),
    ]);

    if (font && sdfTex && layout.seaZones?.length) {
      const ocean = ctx.services.get("ocean") as OceanService | undefined;
      this.labels = this.fittedSpecs(layout, font, ocean, ctx.camera.aspect);
      this.lettering = new ChartLettering(this.labels, font, sdfTex, ctx.uniforms, ocean, layout.seaLevel ?? 0);
      ctx.scene.add(this.lettering.mesh);
    }

    if (atlas && crestTex) {
      this.atlas = atlas;
      crestTex.anisotropy = 8;
      crestTex.generateMipmaps = true;
      crestTex.minFilter = THREE.LinearMipmapLinearFilter;
      this.dresser = new OfficeDresser(atlas, crestTex, officePlots(layout.civic));
      this.flags = new CrestFlags(crestTex);
      ctx.scene.add(this.flags.group);
      const labels = () => this.labels;
      ctx.services.set("identity", { chains: atlas.chains, get labels() { return labels(); } } satisfies IdentityService);
    }

    // the Far Ports: a buoyed anchorage, its buoys lit at night (steady amber, the island owns the raft-end marks)
    const fp = (ctx.services.get("layout") as { zones?: { farPorts?: { rows?: Array<{ line: Array<[number, number]> }> } } }).zones?.farPorts;
    if (fp?.rows?.length) {
      const lights = getLightsStore(ctx);
      fp.rows.forEach((row, ri) => {
        const L = row.line;
        if (L.length < 2) return;
        // buoys just beyond each row's ends (the fairway marks), alternating colours along the anchorage
        const [a, b] = [L[0], L[L.length - 1]];
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
        const ex = (dx / len) * 9, ez = (dz / len) * 9;
        lights.add("riding", [a[0] - ex, 1.4, a[1] - ez], ri % 2 ? "#FFC85A" : "#FFE6A8");
        lights.add("riding", [b[0] + ex, 1.4, b[1] + ez], ri % 2 ? "#FFE6A8" : "#FFC85A");
      });
    }
  }

  update(frame: FrameState, ctx: EngineContext): void {
    if (this.lettering) this.lettering.camDist.value = ctx.rig.distance;
    const u = ctx.uniforms;
    if (this.dresser && !this.dresser.complete && (this.scanIn -= frame.delta) <= 0) {
      // the offices arrive whenever their placer has loaded them: look twice a second, then less often
      this.scanIn = this.scans++ < 60 ? 0.5 : 3;
      for (const s of this.dresser.scan(ctx.scene)) {
        const c = this.atlas!.chains[s.chain];
        this.flags?.add({ x: s.top.x, y: s.top.y, z: s.top.z, rect: c.flag, phase: s.chain.length * 1.7 + s.top.x * 0.01, scale: FLAG_SCALE[s.chain] });
      }
    }
    this.dresser?.setGlow(0.28 * u.uWindowGlow.value);
    if (this.flags) {
      const life = ctx.services.get("life") as LifeWind | undefined;
      const sky = ctx.services.get("sky") as { shared?: { uWeatherSea?: { value: THREE.Vector4 } } } | undefined;
      const wind = life?.wind ?? sky?.shared?.uWeatherSea?.value.y ?? 0.35;
      const windTo = life?.windTo ?? ([0.84, -0.54] as const);
      const dim = 1 - 0.7 * u.uNight.value;
      this.light.setRGB(
        Math.min(1.15, u.uHemiSky.value.r * 1.1 + u.uSunColor.value.r * 0.42) * dim,
        Math.min(1.15, u.uHemiSky.value.g * 1.1 + u.uSunColor.value.g * 0.42) * dim,
        Math.min(1.15, u.uHemiSky.value.b * 1.1 + u.uSunColor.value.b * 0.42) * dim,
      );
      this.flags.farScale = 1 + 0.45 * THREE.MathUtils.smoothstep(ctx.rig.distance, 420, 900);
      this.flags.update(frame.delta, !(this.motion?.reduced ?? false), windTo, wind, this.light, 0.16 * u.uWindowGlow.value, ctx.camera.position);
    }
  }

  /** Names slid into their own water, clear of piers, inside the overview's frame. */
  private fittedSpecs(layout: IdentityLayout, font: ChartFont, ocean: OceanService | undefined, aspect: number) {
    const zones = layout.seaZones ?? [];
    const piers = (layout as { piers?: Array<{ segments: Array<{ a: [number, number]; b: [number, number]; width: number }> }> }).piers ?? [];
    const obstacles: FitObstacle[] = piers.flatMap((p) => p.segments.map((g) => ({ a: g.a, b: g.b, halfWidth: g.width / 2 })));
    const ovp = (layout as { camera?: { presets?: Record<string, { target: number[]; distance: number; fovDeg: number; pitchDeg: number; yawDeg: number }> } }).camera?.presets?.overview;
    const ov = ovp?.target;
    const centre: [number, number] = ov ? [ov[0], ov[2]] : [0, 0];
    // the overview's own frame (same maths as the camera rig): names should be on screen there
    let inFrame: ((x: number, z: number) => boolean) | undefined;
    if (ovp) {
      const cam = new THREE.PerspectiveCamera(ovp.fovDeg, Math.max(1.2, aspect), 1, 10000);
      const yaw = THREE.MathUtils.degToRad(ovp.yawDeg), pitch = THREE.MathUtils.degToRad(ovp.pitchDeg);
      const t = new THREE.Vector3(ovp.target[0], ovp.target[1], ovp.target[2]);
      cam.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(ovp.distance).add(t);
      cam.lookAt(t);
      cam.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      inFrame = (x, z) => { v.set(x, 0, z).project(cam); return Math.abs(v.x) < 0.9 && v.y > -0.86 && v.y < 0.5; };
    }
    return labelSpecs(zones).map((spec) => {
      const zone = zones.find((z) => z.id === spec.id)!;
      const near = obstacles.filter((o) => Math.min(Math.hypot(o.a[0] - spec.anchor[0], o.a[1] - spec.anchor[1]), Math.hypot(o.b[0] - spec.anchor[0], o.b[1] - spec.anchor[1])) < 320);
      // nudged away from the island: in perspective the town and hills hide whatever lies close behind them
      const pull = { at: centre, weight: -0.08 };
      return fitLabel(spec, zone, font, near, pull, ocean?.coastAt, spec.cls === "open" ? undefined : inFrame);
    });
  }

  dispose(ctx: EngineContext): void {
    if (this.lettering) { ctx.scene.remove(this.lettering.mesh); this.lettering.dispose(); }
    if (this.flags) { ctx.scene.remove(this.flags.group); this.flags.dispose(); }
    this.dresser?.dispose();
    ctx.services.delete("identity");
  }
}
