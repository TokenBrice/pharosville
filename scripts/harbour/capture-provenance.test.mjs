import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { compareCaptures } from "../perf/compare.mjs";
import sharp from "sharp";
import { classifyGpu, compareProvenance } from "./capture-provenance.mjs";
import { captureMatrix, captureUrl, assertEffective, composeSheet } from "./contact-sheet.mjs";

const receipt = () => ({ gpu: "ANGLE (NVIDIA GeForce RTX 5090, Vulkan)", browser: "Chrome/140", backend: "Vulkan", driver: null,
  buildHash: "build-a", fixtureHash: "fixture-a", viewport: { width: 1600, height: 1000 }, dpr: 1, effectiveState: { hour: 11, quality: "high" } });
test("software and unknown identities cannot be hardware evidence", () => {
  for (const id of [null, "", "none", "unknown", "WebGL 2.0", "ANGLE", "mystery GPU"]) assert.equal(classifyGpu(id), "unknown");
  for (const id of ["Google SwiftShader", "Mesa llvmpipe", "AMD software rasterizer", "Microsoft Basic Render Driver"]) assert.equal(classifyGpu(id), "software");
  for (const id of ["ANGLE (NVIDIA GeForce RTX 5090, Vulkan)", "AMD Radeon", "Apple M3", "Intel Iris Xe"]) assert.equal(classifyGpu(id), "hardware");
});
test("comparison requires provenance and matches hardware/browser/fixture/effective state, allowing identified builds to differ", () => {
  assert.equal(compareProvenance(null, receipt()).status, "UNVERIFIED");
  assert.equal(compareProvenance({ ...receipt(), gpu: "SwiftShader" }, receipt()).exitCode, 78);
  assert.equal(compareProvenance(receipt(), { ...receipt(), fixtureHash: null }).status, "UNVERIFIED");
  assert.equal(compareProvenance(receipt(), { ...receipt(), buildHash: "build-b" }).status, "VERIFIED");
  for (const key of ["browser", "backend", "driver", "fixtureHash", "viewport", "dpr", "effectiveState"]) {
    assert.equal(compareProvenance(receipt(), { ...receipt(), [key]: "different" }).status, "INCOMPATIBLE", key);
  }
});
test("curated matrix covers the named hours, analytical states and viewports", () => {
  const cases = captureMatrix();
  assert.equal(cases.length, 18);
  assert.equal(new Set(cases.map((c) => c.id)).size, 18);
  assert.deepEqual(cases.slice(0, 8).map((c) => c.query.t), [6.9, 9, 11, 16.4, 17.1, 17.6, 22, 3]);
  assert.ok(cases.some((c) => c.query.dews === "DANGER"));
  assert.deepEqual(cases.filter((c) => c.query.stale).map((c) => c.query.t), [11, 22]);
  assert.ok(cases.some((c) => c.query.psi === "none"));
  assert.ok(cases.some((c) => c.query.offpeg === "0.08"));
  assert.ok(cases.some((c) => c.risingFront));
  assert.ok(cases.some((c) => c.touch && c.width === 834 && c.height === 1112));
  assert.ok(cases.some((c) => c.width === 2560 && c.height === 1080));
  assert.equal(new URL(captureUrl("http://localhost:5173/?stale=1", cases[0])).searchParams.get("stale"), null);
  assert.throws(() => captureMatrix("unknown"));
  assert.throws(() => assertEffective(cases[0], { gpu: "none" }), { exitCode: 78 });
  assert.throws(() => assertEffective(cases[0], { gpu: receipt().gpu }), /effective DEV/);
});
test("missing provenance cannot PASS even identical pixels; verified receipts allow comparison and sheet composition", async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "pv-provenance-test-"));
  try {
    for (const arm of ["before", "after"]) {
      await mkdir(resolve(dir, arm));
      await sharp({ create: { width: 20, height: 20, channels: 3, background: "black" } }).png().toFile(resolve(dir, arm, "still.png"));
    }
    const compare = (out) => compareCaptures({ before: resolve(dir, "before"), after: resolve(dir, "after"), out: resolve(dir, out), threshold: "3", ssim: "0.995", mae: "0.5", changed: "1" });
    const unverified = await compare("unverified");
    assert.equal(unverified.exitCode, 1);
    assert.equal(unverified.verification, "UNVERIFIED");
    assert.equal(unverified.screenPass, false);
    for (const arm of ["before", "after"]) await writeFile(resolve(dir, arm, "still.provenance.json"), JSON.stringify(receipt()));
    const verified = await compare("verified");
    assert.equal(verified.exitCode, 0);
    assert.equal(verified.screenPass, true);
    await composeSheet([{ id: "test<&>", label: "1600×1000", path: resolve(dir, "before/still.png") }], resolve(dir, "sheet.jpg"));
    assert.equal((await sharp(await readFile(resolve(dir, "sheet.jpg"))).metadata()).format, "jpeg");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
