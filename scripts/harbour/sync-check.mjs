#!/usr/bin/env node
/**
 * Staleness guard for the vendored pharos-watch data (`npm run check:pharos-watch-sync`, part of validate:docs).
 * FAILS when the order book or the logo book points at a file that is not in public/ (or a yard logo is not in
 * data/logos.json). WARNS, never fails, when the sync stamp (data/pharos-watch-sync.json) is missing or older than
 * 30 days: run `npm run sync:pharos-watch -- --source <pharos-watch checkout>` (docs/pharosville/OPERATIONS.md).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_AGE_DAYS = 30;
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
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

if (errors.length) {
  console.error("pharos-watch vendored data check failed:");
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`pharos-watch vendored data ok: ${Object.keys(logos).length} logos, ${book.coins?.length ?? 0} yard coins${age === null || Number.isNaN(age) ? "" : `, synced ${age} day(s) ago`}.`);
