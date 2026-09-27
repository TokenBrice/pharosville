import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultCamera } from "./camera";
import { dayCycleBeats, type DayCycleBeatName } from "./day-cycle-beats";
import {
  GARDEN_ARRIVAL_AIR_VEIL,
  GARDEN_ARRIVAL_AIR_VEIL_MS,
  GARDEN_ARRIVAL_DURATION_MS,
  GARDEN_ARRIVAL_EYE_RISE,
  sampleGardenArrival,
  sampleGardenArrivalCeremonyPose,
} from "./garden-arrival";
import { cameraView, cameraViewAngles, worldToScreen } from "./projection";
import { gardenSkyDay, gardenSkyLatitudeForZone } from "./sky-almanac";
import { buildPharosVilleMap } from "./world-layout";

const INDEX_HTML = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const VEIL_SCRIPT = /<script>([\s\S]*?)<\/script>/.exec(INDEX_HTML)![1]!;

/** Runs the inline veil script against a stub page; returns the beat it painted. */
function inlineVeilBeat(hash: string, timeZone: string): string | null {
  const attributes = new Map<string, string>();
  const root = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    style: { background: "", setProperty: () => undefined },
  };
  const intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) };
  const location = { hash, hostname: "localhost", search: "" };
  new Function("location", "document", "Intl", VEIL_SCRIPT)(location, { documentElement: root }, intl);
  expect(root.style.background).toMatch(/^rgb\(.+linear-gradient\(/);
  return attributes.get("data-pv-veil-beat") ?? null;
}

function dominantBeat(beats: Record<DayCycleBeatName, number>): DayCycleBeatName {
  let beat: DayCycleBeatName = "day";
  for (const name of Object.keys(beats) as DayCycleBeatName[]) if (beats[name] > beats[beat]) beat = name;
  return beat;
}

describe("garden arrival (K17)", () => {
  const map = buildPharosVilleMap();
  const viewport = { x: 1568, y: 1004 };
  const rest = defaultCamera({ height: viewport.y, map, width: viewport.x });
  const restView = cameraView(rest, viewport);
  const tower = { x: 94.8, y: 20, z: 109 };

  it("rises the eye straight up onto the rest ShotSpec: no slide, no zoom, no turn", () => {
    const seat = worldToScreen(tower, rest, viewport);
    const restAngles = cameraViewAngles(restView);
    let previousDrop = Number.POSITIVE_INFINITY;
    for (const elapsed of [0, 1_000, 3_000, 4_500, 6_000, 8_000, GARDEN_ARRIVAL_DURATION_MS - 1]) {
      const sample = sampleGardenArrival(rest, elapsed);
      expect(sample.done).toBe(false);
      const view = cameraView(sample.camera, viewport);
      const drop = restView.eye.y - view.eye.y;
      expect(drop).toBeGreaterThanOrEqual(0);
      expect(drop).toBeLessThanOrEqual(previousDrop);
      previousDrop = drop;
      expect(view.eye.x).toBe(restView.eye.x);
      expect(view.eye.z).toBe(restView.eye.z);
      const angles = cameraViewAngles(view);
      expect(angles.yaw).toBeCloseTo(restAngles.yaw, 9);
      expect(angles.pitch).toBeCloseTo(restAngles.pitch, 9);
      expect(angles.distance).toBeCloseTo(restAngles.distance, 9);
      expect(view.vFovDeg).toBe(restView.vFovDeg);
      // camera-6 acceptance: no horizontal translation above 1 % of the frame.
      expect(Math.abs(worldToScreen(tower, sample.camera, viewport).x - seat.x)).toBeLessThan(viewport.x * 0.01);
      // The threshold rides the eye's offset from the rest eye, so the rest itself is never moved.
      expect(sample.camera.rest).toBe(rest.rest);
    }
    expect(restView.eye.y - cameraView(sampleGardenArrival(rest, 0).camera, viewport).eye.y).toBeCloseTo(GARDEN_ARRIVAL_EYE_RISE, 9);
    expect(sampleGardenArrival(rest, GARDEN_ARRIVAL_DURATION_MS)).toEqual({ airVeil: 1, camera: rest, done: true });
  });

  it("thins the air veil from its arrival thickness to the hour's own air within 6 s", () => {
    expect(sampleGardenArrival(rest, 0).airVeil).toBeCloseTo(GARDEN_ARRIVAL_AIR_VEIL, 9);
    let previous = Number.POSITIVE_INFINITY;
    for (let elapsed = 0; elapsed <= GARDEN_ARRIVAL_AIR_VEIL_MS; elapsed += 500) {
      const { airVeil } = sampleGardenArrival(rest, elapsed);
      expect(airVeil).toBeLessThanOrEqual(previous);
      expect(airVeil).toBeGreaterThanOrEqual(1);
      previous = airVeil;
    }
    expect(sampleGardenArrival(rest, GARDEN_ARRIVAL_AIR_VEIL_MS).airVeil).toBe(1);
  });

  it("authors an eight-to-twelve-second ceremony with a deterministic reduced-motion mid-pose", () => {
    expect(sampleGardenArrivalCeremonyPose(0, 10)).toEqual({
      compression: 1,
      ensoWake: 0,
      sailDip: 0,
    });
    const middle = sampleGardenArrivalCeremonyPose(5, 10);
    expect(middle.compression).toBeCloseTo(0.84);
    expect(middle.sailDip).toBe(1);
    expect(sampleGardenArrivalCeremonyPose(99, 10)).toEqual({
      compression: 1,
      ensoWake: 0,
      sailDip: 0,
    });
    expect(sampleGardenArrivalCeremonyPose(0, 8, true)).toEqual(middle);
  });
});

describe("inline hour veil (index.html, K17)", () => {
  it("paints the same beat as the sky clock for the zone, date and hour", () => {
    const zones = ["Europe/Paris", "Africa/Johannesburg", "Australia/Perth", "America/Lima", "Asia/Tokyo"];
    const days = ["2026-06-21", "2026-09-26", "2026-12-21"];
    for (const zone of zones) {
      for (const day of days) {
        const [year, month, date] = day.split("-").map(Number) as [number, number, number];
        // In a browser the zone is the runtime's own, so its DST half-year also counts (sky-almanac).
        const january = new Date(year, 0, 1).getTimezoneOffset();
        const july = new Date(year, 6, 1).getTimezoneOffset();
        const southern = (january !== july && january < july) || gardenSkyLatitudeForZone(zone, year).southern;
        const latitude = { latitudeRad: ((southern ? -35 : 35) * Math.PI) / 180, southern };
        const sky = gardenSkyDay(new Date(year, month - 1, date, 12), latitude);
        for (let hour = 0; hour < 24; hour += 0.25) {
          const beats = dayCycleBeats(hour, sky);
          const sorted = Object.values(beats).sort((a, b) => b - a);
          // A near-even crossfade may round either way; every settled hour must agree.
          if (sorted[0]! - sorted[1]! < 0.02) continue;
          expect(`${zone} ${day} ${hour} ${inlineVeilBeat(`#t=${hour}&d=${day}`, zone)}`)
            .toBe(`${zone} ${day} ${hour} ${dominantBeat(beats)}`);
        }
      }
    }
  });

  it("is allowed by the document CSP (public/_headers carries its hash)", () => {
    const hash = createHash("sha256").update(VEIL_SCRIPT, "utf8").digest("base64");
    const headers = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
    expect(headers).toContain(`'sha256-${hash}'`);
  });

});
