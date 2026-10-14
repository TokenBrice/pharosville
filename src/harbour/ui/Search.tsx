import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "./bits";
import { money } from "./format";
import { usePresence, useStore, useUI, useUISlice } from "./hooks";
import { searchCoins } from "./search";

/** '/' search: a compact chart-paper field; ↑/↓ choose, Enter flies to and selects the boat. */
export function Search({ onClose }: { onClose: () => void }) {
  const searchOpen = useUISlice((s) => s.searchOpen);
  const model = useUISlice((s) => s.model);
  const [mounted, shown] = usePresence(searchOpen, 180);
  if (!mounted) return null;
  return <SearchBox shown={shown && searchOpen} boats={model?.boats ?? []} onClose={onClose} />;
}

function SearchBox({ shown, boats, onClose }: { shown: boolean; boats: NonNullable<ReturnType<typeof useUI>["model"]>["boats"]; onClose: () => void }) {
  const store = useStore();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchCoins(q, boats, 7), [q, boats]);
  useEffect(() => { input.current?.focus(); }, []);

  const choose = (i: number) => {
    const b = results[i];
    if (b) store.select({ kind: "boat", id: b.id });
  };
  return (
    <div className="hb-search hb-paper hb-fade" data-shown={shown} role="dialog" aria-label="Find a coin">
      <div className="hb-search-field">
        <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M11 11l4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          placeholder={`Find one of ${boats.length || 625} coins…`}
          aria-label="Search coins by symbol or name"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="hb-search-results"
          aria-activedescendant={results.length ? `hb-sr-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); choose(active); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
          }}
        />
      </div>
      {results.length > 0 && (
        <ul className="hb-results" id="hb-search-results" role="listbox" aria-label="Matching coins">
          {results.map((b, i) => (
            <li key={b.id} id={`hb-sr-${i}`} role="option" aria-selected={i === active} className="hb-result"
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(i); }}>
              <Logo src={b.logo} label={b.symbol} color={b.brandColor} />
              <b>{b.symbol}</b>
              <em>{b.name}</em>
              <span className="hb-num">{money(b.supply)}</span>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && results.length === 0 && <div className="hb-search-hint">No coin answers to “{q.trim()}”.</div>}
      {!q.trim() && <div className="hb-search-hint">Type a ticker or a name · Enter sails there · Esc closes</div>}
    </div>
  );
}
