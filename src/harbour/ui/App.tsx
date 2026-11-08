import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ShipChooser } from "./ShipChooser";
import { ChartLabels } from "./ChartLabels";
import { CornerMark } from "./CornerMark";
import { useStore, useUISlice } from "./hooks";
import { HoverTag } from "./HoverTag";
import { Postcard } from "./Postcard";
import { preloadDetails } from "./details";
import { DetailFallback } from "./DetailFallback";
import { SectionErrorBoundary } from "@/components/section-error-boundary";
import { OverlayFailure } from "./OverlayFailure";
import { HelpSheet } from "./HelpSheet";
import { ACTIONS, ActionContext, performAction, type HarbourAction } from "./KeyList";
import { readShortcuts, saveShortcuts } from "./shortcuts";
import { useOverlayRects } from "./measurements";
import type { LabelBox } from "./cull";

/** Arrow keys pan. (No WASD: W is the opt-in watch, D-5, and half a WASD set would only confuse.) */
const PAN_KEYS: Record<string, "up" | "down" | "left" | "right"> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const ownsNavigation = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('[role="menu"], [role="tablist"], [role="listbox"], [role="combobox"], [role="slider"], [role="spinbutton"], .hb-panel, .hb-ledger, .hb-search, .hb-help');

export function HarbourUI() {
  const store = useStore();
  const searchOpen = useUISlice((s) => s.searchOpen);
  const shipChoices = useUISlice((s) => s.shipChoices);
  const selected = useUISlice((s) => s.selected);
  const chartMode = useUISlice((s) => s.chartMode);
  const reducedMotion = useUISlice((s) => s.reducedMotion);
  const announce = useUISlice((s) => s.announce);
  const capturing = useUISlice((s) => s.capturing);
  const watch = useUISlice((s) => s.watch);
  const ledgerOpen = useUISlice((s) => s.ledgerOpen);
  // Keep mounted after first use so each panel retains its existing close/presence semantics.
  const [DetailPanels] = useState(() => lazy(preloadDetails));
  const [helpOpen, setHelpOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(readShortcuts);
  const root = useRef<HTMLDivElement>(null);
  const overlays = useOverlayRects(root);
  const tagBox = useRef<LabelBox>({ x: 0, y: 0, w: 0, h: 0, visible: false });
  const [detailsStarted, setDetailsStarted] = useState(false);
  if (!detailsStarted && (ledgerOpen || searchOpen || selected)) setDetailsStarted(true);
  const openers = useRef<Record<string, HTMLElement | null>>({});
  const remember = useCallback((layer: string) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return;
    openers.current[layer] = active;
  }, []);
  const restore = useCallback((layer: string) => {
    const el = openers.current[layer];
    delete openers.current[layer];
    const focus = () => {
      const target = el?.isConnected && !el.closest("[inert]") ? el : document.querySelector<HTMLElement>(".hb-mark-btn");
      target?.focus({ preventScroll: true });
    };
    if ((el ?? document.querySelector<HTMLElement>(".hb-mark-btn"))?.closest("[inert]")) requestAnimationFrame(() => requestAnimationFrame(focus));
    else focus();
  }, []);
  const closeSearch = useCallback(() => { store.set({ searchOpen: false }); restore(".hb-search"); }, [store, restore]);
  const closePanel = useCallback(() => { store.select(null); restore(".hb-panel"); }, [store, restore]);
  const closeLedger = useCallback(() => { store.set({ ledgerOpen: false }); restore(".hb-ledger"); }, [store, restore]);
  const closeHelp = useCallback(() => { setHelpOpen(false); restore(".hb-help"); }, [restore]);
  const backToControls = () => {
    setHelpOpen(false); store.select(null); store.set({ ledgerOpen: false, searchOpen: false });
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLElement>(".hb-mark-btn")?.focus({ preventScroll: true })));
  };
  // Store notifications run before detail components take focus, including canvas/ledger selections.
  useLayoutEffect(() => {
    let previous = store.getSnapshot();
    return store.subscribe(() => {
      const next = store.getSnapshot();
      if (next.searchOpen && !previous.searchOpen) remember(".hb-search");
      if (next.ledgerOpen && !previous.ledgerOpen) remember(".hb-ledger");
      if (next.selected && previous.searchOpen && !next.searchOpen) openers.current[".hb-panel"] = openers.current[".hb-search"] ?? null;
      else if (next.selected && !previous.selected) remember(".hb-panel");
      previous = next;
    });
  }, [store, remember]);
  const action = useCallback((id: HarbourAction) => {
    if (id === "help") { if (!helpOpen) remember(".hb-help"); setHelpOpen(true); return; }
    if (id === "search" || id === "ledger" || id === "reading") {
      if (helpOpen) { setHelpOpen(false); restore(".hb-help"); }
      if (id === "ledger" && store.getSnapshot().ledgerOpen) { closeLedger(); return; }
    }
    const active = document.activeElement;
    performAction(store, id);
    if (helpOpen && id !== "postcard" && active instanceof HTMLElement) requestAnimationFrame(() => { if (active.isConnected) active.focus({ preventScroll: true }); });
  }, [store, helpOpen, remember, restore, closeLedger]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = store.getSnapshot();
      if (document.querySelector("dialog[open]")) return;
      store.noteInput();
      if (e.key === "Escape") {
        if (helpOpen) closeHelp();
        else if (s.shipChoices?.length) store.set({ shipChoices: [] });
        else if (s.searchOpen) closeSearch();
        else if (s.selected) closePanel();
        else if (s.ledgerOpen) closeLedger();
        else if (s.chartMode) store.set({ chartMode: false });
        else if (store.dismissHover()) { /* hover closes before camera automation */ }
        else store.stopAutomation();
        e.preventDefault();
        return;
      }
      if (s.shipChoices?.length || typing(e.target)) return;
      if ((PAN_KEYS[e.key] || e.key === "Home") && ownsNavigation(e.target)) return;
      if (e.key.length === 1 && !shortcuts) return;
      if (PAN_KEYS[e.key]) {
        e.preventDefault(); store.keyPan(PAN_KEYS[e.key], true); return;
      }
      const entry = Object.entries(ACTIONS).find(([, a]) => (a.keys as readonly string[]).includes(e.key.length === 1 ? e.key.toLowerCase() : e.key));
      if (entry && !e.repeat) { e.preventDefault(); action(entry[0] as HarbourAction); }
    };
    // a released key always stops its pan (even when focus moved into a field meanwhile)
    const onKeyUp = (e: KeyboardEvent) => { if (PAN_KEYS[e.key]) store.keyPan(PAN_KEYS[e.key], false); };
    const onBlur = () => { for (const d of ["up", "down", "left", "right"] as const) store.keyPan(d, false); };
    addEventListener("keydown", onKey);
    addEventListener("keyup", onKeyUp);
    addEventListener("blur", onBlur);
    return () => { removeEventListener("keydown", onKey); removeEventListener("keyup", onKeyUp); removeEventListener("blur", onBlur); };
  }, [store, closeSearch, closePanel, closeLedger, closeHelp, helpOpen, shortcuts, action]);

  return (
    <ActionContext.Provider value={action}><div ref={root} className={`hb-ui${reducedMotion ? " hb-reduced" : ""}${capturing ? " hb-capturing" : ""}`}>
      <a className="hb-skip hb-control hb-paper" href="#hb-ledger-title" onClick={(e) => { e.preventDefault(); action("reading"); requestAnimationFrame(() => document.querySelector<HTMLElement>("#hb-ledger-title, #hb-loading-ledger")?.focus()); }}>Skip to harbour readings</a>
      <ChartLabels overlays={overlays} tagBox={tagBox} />
      <HoverTag overlayRef={tagBox} />
      <CornerMark />
      {detailsStarted && <SectionErrorBoundary name="harbour-details"
        fallback={(retry, attempts) => (ledgerOpen || searchOpen || selected) && <OverlayFailure scope="details" retry={retry} attempts={attempts} close={() => {
          if (searchOpen) closeSearch();
          if (selected) closePanel();
          if (ledgerOpen) closeLedger();
        }} />}><Suspense fallback={<DetailFallback closeLedger={closeLedger} closePanel={closePanel} closeSearch={closeSearch} />}>
        <DetailPanels closeLedger={closeLedger} closePanel={closePanel} closeSearch={closeSearch} />
      </Suspense></SectionErrorBoundary>}
      {(ledgerOpen || selected || searchOpen || helpOpen) && <button type="button" className="hb-back-controls hb-control hb-paper" onClick={backToControls}>Back to harbour controls</button>}
      {helpOpen && <HelpSheet onClose={closeHelp} shortcuts={shortcuts} setShortcuts={(enabled) => { setShortcuts(enabled); saveShortcuts(enabled); }} />}
      <Postcard />
      {!!shipChoices?.length && <ShipChooser choices={shipChoices} />}
      {watch && (
        <div className="hb-watch hb-paper" aria-hidden="true">
          <span className="hb-sc">Harbourmaster’s watch</span> <b>{watch.symbol}</b> <em>{watch.line}</em>
          <span className="hb-watch-key"><kbd>W</kbd>stop</span>
        </div>
      )}
      <div className="hb-sr" aria-live="polite">{chartMode ? "Chart mode on: names shown." : ""}{searchOpen ? "Search open." : ""}{announce}</div>
    </div></ActionContext.Provider>
  );
}
