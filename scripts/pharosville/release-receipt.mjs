#!/usr/bin/env node
/** Assemble existing smoke/identity and hardware evidence; never publishes or tags. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { classifyGpu } from "../harbour/capture-provenance.mjs";
import { evaluateArrival } from "../harbour/arrival-smoke.mjs";
import { summarizeSoak } from "../perf/soak-summary.mjs";
import { evaluateLinks } from "../harbour/links-smoke.mjs";
import { evaluateExtras } from "../perf/extras-budget.mjs";
import { evaluateSupersample } from "../perf/supersample-receipt.mjs";
import { evaluateSteady } from "../perf/steady-gate.mjs";

const SECONDARY = ["Apple Silicon Safari (D14)", "Apple Silicon Chrome", "iGPU", "desktop Firefox", "Windows default ANGLE", "iPad Safari", "Android tablet/foldable", "blocked phone/device boundaries"];

export const V180_ASSERTIONS = {
  postcards: ["same-revision", "caption-provenance"],
  "new-readings": ["projection", "validation", "stale", "unavailable", "on-demand"],
  "blocked-viewports": ["screen-denied", "window-denied", "boundary-sizes", "no-world-requests"],
};

/** Test/art assertions are supplied by their owning lanes; GPU/link results are re-evaluated. */
export function acceptanceRows(evidence, identity) {
  return ["links", ...Object.keys(V180_ASSERTIONS), "extras", "supersample"].map((id) => {
    const check = evidence.checks?.find((c) => c.id === id), data = check?.data;
    const row = { id, file: check?.file ?? null, status: "SKIP", reason: "Required v1.8.0 evidence missing or unverified" };
    if (data?.status === "FAIL" || data?.assertions?.some((a) => a.status === "FAIL")) return { ...row, status: "FAIL", reason: "Acceptance evidence failed" };
    if (!check?.file || !data || !evidence.buildHash) return row;
    const captures = id === "links" ? [data.provenance] : id === "extras" ? data.captures?.flatMap((c) => c.data?.scenarios?.flatMap((s) => s.runs?.map((r) => r.provenance)) ?? [])
      : id === "supersample" ? data.captures?.map((c) => c.data?.provenance) : null;
    if (captures && (!captures.length || captures.some((p) => !p || p.buildHash !== evidence.buildHash || !evidence.fixtures?.includes(p.fixtureHash)
      || p.deliveryIdentity?.documentHash !== identity?.documentHash || p.deliveryIdentity?.assetRegistryHash !== identity?.assetRegistryHash))) return row;
    const result = id === "links" ? evaluateLinks(data) : id === "extras" ? evaluateExtras(data) : id === "supersample" ? evaluateSupersample(data) : null;
    if (result) return { ...row, status: result.status === "PASS" ? "PASS" : result.status === "FAIL" ? "FAIL" : "SKIP", reason: "Raw acceptance evidence re-evaluated", result };
    const complete = data.status === "PASS" && data.buildHash === evidence.buildHash
      && V180_ASSERTIONS[id].every((key) => data.assertions?.some((a) => a.id === key && a.status === "PASS" && typeof a.evidence === "string" && a.evidence.trim()));
    return { ...row, status: complete ? "PASS" : "SKIP", reason: complete ? "Matched build; named acceptance assertions with evidence paths" : row.reason, assertions: data.assertions ?? [] };
  });
}

export function buildReleaseReceipt(smoke, evidence = {}) {
  const rows = [];
  const add = (id, status, reason, extra = {}) => rows.push({ id, status, reason, ...extra });
  const identity = smoke?.identity;
  if (smoke?.status === "FAIL") add("canonical-smoke", "FAIL", smoke.error ?? "Canonical smoke failed");
  else if (smoke?.status !== "PASS" || smoke.origin !== "https://pharosville.pharos.watch/"
    || !/^[a-f\d]{40}$/i.test(smoke.sha ?? "") || smoke.sha !== evidence.sha || !identity?.documentHash || !identity.assetRegistryHash || smoke.buildHash !== evidence.buildHash) add("canonical-smoke", "UNVERIFIED", "Missing canonical-host smoke, SHA or delivery identity");
  else add("canonical-smoke", "PASS", "Existing smoke and canonical delivery identity", { source: smoke });
  if (!evidence.buildHash || !evidence.fixtures?.length) add("artifact", "UNVERIFIED", "Missing build digest/fixtures");
  for (const id of ["arrival", "soak", "soak-remount", "steady", "steady-cpu4", "steady-control"]) {
    const check = evidence.checks?.find((c) => c.id === id);
    const data = check?.data, steady = id.startsWith("steady"), soak = id.startsWith("soak");
    const captures = steady ? data?.scenarios?.flatMap((s) => s.runs.map((r) => r.provenance)) : [data?.provenance ?? data?.meta?.provenance];
    if (data?.status === "FAIL") { add(id, "FAIL", "Evidence failed", { file: check.file }); continue; }
    if (!data || !captures?.length || captures.some((p) => !p || p.buildHash !== evidence.buildHash || !evidence.fixtures?.includes(p.fixtureHash)
      || classifyGpu(p.gpu) !== "hardware" || !/\bRTX\b/i.test(p.gpu) || !p.browser || !p.backend || !p.device?.platform
      || p.deliveryIdentity?.documentHash !== identity?.documentHash || p.deliveryIdentity?.assetRegistryHash !== identity?.assetRegistryHash)) {
      add(id, "UNVERIFIED", "Missing evidence or mismatched build/fixture/canonical identity/RTX", { file: check?.file ?? null }); continue;
    }
    if (id === "arrival" && (!data.observation || !Array.isArray(data.consoleErrors))) {
      add(id, "UNVERIFIED", "Missing raw arrival observation/console evidence", { file: check.file }); continue;
    }
    const verified = id === "arrival" ? evaluateArrival({ gpu: captures[0].gpu, evalResult: data.observation, consoleErrors: data.consoleErrors })
      : steady ? evaluateSteady(data)
      : summarizeSoak(data.samples ?? [], { warmup: data.meta?.warmup, phases: data.meta?.mode === "mounted" ? ["mounted"] : ["mounted", "disposed"], failures: data.failures ?? [] });
    const profile = !steady || (id === "steady" ? data.meta?.prof === "gpu" : id === "steady-cpu4" ? data.meta?.prof === "1" && data.meta.cpuThrottle === 4 : data.meta?.prof === "none");
    const longSoak = id !== "soak" || (data.meta?.mode === "mounted" && data.meta.elapsedMs >= 30 * 60_000 && !data.meta.diagnostic
      && ["panels", "hidden-wake", "worker-crash", "context-loss"].every((kind) => data.scenarios?.some((s) => s.kind === kind && s.status === "PASS")));
    if (verified.status === "FAIL") add(id, "FAIL", "Raw evidence failed re-evaluation", { file: check.file });
    else if (data.status !== "PASS" || verified.status !== "PASS" || !longSoak || !profile || (soak && data.meta?.diagnostic)
      || (id === "soak-remount" && data.meta?.mode !== "remount")) add(id, "UNVERIFIED", "Required raw assertion/scenario evidence did not pass", { file: check.file });
    else add(id, "PASS", "Matched real RTX evidence; raw samples retained", { file: check.file, captures });
  }
  const acceptance = acceptanceRows(evidence, identity);
  rows.push(...acceptance);
  const art = evidence.art;
  add("art", art?.status === "FAIL" ? "FAIL" : art?.status === "PASS" && art.reviewer && art.evidence ? "PASS" : "UNVERIFIED", "Art verdict is a separate reviewer decision", { verdict: art ?? null });
  for (const id of SECONDARY) add(id, "SKIP", "Operator ruling PLAN §3: secondary hardware/device rows excluded this pass; no device performance claim");
  const status = rows.some((r) => r.status === "FAIL") ? "FAIL" : rows.some((r) => r.status === "UNVERIFIED") || acceptance.some((r) => r.status === "SKIP") ? "UNVERIFIED" : "PASS";
  return { schemaVersion: 1, tool: "release-receipt", sha: evidence.sha ?? null, buildHash: evidence.buildHash ?? null, fixtures: evidence.fixtures ?? [],
    canonical: smoke, rows, status, exitCode: status === "PASS" ? 0 : status === "FAIL" ? 1 : 78,
    publication: ".github/workflows/release.yml only; this receipt does not publish", evidence };
}

export async function readEvidence(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function main() {
  const { values: a } = parseArgs({ options: { help: { type: "boolean" }, smoke: { type: "string" }, evidence: { type: "string" }, out: { type: "string", default: "outputs/perf/release-receipt.json" } } });
  if (a.help) { console.log("Usage: node scripts/pharosville/release-receipt.mjs --smoke FILE --evidence FILE [--out FILE]\nEvidence: {sha,buildHash,fixtures:[hash],checks:[{id:arrival|soak|soak-remount|steady|steady-cpu4|steady-control|links|extras|supersample|postcards|new-readings|blocked-viewports,file}],art:{status,reviewer,evidence}}\nPostcards/new-readings/blocked-viewports files: {status,buildHash,assertions:[{id,status,evidence:path}]}; required ids are exported as V180_ASSERTIONS. These are owning-lane assertions, not tests rerun by this receipt. Paths are relative to evidence JSON. Raw summaries are embedded; referenced raw capture files must be archived beside them. Exit 0 PASS with explicit secondary SKIPs, 1 FAIL, 78 UNVERIFIED."); return; }
  if (!a.smoke || !a.evidence) throw new Error("--smoke and --evidence required");
  const evidenceFile = resolve(a.evidence);
  const evidence = await readEvidence(evidenceFile) ?? {};
  for (const check of evidence.checks ?? []) check.data = await readEvidence(resolve(dirname(evidenceFile), check.file));
  const receipt = buildReleaseReceipt(await readEvidence(resolve(a.smoke)), evidence);
  const out = resolve(a.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ date: new Date().toISOString(), ...receipt }, null, 2) + "\n");
  console.log(`Release receipt ${receipt.status}: ${out}`);
  process.exitCode = receipt.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
