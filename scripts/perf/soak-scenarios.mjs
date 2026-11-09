/** Test-only resource tracking and serialized mounted/remount scenario. No production fault switches. */
export function trackResources() {
  try { localStorage.setItem("harbour.sound", "off"); } catch { /* private window */ }
  const workers = new Map(), audio = new Map();
  let workerId = 0, audioId = 0;
  const audioSupported = !!window.AudioContext;
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) { super(...args); this.__soakId = ++workerId; workers.set(this.__soakId, new WeakRef(this)); }
    terminate() { workers.delete(this.__soakId); return super.terminate(); }
  };
  for (const name of ["AudioContext", "OfflineAudioContext"]) {
    const NativeContext = window[name];
    if (!NativeContext) continue;
    window[name] = class extends NativeContext {
      constructor(...args) { super(...args); audio.set(++audioId, new WeakRef(this)); }
    };
  }
  window.__soakCrashWorker = () => {
    const worker = [...workers.values()].map((ref) => ref.deref()).find(Boolean);
    if (!worker) throw new Error("No worker to fault");
    worker.dispatchEvent(new ErrorEvent("error", { message: "Soak injected worker crash", cancelable: true }));
  };
  window.__soakResources = () => {
    for (const [id, ref] of workers) if (!ref.deref()) workers.delete(id);
    const states = [];
    for (const [id, ref] of audio) { const ctx = ref.deref(); if (!ctx) audio.delete(id); else states.push(ctx.state); }
    return { trackedWorkers: workers.size, workersCreated: workerId, audioContexts: !audioSupported ? null : states.filter((s) => s !== "closed").length, audioContextsCreated: audioId, audioStates: states };
  };
}

export async function runSoak(options) {
  const samples = [], scenarios = [], failures = [];
  const start = performance.now();
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  if (options.reducedMotion && !matchMedia("(prefers-reduced-motion: reduce)").matches) throw new Error("Reduced-motion preference was not installed before boot");
  const waitFor = async (predicate, description) => {
    const deadline = performance.now() + options.readyTimeoutMs;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error(`Soak timed out: ${description}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const sample = async (cycle, phase, info) => {
    if (options.gc) await window.__cdp("HeapProfiler.collectGarbage", {});
    const { metrics } = await window.__cdp("Performance.getMetrics", {}).catch(() => ({ metrics: [] }));
    const { targetInfos } = await window.__cdp("Target.getTargets", {}).catch(() => ({ targetInfos: null }));
    const workers = targetInfos?.filter((t) => t.type === "worker");
    const dom = await window.__cdp("Memory.getDOMCounters", {}).catch(() => null);
    samples.push({ listeners: dom?.jsEventListeners ?? null, cycle, phase, ms: performance.now(), geometries: info?.memory.geometries ?? null, textures: info?.memory.textures ?? null, programs: info?.programs?.length ?? null, heapBytes: metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? performance.memory?.usedJSHeapSize ?? null, workerTargets: workers?.length ?? null, workerUrls: workers?.map((t) => t.url), ...window.__soakResources(), renderedRevision: window.__harbourStats?.renderedRevision ?? null });
  };
  await window.__cdp("Performance.enable", {});
  for (let cycle = 0; cycle < options.cycles; cycle++) {
    if (options.mode === "mounted") await sleep(Math.max(0, start + cycle * options.interval - performance.now()));
    await waitFor(() => { const e = window.__harbour; return e && e.ready.size === e.systems.length && e.ctx.services.get("readiness")?.prepared && window.__harbourStats?.renderedRevision > 0; }, "mounted prepared fleet");
    let engine = window.__harbour;
    try {
      if (options.mode === "mounted") {
        document.querySelector(".hb-skip")?.click();
        await waitFor(() => !!document.querySelector('.hb-ledger:not([hidden])'), "ledger opens");
        const row = document.querySelector('.hb-ledger .hb-textbtn');
        if (!row) throw new Error("Missing Keeper’s Log panel control");
        row.click();
        await waitFor(() => !!document.querySelector('.hb-panel'), "panel opens");
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.querySelector('[aria-label="Close ledger (Esc)"]')?.click();
        scenarios.push({ cycle, kind: "panels", status: "PASS" });
        if (cycle === options.warmup) {
          // Test-only lifecycle seam: dispatch the same event with explicit document visibility.
          Object.defineProperty(document, "hidden", { configurable: true, value: true });
          Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
          document.dispatchEvent(new Event("visibilitychange"));
          await waitFor(() => !engine.running, "engine pauses when hidden");
          await sleep(1000);
          delete document.hidden; delete document.visibilityState;
          document.dispatchEvent(new Event("visibilitychange"));
          await waitFor(() => engine.running, "engine wakes");
          scenarios.push({ cycle, kind: "hidden-wake", status: "PASS", syntheticVisibility: true });
        }
        if (options.faults && (cycle === options.warmup + 1 || cycle === options.warmup + 2)) {
          const kind = cycle === options.warmup + 1 ? "worker-crash" : "context-loss";
          const before = performance.now();
          if (kind === "worker-crash") {
            window.__soakCrashWorker();
            await waitFor(() => engine.ctx.services.get("simulation-status")?.phase !== "ready", "worker fault observed");
            await waitFor(() => engine.ctx.services.get("simulation-status")?.phase === "ready", "worker recovers");
          } else {
            const ext = engine.ctx.renderer.getContext().getExtension("WEBGL_lose_context");
            if (!ext) throw new Error("Context fault injection unavailable");
            ext.loseContext();
            await sleep(250); ext.restoreContext();
            await waitFor(() => window.__harbour && window.__harbour !== engine, "context remount");
            engine = window.__harbour;
            await waitFor(() => engine.ready.size === engine.systems.length && engine.ctx.services.get("readiness")?.prepared, "rebuilt context prepared");
          }
          scenarios.push({ cycle, kind, status: "PASS", recoveryMs: performance.now() - before });
        }
      }
      if (options.audio) {
        const activated = await window.__cdp("Runtime.evaluate", { expression: `(() => { const sound = window.__harbour.ctx.services.get("sound"); if (!sound) throw new Error("Missing sound controller"); if (sound.on && !sound.playing) sound.toggle(); if (!sound.on) sound.toggle(); sound.toggle(); sound.toggle(); })()`, userGesture: true, returnByValue: true });
        if (activated.exceptionDetails) throw new Error("Audio activation failed inside CDP user gesture");
        await waitFor(() => engine.ctx.services.get("sound")?.playing && window.__soakResources().audioStates.includes("running"), "sound-ON playback");
      }
      let feed = engine.ctx.services.get("feed");
      for (let refresh = 0; refresh < options.refreshes; refresh++) {
        window.__scenario?.advanceTo(Math.floor((cycle * options.refreshes + refresh + 1) * Math.min(300_000, 86_400_000 / (options.cycles * options.refreshes + 1))));
        const revision = engine.ctx.services.get("readiness").revision;
        await Promise.all(["stablecoins", "chains", "stability", "pegSummary", "stress", "safetyGrades", "mintBurn"].map((key) => feed.refresh(key)));
        await waitFor(() => window.__harbourStats?.renderedRevision > revision, "refreshed model rendered");
        const errors = Object.entries(feed.payloads).filter(([, value]) => value.error).map(([key, value]) => `${key}: ${value.error}`);
        if (errors.length) throw new Error(`Soak feed refresh failed: ${errors.join("; ")}`);
      }
      await new Promise((r) => setTimeout(r, options.settle));
      await waitFor(() => engine.ready.size === engine.systems.length && engine.ctx.services.get("readiness")?.prepared
        && engine.ctx.services.get("simulation-status")?.phase === "ready"
        && window.__harbourStats?.renderedRevision >= engine.ctx.services.get("readiness").revision, "coherent fleet after scenario");
      await sample(cycle, "mounted", engine.ctx.renderer.info);
      if (options.mode === "mounted") continue;
      await window.__cdp("Emulation.setDeviceMetricsOverride", { width: 400, height: 400, deviceScaleFactor: options.dpr, mobile: false, screenWidth: options.width, screenHeight: options.height });
      await waitFor(() => engine.disposed && window.__harbour !== engine, "viewport denial disposes engine (React entry required)");
      const disposedCounts = { memory: { ...engine.ctx.renderer.info.memory }, programs: { length: engine.ctx.renderer.info.programs?.length ?? null } };
      feed = null;
      engine = null;
      await new Promise((r) => setTimeout(r, options.settle));
      await sample(cycle, "disposed", disposedCounts);
      await window.__cdp("Emulation.setDeviceMetricsOverride", { width: options.width, height: options.height, deviceScaleFactor: options.dpr, mobile: false, screenWidth: options.width, screenHeight: options.height });
    } catch (error) { failures.push({ cycle, message: error.message }); break; }
  }
  await waitFor(() => window.__harbour && window.__harbourStats?.firstFrameMs != null, "final remount");
  return { samples, scenarios, failures, elapsedMs: performance.now() - start };
}
