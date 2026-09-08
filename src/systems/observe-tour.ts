import { clampCameraToMap } from "./camera";
import {
  MAX_ZOOM,
  minZoomForViewport,
  screenToIso,
  type IsoCamera,
  type MapLike,
  type ScreenPoint,
} from "./projection";

/**
 * Phase 4 (Breathtaking Rendering, item 1): Observe 2.0 — the cinematic dolly.
 *
 * The old Observe mode teleported the camera intent from beat to beat: a damped
 * point-target per caption, pan with no path, no zoom language. Observe 2.0 is
 * the ZERO single-driver pattern:
 *
 * - ONE eased virtual-progress scalar drives the whole tour. `sampleObserveTour`
 *   is a pure function of elapsed seconds — same start time, same frames,
 *   always. No hidden state and no decorative camera noise.
 * - The tour is a list of SEGMENTS, one per observe beat, each owning an equal
 *   fraction of the timeline and exposing the {enter, scrub, update, teardown}
 *   lifecycle. The methods are stateless — a segment sampled at the same local
 *   time always produces the same pose — which is what makes replay clean.
 * - The camera path through every keyframe (plus the visitor's own camera as
 *   point zero) is ONE Catmull-Rom spline in iso space, so pan AND zoom move
 *   together along a curve instead of lurching point to point. The first
 *   segment's travel leg IS the ease-in from the visitor's camera; leaving is
 *   the camera controller's ordinary damped glide back (it owns that blend).
 * - Each beat's 12 s splits into a 3.5 s travel leg (spline span, smootherstep
 *   eased) and an 8.5 s stationary dwell. The sampled
 *   beat index drives the DOM caption, so camera and copy share one clock.
 *
 * Everything stays inside the fixed-yaw rig: the output is the same
 * {offsetX, offsetY, zoom} camera state the interactive pan/zoom uses, clamped
 * to the same map bounds. Reduced motion never starts the tour (the DOM steps
 * beats manually).
 */

export interface ObserveTourPose {
  isoX: number;
  isoY: number;
  zoom: number;
}

export interface ObserveTourKeyframe {
  /** Which observe beat this keyframe presents (caption index). */
  beatIndex: number;
  /** Framing center in iso space (`tileToIso` of the beat's display tile). */
  isoX: number;
  isoY: number;
  /** Dolly zoom at this keyframe. */
  zoom: number;
  holdSeconds?: number;
  travelSeconds?: number;
}

export interface ObserveTourSample extends ObserveTourPose {
  /** Beat the timeline is currently presenting. */
  beatIndex: number;
  /** True once elapsed has run past the end of the tour. */
  done: boolean;
  holding?: boolean;
}

/** Seconds per beat — the DOM caption cadence. */
export const OBSERVE_TOUR_SEGMENT_SECONDS = 12;
/** Travel leg at the head of each segment; the rest is dwell. */
export const OBSERVE_TOUR_TRAVEL_SECONDS = 3.5;

/** Precomputed spline span for one segment's travel leg. */
interface SegmentGeometry {
  /** Catmull-Rom control points P0..P3; the span runs P1 -> P2. */
  p0: ObserveTourPose;
  p1: ObserveTourPose;
  p2: ObserveTourPose;
  p3: ObserveTourPose;
}

export interface ObserveTourSegment {
  /** Beat presented by this segment. */
  readonly beatIndex: number;
  /** Timeline window this segment owns, in seconds. */
  readonly startSeconds: number;
  readonly durationSeconds: number;
  /**
   * Stateless lifecycle (ZERO pattern): the sampler calls enter → scrub →
   * update → teardown for every sample. Nothing is stored between calls, so
   * scrubbing to any local time replays the exact same pose. `enter` and
   * `teardown` are deliberate no-op seams; `scrub` is the driver-facing hook
   * (the tour sampler uses it), `update` writes the pose.
   */
  readonly enter: () => void;
  readonly scrub: (localSeconds: number) => void;
  readonly update: (localSeconds: number, out: ObserveTourSample) => void;
  readonly teardown: () => void;
  readonly geometry: SegmentGeometry;
}

export interface ObserveTour {
  readonly keyframes: readonly ObserveTourKeyframe[];
  readonly segments: readonly ObserveTourSegment[];
  /** The visitor's camera pose when the tour started (spline point zero). */
  readonly start: ObserveTourPose;
  readonly segmentSeconds: number;
  readonly totalSeconds: number;
  readonly travelSeconds: number;
}

/**
 * Builds the tour from the visitor's current pose and the beats' keyframes.
 * The spline control points are [start, ...keyframes]; segment i's travel leg
 * walks span [i, i+1], so the first segment blends in from the visitor's own
 * framing and every later one carries the dolly out of the previous beat.
 */
export function buildObserveTour(input: {
  keyframes: readonly ObserveTourKeyframe[];
  segmentSeconds?: number;
  start: ObserveTourPose;
  travelSeconds?: number;
}): ObserveTour {
  const segmentSeconds = input.segmentSeconds ?? OBSERVE_TOUR_SEGMENT_SECONDS;
  const travelSeconds = Math.min(segmentSeconds, input.travelSeconds ?? OBSERVE_TOUR_TRAVEL_SECONDS);
  const points: readonly ObserveTourPose[] = [input.start, ...input.keyframes];
  let cursor = 0;
  const segments = input.keyframes.map((keyframe, index): ObserveTourSegment => {
    const legSeconds = keyframe.travelSeconds ?? travelSeconds;
    const durationSeconds = keyframe.holdSeconds === undefined ? segmentSeconds : legSeconds + keyframe.holdSeconds;
    const startSeconds = cursor;
    cursor += durationSeconds;
    const geometry: SegmentGeometry = {
      p0: points[Math.max(0, index - 1)]!,
      p1: points[index]!,
      p2: points[index + 1]!,
      p3: points[Math.min(points.length - 1, index + 2)]!,
    };
    return {
      beatIndex: keyframe.beatIndex,
      startSeconds,
      durationSeconds,
      enter: noop,
      scrub: noopScrub,
      update: (localSeconds, out) => writeSegmentPose(
        geometry,
        keyframe.beatIndex,
        localSeconds,
        legSeconds,
        out,
      ),
      teardown: noop,
      geometry,
    };
  });
  return {
    keyframes: input.keyframes,
    segmentSeconds,
    segments,
    start: input.start,
    totalSeconds: cursor,
    travelSeconds,
  };
}

/**
 * The one eased virtual-progress driver. Pure: a given elapsed time always
 * yields the same pose. Writes into `out`; no allocation.
 */
export function sampleObserveTour(
  tour: ObserveTour,
  elapsedSeconds: number,
  out: ObserveTourSample,
): void {
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const last = tour.keyframes[tour.keyframes.length - 1];
  if (tour.segments.length === 0 || elapsed >= tour.totalSeconds) {
    out.isoX = last?.isoX ?? tour.start.isoX;
    out.isoY = last?.isoY ?? tour.start.isoY;
    out.zoom = last?.zoom ?? tour.start.zoom;
    out.beatIndex = last?.beatIndex ?? 0;
    out.done = true;
    out.holding = true;
    return;
  }
  const segment = tour.segments.find((candidate) => elapsed < candidate.startSeconds + candidate.durationSeconds)!;
  const localSeconds = elapsed - segment.startSeconds;
  segment.enter();
  segment.scrub(localSeconds);
  segment.update(localSeconds, out);
  segment.teardown();
  out.done = false;
}

/** The visitor's current camera as a tour pose (iso of the screen center). */
export function observeTourPoseFromCamera(camera: IsoCamera, viewport: ScreenPoint): ObserveTourPose {
  const center = screenToIso({ x: viewport.x / 2, y: viewport.y / 2 }, camera);
  return { isoX: center.x, isoY: center.y, zoom: camera.zoom };
}

/**
 * A sampled pose as an interactive camera state — viewport center on the iso
 * point, zoom clamped to the interactive ladder, offsets clamped to the same
 * map bounds the visitor's pan/zoom respects.
 */
export function observeTourPoseToCamera(
  pose: ObserveTourPose,
  viewport: ScreenPoint,
  map: MapLike,
): IsoCamera {
  const zoom = Math.max(minZoomForViewport(viewport, map), Math.min(MAX_ZOOM, pose.zoom));
  return clampCameraToMap({
    offsetX: viewport.x / 2 - pose.isoX * zoom,
    offsetY: viewport.y / 2 - pose.isoY * zoom,
    zoom,
  }, { map, viewport });
}

/**
 * One segment's pose: travel leg along the Catmull-Rom span for the first
 * OBSERVE_TOUR_TRAVEL_SECONDS, then a stationary dwell.
 * Pure in (geometry, localSeconds).
 */
function writeSegmentPose(
  geometry: SegmentGeometry,
  beatIndex: number,
  localSeconds: number,
  travelSeconds: number,
  out: ObserveTourSample,
): void {
  const travel = travelSeconds <= 0 ? 1 : Math.min(1, Math.max(0, localSeconds / travelSeconds));
  const easedTravel = smootherstep(travel);
  // Uniform Catmull-Rom through P1 -> P2, zoom riding the same eased scalar.
  const u = easedTravel;
  const u2 = u * u;
  const u3 = u2 * u;
  const isoX = catmullRom(geometry.p0.isoX, geometry.p1.isoX, geometry.p2.isoX, geometry.p3.isoX, u, u2, u3);
  const isoY = catmullRom(geometry.p0.isoY, geometry.p1.isoY, geometry.p2.isoY, geometry.p3.isoY, u, u2, u3);
  const zoom = geometry.p1.zoom + (geometry.p2.zoom - geometry.p1.zoom) * u;

  out.isoX = isoX;
  out.isoY = isoY;
  out.zoom = zoom;
  out.holding = localSeconds >= travelSeconds;
  out.beatIndex = beatIndex;
  out.done = false;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, u: number, u2: number, u3: number): number {
  return 0.5 * (
    2 * p1
    + (-p0 + p2) * u
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * u3
  );
}

function smootherstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function noop(): void {
  // Stateless lifecycle seam — see ObserveTourSegment.
}

function noopScrub(): void {
  // Stateless lifecycle seam — see ObserveTourSegment.
}
