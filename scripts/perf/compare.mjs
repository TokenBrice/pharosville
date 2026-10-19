#!/usr/bin/env node
/** Explicit non-overlapping 8x8 luminance SSIM + RGB errors. Not Gaussian SSIM or aesthetic approval. */
import sharp from "sharp";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values: a, positionals } = parseArgs({ allowPositionals: true, options: {
  help: { type: "boolean" }, before: { type: "string" }, after: { type: "string" }, out: { type: "string", default: "outputs/perf/compare" },
  threshold: { type: "string", default: "3" }, ssim: { type: "string", default: "0.995" }, mae: { type: "string", default: "0.5" }, changed: { type: "string", default: "1" }, assert: { type: "boolean" },
} });
if (a.help) {
  console.log(`Usage: node scripts/perf/compare.mjs BEFORE_DIR AFTER_DIR [OUTPUT_DIR]
   or: node scripts/perf/compare.mjs --before DIR --after DIR --out DIR
Directories (including filmstrips) are paired by relative PNG filename; file pairs also work.
  --threshold 3    channel change iff |A-B| > threshold (0..255)
  --ssim 0.995 --mae 0.5 --changed 1   optional screening bounds (MAE /255; changed percent)
  --assert         exit 1 on screening failure; missing/mismatched images always fail
Writes summary.json, native amplified difference images, labeled before/after/difference contact
sheets (four rows/page). SSIM is 8x8 non-overlapping luminance with K1=.01, K2=.03, L=255;
not Gaussian-window SSIM. Values screen candidates only; every pair needs human review at native
resolution, including temporal thin lines/shadows/AA. Same GPU/DPR/state/API snapshot required.`);
} else {
  await main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

async function pngs(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(current, entry.name);
    if (entry.isDirectory()) files.push(...await pngs(root, path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) files.push(relative(root, path));
  }
  return files.sort();
}

async function main() {
  const before = resolve(a.before ?? positionals[0] ?? ""), after = resolve(a.after ?? positionals[1] ?? ""), out = resolve(positionals[2] ?? a.out);
  if (!(a.before ?? positionals[0]) || !(a.after ?? positionals[1])) throw new Error("Supply BEFORE and AFTER capture directories or PNG files (see --help)");
  if (out === before || out.startsWith(`${before}/`) || out === after || out.startsWith(`${after}/`)) throw new Error("Output must be outside the input capture directories");
  const threshold = Number(a.threshold);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255) throw new Error("--threshold must be 0..255");
  const beforeDir = (await stat(before)).isDirectory(), afterDir = (await stat(after)).isDirectory();
  if (beforeDir !== afterDir) throw new Error("Compare two files or two directories, not a mixture");
  const leftNames = beforeDir ? await pngs(before) : [basename(before)], rightNames = afterDir ? await pngs(after) : [basename(before)];
  const leftSet = new Set(leftNames), rightSet = new Set(rightNames);
  const missingBefore = rightNames.filter((name) => !leftSet.has(name)), missingAfter = leftNames.filter((name) => !rightSet.has(name));
  const names = leftNames.filter((name) => rightSet.has(name));
  if (!names.length) throw new Error("No paired PNG captures");
  await mkdir(out, { recursive: true });
  const manifest = async (path) => { try { return JSON.parse(await readFile(resolve(path, "manifest.json"), "utf8")).meta; } catch { return null; } };
  const beforeMeta = beforeDir ? await manifest(before) : null, afterMeta = afterDir ? await manifest(after) : null;
  const incompatible = beforeMeta && afterMeta ? ["snapshotSha256", "profile", "quality", "epoch", "seed", "elapsed", "filmstrip", "interval"].filter((key) => beforeMeta[key] !== afterMeta[key]) : [];
  const summary = { meta: { tool: "compare", before, after, method: "8x8 non-overlapping luminance SSIM; RGB MAE/RMSE; changed-channel share", threshold, humanReviewRequired: true, beforeCapture: beforeMeta, afterCapture: afterMeta, incompatibleMetadata: incompatible }, missingBefore, missingAfter, pairs: [] };
  let rows = [], page = 0;
  for (const name of names) {
    const leftPath = beforeDir ? resolve(before, name) : before, rightPath = afterDir ? resolve(after, name) : after;
    const [left, right] = await Promise.all([sharp(leftPath).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(rightPath).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
    if (left.info.width !== right.info.width || left.info.height !== right.info.height || left.info.channels !== 3 || right.info.channels !== 3) { summary.pairs.push({ file: name, error: "dimensions/channels differ", before: left.info, after: right.info }); continue; }
    const width = left.info.width, height = left.info.height, channels = left.data.length;
    let sum = 0, squares = 0, changed = 0, max = 0;
    const difference = Buffer.alloc(channels);
    for (let i = 0; i < channels; i++) {
      const delta = Math.abs(left.data[i] - right.data[i]);
      sum += delta; squares += delta * delta; if (delta > threshold) changed++; max = Math.max(max, delta);
      difference[i] = Math.min(255, delta * 4);
    }
    let ssimSum = 0, blocks = 0;
    const c1 = (0.01 * 255) ** 2, c2 = (0.03 * 255) ** 2;
    // Identical decoded pixels have SSIM exactly one; variance cancellation can
    // otherwise put constant blocks a few ulps below one and fail strict equality.
    if (max === 0) {
      blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
      ssimSum = blocks;
    } else for (let y = 0; y < height; y += 8) for (let x = 0; x < width; x += 8) {
      let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (let dy = 0; dy < Math.min(8, height - y); dy++) for (let dx = 0; dx < Math.min(8, width - x); dx++) {
        const i = ((y + dy) * width + x + dx) * 3;
        const l = left.data[i] * 0.2126 + left.data[i + 1] * 0.7152 + left.data[i + 2] * 0.0722;
        const r = right.data[i] * 0.2126 + right.data[i + 1] * 0.7152 + right.data[i + 2] * 0.0722;
        sx += l; sy += r; sxx += l * l; syy += r * r; sxy += l * r; n++;
      }
      const mx = sx / n, my = sy / n, vx = Math.max(0, sxx / n - mx * mx), vy = Math.max(0, syy / n - my * my), covariance = sxy / n - mx * my;
      ssimSum += ((2 * mx * my + c1) * (2 * covariance + c2)) / ((mx * mx + my * my + c1) * (vx + vy + c2));
      blocks++;
    }
    const result = { file: name, width, height, ssim: ssimSum / blocks, ssimBlocks: blocks, mae: sum / channels, maeNormalized: sum / channels / 255, rmse: Math.sqrt(squares / channels), changedChannelPercent: changed / channels * 100, maxChannelError: max };
    result.screenPass = result.ssim >= Number(a.ssim) && result.mae <= Number(a.mae) && result.changedChannelPercent <= Number(a.changed);
    summary.pairs.push(result);
    const diffPath = resolve(out, "diff", name);
    await mkdir(dirname(diffPath), { recursive: true });
    await sharp(difference, { raw: { width, height, channels: 3 } }).png().toFile(diffPath);
    const tileWidth = 480, tileHeight = Math.round(height / width * tileWidth), labelHeight = 48;
    const escape = (text) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
    const label = Buffer.from(`<svg width="1440" height="48"><rect width="100%" height="100%" fill="#20242b"/><text x="8" y="18" fill="white" font-family="sans-serif" font-size="13">${escape(name)} | SSIM ${result.ssim.toFixed(6)} | MAE ${result.mae.toFixed(4)} | channels&gt;${threshold}: ${result.changedChannelPercent.toFixed(4)}%</text><text x="8" y="39" fill="white" font-family="sans-serif" font-size="13">BEFORE</text><text x="488" y="39" fill="white" font-family="sans-serif" font-size="13">AFTER</text><text x="968" y="39" fill="white" font-family="sans-serif" font-size="13">ABS DIFFERENCE ×4</text></svg>`);
    const tiles = await Promise.all([leftPath, rightPath, diffPath].map((path) => sharp(path).resize(tileWidth, tileHeight).png().toBuffer()));
    const row = await sharp({ create: { width: tileWidth * 3, height: tileHeight + labelHeight, channels: 3, background: "#20242b" } }).composite([{ input: label, top: 0, left: 0 }, ...tiles.map((input, i) => ({ input, top: labelHeight, left: i * tileWidth }))]).png().toBuffer();
    rows.push({ input: row, height: tileHeight + labelHeight });
    if (rows.length === 4 || name === names.at(-1)) {
      let top = 0;
      const composites = rows.map((r) => { const item = { input: r.input, top, left: 0 }; top += r.height; return item; });
      await sharp({ create: { width: 1440, height: top, channels: 3, background: "#20242b" } }).composite(composites).png().toFile(resolve(out, `contact-${String(++page).padStart(3, "0")}.png`));
      rows = [];
    }
  }
  if (rows.length) {
    let top = 0;
    const composites = rows.map((r) => { const item = { input: r.input, top, left: 0 }; top += r.height; return item; });
    await sharp({ create: { width: 1440, height: top, channels: 3, background: "#20242b" } }).composite(composites).png().toFile(resolve(out, `contact-${String(page + 1).padStart(3, "0")}.png`));
  }
  summary.screenPass = !missingBefore.length && !missingAfter.length && !incompatible.length && summary.pairs.every((pair) => pair.screenPass);
  await writeFile(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`${summary.pairs.length} pairs; screening ${summary.screenPass ? "PASS" : "FAIL"} (not aesthetic approval): ${resolve(out, "summary.json")}`);
  if (missingBefore.length || missingAfter.length || incompatible.length || summary.pairs.some((pair) => pair.error) || (a.assert && !summary.screenPass)) process.exitCode = 1;
}
