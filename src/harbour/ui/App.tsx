import { useCallback, useEffect, useRef } from "react";
import { ChartLabels } from "./ChartLabels";
import { CornerMark } from "./CornerMark";
import { useStore, useUISlice } from "./hooks";
import { HoverTag } from "./HoverTag";
import { Ledger } from "./Ledger";
import { SidePanel } from "./Panel";
import { Postcard } from "./Postcard";
import { Search } from "./Search";

/** Arrow keys pan. (No WASD: W is the opt-in watch, D-5, and half a WASD set would only confuse.) */
const PAN_KEYS: Record<string, "up" | "down" | "left" | "right"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function HarbourUI() {
  const store = useStore();
  const searchOpen = useUISlice((s) => s.searchOpen);
  const selected = useUISlice((s) => s.selected);
  const chartMode = useUISlice((s) => s.chartMode);
  const reducedMotion = useUISlice((s) => s.reducedMotion);
  const announce = useUISlice((s) => s.announce);
  const capturing = useUISlice((s) => s.capturing);
  const watch = useUISlice((s) => s.watch);
  // focus to return to when the topmost layer closes
  const returnTo = useRef<HTMLElement | null>(null);
  const remember = () => {
    const a = document.activeElement;
    if (a instanceof HTMLElement && a !== document.body && !a.closest(".hb-search")) returnTo.current = a;
  };
  const restore = (layer: string) => {
    const el = returnTo.current;
    returnTo.current = null;
    if (el && el.isConnected) { el.focus({ preventScroll: true }); return; }
    // no prior focus to go back to: land on the wordmark so the keyboard is never lost on <body>
    requestAnimationFrame(() => {
      const a = document.activeElement;
      if (!a || a === document.body || !a.isConnected || a.closest(layer)) document.querySelector<HTMLElement>(".hb-mark-btn")?.focus({ preventScroll: true });
    });
  };

  const closeSearch = useCallback(() => { store.set({ searchOpen: false }); restore(".hb-search"); }, [store]);
  const closePanel = useCallback(() => { store.select(null); restore(".hb-panel"); }, [store]);
  const closeLedger = useCallback(() => { store.set({ ledgerOpen: false }); restore(".hb-ledger"); }, [store]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = store.getSnapshot();
      store.noteInput();
      // the watch lets go on any key but its own (Esc included)
      if (s.watch && e.key !== "w" && e.key !== "W" && !e.repeat && e.key !== "Shift") {
        store.stopWatch();
        if (e.key === "Escape") { e.preventDefault(); return; }
      }
      if (e.key === "Escape") {
        if (s.searchOpen) closeSearch();
        else if (s.selected) closePanel();
        else if (s.ledgerOpen) closeLedger();
        else if (s.chartMode) store.set({ chartMode: false });
        else return;
        e.preventDefault();
        return;
      }
      if (typing(e.target)) return;
      if (e.key === "/") { e.preventDefault(); remember(); store.set({ searchOpen: true }); }
      else if (e.key === "l" || e.key === "L") { e.preventDefault(); if (!s.ledgerOpen) remember(); store.set({ ledgerOpen: !s.ledgerOpen }); }
      else if (e.key === "c" || e.key === "C") { e.preventDefault(); store.set({ chartMode: !s.chartMode }); }
      else if (e.key === "h" || e.key === "H" || e.key === "Home") { e.preventDefault(); store.goHome(); }
      else if (PAN_KEYS[e.key] && !(e.target instanceof HTMLElement && e.target.closest(".hb-panel, .hb-ledger"))) { e.preventDefault(); store.keyPan(PAN_KEYS[e.key], true); }
      else if (e.key === "+" || e.key === "=") { e.preventDefault(); store.keyZoom(1); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); store.keyZoom(-1); }
      else if (e.key === "]") { e.preventDefault(); store.stepHull(1); }
      else if (e.key === "[") { e.preventDefault(); store.stepHull(-1); }
      else if ((e.key === "f" || e.key === "F") && !e.repeat) { e.preventDefault(); store.toggleFollow(); }
      else if ((e.key === "p" || e.key === "P") && !e.repeat) { e.preventDefault(); store.requestPostcard(); }
      else if ((e.key === "w" || e.key === "W") && !e.repeat) { e.preventDefault(); store.toggleWatch(); }
    };
    // a released key always stops its pan (even when focus moved into a field meanwhile)
    const onKeyUp = (e: KeyboardEvent) => { if (PAN_KEYS[e.key]) store.keyPan(PAN_KEYS[e.key], false); };
    const onBlur = () => { for (const d of ["up", "down", "left", "right"] as const) store.keyPan(d, false); };
    addEventListener("keydown", onKey);
    addEventListener("keyup", onKeyUp);
    addEventListener("blur", onBlur);
    return () => { removeEventListener("keydown", onKey); removeEventListener("keyup", onKeyUp); removeEventListener("blur", onBlur); };
  }, [store, closeSearch, closePanel, closeLedger]);

  // opening the panel from the ledger/search: remember where focus was before the panel took it (the
  // panel focuses its title in a child effect, which runs before this one, so track focus as it moves)
  const lastOutside = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onIn = (e: FocusEvent) => { const t = e.target; if (t instanceof HTMLElement && !t.closest(".hb-panel, .hb-search")) lastOutside.current = t; };
    document.addEventListener("focusin", onIn);
    return () => document.removeEventListener("focusin", onIn);
  }, []);
  const prevSel = useRef(selected);
  useEffect(() => {
    if (selected && !prevSel.current && !returnTo.current) {
      const a = document.activeElement;
      if (a instanceof HTMLElement && a.closest(".hb-panel")) returnTo.current = lastOutside.current?.isConnected ? lastOutside.current : null;
      else remember();
    }
    prevSel.current = selected;
  }, [selected]);

  return (
    <div className={`hb-ui${reducedMotion ? " hb-reduced" : ""}${capturing ? " hb-capturing" : ""}`}>
      <ChartLabels />
      <HoverTag />
      <CornerMark />
      <Ledger onClose={closeLedger} />
      <SidePanel onClose={closePanel} />
      <Search onClose={closeSearch} />
      <Postcard />
      {watch && (
        <div className="hb-watch hb-paper" aria-hidden="true">
          <span className="hb-sc">Harbourmaster’s watch</span> <b>{watch.symbol}</b> <em>{watch.line}</em>
          <span className="hb-watch-key"><kbd>W</kbd>stop</span>
        </div>
      )}
      <div className="hb-sr" aria-live="polite">{chartMode ? "Chart mode on: names shown." : ""}{searchOpen ? "Search open." : ""}{announce}</div>
    </div>
  );
}
