#!/usr/bin/env node
import { readFile, stat, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync, brotliCompressSync } from "node:zlib";

const root = fileURLToPath(new URL("../../", import.meta.url));
const textFile = /\.(?:js|css|json|html|svg|webmanifest)$/;
async function exists(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}
function localUrl(value, base = "/") {
  const url = new URL(value, `https://ledger.invalid${base}`);
  if (url.origin !== "https://ledger.invalid") throw new Error(`External dependency is not statically measurable: ${value}`);
  return decodeURIComponent(url.pathname);
}
function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3]]));
}
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]))).flat();
}
/** Resolve references against the emitted graph, including Vite preload arrays, URL assets and CSS fonts.
 * Only actual output paths are followed: no worker/seed/font filename conventions are assumed.
 */
export function emittedReferences(source, from, emitted) {
  // shortcut: follows literal emitted URLs; use a Vite graph manifest if the build starts synthesizing paths.
  const refs = new Set();
  const add = (value) => {
    if (/^(?:data:|https?:|#|\/\/)/i.test(value)) return;
    for (const base of [from, "/"]) {
      let url;
      try { url = localUrl(value, base); } catch { continue; }
      if (emitted.has(url)) { refs.add(url); break; }
    }
  };
  for (const match of source.matchAll(/["'`]([^"'`\s]+)["'`]/g)) add(match[1]);
  for (const match of source.matchAll(/url\(\s*["']?([^"'()\s]+)["']?\s*\)/g)) add(match[1]);
  return [...refs];
}
/** No browser or timing cut-off: this ledger cannot shrink merely because rendering happened earlier. */
export async function collectBytes({ dist = resolve(root, "dist"), publicDir = resolve(root, "public") } = {}) {
  dist = resolve(dist); publicDir = resolve(publicDir);
  const html = await readFile(resolve(dist, "index.html"), "utf8");
  let registry = { urls: {}, models: {} };
  if (await exists(resolve(dist, "asset-registry.json"))) registry = JSON.parse(await readFile(resolve(dist, "asset-registry.json"), "utf8"));
  const dependencies = new Map(), preloads = [], preloadAudit = [];
  const locate = async (url) => {
    for (const base of [dist, publicDir]) {
      const file = resolve(base, `.${url}`);
      if (!file.startsWith(base + sep)) throw new Error(`Asset escapes root: ${url}`);
      if (await exists(file)) return file;
    }
    throw new Error(`Missing dependency ${url}; build the selected dist first`);
  };
  const add = (url, category, reason, ledger = "base") => {
    url = localUrl(url);
    url = registry.models[url]?.url ?? registry.urls[url] ?? url;
    const existing = dependencies.get(url);
    if (existing) { existing.reasons.push(reason); return; }
    dependencies.set(url, { url, category, ledger, reasons: [reason] });
  };
  add("/index.html", "shell", "document");
  for (const match of html.matchAll(/<(?:link|script)\b[^>]*>/gi)) {
    const a = attrs(match[0]), rel = (a["data-pv-preload"] ?? a.rel)?.toLowerCase();
    if (rel === "preload" || rel === "modulepreload") preloadAudit.push({
      href: a.href ?? null, rel, as: a.as ?? null, media: a.media ?? null,
      admissionInert: !!a["data-pv-preload"], fetchpriority: a.fetchpriority ?? "auto",
      crossorigin: a.crossorigin ?? (/\bcrossorigin(?:\s|\/?>)/i.test(match[0]) ? "anonymous" : null),
      note: a["data-pv-preload"] ? "Activated by bootstrap after screen AND viewport admission"
        : a.media ? "Viewport media predicate only; physical-screen gate must be audited separately" : "Unconditional hint",
    });
    if (rel === "modulepreload" || (a.type === "module" && a.src)) add(a.href ?? a.src, "javascript", "entry/modulepreload");
    if (rel === "stylesheet") add(a.href, "shell", "stylesheet");
    if (rel === "preload") {
      preloads.push(a);
      if (a.href) add(a.href, a.as === "fetch" ? "world-preload" : "shell", `${a.as} preload`);
      // Responsive poster alternatives are inventoried below, not all charged to a single frame.
      if (!a.href && a.imagesrcset) {
        const alternatives = a.imagesrcset.split(",").map((item) => item.trim().split(/\s+/));
        const largest = alternatives.sort((a, b) => parseInt(b[1] ?? "0") - parseInt(a[1] ?? "0"))[0];
        if (largest) add(largest[0], "shell", "largest responsive poster preload (conservative desktop arm)");
      }
    }
  }
  const manifests = [...dependencies.keys()].filter((url) => /\/manifest(?:[.-][^/]*)?\.json$/.test(url));
  if (!manifests.length) throw new Error("No first-frame manifests found in built HTML preloads");
  if (![...dependencies.keys()].some((url) => /\/layout[^/]*\.json$/.test(url))) throw new Error("Missing layout JSON preload");
  for (const manifestUrl of manifests) {
    const manifest = JSON.parse(await readFile(await locate(manifestUrl), "utf8"));
    const original = Object.entries(registry.urls).find(([, value]) => value === manifestUrl)?.[0] ?? manifestUrl;
    const base = original.slice(0, original.lastIndexOf("/") + 1);
    // Match the eager loader/prefetch sets, not deferred wreck_kit.items. Civic kinds include
    // the current prefetch-only hull-stages entry: this is a conservative eager frontier.
    const specs = [...(manifest.hulls ?? []), ...(manifest.props ?? []), ...Object.values(manifest.kinds ?? {})];
    if (!specs.length) throw new Error(`Unrecognized eager manifest: ${manifestUrl}`);
    const transportRef = (value) => typeof value === "string" ? value : value?.url ?? value?.file;
    const pack = transportRef(manifest.pack);
    if (pack) add(localUrl(pack, base), "geometry", `eager pack in ${manifestUrl}`, manifest.hulls ? "fleet" : "base");
    for (const spec of specs) {
      const refs = pack ? [] : [transportRef(spec.transport) ?? transportRef(spec.pack) ?? spec.url ?? spec.file,
        transportRef(spec.lodTransport) ?? transportRef(spec.lod)];
      for (const ref of refs.filter(Boolean)) {
        let url = localUrl(ref, base);
        // Generated registry transport is explicit; only unbuilt legacy manifests use gzip siblings.
        url = registry.models[url]?.url ?? registry.urls[url] ?? url;
        if (!spec.transport && !spec.pack && url.endsWith(".glb")) {
          try { await locate(`${url}.gz`); url += ".gz"; } catch { /* plain GLB transport */ }
        }
        add(url, "geometry", `eager file in ${manifestUrl}`, manifest.hulls ? "fleet" : "base");
      }
    }
  }
  // Fleet slot metadata is awaited, unlike the large emblem image and deferred crests/lettering.
  const emblemMap = (await walk(resolve(publicDir, "harbour"))).find((file) => /(?:^|\/)emblems(?:[.-][^/]*)?\.json$/.test(file));
  if (!emblemMap) throw new Error("Missing fleet emblem metadata");
  add("/" + relative(publicDir, emblemMap).split(sep).join("/"), "metadata", "fleet emblem slots", "fleet");
  const legacyUrls = new Set(dependencies.keys());
  const emitted = new Set((await walk(dist)).map((file) => "/" + relative(dist, file).split(sep).join("/")));
  const visited = new Set();
  for (const dependency of dependencies.values()) {
    if (visited.has(dependency.url) || !/\.(?:js|css|html)$/.test(dependency.url)) continue;
    visited.add(dependency.url);
    const source = await readFile(await locate(dependency.url), "utf8");
    const workers = new Set([...source.matchAll(/new\s+(?:Shared)?Worker\(\s*new URL\(\s*["']([^"']+)["']/g)]
      .flatMap((match) => emittedReferences(JSON.stringify(match[1]), dependency.url, emitted)));
    for (const ref of emittedReferences(source, dependency.url, emitted)) {
      add(ref, ref.endsWith(".js") ? "javascript" : ref.endsWith(".css") ? "shell" : "emitted-asset",
        `emitted reference from ${dependency.url}`, workers.has(ref) ? "fleet" : dependency.ledger);
    }
  }
  const files = [];
  for (const dependency of dependencies.values()) {
    const file = await locate(dependency.url), data = await readFile(file), text = textFile.test(file);
    files.push({ ...dependency, storedBytes: data.length,
      gzipBodyBytes: text ? gzipSync(data, { level: 9 }).length : data.length,
      brotliBodyBytes: text ? brotliCompressSync(data).length : data.length });
  }
  files.sort((a, b) => a.url.localeCompare(b.url));
  const media = [];
  for (const file of await walk(resolve(publicDir, "harbour"))) {
    if (!/\.(?:glb(?:\.(?:gz|br))?|webp|avif|png|jpe?g|ktx2|bin|pack)$/.test(file)) continue;
    media.push({ url: "/" + relative(publicDir, file).split(sep).join("/"), storedBytes: (await stat(file)).size });
  }
  media.sort((a, b) => a.url.localeCompare(b.url));
  const sums = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0);
  const totals = { firstFrameStoredBytes: sums(files, "storedBytes"), firstFrameGzipBodyBytes: sums(files, "gzipBodyBytes"),
    firstFrameBrotliBodyBytes: sums(files, "brotliBodyBytes"), harbourMediaStoredBytes: sums(media, "storedBytes") };
  const categories = Object.fromEntries([...new Set(files.map((file) => file.category))].map((category) => [category,
    sums(files.filter((file) => file.category === category), "gzipBodyBytes")]));
  const ledger = (rows) => ({ storedBytes: sums(rows, "storedBytes"), gzipBodyBytes: sums(rows, "gzipBodyBytes"), brotliBodyBytes: sums(rows, "brotliBodyBytes"), files: rows.map((row) => row.url) });
  const legacy = files.filter((file) => legacyUrls.has(file.url));
  const legacyTotals = { firstFrameStoredBytes: sums(legacy, "storedBytes"), firstFrameGzipBodyBytes: sums(legacy, "gzipBodyBytes"), firstFrameBrotliBodyBytes: sums(legacy, "brotliBodyBytes"), harbourMediaStoredBytes: totals.harbourMediaStoredBytes };
  const legacyCategories = Object.fromEntries([...new Set(legacy.map((file) => file.category))].map((category) => [category,
    sums(legacy.filter((file) => file.category === category), "gzipBodyBytes")]));
  const decorative = media.filter((item) => !dependencies.has(registry.models[item.url]?.url ?? registry.urls[item.url] ?? item.url))
    .map((item) => ({ ...item, gzipBodyBytes: item.storedBytes, brotliBodyBytes: item.storedBytes }));
  const ledgers = { base: ledger(files.filter((file) => file.ledger === "base")), fleet: ledger(files.filter((file) => file.ledger === "fleet")), decorative: ledger(decorative) };
  return { schemaVersion: 2, legacyTotals, legacyCategories, ledgers, dist, publicDir, totals, categories, files, media, preloads, preloadAudit,
    notes: ["Static immutable dependency ledger, not completed-before-frame network bytes. Includes shell/poster/font lead; includes emitted worker/seed/CSS/font dependencies; excludes live API payloads. Decorative media inventory is separate and may contain alternate transports.",
      "gzip/Brotli body estimates compress text only; binary transport bytes follow manifest URLs. No HTTP headers, latency, partial-response timing or CDN negotiation is modeled.",
      "Media inventory includes decoded source GLBs and encoded siblings, including deferred assets; it is stored bytes, not startup traffic."] };
}
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { values } = parseArgs({ options: { help: { type: "boolean" }, dist: { type: "string", default: resolve(root, "dist") },
    public: { type: "string", default: resolve(root, "public") }, budgets: { type: "string", default: resolve(root, "scripts/perf/budgets.json") }, json: { type: "string" } } });
  if (values.help) {
    console.log("Usage: node scripts/perf/first-frame-bytes.mjs [--dist dist] [--public public] [--budgets FILE] [--json FILE]\nCI-safe static first-frame dependency + complete harbour media ledger.\nBudgets are measured bytes + 5%; regressions exit 1. Missing build/assets exit 1.\nNo GPU/browser/API key required. Never updates budgets automatically.");
  } else {
    try {
      const ledger = await collectBytes({ dist: values.dist, publicDir: values.public });
      const budgets = JSON.parse(await readFile(resolve(values.budgets), "utf8"));
      const checks = [];
      // The budgets were measured on the original frontier: compare like with like until the complete
      // ledgers (which charge alternate formats and on-demand logos) get budgets of their own.
      for (const [name, max] of Object.entries(budgets.totals)) checks.push({ name, bytes: ledger.legacyTotals[name], max });
      for (const [name, max] of Object.entries(budgets.categories)) checks.push({ name: `category:${name}`, bytes: ledger.legacyCategories[name], max });
      // New assets cannot escape review merely by being added after the baseline.
      const mediaBudgets = budgets.media;
      for (const item of ledger.media) checks.push({ name: item.url, bytes: item.storedBytes, max: mediaBudgets[item.url] });
      for (const check of checks) check.pass = Number.isFinite(check.bytes) && Number.isFinite(check.max) && check.bytes <= check.max;
      const failed = checks.filter((check) => !check.pass);
      ledger.checks = checks; ledger.status = failed.length ? "FAIL" : "PASS";
      for (const [name, bytes] of Object.entries(ledger.legacyTotals)) console.log(`${name}: ${bytes.toLocaleString("en-US")} B (budget ${budgets.totals[name]?.toLocaleString("en-US")} B)`);
      for (const [name, { storedBytes, gzipBodyBytes }] of Object.entries(ledger.ledgers)) console.log(`complete ${name} ledger (reported, not budgeted): ${storedBytes.toLocaleString("en-US")} B stored, ${gzipBodyBytes.toLocaleString("en-US")} B gzip`);
      for (const check of failed) console.error(`OVER BUDGET: ${check.name}: ${check.bytes} B > ${check.max ?? "no baseline"}`);
      if (values.json) { const path = resolve(values.json); await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(ledger, null, 2) + "\n"); }
      console.log(`${ledger.status}: static first-frame and media bytes`);
      if (failed.length) process.exitCode = 1;
    } catch (error) { console.error(`FAIL: ${error.message}`); process.exitCode = 1; }
  }
}
