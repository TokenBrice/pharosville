import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import { getLightsStore } from "../lights/lights-service";
import type { GroundService } from "../world/ground";
import type { OceanService } from "../ocean/ocean-system";
import { ensureMotionService, type MotionService } from "../ui/services";
import { runIdleSteps } from "../engine/idle-steps";
import { CrestFlags } from "./crest-flags";
import { labelSpecs, placeLabelSteps, type FitObstacle, type LabelSpec, type PlaceView } from "./labels";
import { ChartLettering } from "./lettering";
import { OfficeDresser, officePlots } from "./offices";
import { markSites, PierMarks, type MarkPier } from "./pier-marks";
import type { ChartFont, CrestAtlas, IdentityLayout } from "./types";

/**
 * IDENTITY & LEGIBILITY (P6, D17/D18): the harbours and sea zones name themselves without hover.
 *   - chart lettering printed on the sea (lettering.ts / labels.ts);
 *   - each harbour office dressed in its chain's heraldry: facade crest, chain-colour awning, and the crest
 *     flown as a large house flag on a topmast over the office (offices.ts / crest-flags.ts);
 *   - chain-colour beacons and bollards on the pier heads (pier-marks.ts);
 *   - anchorage buoy lights across the Far Ports at night.
 * Atlases: scripts/harbour/build-crests.mjs → public/harbour/crests.* and chart-lettering.*.
 *
 * Service 'identity': { chains } (chain → field/rim/ink colours) for any system that wants the heraldry.
 */
export interface IdentityService {
  readonly chains: CrestAtlas["chains"]; readonly labels: readonly LabelSpec[];
  /** T6: roll a harbour office's awning (chain slug, k 0 … 1 furled); civic/office-works.ts drives it. */
  furl(chain: string, k: number): void;
}

/**
 * The dominant harbour's house flag reads first, at the town's scale (E03b, ruling V6): somewhat larger cloth on a
 * taller topmast (others fly on CrestFlags' 6 m), its top near the civic quarter's building line, not over it.
 */
export const FLAG_SCALE: Readonly<Record<string, number>> = { ethereum: 1.2 };
export const FLAG_TOPMAST: Readonly<Record<string, number>> = { ethereum: 7 };
/** E03b: seen from afar the house flags are dressed a little larger: up to +25 % from the heart's 650 m to 1000 m. */
export function crestFarScale(distance: number): number { return 1 + 0.25 * THREE.MathUtils.smoothstep(distance, 650, 1000); }
/** E03b (O2-I5, O10 M1): at night the crest is lit as cloth (the moon, dimmed with the facades: twice O6's dimming)
 *  and by its truck lamp, a hoist-local glow of CREST_GLOW × the window glow. */
export const CREST_NIGHT_DIM = 0.9, CREST_GLOW = 0.035;

/** Roof/ridge heights above the plot (m) for the chart's line-of-sight test; others ~18 m. */
const CIVIC_HEIGHT: Record<string, number> = { customs: 26, mint: 30, burn: 26, shipyard: 14, registry: 20, stormstation: 22 };


/** Metres added to dry land in the sight grid for trees (not in the island's height field). */
const TREE_ALLOWANCE = 11;

/** A building outside the island model, for the sight grid: centre, half extents along its own axes, turn, top (m). */
export interface SightBlock { x: number; z: number; hx: number; hz: number; r: number; h: number }

/** Rows of the height field pooled per step of sightGridSteps. */
const SIGHT_ROWS_PER_STEP = 32;

/**
 * A coarse (4 m) max-pooled height grid for the chart's line-of-sight test: the island's height field plus
 * whatever stands outside the island model (the Pharos's square tiers, the civic buildings). O(1) per lookup.
 * Resumable steps: rows of the height field, then each building stamped into the cells round it with the
 * same per-cell test (and max) as testing every building at every cell, so the same grid.
 */
export function* sightGridSteps(ground: Pick<GroundService, "bounds" | "size" | "heights">, tall: readonly SightBlock[], pharos: readonly number[] | undefined, cell = 4): Generator<void, (x: number, z: number) => number> {
  const [minX, minZ, maxX, maxZ] = ground.bounds, N = ground.size;
  const nx = Math.ceil((maxX - minX) / cell), nz = Math.ceil((maxZ - minZ) / cell);
  const g = new Float32Array(nx * nz).fill(-8);
  for (let r = 0; r < N; r++) {
    // row 0 = world z max
    const z = maxZ - ((r + 0.5) / N) * (maxZ - minZ), gz = Math.min(nz - 1, Math.floor((z - minZ) / cell));
    for (let c = 0; c < N; c++) {
      const gx = Math.min(nx - 1, Math.floor((((c + 0.5) / N) * (maxX - minX)) / cell)), k = gz * nx + gx;
      // land stands taller than its height field to the eye: the woods and the life layer's trees ride on it
      const h0 = ground.heights[r * N + c], h = h0 > 1.5 ? h0 + TREE_ALLOWANCE : h0;
      if (h > g[k]) g[k] = h;
    }
    if (r % SIGHT_ROWS_PER_STEP === SIGHT_ROWS_PER_STEP - 1) yield;
  }
  // every cell whose centre lies in [x0, x1] × [z0, z1] (one cell of slack), tested exactly at its centre
  const stamp = (x0: number, z0: number, x1: number, z1: number, h: number, inside: (x: number, z: number) => boolean) => {
    const i0 = Math.max(0, Math.floor((x0 - minX) / cell) - 1), i1 = Math.min(nx - 1, Math.ceil((x1 - minX) / cell) + 1);
    const j0 = Math.max(0, Math.floor((z0 - minZ) / cell) - 1), j1 = Math.min(nz - 1, Math.ceil((z1 - minZ) / cell) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = minX + (i + 0.5) * cell, z = minZ + (j + 0.5) * cell, k = j * nx + i;
      if (h > g[k] && inside(x, z)) g[k] = h;
    }
  };
  // the Pharos: its square tiers and corner statues, a little generous
  if (pharos) stamp(pharos[0] - 22, pharos[2] - 22, pharos[0] + 22, pharos[2] + 22, 100, (x, z) => Math.max(Math.abs(x - pharos[0]), Math.abs(z - pharos[2])) < 22);
  for (const b of tall) {
    const c = Math.cos(b.r), s = Math.sin(b.r), reach = Math.hypot(b.hx, b.hz);
    stamp(b.x - reach, b.z - reach, b.x + reach, b.z + reach, b.h, (x, z) => {
      const dx = x - b.x, dz = z - b.z;
      return Math.abs(dx * c - dz * s) < b.hx && Math.abs(dx * s + dz * c) < b.hz;
    });
    yield;
  }
  return (x, z) => {
    const i = Math.floor((x - minX) / cell), j = Math.floor((z - minZ) / cell);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -8 : g[j * nx + i];
  };
}

export class IdentitySystem implements WorldSystem {
  readonly name = "identity";
  private lettering: ChartLettering | null = null;
  private flags: CrestFlags | null = null;
  private dresser: OfficeDresser | null = null;
  private marks: PierMarks | null = null;
  private atlas: CrestAtlas | null = null;
  private motion: MotionService | null = null;
  private scanIn = 0;
  private scans = 0;
  private scanning = false;
  private disposed = false;
  private readonly light = new THREE.Color();
  private labels: LabelSpec[] = [];

  async init(ctx: EngineContext): Promise<void> {
    const layout = ctx.services.get("layout");
    if (!layout) return;
    this.motion = ensureMotionService(ctx);
    const [font, atlas, sdfTex, crestTex] = await Promise.all([
      ctx.assets.json<ChartFont>("/harbour/chart-lettering.json").catch(() => null),
      ctx.assets.json<CrestAtlas>("/harbour/crests.json").catch(() => null),
      ctx.assets.texture("/harbour/chart-lettering.webp", false).catch(() => null),
      ctx.assets.texture("/harbour/crests.webp", true).catch(() => null),
    ]);

    ctx.signal?.throwIfAborted();
    const lettered = !!(font && sdfTex && layout.seaZones?.length);
    if (lettered) {
      const ocean = ctx.services.get("ocean");
      const t0 = performance.now();
      // the fitting is pure CPU work: idle slices keep it from becoming one long task (the names land a little later)
      this.labels = await runIdleSteps(this.fittedSteps(layout, font!, ocean, ctx.camera.aspect, ctx.services.get("ground")), ctx.signal);
      ctx.signal?.throwIfAborted();
      performance.measure("identity:labels", { start: t0 });
    }
    // the lettering and the heraldry are built in idle slices of their own, never on the tail of the fitting's last one
    await runIdleSteps(this.dressSteps(ctx, layout, lettered ? font : null, sdfTex, atlas, crestTex), ctx.signal);
  }

  /** The chart lettering, the offices' heraldry and the anchorage lights, one construction per step (same order). */
  private *dressSteps(ctx: EngineContext, layout: IdentityLayout, font: ChartFont | null, sdfTex: THREE.Texture | null, atlas: CrestAtlas | null, crestTex: THREE.Texture | null): Generator<void, void> {
    if (font && sdfTex) {
      yield;
      this.lettering = new ChartLettering(this.labels, font, sdfTex, ctx.uniforms, ctx.services.get("ocean"), layout.seaLevel ?? 0);
      ctx.scene.add(this.lettering.mesh);
    }

    if (atlas && crestTex) {
      yield;
      this.atlas = atlas;
      crestTex.anisotropy = 8;
      crestTex.generateMipmaps = true;
      crestTex.minFilter = THREE.LinearMipmapLinearFilter;
      this.dresser = new OfficeDresser(atlas, crestTex, officePlots(layout.civic));
      yield;
      this.flags = new CrestFlags(crestTex, ctx.uniforms);
      ctx.scene.add(this.flags.group);
      // chain-colour beacons and bollards on each harbour's pier head (one instanced draw)
      const ground = ctx.services.get("ground");
      const piers = (layout as { piers?: MarkPier[] }).piers ?? [];
      if (ground && piers.length) {
        yield;
        const ocean = ctx.services.get("ocean");
        const sea = layout.seaLevel ?? 0;
        const sites = markSites(piers, ocean ? (x, z) => ocean.coastAt(x, z) > -5 : undefined)
          .map((m) => ({ ...m, y: ground.heightAt(m.x, m.z) }))
          .filter((m) => m.y > sea + 0.4);
        if (sites.length) { this.marks = new PierMarks(sites, atlas.chains); ctx.scene.add(this.marks.mesh); }
      }
      const labels = () => this.labels;
      const dresser = this.dresser;
      ctx.services.set("identity", { chains: atlas.chains, get labels() { return labels(); }, furl: (chain, k) => dresser.setFurl(chain, k) } satisfies IdentityService);
    }

    // the Far Ports: a buoyed anchorage, its buoys lit at night (steady amber, the island owns the raft-end marks)
    const fp = ctx.services.get("layout")!.zones?.farPorts;
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
    if (this.dresser && !this.scanning && !this.dresser.complete && (this.scanIn -= frame.delta) <= 0) {
      // the offices arrive whenever their placer has loaded them: look twice a second, then less often
      this.scanIn = this.scans++ < 60 ? 0.5 : 3;
      this.scanning = true;
      void this.dresser.scan(ctx.scene, ctx.services.get("preparation")).then((sites) => {
        if (this.disposed) return;
        for (const s of sites) {
          const c = this.atlas!.chains[s.chain];
          this.flags?.add({ x: s.top.x, y: s.top.y, z: s.top.z, rect: c.flag, phase: s.chain.length * 1.7 + s.top.x * 0.01, scale: FLAG_SCALE[s.chain], topmast: FLAG_TOPMAST[s.chain] });
        }
      }).catch((error: unknown) => console.error("[harbour] office dressing failed", error)).finally(() => { this.scanning = false; });
    }
    this.dresser?.setGlow(0.28 * u.uWindowGlow.value);
    if (this.flags) {
      const life = ctx.services.get("life");
      const sky = ctx.services.get("sky");
      const wind = life?.wind ?? sky?.shared?.uWeatherSea?.value.y ?? 0.35;
      const windTo = life?.windTo ?? ([0.84, -0.54] as const);
      const dim = 1 - CREST_NIGHT_DIM * u.uNight.value;
      this.light.setRGB(
        Math.min(1.15, u.uHemiSky.value.r * 1.1 + u.uSunColor.value.r * 0.42) * dim,
        Math.min(1.15, u.uHemiSky.value.g * 1.1 + u.uSunColor.value.g * 0.42) * dim,
        Math.min(1.15, u.uHemiSky.value.b * 1.1 + u.uSunColor.value.b * 0.42) * dim,
      );
      this.flags.farScale = crestFarScale(ctx.rig.distance);
      this.flags.update(frame.delta, !(this.motion?.reduced ?? false), windTo, wind, this.light, CREST_GLOW * u.uWindowGlow.value, ctx.camera.position);
    }
  }

  /**
   * Names placed in their own water with collision avoidance (labels.ts placeLabels): clear of piers and of
   * each other, uncut by the frame edge and not hidden behind the town, in both default views.
   */
  private *fittedSteps(layout: IdentityLayout, font: ChartFont, ocean: OceanService | undefined, aspect: number, ground: GroundService | undefined): Generator<void, LabelSpec[]> {
    const zones = layout.seaZones ?? [];
    const piers = (layout as { piers?: Array<{ segments: Array<{ a: [number, number]; b: [number, number]; width: number }> }> }).piers ?? [];
    const obstacles: FitObstacle[] = piers.flatMap((p) => p.segments.map((g) => ({ a: g.a, b: g.b, halfWidth: g.width / 2 })));
    type Preset = { target: number[]; distance: number; fovDeg: number; pitchDeg: number; yawDeg: number };
    const presets = (layout as { camera?: { presets?: Record<string, Preset> } }).camera?.presets ?? {};
    // the default views' own frames (same maths as the camera rig): the overview must show every name whole;
    // the heart shows its zone names whole or not at all (the open-sea names have faded out by then)
    const view = (p: Preset, want: PlaceView["want"]): PlaceView => {
      const cam = new THREE.PerspectiveCamera(p.fovDeg, THREE.MathUtils.clamp(aspect, 1.25, 2), 1, 10000);
      const yaw = THREE.MathUtils.degToRad(p.yawDeg), pitch = THREE.MathUtils.degToRad(p.pitchDeg);
      const t = new THREE.Vector3(p.target[0], p.target[1], p.target[2]);
      cam.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(p.distance).add(t);
      cam.lookAt(t);
      cam.updateMatrixWorld(true);
      const v = new THREE.Vector3(), projected: [number, number] = [0, 0];
      return {
        eye: [cam.position.x, cam.position.y, cam.position.z],
        want,
        project: (x, y, z) => {
          v.set(x, y, z).project(cam);
          if (v.z > 1) return null;
          projected[0] = v.x; projected[1] = v.y;
          return projected;
        },
      };
    };
    const views: PlaceView[] = [];
    if (presets.overview) views.push(view(presets.overview, { zone: "whole", open: "whole" }));
    if (presets.heart) views.push(view(presets.heart, { zone: "clean" }));
    // line of sight: the island's height field, plus what stands on it outside the island model
    const seaLevel = layout.seaLevel ?? 0;
    const tall = (layout.civic ?? []).map((c) => ({ x: c.position[0], z: c.position[2], hx: c.footprint[0] / 2, hz: c.footprint[1] / 2, r: c.rotationY, h: c.position[1] + (CIVIC_HEIGHT[c.kind] ?? 18) }));
    const pharos = (layout as { pharos?: { position: [number, number, number] } }).pharos?.position;
    const heightAt = ground ? yield* sightGridSteps(ground, tall, pharos) : undefined;
    // anchored hulls, buoys and reef rocks of the sea zones (layout.zones.*: slots/buoys [x, y, z], rocks [x, z, r])
    const crowd: FitObstacle[] = [];
    for (const zv of Object.values((layout as { zones?: Record<string, Record<string, unknown>> }).zones ?? {})) {
      for (const key of ["slots", "buoys"]) for (const q of (Array.isArray(zv[key]) ? zv[key] : []) as number[][]) if (q.length >= 3) crowd.push({ a: [q[0], q[2]], b: [q[0], q[2]], halfWidth: 6 });
      for (const q of (Array.isArray(zv.rocks) ? zv.rocks : []) as number[][]) if (q.length >= 3) crowd.push({ a: [q[0], q[1]], b: [q[0], q[1]], halfWidth: q[2] + 1 });
    }
    return yield* placeLabelSteps(labelSpecs(zones), zones, font, { obstacles, crowd, coastAt: ocean?.coastAt, heightAt, seaLevel, views });
  }

  dispose(ctx: EngineContext): void {
    this.disposed = true;
    if (this.lettering) { ctx.scene.remove(this.lettering.mesh); this.lettering.dispose(); }
    if (this.flags) { ctx.scene.remove(this.flags.group); this.flags.dispose(); }
    this.dresser?.dispose();
    if (this.marks) { ctx.scene.remove(this.marks.mesh); this.marks.dispose(); }
    ctx.services.delete("identity");
  }
}
