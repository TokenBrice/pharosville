import { describe, expect, it } from "vitest";
import type { EventKind, HarbourEvent } from "./events";
import { HarbourEventHub } from "./event-hub";
import { EMPTY_MOMENTS, MOMENT_GAP_MS, MOMENT_HOUR_MAX, MOMENT_MAX_MS, QUEUE_MAX_WAIT_MS, stepMoments, type MomentState } from "./moments";

const T = 1_790_000_000_000;
const MIN = 60_000;
let n = 0;
const ev = (kind: EventKind, atMs = T): HarbourEvent => ({ id: `${kind}:${n++}`, kind, atMs, firstSeenMs: atMs, endpoint: "pegSummary", coinId: "x", symbol: "X", field: "f", from: null, to: null, text: kind });
const open = { reduced: false };

describe("rarity scheduler", () => {
  it("priority: death > depeg > recovery > launch > band change > flow hour; the rest go to the book", () => {
    const r = stepMoments(EMPTY_MOMENTS, T, [ev("flow-hour"), ev("launch"), ev("depeg"), ev("death"), ev("recovery"), ev("psi-band")], open);
    expect(r.staged?.event.kind).toBe("death");
    expect(r.unstaged.map((e) => e.kind).sort()).toEqual(["depeg", "flow-hour", "launch", "psi-band", "recovery"]);
    const order: EventKind[] = ["death", "depeg", "recovery", "launch", "dews-band", "flow-hour"];
    for (let i = 1; i < order.length; i++) expect(stepMoments(EMPTY_MOMENTS, T, [ev(order[i]), ev(order[i - 1])], open).staged?.event.kind).toBe(order[i - 1]);
  });

  it("hull-class and grade changes are never staged", () => {
    const r = stepMoments(EMPTY_MOMENTS, T, [ev("hull-class"), ev("grade")], open);
    expect(r.staged).toBeNull();
    expect(r.unstaged).toHaveLength(2);
    expect(r.state.queued).toBeNull();
  });

  it("each moment lasts ≤ 20 s", () => {
    for (const k of ["death", "depeg", "recovery", "launch", "psi-band", "dews-band", "flow-hour"] as EventKind[]) {
      const m = stepMoments(EMPTY_MOMENTS, T, [ev(k)], open).staged!;
      expect(m.endMs - m.startMs).toBeLessThanOrEqual(MOMENT_MAX_MS);
      expect(m.endMs).toBeGreaterThan(m.startMs);
    }
  });

  it("≤ 1 staged moment per 3 min: the next waits in the queue, then stages when the gap opens", () => {
    let s = stepMoments(EMPTY_MOMENTS, T, [ev("depeg")], open).state;
    const r = stepMoments(s, T + MIN, [ev("launch", T + MIN)], open);
    expect(r.staged).toBeNull();
    expect(r.state.queued?.kind).toBe("launch");
    s = r.state;
    expect(stepMoments(s, T + MOMENT_GAP_MS - 1, [], open).staged).toBeNull();
    expect(stepMoments(s, T + MOMENT_GAP_MS, [], open).staged?.event.kind).toBe("launch");
  });

  it("the queue keeps one: a higher priority replaces it, the replaced one goes to the book", () => {
    const s = stepMoments(EMPTY_MOMENTS, T, [ev("launch")], open).state;
    const a = stepMoments(s, T + MIN, [ev("flow-hour", T + MIN)], open);
    const b = stepMoments(a.state, T + 2 * MIN, [ev("death", T + 2 * MIN)], open);
    expect(b.state.queued?.kind).toBe("death");
    expect(b.unstaged.map((e) => e.kind)).toEqual(["flow-hour"]);
  });

  it("a queued moment that waited too long is dropped to the book", () => {
    let s: MomentState = { starts: [T], queued: ev("launch", T - QUEUE_MAX_WAIT_MS - 1), current: null };
    const r = stepMoments(s, T + MOMENT_GAP_MS, [], open);
    expect(r.staged).toBeNull();
    expect(r.unstaged.map((e) => e.kind)).toEqual(["launch"]);
    s = r.state;
    expect(s.queued).toBeNull();
  });

  it("≤ 6 per rolling hour, even with every gap respected", () => {
    let s = EMPTY_MOMENTS;
    const starts: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t = T + i * MOMENT_GAP_MS;
      const r = stepMoments(s, t, [ev("depeg", t)], open);
      s = r.state; if (r.staged) starts.push(r.staged.startMs);
    }
    expect(starts.slice(0, MOMENT_HOUR_MAX + 1).map((t) => (t - T) / MIN)).toEqual([0, 3, 6, 9, 12, 15, 60]);
    for (const t0 of starts) expect(starts.filter((t) => t >= t0 && t < t0 + 60 * MIN).length).toBeLessThanOrEqual(MOMENT_HOUR_MAX);
  });

  it("reduced motion: nothing staged, nothing queued, all to the book", () => {
    const r = stepMoments(EMPTY_MOMENTS, T, [ev("death"), ev("depeg")], { reduced: true });
    expect(r.staged).toBeNull();
    expect(r.state.queued).toBeNull();
    expect(r.unstaged).toHaveLength(2);
  });
});

describe("events hub", () => {
  it("records every event newest first, flags the staged one, and notifies", () => {
    const hub = new HarbourEventHub(T);
    const seen: string[] = [];
    let changes = 0;
    hub.onMoment((m) => seen.push(m.event.kind));
    hub.subscribe(() => changes++);
    hub.inject(ev("launch"), T, false);
    hub.inject(ev("grade", T + 1), T + 1, false);
    expect(hub.book.map((e) => [e.kind, e.staged, e.dev])).toEqual([["grade", false, true], ["launch", true, true]]);
    expect(seen).toEqual(["launch"]);
    expect(hub.current?.event.kind).toBe("launch");
    hub.tick(T + MOMENT_MAX_MS + 1, false);
    expect(hub.current).toBeNull();
    expect(changes).toBe(3);
  });

  it("reduced motion: book only", () => {
    const hub = new HarbourEventHub(T);
    hub.inject(ev("death"), T, true);
    expect(hub.book[0].staged).toBe(false);
    expect(hub.current).toBeNull();
  });
});
