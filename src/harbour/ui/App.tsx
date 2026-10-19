import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChartLabels } from "./ChartLabels";
import { CornerMark } from "./CornerMark";
import { useStore, useUISlice } from "./hooks";
import { HoverTag } from "./HoverTag";
import { preloadDetails } from "./details";
import { DetailFallback } from "./DetailFallback";

const DetailPanels = lazy(preloadDetails);

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function HarbourUI() {
  const store = useStore();
  const searchOpen = useUISlice((s) => s.searchOpen);
  const selected = useUISlice((s) => s.selected);
  const chartMode = useUISlice((s) => s.chartMode);
  const reducedMotion = useUISlice((s) => s.reducedMotion);
  const ledgerOpen = useUISlice((s) => s.ledgerOpen);
  // Keep mounted after first use so each panel retains its existing close/presence semantics.
  const [detailsStarted, setDetailsStarted] = useState(false);
  if (!detailsStarted && (ledgerOpen || searchOpen || selected)) setDetailsStarted(true);
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
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
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
    <div className={`hb-ui${reducedMotion ? " hb-reduced" : ""}`}>
      <ChartLabels />
      <HoverTag />
      <CornerMark />
      {detailsStarted && <Suspense fallback={<DetailFallback closeLedger={closeLedger} closePanel={closePanel} closeSearch={closeSearch} />}>
        <DetailPanels closeLedger={closeLedger} closePanel={closePanel} closeSearch={closeSearch} />
      </Suspense>}
      <div className="hb-sr" aria-live="polite">{chartMode ? "Chart mode on: names shown." : ""}{searchOpen ? "Search open." : ""}</div>
    </div>
  );
}
