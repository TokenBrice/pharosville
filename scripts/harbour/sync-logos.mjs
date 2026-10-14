#!/usr/bin/env node
/**
 * SAIL LOGOS (P7 d): every coin in the live payload → its Pharos logo, copied from the pharos-watch checkout into
 * public/logos and registered in data/logos.json (validate-runtime-media requires every top-level logo there).
 * Then run build-emblems.mjs to rebuild the sail atlas.
 *
 *   node scripts/harbour/sync-logos.mjs [--source /path/to/pharos-watch] [--payload <file.json | http(s) url>]
 *
 * READ-ONLY on the source checkout (operator-authorised): data/logos.json (slug ids), public/logos/<llamaId>-*.ext
 * (DefiLlama-only coins carry their numeric llama id as the payload id), and the legacy llama → slug redirects.
 * Resolution per payload id: own data/logos.json entry (kept as is) → source logos.json → source `<id>-*` file →
 * redirect slug's logo → the same coin (symbol + name) in the registry, then in the cemetery (dead coins DefiLlama still
 * lists; their logo is copied to the top level as `<id>-<file>`). A coin with none of these has no logo on
 * pharos.watch either (it shows an initial there), so the sail keeps its monogram.
 */
import { execFile } from "node:child_process";
import { copyFile, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SOURCE = resolve(opt("--source", "/home/ahirice/Documents/git/pharos-watch"));
const PAYLOAD = opt("--payload", "http://localhost:5190/api/stablecoins");

const exists = (p) => stat(p).then(() => true, () => false);
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const IMAGE = /\.(png|jpe?g|svg|webp)$/i;
const run = promisify(execFile);
/** An .svg that is mostly an embedded base64 bitmap (the media validator rejects those): rasterise it to .png instead. */
async function rasterDominatedSvg(file) {
  if (!file.toLowerCase().endsWith(".svg")) return false;
  const text = await readFile(file, "utf8");
  let raster = 0;
  for (const m of text.matchAll(/data:image\/[a-z]+;base64,\s*([A-Za-z0-9+/=\s]+)/gi)) raster += m[1].length;
  return raster * 2 > text.length;
}

const payload = /^https?:/.test(PAYLOAD) ? await (await fetch(PAYLOAD)).json() : await readJson(PAYLOAD);
const coins = (payload.peggedAssets ?? []).filter((c) => c && typeof c.id === "string");
if (!coins.length) throw new Error(`no peggedAssets in ${PAYLOAD}`);

const own = await readJson(join(ROOT, "data/logos.json"));
const src = await readJson(join(SOURCE, "data/logos.json"));
const redirects = await readJson(join(SOURCE, "shared/data/stablecoins/legacy-llama-redirects.generated.json")).catch(() => ({}));
const srcFiles = (await readdir(join(SOURCE, "public/logos"), { withFileTypes: true })).filter((e) => e.isFile() && IMAGE.test(e.name)).map((e) => e.name);

const registry = await readJson(join(SOURCE, "shared/data/stablecoins/coins.generated.json")).catch(() => []);
const dead = await readJson(join(SOURCE, "shared/data/dead-stablecoins.json")).catch(() => []);
const prelaunch = (await readJson(join(ROOT, "src/harbour/data/prelaunch.json")).catch(() => ({}))).coins ?? [];
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** Same symbol and the same name (or one name containing the other, ≥ 4 letters): "Revolut Euro" ↔ "Revolut Euro", "GRAI" ↔ "Gravita GRAI". */
const sameCoin = (c, r) => norm(c.symbol) === norm(r.symbol) && (() => {
  const [x, y] = [norm(c.name), norm(r.name)].sort((p, q) => p.length - q.length);
  return x === y || (x.length >= 4 && y.includes(x));
})();
const topLevel = (p) => typeof p === "string" && p.startsWith("/logos/") && !p.slice("/logos/".length).includes("/") && IMAGE.test(p);

/** { from (source file), logo (this repo's /logos/ path) } for a payload coin, or null. */
function sourceLogo(c) {
  const id = c.id;
  const hit = (p) => (topLevel(p) ? { from: join(SOURCE, "public", p), logo: p } : null);
  if (src[id]) return hit(src[id]);
  if (!/^\d+$/.test(id)) return null;
  // DefiLlama-only coins: the llama id is the payload id
  const f = srcFiles.filter((n) => n.startsWith(`${id}-`)).sort()[0];
  if (f) return hit(`/logos/${f}`);
  // a registry pre-launch coin DefiLlama already lists (src/harbour/data/prelaunch.json llamaId)
  const pre = prelaunch.find((r) => r && r.llamaId === id && topLevel(r.logo));
  if (pre) return hit(pre.logo);
  const slug = typeof redirects[id] === "string" ? redirects[id].match(/^\/stablecoin\/([^/]+)\/?$/)?.[1] : null;
  if (slug && src[slug]) return hit(src[slug]);
  // the same coin under its registry slug (pre-launch/tracked rows), then the cemetery (dead coins DefiLlama still lists)
  const reg = (Array.isArray(registry) ? registry : []).find((r) => r && src[r.id] && sameCoin(c, r));
  if (reg) return hit(src[reg.id]);
  // a retired registry slug `<symbol>-<issuer>` whose issuer is in the coin's name or gecko id ("mnee-mnee" ↔ "MNEE USD")
  const sym = norm(c.symbol), named = `${norm(c.name)} ${norm(c.geckoId)}`;
  const slugHit = [...new Set([...Object.keys(src), ...Object.keys(own)])].sort().find((k) => {
    const [head, ...rest] = k.split("-");
    const issuer = norm(rest.join(""));
    return norm(head) === sym && issuer.length >= 3 && named.includes(issuer);
  });
  if (slugHit) return topLevel(own[slugHit]) ? { from: join(ROOT, "public", own[slugHit]), logo: own[slugHit] } : hit(src[slugHit]);
  const d = (Array.isArray(dead) ? dead : []).find((r) => r && typeof r.logo === "string" && sameCoin(c, r));
  if (d) {
    const rel = d.logo.startsWith("/") ? d.logo : `/logos/cemetery/${d.logo}`;
    if (!IMAGE.test(rel)) return null;
    return { from: join(SOURCE, "public", rel), logo: `/logos/${id}-${rel.split("/").pop()}` };
  }
  return null;
}

const merged = { ...own };
let copied = 0, added = 0;
const missing = [];
for (const c of coins) {
  if (merged[c.id] && await exists(join(ROOT, "public", merged[c.id]))) continue;
  const found = sourceLogo(c);
  if (!found || !(await exists(found.from))) { missing.push(`${c.id} ${c.symbol}`); continue; }
  let { logo } = found;
  const { from } = found;
  if (await rasterDominatedSvg(from)) {
    logo = logo.replace(/\.svg$/i, ".png");
    await rm(join(ROOT, "public", logo.replace(/\.png$/, ".svg")), { force: true });
    if (!(await exists(join(ROOT, "public", logo)))) { await run("rsvg-convert", ["-w", "256", "-a", "-b", "none", "-o", join(ROOT, "public", logo), from]); copied++; }
  } else if (!(await exists(join(ROOT, "public", logo)))) {
    await copyFile(from, join(ROOT, "public", logo));
    copied++;
  }
  merged[c.id] = logo;
  added++;
}
if (added) await writeFile(join(ROOT, "data/logos.json"), JSON.stringify(merged, null, 2) + "\n");
const covered = coins.filter((c) => merged[c.id]).length;
console.log(`[logos] ${covered}/${coins.length} payload coins have a logo (+${added} registered, ${copied} files copied)`);
if (missing.length) console.log(`[logos] no Pharos logo (monogram): ${missing.join(", ")}`);
