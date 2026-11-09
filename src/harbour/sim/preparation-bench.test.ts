/** Opt-in CPU comparison: HARBOUR_PREP_BENCH=1 [HARBOUR_PREP_SNAPSHOT=golden.json] npx vitest run src/harbour/sim/preparation-bench.test.ts --maxWorkers=1 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import sharp from "sharp";
import { expect, it } from "vitest";
import layoutJson from "../data/layout.json";
import seedJson from "../data/sim-seeds.json";
import type { SimSeeds } from "./seeds";
import type { HarbourLayout } from "../layout/types";
import { buildHarbourModel } from "../model/build";
import type { HarbourModel, HarbourPayloads } from "../model/types";
import type { CoastGrid } from "./obstacles";
import { buildSimLayout } from "./layout-graph";
import { buildPlan, seedLegTimes } from "./plan";
import { seedOutings } from "./outings";
import { buildPlanLegPath, pathKey, planPathRequests, reservePlanHolds } from "./plan-paths";
import { HarbourSim, PH_SAILING } from "./sim";
import { makePayloads, T0_MS } from "./test-fixtures";

const seeds = seedJson as unknown as SimSeeds;
const root = new URL("../../../", import.meta.url).pathname;
const source = `
import {buildSimLayout} from './src/harbour/sim/layout-graph.ts';
import {buildPlan,seedLegTimes} from './src/harbour/sim/plan.ts';
import {seedOutings} from './src/harbour/sim/outings.ts';
import {buildPlanLegPath,planPathRequests} from './src/harbour/sim/plan-paths.ts';
import * as pathApi from './src/harbour/sim/plan-paths.ts';
import {legTiming,newLegTiming,HOLD_OUT_MAX,HOLD_IN_MAX} from './src/harbour/sim/path.ts';
export function prepare(model,layout,coast,seeds,nowMs) {
  const L=buildSimLayout(layout,coast), base=L.slots.length;
  seedLegTimes(L,seeds.legs); seedOutings(L,seeds.outings);
  const warmAt=performance.now();
  const plan=buildPlan(model,L),plannerMs=performance.now()-warmAt;
  const sailing=plan.boats.filter((_,i)=>model.boats[i].state!=='shoals'&&model.boats[i].state!=='wrecked');
  const requests=planPathRequests(sailing,nowMs,()=>false);
  let bad=0,paths=0;const built=new Map(),preparedPaths=[];
  for(const r of [...requests.now,...requests.soon]) {
    const [from,to]=r;
    const result=buildPlanLegPath(L,base,...r);
    preparedPaths.push([pathApi.pathKey(...r),result.path,result.bad]);
    if(model.exactAudit) built.set([r[0],r[1],r[2],r[3],r[4],r[5]].join('>'),result);
    if(result.bad&&from!==to) bad++;
    paths++;
  }
  // Old immutable baselines predate reserved holds; include their cost in the current arm.
  const reserve=Reflect.get(pathApi,'reservePlanHolds');
  if(reserve) { reserve(L,sailing,preparedPaths); structuredClone(sailing.filter(p=>p.kind==='circuit')); }
  let exactMs=0,exactPaths=0,exactCachedPaths=0,maxDockDrift=0,worst='',auditedBoats=0;
  if (model.exactAudit) {
    const at=performance.now(),timings=new Map();
    const keyOf=(p,i)=>[p.segFrom[i],p.segSlot[i],p.cls,p.segLoop[i],p.loa,p.beam].join('>');
    for(const p of sailing) if(p.kind==='circuit') for(let i=0;i<p.segKind.length;i++) if(p.segKind[i]===1) {
      const key=keyOf(p,i);
      if(timings.has(key))continue;
      const cached=built.get(key);if(cached)exactCachedPaths++;
      const result=cached??buildPlanLegPath(L,base,p.segFrom[i],p.segSlot[i],p.cls,p.segLoop[i],p.loa,p.beam);
      const tm=legTiming(result.path,1e9,p.loa??L.loa[p.cls],newLegTiming(),L.slots[p.segFrom[i]].heading,L.slots[p.segSlot[i]].heading);
      timings.set(key,{minD:tm.minD,tNom:tm.tNom,bad:result.bad});
      exactPaths++;
    }
    exactMs=performance.now()-at;
    for(const p of sailing) if(p.kind==='circuit') {
      const n=p.segKind.length,legs=new Map(),dock=new Map();let bad=false;
      for(let i=0;i<n;i++) if(p.segKind[i]===1) {
        const tm=timings.get(keyOf(p,i));bad||=tm.bad;
        const prev=(i+n-1)%n,next=(i+1)%n,D=p.segEnd[i]-p.segStart[i],extra=Math.max(0,tm.minD-D);
        const capE=.25*(p.segEnd[prev]-p.segStart[prev]),capL=.25*(p.segEnd[next]-p.segStart[next]);
        const early=Math.min(capE,extra-Math.min(capL,extra/2)),late=Math.min(capL,extra-early);
        const spare=Math.max(0,D+early+late-tm.tNom),hold=Math.min(spare*.5,HOLD_OUT_MAX),holdEnd=Math.min(spare-hold,HOLD_IN_MAX);
        legs.set(i,{early,late,hold,holdEnd});
      }
      if(bad)continue;auditedBoats++;
      for(let i=0;i<n;i++) if(p.segKind[i]===0) {
        const prev=legs.get((i+n-1)%n),next=legs.get((i+1)%n),where=L.slots[p.segSlot[i]].where;
        const effective=p.segEnd[i]-p.segStart[i]-prev.late-next.early+prev.holdEnd+next.hold;
        dock.set(where,(dock.get(where)??0)+effective);
      }
      const total=[...dock.values()].reduce((a,v)=>a+v,0),nominal=[...p.dwell.values()].reduce((a,v)=>a+v,0);
      for(const [where,d] of dock) {
        const drift=Math.abs(d/total-p.dwell.get(where)/nominal);
        if(drift>maxDockDrift){maxDockDrift=drift;worst=p.id+' at '+where;}
      }
    }
  }
  return {warmAt,plannerMs,paths,bad,exactMs,exactPaths,exactCachedPaths,maxDockDrift,worst,auditedBoats};
}`;
interface BenchApi {
  prepare(model: HarbourModel, layout: HarbourLayout, coast: CoastGrid, seed: typeof seeds, now: number): { warmAt: number; paths: number; bad: number; plannerMs: number; exactMs: number; exactPaths: number; exactCachedPaths: number; maxDockDrift: number; worst: string; auditedBoats: number };
}
async function implementation(ref?: string): Promise<BenchApi> {
  const result = await build({
    stdin: { contents: source, resolveDir: root, loader: "ts" }, bundle: true, write: false, platform: "node", format: "esm",
    plugins: ref ? [{ name: "immutable-sim-baseline", setup(b) {
      b.onLoad({ filter: /\/src\/harbour\/(?:sim\/.*|model\/classify)\.ts$/ }, ({ path }) => ({ contents: readFileSync(resolve(root, process.env.HARBOUR_PREP_BASELINE ?? "agents/pharosville-ultimate/p-paths/baseline", path.slice(root.length)), "utf8"), loader: "ts" }));
    } }] : [],
  });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}

it.runIf(process.env.HARBOUR_PREP_BENCH === "1")("compares seeded cold worker preparation with the untouched lane base on identical inputs", async () => {
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
  const baseline = process.env.HARBOUR_PREP_BASELINE_REF ?? "HEAD";
  const arms = { old: await implementation(baseline), current: await implementation() };
  const samples = { old: [] as number[], current: [] as number[] }, allocation = { old: [] as number[], current: [] as number[] }, planner = { old: [] as number[], current: [] as number[] };
  let paths = 0, bad = 0;
  // One untimed warmup per arm, then balanced order; every measured preparation gets a fresh layout.
  for (const api of Object.values(arms)) api.prepare(model, layout, coast, seeds, T0_MS);
  for (let round = 0; round < 6; round++) for (const arm of round % 2 ? ["current", "old"] as const : ["old", "current"] as const) {
    const start = performance.now(), result = arms[arm].prepare(model, layout, coast, seeds, T0_MS), end = performance.now();
    samples[arm].push(end - start); allocation[arm].push(end - result.warmAt); planner[arm].push(result.plannerMs);
    if (arm === "current") { paths = result.paths; bad = result.bad; }
  }
  const median = (xs: number[]) => { const sorted = xs.slice().sort((a, b) => a - b); return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2; };
  const oldMs = median(samples.old), newMs = median(samples.current);
  const audit = arms.current.prepare(Object.assign({}, model, { exactAudit: true }), layout, coast, seeds, T0_MS);
  expect(audit.exactCachedPaths).toBeGreaterThan(0);
  expect(audit.exactPaths).toBeGreaterThan(audit.exactCachedPaths);
  const oldAudit = arms.old.prepare(Object.assign({}, model, { exactAudit: true }), layout, coast, seeds, T0_MS);
  const L = buildSimLayout(layout, coast), base = L.slots.length;
  seedLegTimes(L, seeds.legs); seedOutings(L, seeds.outings);
  const plan = buildPlan(model, L), req = planPathRequests(plan.boats, T0_MS, () => false);
  const pathsPrepared = [...req.now, ...req.soon].map((r): [string, ReturnType<typeof buildPlanLegPath>["path"], boolean] => {
    const result = buildPlanLegPath(L, base, ...r); return [pathKey(...r), result.path, result.bad];
  });
  const holds = reservePlanHolds(L, plan.boats, pathsPrepared);
  const prepared = { plan: { key: plan.key, boats: plan.boats, stats: plan.stats }, rafts: L.slots.slice(base), paths: pathsPrepared, holds };
  const sim = new HarbourSim(buildHarbourModel({}, T0_MS), layout, T0_MS, coast);
  sim.seedLegTimes(seeds.legs); sim.seedOutings(seeds.outings);
  sim.setModel(model, T0_MS, structuredClone(prepared)); sim.poseAt(T0_MS);
  const victim = model.boats.find((b, i) => b.state === "circuit" && sim.pose.phase[i] === PH_SAILING)!;
  expect(victim).toBeDefined();
  const depeg = { ...model, boats: model.boats.map((b) => b.id === victim.id ? { ...b, state: "shoals" as const } : b) };
  const events: number[] = [];
  for (let i = 0; i < 5; i++) for (const next of [depeg, model]) {
    const start = performance.now(); sim.setModel(next, T0_MS); sim.poseAt(T0_MS);
    if (i) events.push(performance.now() - start);
  }
  expect(events).toHaveLength(8); expect(events.every(Number.isFinite)).toBe(true);
  const sortedEvents = events.slice().sort((a, b) => a - b);
  const report = { voyageInstallPoseMedianMs: (sortedEvents[3] + sortedEvents[4]) / 2, voyageInstallPoseMaxMs: sortedEvents[sortedEvents.length - 1], voyageInstallPoseSamplesMs: events, plannerOldMs: median(planner.old), plannerNewMs: median(planner.current), baselineMaxDockDriftPoints: oldAudit.maxDockDrift * 100, maxDockDriftPoints: audit.maxDockDrift * 100, worstDockDrift: audit.worst, auditedBoats: audit.auditedBoats, incrementalExactPathsMs: audit.exactMs, exactSelectedPaths: audit.exactPaths, exactCachedPaths: audit.exactCachedPaths, exactAdditionalPaths: audit.exactPaths - audit.exactCachedPaths, baseline: readFileSync(resolve(root, process.env.HARBOUR_PREP_BASELINE ?? "agents/pharosville-ultimate/p-paths/baseline", "reference.txt"), "utf8").trim(), fixture: snapshot ?? "generated-657 / real layout and coast", planKey: model.planKey, seedVersion: seeds.version, boats: model.boats.length, oldMs, newMs, ratio: newMs / oldMs, allocationOldMs: median(allocation.old), allocationNewMs: median(allocation.current), paths, bad, samples };
  const out = resolve(root, "agents/pharosville-ultimate/p-paths");
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "preparation.json"), JSON.stringify(report, null, 2) + "\n");
  console.info(JSON.stringify(report, null, 2));
  expect(paths).toBeGreaterThan(0);
  expect(newMs).toBeLessThanOrEqual(oldMs * 1.10);
}, 240_000);
