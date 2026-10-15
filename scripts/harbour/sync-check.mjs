#!/usr/bin/env node
/**
 * Staleness guard for the vendored pharos-watch data (`npm run check:pharos-watch-sync`, part of validate:docs).
 * FAILS when the order book or the logo book points at a file that is not in public/ (or a yard logo is not in
 * data/logos.json). WARNS, never fails, when the sync stamp (data/pharos-watch-sync.json) is missing or older than
 * 30 days: run `npm run sync:pharos-watch -- --source <pharos-watch checkout>` (docs/pharosville/OPERATIONS.md).
 * Also FAILS when shared/data/stablecoins/runtime-slim.json is stale against coins.generated.json + canonical-order.json.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_AGE_DAYS = 30;
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

export const RUNTIME_SLIM = "shared/data/stablecoins/runtime-slim.json";
/** The fields the browser reads from a pre-launch coin (src/harbour/ui/yard.ts) or a frozen one (shared/lib/cemetery-runtime.ts's shape). */
const SLIM_KEYS = ["id", "name", "symbol", "status", "llamaId", "flags", "launchPhase", "launchPhaseDetail", "expectedLaunchDate", "milestones", "obituary", "contracts"];
/**
 * The browser's registry: only the pre-launch and frozen coins, in canonical order, trimmed to SLIM_KEYS
 * (flags to pegCurrency), so the full 200-odd-coin registry never ships. Returns the file's exact text.
 */
export function buildRuntimeSlim(coins = readJson("shared/data/stablecoins/coins.generated.json"), order = readJson("shared/data/stablecoins/canonical-order.json")) {
  const byId = new Map(coins.map((c) => [c.id, c]));
  const slim = order.flatMap((id) => {
    const c = byId.get(id);
    if (!c || (c.status !== "pre-launch" && c.status !== "frozen")) return [];
    const row = {};
    for (const k of SLIM_KEYS) if (c[k] !== undefined) row[k] = k === "flags" ? { pegCurrency: c.flags.pegCurrency } : c[k];
    return [row];
  });
  return `${JSON.stringify(slim, null, 1)}\n`;
}

function main() {
  const errors = [];
  const onDisk = (p) => typeof p === "string" && p.startsWith("/") && existsSync(join(ROOT, "public", p));

  const logos = readJson("data/logos.json");
  for (const [id, p] of Object.entries(logos)) if (!onDisk(p)) errors.push(`data/logos.json ${id} → ${p} does not exist in public/`);
  const book = readJson("src/harbour/data/prelaunch.json");
  const listed = new Set(Object.values(logos));
  for (const c of book.coins ?? []) {
    if (c.logo == null) continue;
    if (!onDisk(c.logo)) errors.push(`src/harbour/data/prelaunch.json ${c.id} → ${c.logo} does not exist in public/`);
    else if (!listed.has(c.logo)) errors.push(`src/harbour/data/prelaunch.json ${c.id} → ${c.logo} is not registered in data/logos.json`);
  }
  if (book.count !== (book.coins ?? []).length) errors.push(`src/harbour/data/prelaunch.json count ${book.count} ≠ ${(book.coins ?? []).length} coins`);

  let stamp = null;
  try { stamp = readJson("data/pharos-watch-sync.json"); } catch { /* reported below */ }
  const age = stamp?.syncedAt ? Math.floor((Date.now() - Date.parse(`${stamp.syncedAt}T00:00:00Z`)) / 86_400_000) : null;
  if (age === null || Number.isNaN(age)) {
    console.warn("WARN pharos-watch sync stamp missing: run `npm run sync:pharos-watch -- --source <pharos-watch checkout>`");
  } else if (age > MAX_AGE_DAYS) {
    console.warn(`WARN pharos-watch data last changed by a sync ${age} days ago (${stamp.syncedAt}, source ${String(stamp.commit).slice(0, 12)}): run \`npm run sync:pharos-watch\` (no diff simply means it is still current)`);
  }

  let slimText = null;
  try { slimText = readFileSync(join(ROOT, RUNTIME_SLIM), "utf8"); } catch { /* reported below */ }
  if (slimText !== buildRuntimeSlim()) errors.push(`${RUNTIME_SLIM} is stale against coins.generated.json + canonical-order.json: run \`npm run sync:pharos-watch\``);

  if (errors.length) {
    console.error("pharos-watch vendored data check failed:");
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log(`pharos-watch vendored data ok: ${Object.keys(logos).length} logos, ${book.coins?.length ?? 0} yard coins${age === null || Number.isNaN(age) ? "" : `, synced ${age} day(s) ago`}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
