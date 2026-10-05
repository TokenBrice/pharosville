import { createHash } from "node:crypto";
import { require as tsxRequire } from "tsx/cjs/api";

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  return value;
}

export function hashFixturePayloads(payloads, sourceEpochMs) {
  return createHash("sha256").update(JSON.stringify(sorted({ sourceEpochMs, payloads }))).digest("hex");
}

const { dayCycleBeats } = tsxRequire("../../src/systems/day-cycle-beats.ts", import.meta.url);
const { gardenSkyDay } = tsxRequire("../../src/systems/sky-almanac.ts", import.meta.url);

/** Dominant beat of the renderer's date-aware sky score; absent inputs stay unknown. */
export function phaseForHour(hour, date) {
  if (!Number.isFinite(hour) || date == null) return null;
  const day = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(day.getTime())) return null;
  const beats = dayCycleBeats(hour, gardenSkyDay(day));
  return Object.keys(beats).reduce((best, name) => beats[name] > beats[best] ? name : best);
}

/** Optional evidence is explicit, never fabricated or fatal to a capture. */
export function buildCaptureManifest(input = {}) {
  input ??= {};
  const unavailable = [];
  const field = (name, value) => {
    if (value == null || (typeof value === "number" && !Number.isFinite(value))) {
      unavailable.push({ field: name, reason: "Not available from this capture" });
      return null;
    }
    return value;
  };
  const manifest = {};
  for (const name of ["commit", "dirtyPaths", "scriptCheckout", "servedCheckout", "viewport", "deviceScaleFactor", "devicePixelRatio", "effectiveDpr", "screen", "timeZone", "headed", "reduced", "reducedMotion", "clean", "hash", "vendor", "renderer", "browserVersion", "camera", "stillCamera", "appearance", "screenshotPhase", "inspectorActive", "worldGeneratedAtMs", "admittedShipDetailIds", "canvasSize", "outputs"]) {
    manifest[name] = field(name, input[name]);
  }
  // No selection and live data are ordinary states, not missing instrumentation.
  manifest.selectedDetailId = input.selectedDetailId ?? null;
  manifest.fixture = input.fixture ?? null;
  manifest.phaseForHour = field("phaseForHour", phaseForHour(input.hour, input.date));
  manifest.unavailable = unavailable;
  return manifest;
}

/** Same canonical local-document checksum as the DEV appearance export. Runtime owns schema validation. */
export function appearanceDocumentIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || !Number.isInteger(value.schemaVersion) || value.schemaVersion < 1 || typeof value.preset !== "string") throw new Error("Invalid appearance document identity.");
  const document = Object.fromEntries(Object.keys(value).filter((key) => key !== "checksum").sort().map((key) => [key, value[key]]));
  const json = JSON.stringify(document);
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index++) hash = Math.imul(hash ^ json.charCodeAt(index), 0x01000193);
  const checksum = (hash >>> 0).toString(16).padStart(8, "0");
  if (value.checksum !== undefined && value.checksum !== checksum) throw new Error("Appearance document checksum mismatch.");
  return { schemaVersion: value.schemaVersion, preset: value.preset, checksum };
}

/** DEV server provenance is obtained independently of the preview script's filesystem. */
export async function fetchServedCheckoutIdentity(url, fetcher = fetch) {
  const response = await fetcher(new URL("/__pharosville/checkout", url), { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Served checkout identity failed (${response.status}).`);
  const identity = await response.json();
  if (!identity || typeof identity.root !== "string" || !identity.root || typeof identity.commit !== "string" || !identity.commit
    || !Array.isArray(identity.dirtyPaths) || typeof identity.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(identity.sourceHash)) throw new Error("Invalid served-checkout identity response.");
  if (identity.dirtyPaths.some((path) => typeof path !== "string" || path.split("/").some((part) => part.startsWith(".env")))) throw new Error("Served checkout identity exposes forbidden environment paths.");
  return identity;
}

/** Comparison identity excludes intentional checkout/preset differences, never evidence inputs. */
export function assertComparableCaptures(left, right) {
  const required = [
    ["fixture.payloadHash", (capture) => capture.fixture?.payloadHash],
    ["fixture", (capture) => capture.fixture],
    ["observer", (capture) => capture.observer],
    ["camera", (capture) => capture.camera],
    ["viewport", (capture) => capture.viewport],
    ["effectiveDpr", (capture) => capture.effectiveDpr],
    ["deviceScaleFactor", (capture) => capture.deviceScaleFactor],
    ["devicePixelRatio", (capture) => capture.devicePixelRatio],
    ["browserVersion", (capture) => capture.browserVersion],
    ["vendor", (capture) => capture.vendor],
    ["renderer", (capture) => capture.renderer],
    ["screen", (capture) => capture.screen],
    ["timeZone", (capture) => capture.timeZone],
    ["headed", (capture) => capture.headed],
    ["reducedMotion", (capture) => capture.reducedMotion],
    ["clean", (capture) => capture.clean],
    ["stillCamera", (capture) => capture.stillCamera],
    ["selectedDetailId", (capture) => capture.selectedDetailId ?? null],
    ["screenshotPhase", (capture) => capture.screenshotPhase],
    ["screenshotTiming", (capture) => capture.screenshotTiming],
    ["hash", (capture) => capture.hash],
  ];
  for (const capture of [left, right]) {
    if (!capture?.servedCheckout?.commit || !capture.servedCheckout.root || !capture.servedCheckout.sourceHash) throw new Error("Missing served-checkout identity.");
    if (capture.servedCheckout.changedDuringCapture) throw new Error("Serving checkout changed during capture; frame cannot qualify as look evidence.");
    if (capture.servedCheckout.samplingIncomplete) throw new Error("Serving identity sampling was incomplete; frame cannot qualify as look evidence.");
    if (!capture.scriptCheckout?.commit || !capture.scriptCheckout.root) throw new Error("Missing script-checkout identity.");
    if (!capture.appearance?.checksum || !capture.appearance.preset || !Number.isInteger(capture.appearance.schemaVersion)
      || capture.appearance.appliedChecksum !== capture.appearance.checksum) throw new Error("Missing or unapplied appearance identity.");
    if (capture.inspectorActive !== false) throw new Error("Inspector-active or unknown frames cannot qualify as art evidence.");
    if (![capture.viewport?.width, capture.viewport?.height, capture.effectiveDpr, capture.deviceScaleFactor, capture.devicePixelRatio]
      .every((value) => Number.isFinite(value) && value > 0)) throw new Error("Missing viewport/DPR identity.");
    if (![capture.camera?.offsetX, capture.camera?.offsetY, capture.camera?.zoom].every(Number.isFinite)
      || capture.camera.zoom <= 0) throw new Error("Missing camera identity.");
    if (!capture.fixture?.payloadHash || !capture.browserVersion || !capture.vendor || !capture.renderer
      || /swiftshader|softwarerasterizer|llvmpipe/i.test(capture.renderer)) throw new Error("Missing or software browser/GPU/fixture identity.");
    if (!capture.screenshotPhase?.sky || !Number.isFinite(capture.screenshotPhase?.hour)) throw new Error("Missing screenshot phase identity.");
    if (capture.headed !== true || capture.stillCamera !== true || typeof capture.reducedMotion !== "boolean" || typeof capture.clean !== "boolean") throw new Error("Missing headed/still/reduced/clean identity.");
    if (![capture.screen?.width, capture.screen?.height].every((value) => Number.isFinite(value) && value > 0)) throw new Error("Missing screen identity.");
    if (typeof capture.selectedDetailId !== "string" && capture.selectedDetailId !== null) throw new Error("Missing selection identity.");
    if (!capture.observer || !["fixed", "flowing"].includes(capture.observer.dateMode) || !Number.isFinite(capture.observer.observerOriginMs)
      || !capture.observer.timeZone || !Number.isFinite(capture.observer.hourPin?.value) || !capture.observer.hourPin.source || !capture.observer.calendarPin) throw new Error("Missing pinned observer identity.");
    if (capture.fixture.name === "live" && (capture.fixture.complete !== true || !capture.fixture.observedPaths?.length)) throw new Error("Live fixture payload identity is incomplete.");
  }
  for (const [name, read] of required) {
    const a = read(left); const b = read(right);
    if (a == null || b == null) {
      if (name === "selectedDetailId" && a === null && b === null) continue;
      throw new Error(`Missing comparison identity: ${name}`);
    }
    if (JSON.stringify(sorted(a)) !== JSON.stringify(sorted(b))) throw new Error(`Mismatched comparison identity: ${name}`);
  }
}
