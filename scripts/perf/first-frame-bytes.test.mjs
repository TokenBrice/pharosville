import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { collectBytes, emittedReferences } from "./first-frame-bytes.mjs";

test("emitted graph follows relative worker, preload arrays, seed, CSS and italic URLs without filename guesses", () => {
  const graph = new Set(["/assets/a.js", "/assets/b.json", "/assets/c.css", "/fonts/i.woff2"]);
  assert.deepEqual(emittedReferences('new Worker(new URL("a.js",import.meta.url));const deps=["assets/c.css"];fetch("./b.json")', "/assets/main.js", graph), ["/assets/a.js", "/assets/c.css", "/assets/b.json"]);
  assert.deepEqual(emittedReferences('@font-face{src:url(/fonts/i.woff2)}', "/assets/c.css", graph), ["/fonts/i.woff2"]);
});

test("dependency growth changes totals while preserving the old ledger and budgets", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "pv-byte-test-"));
  try {
    const dist = resolve(dir, "dist"), publicDir = resolve(dir, "public");
    await mkdir(resolve(dist, "assets"), { recursive: true });
    await mkdir(resolve(publicDir, "harbour"), { recursive: true });
    const put = (name, text) => writeFile(resolve(dist, name), text);
    await put("index.html", '<script type="module" src="/assets/main.js"></script><link rel="preload" href="/harbour/manifest.json"><link rel="preload" href="/layout.json">');
    await writeFile(resolve(publicDir, "harbour/manifest.json"), JSON.stringify({ hulls: [{ file: "hull.pack" }] }));
    await writeFile(resolve(publicDir, "harbour/hull.pack"), "geometry");
    await writeFile(resolve(publicDir, "harbour/emblems.json"), "{}");
    await put("layout.json", "{}");
    const entry = 'new Worker(new URL("./a.js",import.meta.url));const deps=["assets/c.css"]';
    await put("assets/main.js", entry);
    await put("assets/a.js", 'fetch(new URL("./b.json",import.meta.url))');
    await put("assets/b.json", "{\"seed\":1}");
    await put("assets/c.css", '@font-face{font-style:italic;src:url(./i.woff2)}');
    await put("assets/i.woff2", "font");
    const first = await collectBytes({ dist, publicDir });
    assert.equal(first.files.find((f) => f.url === "/assets/b.json").ledger, "fleet");
    assert.ok(first.files.some((f) => f.url === "/assets/i.woff2"));
    assert.ok(first.totals.firstFrameStoredBytes > first.legacyTotals.firstFrameStoredBytes);
    await put("assets/b.json", JSON.stringify({ seed: Array.from({ length: 100 }, (_, i) => i) }));
    const grown = await collectBytes({ dist, publicDir });
    assert.ok(grown.totals.firstFrameGzipBodyBytes > first.totals.firstFrameGzipBodyBytes);
    assert.deepEqual(grown.legacyTotals, first.legacyTotals);
    assert.deepEqual(grown.legacyCategories, first.legacyCategories);
    assert.equal(grown.ledgers.base.storedBytes + grown.ledgers.fleet.storedBytes, grown.totals.firstFrameStoredBytes);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
