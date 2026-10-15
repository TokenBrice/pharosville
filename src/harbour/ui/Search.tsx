import { useEffect, useMemo, useRef, useState } from "react";
import type { HarbourModel } from "../model/types";
import { chainLogo, Logo } from "./bits";
import { PANEL_LANDMARKS } from "./facts";
import { money } from "./format";
import { touchFirst, usePresence, useStore, useUISlice } from "./hooks";
import { searchCoins, type Searchable } from "./search";
import { placeName, plotFor, seaZones, ZONE_PANEL } from "./places";
import { getLayout, type PickHit } from "./services";
import { PHASE_NAME, yardCoins } from "./yard";
import { deadRecords } from "../model/obituary";

interface Item extends Searchable { hit: PickHit; logo: string | null; color: string; note: string }

/** '/' search: a compact chart-paper field over coins, harbours and landmarks; ↑/↓ choose, Enter sails there. */
export function Search({ onClose }: { onClose: () => void }) {
  const searchOpen = useUISlice((s) => s.searchOpen);
  const model = useUISlice((s) => s.model);
  const [mounted, shown] = usePresence(searchOpen, 180);
  if (!mounted) return null;
  return <SearchBox shown={shown && searchOpen} model={model} onClose={onClose} />;
}

function SearchBox({ shown, model, onClose }: { shown: boolean; model: HarbourModel | null; onClose: () => void }) {
  const store = useStore();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const items = useMemo<Item[]>(() => {
    const out: Item[] = (model?.boats ?? []).map((b) => ({
      id: b.id, symbol: b.symbol, name: b.name, supply: b.supply, hit: { kind: "boat", id: b.id }, logo: b.logo, color: b.brandColor, note: money(b.supply),
    }));
    for (const h of model?.harbours ?? []) {
      out.push({ id: `chain:${h.chain}`, symbol: h.chain, name: h.piered ? `${h.chain} harbour` : `${h.chain}, a far port`, supply: h.supplyUsd,
        hit: { kind: "harbour", id: h.chain }, logo: chainLogo(h.chain), color: "#1f5873", note: money(h.supplyUsd) });
    }
    // pre-launch coins: hulls on the Shipyard's slips
    const live = new Set(out.map((o) => o.id));
    for (const c of yardCoins(store.ctx)) {
      if (live.has(c.id)) continue;
      out.push({ id: c.id, symbol: c.symbol, name: c.name, supply: 0, hit: { kind: "yard", id: c.id }, logo: c.logo, color: "#7a5a22",
        note: `pre-launch · ${c.phase ? PHASE_NAME[c.phase].toLowerCase() : "shipyard"}` });
    }
    // the dead: each lies in Wreck Cove (a live hull in the dead list is already here as a boat); never outranks a
    // live coin of the same name (supply 0)
    for (const w of model?.readings.wrecks ?? []) {
      if (live.has(w.id)) continue;
      const r = deadRecords().get(w.id);
      out.push({ id: w.id, symbol: w.symbol, name: w.name, supply: 0, hit: { kind: "wreck", id: w.id }, logo: r?.logo ?? null, color: "#8a7d66",
        note: `wreck · † ${w.deathDate.slice(0, 4)}` });
    }
    const L = getLayout(store.ctx);
    const zoneIds = new Set(seaZones(L).map((z) => ZONE_PANEL[z.kind]).filter(Boolean));
    for (const id of PANEL_LANDMARKS) {
      if (id === "tide-board") continue;
      if (!L?.landmarks.some((l) => l.id === id) && !plotFor(L, id) && !zoneIds.has(id)) continue;
      const name = placeName(L, id);
      out.push({ id: `lm:${id}`, symbol: name, name: name.replace(/^The /, ""), supply: 0,
        hit: { kind: "landmark", id }, logo: null, color: "#a68242", note: zoneIds.has(id) ? "sea zone" : "landmark" });
    }
    return out;
  }, [model, store]);
  const results = useMemo(() => searchCoins(q, items, 7), [q, items]);
  useEffect(() => { input.current?.focus(); }, []);

  const choose = (i: number) => {
    const r = results[i];
    if (r) store.select(r.hit);
  };
  return (
    <div className="hb-search hb-paper hb-fade" data-shown={shown} role="dialog" aria-label="Find a coin">
      <div className="hb-search-field">
        <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M11 11l4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          placeholder={`Find a coin, a chain or a landmark…`}
          aria-label="Search coins, chains and landmarks"
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
        <ul className="hb-results" id="hb-search-results" role="listbox" aria-label="Matches">
          {results.map((r, i) => (
            <li key={r.id} id={`hb-sr-${i}`} role="option" aria-selected={i === active} className="hb-result" data-kind={r.hit.kind}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(i); }}>
              {r.hit.kind === "landmark" ? <span className="hb-logo hb-lm-glyph" aria-hidden="true" /> : <Logo src={r.logo} label={r.symbol} color={r.color} />}
              <b>{r.symbol}</b>
              <em>{r.hit.kind === "landmark" ? "" : r.name}</em>
              <span className={r.hit.kind === "landmark" || r.hit.kind === "yard" || r.hit.kind === "wreck" ? "hb-result-kind" : "hb-num"}>{r.note}</span>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && results.length === 0 && <div className="hb-search-hint">Nothing in the harbour answers to “{q.trim()}”.</div>}
      {!q.trim() && <div className="hb-search-hint">{touchFirst() ? "A ticker, a chain or a place · tap a match to sail there" : "A ticker, a chain or a place · Enter sails there · Esc closes"}</div>}
    </div>
  );
}
