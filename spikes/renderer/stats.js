// Shared perf harness: exposes window.__harbourStats (read by scripts/harbour/shot.mjs).
// gpuMs = GPU timer queries (EXT_disjoint_timer_query_webgl2 / WebGPU timestamp-query),
// cpuMs = JS time spent building + submitting one frame. Rolling window: last 8 s.
const WINDOW_MS = 8000;
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3); };

export function makeStats(path) {
  const cpu = [], gpu = [], dt = [];
  const push = (arr, v) => { const now = performance.now(); arr.push([now, v]); while (arr.length && now - arr[0][0] > WINDOW_MS) arr.shift(); };
  const vals = (arr) => arr.map((x) => x[1]);
  const S = {
    path, backend: 'pending', drawCalls: 0, triangles: 0, dpr: devicePixelRatio, canvas: null,
    init: {}, frames: 0, hulls: 0, lights: 0, notes: [],
    get cpuMs() { const v = vals(cpu); return { p50: pct(v, 0.5), p95: pct(v, 0.95), n: v.length }; },
    get gpuMs() { const v = vals(gpu); return { p50: pct(v, 0.5), p95: pct(v, 0.95), max: pct(v, 1), n: v.length }; },
    get rafMs() { const v = vals(dt); return { p50: pct(v, 0.5), p95: pct(v, 0.95), n: v.length }; },
  };
  window.__harbourStats = S;
  let lastT = null;
  return {
    S,
    mark(name, t = performance.now()) { S.init[name] = +t.toFixed(1); },
    cpu(v) { push(cpu, v); },
    gpu(v) { if (v > 0 && v < 1000) push(gpu, v); },
    raf(now) { if (lastT !== null) push(dt, now - lastT); lastT = now; S.frames++; },
  };
}

// WebGL2 whole-frame GPU timer (scene A). One query in flight per frame, polled later.
export function makeGLTimer(gl, onMs) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return { begin() {}, end() {}, poll() {}, ok: false };
  const pending = []; let active = null;
  return {
    ok: true,
    begin() { if (active) return; active = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, active); },
    end() { if (!active) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null; },
    poll() {
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (pending.length) {
        const q = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
        if (!disjoint) onMs(ns / 1e6);
        gl.deleteQuery(q); pending.shift();
      }
    },
  };
}
