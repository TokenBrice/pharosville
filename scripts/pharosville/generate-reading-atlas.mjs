#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DEFAULT_MANIFEST = "agents/2026-10-05-garden-levers/destination/reading-atlas-crops.json";
const IDS = ["water.calm", "water.watch", "water.alert", "water.warning", "water.danger", "water.ledger", "water.wreck",
  ...["BEDROCK", "STEADY", "TREMOR", "FRACTURE", "CRISIS", "MELTDOWN"].map((band) => `lighthouse.${band}`),
  "sail.1", "sail.2", "sail.3", "cloud"];
const REQUIRED = [...IDS.slice(0, 7), "sail.1", "sail.2", "sail.3"];

/** Compose only supplied real-GPU PNG crops; absent conditional slots are not
 * drawn, and their DOM entries remain text-only. No capture or renderer runs. */
export async function generateReadingAtlas({ manifest = DEFAULT_MANIFEST, out = "public/garden-reading-atlas.webp", outputManifest = "src/systems/reading-atlas.json" } = {}) {
  const input = JSON.parse(await readFile(resolve(ROOT, manifest), "utf8"));
  if (input.version !== 1 || !Array.isArray(input.slots)) throw new Error("Reading crop manifest requires version 1 and slots[]");
  const byId = new Map();
  for (const slot of input.slots) {
    if (!IDS.includes(slot.id) || byId.has(slot.id)) throw new Error(`Unknown or duplicate exemplar: ${slot.id}`);
    byId.set(slot.id, slot);
  }
  for (const slot of byId.values()) {
    const hasCrop = typeof slot.file === "string" && slot.file.length > 0;
    const hasReason = typeof slot.pending === "string" && slot.pending.trim().length > 0;
    if (hasCrop === hasReason || (slot.file != null && !hasCrop)) {
      throw new Error(`${slot.id} requires either a real-GPU crop or an explicit pending reason, not both`);
    }
  }
  for (const id of REQUIRED) {
    const slot = byId.get(id);
    if (!slot || (!slot.file && (!id.startsWith("water.") || !slot.pending))) {
      throw new Error(`Missing required real-GPU crop: ${id}`);
    }
  }
  const cellWidth = 256, cellHeight = 160, gutter = 2, columns = 4;
  const composites = [], exemplars = {}, sources = {};
  for (const id of IDS) {
    const slot = byId.get(id);
    if (!slot?.file) continue;
    if (!slot.file.endsWith(".png")) throw new Error(`${id} must name a real-GPU PNG crop`);
    const png = await readFile(resolve(ROOT, slot.file));
    const metadata = await sharp(png).metadata();
    if (metadata.format !== "png" || !metadata.width || !metadata.height) throw new Error(`Invalid PNG crop: ${id}`);
    const index = composites.length;
    const x = (index % columns) * (cellWidth + gutter), y = Math.floor(index / columns) * (cellHeight + gutter);
    const crop = await sharp(png).resize(cellWidth, cellHeight, { fit: "contain", background: "#151030", kernel: "lanczos3" }).removeAlpha().png().toBuffer();
    composites.push({ input: crop, left: x, top: y });
    exemplars[id] = { x, y, width: cellWidth, height: cellHeight, ...(slot.detailId ? { detailId: slot.detailId } : {}) };
    sources[id] = { file: slot.file, sha256: createHash("sha256").update(png).digest("hex"), capture: slot.capture ?? null };
  }
  const width = columns * (cellWidth + gutter) - gutter;
  const height = Math.ceil(composites.length / columns) * (cellHeight + gutter) - gutter;
  const image = await sharp({ create: { width, height, channels: 3, background: "#151030" } })
    .composite(composites).webp({ lossless: true, effort: 6 }).toBuffer();
  const published = { image: "/garden-reading-atlas.webp", width, height, exemplars, sources,
    sha256: createHash("sha256").update(image).digest("hex"), pending: IDS.filter((id) => !exemplars[id]),
    pendingReasons: Object.fromEntries([...byId.values()].filter((slot) => !slot.file).map((slot) => [slot.id, slot.pending])) };
  const imagePath = resolve(ROOT, out), manifestPath = resolve(ROOT, outputManifest);
  await mkdir(dirname(imagePath), { recursive: true });
  await mkdir(dirname(manifestPath), { recursive: true });
  try {
    await writeFile(`${imagePath}.tmp`, image);
    await writeFile(`${manifestPath}.tmp`, `${JSON.stringify(published, null, 2)}\n`);
    await rename(`${imagePath}.tmp`, imagePath);
    await rename(`${manifestPath}.tmp`, manifestPath);
  } finally {
    await rm(`${imagePath}.tmp`, { force: true });
    await rm(`${manifestPath}.tmp`, { force: true });
  }
  return published;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const options = {};
  const names = { "--manifest": "manifest", "--out": "out", "--output-manifest": "outputManifest" };
  for (let index = 2; index < process.argv.length; index += 2) {
    const key = names[process.argv[index]], value = process.argv[index + 1];
    if (!key || !value || value.startsWith("--")) throw new Error("Usage: generate-reading-atlas.mjs [--manifest path] [--out path] [--output-manifest path]");
    options[key] = value;
  }
  const result = await generateReadingAtlas(options);
  console.log(`Published ${Object.keys(result.exemplars).length} real-GPU exemplars (${result.width}×${result.height}); pending: ${result.pending.join(", ") || "none"}`);
}
