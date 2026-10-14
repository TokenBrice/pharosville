/**
 * Hull footprint audit in the real harbour (layout.json + the baked sea SDF): every hull's outline
 * (bow, stern and beam stations by LOA/beam) is sampled against the island's real coast and the pier
 * decks over water, at every pose of a timed sweep. No hull may ever be on land or over a deck.
 *
 * CI runs a short sweep on the synthetic fleet. A long audit on the real fleet (outputs/harbour/data,
 * when present) runs with HARBOUR_AUDIT_HOURS=8 (and HARBOUR_AUDIT_STEP=1) and prints its findings.
 */
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import layoutJson from "../data/layout.json";
import type { HarbourLayout, Vec2 } from "../layout/types";
import { buildHarbourModel } from "../model/build";
import type { HarbourPayloads } from "../model/types";
import { clearance, coastDistance, hullHalfWidth, type CoastGrid } from "./obstacles";
import { HarbourSim, PHASES, PH_APPROACHING, PH_CASTING_OFF, PH_SAILING } from "./sim";
import { makePayloads, T0_MS } from "./test-fixtures";

const layout = layoutJson as unknown as HarbourLayout;
const root = new URL("../../../", import.meta.url).pathname;

/** Minimal PNG reader (8-bit RGB/RGBA, non-interlaced): the R channel, rows from minZ. */
function readCoast(path: string, bounds: [number, number, number, number]): CoastGrid {
  const buf = readFileSync(path);
  let off = 8, w = 0, h = 0, ct = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); ct = body[9]; }
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const img = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? img[y * stride + x - bpp] : 0, b = y > 0 ? img[(y - 1) * stride + x] : 0, c = x >= bpp && y > 0 ? img[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      img[y * stride + x] = v & 255;
    }
  }
  const data = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[j * w + i] = img[(h - 1 - j) * stride + i * bpp];
  return { data, size: w, bounds };
}

const coast = readCoast(`${root}assets/harbour/sea-sdf.png`, layout.sea!.bounds as [number, number, number, number]);

/** Decks over water (a quay is coast in the SDF): pier segments and Far Ports pontoons, capsules a-b of half-width w/2. */
const decks: Array<{ a: Vec2; b: Vec2; hw: number }> = [];
for (const p of layout.piers) for (const s of p.segments ?? []) if (s.kind !== "quay") decks.push({ a: s.a, b: s.b, hw: s.width / 2 });
for (const row of layout.zones?.farPorts?.rows ?? []) for (let i = 1; i < (row.line?.length ?? 0); i++) decks.push({ a: row.line[i - 1], b: row.line[i], hw: 1.4 });
// decks bucketed on a 10 m grid (each in every cell it reaches)
const deckCells = new Map<number, number[]>();
decks.forEach((d, k) => {
  for (let i = Math.floor((Math.min(d.a[0], d.b[0]) - d.hw) / 10); i <= Math.floor((Math.max(d.a[0], d.b[0]) + d.hw) / 10); i++)
    for (let j = Math.floor((Math.min(d.a[1], d.b[1]) - d.hw) / 10); j <= Math.floor((Math.max(d.a[1], d.b[1]) + d.hw) / 10); j++)
      (deckCells.get(i * 4096 + j) ?? deckCells.set(i * 4096 + j, []).get(i * 4096 + j)!).push(k);
});
const deckDepth = (x: number, z: number): number => {
  let worst = -Infinity;
  for (const k of deckCells.get(Math.floor(x / 10) * 4096 + Math.floor(z / 10)) ?? []) {
    const d = decks[k];
    const dx = d.b[0] - d.a[0], dz = d.b[1] - d.a[1], l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - d.a[0]) * dx + (z - d.a[1]) * dz) / l2)) : 0;
    const v = d.hw - Math.hypot(x - d.a[0] - dx * t, z - d.a[1] - dz * t);
    if (v > worst) worst = v;
  }
  return worst;
};

/** Hull outline stations: [along (× LOA), across (× beam)], stern to bow every ~0.5 m, centre line and both sides. */
const stationCache = new Map<number, Array<[number, number]>>();
const stationsFor = (loa: number): Array<[number, number]> => {
  const hit = stationCache.get(loa);
  if (hit) return hit;
  const out: Array<[number, number]> = [];
  stationCache.set(loa, out);
  const k = Math.ceil(loa / 0.5);
  for (let i = 0; i <= k; i++) {
    const t = i / k - 0.5, w = hullHalfWidth(t);
    out.push([t, 0], [t, w], [t, -w]);
  }
  return out;
};

function realPayloads(nowMs: number): HarbourPayloads | null {
  const dir = `${root}outputs/harbour/data/`;
  const files = { stablecoins: "stablecoins", chains: "chains", stability: "stability-index", pegSummary: "peg-summary", stress: "stress-signals", safetyGrades: "safety-grades", mintBurn: "mint-burn-flows" } as const;
  if (!existsSync(dir + "stablecoins.json")) return null;
  const meta = { updatedAt: Math.floor(nowMs / 1000) - 120, ageSeconds: 120, status: "fresh" as const };
  const out: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(files)) {
    const data = JSON.parse(readFileSync(`${dir}${f}.json`, "utf8")) as Record<string, unknown>;
    delete data._meta;
    out[k] = { data, meta, fetchedAtMs: nowMs };
  }
  return out as unknown as HarbourPayloads;
}

/**
 * Fender contact: a bow resting against the quay or pontoon it is made fast to may read a few
 * centimetres "in" (the coast SDF holds 0.5 m per 8-bit level). Anything deeper is a hull on land or
 * over a deck.
 */
const TOL = 0.1;
/** A hull lying at her berth, bow to the quay: up to half an SDF level (0.25 m) of "in" is fender contact. */
const TOL_BERTHED = 0.25;

interface Hit { t: number; id: string; cls: string; phase: string; slot: string; x: number; z: number; depth: number }

/** Sweep [t0, t0 + hours) every `step` s; returns hull-samples, under-way samples, land and deck hits. */
function audit(sim: HarbourSim, t0: number, hours: number, step: number) {
  const L = sim.layout, model = sim.model, n = model.boats.length;
  const loa = model.boats.map((b) => L.loa[b.hullClass]), beam = model.boats.map((b) => L.beam[b.hullClass]);
  const land: Hit[] = [], deck: Hit[] = [];
  let samples = 0, underWay = 0;
  for (let s = 0; s < hours * 3600; s += step) {
    const p = sim.poseAt(t0 + s * 1000);
    for (let i = 0; i < n; i++) {
      const ph = p.phase[i];
      const slot = p.slot[i] >= 0 ? L.slots[p.slot[i]] : null;
      if (slot?.kind === "wreck" && ph !== PH_SAILING && ph !== PH_APPROACHING && ph !== PH_CASTING_OFF) continue; // beached on purpose
      const x = p.position[i * 3], z = p.position[i * 3 + 2], h = p.heading[i];
      samples++;
      if (ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING) underWay++;
      // nothing to touch within reach (the field also holds every deck over water)
      if (L.field && clearance(L.field, x, z) > loa[i] / 2 + 4) continue;
      const fx = Math.sin(h), fz = Math.cos(h);
      let lw = 0, dw = 0, lx = 0, lz = 0, dx = 0, dz = 0;
      for (const [a, c] of stationsFor(loa[i])) {
        const qx = x + fx * loa[i] * a - fz * beam[i] * c, qz = z + fz * loa[i] * a + fx * beam[i] * c;
        const cd = -coastDistance(coast, qx, qz);
        if (cd > lw) { lw = cd; lx = qx; lz = qz; }
        const dd = deckDepth(qx, qz);
        if (dd > dw) { dw = dd; dx = qx; dz = qz; }
      }
      const base = { t: t0 + s * 1000, id: model.boats[i].id, cls: model.boats[i].hullClass, phase: PHASES[ph], slot: slot?.id ?? "-" };
      if (lw > (ph === PH_SAILING || ph === PH_APPROACHING || ph === PH_CASTING_OFF ? TOL : TOL_BERTHED)) land.push({ ...base, x: lx, z: lz, depth: lw });
      if (dw > TOL) deck.push({ ...base, x: dx, z: dz, depth: dw });
    }
  }
  return { samples, underWay, land, deck };
}

function summarise(hits: Hit[]): string {
  const by = new Map<string, { n: number; worst: Hit }>();
  for (const h of hits) {
    const k = `${h.id} ${h.phase}`;
    const e = by.get(k);
    if (!e) by.set(k, { n: 1, worst: h }); else { e.n++; if (h.depth > e.worst.depth) e.worst = h; }
  }
  return [...by.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25)
    .map(([k, e]) => `  ${k}: ${e.n} samples, worst ${e.worst.depth.toFixed(2)} m at (${e.worst.x.toFixed(1)}, ${e.worst.z.toFixed(1)}) t=${e.worst.t} bound for ${e.worst.slot}`).join("\n");
}

const LONG_HOURS = Number(process.env.HARBOUR_AUDIT_HOURS ?? 0);

describe("hull footprints in the real harbour", () => {
  it("no hull ever lies on land or over a pier deck (synthetic fleet, 2.5 h every 2 s)", () => {
    const model = buildHarbourModel(makePayloads(), T0_MS, { pieredChains: layout.piers.map((p) => p.chain), dead: [] });
    const sim = new HarbourSim(model, layout, T0_MS, coast);
    const r = audit(sim, T0_MS, 2.5, 2);
    expect(r.underWay).toBeGreaterThan(50_000);
    expect(r.land.length, summarise(r.land)).toBe(0);
    expect(r.deck.length, summarise(r.deck)).toBe(0);
  }, 120_000);

  it.runIf(LONG_HOURS > 0)("long audit (HARBOUR_AUDIT_HOURS): the real fleet when present", () => {
    const nowMs = Date.UTC(2026, 9, 13, 21, 15);
    const real = realPayloads(nowMs);
    const model = buildHarbourModel(real ?? makePayloads({ nowMs }), nowMs, { pieredChains: layout.piers.map((p) => p.chain), ...(real ? {} : { dead: [] }) });
    const sim = new HarbourSim(model, layout, nowMs, coast);
    const step = Number(process.env.HARBOUR_AUDIT_STEP ?? 1);
    const r = audit(sim, nowMs, LONG_HOURS, step);
    console.info(`[audit] ${real ? "real" : "synthetic"} fleet, ${model.boats.length} hulls, ${LONG_HOURS} h every ${step} s: ${r.samples} hull-samples (${r.underWay} under way)`);
    console.info(`[audit] land: ${r.land.length} samples\n${summarise(r.land)}`);
    console.info(`[audit] decks: ${r.deck.length} samples\n${summarise(r.deck)}`);
    expect(r.land.length).toBe(0);
    expect(r.deck.length).toBe(0);
  }, 3_600_000);
});
