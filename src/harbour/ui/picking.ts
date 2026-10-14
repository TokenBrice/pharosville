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
import { getLayout, getSim, getWorldPicking, type PickHit, type PickingService, type ScreenPoint } from "./services";

/** Landmarks read as areas on the water (polygon / footprint hit), not as buildings. */
const AREA_ZONE: Record<string, string> = { shoals: "shoals", "wreck-cove": "wreckCove", "far-ports": "farPorts" };
/** Purely decorative landmarks are not offered for picking at all (they would only add noise). */
const SKIP = new Set(["breakwater", "tide-gauge"]);

const v = new THREE.Vector3();
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPt = new THREE.Vector3();

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inPoly(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
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
    const r = this.ctx.renderer.domElement.getBoundingClientRect();
    this.rect = { left: r.left, top: r.top, width: r.width || innerWidth, height: r.height || innerHeight };
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
    const a: ScreenPoint = { x: 0, y: 0, visible: false }, b: ScreenPoint = { x: 0, y: 0, visible: false };

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

    // buildings: projected base→roof segment
    let lmBest: PickHit | null = null, lmScore = 1;
    for (const lm of L.landmarks) {
      if (SKIP.has(lm.id) || AREA_ZONE[lm.id] || lm.id.startsWith("hamlet-")) continue;
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

    // ground: piers / quays (deck height), then hamlets, then areas on the sea
    const r = this.ctx.renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, this.ctx.camera);
    plane.constant = -((L as { quayY?: number }).quayY ?? 2.4);
    if (ray.ray.intersectPlane(plane, hitPt)) {
      for (const pier of L.piers) {
        for (const s of pier.segments) {
          if (segDist(hitPt.x, hitPt.z, s.a[0], s.a[1], s.b[0], s.b[1]) <= s.width / 2 + 1.5) return { kind: "harbour", id: pier.chain };
        }
      }
      const hamlets = (L.zones as { hamlets?: Record<string, { centre: Vec2; halfWidth: number }> }).hamlets ?? {};
      for (const [pierId, h] of Object.entries(hamlets)) {
        if (Math.hypot(hitPt.x - h.centre[0], hitPt.z - h.centre[1]) <= h.halfWidth * 1.6) {
          const pier = L.piers.find((pp) => pp.id === pierId);
          if (pier) return { kind: "harbour", id: pier.chain };
        }
      }
    }
    plane.constant = -L.seaLevel;
    if (ray.ray.intersectPlane(plane, hitPt)) {
      for (const [lmId, zoneKey] of Object.entries(AREA_ZONE)) {
        const zone = L.zones[zoneKey] as { polygon?: Vec2[] } | undefined;
        if (zone?.polygon && inPoly(hitPt.x, hitPt.z, zone.polygon)) return { kind: "landmark", id: lmId };
      }
    }
    return null;
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
    if (hit.kind === "landmark") {
      const lm = L.landmarks.find((l) => l.id === hit.id);
      return lm ? [...lm.position] : null;
    }
    const pid = pierIdFor(hit.id);
    const lab = L.labels?.find((l) => l.id === "label-" + pid);
    if (lab) return [lab.anchor[0], 0, lab.anchor[2]];
    const pier = L.piers.find((p) => p.id === pid);
    return pier ? [pier.gate[0], 0, pier.gate[1]] : null;
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
      const anchor = this.anchorOf(hit.id);
      if (anchor) return this.project(anchor[0], anchor[1], anchor[2], out);
      const lm = L.landmarks.find((l) => l.id === hit.id);
      return lm ? this.project(lm.position[0], lm.position[1] + 10, lm.position[2], out) : null;
    }
    const lab = L.labels?.find((l) => l.id === "label-" + pierIdFor(hit.id));
    if (lab) return this.project(lab.anchor[0], lab.anchor[1] + 4, lab.anchor[2], out);
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

  setHover(hit: PickHit | null): void { getWorldPicking(this.ctx)?.setHover(hit?.kind === "boat" ? hit.id : null); }
  setSelected(hit: PickHit | null): void { getWorldPicking(this.ctx)?.setSelected(hit?.kind === "boat" ? hit.id : null); }
}
