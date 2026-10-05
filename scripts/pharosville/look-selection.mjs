#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomInt } from "node:crypto";
import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { appearanceDocumentIdentity, assertComparableCaptures } from "./preview-manifest.mjs";
import { PREVIEW_FIXTURES } from "./preview-fixture.mjs";
import { writeContactSheet } from "./preview-metrics.mjs";

const PREVIEW = fileURLToPath(new URL("./preview.mjs", import.meta.url));
const CASE_NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** Complete review programme; every arm has the same explicit observer and shot inputs. */
export function gardenReviewEntries(arms, { clock, selectedDetailId, fixture = "quiet-dense" }) {
  if (!selectedDetailId) throw new Error("The full garden suite requires an admitted selectedDetailId.");
  const entries = [];
  for (const [width, height] of [[1200, 640], [900, 720]]) {
    for (const reduced of [false, true]) {
      const profile = `${width}x${height}-${reduced ? "reduced" : "normal"}`;
      const shots = [
        ...[7, 12.25, 18.5, 19.2, 22].map((hour) => ({ name: `hour-${String(hour).replace(".", "-")}`, hash: `#t=${hour}`, fixture })),
        { name: "dense", hash: "#t=12.25", fixture: "dense" },
        { name: "live", hash: "#t=12.25", fixture: null },
        { name: "selected", hash: `#t=12.25&sel=${encodeURIComponent(selectedDetailId)}`, fixture },
        { name: "overview", hash: "#t=12.25&cam=0,0,0.28", fixture },
      ];
      for (const shot of shots) for (const arm of arms) entries.push({
        ...arm, case: `${shot.name}-${profile}`, stem: `${shot.name}-${profile}-${arm.id}`,
        hash: shot.hash, fixture: shot.fixture, clock, width, height, dpr: arm.dpr ?? 1, reduced,
        clean: arm.clean ?? true, observer: { dateMode: shot.fixture ? "fixed" : "flowing" },
      });
    }
  }
  return entries;
}

export async function normalizeLookMatrix(matrix, baseDirectory = process.cwd()) {
  if (matrix?.schemaVersion !== 1) throw new Error("Look matrix schemaVersion must be 1.");
  if (typeof matrix.outputDirectory !== "string" || !matrix.outputDirectory) throw new Error("Look matrix requires outputDirectory.");
  const raw = matrix.entries ?? (matrix.arms && matrix.suite ? gardenReviewEntries(matrix.arms, matrix.suite) : null);
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("Look matrix requires entries, or arms and a full suite.");
  const outputDirectory = resolve(baseDirectory, matrix.outputDirectory);
  const cases = new Map();
  const stems = new Set();
  const entries = [];
  for (const entry of raw) {
    if (!CASE_NAME.test(entry.case ?? "") || !CASE_NAME.test(entry.id ?? "") || !CASE_NAME.test(entry.stem ?? "")) throw new Error("Each entry needs safe case, id and stem names.");
    if (stems.has(entry.stem)) throw new Error(`Duplicate output stem: ${entry.stem}`);
    stems.add(entry.stem);
    if (typeof entry.checkout !== "string" || !entry.checkout || typeof entry.url !== "string" || !entry.url
      || typeof entry.appearance !== "string" || !entry.appearance) throw new Error("Each arm requires checkout, explicit served URL and local appearance JSON.");
    const served = new URL(entry.url);
    if (!["http:", "https:"].includes(served.protocol) || served.hash || served.username || served.password) throw new Error("Served URL must be an explicit HTTP origin/path without credentials or a hash.");
    if (![null, ...PREVIEW_FIXTURES].includes(entry.fixture)) throw new Error("Choose a known fixture or explicit null for live data.");
    if (!entry.observer || !["fixed", "flowing"].includes(entry.observer.dateMode)) throw new Error("Every entry requires a fixed or flowing observer.");
    if (Object.keys(entry.observer).some((key) => !["dateMode", "observerOriginMs", "timeZone"].includes(key))) throw new Error("Unknown requested observer field.");
    if (entry.fixture === null && entry.observer.dateMode !== "flowing") throw new Error("Live arms require the same clock-pinned flowing observer.");
    if (typeof entry.clock !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(entry.clock) || !Number.isFinite(Date.parse(entry.clock))) throw new Error("Every entry requires an explicit ISO clock/calendar pin.");
    const hour = typeof entry.hash === "string" && entry.hash.startsWith("#") ? new URLSearchParams(entry.hash.slice(1)).get("t") : null;
    if (hour === null || hour === "" || !Number.isFinite(Number(hour)) || Number(hour) < 0 || Number(hour) >= 24
      || new URLSearchParams(entry.hash.slice(1)).has("d")) throw new Error("Every shot requires an explicit finite t= hash; clock owns d=.");
    for (const key of ["width", "height"]) if (!Number.isInteger(entry[key]) || entry[key] <= 0) throw new Error(`Invalid ${key}.`);
    if (!Number.isFinite(entry.dpr) || entry.dpr <= 0 || typeof entry.reduced !== "boolean" || typeof entry.clean !== "boolean") throw new Error("Explicit DPR, reduced and clean settings are required.");
    if (entry.seconds !== undefined && (!Number.isFinite(entry.seconds) || entry.seconds < 0)) throw new Error("Invalid dwell seconds.");
    if (entry.burst !== undefined && (!Number.isInteger(entry.burst) || entry.burst < 2)) throw new Error("Burst count must be at least two.");
    if (entry.clip !== undefined && (!Array.isArray(entry.clip) || entry.clip.length !== 4 || entry.clip.some((value) => !Number.isFinite(value)) || entry.clip[2] <= 0 || entry.clip[3] <= 0)) throw new Error("Clip needs x,y,width,height.");
    if (entry.clip && (entry.clip[0] < 0 || entry.clip[1] < 0 || entry.clip[0] + entry.clip[2] > entry.width || entry.clip[1] + entry.clip[3] > entry.height)) throw new Error("Clip must stay inside the requested viewport.");
    if (entry.clip && !entry.burst) throw new Error("Clip is a secondary burst instrument; full frames are always first.");
    const checkout = await realpath(resolve(baseDirectory, entry.checkout));
    const appearance = resolve(baseDirectory, entry.appearance);
    const appearanceIdentity = appearanceDocumentIdentity(JSON.parse(await readFile(appearance, "utf8")));
    const normalized = { ...entry, checkout, appearance, appearanceIdentity,
      screenshot: resolve(outputDirectory, `${entry.stem}.png`), manifest: resolve(outputDirectory, `${entry.stem}.json`) };
    const group = cases.get(entry.case) ?? [];
    if (group.some((arm) => arm.id === entry.id)) throw new Error(`Duplicate arm ${entry.id} in ${entry.case}.`);
    group.push(normalized); cases.set(entry.case, group); entries.push(normalized);
  }
  const inputs = ["fixture", "observer", "hash", "clock", "width", "height", "dpr", "reduced", "clean", "seconds", "burst", "clip"];
  for (const [name, arms] of cases) {
    if (arms.length !== 2) throw new Error(`Case ${name} must contain exactly two arms for X/Y review.`);
    for (const key of inputs) if (!isDeepStrictEqual(arms[0][key], arms[1][key])) throw new Error(`Case ${name} has mismatched requested ${key}.`);
  }
  return { schemaVersion: 1, outputDirectory, cases: [...cases.entries()], entries };
}

export function previewArguments(entry) {
  const argv = [PREVIEW, "--url", entry.url, "--served-checkout", entry.checkout, "--appearance", entry.appearance,
    "--headed", "--still-camera", "--clock", entry.clock, "--hash", entry.hash,
    "--width", String(entry.width), "--height", String(entry.height), "--dpr", String(entry.dpr),
    "--out", entry.screenshot, "--json", entry.manifest, "--assert"];
  if (entry.fixture !== null) argv.push("--fixture", entry.fixture, "--fixture-clock", entry.observer.dateMode);
  if (entry.reduced) argv.push("--reduced");
  if (entry.clean) argv.push("--clean");
  if (entry.seconds !== undefined) argv.push("--seconds", String(entry.seconds));
  if (entry.burst) argv.push("--burst", String(entry.burst), "--burst-sheet");
  if (entry.clip) argv.push("--clip", entry.clip.join(","));
  return argv;
}

async function capturePreview(entry) {
  await new Promise((resolveRun, reject) => {
    const environment = { ...process.env }; delete environment.CI;
    const child = spawn(process.execPath, previewArguments(entry), { cwd: entry.checkout, env: environment, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolveRun() : reject(new Error(`Preview ${entry.stem} failed (${signal ?? code}); no comparison is promoted.`)));
  });
  return JSON.parse(await readFile(entry.manifest, "utf8"));
}

export function verifyEntryCapture(entry, report) {
  const capture = report?.capture;
  if (!capture || capture.servedCheckout?.root !== entry.checkout) throw new Error(`Wrong or unidentified served checkout for ${entry.stem}.`);
  for (const field of ["checksum", "preset", "schemaVersion"]) if (capture.appearance?.[field] !== entry.appearanceIdentity[field]) throw new Error(`Wrong appearance ${field} for ${entry.stem}.`);
  if (capture.viewport?.width !== entry.width || capture.viewport?.height !== entry.height
    || capture.deviceScaleFactor !== entry.dpr || capture.reducedMotion !== entry.reduced || capture.stillCamera !== true
    || capture.hash !== `${entry.hash}&d=${entry.clock.slice(0, 10)}` || capture.headed !== true) throw new Error(`Requested shot inputs were not honored for ${entry.stem}.`);
  if (capture.fixture?.name !== (entry.fixture ?? "live") || capture.observer?.dateMode !== entry.observer.dateMode) throw new Error(`Wrong fixture/observer for ${entry.stem}.`);
  const selected = new URLSearchParams(entry.hash.slice(1)).get("sel");
  if (capture.selectedDetailId !== selected) throw new Error(`Requested selection was not honored for ${entry.stem}.`);
  if (capture.outputs?.screenshot !== entry.screenshot || capture.outputs?.json !== entry.manifest) throw new Error(`Wrong output identity for ${entry.stem}.`);
  for (const field of ["observerOriginMs", "timeZone"]) if (entry.observer[field] !== undefined
    && capture.observer?.[field] !== entry.observer[field]) throw new Error(`Requested observer ${field} was not honored for ${entry.stem}.`);
  const hashParams = new URLSearchParams(entry.hash.slice(1));
  if (capture.observer?.calendarPin !== entry.clock.slice(0, 10) || capture.observer?.hourPin?.source !== "t"
    || capture.observer.hourPin.value !== Number(hashParams.get("t"))) throw new Error(`Requested calendar/hour observer was not honored for ${entry.stem}.`);
  if (hashParams.has("cam")) {
    const requested = hashParams.get("cam").split(",").map(Number);
    if (requested.length !== 3 || !requested.every(Number.isFinite) || requested.some((value, index) => value !== [capture.camera?.offsetX, capture.camera?.offsetY, capture.camera?.zoom][index])) throw new Error(`Requested camera was not honored for ${entry.stem}.`);
  }
  if (capture.clean !== entry.clean) throw new Error(`Requested clean setting was not honored for ${entry.stem}.`);
  if (capture.screenshotPhase?.hour !== Number(new URLSearchParams(entry.hash.slice(1)).get("t"))) throw new Error(`Requested screenshot hour was not honored for ${entry.stem}.`);
  assertComparableCaptures(capture, capture);
  return capture;
}

async function labelledFrame(path, label) {
  const image = await readFile(path);
  const { width } = await sharp(image).metadata();
  const heading = Buffer.from(`<svg width="${width}" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111"/><text x="16" y="28" fill="#fff" font-family="sans-serif" font-size="24">${label}</text></svg>`);
  return sharp(image).extend({ top: 40, bottom: 0, left: 0, right: 0, background: "#111" }).composite([{ input: heading, left: 0, top: 0 }]).png().toBuffer();
}

/** Serial GPU jobs only. A refused identity stops the lane before any review sheet/key exists. */
export async function runLookSelection(matrix, { baseDirectory = process.cwd(), capture = capturePreview, choose = randomInt } = {}) {
  const plan = await normalizeLookMatrix(matrix, baseDirectory);
  let existing;
  try { existing = await readdir(plan.outputDirectory); } catch (error) { if (error.code !== "ENOENT") throw error; existing = []; }
  if (existing.length) throw new Error("Look selection needs a fresh output directory; existing evidence is never overwritten.");
  await mkdir(plan.outputDirectory, { recursive: true });
  const records = [];
  for (const [name, entries] of plan.cases) {
    const arms = [];
    for (const entry of entries) {
      const report = await capture(entry);
      arms.push({ entry, report, capture: verifyEntryCapture(entry, report) });
      if (arms.length === 2) assertComparableCaptures(arms[0].capture, arms[1].capture);
    }
    records.push({ name, arms });
    const bursts = arms.map((arm) => arm.report.instruments?.burst);
    const expectedClip = entries[0].clip ? { x: entries[0].clip[0], y: entries[0].clip[1], width: entries[0].clip[2], height: entries[0].clip[3] } : null;
    if (bursts.some((burst) => Boolean(burst) !== Boolean(entries[0].burst))
      || (entries[0].burst && (bursts.some((burst) => burst.paths?.length !== entries[0].burst || burst.count !== entries[0].burst || !isDeepStrictEqual(burst.clip, expectedClip))
        || bursts[0].intervalMs !== bursts[1].intervalMs))) throw new Error(`Mismatched secondary burst evidence: ${name}`);
  }
  const review = [];
  const key = { schemaVersion: 1, createdAt: new Date().toISOString(), cases: [] };
  const ordered = records.map((record) => ({ ...record, arms: choose(2) === 0 ? record.arms : [...record.arms].reverse() }));
  for (const [index, { name, arms }] of ordered.entries()) {
    const fullPath = resolve(plan.outputDirectory, `full-${String(index + 1).padStart(2, "0")}.png`);
    await writeContactSheet([await labelledFrame(arms[0].entry.screenshot, "X"), await labelledFrame(arms[1].entry.screenshot, "Y")], fullPath);
    review.push({ case: name, fullFrame: fullPath, secondaryDetails: [] });
    key.cases.push({ case: name, X: { entry: arms[0].entry, capture: arms[0].capture }, Y: { entry: arms[1].entry, capture: arms[1].capture } });
  }
  // Every full-frame sheet exists before any motion/crop detail is presented.
  for (const [index, { arms }] of ordered.entries()) {
    const bursts = arms.map((arm) => arm.report.instruments?.burst?.paths ?? []);
    for (let frame = 0; frame < bursts[0].length; frame++) {
      const path = resolve(plan.outputDirectory, `detail-${String(index + 1).padStart(2, "0")}-${String(frame).padStart(2, "0")}.png`);
      await writeContactSheet([await labelledFrame(bursts[0][frame], "X"), await labelledFrame(bursts[1][frame], "Y")], path);
      review[index].secondaryDetails.push(path);
    }
  }
  const keyPath = resolve(plan.outputDirectory, "private-xy-key.json");
  await writeFile(keyPath, `${JSON.stringify(key, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  const reviewPath = resolve(plan.outputDirectory, "review.json");
  await writeFile(reviewPath, `${JSON.stringify({ schemaVersion: 1, presentationOrder: "all full frames first, secondary details second", cases: review }, null, 2)}\n`, { flag: "wx" });
  return { reviewPath, keyPath, cases: review };
}

/** Cold recapture uses the original private key, never an assumed winning checkout. */
export async function recaptureLookWinner(key, caseName, label, outputDirectory, { capture = capturePreview } = {}) {
  if (key?.schemaVersion !== 1 || !CASE_NAME.test(caseName) || !["X", "Y"].includes(label)) throw new Error("Winner recapture requires a versioned X/Y key and safe case name.");
  const winner = key.cases?.find((entry) => entry.case === caseName)?.[label];
  if (!winner) throw new Error("Winner case is absent from the private key.");
  const stem = `winner-${caseName}-${label.toLowerCase()}`;
  const entry = { ...winner.entry, stem, screenshot: resolve(outputDirectory, `${stem}.png`), manifest: resolve(outputDirectory, `${stem}.json`) };
  const identity = appearanceDocumentIdentity(JSON.parse(await readFile(entry.appearance, "utf8")));
  if (identity.checksum !== entry.appearanceIdentity.checksum) throw new Error("Winner appearance document changed since comparison.");
  let existing;
  try { existing = await readdir(outputDirectory); } catch (error) { if (error.code !== "ENOENT") throw error; existing = []; }
  if (existing.length) throw new Error("Cold winner recapture needs a fresh output directory.");
  await mkdir(outputDirectory, { recursive: true });
  const report = await capture(entry);
  const actual = verifyEntryCapture(entry, report);
  assertComparableCaptures(winner.capture, actual);
  if (actual.servedCheckout.commit !== winner.capture.servedCheckout.commit || actual.servedCheckout.sourceHash !== winner.capture.servedCheckout.sourceHash) throw new Error("Winner checkout changed since comparison.");
  return { screenshot: entry.screenshot, manifest: entry.manifest };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const argv = process.argv.slice(2);
  const flags = Object.fromEntries(Array.from({ length: Math.ceil(argv.length / 2) }, (_, index) => [argv[index * 2], argv[index * 2 + 1]]));
  try {
    if (flags["--matrix"] && argv.length === 2) {
      const path = resolve(flags["--matrix"]);
      const result = await runLookSelection(JSON.parse(await readFile(path, "utf8")), { baseDirectory: dirname(path) });
      console.log(`review ${result.reviewPath}\nprivate key ${result.keyPath}`);
    } else if (flags["--key"] && flags["--winner"] && flags["--out"] && argv.length === 6) {
      const [name, label] = flags["--winner"].split(":");
      const result = await recaptureLookWinner(JSON.parse(await readFile(resolve(flags["--key"]), "utf8")), name, label, resolve(flags["--out"]));
      console.log(`cold winner ${result.screenshot}\nmanifest ${result.manifest}`);
    } else throw new Error("Usage: node scripts/pharosville/look-selection.mjs --matrix <local-json> OR --key <private-json> --winner <case:X|Y> --out <directory>");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
