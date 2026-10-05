import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { generateGardenSocial, SOCIAL_BEATS, STILL_BYTE_LIMIT, validateSocialManifest } from "./generate-garden-social.mjs";

const run = promisify(execFile);
const manifestPath = resolve("agents/2026-10-05-garden-levers/destination/social-crops.json");
const template = JSON.parse(await readFile(manifestPath, "utf8"));

function syntheticManifest(directory) {
  const crop = { file: join(directory, "unit.png"), metrics: join(directory, "unit.json"), capture: "outputs/cap.sh synthetic-unit-only --clean", rect: [0, 0, 32, 20] };
  return { version: 1, edition: "garden-observatory", accepted: true, font: template.font,
    beats: SOCIAL_BEATS.map((name) => ({ name, landscape: { ...crop }, portrait: { ...crop } })), og: { ...crop } };
}

test("requires an explicit election and a complete, unique local capture manifest", () => {
  assert.throws(() => validateSocialManifest({ ...template, accepted: false }), /explicitly accepted/);
  const good = { ...template, accepted: true };
  assert.equal(validateSocialManifest(good), good);
  assert.throws(() => validateSocialManifest({ ...good, beats: good.beats.slice(1) }), /exactly five/);
  const duplicate = structuredClone(good);
  duplicate.beats[1].name = "dawn";
  assert.throws(() => validateSocialManifest(duplicate), /duplicate beat/);
  const remote = structuredClone(good);
  remote.beats[0].portrait.file = "https://example.com/fake.png";
  assert.throws(() => validateSocialManifest(remote), /local path/);
  const badRect = structuredClone(good);
  badRect.og.rect = [0, 0, -1, 2];
  assert.throws(() => validateSocialManifest(badRect), /Invalid crop/);
  const missingCommand = structuredClone(good);
  delete missingCommand.beats[0].landscape.capture;
  assert.throws(() => validateSocialManifest(missingCommand), /exact outputs\/cap.sh/);
});

test("composes deterministic landscape/portrait encodings under the cap and a truthful 1200x630 OG", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pharosville-social-unit-"));
  try {
    // Synthetic pixels exercise the offline encoder only. They are never accepted
    // garden evidence and are removed instead of published to public/.
    await run("magick", ["-size", "32x20", "xc:#557788", join(directory, "unit.png")]);
    await writeFile(join(directory, "unit.json"), JSON.stringify({ renderer: "synthetic-unit-only" }));
    const manifest = join(directory, "manifest.json");
    await writeFile(manifest, JSON.stringify(syntheticManifest(directory)));
    const firstDir = join(directory, "first"), secondDir = join(directory, "second");
    const first = await generateGardenSocial({ manifest, outDir: firstDir });
    const second = await generateGardenSocial({ manifest, outDir: secondDir });
    assert.deepEqual(first, second);
    assert.equal(first.outputs.length, 21);
    assert.match(first.revision, /^[a-f0-9]{64}$/);
    for (const output of first.outputs) {
      const a = await readFile(join(firstDir, output.path));
      assert.deepEqual(a, await readFile(join(secondDir, output.path)));
      assert.equal(a.length, output.bytes);
      const { stdout } = await run("magick", ["identify", "-format", "%w %h %m", join(firstDir, output.path)]);
      const [width, height, format] = stdout.trim().split(" ");
      assert.equal(Number(width), output.width);
      assert.equal(Number(height), output.height);
      if (output.path === "og-card.png") {
        assert.deepEqual([output.width, output.height, format], [1200, 630, "PNG"]);
      } else {
        assert.ok(output.bytes <= STILL_BYTE_LIMIT);
        assert.equal(format, output.path.endsWith(".avif") ? "AVIF" : "JPEG");
        assert.deepEqual([output.width, output.height], output.path.includes("-portrait") ? [720, 900] : [1200, 750]);
      }
    }
    const publication = JSON.parse(await readFile(join(firstDir, "pharosville/stills/garden-social.json"), "utf8"));
    assert.deepEqual(publication, first);
    assert.equal(first.sources.length, 11);
    assert.ok(first.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses missing, malformed, out-of-bounds and software-rendered sources without publishing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pharosville-social-invalid-"));
  try {
    const manifest = join(directory, "manifest.json"), outDir = join(directory, "out");
    const input = syntheticManifest(directory);
    await writeFile(manifest, JSON.stringify(input));
    await assert.rejects(generateGardenSocial({ manifest, outDir }), /ENOENT/);
    await writeFile(join(directory, "unit.png"), "not a PNG");
    await assert.rejects(generateGardenSocial({ manifest, outDir }), /Invalid PNG/);
    await run("magick", ["-size", "32x20", "xc:#557788", join(directory, "unit.png")]);
    input.og.rect = [1, 0, 32, 20];
    await writeFile(join(directory, "unit.json"), JSON.stringify({ renderer: "synthetic-unit-only" }));
    await writeFile(manifest, JSON.stringify(input));
    await assert.rejects(generateGardenSocial({ manifest, outDir }), /exceeds PNG bounds/);
    input.og.rect = [0, 0, 32, 20];
    await writeFile(manifest, JSON.stringify(input));
    await writeFile(join(directory, "unit.json"), JSON.stringify({ renderer: "ANGLE SwiftShader" }));
    await assert.rejects(generateGardenSocial({ manifest, outDir }), /Real-GPU capture evidence/);
    await assert.rejects(readFile(join(outDir, "pharosville/stills/garden-social.json")), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
