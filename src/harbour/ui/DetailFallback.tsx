import { useEffect, useRef } from "react";
import { useUISlice } from "./hooks";

function Close({ label, onClose }: { label: string; onClose: () => void }) {
  return <button type="button" className="hb-close" aria-label={label} onClick={onClose}>
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
  </button>;
}

/** Reuse the real fixed-position panel chrome: loading never shifts the world or its controls. */
export function DetailFallback({ closeLedger, closePanel, closeSearch }: {
  closeLedger: () => void;
  closePanel: () => void;
  closeSearch: () => void;
}) {
  const ledgerOpen = useUISlice((s) => s.ledgerOpen);
  const selected = useUISlice((s) => s.selected);
  const searchOpen = useUISlice((s) => s.searchOpen);
  const ledger = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const target = searchOpen ? search.current : selected ? panel.current : ledgerOpen ? ledger.current : null;
    target?.focus({ preventScroll: true });
  }, [searchOpen, selected, ledgerOpen]);
  return <>
    {ledgerOpen && <section className="hb-ledger hb-paper hb-neat" data-shown="true" role="dialog" aria-modal="false" aria-labelledby="hb-loading-ledger">
      <Close label="Close ledger (Esc)" onClose={closeLedger} />
      <div className="hb-ledger-head">
        <span className="hb-kicker hb-sc">The harbour ledger</span>
        <h2 id="hb-loading-ledger" className="hb-title" tabIndex={-1} ref={ledger}>What you are looking at</h2>
      </div>
      <div className="hb-ledger-body"><p className="hb-caption" role="status">Loading the harbour ledger…</p></div>
    </section>}
    {selected && <aside className="hb-panel hb-paper hb-neat" data-shown="true" role="complementary" aria-labelledby="hb-loading-panel">
      <Close label="Close panel (Esc)" onClose={closePanel} />
      <header className="hb-panel-head"><h2 id="hb-loading-panel" className="hb-title" tabIndex={-1} ref={panel}>Harbour details</h2></header>
      <div className="hb-panel-body"><p className="hb-why" role="status">Loading these harbour details…</p></div>
    </aside>}
    {searchOpen && <div className="hb-search hb-paper" data-shown="true" role="dialog" aria-label="Find a coin">
      <div className="hb-search-field">
        <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M11 11l4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
        <input ref={search} readOnly value="" placeholder="Loading search…" aria-label="Search is loading" />
      </div>
      <div className="hb-search-hint" role="status">Loading coins, chains and landmarks… <button type="button" onClick={closeSearch}>Close (Esc)</button></div>
    </div>}
  </>;
}
