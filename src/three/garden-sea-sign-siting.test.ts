import { describe, expect, it } from "vitest";
import {
  SEA_SIGN_SCALE_STEPS,
  SEA_SIGN_STEP_FADE_SECONDS,
  SEA_SIGN_STEP_HYSTERESIS,
  SEA_SIGN_STEP_ZOOMS,
  createSeaSignScaleTrack,
  seaSignScaleForZoom,
  seaSignStepForZoom,
  seaSignStepWithHysteresis,
} from "./garden-sea-sign-siting";

/** The interactive zoom range: projection.ts ABSOLUTE_MIN_ZOOM..MAX_ZOOM. */
const MIN_ZOOM = 0.28;
const MAX_ZOOM = 2.4;

/** What D6 used to do: a continuous k/zoom, clamped to the same endpoints. */
function continuousScaleForZoom(zoom: number): number {
  return Math.max(0.85, Math.min(2.6, 0.85 / Math.max(0.05, zoom)));
}

function zoomSweep(stepSize = 0.005): number[] {
  const zooms: number[] = [];
  for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM + 1e-9; zoom += stepSize) {
    zooms.push(Number(zoom.toFixed(4)));
  }
  return zooms;
}

/** Runs the track at a steady 60 fps over a zoom path, returning every scale. */
function play(
  zooms: readonly number[],
  options: { deltaSeconds?: number; reducedMotion?: boolean } = {},
): number[] {
  const track = createSeaSignScaleTrack();
  const deltaSeconds = options.deltaSeconds ?? 1 / 60;
  return zooms.map((zoom, index) => track.advance({
    // The first frame is always a whole step: there is no gesture behind it.
    deltaSeconds: index === 0 ? Number.POSITIVE_INFINITY : deltaSeconds,
    reducedMotion: options.reducedMotion === true,
    zoom,
  }));
}

describe("sea-sign scale quantization (D6 / W0.7)", () => {
  it("keeps the reviewed end states at both ends of the zoom range", () => {
    // The whole-map end: drawn out of scale on the chart, the way a landmark
    // is on an old map. The close end: near world scale among the hulls.
    expect(seaSignScaleForZoom(MIN_ZOOM)).toBe(2.6);
    expect(seaSignScaleForZoom(0.32)).toBe(2.6);
    expect(seaSignScaleForZoom(1)).toBe(0.85);
    expect(seaSignScaleForZoom(MAX_ZOOM)).toBe(0.85);
    // Which are exactly the old clamp endpoints, not merely near them.
    expect(seaSignScaleForZoom(MIN_ZOOM)).toBe(continuousScaleForZoom(MIN_ZOOM));
    expect(seaSignScaleForZoom(MAX_ZOOM)).toBe(continuousScaleForZoom(MAX_ZOOM));
  });

  it("answers with three rungs and nothing in between", () => {
    const scales = new Set(zoomSweep().map(seaSignScaleForZoom));
    expect([...scales].sort((left, right) => left - right)).toEqual([...SEA_SIGN_SCALE_STEPS].sort(
      (left, right) => left - right,
    ));
  });

  it("never animates against the gesture: scale is flat within a rung", () => {
    // The failure this replaces. Under the old curve a pinch from 0.9 to 0.4
    // shrank the world 2.25x while the boards GREW 1.7x; now the board holds
    // still inside each rung and the whole response is three discrete events.
    const path = zoomSweep(0.001);
    let changes = 0;
    for (let index = 1; index < path.length; index += 1) {
      if (seaSignScaleForZoom(path[index]!) !== seaSignScaleForZoom(path[index - 1]!)) changes += 1;
    }
    expect(changes).toBe(SEA_SIGN_STEP_ZOOMS.length);
  });

  it("stays within 1.5x of the constant-on-screen ideal it approximates", () => {
    // Quantizing buys stillness by spending on-screen constancy. This is the
    // price, bounded: the rungs are placed so no framing in the interactive
    // range reads more than half again off the size the old curve gave it.
    for (const zoom of zoomSweep()) {
      const ratio = seaSignScaleForZoom(zoom) / continuousScaleForZoom(zoom);
      expect(ratio).toBeGreaterThan(1 / 1.5);
      expect(ratio).toBeLessThan(1.5);
    }
  });

  it("puts the middle rung at the geometric mid of its own band", () => {
    // The minimax choice, and the reason the bound above holds.
    expect(SEA_SIGN_SCALE_STEPS[1]!).toBeCloseTo(
      0.85 / Math.sqrt(SEA_SIGN_STEP_ZOOMS[0]! * SEA_SIGN_STEP_ZOOMS[1]!),
      2,
    );
  });

  it("keeps its rung edges clear of the framings the world already spends", () => {
    // Reference default framing, the overview-LOD fade band, and the explore
    // threshold. A rung edge inside any of them would either make the default
    // frame history-dependent or stack two transitions on one gesture.
    const guarded = [0.648, 1.05, 0.44, 0.62];
    for (const edge of SEA_SIGN_STEP_ZOOMS) {
      const low = edge * (1 - SEA_SIGN_STEP_HYSTERESIS);
      const high = edge * (1 + SEA_SIGN_STEP_HYSTERESIS);
      for (const zoom of guarded) {
        expect(zoom >= low && zoom <= high).toBe(false);
      }
    }
  });
});

describe("sea-sign rung hysteresis", () => {
  it("holds the rung while a zoom hovers on an edge", () => {
    const edge = SEA_SIGN_STEP_ZOOMS[0]!;
    // Arrive from the close side, then jitter across the nominal edge the way
    // a resting trackpad pinch does. Without hysteresis this toggles between
    // rungs 1.68x apart on every frame.
    const jitter = [1.1, edge + 0.02, edge - 0.02, edge + 0.01, edge - 0.03, edge + 0.03];
    let step = seaSignStepForZoom(jitter[0]!);
    for (const zoom of jitter) step = seaSignStepWithHysteresis(zoom, step);
    expect(step).toBe(0);

    // Same jitter arriving from the wide side stays on the wide rung.
    let fromWide = seaSignStepForZoom(0.5);
    for (const zoom of jitter.slice(1)) fromWide = seaSignStepWithHysteresis(zoom, fromWide);
    expect(fromWide).toBe(1);
  });

  it("changes rung once the zoom is clear of the edge, in either direction", () => {
    const edge = SEA_SIGN_STEP_ZOOMS[0]!;
    expect(seaSignStepWithHysteresis(edge * (1 - SEA_SIGN_STEP_HYSTERESIS) - 0.001, 0)).toBe(1);
    expect(seaSignStepWithHysteresis(edge * (1 + SEA_SIGN_STEP_HYSTERESIS) + 0.001, 1)).toBe(0);
  });

  it("crosses every rung a single frame jumps over", () => {
    // A camera reset or a URL framing can move the whole zoom range at once.
    expect(seaSignStepWithHysteresis(MIN_ZOOM, 0)).toBe(2);
    expect(seaSignStepWithHysteresis(MAX_ZOOM, 2)).toBe(0);
  });

  it("agrees with the pure function everywhere outside the edge bands", () => {
    // The hit targets (N6) resolve against `seaSignScaleForZoom`, so the
    // settled draw scale has to be that function wherever history cannot
    // matter — which is everywhere but the two hysteresis bands.
    for (const zoom of zoomSweep()) {
      const nearEdge = SEA_SIGN_STEP_ZOOMS.some((edge) => (
        zoom > edge * (1 - SEA_SIGN_STEP_HYSTERESIS) && zoom < edge * (1 + SEA_SIGN_STEP_HYSTERESIS)
      ));
      if (nearEdge) continue;
      for (const from of [0, 1, 2]) {
        expect(SEA_SIGN_SCALE_STEPS[seaSignStepWithHysteresis(zoom, from)]!)
          .toBe(seaSignScaleForZoom(zoom));
      }
    }
  });
});

describe("sea-sign rung settle", () => {
  it("takes the first frame whole, with no settle to watch", () => {
    const track = createSeaSignScaleTrack();
    expect(track.advance({ deltaSeconds: Number.POSITIVE_INFINITY, zoom: 0.3 })).toBe(2.6);
  });

  it("eases onto the new rung over the fade, then lands exactly on it", () => {
    const track = createSeaSignScaleTrack();
    track.advance({ deltaSeconds: Number.POSITIVE_INFINITY, zoom: 1.2 });
    expect(track.scale).toBe(0.85);

    // One frame across the edge starts the settle rather than snapping.
    const first = track.advance({ deltaSeconds: 1 / 60, zoom: 0.6 });
    expect(first).toBeGreaterThan(0.85);
    expect(first).toBeLessThan(1.43);

    let previous = first;
    let elapsed = 1 / 60;
    while (elapsed < SEA_SIGN_STEP_FADE_SECONDS) {
      const next = track.advance({ deltaSeconds: 1 / 60, zoom: 0.6 });
      expect(next).toBeGreaterThanOrEqual(previous);
      // Ease-out: it never overshoots the rung it is arriving at.
      expect(next).toBeLessThanOrEqual(1.43);
      previous = next;
      elapsed += 1 / 60;
    }
    expect(track.advance({ deltaSeconds: 1 / 60, zoom: 0.6 })).toBe(1.43);

    // Ease-OUT, not linear: most of the move is behind it by halfway through.
    const halfway = play([1.2, ...Array.from({ length: 14 }, () => 0.6)]).at(-1)!;
    const linear = 0.85 * (1.43 / 0.85) ** 0.5;
    expect(halfway).toBeGreaterThan(linear);
  });

  it("settles in world register, not per frame: same seconds at any frame rate", () => {
    const at30 = play([1.2, ...Array.from({ length: 15 }, () => 0.6)], { deltaSeconds: 1 / 30 });
    const at60 = play([1.2, ...Array.from({ length: 30 }, () => 0.6)], { deltaSeconds: 1 / 60 });
    // Half a second of 30 fps and half a second of 60 fps are the same move.
    expect(at30.at(-1)!).toBeCloseTo(at60.at(-1)!, 6);
    expect(at30.at(-1)!).toBe(1.43);
  });

  it("redirects mid-settle without a jump when the zoom reverses", () => {
    const track = createSeaSignScaleTrack();
    track.advance({ deltaSeconds: Number.POSITIVE_INFINITY, zoom: 1.2 });
    for (let frame = 0; frame < 6; frame += 1) track.advance({ deltaSeconds: 1 / 60, zoom: 0.6 });
    const turned = track.scale;
    // Back over the edge: the settle restarts from where the board IS.
    const next = track.advance({ deltaSeconds: 1 / 60, zoom: 1.2 });
    expect(Math.abs(next - turned)).toBeLessThan(0.05);
    for (let frame = 0; frame < 40; frame += 1) track.advance({ deltaSeconds: 1 / 60, zoom: 1.2 });
    expect(track.scale).toBe(0.85);
  });

  it("holds the settle across a repainted frame with no elapsed time", () => {
    const track = createSeaSignScaleTrack();
    track.advance({ deltaSeconds: Number.POSITIVE_INFINITY, zoom: 1.2 });
    const started = track.advance({ deltaSeconds: 1 / 60, zoom: 0.6 });
    expect(track.advance({ deltaSeconds: 0, zoom: 0.6 })).toBe(started);
    expect(track.advance({ deltaSeconds: -1, zoom: 0.6 })).toBe(started);
  });

  it("takes the step whole across a stall, rather than easing over the gap", () => {
    // A hidden tab, a resumed loop, or the on-demand single paints of the
    // reduced-motion path. There is no gesture to stay calm against.
    const track = createSeaSignScaleTrack();
    track.advance({ deltaSeconds: Number.POSITIVE_INFINITY, zoom: 1.2 });
    expect(track.advance({ deltaSeconds: 4, zoom: 0.6 })).toBe(1.43);
  });
});

describe("sea-sign scale under reduced motion", () => {
  it("draws one complete static frame: no settle, no history", () => {
    // Every zoom, arrived at from every rung, is exactly the pure function —
    // so the still composition is deterministic and the hit targets, which
    // read that same function, agree with it everywhere.
    for (const zoom of zoomSweep(0.01)) {
      for (const approach of [MIN_ZOOM, 0.5, MAX_ZOOM]) {
        const track = createSeaSignScaleTrack();
        track.advance({ deltaSeconds: Number.POSITIVE_INFINITY, reducedMotion: true, zoom: approach });
        expect(track.advance({ deltaSeconds: 1 / 60, reducedMotion: true, zoom }))
          .toBe(seaSignScaleForZoom(zoom));
      }
    }
  });

  it("lands whole even when reduced motion is turned on mid-settle", () => {
    const track = createSeaSignScaleTrack();
    track.advance({ deltaSeconds: Number.POSITIVE_INFINITY, zoom: 1.2 });
    track.advance({ deltaSeconds: 1 / 60, zoom: 0.6 });
    expect(track.advance({ deltaSeconds: 1 / 60, reducedMotion: true, zoom: 0.6 })).toBe(1.43);
  });
});
