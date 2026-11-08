#!/usr/bin/env node
// Collate lane reports into reports/*.json|md and master tables (_ideas.md, _findings.md, _decisions.md, _picks.md).
// Sol lanes: copy <artifact_dir>/msg.txt (JSON) from the codex job journal. Opus lanes: reports/O*-*.json.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const REP = join(ROOT, "reports");
const JOBS = "/home/ahirice/.local/state/codex-cc-mcp/jobs";
const SOL = Object.fromEntries(
  readFileSync(join(ROOT, "JOBS.md"), "utf8").split("\n")
    .map((l) => l.match(/^\| (S\d\d) \| (.+?) \| \w+ \| (cx_\w+) \|/)).filter(Boolean)
    .map((m) => [m[1], { topic: m[2], job: m[3] }]),
);
// Round-2 or re-run overrides: reports/_job-overrides.json { "S09": "cx_..." }
const OV = existsSync(join(REP, "_job-overrides.json")) ? JSON.parse(readFileSync(join(REP, "_job-overrides.json"), "utf8")) : {};
for (const [k, v] of Object.entries(OV)) SOL[k] = { ...(SOL[k] ?? { topic: k }), job: v };

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const md = (r) => {
  const L = [`# ${r.lane}`, "", "## Executive summary", "", r.executive_summary, "", "## Current state", ""];
  for (const s of r.current_state) L.push(`- ${s}`);
  L.push("", "## Findings", "");
  for (const f of r.findings) L.push(`### ${f.id} [${f.severity}] ${f.title}`, "", `- Evidence: ${f.evidence}`, `- Detail: ${f.detail}`, `- Fix: ${f.fix}`, "");
  L.push("## Ideas", "");
  for (const i of r.ideas) {
    L.push(`### ${i.id} ${i.title}`, "", `*${i.pillar} · ${i.meaning} · effort ${i.effort} · impact ${i.impact} · confidence ${i.confidence}*`, "",
      `- What: ${i.what}`, `- Visitor benefit: ${i.visitor_benefit}`, `- Data/DOM: ${i.data_and_dom}`, `- Where: ${i.where}`,
      `- Perf: ${i.perf_cost}`, `- Risks: ${i.risks}`, `- Depends on: ${i.depends_on.join(", ") || "—"}`, "");
  }
  L.push("## Top picks", "");
  r.top_picks.forEach((p, n) => L.push(`${n + 1}. ${p.id} — ${p.why}`));
  L.push("", "## Operator decisions", "", ...r.operator_decisions.map((d) => `- ${d}`), "", "## Cross-lane hooks", "", ...r.cross_lane_hooks.map((d) => `- ${d}`), "");
  return L.join("\n");
};

const reports = [];
const status = [];
for (const [lane, { topic, job }] of Object.entries(SOL)) {
  const msg = join(JOBS, job, "msg.txt");
  if (!existsSync(msg)) { status.push(`${lane} pending (${job})`); continue; }
  const raw = readFileSync(msg, "utf8").trim();
  let r;
  try { r = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { status.push(`${lane} UNPARSEABLE (${job})`); continue; }
  const name = `${lane}-${slug(topic)}`;
  writeFileSync(join(REP, `${name}.json`), JSON.stringify(r, null, 2));
  writeFileSync(join(REP, `${name}.md`), md(r));
  reports.push({ lane, r });
  status.push(`${lane} ok: ${r.ideas.length} ideas, ${r.findings.length} findings`);
}
for (const f of readdirSync(REP).filter((f) => /^O\d+-.+\.json$/.test(f))) {
  try {
    const r = JSON.parse(readFileSync(join(REP, f), "utf8"));
    reports.push({ lane: f.split("-")[0], r });
    status.push(`${f.split("-")[0]} ok: ${r.ideas?.length ?? 0} ideas, ${r.findings?.length ?? 0} findings`);
  } catch { status.push(`${f} UNPARSEABLE`); }
}

const EW = { S: 1, M: 1.6, L: 2.6, XL: 4 };
const ideas = reports.flatMap(({ lane, r }) => (r.ideas ?? []).map((i) => ({ lane, ...i, score: (i.impact * i.confidence) / (EW[i.effort] ?? 2) })));
ideas.sort((a, b) => b.score - a.score);
const cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
writeFileSync(join(REP, "_ideas.md"), [
  `# All ideas (${ideas.length}), ranked by impact × confidence ÷ effort weight (S1 M1.6 L2.6 XL4)`, "",
  "| score | id | pillar | meaning | eff | imp | conf | title |", "|---|---|---|---|---|---|---|---|",
  ...ideas.map((i) => `| ${i.score.toFixed(1)} | ${i.id} | ${i.pillar} | ${i.meaning} | ${i.effort} | ${i.impact} | ${i.confidence} | ${cell(i.title)} |`),
].join("\n") + "\n");
const SV = { critical: 0, high: 1, medium: 2, low: 3 };
const findings = reports.flatMap(({ lane, r }) => (r.findings ?? []).map((f) => ({ lane, ...f }))).sort((a, b) => SV[a.severity] - SV[b.severity]);
writeFileSync(join(REP, "_findings.md"), [
  `# All findings (${findings.length}), by severity`, "", "| sev | id | title | evidence |", "|---|---|---|---|",
  ...findings.map((f) => `| ${f.severity} | ${f.id} | ${cell(f.title)} | ${cell(f.evidence).slice(0, 140)} |`),
].join("\n") + "\n");
writeFileSync(join(REP, "_decisions.md"), reports.map(({ lane, r }) => [`## ${lane}`, ...(r.operator_decisions ?? []).map((d) => `- ${d}`)].join("\n")).join("\n\n") + "\n");
writeFileSync(join(REP, "_picks.md"), reports.map(({ lane, r }) => [`## ${lane} — ${cell(r.executive_summary).slice(0, 600)}`, ...(r.top_picks ?? []).map((p, n) => `${n + 1}. ${p.id} — ${cell(p.why)}`)].join("\n")).join("\n\n") + "\n");
console.log(status.join("\n"));
console.log(`\nideas ${ideas.length} · findings ${findings.length} (critical ${findings.filter((f) => f.severity === "critical").length}, high ${findings.filter((f) => f.severity === "high").length})`);
