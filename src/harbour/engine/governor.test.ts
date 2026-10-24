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

  it("starts an Apple GPU at Medium 1.5, steps down on missed frames, then probes back up", () => {
    const applied: string[] = [];
    const g = new QualityGovernor(fakeGl("ANGLE (Apple, Apple M1, OpenGL 4.1)"), (s, d) => applied.push(`${s.tier}@${d}`));
    expect(`${g.tier}@${g.dpr}`).toBe("medium@1.5");
    run(g, 12, 33.4);                       // 30 fps: too rich
    expect(g.level).toBeLessThan(3);
    const low = g.level;
    run(g, 60, 16.7);                       // clean 60 fps for a minute: probe upward
    expect(g.level).toBeGreaterThan(low);
    expect(applied.length).toBeGreaterThan(1);
  });

  it("a failed probe sets a ceiling instead of oscillating", () => {
    const g = new QualityGovernor(fakeGl("Apple M2"), () => {});
    const start = g.level;
    for (let i = 0; i < 3000 && g.level === start; i++) g.end(0.0167);   // clean → probe up one rung
    expect(g.level).toBe(start + 1);
    run(g, 8, 33.4);                        // the probe misses frames → back down
    expect(g.level).toBe(start);
    run(g, 40, 16.7);                       // clean again, but the ceiling holds for a while
    expect(g.level).toBe(start);
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
