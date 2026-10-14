#!/usr/bin/env node
/**
 * ONE SYNC FOR EVERYTHING VENDORED FROM PHAROS-WATCH, so it stops drifting:
 *
 *   npm run sync:pharos-watch -- --source /path/to/pharos-watch            (a local checkout, read-only)
 *   npm run sync:pharos-watch -- --repo <git url> [--ref main]             (shallow, sparse clone into a temp dir)
 *       [--payload <url | file.json | none>]   live payload for logo discovery (default: the public PharosVille
 *                                               /api/stablecoins; a failed fetch only skips that step)
 *
 * In order: logos (public/logos + data/logos.json, scripts/harbour/sync-logos.mjs) → brand colours
 * (data/brand-colors.json, sync-brand-colors.mjs) → the yard's order book (src/harbour/data/prelaunch.json,
 * sync-prelaunch.mjs) → the cemetery (shared/data/dead-stablecoins.json: Wreck Cove's names, causes, epitaphs and
 * obituaries, projected onto shared/'s strict schema; schema-gated by sync-schema.mjs). Everything is planned and
 * validated in memory first: on any schema violation it prints them, writes NOTHING and exits 1.
 * Deterministic and idempotent: a second run against the same source changes no byte. The stamp
 * data/pharos-watch-sync.json (source commit, sync date) is rewritten only when data changed.
 * It never reads or sends a secret: the source is a path, or a clone URL you supply.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { findMediaFileProblems } from "../pharosville/validate-runtime-media.mjs";
import { BRAND_ENTRY, planBrandColors } from "./sync-brand-colors.mjs";
import { planLogos } from "./sync-logos.mjs";
import { buildPrelaunchBook } from "./sync-prelaunch.mjs";
import { loadRedirects, loadRegistry, SOURCE_PATHS } from "./sync-source.mjs";

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DEFAULT_PAYLOAD = "https://pharosville.pharos.watch/api/stablecoins";
export const STAMP = "data/pharos-watch-sync.json";
const FILES = {
  logos: "data/logos.json",
  brand: "data/brand-colors.json",
  prelaunch: "src/harbour/data/prelaunch.json",
  dead: "shared/data/dead-stablecoins.json",
};
/** shared/'s DeadStablecoinAssetSchema is strict: the source's extra fields (logo, mechanismArchetype, recordedAt, …) are dropped. */
const DEAD_KEYS = new Set(["id", "name", "symbol", "llamaId", "pegCurrency", "causeOfDeath", "deathDate", "peakMcap", "epitaph", "obituary", "sourceUrl", "sourceLabel", "contracts"]);

const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const git = async (cwd, ...a) => (await run("git", a, { cwd, maxBuffer: 1 << 26 })).stdout.trim();

async function resolveSource() {
  const repo = opt("--repo", null);
  if (!repo) return { dir: resolve(opt("--source", "/home/ahirice/Documents/git/pharos-watch")), cleanup: async () => {} };
  const dir = await mkdtemp(join(tmpdir(), "pharos-watch-"));
  const ref = opt("--ref", "main");
  await git(dir, "init", "--quiet");
  await git(dir, "remote", "add", "origin", repo);
  await git(dir, "sparse-checkout", "set", "--no-cone", ...SOURCE_PATHS);
  await git(dir, "fetch", "--quiet", "--depth", "1", "--filter=blob:none", "origin", ref);
  await git(dir, "checkout", "--quiet", "FETCH_HEAD");
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function sourceCommit(dir) {
  try {
    const sha = await git(dir, "rev-parse", "HEAD");
    const date = await git(dir, "show", "-s", "--format=%cs", "HEAD");
    const dirty = await git(dir, "status", "--porcelain", "--", ...SOURCE_PATHS);
    return { commit: dirty ? `${sha}+dirty` : sha, commitDate: date };
  } catch {
    return { commit: null, commitDate: null };
  }
}

async function loadPayload() {
  const where = opt("--payload", DEFAULT_PAYLOAD);
  if (where === "none") return null;
  try {
    const payload = /^https?:/.test(where)
      ? await fetch(where, { signal: AbortSignal.timeout(30_000) }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      : await readJson(resolve(where));
    const coins = (payload.peggedAssets ?? []).filter((c) => c && typeof c.id === "string");
    if (!coins.length) throw new Error("no peggedAssets");
    return coins.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  } catch (err) {
    console.warn(`[sync] payload ${where} unavailable (${err instanceof Error ? err.message : err}): live-coin logo discovery skipped`);
    return null;
  }
}

/** `+a -b ~c` id deltas between two id → value maps. */
function idDelta(before, after) {
  const add = Object.keys(after).filter((k) => !(k in before));
  const del = Object.keys(before).filter((k) => !(k in after));
  const mod = Object.keys(after).filter((k) => k in before && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return { add, del, mod };
}
const fmt = ({ add, del, mod }, show = 6) => {
  const list = (xs) => (xs.length ? ` (${xs.slice(0, show).join(", ")}${xs.length > show ? `, …${xs.length - show} more` : ""})` : "");
  return `+${add.length}${list(add)} -${del.length}${list(del)} ~${mod.length}${list(mod)}`;
};
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

const { dir: SOURCE, cleanup } = await resolveSource();
try {
  const problems = [];
  const stampPath = join(ROOT, STAMP);
  const stamp = await readJson(stampPath).catch(() => ({}));
  const payloadCoins = await loadPayload();

  const registry = await loadRegistry(SOURCE);
  const redirects = await loadRedirects(SOURCE, registry);

  // 1. logos
  const L = await planLogos({ root: ROOT, source: SOURCE, registry, redirects, payloadCoins, rasterHashes: stamp.rasterized ?? {} });
  for (const [p, buf] of L.writes) for (const why of findMediaFileProblems(p, buf)) problems.push(`logo ${p}: ${why}`);
  for (const [id, p] of Object.entries(L.logos)) {
    if (typeof p !== "string" || !p.startsWith("/logos/") || p.slice(7).includes("/")) problems.push(`logos.json ${id}: not a top-level /logos/ path: ${p}`);
  }

  // 2. brand colours
  const B = await planBrandColors({ root: ROOT, before: L.before, logos: L.logos, writes: L.writes });
  for (const [id, v] of Object.entries(B.colors)) if (!BRAND_ENTRY.test(v)) problems.push(`brand-colors ${id}: ${v} is not "#rrggbb|#rrggbb"`);

  // 3. the yard's order book
  const P = buildPrelaunchBook(registry, L.logos, B.colors);
  problems.push(...P.problems);
  const prelaunchBefore = await readJson(join(ROOT, FILES.prelaunch)).catch(() => ({ coins: [] }));

  // 4. the cemetery, projected onto shared/'s schema and gated by it
  const deadSrc = await readJson(join(SOURCE, "shared/data/dead-stablecoins.json"));
  if (!Array.isArray(deadSrc)) problems.push("source dead-stablecoins.json is not an array");
  const dead = (Array.isArray(deadSrc) ? deadSrc : []).map((r) => Object.fromEntries(Object.entries(r ?? {}).filter(([k]) => DEAD_KEYS.has(k))));
  const deadText = `${JSON.stringify(dead, null, 2)}\n`;
  const deadBeforeText = await readFile(join(ROOT, FILES.dead), "utf8");
  const tmp = await mkdtemp(join(tmpdir(), "pharos-watch-dead-"));
  try {
    await writeFile(join(tmp, "dead.json"), deadText);
    await run(process.execPath, ["--import", "tsx", join(ROOT, "scripts/harbour/sync-schema.mjs"), join(tmp, "dead.json")], { cwd: ROOT });
  } catch (err) {
    problems.push(...String(err.stderr || err.message).trim().split("\n").filter(Boolean));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  if (problems.length) {
    console.error(`[sync] ${problems.length} schema violation(s); nothing written:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
  } else {
    // write: only what changed, so a no-op sync leaves every byte (and the stamp) alone
    const outputs = [
      [FILES.logos, `${JSON.stringify(L.logos, null, 2)}\n`],
      [FILES.brand, `${JSON.stringify(B.colors, null, 1)}\n`],
      [FILES.prelaunch, `${JSON.stringify(P.book, null, 1)}\n`],
      [FILES.dead, deadText],
    ];
    const changed = [];
    for (const [rel, text] of outputs) {
      const cur = await readFile(join(ROOT, rel), "utf8").catch(() => null);
      if (cur !== text) { await writeFile(join(ROOT, rel), text); changed.push(rel); }
    }
    for (const [p, buf] of L.writes) await writeFile(join(ROOT, "public", p), buf);
    for (const p of L.deletes) await unlink(join(ROOT, "public", p)).catch(() => {});
    const rasterChanged = JSON.stringify(L.rasterHashes) !== JSON.stringify(stamp.rasterized ?? {});
    const anything = changed.length || L.writes.size || L.deletes.length || rasterChanged;
    const src = await sourceCommit(SOURCE);
    if (anything) {
      const rasterized = Object.fromEntries(Object.keys(L.rasterHashes).sort().map((k) => [k, L.rasterHashes[k]]));
      const next = { source: "TokenBrice/pharos-watch", commit: src.commit, commitDate: src.commitDate, syncedAt: new Date().toISOString().slice(0, 10), rasterized };
      await writeFile(stampPath, `${JSON.stringify(next, null, 2)}\n`);
    }

    // summary diff
    const deadBefore = JSON.parse(deadBeforeText);
    const preAfter = P.book.coins;
    console.log(`[sync] source ${SOURCE} @ ${src.commit ?? "(not a git checkout)"}${src.commitDate ? ` (${src.commitDate})` : ""}`);
    console.log(`[sync] logos.json   ${fmt(idDelta(L.before, L.logos))}; files: ${L.writes.size} written, ${L.deletes.length} deleted; live payload covered ${L.payloadCovered}`);
    if (L.rejected.length) console.log(`[sync]   refused broken source logos (entries keep their current file): ${L.rejected.join("; ")}`);
    if (L.missingInSource.length) console.log(`[sync]   source logos.json names files it does not have: ${L.missingInSource.join(", ")}`);
    if (L.payloadMissing.length) console.log(`[sync]   live coins with no Pharos logo (monogram sail): ${L.payloadMissing.length}`);
    console.log(`[sync] brand-colors ${fmt(idDelta(B.before, B.colors))}; derived ${B.derived.length}${B.skipped.length ? `; skipped ${B.skipped.join(", ")}` : ""}`);
    console.log(`[sync] prelaunch    ${P.book.count} coins ${JSON.stringify(P.book.phases)}; ${fmt(idDelta(byId(prelaunchBefore.coins ?? []), byId(preAfter)))}`);
    console.log(`[sync] dead coins   ${dead.length} (was ${deadBefore.length}); ${fmt(idDelta(byId(deadBefore), byId(dead)))}`);
    if (anything) {
      const stat = await git(ROOT, "diff", "--shortstat", "--", ...Object.values(FILES), "public/logos").catch(() => "");
      console.log(`[sync] changed: ${changed.join(", ") || "logo files only"}${stat ? ` (${stat})` : ""}`);
      if (L.writes.size || L.deletes.length) console.log("[sync] logo files changed: rebuild the sail atlas with `node scripts/harbour/build-emblems.mjs` (the sync workflow does it for you)");
    } else {
      console.log("[sync] already in sync: nothing written");
    }
  }
} finally {
  await cleanup();
}
