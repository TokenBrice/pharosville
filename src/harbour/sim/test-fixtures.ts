/**
 * Synthetic, generated test fixtures (no snapshot data): a ring-lane harbour with four piers, Far
 * Ports, Shoals, Wreck Cove and a slipway, plus a payload generator whose fleet has today's shape
 * (class ladder, ~20 % multi-chain hulls, a few depegs). Test-only.
 */
import type { HarbourLayout, HullClass, Vec2, Vec3 } from "../layout/types";
import { u01 } from "../model/classify";
import type { HarbourPayloads, PayloadByKey } from "../model/types";

export const T0_MS = Date.UTC(2026, 9, 14, 12, 0, 0);
export const PIERED = ["Ethereum", "Tron", "Solana", "Base"];
const MINOR = ["Minor A", "Minor B", "Minor C", "Minor D"];
const CLASSES: HullClass[] = ["flagship", "large", "medium", "small", "boat", "skiff"];
const LOA: Record<HullClass, number> = { flagship: 26, large: 18, medium: 13, small: 10, boat: 7.5, skiff: 5 };

export function makeLayout(opts: { berthsPerClass?: number; moorings?: boolean } = {}): HarbourLayout {
  const perClass = opts.berthsPerClass ?? 40;
  const R = 170, N = 16;
  const nodes: Array<{ id: string; position: Vec3 }> = [];
  const edges: Array<{ from: string; to: string }> = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    nodes.push({ id: `loop-${i}`, position: [Math.cos(a) * R, 0, Math.sin(a) * R] });
    edges.push({ from: `loop-${i}`, to: `loop-${(i + 1) % N}` });
  }
  const node = (id: string, x: number, z: number) => { nodes.push({ id, position: [x, 0, z] }); };
  node("gate-in:far", 0, -420); node("gate-out:far", 30, -420);
  edges.push({ from: "loop-12", to: "gate-in:far" }, { from: "gate-out:far", to: "loop-13" });
  node("gate-in:shoals", 380, 0); node("gate-out:shoals", 380, 30);
  edges.push({ from: "loop-0", to: "gate-in:shoals" }, { from: "gate-out:shoals", to: "loop-1" });

  const piers = PIERED.map((chain, k) => {
    const gi = k * 3 + 1; // loop node the pier hangs off
    const a = (gi / N) * Math.PI * 2;
    const ox = Math.cos(a) * R, oz = Math.sin(a) * R;
    const inx = -Math.cos(a), inz = -Math.sin(a); // toward the centre
    const tx = -inz, tz = inx;
    const berths = [];
    for (let c = 0; c < CLASSES.length; c++) {
      const cls = CLASSES[c];
      for (let j = 0; j < perClass; j++) {
        const row = c * 2 + Math.floor(j / 20), col = (j % 20) - 9.5;
        const px = ox + inx * (40 + row * 28) + tx * col * 9, pz = oz + inz * (40 + row * 28) + tz * col * 9;
        const heading = Math.atan2(inx, inz);
        const pre: Vec2 = [px - inx * LOA[cls] * 1.5, pz - inz * LOA[cls] * 1.5];
        berths.push({ id: `pier-${chain.toLowerCase()}/${cls}/${String(j + 1).padStart(3, "0")}`, class: cls, position: [px, 0, pz] as Vec3, headingRad: heading,
          gate: `loop-${gi}`, approach: [[ox, oz] as Vec2, [ox + inx * 20 + tx * col * 9, oz + inz * 20 + tz * col * 9] as Vec2, pre, [px, pz] as Vec2] });
      }
    }
    return { id: `pier-${chain.toLowerCase()}`, chain, kind: "pontoon", gate: [ox, oz] as Vec2, segments: [], berths, berthCounts: {} };
  });
  const farRows = CLASSES.map((cls, c) => ({ cls, line: [[0, -480], [100, -480]] as Vec2[],
    slots: Array.from({ length: 70 }, (_, j) => [-300 + j * 9, 0, -460 - c * 30] as Vec3) }));
  const layout = {
    version: 1, units: "m", seaLevel: 0, deckY: 1.2, bounds: { min: [-600, -6, -600], max: [600, 60, 600] },
    camera: { presets: { overview: { target: [0, 0, 0], distance: 700, fovDeg: 25, pitchDeg: 35, yawDeg: 45 } }, panClamp: { min: [-500, -500], max: [500, 500] } },
    hull: { classes: CLASSES, loa: LOA, beam: Object.fromEntries(CLASSES.map((k) => [k, LOA[k] * 0.32])), mastAboveDeck: LOA, mooring: Object.fromEntries(CLASSES.map((k) => [k, "finger"])) },
    island: { coast: [], bay: [], breakwater: [], mole: [] },
    piers,
    lanes: { oneWay: true, nodes, edges },
    landmarks: [],
    zones: {
      shoals: { polygon: [], slots: Array.from({ length: 12 }, (_, j) => [400 + (j % 4) * 25, 0, -40 + Math.floor(j / 4) * 25] as Vec3) },
      wreckCove: { polygon: [], slots: [{ id: "deadcoin-x-2022-05", class: "large", position: [-450, 0, 300], headingRad: 1 }] },
      slipway: { polygon: [], slots: [[0, 0, 60]], launchPath: [[0, 40], [0, 90], [0, 140]] },
      farPorts: { polygon: [], rows: farRows },
    },
    moorings: opts.moorings ? Array.from({ length: 60 }, (_, j) => ({ id: `moor-${j}`, chain: PIERED[j % 4], class: (j % 2 ? "skiff" : "boat") as HullClass,
      position: [-110 + (j % 10) * 24, 0, -75 + Math.floor(j / 10) * 26] as Vec3, swingRadius: 9 })) : undefined,
  };
  return layout as unknown as HarbourLayout;
}

const CLASS_COUNTS: Array<[HullClass, number, number]> = [
  ["flagship", 2, 1e10], ["large", 20, 1e9], ["medium", 79, 1e8], ["small", 168, 1e7], ["boat", 142, 1e6], ["skiff", 214, 1e5],
];

export interface FleetOpts {
  n?: number;
  depegIds?: string[];
  multiChainShare?: number;
}

/** A synthetic /api/stablecoins (+ peg summary) with the real fleet's shape. */
export function makeCoins(opts: FleetOpts = {}): PayloadByKey["stablecoins"]["peggedAssets"] {
  const coins: PayloadByKey["stablecoins"]["peggedAssets"] = [];
  const multi = opts.multiChainShare ?? 0.22;
  let k = 0;
  for (const [cls, count, base] of CLASS_COUNTS) {
    for (let j = 0; j < count; j++, k++) {
      if (opts.n != null && coins.length >= opts.n) return coins;
      const id = `coin-${cls}-${j}`;
      const supply = base * (1 + u01(id + "s") * 8.9);
      const chains: string[] = [];
      const r = u01(id + "c");
      const home = r < 0.55 ? "Ethereum" : r < 0.65 ? "Tron" : r < 0.75 ? "Solana" : r < 0.85 ? "Base" : MINOR[Math.floor(u01(id + "m") * MINOR.length)];
      chains.push(home);
      if (u01(id + "multi") < multi || cls === "flagship") {
        const extra = 1 + Math.floor(u01(id + "x") * 3);
        for (const c of [...PIERED, ...MINOR].sort((a, b) => u01(id + a) - u01(id + b))) {
          if (chains.length > extra) break;
          if (!chains.includes(c)) chains.push(c);
        }
      }
      const weights = chains.map((c, i) => (i === 0 ? 1.5 : 0.4 + u01(id + c + "w")));
      const wsum = weights.reduce((a, b) => a + b, 0);
      const chainCirculating: Record<string, { current: number }> = {};
      chains.forEach((c, i) => { chainCirculating[c] = { current: (supply * weights[i]) / wsum }; });
      const peg = j % 9 === 0 ? "peggedEUR" : "peggedUSD";
      coins.push({ id, name: `Coin ${cls} ${j}`, symbol: `C${k}`, pegType: peg, circulating: { [peg]: supply }, chainCirculating, chains });
    }
  }
  return coins;
}

export function makePayloads(opts: FleetOpts & { nowMs?: number; stale?: boolean; psi?: { score: number; band: string } | null; coins?: PayloadByKey["stablecoins"]["peggedAssets"] } = {}): HarbourPayloads {
  const now = opts.nowMs ?? T0_MS;
  const coins = opts.coins ?? makeCoins(opts);
  const depeg = new Set(opts.depegIds ?? []);
  const meta = (age = 120) => ({ updatedAt: Math.floor(now / 1000) - age, ageSeconds: age, status: "fresh" as const });
  const snap = <T,>(data: T, age = 120) => ({ data, meta: meta(age), fetchedAtMs: now });
  return {
    stablecoins: opts.stale
      ? { data: { peggedAssets: coins }, meta: { updatedAt: Math.floor(now / 1000) - 20_000, ageSeconds: 20_000, status: "stale" }, fetchedAtMs: now }
      : snap({ peggedAssets: coins }),
    chains: snap({ chains: PIERED.map((name) => ({ id: name.toLowerCase(), name, totalUsd: 1 })) }),
    stability: snap({ current: opts.psi === undefined ? { score: 91.2, band: "BEDROCK" } : opts.psi }),
    pegSummary: snap({ coins: coins.map((c, i) => ({ id: c.id, currentDeviationBps: depeg.has(c.id) ? -800 : i % 7 === 0 ? null : 3, activeDepeg: depeg.has(c.id) })) }),
    stress: snap({ signals: Object.fromEntries(coins.slice(0, 200).map((c, i) => [c.id, { score: 10, band: i < 4 ? "ALERT" : "CALM" }])) }),
    safetyGrades: snap({ grades: coins.slice(0, 50).map((c) => ({ id: c.id, grade: "B" as const })) }),
    mintBurn: snap({ hourly: Array.from({ length: 24 }, (_, h) => ({ hourTs: Math.floor(now / 1000 / 3600 - 24 + h) * 3600, netFlowUsd: h === 5 ? null : (h - 12) * 1e6, mintVolumeUsd: 1e6, burnVolumeUsd: 1e6 })), scope: { chainIds: ["ethereum", "base", "arbitrum"] } }),
  };
}
