#!/usr/bin/env node
/**
 * THE SHIPYARD'S ORDER BOOK (P6 D20): the pharos-watch registry's pre-launch coins → src/harbour/data/prelaunch.json,
 * plus their logos into public/logos (only the ones this repo does not have yet), each registered in data/logos.json
 * (validate-runtime-media requires every top-level logo to be referenced there; existing entries are never changed).
 *
 *   node scripts/harbour/sync-prelaunch.mjs --source /home/ahirice/Documents/git/pharos-watch
 *
 * READ-ONLY on the source checkout (the operator authorised reading it): shared/data/stablecoins/coins.generated.json
 * (`status: "pre-launch"` rows), data/logos.json and public/logos/*. Nothing there is written.
 * Milestones keep date / type / title only (the descriptions are long-form and live on pharos.watch/upcoming).
 * The registry carries no issuer field: `issuer` is the jurisdiction's country when stated (the UI may show it as such).
 */
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const at = args.indexOf("--source");
const SOURCE = resolve(at >= 0 && args[at + 1] ? args[at + 1] : "/home/ahirice/Documents/git/pharos-watch");
const OUT = join(ROOT, "src/harbour/data/prelaunch.json");

const exists = (p) => stat(p).then(() => true, () => false);
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));

const rows = await readJson(join(SOURCE, "shared/data/stablecoins/coins.generated.json"));
const srcLogos = await readJson(join(SOURCE, "data/logos.json")).catch(() => ({}));
const ownLogos = await readJson(join(ROOT, "data/logos.json")).catch(() => ({}));
const brand = await readJson(join(ROOT, "data/brand-colors.json")).catch(() => ({}));

const PHASES = new Set(["announced", "testnet", "auditing", "beta", "launching-soon"]);
const pre = (Array.isArray(rows) ? rows : Object.values(rows)).filter((r) => r && r.status === "pre-launch");

const coins = [];
let copied = 0;
const missingLogo = [];
for (const r of pre.sort((a, b) => (a.id < b.id ? -1 : 1))) {
  let logo = ownLogos[r.id] ?? srcLogos[r.id] ?? null;
  if (logo && !logo.startsWith("/logos/")) logo = null;
  if (logo) {
    const dst = join(ROOT, "public", logo);
    if (!(await exists(dst))) {
      const src = join(SOURCE, "public", logo);
      if (await exists(src)) { await mkdir(dirname(dst), { recursive: true }); await copyFile(src, dst); copied++; }
      else logo = null;
    }
  }
  if (!logo) missingLogo.push(r.id);
  const peg = r.flags?.pegCurrency ?? null;
  const milestones = (Array.isArray(r.milestones) ? r.milestones : [])
    .filter((m) => m && typeof m.date === "string" && typeof m.title === "string")
    .map((m) => ({ date: m.date, type: m.type ?? "milestone", title: m.title }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  coins.push({
    id: r.id,
    name: r.name ?? r.symbol ?? r.id,
    symbol: r.symbol ?? r.id,
    pegCurrency: peg,
    pegType: peg ? `pegged${peg}` : "",
    launchPhase: PHASES.has(r.launchPhase) ? r.launchPhase : null,
    launchPhaseDetail: typeof r.launchPhaseDetail === "string" ? r.launchPhaseDetail : null,
    expectedLaunchDate: r.expectedLaunchDate ?? null,
    announcedDate: r.announcedDate ?? null,
    milestones,
    issuer: r.jurisdiction?.country ?? null,
    logo,
    // brand-colors.json holds "light|dark" pairs: the first is the brand colour on a light ground
    brandColor: typeof brand[r.id] === "string" && /^#[0-9a-f]{6}/i.test(brand[r.id]) ? brand[r.id].slice(0, 7).toLowerCase() : null,
    llamaId: r.llamaId != null ? String(r.llamaId) : null,
    geckoId: r.geckoId ?? null,
  });
}

// register the yard's logos (additive: an id already present keeps its own path)
const added = coins.filter((c) => c.logo && !ownLogos[c.id]);
if (added.length) {
  const merged = { ...ownLogos };
  for (const c of added) merged[c.id] = c.logo;
  await writeFile(join(ROOT, "data/logos.json"), JSON.stringify(merged, null, 2) + "\n");
}

const counts = {};
for (const c of coins) counts[c.launchPhase ?? "null"] = (counts[c.launchPhase ?? "null"] ?? 0) + 1;
const out = { source: "pharos-watch shared/data/stablecoins/coins.generated.json (status: pre-launch)", count: coins.length, phases: counts, coins };
await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`[prelaunch] ${coins.length} coins ${JSON.stringify(counts)} → ${basename(OUT)}; ${copied} logos copied, ${added.length} registered in data/logos.json; no logo: ${missingLogo.join(", ") || "none"}`);
