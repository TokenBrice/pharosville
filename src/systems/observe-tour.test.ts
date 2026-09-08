import { describe, expect, it } from "vitest";
import { defaultCamera } from "./camera";
import {
  buildObserveTour,
  OBSERVE_TOUR_SEGMENT_SECONDS,
  OBSERVE_TOUR_TRAVEL_SECONDS,
  observeTourPoseFromCamera,
  observeTourPoseToCamera,
  sampleObserveTour,
  type ObserveTourKeyframe,
  type ObserveTourSample,
} from "./observe-tour";
import { tileToIso } from "./projection";
import { buildPharosVilleMap } from "./world-layout";

const VIEWPORT = { x: 1440, y: 960 };
const MAP = buildPharosVilleMap();

function keyframe(beatIndex: number, tile: { x: number; y: number }, zoom: number): ObserveTourKeyframe {
  const iso = tileToIso(tile);
  return { beatIndex, isoX: iso.x, isoY: iso.y, zoom };
}

function sample(): ObserveTourSample {
  return { beatIndex: -1, done: false, isoX: 0, isoY: 0, zoom: 1 };
}

const KEYFRAMES = [
  keyframe(0, { x: 16, y: 12 }, 1.0),
  keyframe(1, { x: 40, y: 30 }, 1.35),
  keyframe(2, { x: 24, y: 44 }, 1.35),
  keyframe(3, { x: 38, y: 40 }, 1.15),
];

const START = { isoX: 0, isoY: 400, zoom: 0.78 };

describe("observe tour", () => {
  it("is deterministic: the same elapsed time always yields the same pose", () => {
    const tour = buildObserveTour({ keyframes: KEYFRAMES, start: START });
    const a = sample();
    const b = sample();
    for (const t of [0, 1.7, 3.5, 11.9, 12, 23.4, 37.9, 47.999]) {
      sampleObserveTour(tour, t, a);
      sampleObserveTour(tour, t, b);
      expect(a).toEqual(b);
    }
  });

  it("owns the timeline in equal beat segments with a working lifecycle", () => {
    const tour = buildObserveTour({ keyframes: KEYFRAMES, start: START });
    expect(tour.totalSeconds).toBe(KEYFRAMES.length * OBSERVE_TOUR_SEGMENT_SECONDS);
    expect(tour.segments).toHaveLength(KEYFRAMES.length);
    tour.segments.forEach((segment, index) => {
      expect(segment.beatIndex).toBe(index);
      expect(segment.startSeconds).toBe(index * OBSERVE_TOUR_SEGMENT_SECONDS);
      expect(segment.durationSeconds).toBe(OBSERVE_TOUR_SEGMENT_SECONDS);
      // Lifecycle replays cleanly: enter/scrub/update/teardown leave no trace.
      const first = sample();
      const second = sample();
      segment.enter();
      segment.scrub(2);
      segment.update(2, first);
      segment.teardown();
      segment.enter();
      segment.scrub(2);
      segment.update(2, second);
      segment.teardown();
      expect(first).toEqual(second);
    });
  });

  it("blends in from the visitor's camera and lands on each keyframe", () => {
    const tour = buildObserveTour({ keyframes: KEYFRAMES, start: START });
    const out = sample();

    // t=0: the visitor's own framing.
    sampleObserveTour(tour, 0, out);
    expect(out.isoX).toBeCloseTo(START.isoX, 0);
    expect(out.isoY).toBeCloseTo(START.isoY, 0);
    expect(out.zoom).toBeCloseTo(START.zoom, 1);

    // The end of each travel leg is that beat's keyframe exactly.
    KEYFRAMES.forEach((kf, index) => {
      sampleObserveTour(
        tour,
        index * OBSERVE_TOUR_SEGMENT_SECONDS + OBSERVE_TOUR_TRAVEL_SECONDS,
        out,
      );
      expect(out.isoX).toBeCloseTo(kf.isoX, 4);
      expect(out.isoY).toBeCloseTo(kf.isoY, 4);
      expect(out.zoom).toBeCloseTo(kf.zoom, 4);
      expect(out.beatIndex).toBe(kf.beatIndex);
    });
  });

  it("eases the travel: no linear lurch at the leg boundaries", () => {
    const tour = buildObserveTour({ keyframes: KEYFRAMES, start: START });
    const out = sample();
    // Smootherstep has zero velocity at both ends of the travel leg: the pose
    // just after departure and just before arrival barely moves per millisecond.
    const speedAt = (t: number): number => {
      sampleObserveTour(tour, t, out);
      const x0 = out.isoX;
      const y0 = out.isoY;
      sampleObserveTour(tour, t + 0.008, out);
      return Math.hypot(out.isoX - x0, out.isoY - y0) / 0.008;
    };
    const mid = speedAt(OBSERVE_TOUR_TRAVEL_SECONDS / 2);
    expect(speedAt(0.001)).toBeLessThan(mid * 0.2);
    expect(speedAt(OBSERVE_TOUR_TRAVEL_SECONDS - 0.009)).toBeLessThan(mid * 0.2);
  });

  it("holds exactly still and leaves each dwell without a framing discontinuity", () => {
    const tour = buildObserveTour({ keyframes: KEYFRAMES, start: START });
    const out = sample();
    for (const segment of tour.segments) {
      sampleObserveTour(tour, segment.startSeconds + OBSERVE_TOUR_TRAVEL_SECONDS, out);
      const held = { ...out };
      sampleObserveTour(tour, segment.startSeconds + segment.durationSeconds - 0.001, out);
      expect(out).toEqual(held);
      sampleObserveTour(tour, segment.startSeconds + segment.durationSeconds, out);
      expect(out.isoX).toBeCloseTo(held.isoX, 8);
      expect(out.isoY).toBeCloseTo(held.isoY, 8);
      expect(out.zoom).toBeCloseTo(held.zoom, 8);
    }
  });

  it("reports done past the end and clamps degenerate input", () => {
    const tour = buildObserveTour({ keyframes: KEYFRAMES, start: START });
    const out = sample();
    sampleObserveTour(tour, tour.totalSeconds + 1, out);
    expect(out.done).toBe(true);
    sampleObserveTour(tour, Number.NaN, out);
    expect(out.done).toBe(false);
    expect(Number.isFinite(out.isoX)).toBe(true);
  });

  it("maps poses into the interactive camera state, inside the map bounds", () => {
    const tour = buildObserveTour({ keyframes: KEYFRAMES, start: START });
    const out = sample();
    for (let t = 0; t < tour.totalSeconds; t += 0.37) {
      sampleObserveTour(tour, t, out);
      const camera = observeTourPoseToCamera(out, VIEWPORT, MAP);
      // Every frame of the tour is a legal interactive camera: the clamp the
      // visitor's own pan/zoom obeys accepts it unchanged.
      const reclamped = observeTourPoseToCamera(out, VIEWPORT, MAP);
      expect(camera).toEqual(reclamped);
      expect(camera.zoom).toBeGreaterThanOrEqual(0.28);
      expect(camera.zoom).toBeLessThanOrEqual(2.4);
    }
  });

  it("round-trips the visitor's camera into the start pose", () => {
    const rest = defaultCamera({ width: VIEWPORT.x, height: VIEWPORT.y, map: MAP });
    const camera = observeTourPoseToCamera(
      observeTourPoseFromCamera(rest, VIEWPORT),
      VIEWPORT,
      MAP,
    );
    const pose = observeTourPoseFromCamera(camera, VIEWPORT);
    const back = observeTourPoseToCamera(pose, VIEWPORT, MAP);
    expect(back.zoom).toBeCloseTo(camera.zoom, 6);
    expect(back.offsetX).toBeCloseTo(camera.offsetX, 4);
    expect(back.offsetY).toBeCloseTo(camera.offsetY, 4);
  });
});
