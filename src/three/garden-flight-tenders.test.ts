import { InstancedMesh, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import {
  createGardenFlightTenders,
  flightTenderPull,
  flightTenderRunProgress,
  flightTenderTitans,
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

  it("closes on the hull over a run and opens back out", () => {
    const tenders = createGardenFlightTenders([TITAN], 100);
    tenders.place(0, 0, 0);

    // Boat 0's own phase decides where in its run t=0 falls, so sweep a whole
    // cycle and assert the SHAPE: the boat both closes and opens, and never
    // leaves the band its two radii define.
    const reach: number[] = [];
    for (let step = 0; step < 24; step += 1) {
      tenders.flush({ detail: 1, reducedMotion: false, timeSeconds: step });
      reach.push(standOff(tenders, 0));
    }
    const closest = Math.min(...reach);
    const furthest = Math.max(...reach);
    expect(closest).toBeLessThan(furthest - 1);
    expect(closest).toBeGreaterThanOrEqual(TITAN.hullRadius);
  });

  it("pins every boat at its converged position under reduced motion", () => {
    const tenders = createGardenFlightTenders([TITAN], 70);
    tenders.place(0, 12, -6);

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

    // And it is the CONVERGED end of the run, not an arbitrary freeze: every
    // boat sits closer than it ever does at the far end of a moving run.
    let furthestMoving = 0;
    for (let step = 0; step < 40; step += 1) {
      tenders.flush({ detail: 1, reducedMotion: false, timeSeconds: step });
      for (let index = 0; index < FLIGHT_TENDERS_PER_TITAN; index += 1) {
        furthestMoving = Math.max(furthestMoving, standOff(tenders, index, 12, -6));
      }
    }
    expect(Math.max(...composed)).toBeLessThan(furthestMoving);
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

  it("never holds station, even at the weakest reading", () => {
    // `flightToQuality` is already a boolean the feed asserted; a zero-intensity
    // flight is still a flight, and boats that never closed would read as calm.
    expect(flightTenderPull(0)).toBeGreaterThan(0);
    expect(flightTenderPull(Number.NaN)).toBe(flightTenderPull(0));
    expect(flightTenderPull(-40)).toBe(flightTenderPull(40));
    expect(flightTenderPull(4_000)).toBe(1);
  });
});

describe("flightTenderRunProgress", () => {
  it("runs in quickly and drifts back out", () => {
    expect(flightTenderRunProgress(0)).toBeCloseTo(0, 10);
    expect(flightTenderRunProgress(0.34)).toBeCloseTo(1, 10);
    expect(flightTenderRunProgress(0.17)).toBeCloseTo(0.5, 6);
    // The drift out takes about twice as long as the dash in.
    expect(flightTenderRunProgress(0.67)).toBeGreaterThan(0.4);
    expect(flightTenderRunProgress(0.67)).toBeLessThan(0.6);
  });

  it("wraps flat, so the cycle never snaps", () => {
    expect(flightTenderRunProgress(0.9999)).toBeLessThan(0.001);
    expect(flightTenderRunProgress(3.5)).toBeCloseTo(flightTenderRunProgress(0.5), 10);
    for (const phase of [0, 0.2, 0.5, 0.9, 1.4]) {
      const value = flightTenderRunProgress(phase);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
