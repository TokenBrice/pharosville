import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { generateReadingAtlas } from "./generate-reading-atlas.mjs";

const required = ["water.calm", "water.watch", "water.alert", "water.warning", "water.danger", "water.ledger", "water.wreck", "sail.1", "sail.2", "sail.3"];

test("composes reproducible crops and omits absent conditional cloud/PSI slots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pharosville-reading-atlas-"));
  try {
    // Synthetic pixels exercise composition only, never shipped as exemplars.
    const crop = join(directory, "unit-crop.png");
    await sharp({ create: { width: 32, height: 20, channels: 3, background: "#557788" } }).png().toFile(crop);
    const manifest = join(directory, "input.json");
    await writeFile(manifest, JSON.stringify({ version: 1, slots: [
      ...required.map((id) => ({ id, file: crop, ...(id.startsWith("sail.") ? { detailId: `ship.test-${id}` } : {}) })),
      { id: "cloud", file: null },
    ] }));
    const first = await generateReadingAtlas({ manifest, out: join(directory, "first.webp"), outputManifest: join(directory, "first.json") });
    const second = await generateReadingAtlas({ manifest, out: join(directory, "second.webp"), outputManifest: join(directory, "second.json") });
    assert.deepEqual(first, second);
    assert.deepEqual(await readFile(join(directory, "first.webp")), await readFile(join(directory, "second.webp")));
    assert.deepEqual(Object.keys(first.exemplars), required);
    assert.ok(first.pending.includes("cloud"));
    assert.equal(first.exemplars["sail.1"].detailId, "ship.test-sail.1");
    assert.equal((await sharp(join(directory, "first.webp")).metadata()).format, "webp");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses missing mandatory crops and duplicate exemplar ids", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pharosville-reading-atlas-"));
  try {
    const manifest = join(directory, "input.json");
    await writeFile(manifest, JSON.stringify({ version: 1, slots: [] }));
    await assert.rejects(generateReadingAtlas({ manifest }), /Missing required real-GPU crop: water.calm/);
    await writeFile(manifest, JSON.stringify({ version: 1, slots: [{ id: "cloud", file: null }, { id: "cloud", file: null }] }));
    await assert.rejects(generateReadingAtlas({ manifest }), /Unknown or duplicate exemplar: cloud/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
