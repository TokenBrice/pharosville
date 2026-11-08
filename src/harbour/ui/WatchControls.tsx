import { useEffect } from "react";
import { useStore, useUISlice } from "./hooks";

/** Replaces App's aria-hidden watch slip; all input uses the same store actions. */
export function WatchControls() {
  const store = useStore(), watch = useUISlice((s) => s.watch);
  const active = watch != null;
  useEffect(() => {
    if (!active) return;
    const origin = document.activeElement;
    return () => {
      if (document.activeElement === document.body || document.activeElement?.closest(".hb-watch")) {
        const target = origin instanceof HTMLElement && origin !== document.body && origin.isConnected ? origin : document.querySelector<HTMLElement>(".hb-mark-btn");
        target?.focus({ preventScroll: true });
      }
    };
  }, [active]);
  if (!watch) return null;
  return <section className="hb-watch hb-paper" aria-label="Harbourmaster’s watch" onKeyDown={(e) => {
    e.stopPropagation();
    if (e.key === "ArrowLeft") { e.preventDefault(); store.watchPrevious(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); store.watchNext(); }
    else if (e.key === "Escape" || e.key.toLowerCase() === "w") { e.preventDefault(); store.stopWatch(); }
    else if (e.key === "Home") { e.preventDefault(); store.goHome(); } // D14: Home ends the watch from its own controls too
  }}>
    <span><span className="hb-sc">Harbourmaster’s watch</span> <b>{watch.symbol}</b> <span>{watch.line}</span></span>
    <div className="hb-keys">
      <button type="button" onClick={() => store.watchPrevious()}>Previous</button>
      <button type="button" onClick={() => store.watchNext()}>Next</button>
      <button type="button" onClick={() => store.inspectWatch()}>Inspect</button>
      <button type="button" onClick={() => store.stopWatch()}>Stop watch</button>
    </div>
  </section>;
}
