/** Install with page.addInitScript BEFORE navigation. Observer overhead is not calibrated. */
export function observeLongTasks() {
  const state = window.__harbourLongTasks = { available: typeof PerformanceObserver !== "undefined" && (PerformanceObserver.supportedEntryTypes?.includes("longtask") ?? false), entries: [], dropped: 0 };
  if (!state.available) return;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (state.entries.length === 4096) { state.entries.shift(); state.dropped++; }
      state.entries.push({ startMs: entry.startTime, durationMs: entry.duration,
        attribution: (entry.attribution ?? []).map((a) => ({ name: a.name, containerType: a.containerType, containerName: a.containerName, containerSrc: a.containerSrc })) });
    }
  }).observe({ type: "longtask", buffered: true });
}
