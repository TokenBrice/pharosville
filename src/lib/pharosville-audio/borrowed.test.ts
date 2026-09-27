import { describe, expect, it } from "vitest";
import { createGardenDirector, requestGardenBeat, type GardenBeat, type GardenDirectorState } from "../../systems/garden-director";
import { createBorrowedSchedule, type BorrowedAsk } from "./borrowed";

/** Director clock at context time 0; the schedule's context clock runs alongside it. */
const T0 = 1_000_000;
const TICK = 0.25;

interface Run {
  asks: number[];
  admitted: { at: number; ask: BorrowedAsk }[];
  beats: GardenBeat[];
}

/**
 * Steps a schedule over `seconds` on a fake clock (the audio engine's 4 Hz
 * tick), recording every ask it put to the director and every far sound it
 * returned. `each` lets a test put other beats on the director meanwhile.
 */
function run(
  director: GardenDirectorState,
  seconds: number,
  options: { refuseFirst?: number; each?: (at: number, beats: GardenBeat[]) => void } = {},
): Run {
  const result: Run = { asks: [], admitted: [], beats: [] };
  let refusals = options.refuseFirst ?? 0;
  const schedule = createBorrowedSchedule(0, (state, request, time) => {
    result.asks.push(time - T0);
    if (refusals > 0) {
      refusals -= 1;
      return null;
    }
    const beat = requestGardenBeat(state, request, time);
    if (beat) result.beats.push(beat);
    return beat;
  });
  for (let at = 0; at <= seconds; at += TICK) {
    options.each?.(at, result.beats);
    const ask = schedule.next(at, director, T0 + at);
    if (ask) result.admitted.push({ at, ask });
  }
  return result;
}

describe("borrowed far sounds: director schedule", () => {
  it("keeps consecutive far sounds at least ten minutes apart", () => {
    const { admitted } = run(createGardenDirector("borrowed-gap"), 6 * 3_600);
    expect(admitted.length).toBeGreaterThanOrEqual(20);
    for (let index = 1; index < admitted.length; index += 1) {
      expect(admitted[index]!.at - admitted[index - 1]!.at).toBeGreaterThanOrEqual(600);
    }
  });

  it("never asks within 90 s of the end of any other admitted beat", () => {
    const director = createGardenDirector("borrowed-backoff");
    const { asks, admitted, beats } = run(director, 4 * 3_600, {
      each(at, beats) {
        // Other cues competing for the same director: a postcard move asking
        // every 45 s for the environment slot, an arrival every ~3 minutes.
        const now = T0 + at;
        if (at % 45 === 0) {
          const beat = requestGardenBeat(director, { kind: "attract", foreground: false, priority: 1, durationSeconds: 30 }, now);
          if (beat) beats.push(beat);
        }
        if (at % 170 === 0) {
          const beat = requestGardenBeat(director, { kind: "arrival", foreground: true, priority: 10, durationSeconds: 25 }, now);
          if (beat) beats.push(beat);
        }
      },
    });
    expect(admitted.length).toBeGreaterThan(0);
    expect(beats.filter((beat) => !beat.subject?.startsWith("borrowed:")).length).toBeGreaterThan(admitted.length);
    for (const ask of asks) {
      for (const beat of beats) {
        const start = beat.startSeconds - T0;
        if (start >= ask) continue;
        expect(ask - (start + beat.durationSeconds)).toBeGreaterThanOrEqual(90);
      }
    }
  });

  it("never plays under a frozen director (reduced motion, Still) and keeps retrying", () => {
    const director = Object.freeze(createGardenDirector("borrowed-frozen", T0));
    const { asks, admitted } = run(director, 3_600);
    expect(admitted).toEqual([]);
    expect(director.log).toEqual([]);
    expect(asks.length).toBeGreaterThan(100);
    for (let index = 1; index < asks.length; index += 1) expect(asks[index]! - asks[index - 1]!).toBe(30);
  });

  it("plays nothing for a refused slot and asks again 30 s later", () => {
    const { asks, admitted } = run(createGardenDirector("borrowed-refused"), 200, { refuseFirst: 3 });
    expect(asks).toEqual([0, 30, 60, 90]);
    expect(admitted.map((entry) => entry.at)).toEqual([90]);
  });
});
