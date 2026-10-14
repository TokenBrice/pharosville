/**
 * The sim against the real harbour (layout.json + the baked sea SDF): lanes and legs stay in water,
 * still hulls never overlap, hulls under way rarely brush. Synthetic fleet, real geometry.
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import layoutJson from "../data/layout.json";
import type { HarbourLayout, HullClass } from "../layout/types";
import { buildHarbourModel } from "../model/build";
import { u01 } from "../model/classify";
import { buildSimLayout, routeNodes } from "./layout-graph";
import { clearance, coastDistance, type CoastGrid } from "./obstacles";
import { buildLegPath } from "./routes";
import { HarbourSim, PH_APPROACHING, PH_CASTING_OFF, PH_SAILING } from "./sim";
import { makePayloads, T0_MS } from "./test-fixtures";

const layout = layoutJson as unknown as HarbourLayout;

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

const coast = readCoast(new URL("../../../public/harbour/sea-sdf.png", import.meta.url).pathname, layout.sea!.bounds as [number, number, number, number]);
const L = buildSimLayout(layout, coast);

describe("the sim in the real harbour", () => {
  it("routes every lane through water, clear of the island", () => {
    const g = L.graph;
    const gates = [...L.gates.values()].flatMap((q) => [q.inNode, q.outNode]).filter((k) => k >= 0);
    let checked = 0, bad = 0;
    for (const a of gates) for (const b of gates) {
      const r = routeNodes(g, a, b);
      for (let k = 1; k < r.length; k++) {
        const x0 = g.x[r[k - 1]], z0 = g.z[r[k - 1]], x1 = g.x[r[k]], z1 = g.z[r[k]];
        const len = Math.hypot(x1 - x0, z1 - z0);
        for (let s = 0; s <= len; s += 2) {
          // authored nodes themselves may sit near a quay: judge the lane between them
          if (s < 10 || len - s < 10) continue;
          const x = x0 + ((x1 - x0) * s) / len, z = z0 + ((z1 - z0) * s) / len;
          checked++;
          if (coastDistance(coast, x, z) < 4 || (L.field && clearance(L.field, x, z) < 2)) bad++;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(bad).toBe(0);
  });

  it("sails every leg with the hull in water (sampled legs between real slots)", () => {
    const docks = L.slots.filter((s) => s.kind === "berth" || s.kind === "mooring" || s.kind === "far");
    let samples = 0, centreOnLand = 0, endsOnLand = 0;
    for (let k = 0; k < 60; k++) {
      const a = docks[Math.floor(u01("leg-a" + k) * docks.length)], b = docks[Math.floor(u01("leg-b" + k) * docks.length)];
      if (a === b) continue;
      const cls: HullClass = a.cls === b.cls ? a.cls : (["small", "boat", "medium"] as HullClass[])[k % 3];
      const p = buildLegPath(L, a.index, b.index, cls);
      const loa = L.loa[cls];
      for (let i = 0; i < p.n; i++) {
        const x = p.pts[i * 2], z = p.pts[i * 2 + 1], h = p.hdg[i];
        samples++;
        if (coastDistance(coast, x, z) < 0.3) centreOnLand++;
        const ex = Math.sin(h) * loa * 0.42, ez = Math.cos(h) * loa * 0.42;
        if (coastDistance(coast, x + ex, z + ez) < -0.5 || coastDistance(coast, x - ex, z - ez) < -0.5) endsOnLand++;
      }
    }
    expect(samples).toBeGreaterThan(5000);
    expect(centreOnLand).toBe(0);
    expect(endsOnLand / samples).toBeLessThan(0.002);
  });

  it("keeps still hulls apart, and hulls under way rarely brush another", () => {
    const model = buildHarbourModel(makePayloads(), T0_MS, { pieredChains: layout.piers.map((p) => p.chain), dead: [] });
    const sim = new HarbourSim(model, layout, T0_MS, coast);
    const n = model.boats.length;
    const loa = model.boats.map((b) => sim.layout.loa[b.hullClass]), beam = model.boats.map((b) => sim.layout.beam[b.hullClass]);
    const moving = (ph: number) => ph === PH_CASTING_OFF || ph === PH_SAILING || ph === PH_APPROACHING;
    let still = 0, underWay = 0, uwSamples = 0;
    const K = [-0.32, 0, 0.32];
    for (let k = 0; k < 360; k++) {
      const p = sim.poseAt(T0_MS + k * 5000);
      for (let i = 0; i < n; i++) {
        if (moving(p.phase[i])) uwSamples++;
        for (let j = i + 1; j < n; j++) {
          const dx = p.position[i * 3] - p.position[j * 3], dz = p.position[i * 3 + 2] - p.position[j * 3 + 2];
          if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
          let pen = -1e9;
          for (const a of K) for (const b of K) {
            const ex = dx + Math.sin(p.heading[i]) * loa[i] * a - Math.sin(p.heading[j]) * loa[j] * b;
            const ez = dz + Math.cos(p.heading[i]) * loa[i] * a - Math.cos(p.heading[j]) * loa[j] * b;
            pen = Math.max(pen, (beam[i] + beam[j]) / 2 - Math.hypot(ex, ez));
          }
          if (pen <= 0.3) continue;
          if (moving(p.phase[i]) || moving(p.phase[j])) underWay++; else still++;
        }
      }
    }
    expect(uwSamples).toBeGreaterThan(5000);
    expect(still).toBe(0);
    // brushes: a small share of hull-samples under way (regression guard: 4.8% with this synthetic
    // fleet, which sends far more traffic to the Far Ports than today's; the critic's run had ~4x)
    expect(underWay / uwSamples).toBeLessThan(0.06);
  });
});
