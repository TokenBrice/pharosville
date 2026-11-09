import { useEffect } from "react";
import { Binoculars } from "lucide-react";
import { useStore, useUISlice } from "./hooks";
import { ACTIONS } from "./KeyList";

/**
 * The watch's start for touch and pointer (D14, O7-F7): the help sheet carries it with the essentials, and the sheet
 * steps aside as the watch begins, so its first stop is seen. While a watch runs it stops it, and says so.
 */
export function WatchStartButton({ onStart }: { onStart?: () => void }) {
  const store = useStore(), watching = useUISlice((s) => s.watch != null);
  return <button type="button" className="hb-control" onClick={() => { if (!watching) onStart?.(); store.toggleWatch(); }}>
    <Binoculars aria-hidden="true" strokeWidth={1.25} /><span>{watching ? "Stop watch" : ACTIONS.watch.label}</span><kbd aria-hidden="true">{ACTIONS.watch.cap}</kbd>
  </button>;
}

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
      <button type="button" onClick={() => store.watchPrevious()}><kbd aria-hidden="true">{ACTIONS.left.cap}</kbd>Previous</button>
      <button type="button" onClick={() => store.watchNext()}><kbd aria-hidden="true">{ACTIONS.right.cap}</kbd>Next</button>
      <button type="button" onClick={() => store.inspectWatch()}>Inspect</button>
      <button type="button" onClick={() => store.stopWatch()}><kbd aria-hidden="true">{ACTIONS.watch.cap}</kbd>Stop watch</button>
    </div>
  </section>;
}
