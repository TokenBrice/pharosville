// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useGardenDirector } from "../hooks/use-garden-director";
import { advanceGardenDirector, createGardenDirector, requestGardenBeat, type GardenBeatRequest } from "./garden-director";

const foreground: GardenBeatRequest = { kind: "keeper", foreground: true, durationSeconds: 10, priority: 20 };

afterEach(cleanup);

describe("garden director", () => {
  it("reserves one foreground and enforces a seeded six-to-twelve minute silence", () => {
    let state = createGardenDirector("harbor");
    expect(requestGardenBeat(state, foreground, 0)).not.toBeNull();
    expect(requestGardenBeat(state, { ...foreground, priority: 99 }, 5)).toBeNull();
    expect(requestGardenBeat(state, foreground, 369)).toBeNull();
    state = advanceGardenDirector(state, 730);
    expect(requestGardenBeat(state, foreground, 730)).not.toBeNull();
  });

  it("market pre-empts foreground and silence while ordinary priority cannot", () => {
    const state = createGardenDirector("harbor");
    requestGardenBeat(state, foreground, 0);
    expect(requestGardenBeat(state, { ...foreground, kind: "market", priority: 99 }, 1)).toBeNull();
    const market = requestGardenBeat(state, { ...foreground, kind: "market", priority: 100 }, 2);
    expect(state.active).toBe(market);
    expect(market?.startSeconds).toBe(2);
    expect(requestGardenBeat(state, { ...foreground, kind: "market", priority: 100 }, 20)).not.toBeNull();
  });

  it("bounds the timestamped watch log to the most recent 64 admitted beats", () => {
    const state = createGardenDirector("harbor");
    for (let i = 0; i < 100; i += 1) requestGardenBeat(state, { ...foreground, kind: "market", priority: 100 }, i);
    expect(state.log).toHaveLength(64);
    expect(state.log[0]?.startSeconds).toBe(36);
    expect(state.log[63]?.startSeconds).toBe(99);
  });

  it("admits six to ten environmental beats per hour deterministically", () => {
    const simulate = (seed: string) => {
      const state = createGardenDirector(seed);
      for (let second = 0; second < 3600; second += 1) {
        requestGardenBeat(state, { kind: "weather", foreground: false, durationSeconds: 10, priority: 1 }, second);
      }
      return state.log;
    };
    const log = simulate("harbor");
    expect(log.length).toBeGreaterThanOrEqual(6);
    expect(log.length).toBeLessThanOrEqual(10);
    expect(simulate("harbor")).toEqual(log);
    expect(simulate("another harbor")).not.toEqual(log);
  });

  it("expires attention independently of motion and evidence without replay on resume", () => {
    const state = createGardenDirector("harbor");
    requestGardenBeat(state, { ...foreground, envelopeSeconds: 30, evidenceSeconds: 900 }, 0);
    expect(advanceGardenDirector(state, 9)).toBe(state);
    const resumed = advanceGardenDirector(state, 3600);
    expect(resumed.active).toBeNull();
    expect(resumed.lastForegroundEndSeconds).toBe(10);
    expect(resumed.log).toHaveLength(1);
    expect(requestGardenBeat(resumed, foreground, 3600)).not.toBeNull();
  });

  it("advances the route-owned hook without synthesizing missed beats and freezes reduced motion", () => {
    const view = renderHook(({ timeSeconds, reducedMotion }) => useGardenDirector({ seed: "harbor", timeSeconds, reducedMotion }), {
      initialProps: { timeSeconds: 0, reducedMotion: false },
    });
    act(() => { requestGardenBeat(view.result.current, foreground, 0); });
    view.rerender({ timeSeconds: 3600, reducedMotion: false });
    expect(view.result.current.active).toBeNull();
    expect(view.result.current.log).toHaveLength(1);
    view.rerender({ timeSeconds: 3600, reducedMotion: true });
    const frozen = view.result.current;
    expect(requestGardenBeat(frozen, foreground, 3600)).toBeNull();
    view.rerender({ timeSeconds: 7200, reducedMotion: true });
    expect(view.result.current).toBe(frozen);
    expect(frozen.log).toEqual([]);
  });
});
