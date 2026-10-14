import type { ChartFont, GlyphInfo, SeaZone } from "./types";

/**
 * CHART LETTERING (D18), the pure half: which names the sea carries, in what hand, at what size and at
 * which zoom; and the glyph/rule quads that set them on the water. Only sea features are lettered (the
 * harbours are named by their crest flags): sloping (italic) caps, the classic hydrographic convention. "The …" names set
 * the article small on its own line between two short rules.
 */
export type LabelClass = "zone" | "open";
export type Face = "upright" | "italic";

export interface LabelLine { text: string; face: Face; cap: number; track: number; flank?: boolean }

export interface LabelSpec {
  id: string;
  cls: LabelClass;
  lines: LabelLine[];
  anchor: [number, number];
  angle: number;
  /** Baseline curvature: the ends droop by bend × half-width. */
  bend: number;
  /** Camera distance fade band: fade in over [x, y], out over [z, w]. */
  fade: [number, number, number, number];
  /** Ink density 0..1. */
  ink: number;
  /** A thin rule under the name with a compass star at its centre. */
  rule: boolean;
}

/**
 * Anamorphic stretch "up" the chart: like road markings, lettering laid on the water is drawn taller than
 * it reads so the ~26-30° view (foreshortening ≈ sin(pitch) ≈ 0.45-0.5) shows it in true proportion.
 */
export const CHART_STRETCH = 1.85;

/** Display name, in caps. */
export function displayName(z: SeaZone): string {
  return z.name.toUpperCase();
}

/** Width of a line in metres (letter-spaced, no trailing tracking). */
export function lineWidth(text: string, face: Face, cap: number, track: number, font: ChartFont): number {
  const f = font.faces[face], em = cap / f.cap;
  let w = 0, n = 0;
  for (const ch of text) { w += (f.chars[ch]?.adv ?? 0.3) * em; n++; }
  return w + Math.max(0, n - 1) * track * em;
}

const ZONE_CAP: Record<string, number> = { shoals: 15, farPorts: 18, wreckCove: 14, roads: 19 };

export function labelSpecs(zones: readonly SeaZone[]): LabelSpec[] {
  const out: LabelSpec[] = [];
  for (const z of zones) {
    const name = displayName(z);
    if (!name) continue;
    // harbours are named by their crest flags (D17); the water carries the sea features only
    if (z.kind === "harbour") continue;
    const open = z.kind === "open";
    const cap = open ? 22 : ZONE_CAP[z.kind] ?? 15;
    const track = open ? 0.55 : 0.3;
    const lines: LabelLine[] = [];
    const m = /^THE\s+(.+)$/.exec(name);
    if (m) lines.push({ text: "THE", face: "italic", cap: cap * 0.5, track: 0.5, flank: true });
    lines.push({ text: m ? m[1] : name, face: "italic", cap, track });
    out.push({
      id: z.id, cls: open ? "open" : "zone", lines, anchor: z.labelAnchor, angle: z.labelAngle,
      bend: open ? 0.05 : 0.07,
      fade: open ? [600, 760, 1150, 1260] : [240, 360, 1100, 1220],
      ink: open ? 0.6 : 0.95, rule: false,
    });
  }
  return out;
}

// ------------------------------------------------------------------ quads

export interface GlyphQuad {
  /** Corners (x, z) in order: bottom-left, bottom-right, top-right, top-left (reading frame). */
  c: Array<[number, number]>;
  /** Glyph atlas slot, or -1 for a rule (uv = along/across 0..1). */
  slot: number;
}

/** Baselines (label-local v, before the stretch), top line first: the main line's mid cap sits on the anchor. */
function lineBases(spec: LabelSpec): number[] {
  const n = spec.lines.length;
  let base = -spec.lines[n - 1].cap / 2;
  const bases: number[] = new Array(n);
  bases[n - 1] = base;
  for (let i = n - 2; i >= 0; i--) { base += spec.lines[i + 1].cap * 0.55 + spec.lines[i].cap * 1.0; bases[i] = base; }
  return bases;
}

/**
 * Set one label: lines stacked (the first line on top), the block centred on the anchor (the main line's
 * mid cap-height on the anchor), along a gently drooping baseline, then turned to labelAngle.
 */
export function layoutLabel(spec: LabelSpec, font: ChartFont): GlyphQuad[] {
  const quads: GlyphQuad[] = [];
  const rx = Math.cos(spec.angle), rz = -Math.sin(spec.angle);     // reading direction on the water
  const ux = -Math.sin(spec.angle), uz = -Math.cos(spec.angle);    // "up" the chart (away from the viewer)
  const [ax, az] = spec.anchor;
  const toWorld = (u: number, v: number): [number, number] => [ax + rx * u + ux * v * CHART_STRETCH, az + rz * u + uz * v * CHART_STRETCH];

  const main = spec.lines[spec.lines.length - 1];
  const mainW = lineWidth(main.text, main.face, main.cap, main.track, font);
  const half = Math.max(1, mainW / 2);
  const droop = (u: number) => -spec.bend * half * (u / half) ** 2;
  const slope = (u: number) => (-2 * spec.bend * u) / half;

  const pushQuad = (cu: number, cv: number, x0: number, x1: number, y0: number, y1: number, slot: number) => {
    // a quad around (cu, cv) rotated to the local baseline slope
    const v0 = cv + droop(cu), a = Math.atan(slope(cu)), ca = Math.cos(a), sa = Math.sin(a);
    const P = (x: number, y: number) => toWorld(cu + x * ca - y * sa, v0 + x * sa + y * ca);
    quads.push({ c: [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], slot });
  };
  const rule = (u0: number, u1: number, v: number, th: number) => {
    // rules follow the droop in short straight pieces (and stay flat enough to ride the swell)
    const n = Math.max(1, Math.ceil((u1 - u0) / 8));
    for (let i = 0; i < n; i++) {
      const a = u0 + ((u1 - u0) * i) / n, b = u0 + ((u1 - u0) * (i + 1)) / n, m = (a + b) / 2;
      pushQuad(m, v, a - m, b - m, -th / 2, th / 2, -1);
    }
  };

  const bases = lineBases(spec);

  spec.lines.forEach((ln, i) => {
    const f = font.faces[ln.face], em = ln.cap / f.cap, w = lineWidth(ln.text, ln.face, ln.cap, ln.track, font);
    let pen = -w / 2;
    for (const ch of ln.text) {
      const g: GlyphInfo | undefined = f.chars[ch];
      const adv = (g?.adv ?? 0.3) * em;
      if (g && ch !== " ") {
        const cu = pen + adv / 2;
        pushQuad(cu, bases[i], font.quad.x0 * em - adv / 2, font.quad.x1 * em - adv / 2, font.quad.y0 * em, font.quad.y1 * em, g.slot);
      }
      pen += adv + ln.track * em;
    }
    const th = Math.max(0.35, ln.cap * 0.055);
    if (ln.flank) {
      const gap = ln.cap * 0.7, len = ln.cap * 2.2, v = bases[i] + ln.cap * 0.42;
      rule(-w / 2 - gap - len, -w / 2 - gap, v, th);
      rule(w / 2 + gap, w / 2 + gap + len, v, th);
    }
  });

  if (spec.rule) {
    const v = bases[bases.length - 1] - main.cap * 0.5;
    const th = Math.max(0.3, main.cap * 0.032), starR = main.cap * 0.4, gap = starR * 1.3;
    const span = mainW * 0.46;
    rule(-span, -gap, v, th);
    rule(gap, span, v, th);
    // the compass star (build-crests.mjs): centred 0.7 cap right of its pen at mid cap-height, radius 0.75 cap
    const capE = font.faces.upright.cap, emM = starR / (0.75 * capE), cx = 0.7 * capE, cy = 0.5 * capE;
    pushQuad(0, v, (font.quad.x0 - cx) * emM, (font.quad.x1 - cx) * emM, (font.quad.y0 - cy) * emM, (font.quad.y1 - cy) * emM, font.star.slot);
  }
  return quads;
}

// ------------------------------------------------------------------ fitting names into their water

export interface FitObstacle { a: [number, number]; b: [number, number]; halfWidth: number }

function inPoly(x: number, z: number, poly: ReadonlyArray<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polyDist(x: number, z: number, poly: ReadonlyArray<[number, number]>): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, segDist(x, z, { a: poly[j], b: poly[i], halfWidth: 0 }));
  return d;
}

/** Metres of water kept between a name's ink and the shore. */
const COAST_CLEAR = 12;

/**
 * Metres past its zone's edge a name may still count as in its water, at a growing discount: a cove that is
 * mostly beach (Wreck Cove) is named on the water just off it.
 */
const NEAR_ZONE = 60;

function segDist(x: number, z: number, o: FitObstacle): number {
  const dx = o.b[0] - o.a[0], dz = o.b[1] - o.a[1], L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - o.a[0]) * dx + (z - o.a[1]) * dz) / L2));
  return Math.hypot(x - (o.a[0] + dx * t), z - (o.a[1] + dz * t));
}

/** Level to the default camera (π/4) within ±0.35 rad: a chart may follow its water, but must read at a glance. */
export function readableAngle(a: number): number {
  const d = Math.atan2(Math.sin(a - Math.PI / 4), Math.cos(a - Math.PI / 4));
  return Math.PI / 4 + Math.max(-0.35, Math.min(0.35, d));
}

/** A convex quad on the water, (x, z) corners in order. */
export type Footprint = Array<[number, number]>;

/**
 * The water each line of a label covers, plus a margin (metres), as world quads (one per line). Built from
 * the line metrics in the label's own frame, so it holds the italic slant, the flanking rules and the droop.
 */
export function labelFootprint(spec: LabelSpec, font: ChartFont, margin = 0): Footprint[] {
  const rx = Math.cos(spec.angle), rz = -Math.sin(spec.angle), ux = -Math.sin(spec.angle), uz = -Math.cos(spec.angle);
  const [ax, az] = spec.anchor;
  const P = (u: number, v: number): [number, number] => [ax + rx * u + ux * v, az + rz * u + uz * v];
  const main = spec.lines[spec.lines.length - 1];
  const half = Math.max(1, lineWidth(main.text, main.face, main.cap, main.track, font) / 2);
  const bases = lineBases(spec);
  return spec.lines.map((ln, i) => {
    let hw = lineWidth(ln.text, ln.face, ln.cap, ln.track, font) / 2 + (ln.face === "italic" ? ln.cap * 0.18 : 0);
    if (ln.flank) hw += ln.cap * 2.9;
    const droop = spec.bend * half * Math.min(1, (hw / half) ** 2);
    let lo = bases[i] - droop - ln.cap * 0.08;
    const hi = bases[i] + ln.cap * 1.04;
    if (spec.rule && i === spec.lines.length - 1) lo -= ln.cap * 0.95;
    // v is drawn stretched up the chart (CHART_STRETCH); the margin is laid on in true metres
    const v0 = lo * CHART_STRETCH - margin, v1 = hi * CHART_STRETCH + margin, u = hw + margin;
    return [P(-u, v0), P(u, v0), P(u, v1), P(-u, v1)];
  });
}

/** Separating-axis test for two convex polygons. */
function convexOverlap(a: Footprint, b: Footprint): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1], nz = p[0] - q[0];
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const [x, z] of a) { const d = x * nx + z * nz; aMin = Math.min(aMin, d); aMax = Math.max(aMax, d); }
      for (const [x, z] of b) { const d = x * nx + z * nz; bMin = Math.min(bMin, d); bMax = Math.max(bMax, d); }
      if (aMax <= bMin || bMax <= aMin) return false;
    }
  }
  return true;
}

/** Do two labels' footprints touch? */
export function footprintsOverlap(a: readonly Footprint[], b: readonly Footprint[]): boolean {
  for (const x of a) for (const y of b) if (convexOverlap(x, y)) return true;
  return false;
}

/**
 * A camera the names should read from: projection of a world point to NDC (null behind the eye), the eye
 * (for line of sight) and, per label class, what this view asks: "whole" (on screen, uncut), "clean" (on
 * screen uncut OR wholly off it, never cut by the frame edge). Classes absent are not judged in this view.
 */
export interface PlaceView {
  project(x: number, y: number, z: number): [number, number] | null;
  eye: [number, number, number];
  want: Partial<Record<LabelClass, "whole" | "clean">>;
  /** NDC frame the names keep inside (default |x| < 0.92, -0.88 < y < 0.62: clear of the frame edges, up to the far haze). */
  frame?: { x: number; yMin: number; yMax: number };
  /** Beyond this NDC a name is off the view, not cut by it (default |x| > 1, y < -1, y > 0.68: at the horizon). */
  off?: { x: number; yMin: number; yMax: number };
}

export interface PlaceEnv {
  /** Piers, moles: names keep clear. */
  obstacles?: readonly FitObstacle[] | undefined;
  /** Signed distance to the coast (m, + at sea). */
  coastAt?: ((x: number, z: number) => number) | undefined;
  /** Tallest surface (terrain, buildings, towers) for line of sight; omit to skip occlusion. */
  heightAt?: ((x: number, z: number) => number) | undefined;
  seaLevel?: number | undefined;
  views?: readonly PlaceView[] | undefined;
  /** Draw the names toward (weight > 0) or away from (weight < 0) a point. */
  pull?: { at: [number, number]; weight: number } | undefined;
  /** Anchored boats, buoys and reef rocks: names would rather print on clear water beside them (soft). */
  crowd?: readonly FitObstacle[] | undefined;
  /** Gap kept between two names, as a fraction of the larger main cap. */
  gap?: number | undefined;
}

/** Who keeps their place when two names want the same water. */
export const ZONE_PRIORITY: Record<string, number> = { roads: 5, shoals: 5, wreckCove: 4, farPorts: 4, open: 1 };

/**
 * Below this fit a placement is not the name's own water (half on land, across a pier, out of its zone).
 * Being off a default view's frame or behind a hill from it is only a preference: the camera can go there.
 */
const MIN_FIT = 0.5;
/** Placements tried per name before it is given up as having no room. */
const MAX_TRIES = 160;

/** score: everything weighed; fit: the name's own-water part only (in its zone, clear of land and piers). */
interface Candidate { spec: LabelSpec; score: number; fit: number }

const MASKS = new WeakMap<readonly FitObstacle[], (x: number, z: number) => boolean>();

/** "Within 3 m of a pier or mole", rasterised once (1.5 m cells) for O(1) lookups. */
function obstacleMask(obs: readonly FitObstacle[]): (x: number, z: number) => boolean {
  const hit = MASKS.get(obs);
  if (hit) return hit;
  const C = 1.5;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const o of obs) {
    const r = o.halfWidth + 3;
    x0 = Math.min(x0, o.a[0] - r, o.b[0] - r); x1 = Math.max(x1, o.a[0] + r, o.b[0] + r);
    z0 = Math.min(z0, o.a[1] - r, o.b[1] - r); z1 = Math.max(z1, o.a[1] + r, o.b[1] + r);
  }
  const nx = Math.ceil((x1 - x0) / C) + 1, nz = Math.ceil((z1 - z0) / C) + 1, g = new Uint8Array(nx * nz);
  for (const o of obs) {
    const r = o.halfWidth + 3;
    const i0 = Math.floor((Math.min(o.a[0], o.b[0]) - r - x0) / C), i1 = Math.ceil((Math.max(o.a[0], o.b[0]) + r - x0) / C);
    const j0 = Math.floor((Math.min(o.a[1], o.b[1]) - r - z0) / C), j1 = Math.ceil((Math.max(o.a[1], o.b[1]) + r - z0) / C);
    for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
      if (!g[j * nx + i] && segDist(x0 + (i + 0.5) * C, z0 + (j + 0.5) * C, o) < r) g[j * nx + i] = 1;
    }
  }
  const f = (x: number, z: number) => {
    const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C);
    return i >= 0 && j >= 0 && i < nx && j < nz && g[j * nx + i] === 1;
  };
  MASKS.set(obs, f);
  return f;
}

/** Line-of-sight test from a point on the water to the eye, through the height field. */
function makeOccluded(view: PlaceView, heightAt: (x: number, z: number) => number, sea: number): (x: number, z: number) => boolean {
  const cache = new Map<number, boolean>();
  const [ex, ey, ez] = view.eye;
  return (x, z) => {
    const kx = Math.round(x / 2), kz = Math.round(z / 2), key = kx * 100003 + kz;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const px = kx * 2, pz = kz * 2, py = sea + 0.5;
    const hd = Math.hypot(ex - px, ez - pz) || 1;
    const rise = (ey - py) / hd;
    let occ = false;
    // walk toward the eye until the sight line clears anything the island can raise (~140 m)
    const reach = Math.min(hd, (140 - py) / Math.max(rise, 1e-3));
    for (let d = 3; d < reach; d += 3) {
      const t = d / hd;
      if (heightAt(px + (ex - px) * t, pz + (ez - pz) * t) > py + rise * d) { occ = true; break; }
    }
    cache.set(key, occ);
    return occ;
  };
}

/**
 * Every placement of one name worth considering, best first (lazily): slid (and if need be shrunk) within its own
 * water. A candidate is judged on its glyph ink (3×3 samples per glyph): inside the zone polygon, clear of
 * piers, moles and the coast, and, in each view, on screen as that view wants it and not hidden behind land.
 */
export function rankPlacements(spec: LabelSpec, zone: SeaZone, font: ChartFont, env: PlaceEnv = {}): Generator<Candidate> {
  const base = { ...spec, angle: readableAngle(spec.angle) };
  const rx = Math.cos(base.angle), rz = -Math.sin(base.angle), ux = -Math.sin(base.angle), uz = -Math.cos(base.angle);
  const main = spec.lines[spec.lines.length - 1];
  const W = lineWidth(main.text, main.face, main.cap, main.track, font);
  const sea = env.seaLevel ?? 0;
  const views = (env.views ?? []).filter((v) => v.want[spec.cls]);
  const occluded = env.heightAt ? views.map((v) => makeOccluded(v, env.heightAt!, sea)) : [];
  const nearPier = env.obstacles?.length ? obstacleMask(env.obstacles) : null;
  const crowded = env.crowd?.length ? obstacleMask(env.crowd) : null;

  // fine: 3×3 samples over each glyph's ink and the line of sight; coarse: the ink centre only, no sight test
  const FINE = [0.3, 0.45, 0.6].flatMap((s) => [0.3, 0.45, 0.62].map((t) => [s, t] as const));
  const COARSE = [[0.3, 0.3] as const, [0.6, 0.62] as const];
  const judge = (cand: LabelSpec, du: number, dv: number, k: number, fine: boolean): { score: number; fit: number } => {
    let inside = 0, clash = 0, busy = 0, n = 0;
    const inF = views.map(() => 0), offF = views.map(() => 0), occ = views.map(() => 0);
    for (const q of layoutLabel(cand, font)) {
      if (q.slot < 0) continue;
      for (const [s, t] of fine ? FINE : COARSE) {
        const bx = q.c[0][0] + (q.c[1][0] - q.c[0][0]) * s, bz = q.c[0][1] + (q.c[1][1] - q.c[0][1]) * s;
        const x = bx + (q.c[3][0] + (q.c[2][0] - q.c[3][0]) * s - bx) * t, z = bz + (q.c[3][1] + (q.c[2][1] - q.c[3][1]) * s - bz) * t;
        n++;
        // a zone's name may spill a little past its edge (a cove at a frame edge reads from the water beside it)
        if (inPoly(x, z, zone.polygon)) inside++;
        else { const d = polyDist(x, z, zone.polygon); if (d < NEAR_ZONE) inside += 0.85 - 0.45 * (d / NEAR_ZONE); }
        // clear of the coast (what hides behind hills and town from the default views is the sight test's job)
        if (env.coastAt && env.coastAt(x, z) < COAST_CLEAR) clash++;
        else if (nearPier?.(x, z)) clash++;
        if (crowded?.(x, z)) busy++;
        for (let vi = 0; vi < views.length; vi++) {
          const v = views[vi], p = v.project(x, sea, z), f = v.frame ?? SAFE, o = v.off ?? OFF;
          if (!p || Math.abs(p[0]) > o.x || p[1] < o.yMin || p[1] > o.yMax) { offF[vi]++; continue; }
          if (Math.abs(p[0]) > f.x || p[1] < f.yMin || p[1] > f.yMax) continue;
          inF[vi]++;
          if (fine && occluded[vi]?.(x, z)) occ[vi]++;
        }
      }
    }
    if (!n) return { score: -Infinity, fit: -Infinity };
    // the open-sea names are about broad water: their zone bounds are a hint, the land is the rule
    const fit = (spec.cls === "open" ? 0.3 + 0.7 * (inside / n) : inside / n) - (clash / n) * 2.5;
    // print over a crowd of hulls reads poorly: clear water beside them is better, where there is any
    let score = fit - (busy / n) * 1.2 - (1 - k) * 0.35 - (Math.hypot(du, dv) / 400) * 0.1;
    views.forEach((v, vi) => {
      const f = inF[vi] / n, off = offF[vi] / n, edge = 1 - f - off;
      // never cut by the frame edge; "whole" would rather be on screen, but wholly off beats cut
      // a single clipped letter is as wrong as many: a cut costs a step, then more the deeper it goes
      const cut = edge + Math.min(f, off);
      score -= (cut > 0 ? 0.6 + cut * 3 : 0) + (v.want[spec.cls] === "whole" ? off * 0.5 : 0);
      // hidden behind the town, a hill or the Pharos: one lost letter costs a step, as a cut does
      score -= occ[vi] ? 0.5 + (occ[vi] / n) * 2 : 0;
    });
    if (env.pull) score -= (Math.hypot(cand.anchor[0] - env.pull.at[0], cand.anchor[1] - env.pull.at[1]) / 100) * env.pull.weight;
    return { score, fit };
  };

  const all: Array<Candidate & { du: number; dv: number; k: number }> = [];
  for (const k of [1, 0.88, 0.76]) {
    const lines = spec.lines.map((l) => ({ ...l, cap: l.cap * k }));
    if (lines[lines.length - 1].cap < 6.5) continue;
    for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) {
      const du = (i / 5) * W * 0.9, dv = (j / 5) * Math.max(main.cap * 7, 130);
      const anchor: [number, number] = [spec.anchor[0] + rx * du + ux * dv, spec.anchor[1] + rz * du + uz * dv];
      const cand: LabelSpec = { ...base, lines, anchor };
      all.push({ spec: cand, ...judge(cand, du, dv, k, false), du, dv, k });
    }
  }
  all.sort((a, b) => b.score - a.score);
  // The coarse pass ranks every placement; fine judgement (which only ever finds more wrong: hidden ink,
  // clipped serifs) runs lazily, a batch at a time, until the best judged placement beats every unjudged one.
  const judged: Candidate[] = [];
  let next = 0;
  return (function* () {
    for (;;) {
      const bound = next < all.length ? all[next].score : -Infinity;
      // (past a few batches the coarse order is trusted: deep in the list nothing scores well anyway)
      if (judged.length && (judged[0].score >= bound - FINE_SLACK || next >= FINE_BATCH * 4)) { yield judged.shift()!; continue; }
      if (next >= all.length) return;
      for (const c of all.slice(next, next + FINE_BATCH)) judged.push({ spec: c.spec, ...judge(c.spec, c.du, c.dv, c.k, true) });
      next += FINE_BATCH;
      judged.sort((a, b) => b.score - a.score);
    }
  })();
}

const SAFE = { x: 0.92, yMin: -0.88, yMax: 0.62 };
const OFF = { x: 1, yMin: -1, yMax: 0.68 };

/** Lazy fine judgement: batch size, and how far a coarse score may overrate its fine one. */
const FINE_BATCH = 24;
const FINE_SLACK = 0.25;

/** The single best placement for one name, ignoring every other name. */
export function fitLabel(spec: LabelSpec, zone: SeaZone, font: ChartFont, env: PlaceEnv = {}): LabelSpec {
  return rankPlacements(spec, zone, font, env).next().value?.spec ?? spec;
}

/**
 * Place every name with collision avoidance. Names go down in priority order (zone importance, then the
 * larger name); each takes its best placement whose footprint (plus a gap) clears every name already set.
 * A name with no clear placement in its own water (fit ≥ MIN_FIT) is not printed. The footprints are on the water
 * plane, so names apart on the water stay apart on screen at every zoom and from every bearing.
 */
export function placeLabels(specs: readonly LabelSpec[], zones: readonly SeaZone[], font: ChartFont, env: PlaceEnv = {}): LabelSpec[] {
  const prio = (s: LabelSpec) => ZONE_PRIORITY[zones.find((z) => z.id === s.id)?.kind ?? "open"] ?? 1;
  const order = [...specs].sort((a, b) => prio(b) - prio(a) || b.lines[b.lines.length - 1].cap - a.lines[a.lines.length - 1].cap || a.id.localeCompare(b.id));
  const gap = env.gap ?? 0.35;
  const placed: Array<{ spec: LabelSpec; foot: Footprint[] }> = [];
  for (const spec of order) {
    const zone = zones.find((z) => z.id === spec.id);
    if (!zone) continue;
    let tries = 0;
    for (const c of rankPlacements(spec, zone, font, env)) {
      if (++tries > MAX_TRIES) break;
      if (c.fit < MIN_FIT) continue;
      const cap = c.spec.lines[c.spec.lines.length - 1].cap;
      // each side keeps half the gap, scaled to its own name
      const foot = labelFootprint(c.spec, font, (gap * cap) / 2);
      if (placed.some((p) => footprintsOverlap(p.foot, foot))) continue;
      placed.push({ spec: c.spec, foot });
      break;
    }
  }
  // back in the caller's order
  return specs.flatMap((s) => placed.filter((p) => p.spec.id === s.id).map((p) => p.spec));
}
