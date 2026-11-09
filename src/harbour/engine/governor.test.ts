import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QualityGovernor } from "./governor";
import type { QualitySettings } from "./quality";
import { deferred } from "./deferred";

/** A WebGL2 stand-in with no timer-query extension (Safari / Chrome-on-Mac path) and a named GPU. */
function fakeGl(renderer: string): WebGL2RenderingContext {
  return {
    RENDERER: 0x1f01,
    getExtension: (name: string) => (name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 1 } : null),
    getParameter: () => renderer,
  } as unknown as WebGL2RenderingContext;
}

function run(g: QualityGovernor, seconds: number, frameMs: number): void {
  for (let t = 0; t < seconds * 1000; t += frameMs) g.end(frameMs / 1000);
}

/** A WebGL2 stand-in WITH EXT_disjoint_timer_query_webgl2 whose every query reads `gpu.ms`. */
function timedGl(renderer: string, gpu: { ms: number }): WebGL2RenderingContext {
  const ext = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  return {
    RENDERER: 0x1f01, QUERY_RESULT_AVAILABLE: 0x8867, QUERY_RESULT: 0x8866,
    getExtension: (name: string) => (name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 1 } : name === "EXT_disjoint_timer_query_webgl2" ? ext : null),
    getParameter: (p: number) => (p === ext.GPU_DISJOINT_EXT ? false : renderer),
    createQuery: () => ({}), beginQuery: () => {}, endQuery: () => {}, deleteQuery: () => {},
    getQueryParameter: (_q: unknown, p: number) => (p === 0x8867 ? true : gpu.ms * 1e6),
  } as unknown as WebGL2RenderingContext;
}

function runTimed(g: QualityGovernor, seconds: number, frameMs: number): void {
  for (let t = 0; t < seconds * 1000; t += frameMs) { g.begin(); g.end(frameMs / 1000); }
}

describe("quality governor (no GPU timer)", () => {
  beforeEach(() => { vi.stubGlobal("location", { search: "" }); vi.stubGlobal("devicePixelRatio", 2); });
  afterEach(() => vi.unstubAllGlobals());

  it("starts an Apple GPU at Medium 1.5 and reduces cost without inventing GPU headroom", () => {
    const applied: string[] = [];
    const g = new QualityGovernor(fakeGl("ANGLE (Apple, Apple M1, OpenGL 4.1)"), (s, d) => applied.push(`${s.tier}@${d}`));
    expect(`${g.tier}@${g.dpr}`).toBe("medium@1.5");
    run(g, 12, 33.4);                       // 30 fps: too rich
    expect(g.level).toBeLessThan(3);
    const low = g.level;
    run(g, 60, 16.7);                       // clean presentation alone cannot establish GPU headroom
    expect(g.level).toBe(low);
    expect(applied.length).toBeGreaterThan(1);
  });

  it("never upgrades timerless 20.83 ms presentation", () => {
    const g = new QualityGovernor(fakeGl("Apple M2"), () => {});
    const start = g.level;
    run(g, 60, 20.83);
    expect(g.level).toBeLessThan(start);
    expect(g.level).toBe(0);
  });

  it("?quality pins the tier and never moves", () => {
    vi.stubGlobal("location", { search: "?quality=low" });
    const g = new QualityGovernor(fakeGl("NVIDIA GeForce RTX 4090"), () => {});
    expect(g.tier).toBe("low");
    run(g, 20, 40);
    expect(g.tier).toBe("low");
    expect(g.auto).toBe(false);
  });
});

describe("quality governor (GPU timer)", () => {
  beforeEach(() => { vi.stubGlobal("location", { search: "" }); vi.stubGlobal("devicePixelRatio", 2); });
  afterEach(() => vi.unstubAllGlobals());
  const RTX = "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU)";

  it("holds the rung when frames are slow but the GPU is idle (CPU-bound)", () => {
    const applied: string[] = [];
    const g = new QualityGovernor(timedGl(RTX, { ms: 1 }), (s, d) => applied.push(`${s.tier}@${d}`));
    const top = g.level;
    runTimed(g, 20, 33.4);                  // 30 fps with 1 ms of GPU work
    expect(g.level).toBe(top);
    expect(applied).toEqual([]);
  });

  it("steps down when the GPU is the bottleneck", () => {
    const g = new QualityGovernor(timedGl(RTX, { ms: 30 }), () => {});
    const top = g.level;
    runTimed(g, 8, 33.4);                   // 30 fps with 30 ms of GPU work
    expect(g.level).toBeLessThan(top);
  });

  it("without timer samples, slow frames step down as before", () => {
    const g = new QualityGovernor(fakeGl(RTX), () => {});
    const top = g.level;
    run(g, 8, 33.4);
    expect(g.level).toBeLessThan(top);
  });
});

/** Availability and disjoint controls exercise the real queue without a GPU or synchronous waits. */
function controlledGl() {
  const state = { ready: true, disjoint: false, ms: 1 };
  const ext = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  const results = new Map<WebGLQuery, number>();
  const gl = {
    RENDERER: 0x1f01, QUERY_RESULT_AVAILABLE: 0x8867, QUERY_RESULT: 0x8866,
    getExtension: (name: string) => name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 1 } : name === "EXT_disjoint_timer_query_webgl2" ? ext : null,
    getParameter: (p: number) => p === ext.GPU_DISJOINT_EXT ? state.disjoint : "NVIDIA RTX 4070",
    createQuery: vi.fn(() => ({} as WebGLQuery)),
    beginQuery: vi.fn((_target: number, query: WebGLQuery) => { results.set(query, state.ms * 1e6); }),
    endQuery: vi.fn(), deleteQuery: vi.fn(),
    getQueryParameter: vi.fn((query: WebGLQuery, p: number) => p === 0x8867 ? state.ready : results.get(query)),
  };
  return { state, gl, governor: new QualityGovernor(gl as unknown as WebGL2RenderingContext, () => {}) };
}

describe("bounded completed GPU queries", () => {
  beforeEach(() => { vi.stubGlobal("location", { search: "?quality=high" }); vi.stubGlobal("devicePixelRatio", 2); });
  afterEach(() => vi.unstubAllGlobals());

  it("reuses at most four handles, skips a full ring and deletes handles only at teardown", () => {
    const { state, gl, governor: g } = controlledGl();
    state.ready = false;
    for (let i = 0; i < 5; i++) { g.begin(); g.end(0.016); }
    expect(gl.createQuery).toHaveBeenCalledTimes(4);
    expect(g.gpuPendingQueries).toBe(4);
    expect(g.gpuSkippedQueries).toBe(1);
    expect(g.gpuCompletedSamples).toBe(0);
    state.ready = true;
    g.end(0);
    expect(g.gpuPendingQueries).toBe(0);
    expect(g.gpuCompletedSamples).toBe(4);
    for (let i = 0; i < 100; i++) { g.begin(); g.end(0.016); }
    expect(gl.createQuery).toHaveBeenCalledTimes(4);
    expect(gl.deleteQuery).not.toHaveBeenCalled();
    g.dispose();
    expect(gl.deleteQuery).toHaveBeenCalledTimes(4);
    g.dispose();
    expect(gl.deleteQuery).toHaveBeenCalledTimes(4);
  });

  it("reports p10/p50 of completed samples, with bounded chronological frame/state records", () => {
    const { state, governor: g } = controlledGl();
    for (let i = 1; i <= 300; i++) { state.ms = i; g.begin(); g.end(0.016); }
    expect(g.gpuSamples).toBe(256);
    expect(g.gpuCompletedSamples).toBe(300);
    expect(g.gpuP10Ms).toBe(70); // completed population 45..300
    expect(g.gpuP50Ms).toBe(173);
    expect(g.gpuMs).toBe(g.gpuP10Ms);
    const samples = g.completedGpuSamples();
    expect(samples).toHaveLength(256);
    expect(samples[0]).toMatchObject({ frame: 45, state: 0, tier: "high", dpr: 2, ms: 45 });
    expect(samples[255].frame).toBe(300);
    samples[0].ms = -1;
    expect(g.completedGpuSamples()[0].ms).toBe(45);
    g.dispose();
  });

  it("rejects every in-flight disjoint interval and never aliases a revisited rung", () => {
    const { state, governor: g } = controlledGl();
    state.ready = false;
    g.begin(); g.end(0.016);
    state.disjoint = true;
    g.end(0.016); // unavailable now, but must remain rejected when it finally completes
    state.disjoint = false;
    state.ready = true;
    g.end(0);
    expect(g.gpuDisjointSamples).toBe(1);
    expect(g.gpuCompletedSamples).toBe(0);
    expect(g.gpuMs).toBeNull();
    state.ready = false;
    g.begin(); g.end(0.016);
    g.set("low");
    g.set("high");
    state.ready = true;
    g.end(0);
    expect(g.gpuCompletedSamples).toBe(1);
    expect(g.completedGpuSamples()[0].state).toBe(0);
    expect(g.gpuSamples).toBe(0);
    g.begin(); g.end(0.016);
    expect(g.gpuSamples).toBe(1);
    expect(g.completedGpuSamples()[1].state).toBe(2);
    g.dispose();
  });
});

describe("prepared effect publication", () => {
  beforeEach(() => { vi.stubGlobal("location", { search: "" }); vi.stubGlobal("devicePixelRatio", 1); });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps drawing the current tier until an adjacent state is ready", async () => {
    const applied = vi.fn();
    const g = new QualityGovernor(fakeGl("NVIDIA RTX 4070"), applied);
    const ready = deferred();
    const prepare = vi.fn((_settings: QualitySettings, _signal: AbortSignal) => ready.promise);
    g.setPreparation(prepare);
    g.set("medium");
    expect(g.tier).toBe("high");
    expect(applied).not.toHaveBeenCalled();
    expect(prepare.mock.calls[0][0]).toMatchObject({ tier: "medium", pointLights: 8 });
    ready.resolve();
    await ready.promise; await Promise.resolve();
    expect(g.tier).toBe("medium");
    expect(applied).toHaveBeenCalledTimes(1);
    g.dispose();
  });

  it("cancels superseded preparation without publishing an intermediate tier", async () => {
    const g = new QualityGovernor(fakeGl("NVIDIA RTX 4070"), vi.fn());
    const ready = deferred();
    let signal: AbortSignal | undefined;
    g.setPreparation((_settings, nextSignal) => { signal = nextSignal; return ready.promise; });
    g.set("low");
    g.set("high");
    expect(signal?.aborted).toBe(true);
    ready.resolve();
    await ready.promise; await Promise.resolve();
    expect(g.tier).toBe("high");
    g.dispose();
  });

  it("does not prepare programs for a quantized DPR-only decision", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const g = new QualityGovernor(fakeGl("NVIDIA RTX 4070"), vi.fn());
    const prepare = vi.fn(async () => {});
    g.setPreparation(prepare);
    run(g, 4.6, 33.4);
    expect(g.tier).toBe("high");
    expect(g.dpr).toBe(1.75);
    expect(prepare).not.toHaveBeenCalled();
    g.dispose();
  });
});

describe("target-budget pressure and recovery", () => {
  beforeEach(() => { vi.stubGlobal("location", { search: "" }); vi.stubGlobal("devicePixelRatio", 2); });
  afterEach(() => vi.unstubAllGlobals());

  it("reduces 17 ms GPU work at 33.3 ms presentation after two slow windows", () => {
    const g = new QualityGovernor(timedGl("NVIDIA RTX 4070", { ms: 17 }), vi.fn());
    const top = g.level;
    runTimed(g, 2, 33.3); // Settling, calibration, then only one full decision window.
    expect(g.level).toBe(top);
    runTimed(g, 1.2, 33.3);
    expect(g.level).toBe(top - 1);
  });

  it("acts on GPU budget pressure even with fast presentation", () => {
    const g = new QualityGovernor(timedGl("NVIDIA RTX 4070", { ms: 14 }), vi.fn());
    const top = g.level;
    runTimed(g, 3.2, 16.7);
    expect(g.level).toBe(top - 1);
  });

  it.each([60, 120, 144])("holds clean %i Hz and waits fifteen clean seconds before an upgrade", (hz) => {
    const g = new QualityGovernor(timedGl("Apple M2", { ms: 2 }), vi.fn());
    const start = g.level;
    runTimed(g, 15, 1000 / hz);
    expect(g.level).toBe(start);
    runTimed(g, 1.5, 1000 / hz);
    expect(g.level).toBe(start + 1);
  });

  it("does not cancel long-interval misses with alternating short intervals", () => {
    const g = new QualityGovernor(fakeGl("Apple M2"), vi.fn());
    const start = g.level;
    for (let i = 0; i < 150; i++) { g.begin(); g.end(0.0083); g.begin(); g.end(0.025); }
    expect(g.level).toBeLessThan(start);
  });

  it("requires more than five percent missed target slots in both normal windows", () => {
    const g = new QualityGovernor(fakeGl("NVIDIA RTX 4070"), vi.fn());
    const top = g.level;
    run(g, 4, 17.4); // About 4% misses: insufficient to reduce cost.
    expect(g.level).toBe(top);
    run(g, 2.2, 17.7); // About 5.6% misses in two complete windows.
    expect(g.level).toBe(top - 1);
  });

  it.each([60, 120, 144])("counts missed target slots independently of %i Hz native callbacks", (hz) => {
    const g = new QualityGovernor(fakeGl("Apple M2"), vi.fn());
    const start = g.level;
    for (let i = 0; i < 10; i++) {
      for (let frame = 0; frame < hz / 3; frame++) g.end(1 / hz);
      g.end(0.05); // Same wall time and missed 60 Hz slots on every display.
    }
    expect(g.level).toBeLessThan(start);
  });

  it("requires predicted GPU cost below 0.65 of the target budget to upgrade", () => {
    const g = new QualityGovernor(timedGl("Apple M2", { ms: 10 }), vi.fn());
    const start = g.level;
    runTimed(g, 60, 16.7); // A tier change predicts 1.2 × 10 ms, above 10.855 ms.
    expect(g.level).toBe(start);
  });

  it("jumps to an already-ready low@0.5 within 1.5 seconds of severe overload", () => {
    const applied = vi.fn(), prepare = vi.fn(async () => {});
    const g = new QualityGovernor(timedGl("NVIDIA RTX 4070", { ms: 70 }), applied);
    g.setPreparation(prepare, (settings) => settings.tier === "low");
    runTimed(g, 1.5, 100);
    expect([g.tier, g.dpr]).toEqual(["low", 0.5]);
    expect(prepare).not.toHaveBeenCalled();
    expect(applied).toHaveBeenCalledTimes(1);
  });

  it("also detects severe overload between normal decision boundaries", () => {
    const gpu = { ms: 2 };
    const g = new QualityGovernor(timedGl("NVIDIA RTX 4070", gpu), vi.fn());
    g.setPreparation(vi.fn(async () => {}), () => true);
    runTimed(g, 2.4, 16.7);
    gpu.ms = 70;
    runTimed(g, 1.4, 100);
    expect([g.tier, g.dpr]).toEqual(["low", 0.5]);
  });

  it("uses same-tier resolution while emergency low prepares, then recovers slowly", async () => {
    const gpu = { ms: 70 }, ready = deferred();
    const g = new QualityGovernor(timedGl("NVIDIA RTX 4070", gpu), vi.fn());
    const prepare = vi.fn(() => ready.promise);
    g.setPreparation(prepare);
    runTimed(g, 1.5, 100);
    expect([g.tier, g.dpr]).toEqual(["high", 1.5]);
    expect(prepare).toHaveBeenCalledTimes(1);
    ready.resolve();
    await ready.promise; await Promise.resolve(); await Promise.resolve();
    expect([g.tier, g.dpr]).toEqual(["low", 0.5]);
    gpu.ms = 2;
    runTimed(g, 15, 16.7);
    expect(g.level).toBe(0);
    runTimed(g, 2, 16.7);
    expect(g.level).toBe(1);
  });

  it("holds genuinely CPU-bound severe intervals", () => {
    const g = new QualityGovernor(timedGl("NVIDIA RTX 4070", { ms: 1 }), vi.fn());
    const top = g.level;
    runTimed(g, 10, 100);
    expect(g.level).toBe(top);
  });

  it("reduces cost with unavailable queries but never upgrades on missing GPU evidence", () => {
    const { state, governor: g } = controlledGl();
    state.ready = false;
    runTimed(g, 8, 33.3);
    expect(g.level).toBeLessThan(g.ladder.length - 1);
    const low = g.level;
    runTimed(g, 60, 16.7);
    expect(g.level).toBe(low);
    expect(g.gpuSamples).toBe(0);
    expect(g.gpuPendingQueries).toBe(4);
  });

  it("handles a fifteen-minute slowdown/recovery trace with bounded measurements", () => {
    const gpu = { ms: 70 };
    const g = new QualityGovernor(timedGl("NVIDIA RTX 4070", gpu), vi.fn());
    runTimed(g, 5, 70);
    expect(g.level).toBe(0);
    gpu.ms = 2;
    runTimed(g, 895, 1000 / 60);
    expect(g.level).toBe(g.ladder.length - 1);
    expect(g.gpuSamples).toBe(256);
    expect(g.completedGpuSamples()).toHaveLength(256);
  });
});

describe("rescue resolution traces", () => {
  beforeEach(() => { vi.stubGlobal("location", { search: "" }); vi.stubGlobal("devicePixelRatio", 1); });
  afterEach(() => vi.unstubAllGlobals());

  it("steps Low through 0.8/0.67/0.5, holds the floor and returns one rung per clean interval without preparation", () => {
    const gpu = { ms: 17 }, applied = vi.fn(), prepare = vi.fn(async () => {});
    const g = new QualityGovernor(timedGl("NVIDIA RTX 4070", gpu), applied);
    g.set("low"); g.set("auto"); applied.mockClear(); g.setPreparation(prepare);
    for (const dpr of [0.8, 0.67, 0.5]) {
      runTimed(g, 3.2, 33.3);
      expect([g.tier, g.dpr]).toEqual(["low", dpr]);
    }
    runTimed(g, 30, 33.3);
    expect(g.dpr).toBe(0.5);
    expect(applied.mock.calls.map(([, dpr]) => dpr)).toEqual([0.8, 0.67, 0.5]);
    gpu.ms = 2;
    runTimed(g, 14, 16.7); expect(g.dpr).toBe(0.5);
    runTimed(g, 3, 16.7); expect(g.dpr).toBe(0.67);
    for (const dpr of [0.8, 1]) {
      runTimed(g, 16.5, 16.7);
      expect([g.tier, g.dpr]).toEqual(["low", dpr]);
    }
    expect(prepare).not.toHaveBeenCalled();
    g.dispose();
  });

  it("deduplicates ceiling-clamped rungs and climbs using actual pixel growth", () => {
    const gpu = { ms: 17 }, applied = vi.fn();
    const g = new QualityGovernor(timedGl("NVIDIA RTX 4070", gpu), applied);
    g.reconcileDisplay(1, 0.7);
    for (const [tier, dpr] of [["medium", 0.7], ["low", 0.7], ["low", 0.67], ["low", 0.5]]) {
      runTimed(g, 3.2, 33.3);
      expect([g.tier, g.dpr]).toEqual([tier, dpr]);
    }
    gpu.ms = 2; runTimed(g, 100, 16.7);
    expect([g.tier, g.dpr]).toEqual(["high", 0.7]);
    expect(applied.mock.calls.every(([, dpr]) => dpr <= 0.7)).toBe(true);
    g.dispose();
  });
});

describe("display and lifecycle decision generations", () => {
  beforeEach(() => { vi.stubGlobal("location", { search: "" }); vi.stubGlobal("devicePixelRatio", 2); });
  afterEach(() => vi.unstubAllGlobals());

  it("rebuilds 2↔1 DPR ladders and keeps the nearest valid state on return", () => {
    const g = new QualityGovernor(fakeGl("NVIDIA RTX 4070"), vi.fn());
    expect(g.reconcileDisplay(1, 2)).toBe(true);
    expect(g.ladder).toHaveLength(6);
    expect([g.tier, g.dpr]).toEqual(["high", 1]);
    expect(g.reconcileDisplay(2, 2)).toBe(true);
    expect([g.tier, g.dpr]).toEqual(["high", 1.5]);
    expect(g.ladder).toHaveLength(10);
    expect(g.reconcileDisplay(2, 2)).toBe(false);
  });

  it.each(["?quality=medium", "?dpr=1.75", "?quality=low&dpr=1.75"])("preserves explicit pins %s across migration, zoom and hard limits", (search) => {
    vi.stubGlobal("location", { search });
    const g = new QualityGovernor(fakeGl("NVIDIA RTX 4070"), vi.fn());
    const tier = g.tier, dpr = g.dpr;
    g.reconcileDisplay(1, 2);
    expect(g.tier).toBe(tier);
    expect(g.dpr).toBe(search.includes("dpr=") ? dpr : 1);
    g.reconcileDisplay(0.8, 0.5);
    expect(g.dpr).toBe(0.5);
    g.reconcileDisplay(2, 2);
    expect([g.tier, g.dpr]).toEqual([tier, dpr]);
    expect(g.auto).toBe(false);
    g.set("auto");
    expect(g.auto).toBe(!search.includes("dpr="));
  });

  it("rejects pre-resume query samples and starts with 500 ms settling", () => {
    const { state, governor: g } = controlledGl();
    state.ms = 70; state.ready = false;
    g.begin(); g.end(0.0167);
    g.resume();
    state.ready = true;
    g.end(0.1);
    expect(g.gpuSamples).toBe(0);
    expect(g.gpuCompletedSamples).toBe(1); // Retained for diagnosis, excluded from the new decision state.
    runTimed(g, 0.4, 100);
    expect(g.level).toBe(g.ladder.length - 1);
    runTimed(g, 0.8, 100);
    expect(g.level).toBe(0);
    expect(g.completedGpuSamples().at(-1)?.state).toBeGreaterThan(0);
  });

  it("cancels an automatic preparation on resume and requires new evidence", async () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const ready = deferred(), applied = vi.fn();
    const g = new QualityGovernor(fakeGl("NVIDIA RTX 4070"), applied);
    let signal: AbortSignal | undefined;
    g.setPreparation((_settings, pendingSignal) => { signal = pendingSignal; return ready.promise; });
    run(g, 3.2, 33.3);
    expect(signal).toBeDefined();
    g.resume();
    expect(signal?.aborted).toBe(true);
    ready.resolve(); await ready.promise; await Promise.resolve();
    expect(g.tier).toBe("high");
    expect(applied).not.toHaveBeenCalled();
  });

  it("prevents a pending decision from committing during a pause", async () => {
    vi.stubGlobal("devicePixelRatio", 1);
    const ready = deferred(), applied = vi.fn();
    const g = new QualityGovernor(fakeGl("NVIDIA RTX 4070"), applied);
    g.setPreparation(() => ready.promise);
    run(g, 3.2, 33.3);
    g.pause();
    ready.resolve(); await ready.promise; await Promise.resolve();
    expect(g.tier).toBe("high");
    expect(applied).not.toHaveBeenCalled();
  });

  it("cancels a superseded ladder-index request when a display changes", async () => {
    const ready = deferred(), applied = vi.fn();
    const g = new QualityGovernor(fakeGl("NVIDIA RTX 4070"), applied);
    g.setPreparation(() => ready.promise);
    g.set("low");
    g.reconcileDisplay(1, 2);
    ready.resolve(); await ready.promise; await Promise.resolve();
    expect([g.tier, g.dpr]).toEqual(["low", 1]);
    expect(applied).toHaveBeenCalledTimes(1);
  });
});
