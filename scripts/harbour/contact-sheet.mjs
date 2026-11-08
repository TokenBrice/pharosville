#!/usr/bin/env node
/** Curated review matrix; every browser action belongs to shot.mjs through runShot. */
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { runShot } from "../perf/frame.mjs";
import { initializeCapture, freezeCapture } from "../perf/golden-controls.mjs";
import { replayInitScript } from "../../tests/helpers/scenario.ts";
import { classifyGpu } from "./capture-provenance.mjs";

export function captureMatrix(name = "true-bearing") {
  if (name !== "true-bearing") throw new Error(`Unknown matrix: ${name}`);
  const hour = (t, view = "heart") => ({ id: `${view}-t${t}`, query: { t, view } });
  return [
    ...[6.9, 9, 11, 16.4, 17.1, 17.6, 22, 3].map((t) => hour(t)),
    hour(11, "overview"), hour(22, "overview"),
    { id: "danger", query: { t: 11, dews: "DANGER" } },
    { id: "stale-day", query: { t: 11, stale: "1" } },
    { id: "stale-night", query: { t: 22, stale: "1" } },
    { id: "psi-unavailable", query: { t: 22, psi: "none" } },
    { id: "offpeg-eight-percent", query: { t: 11, offpeg: "0.08" } },
    { id: "rising-front", query: { t: 11, front: "DANGER", frontAt: "0.45" }, risingFront: true },
    { id: "tablet-touch", query: { t: 11 }, width: 834, height: 1112, touch: true },
    { id: "ultrawide", query: { t: 11 }, width: 2560, height: 1080 },
  ].map((entry) => ({ width: 1600, height: 1000, touch: false, ...entry,
    query: { t: 11, view: "heart", dews: "CALM", season: "summer", quality: "high", dpr: "1", intro: "0", ...entry.query } }));
}
export function captureUrl(origin, entry, filmstrip = 0) {
  const url = new URL(origin);
  url.search = "";
  for (const [key, value] of Object.entries({ ...entry.query, motion: filmstrip || entry.risingFront ? "full" : "reduce" })) url.searchParams.set(key, value);
  return url.href;
}
export function assertEffective(entry, state) {
  if (!state || classifyGpu(state.gpu) !== "hardware") throw Object.assign(new Error("Unverified hardware capture"), { exitCode: 78 });
  const readings = state.provenance?.effectiveState?.readings;
  if (!readings?.overridden) throw new Error("Contact matrix requires effective DEV analytical overrides; use a DEV origin with the frozen API snapshot");
  if (entry.query.stale && !readings.fog) throw new Error("Stale fixture did not produce stale fog");
  if (entry.query.offpeg && (state.evalResult?.targets?.sea !== 2 || state.evalResult?.seaState !== 2)) throw new Error("8% off-peg did not produce the expected sea state");
  if (entry.query.psi === "none" && readings.psi?.lit !== false) throw new Error("Unavailable PSI is not effective");
  if (!entry.risingFront && state.evalResult?.weather?.band !== entry.query.dews) throw new Error("Requested weather is not effective");
  if (entry.risingFront) {
    const front = state.evalResult?.weather?.front;
    if (!front || front.to <= front.from) throw new Error("Rising front is not effective");
  }
}
const escape = (text) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
export async function composeSheet(captures, out, columns = 3) {
  if (!captures.length) throw new Error("No captures to compose");
  const width = 480, height = 340, overlays = [];
  for (let i = 0; i < captures.length; i++) {
    const c = captures[i], left = (i % columns) * width, top = Math.floor(i / columns) * height;
    const image = await sharp(c.path).resize(width, height - 52, { fit: "contain", background: "#20242b" }).png().toBuffer();
    const label = Buffer.from(`<svg width="${width}" height="52"><rect width="100%" height="100%" fill="#20242b"/><text x="8" y="19" fill="white" font-family="sans-serif" font-size="13">${escape(c.id)}</text><text x="8" y="39" fill="#c4cad2" font-family="sans-serif" font-size="11">${escape(c.label)}</text></svg>`);
    overlays.push({ input: image, top, left }, { input: label, top: top + height - 52, left });
  }
  await sharp({ create: { width: width * columns, height: height * Math.ceil(captures.length / columns), channels: 3, background: "#20242b" } }).composite(overlays).jpeg({ quality: 90 }).toFile(out);
}
async function main() {
  const { values: a } = parseArgs({ options: {
    help: { type: "boolean" }, matrix: { type: "string", default: "true-bearing" }, origin: { type: "string", default: "http://localhost:5173/" },
    snapshot: { type: "string" }, out: { type: "string", default: "outputs/perf/contact" }, filmstrip: { type: "string", default: "0" }, interval: { type: "string", default: "100" },
  } });
  if (a.help) { console.log("Usage: node scripts/harbour/contact-sheet.mjs --snapshot FILE [--matrix true-bearing --origin URL --out DIR --filmstrip 3 --interval 100]\n18 curated cases. Requires effective DEV analytical overrides. Writes labelled sheet.jpg, manifest.json and index.html linking native PNGs/filmstrips. All captures use shot.mjs; no browser launcher."); return; }
  if (!a.snapshot) throw new Error("--snapshot FILE is required for reproducible contact sheets");
  const filmstrip = Number(a.filmstrip), interval = Number(a.interval);
  if (!Number.isInteger(filmstrip) || filmstrip < 0 || !Number.isFinite(interval) || interval <= 0) throw new Error("Invalid filmstrip/interval");
  const entries = captureMatrix(a.matrix), out = resolve(a.out);
  const text = await readFile(resolve(a.snapshot), "utf8"), snapshot = JSON.parse(text);
  if (!snapshot.responses || !Number.isFinite(snapshot.epoch)) throw new Error("Snapshot needs responses and numeric epoch");
  const fixtureHash = createHash("sha256").update(text).digest("hex");
  await mkdir(out, { recursive: true });
  const init = resolve(out, "capture-init.js"), controls = { atMs: 0, epoch: snapshot.epoch, seed: 20261019, elapsed: 120, interval };
  await writeFile(init, `${replayInitScript(snapshot)}\nwindow.__scenario.advanceTo(0);\n(${initializeCapture.toString()})(${JSON.stringify(controls)});`);
  const manifest = { meta: { tool: "contact-sheet", matrix: a.matrix, fixtureHash, ...controls, humanReviewRequired: true }, captures: [] };
  try {
    for (const entry of entries) {
      const frames = entry.risingFront ? Math.max(3, filmstrip) : filmstrip;
      const report = await runShot(["--url", captureUrl(a.origin, entry, frames), "--fixture-hash", fixtureHash,
        "--width", String(entry.width), "--height", String(entry.height), "--screen", `${entry.width}x${entry.height}`, ...(entry.touch ? ["--touch"] : []),
        "--init-script-file", init, "--eval", `(${freezeCapture.toString()})(${JSON.stringify({ ...controls, filmstrip: frames, band: entry.query.dews, risingFront: !!entry.risingFront })})`,
        "--eval-wait", "0", "--wait", entry.risingFront ? "8000" : "0", "--seconds", "0", "--ready-timeout", "120",
        "--frame-eval", "window.__goldenRender(window.__captureFrameIndex)", ...(frames > 1 ? ["--burst", String(frames - 1), "--interval", "0"] : [])], resolve(out, entry.id));
      assertEffective(entry, report);
      const files = [`${entry.id}.png`, ...Array.from({ length: Math.max(0, frames - 1) }, (_, i) => `${entry.id}-${String(i).padStart(2, "0")}.png`)];
      manifest.captures.push({ id: entry.id, file: files[0], files, requested: entry, provenance: report.provenance, state: report.evalResult });
      await writeFile(resolve(out, "manifest.json"), JSON.stringify(manifest, null, 2));
    }
  } catch (error) {
    manifest.error = error.message;
    await writeFile(resolve(out, "manifest.json"), JSON.stringify(manifest, null, 2));
    throw error;
  }
  await composeSheet(manifest.captures.map((c) => ({ id: c.id, path: resolve(out, c.file), label: `${c.provenance.viewport.width}×${c.provenance.viewport.height} @${c.provenance.dpr} | ${c.provenance.buildHash.slice(0, 12)} | ${c.state.weather.band}` })), resolve(out, "sheet.jpg"));
  await writeFile(resolve(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>True Bearing contact sheet</title><h1>True Bearing — native frames and filmstrips</h1><p>Fixture ${fixtureHash}. Numerical differences do not approve art or motion.</p><a href="sheet.jpg">Labelled sheet</a><ul>${manifest.captures.map((c) => `<li>${escape(c.id)}: ${c.files.map((file, i) => `<a href="${file}">frame ${i}</a>`).join(" · ")}</li>`).join("")}</ul>`);
  console.log(`Contact sheet: ${resolve(out, "sheet.jpg")}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = error.exitCode ?? 1; });
