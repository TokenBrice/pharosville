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
  for (const name of ["commit", "dirtyPaths", "viewport", "deviceScaleFactor", "devicePixelRatio", "effectiveDpr", "screen", "timeZone", "headed", "reduced", "reducedMotion", "hash", "vendor", "browserVersion", "worldGeneratedAtMs", "admittedShipDetailIds", "canvasSize", "outputs"]) {
    manifest[name] = field(name, input[name]);
  }
  // No selection and live data are ordinary states, not missing instrumentation.
  manifest.selectedDetailId = input.selectedDetailId ?? null;
  manifest.fixture = input.fixture ?? null;
  manifest.phaseForHour = field("phaseForHour", phaseForHour(input.hour, input.date));
  manifest.unavailable = unavailable;
  return manifest;
}
