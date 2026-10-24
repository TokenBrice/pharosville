/**
 * Analytic picking: no GPU readback, no scene raycast. Boats are tested in screen space against the
 * projected hull→masthead segment (from the sim pose buffer); buildings against their projected
 * base→roof segment; piers and sea areas by a ground-plane ray hit. Cost: one projection per boat
 * per pick (625 → well under 0.1 ms), and picks are throttled to the frame rate by the caller.
 */
import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import type { HarbourLayout, Vec2 } from "../layout/types";
import { pierIdFor } from "../model/classify";
import { CIVIC_PANEL_ID, civicPlots, civicTop, inPlot, inPoly, officeChain, plotFor, seaZones, ZONE_PANEL, type CivicPlot } from "./places";
import { getCove, getGround, getLayout, getSim, getWorldPicking, type GroundLike, type PickHit, type PickingService, type ScreenPoint } from "./services";
import { landmarkHover } from "../world/landmark-hover";
import { yardCoins, yardHullPosition } from "./yard";

/** Landmarks read as areas on the water (polygon / footprint hit), not as buildings. */
const AREA_ZONE: Record<string, string> = { shoals: "shoals", "wreck-cove": "wreckCove", "far-ports": "farPorts" };
/** Purely decorative landmarks are not offered for picking at all (they would only add noise). */
const SKIP = new Set(["breakwater", "tide-gauge"]);
/** Wrecks answer the pointer only from this close (px per m at the cove): further out, the cove zone does. */
const WRECK_MIN_PPM = 3.6;
/** A yard hull's tag height above its cradle (m): small keels, no rig yet. */
const YARD_TOP = 7;

const v = new THREE.Vector3();
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPt = new THREE.Vector3();
const deckPt = new THREE.Vector3();
/** Scratch screen points for pick() (no per-pick allocation). */
const PA: ScreenPoint = { x: 0, y: 0, visible: false }, PB: ScreenPoint = { x: 0, y: 0, visible: false };
/** Above every roof and the lantern: height-field marches start here. */
const SKY_TOP = 80;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}


export class AnalyticPicking implements PickingService {
  private rect = { left: 0, top: 0, width: 1, height: 1 };
  private index = new Map<string, number>();
  private indexIds: readonly string[] | null = null;

  constructor(private readonly ctx: EngineContext) {}

  setHover(): void { /* the analytic picker draws nothing */ }
  setSelected(): void { /* idem */ }

  private get layout(): HarbourLayout | null { return getLayout(this.ctx); }

  private begin(): void {
    const r = this.ctx.renderer.domElement.getBoundingClientRect(), o = this.rect;
    o.left = r.left; o.top = r.top; o.width = r.width || innerWidth; o.height = r.height || innerHeight;
    this.ctx.camera.updateMatrixWorld();
  }

  /** Project world → viewport px. Returns false when behind the camera. */
  private project(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint {
    v.set(x, y, z).project(this.ctx.camera);
    out.x = this.rect.left + ((v.x + 1) / 2) * this.rect.width;
    out.y = this.rect.top + ((1 - v.y) / 2) * this.rect.height;
    out.visible = v.z < 1 && v.x > -1.05 && v.x < 1.05 && v.y > -1.05 && v.y < 1.1;
    return out;
  }

  /** Screen px per world metre at a point. */
  private ppm(x: number, y: number, z: number): number {
    const cam = this.ctx.camera;
    const d = Math.max(1, cam.position.distanceTo(v.set(x, y, z)));
    return this.rect.height / 2 / (d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  }

  private boatIndex(id: string): number {
    const sim = getSim(this.ctx);
    if (!sim) return -1;
    if (sim.pose.ids !== this.indexIds) {
      this.indexIds = sim.pose.ids;
      this.index = new Map(sim.pose.ids.map((b, i) => [b, i]));
    }
    return this.index.get(id) ?? -1;
  }

  private mastTop(i: number): number {
    const sim = getSim(this.ctx), L = this.layout;
    const cls = sim?.model.boats[i]?.hullClass ?? "boat";
    return (L?.deckY ?? 1.2) + (L?.hull.mastAboveDeck[cls] ?? 8);
  }

  pick(clientX: number, clientY: number, boats = true): PickHit | null {
    const L = this.layout;
    if (!L) return null;
    this.begin();
    const a = PA, b = PB;

    // boats: nearest projected hull→masthead segment within the hull's projected half-beam
    const sim = boats ? getSim(this.ctx) : null;
    if (sim) {
      const p = sim.pose, boats = sim.model.boats;
      let best = -1, bestScore = 1;
      for (let i = 0; i < p.count; i++) {
        const x = p.position[i * 3], z = p.position[i * 3 + 2];
        const cls = boats[i]?.hullClass ?? "boat";
        this.project(x, 0.6, z, a);
        if (!a.visible) continue;
        const top = (L.deckY ?? 1.2) + (L.hull.mastAboveDeck[cls] ?? 8);
        this.project(x, top, z, b);
        const ppm = this.ppm(x, 0, z);
        const r = Math.max(7, ((L.hull.loa[cls] ?? 10) * 0.32) * ppm);
        const d = segDist(clientX, clientY, a.x, a.y, b.x, b.y);
        const score = d / r;
        if (score < bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0) return { kind: "boat", id: p.ids[best] };
    }

    // the Shipyard's hulls (when the civic system has placed them): keel → deck-top segment
    if (boats) {
      let yBest: string | null = null, yScore = 1;
      for (const c of yardCoins(this.ctx)) {
        const w = yardHullPosition(this.ctx, c.id);
        if (!w) continue;
        this.project(w[0], w[1], w[2], a);
        if (!a.visible) continue;
        this.project(w[0], w[1] + YARD_TOP, w[2], b);
        const r = Math.max(7, 4.5 * this.ppm(w[0], w[1], w[2]));
        const score = segDist(clientX, clientY, a.x, a.y, b.x, b.y) / r;
        if (score < yScore) { yScore = score; yBest = c.id; }
      }
      if (yBest) return { kind: "yard", id: yBest };
    }

    // Wreck Cove: each dead coin's wreck and memorial post (once the cove is near enough to point at one)
    const cove = boats ? getCove(this.ctx) : null;
    if (cove) {
      let wBest: string | null = null, wScore = 1;
      for (const m of cove.marks) {
        this.project(m.x, m.y + m.top * 0.45, m.z, a);
        if (!a.visible) continue;
        const ppm = this.ppm(m.x, m.y, m.z);
        if (ppm < WRECK_MIN_PPM) continue; // that far out, the cove itself answers
        const r = Math.max(7, (m.memorial ? Math.max(1.4, m.top * 0.4) : Math.max(m.len * 0.42, m.top * 0.6)) * ppm);
        const score = Math.hypot(clientX - a.x, clientY - a.y) / r;
        if (score < wScore) { wScore = score; wBest = m.id; }
      }
      if (wBest) return { kind: "wreck", id: wBest };
    }

    // buildings: projected base→roof segment
    let lmBest: PickHit | null = null, lmScore = 1;
    const plots = civicPlots(L);
    // a civic model stands where the old landmark stood: the plot answers for that id
    const civicIds = new Set(plots.map((pl) => CIVIC_PANEL_ID[pl.kind]).filter(Boolean));
    for (const pl of plots) {
      const [x, y, z] = pl.position;
      this.project(x, y, z, a);
      if (!a.visible) continue;
      this.project(x, y + civicTop(pl.kind), z, b);
      const r = Math.max(10, Math.min(pl.footprint[0], pl.footprint[1]) * 0.42 * this.ppm(x, y, z));
      const score = segDist(clientX, clientY, a.x, a.y, b.x, b.y) / r;
      const hit = this.plotHit(pl);
      if (hit && score < lmScore) { lmScore = score; lmBest = hit; }
    }
    for (const lm of L.landmarks) {
      if (SKIP.has(lm.id) || AREA_ZONE[lm.id] || lm.id.startsWith("hamlet-") || civicIds.has(lm.id)) continue;
      const [x, y, z] = lm.position;
      this.project(x, y, z, a);
      if (!a.visible) continue;
      const top = this.anchorOf(lm.id)?.[1] ?? y + lm.footprint;
      this.project(x, top, z, b);
      const r = Math.max(10, lm.footprint * 0.42 * this.ppm(x, y, z));
      const score = segDist(clientX, clientY, a.x, a.y, b.x, b.y) / r;
      if (score < lmScore) { lmScore = score; lmBest = { kind: "landmark", id: lm.id }; }
    }
    if (lmBest) return lmBest;

    // ground: the surface the ray really meets (island height field: terrain, quays, roofs), then the
    // pier decks. Only a pier deck or a hamlet is that harbour; open water is only ever a sea area.
    const r = this.ctx.renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, this.ctx.camera);
    const ground = getGround(this.ctx);
    const onLand = ground ? this.surface(ray.ray, ground, L.seaLevel, hitPt) : null;
    const tSurface = onLand ? ray.ray.origin.distanceTo(hitPt) : Infinity;
    // pier decks are flat: meet the deck plane, and accept it when nothing solid comes first
    plane.constant = -((L as { quayY?: number }).quayY ?? 2.4);
    if (ray.ray.intersectPlane(plane, deckPt) && ray.ray.origin.distanceTo(deckPt) <= tSurface + 0.5) {
      for (const pier of L.piers) {
        for (const s of pier.segments) {
          if (segDist(deckPt.x, deckPt.z, s.a[0], s.a[1], s.b[0], s.b[1]) <= s.width / 2 + 0.75) return { kind: "harbour", id: pier.chain, at: [deckPt.x, deckPt.y, deckPt.z] };
        }
      }
    }
    if (onLand) {
      const at: [number, number, number] = [hitPt.x, hitPt.y, hitPt.z];
      for (const pl of plots) if (inPlot(pl, hitPt.x, hitPt.z, 2)) { const h = this.plotHit(pl); if (h) return h.kind === "harbour" ? { ...h, at } : h; }
      const hamlets = (L.zones as { hamlets?: Record<string, { centre: Vec2; halfWidth: number }> }).hamlets ?? {};
      for (const [pierId, h] of Object.entries(hamlets)) {
        if (Math.hypot(hitPt.x - h.centre[0], hitPt.z - h.centre[1]) <= h.halfWidth) {
          const pier = L.piers.find((pp) => pp.id === pierId);
          if (pier) return { kind: "harbour", id: pier.chain, at };
        }
      }
      return null;
    }
    plane.constant = -L.seaLevel;
    if (onLand === false || ray.ray.intersectPlane(plane, hitPt)) {
      // the yard's slipways run out into the water
      const yard = plots.find((pl) => pl.kind === "shipyard");
      if (yard && inPlot(yard, hitPt.x, hitPt.z, 4)) return { kind: "landmark", id: "slipway" };
      const zones = seaZones(L);
      if (zones.length) {
        // named water (P6 sea zones): a harbour's water is that harbour; open water opens nothing
        for (const zn of zones) {
          if (zn.kind === "open" || !inPoly(hitPt.x, hitPt.z, zn.polygon)) continue;
          if (zn.kind === "harbour" && zn.chain) return { kind: "harbour", id: zn.chain, at: [hitPt.x, L.seaLevel, hitPt.z] };
          const id = ZONE_PANEL[zn.kind];
          if (id) return { kind: "landmark", id };
        }
        return null;
      }
      for (const [lmId, zoneKey] of Object.entries(AREA_ZONE)) {
        const zone = L.zones[zoneKey] as { polygon?: Vec2[] } | undefined;
        if (zone?.polygon && inPoly(hitPt.x, hitPt.z, zone.polygon)) return { kind: "landmark", id: lmId };
      }
    }
    return null;
  }

  /** What a civic plot opens: a harbour office is its chain's harbour, the rest their panel id. */
  private plotHit(pl: CivicPlot): PickHit | null {
    const chain = officeChain(this.layout, pl.kind);
    if (chain) return { kind: "harbour", id: chain, at: [pl.position[0], pl.position[1] + civicTop(pl.kind) - 3, pl.position[2]] };
    const id = CIVIC_PANEL_ID[pl.kind];
    return id ? { kind: "landmark", id } : null;
  }

  /** A landmark id's anchor and ground point from the P6 layout (civic plot, Pharos, sea-zone label). */
  private placeOf(id: string): { ground: [number, number, number]; top: [number, number, number] } | null {
    const L = this.layout;
    const pl = plotFor(L, id);
    if (pl) {
      const [x, y, z] = pl.position;
      return { ground: [x, y, z], top: [x, y + civicTop(pl.kind), z] };
    }
    const zn = seaZones(L).find((zz) => zz.id === id || ZONE_PANEL[zz.kind] === id);
    if (zn && zn.kind !== "harbour") {
      const [x, z] = zn.labelAnchor, sl = L?.seaLevel ?? 0;
      return { ground: [x, sl, z], top: [x, sl + 6, z] };
    }
    return null;
  }

  /**
   * March a camera ray down through the height field. Returns true (land, `out` = the surface point),
   * false (open water, `out` = the sea-level point) or null (the ray never comes down).
   */
  private surface(r: THREE.Ray, g: GroundLike, seaLevel: number, out: THREE.Vector3): boolean | null {
    const o = r.origin, d = r.direction;
    if (d.y > -1e-4) return null;
    const horiz = Math.max(1e-4, Math.hypot(d.x, d.z));
    const dt = 0.75 / horiz;
    const tSea = (seaLevel - o.y) / d.y;
    for (let t = Math.max(0, (SKY_TOP - o.y) / d.y); t < tSea; t += dt) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const h = g.heightAt(x, z);
      if (h > seaLevel + 0.25 && y <= h) { out.set(x, h, z); return true; }
    }
    out.set(o.x + d.x * tSea, seaLevel, o.z + d.z * tSea);
    return false;
  }

  /** True when the island hides a point from the camera (height-field march toward the eye). */
  private occluded(x: number, y: number, z: number): boolean {
    const g = getGround(this.ctx);
    if (!g) return false;
    const c = this.ctx.camera.position;
    let dx = c.x - x, dy = c.y - y, dz = c.z - z;
    const len = Math.hypot(dx, dy, dz);
    dx /= len; dy /= len; dz /= len;
    if (dy <= 0) return false;
    const horiz = Math.max(1e-4, Math.hypot(dx, dz));
    const dt = 1 / horiz, tEnd = Math.min(len, (SKY_TOP - y) / dy);
    for (let t = dt * 2; t < tEnd; t += dt) {
      if (g.heightAt(x + dx * t, z + dz * t) > y + dy * t + 0.3) return true;
    }
    return false;
  }

  waterline(id: string, out: ScreenPoint = { x: 0, y: 0, visible: false }): ScreenPoint | null {
    const i = this.boatIndex(id), sim = getSim(this.ctx);
    if (i < 0 || !sim) return null;
    this.begin();
    return this.project(sim.pose.position[i * 3], 0.4, sim.pose.position[i * 3 + 2], out);
  }

  hidden(id: string): boolean {
    const i = this.boatIndex(id), sim = getSim(this.ctx), L = this.layout;
    if (i < 0 || !sim || !L) return false;
    const cls = sim.model.boats[i]?.hullClass ?? "boat";
    const y = (L.deckY ?? 1.2) + (L.hull.mastAboveDeck[cls] ?? 8) * 0.3;
    return this.occluded(sim.pose.position[i * 3], y, sim.pose.position[i * 3 + 2]);
  }

  /** A harbour named without a pointer (search, ledger): the point of its pier deck nearest the approach gate. */
  private deckAnchor(chain: string): [number, number, number] | null {
    const L = this.layout;
    const pier = L?.piers.find((p) => p.id === pierIdFor(chain));
    if (!L || !pier) return null;
    let best: [number, number, number] | null = null, bestD = Infinity;
    for (const s of pier.segments) {
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((pier.gate[0] - s.a[0]) * dx + (pier.gate[1] - s.a[1]) * dz) / l2)) : 0;
      const x = s.a[0] + t * dx, z = s.a[1] + t * dz, d = Math.hypot(x - pier.gate[0], z - pier.gate[1]);
      if (d < bestD) { bestD = d; best = [x, (L as { quayY?: number }).quayY ?? 2.4, z]; }
    }
    return best;
  }

  /**
   * The sphere (centre xyz, radius m) a hovered building answers inside (in-world hover), or null for
   * areas on the water (zones, the Shoals, the Far Ports) which have no walls to light.
   */
  hoverSphere(hit: PickHit): [number, number, number, number] | null {
    if (hit.kind !== "landmark") return null;
    const L = this.layout;
    const pl = plotFor(L, hit.id);
    if (pl) {
      const top = civicTop(pl.kind), r = Math.max(pl.footprint[0], pl.footprint[1]) * 0.6;
      return [pl.position[0], pl.position[1] + top * 0.5, pl.position[2], Math.max(r, top * 0.6) + 2];
    }
    if (AREA_ZONE[hit.id] || seaZones(L).some((z) => z.id === hit.id)) return null;
    const lm = L?.landmarks.find((l) => l.id === hit.id);
    if (!lm || lm.footprint > 70) return null;
    // the Pharos: the whole tower, from the island to the lantern
    if (hit.id === "pharos") return [lm.position[0], lm.position[1] + 45, lm.position[2], 62];
    return [lm.position[0], lm.position[1] + lm.footprint * 0.35, lm.position[2], lm.footprint * 0.75 + 2];
  }

  private anchorOf(landmarkId: string): [number, number, number] | null {
    const lab = this.layout?.labels?.find((l) => l.id === landmarkId);
    return lab ? lab.anchor : null;
  }

  worldPosition(hit: PickHit): [number, number, number] | null {
    const L = this.layout;
    if (!L) return null;
    if (hit.kind === "boat") {
      const i = this.boatIndex(hit.id), sim = getSim(this.ctx);
      if (i < 0 || !sim) return null;
      return [sim.pose.position[i * 3], 0, sim.pose.position[i * 3 + 2]];
    }
    if (hit.kind === "yard") {
      const w = yardHullPosition(this.ctx, hit.id);
      if (w) return [w[0], 0, w[2]];
      const yard = plotFor(L, "slipway");
      return yard ? [yard.position[0], 0, yard.position[2]] : null;
    }
    if (hit.kind === "wreck") {
      const m = getCove(this.ctx)?.mark(hit.id);
      if (m) return [m.x, 0, m.z];
      return this.worldPosition({ kind: "landmark", id: "wreck-cove" });
    }
    if (hit.kind === "landmark") {
      const place = this.placeOf(hit.id);
      if (place) return place.ground;
      const lm = L.landmarks.find((l) => l.id === hit.id);
      return lm ? [...lm.position] : null;
    }
    if (hit.at) return [hit.at[0], 0, hit.at[2]];
    const deck = this.deckAnchor(hit.id);
    if (deck) return [deck[0], 0, deck[2]];
    // a chain without a pier lives in the Far Ports
    const far = L.landmarks.find((l) => l.id === "far-ports");
    return far ? [...far.position] : null;
  }

  screenPosition(hit: PickHit, out: ScreenPoint = { x: 0, y: 0, visible: false }): ScreenPoint | null {
    const L = this.layout;
    if (!L) return null;
    this.begin();
    if (hit.kind === "boat") {
      const i = this.boatIndex(hit.id), sim = getSim(this.ctx);
      if (i < 0 || !sim) return null;
      return this.project(sim.pose.position[i * 3], this.mastTop(i) + 1.5, sim.pose.position[i * 3 + 2], out);
    }
    if (hit.kind === "landmark") {
      const lantern = hit.id === "pharos" ? (this.ctx.services.get("lighthouse") as { lanternPosition?: THREE.Vector3 } | undefined)?.lanternPosition : undefined;
      if (lantern) return this.project(lantern.x, lantern.y + 7, lantern.z, out);
      const place = this.placeOf(hit.id);
      if (place) return this.project(place.top[0], place.top[1], place.top[2], out);
      const anchor = this.anchorOf(hit.id);
      if (anchor) return this.project(anchor[0], anchor[1], anchor[2], out);
      const lm = L.landmarks.find((l) => l.id === hit.id);
      return lm ? this.project(lm.position[0], lm.position[1] + 10, lm.position[2], out) : null;
    }
    if (hit.kind === "wreck") {
      const m = getCove(this.ctx)?.mark(hit.id);
      return m ? this.project(m.x, m.y + m.top + 1, m.z, out) : this.screenPosition({ kind: "landmark", id: "wreck-cove" }, out);
    }
    if (hit.kind === "yard") {
      const w = yardHullPosition(this.ctx, hit.id);
      if (w) return this.project(w[0], w[1] + YARD_TOP + 1.5, w[2], out);
      const yard = plotFor(L, "slipway");
      return yard ? this.project(yard.position[0], yard.position[1] + civicTop("shipyard"), yard.position[2], out) : null;
    }
    const at = hit.at ?? this.deckAnchor(hit.id);
    if (at) return this.project(at[0], at[1] + 3, at[2], out);
    const w = this.worldPosition(hit);
    return w ? this.project(w[0], 8, w[2], out) : null;
  }
}

/**
 * The UI picker. Boats come from the fleet's picker when it is registered (exact rendered hulls, and
 * its setHover/setSelected drive the in-world highlight); a miss falls back to the forgiving
 * screen-space test so a 3-px skiff at overview zoom can still be hovered. Landmarks, piers and sea
 * areas always come from the analytic picker (the fleet does not know about piers or areas).
 */
export class UIPicking implements PickingService {
  private readonly own: AnalyticPicking;
  constructor(private readonly ctx: EngineContext) { this.own = new AnalyticPicking(ctx); }

  pick(clientX: number, clientY: number): PickHit | null {
    const world = getWorldPicking(this.ctx);
    if (world) {
      const h = world.pick(clientX, clientY);
      if (h?.kind === "boat") return h;
    }
    return this.own.pick(clientX, clientY);
  }

  screenPosition(hit: PickHit, out: ScreenPoint = { x: 0, y: 0, visible: false }): ScreenPoint | null {
    const world = getWorldPicking(this.ctx);
    if (hit.kind === "boat" && world) {
      const p = world.screenPosition("boat", hit.id);
      if (p.visible || p.x !== 0 || p.y !== 0) { out.x = p.x; out.y = p.y; out.visible = p.visible; return out; }
    }
    return this.own.screenPosition(hit, out);
  }

  worldPosition(hit: PickHit): [number, number, number] | null { return this.own.worldPosition(hit); }
  waterline(id: string, out?: ScreenPoint): ScreenPoint | null { return this.own.waterline(id, out); }
  hidden(id: string): boolean { return this.own.hidden(id); }

  private wreckHover: string | null = null;
  private wreckSelected: string | null = null;
  setHover(hit: PickHit | null): void {
    getWorldPicking(this.ctx)?.setHover(hit?.kind === "boat" ? hit.id : null);
    landmarkHover(this.ctx.uniforms).set(hit ? this.own.hoverSphere(hit) : null);
    this.wreckHover = hit?.kind === "wreck" ? hit.id : null;
    getCove(this.ctx)?.focus(this.wreckHover, this.wreckSelected);
  }
  setSelected(hit: PickHit | null): void {
    getWorldPicking(this.ctx)?.setSelected(hit?.kind === "boat" ? hit.id : null);
    this.wreckSelected = hit?.kind === "wreck" ? hit.id : null;
    getCove(this.ctx)?.focus(this.wreckHover, this.wreckSelected);
  }
}
