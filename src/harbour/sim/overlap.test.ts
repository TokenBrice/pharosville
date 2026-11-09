import { readFileSync } from "node:fs";
import sharp from "sharp";
import { expect, it } from "vitest";
import layoutJson from "../data/layout.json";
import seedJson from "../data/sim-seeds.json";
import type { HarbourLayout } from "../layout/types";
import { buildHarbourModel } from "../model/build";
import type { HarbourPayloads } from "../model/types";
import { footprint } from "./footprint";
import { buildSimLayout } from "./layout-graph";
import type { CoastGrid } from "./obstacles";
import { seedOutings } from "./outings";
import { buildPlan, seedLegTimes } from "./plan";
import { buildPlanLegPath, pathKey, planPathRequests, reservePlanHolds } from "./plan-paths";
import type { SimSeeds } from "./seeds";
import { HarbourSim } from "./sim";
import { makePayloads, T0_MS } from "./test-fixtures";

const layout = layoutJson as unknown as HarbourLayout;
const seeds = seedJson as unknown as SimSeeds;
interface RecordedFleet {
  epoch: number;
  chains: string[];
  pegs: string[];
  coins: Array<[string, number, number, Record<string, number>, number[]?]>;
  depegs: string[];
}

// Model inputs from the same-origin snapshot bodies, dictionary encoded (both fixtures total <150 KiB).
function snapshotPayloads(epoch: number): HarbourPayloads {
  const r = JSON.parse(readFileSync(new URL(`../../../tests/fixtures/overlap-${epoch}.json`, import.meta.url), "utf8")) as RecordedFleet;
  const coins = r.coins.map(([id, peg, supply, chains, fallback]) => ({
    id, name: id, symbol: id, pegType: r.pegs[peg], circulating: { [r.pegs[peg]]: supply },
    chainCirculating: Object.fromEntries(Object.entries(chains).map(([chain, current]) => [r.chains[Number(chain)], { current }])),
    chains: (fallback ?? []).map((chain) => r.chains[chain]),
  }));
  return makePayloads({ nowMs: r.epoch, coins, depegIds: r.depegs });
}

for (const epoch of [1794165544398, 1794189387491, T0_MS]) it(`separates the fleet at ${epoch} and over the following hour`, async () => {
  const payloads = epoch === T0_MS ? makePayloads({ n: 657 }) : snapshotPayloads(epoch);
  const { data, info } = await sharp(new URL("../../../public" + layout.sea!.sdf, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const coast: CoastGrid = { data: new Uint8Array(info.width * info.height), size: info.width, bounds: layout.sea!.bounds as [number, number, number, number] };
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) coast.data[y * info.width + x] = data[((info.height - 1 - y) * info.width + x) * 4];
  const model = buildHarbourModel(payloads, epoch, { pieredChains: layout.piers.map((p) => p.chain) });
  const L = buildSimLayout(layout, coast), base = L.slots.length;
  seedLegTimes(L, seeds.legs); seedOutings(L, seeds.outings);
  const plan = buildPlan(model, L);
  expect(model.boats).toHaveLength(657);
  const sailing = plan.boats.filter((_, i) => model.boats[i].state !== "shoals" && model.boats[i].state !== "wrecked");
  const sim = new HarbourSim(buildHarbourModel({}, epoch), layout, epoch, coast);
  sim.seedLegTimes(seeds.legs); sim.seedOutings(seeds.outings);
  const built = new Set<string>();
  const paths = (now: number) => {
    const req = planPathRequests(sailing, now, (key) => built.has(key));
    return [...req.now, ...req.soon].map((r): [string, ReturnType<typeof buildPlanLegPath>["path"], boolean] => {
      const result = buildPlanLegPath(L, base, ...r); built.add(pathKey(...r)); return [pathKey(...r), result.path, result.bad];
    });
  };
  const initial = paths(epoch), holds = reservePlanHolds(L, sailing, initial);
  sim.setModel(model, epoch, { plan, rafts: L.slots.slice(base), paths: initial, holds });
  const feet = model.boats.map((b) => footprint(b, L));
  const failures: unknown[] = [];
  // Capture clocks advance during load: include the reported sailing collision at epoch +42 s,
  // then sample each minute through the hour (including boats whose routes fail later).
  for (const seconds of [...Array.from({ length: 61 }, (_, i) => i), ...Array.from({ length: 59 }, (_, i) => (i + 2) * 60)]) {
    const minute = seconds / 60;
    const now = epoch + seconds * 1000;
    if (minute) { const entries = paths(now); sim.seedPaths(sim.plan, entries, reservePlanHolds(L, sailing, entries)); }
    const p = sim.poseAt(now);
    for (let i = 0; i < p.count; i++) for (let j = i + 1; j < p.count; j++) {
      if ([i, j].some((k) => model.boats[k].state === "shoals" || model.boats[k].state === "wrecked")) continue;
      const distance = Math.hypot(p.position[i * 3] - p.position[j * 3], p.position[i * 3 + 2] - p.position[j * 3 + 2]);
      const separation = (feet[i].beam + feet[j].beam) / 2;
      if (distance < separation) failures.push({ minute, ids: [p.ids[i], p.ids[j]], distance, separation, phase: [p.phase[i], p.phase[j]], slots: [p.slot[i], p.slot[j]] });
    }
  }
  expect(failures).toEqual([]);
}, 240_000);
