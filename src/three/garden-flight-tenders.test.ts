import { InstancedMesh, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import {
  createGardenFlightTenders,
  flightTenderPull,
  flightTenderStationProgress,
  flightTenderStationShare,
  flightTenderTitans,
  flightTenderTurn,
  FLIGHT_TENDERS_MESH_NAME,
  FLIGHT_TENDERS_PER_TITAN,
  FLIGHT_TENDER_TITAN_COUNT,
  type FlightTenderSpec,
  type GardenFlightTenders,
} from "./garden-flight-tenders";

const TITAN: FlightTenderSpec = { hullRadius: 2.2, shipId: "usdt-tether" };

function tenderMesh(tenders: GardenFlightTenders): InstancedMesh {
  const mesh = tenders.root.children[0];
  if (!(mesh instanceof InstancedMesh)) throw new Error("no tender mesh");
  return mesh;
}

const scratch = new Matrix4();
const scratchPosition = new Vector3();

/** Distance from the anchor the flotilla was placed on, in world units. */
function standOff(tenders: GardenFlightTenders, index: number, anchorX = 0, anchorZ = 0): number {
  tenderMesh(tenders).getMatrixAt(index, scratch);
  scratchPosition.setFromMatrixPosition(scratch);
  return Math.hypot(scratchPosition.x - anchorX, scratchPosition.z - anchorZ);
}

function instanceScale(tenders: GardenFlightTenders, index: number): number {
  tenderMesh(tenders).getMatrixAt(index, scratch);
  return new Vector3().setFromMatrixScale(scratch).x;
}

const FULL_FRAME = { detail: 1, reducedMotion: false, timeSeconds: 0 };

/** Every boat's furthest stand-off over a long sweep — her offshore waiting berth. */
function offshoreBerths(
  tenders: GardenFlightTenders,
  count: number,
  anchorX: number,
  anchorZ: number,
): number[] {
  const berths = new Array<number>(count).fill(0);
  for (let seconds = 0; seconds <= 600; seconds += 2) {
    tenders.flush({ detail: 1, reducedMotion: false, timeSeconds: seconds });
    for (let index = 0; index < count; index += 1) {
      berths[index] = Math.max(berths[index]!, standOff(tenders, index, anchorX, anchorZ));
    }
  }
  return berths;
}

/** Boats lying in on their titan rather than waiting out in open water. */
function onStationCount(
  tenders: GardenFlightTenders,
  berths: readonly number[],
  anchorX: number,
  anchorZ: number,
): number {
  return berths.reduce(
    (total, berth, index) => (
      standOff(tenders, index, anchorX, anchorZ) < berth - 0.3 ? total + 1 : total
    ),
    0,
  );
}

describe("flightTenderTitans", () => {
  const fleet = [
    { ship: { id: "small", marketCapUsd: 1_000_000 } },
    { ship: { id: "biggest", marketCapUsd: 90_000_000_000 } },
    { ship: { id: "second", marketCapUsd: 60_000_000_000 } },
    { ship: { id: "third", marketCapUsd: 5_000_000_000 } },
    { ship: { id: "fourth", marketCapUsd: 900_000_000 } },
  ];

  it("takes the largest market caps, in order", () => {
    expect(flightTenderTitans(fleet, { flightToQuality: true }).map((entry) => entry.ship.id))
      .toEqual(["biggest", "second", "third"]);
    expect(FLIGHT_TENDER_TITAN_COUNT).toBe(3);
  });

  it("names no hull at all when the gauge reads false or never landed", () => {
    // The load-bearing half of the contract: absence must not read as a quiet
    // version of the cue, so there is no quiet version to render.
    expect(flightTenderTitans(fleet, { flightToQuality: false })).toEqual([]);
    expect(flightTenderTitans(fleet, null)).toEqual([]);
    expect(flightTenderTitans(fleet, undefined)).toEqual([]);
  });
});

describe("createGardenFlightTenders", () => {
  it("builds nothing when no hull carries a flotilla", () => {
    const tenders = createGardenFlightTenders([], 80);
    expect(tenders.count).toBe(0);
    expect(tenders.root.children).toHaveLength(0);
  });

  it("draws every boat on every titan in one instanced call", () => {
    const tenders = createGardenFlightTenders(
      [TITAN, { hullRadius: 2, shipId: "usdc-circle" }, { hullRadius: 1.8, shipId: "usds-sky" }],
      50,
    );
    const meshes = tenders.root.children.filter((child) => child instanceof InstancedMesh);
    expect(meshes).toHaveLength(1);
    expect(tenders.count).toBe(3 * FLIGHT_TENDERS_PER_TITAN);
    expect(tenderMesh(tenders).count).toBe(tenders.count);
    // One draw call, not two: a shadow pass would double this cue's cost for a
    // boat that casts nothing legible from the fixed high camera.
    expect(tenderMesh(tenders).castShadow).toBe(false);
    expect(tenders.root.name).toBe(FLIGHT_TENDERS_MESH_NAME);
  });

  it("keeps each flotilla with its own titan as the hulls move apart", () => {
    const tenders = createGardenFlightTenders([TITAN, { hullRadius: 2, shipId: "usdc-circle" }], 100);
    tenders.place(0, -40, -40);
    tenders.place(1, 60, 25);
    tenders.flush(FULL_FRAME);

    for (let boat = 0; boat < FLIGHT_TENDERS_PER_TITAN; boat += 1) {
      expect(standOff(tenders, boat, -40, -40)).toBeLessThan(12);
      expect(standOff(tenders, FLIGHT_TENDERS_PER_TITAN + boat, 60, 25)).toBeLessThan(12);
    }
  });

  it("comes in, LIES on station, and draws back out — never charges", () => {
    const tenders = createGardenFlightTenders([TITAN], 0);
    tenders.place(0, 0, 0);

    // Boat 0's own phase decides where in her tide t=0 falls, so sweep a couple
    // of whole periods and assert the SHAPE: she both closes and opens, never
    // leaves the band her two radii define, and — the W3.5 point — spends real
    // time HELD at each end rather than turning round the moment she arrives.
    const reach: number[] = [];
    for (let seconds = 0; seconds <= 400; seconds += 2) {
      tenders.flush({ detail: 1, reducedMotion: false, timeSeconds: seconds });
      reach.push(standOff(tenders, 0));
    }
    const closest = Math.min(...reach);
    const furthest = Math.max(...reach);
    expect(closest).toBeLessThan(furthest - 1);
    expect(closest).toBeGreaterThanOrEqual(TITAN.hullRadius);

    const held = reach.filter((distance) => distance < closest + 0.05).length / reach.length;
    const waiting = reach.filter((distance) => distance > furthest - 0.05).length / reach.length;
    expect(held).toBeGreaterThan(0.15);
    expect(waiting).toBeGreaterThan(0.4);
  });

  it("takes minutes, not seconds, to work through one tide", () => {
    const tenders = createGardenFlightTenders([TITAN], 0);
    tenders.place(0, 0, 0);
    // Nothing in this cue may repeat on a timescale the eye can count. Count the
    // ARRIVALS in ten minutes: at the old 13–26 s charge loop this was dozens.
    const reach: number[] = [];
    for (let seconds = 0; seconds <= 600; seconds += 2) {
      tenders.flush({ detail: 1, reducedMotion: false, timeSeconds: seconds });
      reach.push(standOff(tenders, 0));
    }
    const station = Math.min(...reach) + 0.05;
    let arrivals = 0;
    for (let index = 1; index < reach.length; index += 1) {
      if (reach[index]! < station && reach[index - 1]! >= station) arrivals += 1;
    }
    expect(arrivals).toBeGreaterThanOrEqual(2);
    expect(arrivals).toBeLessThanOrEqual(4);
  });

  it("carries intensity as how many boats stand off, not how often they come", () => {
    const weak = createGardenFlightTenders([TITAN], 0);
    const strong = createGardenFlightTenders([TITAN], 100);
    weak.place(0, 4, 4);
    strong.place(0, 4, 4);
    const weakBerths = offshoreBerths(weak, FLIGHT_TENDERS_PER_TITAN, 4, 4);
    const strongBerths = offshoreBerths(strong, FLIGHT_TENDERS_PER_TITAN, 4, 4);

    // Averaged over a whole tide, a strong reading keeps more of the flotilla
    // under the hull at any instant than a weak one does.
    const attendance = (
      tenders: GardenFlightTenders,
      berths: readonly number[],
    ): number => {
      let total = 0;
      let samples = 0;
      for (let seconds = 0; seconds <= 600; seconds += 5) {
        tenders.flush({ detail: 1, reducedMotion: false, timeSeconds: seconds });
        total += onStationCount(tenders, berths, 4, 4);
        samples += 1;
      }
      return total / samples;
    };
    expect(attendance(strong, strongBerths)).toBeGreaterThan(attendance(weak, weakBerths) + 1);
  });

  it("holds the intensity's share of the flotilla on station under reduced motion", () => {
    const tenders = createGardenFlightTenders([TITAN], 70);
    tenders.place(0, 12, -6);
    const berths = offshoreBerths(tenders, FLIGHT_TENDERS_PER_TITAN, 12, -6);

    tenders.flush({ detail: 1, reducedMotion: true, timeSeconds: 0 });
    const composed = Array.from(
      { length: FLIGHT_TENDERS_PER_TITAN },
      (_, index) => standOff(tenders, index, 12, -6),
    );

    // Deterministic: the clock is not read at all, so a reduced-motion frame
    // drawn at any time lands in exactly the same place.
    for (const timeSeconds of [0, 7.5, 1_000, 86_400]) {
      tenders.flush({ detail: 1, reducedMotion: true, timeSeconds });
      for (const [index, distance] of composed.entries()) {
        expect(standOff(tenders, index, 12, -6)).toBeCloseTo(distance, 10);
      }
    }

    // And it is the cue's own statement, not an arbitrary freeze: some boats lie
    // in under the hull and the rest wait offshore, which is what the moving
    // flotilla looks like at any instant.
    tenders.flush({ detail: 1, reducedMotion: true, timeSeconds: 0 });
    const standing = onStationCount(tenders, berths, 12, -6);
    expect(standing).toBeGreaterThan(0);
    expect(standing).toBeLessThan(FLIGHT_TENDERS_PER_TITAN);
  });

  it("shows more boats standing off in a still frame as the reading strengthens", () => {
    const still = { detail: 1, reducedMotion: true, timeSeconds: 0 };
    const counts = [0, 70, 100].map((intensity) => {
      const tenders = createGardenFlightTenders([TITAN], intensity);
      tenders.place(0, 0, 0);
      const berths = offshoreBerths(tenders, FLIGHT_TENDERS_PER_TITAN, 0, 0);
      tenders.flush(still);
      return onStationCount(tenders, berths, 0, 0);
    });
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[2]).toBe(FLIGHT_TENDERS_PER_TITAN);
    expect(counts[0]).toBeLessThan(counts[2]!);
    expect(counts[1]).toBeGreaterThanOrEqual(counts[0]!);
  });

  it("floats on the water plane", () => {
    const tenders = createGardenFlightTenders([TITAN], 40);
    tenders.place(0, 3, 3);
    tenders.flush(FULL_FRAME);
    tenderMesh(tenders).getMatrixAt(0, scratch);
    expect(scratchPosition.setFromMatrixPosition(scratch).y).toBeCloseTo(GARDEN_WATER_Y, 6);
  });

  it("sheds with the overview policy instead of shrinking toward a shared centroid", () => {
    const tenders = createGardenFlightTenders([TITAN], 60);
    tenders.place(0, 30, -30);

    tenders.flush({ ...FULL_FRAME, detail: 0 });
    expect(tenderMesh(tenders).visible).toBe(false);

    tenders.flush({ ...FULL_FRAME, detail: 0.5 });
    expect(tenderMesh(tenders).visible).toBe(true);
    const half = instanceScale(tenders, 0);
    const halfStandOff = standOff(tenders, 0, 30, -30);
    tenders.flush(FULL_FRAME);
    expect(instanceScale(tenders, 0)).toBeCloseTo(half * 2, 6);
    // Each boat shrinks in place: the flotilla's geometry is world-space, so a
    // group-level scale would drag every boat toward a shared centre instead.
    expect(standOff(tenders, 0, 30, -30)).toBeCloseTo(halfStandOff, 6);
  });

  it("is seeded, so a data refresh restands the same flotilla", () => {
    const first = createGardenFlightTenders([TITAN], 55);
    const second = createGardenFlightTenders([TITAN], 55);
    first.place(0, 5, 5);
    second.place(0, 5, 5);
    first.flush({ detail: 1, reducedMotion: false, timeSeconds: 9 });
    second.flush({ detail: 1, reducedMotion: false, timeSeconds: 9 });
    for (let index = 0; index < FLIGHT_TENDERS_PER_TITAN; index += 1) {
      expect(standOff(second, index, 5, 5)).toBeCloseTo(standOff(first, index, 5, 5), 10);
    }
  });
});

describe("flightTenderPull", () => {
  it("converges harder as the reported intensity rises", () => {
    expect(flightTenderPull(0)).toBeLessThan(flightTenderPull(50));
    expect(flightTenderPull(50)).toBeLessThan(flightTenderPull(100));
    expect(flightTenderPull(100)).toBe(1);
  });

  it("still attends, even at the weakest reading", () => {
    // `flightToQuality` is already a boolean the feed asserted; a zero-intensity
    // flight is still a flight, and an empty sea is what "no flight" looks like.
    expect(flightTenderPull(0)).toBeGreaterThan(0);
    expect(flightTenderPull(Number.NaN)).toBe(flightTenderPull(0));
    expect(flightTenderPull(-40)).toBe(flightTenderPull(40));
    expect(flightTenderPull(4_000)).toBe(1);
  });
});

describe("flightTenderStationShare", () => {
  it("puts more of the flotilla on station as the reading strengthens", () => {
    expect(flightTenderStationShare(flightTenderPull(0)))
      .toBeLessThan(flightTenderStationShare(flightTenderPull(100)));
    // Never all of the time, and never none of it: the cue can neither empty nor
    // freeze into a permanent crowd.
    expect(flightTenderStationShare(flightTenderPull(0))).toBeGreaterThan(0.2);
    expect(flightTenderStationShare(flightTenderPull(100))).toBeLessThan(1);
  });
});

describe("flightTenderStationProgress", () => {
  const SHARE = 0.5;

  it("eases in, HOLDS, and eases back out", () => {
    expect(flightTenderStationProgress(0, SHARE)).toBeCloseTo(0, 10);
    // The middle of the station leg is a flat hold, not a peak: sample either
    // side of centre and get the same answer.
    expect(flightTenderStationProgress(0.2, SHARE)).toBeCloseTo(1, 6);
    expect(flightTenderStationProgress(0.3, SHARE)).toBeCloseTo(1, 6);
    expect(flightTenderStationProgress(0.1, SHARE)).toBeGreaterThan(0);
    expect(flightTenderStationProgress(0.1, SHARE)).toBeLessThan(1);
  });

  it("waits offshore for the rest of the tide, and joins flat at both ends", () => {
    expect(flightTenderStationProgress(0.6, SHARE)).toBe(0);
    expect(flightTenderStationProgress(0.99, SHARE)).toBe(0);
    // Approaching the ends of the station leg from inside, the value has already
    // settled to zero — nothing snaps on or off station.
    expect(flightTenderStationProgress(0.4999, SHARE)).toBeLessThan(0.001);
    expect(flightTenderStationProgress(0.0001, SHARE)).toBeLessThan(0.001);
  });

  it("wraps, and stays inside [0, 1] at any share", () => {
    expect(flightTenderStationProgress(3.25, SHARE))
      .toBeCloseTo(flightTenderStationProgress(0.25, SHARE), 10);
    for (const share of [0.05, 0.43, 0.94, 1.4, -2]) {
      for (const phase of [0, 0.2, 0.5, 0.9, 1.4]) {
        const value = flightTenderStationProgress(phase, share);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("flightTenderTurn", () => {
  it("keeps her bow at the hull while she attends and turns her as she draws off", () => {
    expect(flightTenderTurn(0.1, 0.5)).toBe(0);
    expect(flightTenderTurn(0.25, 0.5)).toBe(0);
    expect(flightTenderTurn(0.49, 0.5)).toBeGreaterThan(0.9);
  });

  it("comes back round offshore, so the wrap is continuous", () => {
    // Continuous across the join out of the station leg...
    expect(flightTenderTurn(0.5001, 0.5)).toBeCloseTo(1, 2);
    // ...and back to bow-in before her next approach.
    expect(flightTenderTurn(0.95, 0.5)).toBe(0);
    expect(flightTenderTurn(0.9999, 0.5)).toBe(0);
  });
});
