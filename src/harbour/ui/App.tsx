import { useCallback, useEffect, useRef } from "react";
import { ChartLabels } from "./ChartLabels";
import { CornerMark } from "./CornerMark";
import { useStore, useUISlice } from "./hooks";
import { HoverTag } from "./HoverTag";
import { Ledger } from "./Ledger";
import { SidePanel } from "./Panel";
import { Search } from "./Search";

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function HarbourUI() {
  const store = useStore();
  const searchOpen = useUISlice((s) => s.searchOpen);
  const selected = useUISlice((s) => s.selected);
  const chartMode = useUISlice((s) => s.chartMode);
  const reducedMotion = useUISlice((s) => s.reducedMotion);
  // focus to return to when the topmost layer closes
  const returnTo = useRef<HTMLElement | null>(null);
  const remember = () => {
    const a = document.activeElement;
    if (a instanceof HTMLElement && a !== document.body && !a.closest(".hb-search")) returnTo.current = a;
  };
  const restore = () => {
    const el = returnTo.current;
    returnTo.current = null;
    if (el && el.isConnected) el.focus({ preventScroll: true });
  };

  const closeSearch = useCallback(() => { store.set({ searchOpen: false }); restore(); }, [store]);
  const closePanel = useCallback(() => { store.select(null); restore(); }, [store]);
  const closeLedger = useCallback(() => { store.set({ ledgerOpen: false }); restore(); }, [store]);

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
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [store, closeSearch, closePanel, closeLedger]);

  // opening the panel from the ledger/search: remember where focus was
  const prevSel = useRef(selected);
  useEffect(() => { if (selected && !prevSel.current && !returnTo.current) remember(); prevSel.current = selected; }, [selected]);

  return (
    <div className={`hb-ui${reducedMotion ? " hb-reduced" : ""}`}>
      <ChartLabels />
      <HoverTag />
      <CornerMark />
      <Ledger onClose={closeLedger} />
      <SidePanel onClose={closePanel} />
      <Search onClose={closeSearch} />
      <div className="hb-sr" aria-live="polite">{chartMode ? "Chart mode on: names shown." : ""}{searchOpen ? "Search open." : ""}</div>
    </div>
  );
}
