#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DEFAULT_MANIFEST = "agents/2026-10-05-garden-levers/destination/social-crops.json";
export const SOCIAL_BEATS = ["dawn", "day", "golden", "blue", "night"];
export const STILL_BYTE_LIMIT = 90_000;
const run = promisify(execFile);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function localPath(value, label) {
  if (typeof value !== "string" || !value || /^[a-z]+:\/\//i.test(value)) throw new Error(`${label} must be a local path`);
  return isAbsolute(value) ? value : resolve(ROOT, value);
}

/** Validate the elected inputs before any output is replaced. Acceptance is a
 * human/orchestrator decision, never inferred from pixels or a renderer name. */
export function validateSocialManifest(input) {
  if (input?.version !== 1 || input.edition !== "garden-observatory") throw new Error("Expected Garden Observatory manifest version 1");
  if (input.accepted !== true) throw new Error("Garden captures must be explicitly accepted before publication");
  localPath(input.font, "font");
  if (!Array.isArray(input.beats) || input.beats.length !== SOCIAL_BEATS.length) throw new Error("Supply exactly five light beats");
  const seen = new Set();
  for (const beat of input.beats) {
    if (!SOCIAL_BEATS.includes(beat.name) || seen.has(beat.name)) throw new Error(`Unknown or duplicate beat: ${beat.name}`);
    seen.add(beat.name);
    for (const shape of ["landscape", "portrait"]) validateCrop(beat[shape], `${beat.name}/${shape}`);
  }
  validateCrop(input.og, "og");
  return input;
}

function validateCrop(crop, label) {
  localPath(crop?.file, label);
  localPath(crop?.metrics, `${label} metrics`);
  if (!crop.file.endsWith(".png")) throw new Error(`${label} requires a captured PNG`);
  if (typeof crop.capture !== "string" || !crop.capture.startsWith("outputs/cap.sh ")) throw new Error(`${label} requires its exact outputs/cap.sh invocation`);
  if (!Array.isArray(crop.rect) || crop.rect.length !== 4 || !crop.rect.every(Number.isInteger)
    || crop.rect[0] < 0 || crop.rect[1] < 0 || crop.rect[2] <= 0 || crop.rect[3] <= 0) throw new Error(`Invalid crop rectangle: ${label}`);
}

async function magick(args) {
  await run("magick", args, { env: { ...process.env, MAGICK_THREAD_LIMIT: "1", OMP_NUM_THREADS: "1" }, maxBuffer: 1024 * 1024 });
}

/** Offline only: supplied PNGs + local font + installed ImageMagick. No app
 * imports, browser, network, runtime dependency or fabricated source imagery. */
export async function generateGardenSocial({ manifest = DEFAULT_MANIFEST, outDir = "public" } = {}) {
  const manifestBytes = await readFile(localPath(manifest, "manifest"));
  const input = validateSocialManifest(JSON.parse(manifestBytes.toString("utf8")));
  const font = localPath(input.font, "font");
  const fontBytes = await readFile(font);
  const sources = new Map();
  const crops = [...input.beats.flatMap((beat) => [beat.landscape, beat.portrait]), input.og];
  for (const crop of crops) {
    const path = localPath(crop.file, "capture");
    if (!sources.has(path)) {
      const bytes = await readFile(path);
      if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString("ascii", 12, 16) !== "IHDR") throw new Error(`Invalid PNG: ${crop.file}`);
      sources.set(path, { bytes, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
    }
    const source = sources.get(path);
    const [x, y, width, height] = crop.rect;
    if (x + width > source.width || y + height > source.height) throw new Error(`Crop exceeds PNG bounds: ${crop.file}`);
    const metrics = JSON.parse(await readFile(localPath(crop.metrics, "metrics"), "utf8"));
    if (typeof metrics.renderer !== "string" || !metrics.renderer || /swiftshader|llvmpipe|softpipe|software/i.test(metrics.renderer)) throw new Error(`Real-GPU capture evidence required: ${crop.metrics}`);
  }
  const directory = await mkdtemp(join(tmpdir(), "pharosville-garden-social-"));
  const outputs = [];
  const staged = [];
  try {
    for (const name of SOCIAL_BEATS) {
      const beat = input.beats.find((item) => item.name === name);
      for (const shape of ["landscape", "portrait"]) {
        const crop = beat[shape];
        const [x, y, width, height] = crop.rect;
        const size = shape === "portrait" ? [720, 900] : [1200, 750];
        const base = `pharosville/stills/garden-${name}${shape === "portrait" ? "-portrait" : ""}`;
        const prepared = join(directory, `${name}-${shape}.png`);
        await magick([localPath(crop.file, "capture"), "-crop", `${width}x${height}+${x}+${y}`, "+repage", "-resize", `${size[0]}x${size[1]}!`, "-background", "#16222f", "-alpha", "remove", "-colorspace", "sRGB", "-strip", prepared]);
        for (const format of ["avif", "jpg"]) {
          const path = `${base}.${format}`;
          const temp = join(directory, `${name}-${shape}.${format}`);
          let image;
          let quality;
          for (quality = 72; quality >= 24; quality -= 4) {
            await magick([prepared, "-strip", "-quality", String(quality), ...(format === "avif" ? ["-define", "heic:speed=4"] : ["-sampling-factor", "4:2:0"]), temp]);
            image = await readFile(temp);
            if (image.length <= STILL_BYTE_LIMIT) break;
          }
          if (image.length > STILL_BYTE_LIMIT) throw new Error(`Cannot encode ${path} within ${STILL_BYTE_LIMIT} bytes`);
          outputs.push({ path, width: size[0], height: size[1], bytes: image.length, quality, sha256: createHash("sha256").update(image).digest("hex") });
          staged.push({ path, temp });
        }
      }
    }
    const [x, y, width, height] = input.og.rect;
    const og = join(directory, "og-card.png");
    await magick([localPath(input.og.file, "og capture"), "-crop", `${width}x${height}+${x}+${y}`, "+repage", "-resize", "1200x630!", "-background", "#16222f", "-alpha", "remove", "-colorspace", "sRGB",
      "-fill", "#16222f", "-draw", "rectangle 28,28 595,213", "-font", font, "-fill", "#eef0ec", "-gravity", "NorthWest",
      "-pointsize", "64", "-annotate", "+48+32", "PharosVille",
      "-pointsize", "32", "-annotate", "+50+112", "A living stablecoin garden",
      "-pointsize", "21", "-annotate", "+50+166", "Illustration, not live readings", "-strip", "-define", "png:exclude-chunks=date,time", og]);
    const image = await readFile(og);
    outputs.push({ path: "og-card.png", width: 1200, height: 630, bytes: image.length, sha256: createHash("sha256").update(image).digest("hex") });
    staged.push({ path: "og-card.png", temp: og });
    const provenance = crops.map((crop) => ({ ...crop, sha256: createHash("sha256").update(sources.get(localPath(crop.file, "capture")).bytes).digest("hex") }));
    const revision = createHash("sha256").update(JSON.stringify({ outputs, provenance, fontSha256: createHash("sha256").update(fontBytes).digest("hex") })).digest("hex");
    const published = { edition: input.edition, revision, outputs, sources: provenance, font: input.font, fontSha256: createHash("sha256").update(fontBytes).digest("hex") };
    const destination = localPath(outDir, "output directory");
    // Stage all results beside their destinations before replacing files. Publish
    // the marker last, so absent/failed inputs never elect old harbour stills.
    for (const item of staged) {
      const target = join(destination, item.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(`${target}.tmp`, await readFile(item.temp));
    }
    for (const item of staged) {
      const target = join(destination, item.path);
      await rename(`${target}.tmp`, target);
    }
    const marker = join(destination, "pharosville/stills/garden-social.json");
    await writeFile(`${marker}.tmp`, `${JSON.stringify(published, null, 2)}\n`);
    await rename(`${marker}.tmp`, marker);
    return published;
  } finally {
    await rm(directory, { recursive: true, force: true });
    for (const item of staged) await rm(`${join(localPath(outDir, "output directory"), item.path)}.tmp`, { force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const options = {};
  const names = { "--manifest": "manifest", "--out-dir": "outDir" };
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = names[process.argv[index]], value = process.argv[index + 1];
    if (!key || !value || value.startsWith("--")) throw new Error("Usage: generate-garden-social.mjs [--manifest local.json] [--out-dir directory]");
    options[key] = value;
  }
  const result = await generateGardenSocial(options);
  console.log(`Published ${result.outputs.length} garden images; revision ${result.revision}`);
}
