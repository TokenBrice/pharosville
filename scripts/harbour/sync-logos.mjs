/**
 * SAIL LOGOS (P7 d, unified into `npm run sync:pharos-watch`): the pharos-watch logo book → public/logos + data/logos.json.
 * A library step of scripts/harbour/sync-pharos-watch.mjs; it plans every change in memory and writes nothing itself.
 *
 * READ-ONLY on the source checkout: data/logos.json (slug ids), public/logos/* (top level and cemetery/) and the
 * cemetery; the registry and the legacy llama → slug redirects come in from sync-source.mjs.
 *   1. every slug in the source logos.json is mirrored (its path, and its bytes when they differ); an id whose path moved
 *      (a .svg the source re-issued as .png) carries every other entry that shared the old file along with it;
 *   2. every other entry here (DefiLlama-only llama ids, retired slugs) keeps its path and refreshes its bytes from the
 *      same-named source file (top level, or the cemetery for a `<id>-<file>` copy);
 *   3. payload coins with no logo yet resolve through the matching chain below (own entry → source logos.json → source
 *      `<id>-*` file → registry llama id → redirect slug → the same coin by symbol + name in the registry, then the
 *      cemetery → identity/name match). A coin with none of these has no logo on pharos.watch either (the sail keeps
 *      its monogram).
 * An .svg that is mostly an embedded bitmap, or past the media validator's vector ceiling, is rasterised to a 256 px
 * .png (sharp, pinned by the lockfile, so CI and local runs agree); the source .svg hash is kept in the sync stamp so it
 * is only re-rasterised when the source changes. Files this run leaves unreferenced are deleted.
 * Runtime-only lossless WebP alternates and logos/lossless.json are regenerated alongside the originals;
 * originals stay the emblem/brand-colour build sources, and only smaller, exact RGBA alternates are selected.
 */
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { findMediaFileProblems, MAX_SVG_BYTES } from "../pharosville/validate-runtime-media.mjs";

const IMAGE = /\.(png|jpe?g|svg|webp)$/i;
const exists = (p) => stat(p).then(() => true, () => false);
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
const readOrNull = (p) => readFile(p).catch(() => null);
export const sha12 = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);
const topLevel = (p) => typeof p === "string" && p.startsWith("/logos/") && !p.slice("/logos/".length).includes("/") && IMAGE.test(p);
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** An .svg the runtime-media validator would reject as vector art: mostly base64 raster, or past the size ceiling. */
function needsRaster(path, buf) {
  if (!path.toLowerCase().endsWith(".svg")) return false;
  if (buf.length > MAX_SVG_BYTES) return true;
  const text = buf.toString("utf8");
  let raster = 0;
  for (const m of text.matchAll(/data:image\/[a-z]+;base64,\s*([A-Za-z0-9+/=\s]+)/gi)) raster += m[1].length;
  return raster * 2 > text.length;
}

async function rasterise(buf) {
  const { default: sharp } = await import("sharp");
  return sharp(buf, { density: 300 }).resize({ width: 256 }).png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Runtime-only alternate; originals remain the emblem builder's source book.
 * Compare the complete decoded RGBA buffer (including alpha and hidden RGB),
 * preserve colour/orientation metadata, and keep the source unless WebP wins.
 */
export async function losslessLogo(logoPath, bytes) {
  if (!/\.(?:png|jpe?g|webp)$/i.test(logoPath)) return null;
  const { default: sharp } = await import("sharp");
  const metadata = await sharp(bytes).metadata();
  if ((metadata.pages ?? 1) > 1) return null;
  const candidate = await sharp(bytes).keepMetadata().webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
  if (candidate.length >= bytes.length) return null;
  if (findMediaFileProblems(`${logoPath}.lossless.webp`, candidate).length) return null;
  const before = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(candidate).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (before.info.width !== after.info.width || before.info.height !== after.info.height || before.info.channels !== after.info.channels || !before.data.equals(after.data)) return null;
  return { path: `${logoPath}.lossless.webp`, bytes: candidate };
}

/**
 * @param {{ root: string, source: string, registry: Array<Record<string, any>>, redirects: Record<string, string>, payloadCoins: Array<{id: string, symbol?: string, name?: string, geckoId?: string}> | null, rasterHashes: Record<string, string> }} o
 * @returns {Promise<{ before: Record<string, string>, logos: Record<string, string>, writes: Map<string, Buffer>, deletes: string[], rasterHashes: Record<string, string>, missingInSource: string[], rejected: string[], payloadMissing: string[], payloadCovered: string }>}
 */
export async function planLogos({ root, source, registry, redirects, payloadCoins, rasterHashes }) {
  const own = await readJson(join(root, "data/logos.json"));
  const src = await readJson(join(source, "data/logos.json"));
  const srcFiles = (await readdir(join(source, "public/logos"), { withFileTypes: true }))
    .filter((e) => e.isFile() && IMAGE.test(e.name)).map((e) => e.name).sort();
  const deadRaw = await readJson(join(source, "shared/data/dead-stablecoins.json")).catch(() => []);
  const deadRows = (Array.isArray(deadRaw) ? deadRaw : []).filter((r) => r && typeof r.logo === "string");

  const merged = { ...own };
  const writes = new Map();
  const raster = { ...rasterHashes };
  const missingInSource = [];
  const rejected = [];
  const srcPublic = (p) => join(source, "public", p);
  const ownPublic = (p) => join(root, "public", p);

  /**
   * Materialise a source file as the local logo `logoPath`; returns the local path (`.png` when rasterised), or null.
   * A source file the media validator rejects (truncated, mislabelled) is refused, so the entry keeps what it had.
   */
  async function take(fromAbs, logoPath) {
    const buf = await readOrNull(fromAbs);
    if (!buf) return null;
    const broken = needsRaster(logoPath, buf) ? [] : findMediaFileProblems(logoPath, buf);
    if (broken.length) { rejected.push(`${logoPath}: ${broken[0]}`); return null; }
    if (needsRaster(logoPath, buf)) {
      const png = logoPath.replace(/\.svg$/i, ".png");
      const h = sha12(buf);
      const have = await exists(ownPublic(png));
      // first sight of an already rasterised file: adopt it (record the hash) rather than re-render it
      if (!have || (raster[png] !== undefined && raster[png] !== h)) writes.set(png, await rasterise(buf));
      raster[png] = h;
      return png;
    }
    const cur = writes.get(logoPath) ?? await readOrNull(ownPublic(logoPath));
    if (!cur || !cur.equals(buf)) writes.set(logoPath, buf);
    return logoPath;
  }

  // 1. the source's own book, slug by slug
  const remap = new Map();
  for (const id of Object.keys(src).sort()) {
    const p = src[id];
    if (!topLevel(p)) continue;
    const local = await take(srcPublic(p), p);
    if (!local) { if (!rejected.some((r) => r.startsWith(`${p}:`))) missingInSource.push(`${id} → ${p}`); continue; }
    if (own[id] && own[id] !== local) remap.set(own[id], local);
    merged[id] = local;
  }

  // 2. everything else this repo carries: follow a moved file, else refresh the bytes from the same-named source file
  for (const id of Object.keys(merged)) {
    if (id in src && topLevel(src[id])) continue;
    const p = merged[id];
    if (remap.has(p)) { merged[id] = remap.get(p); continue; }
    if (!topLevel(p)) continue;
    const name = basename(p);
    if (srcFiles.includes(name)) { merged[id] = (await take(srcPublic(p), p)) ?? p; continue; }
    const m = name.match(/^(\d+)-(.+)$/);
    if (m && m[1] === id) await take(srcPublic(`/logos/cemetery/${m[2]}`), p);
  }

  // 3. payload coins that have no logo yet
  /** Same symbol and the same name (or one name containing the other, ≥ 4 letters): "Revolut Euro" ↔ "Revolut Euro", "GRAI" ↔ "Gravita GRAI". */
  const sameCoin = (c, r) => norm(c.symbol) === norm(r.symbol) && (() => {
    const [x, y] = [norm(c.name), norm(r.name)].sort((p, q) => p.length - q.length);
    return x === y || (x.length >= 4 && y.includes(x));
  })();
  /** A cemetery coin's logo, copied to the top level as `<id>-<file>`. */
  function deadHit(d, id) {
    const rel = d.logo.startsWith("/") ? d.logo : `/logos/cemetery/${d.logo}`;
    if (!IMAGE.test(rel)) return null;
    return { from: srcPublic(rel), logo: rel.startsWith("/logos/cemetery/") ? `/logos/${id}-${rel.split("/").pop()}` : rel };
  }
  const hit = (p) => (topLevel(p) ? { from: srcPublic(p), logo: p } : null);
  /**
   * Matching by identity and name (P7 polish): the coin's llama id or gecko id on a registry/cemetery row, then the exact
   * same name ("Legacy BOLD"), then, for a coin whose name is only its symbol ("XAI"), the one row with that symbol.
   * A row that carries a different llama id or gecko id is another coin and never matches.
   */
  function byName(c) {
    const rows = [
      ...registry.filter((r) => r && topLevel(src[r.id])).map((r) => ({ r, hit: () => hit(src[r.id]) })),
      ...deadRows.map((r) => ({ r, hit: () => deadHit(r, c.id) })),
    ].filter(({ r }) => (r.llamaId == null || String(r.llamaId) === c.id) && (!r.geckoId || !c.geckoId || r.geckoId === c.geckoId));
    const pick = (test) => rows.find(({ r }) => test(r))?.hit() ?? null;
    const name = norm(c.name), sym = norm(c.symbol);
    const sameSymbol = rows.filter(({ r }) => norm(r.symbol) === sym);
    return pick((r) => r.llamaId != null)
      ?? (c.geckoId ? pick((r) => r.geckoId === c.geckoId) : null)
      ?? (name.length >= 4 ? pick((r) => norm(r.name) === name) : null)
      ?? (name === sym && sameSymbol.length === 1 ? sameSymbol[0].hit() : null);
  }
  function sourceLogo(c) {
    const id = c.id;
    if (src[id]) return hit(src[id]);
    if (!/^\d+$/.test(id)) return null;
    // DefiLlama-only coins: the llama id is the payload id
    const f = srcFiles.find((n) => n.startsWith(`${id}-`));
    if (f) return hit(`/logos/${f}`);
    // a registry coin (pre-launch or tracked) DefiLlama already lists under its llama id
    const byLlama = registry.find((r) => r && r.llamaId != null && String(r.llamaId) === id && topLevel(src[r.id]));
    if (byLlama) return hit(src[byLlama.id]);
    const slug = typeof redirects[id] === "string" ? redirects[id].match(/^\/stablecoin\/([^/]+)\/?$/)?.[1] : null;
    if (slug && src[slug]) return hit(src[slug]);
    // the same coin under its registry slug, then a retired `<symbol>-<issuer>` slug, then the cemetery
    const reg = registry.find((r) => r && src[r.id] && sameCoin(c, r));
    if (reg) return hit(src[reg.id]);
    const sym = norm(c.symbol), named = `${norm(c.name)} ${norm(c.geckoId)}`;
    const slugHit = [...new Set([...Object.keys(src), ...Object.keys(merged)])].sort().find((k) => {
      const [head, ...rest] = k.split("-");
      const issuer = norm(rest.join(""));
      return norm(head) === sym && issuer.length >= 3 && named.includes(issuer);
    });
    if (slugHit) return topLevel(merged[slugHit]) ? { from: null, logo: merged[slugHit] } : hit(src[slugHit]);
    const d = deadRows.find((r) => sameCoin(c, r));
    if (d) return deadHit(d, id);
    return byName(c);
  }

  const payloadMissing = [];
  let payloadCovered = "skipped";
  if (payloadCoins) {
    for (const c of payloadCoins) {
      const have = merged[c.id];
      if (have && (writes.has(have) || await exists(ownPublic(have)))) continue;
      const found = sourceLogo(c);
      const local = found && (found.from === null ? found.logo : await take(found.from, found.logo));
      if (!local) { payloadMissing.push(`${c.id} ${c.symbol ?? ""}`.trim()); continue; }
      merged[c.id] = local;
    }
    payloadCovered = `${payloadCoins.filter((c) => merged[c.id]).length}/${payloadCoins.length}`;
  }

  // files this run orphaned (an old .svg whose entries all moved to the source's .png)
  const kept = new Set(Object.values(merged));
  const deletes = [...new Set(Object.values(own))].filter((p) => !kept.has(p) && topLevel(p)).sort();

  // The URL map is a runtime projection, not a mutation of the synced source
  // book; build-emblems continues to read the exact original source files.
  const optimized = {};
  for (const p of [...kept].sort()) {
    const bytes = writes.get(p) ?? await readOrNull(ownPublic(p));
    if (!bytes) continue;
    const alternate = await losslessLogo(p, bytes);
    if (!alternate) continue;
    optimized[p] = alternate.path;
    const current = await readOrNull(ownPublic(alternate.path));
    if (!current?.equals(alternate.bytes)) writes.set(alternate.path, alternate.bytes);
  }
  const mapPath = "/logos/lossless.json";
  const previous = await readJson(ownPublic(mapPath)).catch(() => ({}));
  for (const p of Object.values(previous)) if (!Object.values(optimized).includes(p)) deletes.push(p);
  const mapBytes = Buffer.from(`${JSON.stringify(optimized, null, 2)}\n`);
  const currentMap = await readOrNull(ownPublic(mapPath));
  if (!currentMap?.equals(mapBytes)) writes.set(mapPath, mapBytes);

  return { before: own, logos: merged, writes, deletes, rasterHashes: raster, missingInSource, rejected, payloadMissing, payloadCovered };
}
