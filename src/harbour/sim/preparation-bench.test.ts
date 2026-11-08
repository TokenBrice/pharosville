/** Opt-in CPU comparison: HARBOUR_PREP_BENCH=1 [HARBOUR_PREP_SNAPSHOT=golden.json] npx vitest run src/harbour/sim/preparation-bench.test.ts --maxWorkers=1 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import sharp from "sharp";
import { expect, it } from "vitest";
import layoutJson from "../data/layout.json";
import seeds from "../data/sim-seeds.json";
import type { HarbourLayout } from "../layout/types";
import { buildHarbourModel } from "../model/build";
import type { HarbourModel, HarbourPayloads } from "../model/types";
import type { CoastGrid } from "./obstacles";
import { makePayloads, T0_MS } from "./test-fixtures";

const root = new URL("../../../", import.meta.url).pathname;
const source = `
import {buildSimLayout} from './src/harbour/sim/layout-graph.ts';
import {buildPlan,seedLegTimes} from './src/harbour/sim/plan.ts';
import {seedOutings} from './src/harbour/sim/outings.ts';
import {buildPlanLegPath,planPathRequests} from './src/harbour/sim/plan-paths.ts';
export function prepare(model,layout,coast,seeds,nowMs) {
  const L=buildSimLayout(layout,coast), base=L.slots.length;
  seedLegTimes(L,seeds.legs); seedOutings(L,seeds.outings);
  const warmAt=performance.now();
  const plan=buildPlan(model,L);
  const sailing=plan.boats.filter((_,i)=>model.boats[i].state!=='shoals'&&model.boats[i].state!=='wrecked');
  const requests=planPathRequests(sailing,nowMs,()=>false);
  let bad=0,paths=0;
  for(const [from,to,cls,loop] of [...requests.now,...requests.soon]) {
    const result=buildPlanLegPath(L,base,from,to,cls,loop);
    if(result.bad&&from!==to) bad++;
    paths++;
  }
  return {warmAt,paths,bad};
}`;
interface BenchApi {
  prepare(model: HarbourModel, layout: HarbourLayout, coast: CoastGrid, seed: typeof seeds, now: number): { warmAt: number; paths: number; bad: number };
}
async function implementation(ref?: string): Promise<BenchApi> {
  const result = await build({
    stdin: { contents: source, resolveDir: root, loader: "ts" }, bundle: true, write: false, platform: "node", format: "esm",
    plugins: ref ? [{ name: "immutable-sim-baseline", setup(b) {
      b.onLoad({ filter: /\/src\/harbour\/(?:sim\/.*|model\/classify)\.ts$/ }, ({ path }) => ({ contents: readFileSync(resolve(root, process.env.HARBOUR_PREP_BASELINE ?? ".cache/sim-prep-5dbb6a2a", path.slice(root.length)), "utf8"), loader: "ts" }));
    } }] : [],
  });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}

it.runIf(process.env.HARBOUR_PREP_BENCH === "1")("compares seeded cold worker preparation with 5dbb6a2a on identical inputs", async () => {
  const layout = layoutJson as unknown as HarbourLayout;
  const { data, info } = await sharp(new URL("../../../public" + layout.sea!.sdf, import.meta.url).pathname).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const coast: CoastGrid = { data: new Uint8Array(info.width * info.height), size: info.width, bounds: layout.sea!.bounds as [number, number, number, number] };
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) coast.data[y * info.width + x] = data[((info.height - 1 - y) * info.width + x) * 4];
  const snapshot = process.env.HARBOUR_PREP_SNAPSHOT;
  let payloads = makePayloads({ n: 657 });
  if (snapshot) {
    const recorded = JSON.parse(readFileSync(resolve(root, snapshot), "utf8")) as { responses: Record<string, { body: string }> };
    const endpoints: Record<keyof HarbourPayloads, string> = { stablecoins: "/api/stablecoins", chains: "/api/chains", stability: "/api/stability-index?detail=true", pegSummary: "/api/peg-summary", stress: "/api/stress-signals", safetyGrades: "/api/safety-grades", mintBurn: "/api/mint-burn-flows" };
    payloads = Object.fromEntries(Object.entries(endpoints).map(([key, path]) => [key, { data: JSON.parse(recorded.responses[path].body), fetchedAtMs: T0_MS, meta: { updatedAt: T0_MS / 1000 - 120, ageSeconds: 120, status: "fresh" } }])) as HarbourPayloads;
  }
  const model = buildHarbourModel(payloads, T0_MS, { pieredChains: layout.piers.map((p) => p.chain), dead: [] });
  expect(model.boats.length).toBe(657);
  const arms = { old: await implementation("5dbb6a2a"), current: await implementation() };
  const samples = { old: [] as number[], current: [] as number[] }, allocation = { old: [] as number[], current: [] as number[] };
  let paths = 0, bad = 0;
  // One untimed warmup per arm, then balanced order; every measured preparation gets a fresh layout.
  for (const api of Object.values(arms)) api.prepare(model, layout, coast, seeds, T0_MS);
  for (let round = 0; round < 4; round++) for (const arm of round % 2 ? ["current", "old"] as const : ["old", "current"] as const) {
    const start = performance.now(), result = arms[arm].prepare(model, layout, coast, seeds, T0_MS), end = performance.now();
    samples[arm].push(end - start); allocation[arm].push(end - result.warmAt);
    if (arm === "current") { paths = result.paths; bad = result.bad; }
  }
  const median = (xs: number[]) => { const sorted = xs.slice().sort((a, b) => a - b); return (sorted[1] + sorted[2]) / 2; };
  const oldMs = median(samples.old), newMs = median(samples.current);
  const report = { baseline: "5dbb6a2a", fixture: snapshot ?? "generated-657 / real layout and coast", planKey: model.planKey, seedVersion: seeds.version, boats: model.boats.length, oldMs, newMs, ratio: newMs / oldMs, allocationOldMs: median(allocation.old), allocationNewMs: median(allocation.current), paths, bad, samples };
  const out = resolve(root, "agents/pharosville-ultimate/exec/sim-perf");
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "preparation.json"), JSON.stringify(report, null, 2) + "\n");
  console.info(JSON.stringify(report, null, 2));
  expect(bad).toBe(0);
  expect(newMs).toBeLessThanOrEqual(oldMs * 1.15);
}, 240_000);
