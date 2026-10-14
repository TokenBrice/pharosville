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

  // baselines, top line first: the main line's mid cap sits on the anchor
  let base = -main.cap / 2;
  const bases: number[] = new Array(spec.lines.length);
  bases[spec.lines.length - 1] = base;
  for (let i = spec.lines.length - 2; i >= 0; i--) { base += spec.lines[i + 1].cap * 0.55 + spec.lines[i].cap * 1.0; bases[i] = base; }

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

/**
 * Slide (and if need be shrink) each name so it lies in its own water: glyphs inside the zone polygon,
 * clear of piers, moles and the coast, inside the overview frame, drawn gently toward a pull point.
 * Grid search; deterministic.
 */
export function fitLabel(spec: LabelSpec, zone: SeaZone, font: ChartFont, obstacles: readonly FitObstacle[], pull?: { at: [number, number]; weight: number }, coastAt?: (x: number, z: number) => number, inFrame?: (x: number, z: number) => boolean): LabelSpec {
  const base = { ...spec, angle: readableAngle(spec.angle) };
  const rx = Math.cos(base.angle), rz = -Math.sin(base.angle), ux = -Math.sin(base.angle), uz = -Math.cos(base.angle);
  const main = spec.lines[spec.lines.length - 1];
  const W = lineWidth(main.text, main.face, main.cap, main.track, font);
  let best = base, bestScore = -Infinity;
  const scales = [1, 0.9];
  for (const k of scales) {
    const lines = spec.lines.map((l) => ({ ...l, cap: l.cap * k }));
    if (lines[lines.length - 1].cap < 6.5) continue;
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
      const du = (i / 6) * W * 0.7, dv = (j / 6) * Math.max(main.cap * 5, 90);
      const anchor: [number, number] = [spec.anchor[0] + rx * du + ux * dv, spec.anchor[1] + rz * du + uz * dv];
      const cand: LabelSpec = { ...base, lines, anchor };
      const quads = layoutLabel(cand, font);
      let inside = 0, clash = 0, out = 0, n = 0;
      for (const q of quads) {
        if (q.slot < 0) continue;
        // the inked part of a glyph is the middle of its cell: sample a 3×3 grid there
        const at = (s: number, t: number): [number, number] => {
          const bx = q.c[0][0] + (q.c[1][0] - q.c[0][0]) * s, bz = q.c[0][1] + (q.c[1][1] - q.c[0][1]) * s;
          const tx = q.c[3][0] + (q.c[2][0] - q.c[3][0]) * s, tz = q.c[3][1] + (q.c[2][1] - q.c[3][1]) * s;
          return [bx + (tx - bx) * t, bz + (tz - bz) * t];
        };
        for (const [x, z] of [0.3, 0.45, 0.6].flatMap((s) => [0.3, 0.45, 0.62].map((t) => at(s, t)))) {
          n++;
          if (inPoly(x, z, zone.polygon)) inside++;
          if (inFrame && !inFrame(x, z)) out++;
          // well clear of the coast: in perspective, hills and town hide anything that hugs the shore
          if (coastAt && coastAt(x, z) < 24) { clash++; continue; }
          for (const o of obstacles) if (segDist(x, z, o) < o.halfWidth + 3) { clash++; break; }
        }
      }
      if (!n) continue;
      let score = inside / n - (clash / n) * 2.5 - (out / n) * 0.9 - (1 - k) * 0.35 - (Math.hypot(du, dv) / 400) * 0.1;
      if (pull) score -= (Math.hypot(anchor[0] - pull.at[0], anchor[1] - pull.at[1]) / 100) * pull.weight;
      if (score > bestScore) { bestScore = score; best = cand; }
    }
  }
  return best;
}
