#!/usr/bin/env node
/** Refresh/remount resource soak in ONE tab; no navigation between cycles. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { runShot } from "./frame.mjs";
import { createHash } from "node:crypto";
import { trackResources, runSoak } from "./soak-scenarios.mjs";
import { summarizeSoak } from "./soak-summary.mjs";
import { replayInitScript } from "../../tests/helpers/scenario.ts";

const { values: a } = parseArgs({ options: {
  help: { type: "boolean" }, origin: { type: "string", default: "http://127.0.0.1:4180/" }, out: { type: "string", default: "outputs/perf/soak" },
  cycles: { type: "string", default: "12" }, refreshes: { type: "string", default: "3" }, settle: { type: "string", default: "3000" }, warmup: { type: "string", default: "3" },
  width: { type: "string", default: "1600" }, height: { type: "string", default: "1000" }, dpr: { type: "string", default: "1" },
  profile: { type: "string", default: "standard" }, machine: { type: "string", default: "contended" }, gc: { type: "boolean" }, audio: { type: "boolean" },
  assert: { type: "boolean" }, diagnostic: { type: "boolean" }, mode: { type: "string", default: "remount" },
  minutes: { type: "string", default: "30" }, interval: { type: "string", default: "30000" }, "reduced-motion": { type: "boolean" },
  faults: { type: "boolean" },
  "ready-timeout": { type: "string", default: "120" }, snapshot: { type: "string" },
} });
if (a.help) {
  console.log(`Usage: node scripts/perf/soak.mjs [options]
  --origin URL --out DIR --cycles 12 --refreshes 3 --settle 3000 --warmup 3
  --width 1600 --height 1000 --dpr 1 --profile standard|igpu --machine contended|quiet
  --snapshot FILE replay the shared scenario; advance five minutes per refresh
  --assert       growth/faults exit 1, missing required evidence 78, plateau 0 (default)
  --diagnostic   explicitly record verdict without asserting it
  --mode mounted --minutes 30 --interval 30000 --snapshot FILE
                 30–60 minute mounted replay, refresh/panels/hidden-wake
  --faults       worker crash then one context recovery (mounted mode only)
  --reduced-motion  use the real prefers-reduced-motion media feature
  --audio        rapid toggles and exercise sound-ON lifecycle (default sound OFF)
  --gc           force GC before heap samples; record this intrusive choice explicitly
  --ready-timeout 120
Runs feed.refresh(all seven endpoints), waits for a coherent rendered revision, denies/re-admits
via the real viewport gate using CDP, all in one page. Reports renderer.info geometry/texture/program
counts, JS heap (CDP), worker targets + weakly tracked Worker lifetime, audio contexts, disposed-state
counters and post-warmup late-half growth trends. Plateau is an observation, not proof of no leaks.
Requires the React entry with the viewport gate, not the standalone harbour dev entry.`);
} else {
  await main().catch((error) => { console.error(error.message); process.exitCode = error.exitCode ?? 1; });
}

async function main() {
  const mounted = a.mode === "mounted", minutes = Number(a.minutes), interval = Number(a.interval);
  if (!["mounted", "remount"].includes(a.mode) || (a.assert && a.diagnostic)
    || !Number.isFinite(interval) || interval < 1000 || !Number.isFinite(minutes) || minutes < 30 || minutes > 60
    || (mounted && !a.snapshot) || (a.faults && !mounted)) throw new Error("Invalid soak mode/duration; mounted mode requires a replay snapshot; faults require mounted mode");
  const cycles = mounted ? Math.ceil(minutes * 60000 / interval) + 1 : Number(a.cycles), refreshes = Number(a.refreshes), warmup = Number(a.warmup);
  if (!Number.isInteger(cycles) || cycles < 4 || !Number.isInteger(refreshes) || refreshes < 1 || !Number.isInteger(warmup) || warmup < 0 || cycles - warmup < 4) throw new Error("need integer cycles/refreshes and at least four post-warmup cycles");
  if (!["standard", "igpu"].includes(a.profile) || !["contended", "quiet"].includes(a.machine)) throw new Error("invalid profile or machine");
  const out = resolve(a.out);
  await mkdir(out, { recursive: true });
  const options = { mode: a.mode, interval, faults: !!a.faults, reducedMotion: !!a["reduced-motion"], cycles, refreshes, warmup, settle: Number(a.settle), width: Number(a.width), height: Number(a.height), dpr: Number(a.dpr), gc: !!a.gc, audio: !!a.audio, readyTimeoutMs: Number(a["ready-timeout"]) * 1000 };
  const url = new URL(a.origin);
  url.searchParams.set("intro", "0");
  if (![options.settle, options.width, options.height, options.dpr, options.readyTimeoutMs].every((v) => Number.isFinite(v) && v > 0)) throw new Error("Invalid soak dimensions/durations");
  const fixture = a.snapshot ? await readFile(resolve(a.snapshot), "utf8") : null;
  const fixtureHash = fixture ? createHash("sha256").update(fixture).digest("hex") : null;
  const replay = fixture ? replayInitScript(JSON.parse(fixture)) : "";
  const report = await runShot(["--url", url.href, ...(options.reducedMotion ? ["--reduced-motion"] : []), ...(fixtureHash ? ["--fixture-hash", fixtureHash] : []), "--cdp", "--init-script", `${replay}\n(${trackResources.toString()})();`, "--eval", `(${runSoak.toString()})(${JSON.stringify(options)})`, "--eval-wait", "0", "--seconds", "0", "--wait", "0", "--width", a.width, "--height", a.height, "--dpr", a.dpr, "--ready-timeout", a["ready-timeout"], "--timeout", String(Math.max(240, (mounted ? minutes * 60 : 0) + cycles * (options.readyTimeoutMs / 1000 + refreshes * 30 + options.settle / 500))), ...(a.profile === "igpu" ? ["--igpu"] : [])], resolve(out, "capture"));
  const samples = report.evalResult.samples;
  const result = summarizeSoak(samples, { warmup, phases: mounted ? ["mounted"] : ["mounted", "disposed"], failures: report.evalResult.failures });
  const summary = { meta: { tool: "soak", date: new Date().toISOString(), origin: a.origin, machine: a.machine, profile: a.profile, gpu: report.gpu, provenance: report.provenance, diagnostic: !!a.diagnostic, elapsedMs: report.evalResult.elapsedMs, ...options, notes: "Late-half post-warmup trends; heap without forced GC includes garbage. Logical renderer counters are not resident VRAM or proof of no leaks. Listener count is CDP page DOM listeners, not worker/browser-global listeners." }, samples, ...result, scenarios: report.evalResult.scenarios, consoleErrors: report.consoleErrors };
  await writeFile(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`Soak ${summary.verdict}: ${resolve(out, "summary.json")}`);
  process.exitCode = a.diagnostic ? 0 : summary.exitCode;
}
