import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { IdentityService } from "../identity/identity-system";
import type { OfficeState } from "../readings/bind";
import { ensureMotionService, type MotionService } from "../ui/services";
import { getHarbourMaterials } from "../world/materials";
import { CIVIC_BASE, type CivicManifest } from "./assemble";

/**
 * T6 chain offices read the month (readings.offices: /api/chains change30dPct, works ≥ +8 % held to +6 %, furled
 * ≤ −8 % held to −6 %, neutral whenever the endpoint is not current — readings/bind.ts officeWorks):
 *   works   the office-works kit (public/harbour/civic/office-works.glb, scripts/harbour/blender/civic/
 *           cv_office_works.py) stands against one flank of the office (manifest anchors.flank.<chain>): timber
 *           scaffold, a treadwheel hoist that turns slowly, ashlar stacks, a half-built bay;
 *   furled  the office's chain-colour awning rolls back to ~30 % of its depth (identity/offices.ts setFurl);
 *   neutral as built.
 * Changes ease over EASE_SEC (the scaffold rises from the ground, the awning rolls); on the first reading and under
 * reduced motion they are simply there, and the treadwheel stands still. ~1k tris and 3 draws per office under works.
 */
const EASE_SEC = 3;
/** The treadwheel's turn (rad/s): a walker's pace, slow. */
const WHEEL_RATE = 0.3;
/** REVIEW #7: the kit stands a quarter larger than built (scaffold ~11 m, up past the eaves), so works read at heart. */
const KIT_SCALE = 1.25;
const slugOf = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

interface CivicPlots { readonly plots?: ReadonlyMap<string, { kind: string; root: THREE.Object3D }> }
interface OfficeReadings { readonly version: number; readonly offices: Readonly<Record<string, OfficeState>> }

interface Site { chain: string; group: THREE.Group; wheel: THREE.Object3D | null; works: number; furl: number }

export class OfficeWorksSystem implements WorldSystem {
  readonly name = "office-works";
  private state: "wait" | "loading" | "ready" | "off" = "wait";
  private readonly sites = new Map<string, Site>();
  private motion: MotionService | null = null;
  private primed = false;

  init(ctx: EngineContext): void { this.motion = ensureMotionService(ctx); }

  private async load(ctx: EngineContext, plots: NonNullable<CivicPlots["plots"]>): Promise<void> {
    this.state = "loading";
    try {
      const r = await fetch(CIVIC_BASE + "manifest.json");
      const spec = ((await r.json()) as CivicManifest).kinds["office-works"];
      const flank = (spec?.anchors?.flank ?? {}) as Record<string, { pos: [number, number, number]; rotY: number }>;
      if (!spec) { this.state = "off"; return; }
      const src = (await ctx.assets.gltf(CIVIC_BASE + spec.file)).scene;
      getHarbourMaterials(ctx).apply(src);
      // the wheel turns about its axle: re-pivot it on the manifest origin (the material port baked it in place)
      const axle = spec.nodes.find((n) => n.name === "works_wheel")?.origin;
      const w0 = src.getObjectByName("works_wheel") as THREE.Mesh | undefined;
      if (w0?.isMesh && axle && w0.position.lengthSq() === 0) {
        w0.geometry.translate(-axle[0], -axle[1], -axle[2]);
        w0.position.set(axle[0], axle[1], axle[2]);
      }
      src.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = m.name === "works_body"; m.receiveShadow = true; } });
      for (const p of plots.values()) {
        if (!p.kind.startsWith("harbour-office:")) continue;
        const chain = p.kind.slice("harbour-office:".length), f = flank[chain];
        if (!f) continue;
        const group = new THREE.Group();
        group.name = `office-works-${chain}`;
        group.position.set(f.pos[0], f.pos[1], f.pos[2]);
        group.rotation.y = f.rotY;
        const kit = src.clone(true);
        group.add(kit);
        group.visible = false;
        p.root.add(group);
        this.sites.set(chain, { chain, group, wheel: kit.getObjectByName("works_wheel") ?? null, works: 0, furl: 0 });
      }
      this.state = "ready";
    } catch (e) {
      console.warn("[harbour] office works unavailable", e);
      this.state = "off";
    }
  }

  update(frame: FrameState, ctx: EngineContext): void {
    if (this.state === "wait") {
      const plots = (ctx.services.get("civic") as CivicPlots | undefined)?.plots;
      if (plots && [...plots.values()].some((p) => p.kind.startsWith("harbour-office:"))) void this.load(ctx, plots);
      return;
    }
    if (this.state !== "ready") return;
    const readings = ctx.services.get("readings") as OfficeReadings | undefined;
    if (!readings || readings.version <= 0) return;
    const want = new Map<string, OfficeState>();
    for (const [name, st] of Object.entries(readings.offices)) want.set(slugOf(name), st);
    const reduced = this.motion?.reduced ?? false;
    const instant = reduced || !this.primed;
    this.primed = true;
    const step = frame.delta / EASE_SEC;
    const identity = ctx.services.get("identity") as IdentityService | undefined;
    for (const s of this.sites.values()) {
      const st = want.get(s.chain) ?? "neutral";
      const wT = st === "works" ? 1 : 0, fT = st === "furled" ? 1 : 0;
      s.works = instant ? wT : wT > s.works ? Math.min(1, s.works + step) : Math.max(0, s.works - step);
      s.furl = instant ? fT : fT > s.furl ? Math.min(1, s.furl + step) : Math.max(0, s.furl - step);
      const we = s.works * s.works * (3 - 2 * s.works);
      s.group.visible = we > 0.001;
      s.group.scale.set(KIT_SCALE, KIT_SCALE * Math.max(0.001, we), KIT_SCALE);
      if (s.wheel && s.group.visible && !reduced) s.wheel.rotation.x += WHEEL_RATE * frame.delta;
      identity?.furl(s.chain, s.furl * s.furl * (3 - 2 * s.furl));
    }
  }

  dispose(): void {
    for (const s of this.sites.values()) s.group.removeFromParent();
    this.sites.clear();
  }
}
