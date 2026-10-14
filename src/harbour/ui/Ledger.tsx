import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Boat, HarbourModel } from "../model/types";
import { epitaphOf, wreckDate } from "./facts";
import { bps, causeName, money, pegName, share, titleCase } from "./format";
import { usePresence, useStore, useUISlice } from "./hooks";

const TABS = ["Legend", "Coins", "Chains", "Wrecks"] as const;
type Tab = (typeof TABS)[number];

/** 'L' ledger: the legend with the declared rules, and the accessible table parity path. */
export function Ledger({ onClose }: { onClose: () => void }) {
  const ledgerOpen = useUISlice((s) => s.ledgerOpen);
  const [mounted, shown] = usePresence(ledgerOpen, 220);
  if (!mounted) return null;
  return <LedgerBody shown={shown && ledgerOpen} onClose={onClose} />;
}

function LedgerBody({ shown, onClose }: { shown: boolean; onClose: () => void }) {
  const model = useUISlice((s) => s.model);
  const [tab, setTab] = useState<Tab>("Legend");
  const head = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => { head.current?.focus({ preventScroll: true }); }, []);
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : -1;
    if (n >= 0) { e.preventDefault(); setTab(TABS[n]); tabRefs.current[n]?.focus(); }
  };
  return (
    <section className="hb-ledger hb-paper hb-neat hb-fade" data-shown={shown} aria-labelledby="hb-ledger-title" role="dialog" aria-modal="false">
      <button type="button" className="hb-close" aria-label="Close ledger (Esc)" onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      </button>
      <div className="hb-ledger-head">
        <span className="hb-kicker hb-sc">The harbour ledger</span>
        <h2 id="hb-ledger-title" className="hb-title" tabIndex={-1} ref={head}>What you are looking at</h2>
        <div className="hb-tabs" role="tablist" aria-label="Ledger sections">
          {TABS.map((t, i) => (
            <button key={t} type="button" role="tab" id={`hb-tab-${t}`} aria-selected={tab === t} aria-controls={`hb-tp-${t}`} tabIndex={tab === t ? 0 : -1}
              className="hb-tab hb-sc" ref={(el) => { tabRefs.current[i] = el; }} onClick={() => setTab(t)} onKeyDown={(e) => onTabKey(e, i)}>
              {t}{t === "Coins" && model ? ` · ${model.boats.length}` : t === "Chains" && model ? ` · ${model.harbours.length}` : t === "Wrecks" && model ? ` · ${model.readings.wrecks.length}` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="hb-ledger-body" role="tabpanel" id={`hb-tp-${tab}`} aria-labelledby={`hb-tab-${tab}`} tabIndex={0}>
        {tab === "Legend" && <Legend />}
        {tab === "Coins" && <Coins model={model} />}
        {tab === "Chains" && <Chains model={model} />}
        {tab === "Wrecks" && <Wrecks model={model} />}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ legend

const G = { fill: "none", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const LEGEND: Array<{ glyph: ReactNode; title: string; rule: string; more: string }> = [
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M8 26h18M10 26l3-16h6l3 16M13 10l3-4 3 4" /><path {...G} d="M21 8l20-5M21 9l20 4" strokeDasharray="2 2.5" /></svg>,
    title: "The Pharos", rule: "The beam’s rhythm is the stability band.", more: "A slow, wide sweep is a calm market; a faster, shorter beam is stress. An unlit lantern means no reading.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M10 24h22l-3 4H13zM21 24V6M21 7l9 14h-9M20 9l-7 12h7" /></svg>,
    title: "Boats", rule: "Every stablecoin is one boat. Boats visit each chain in proportion to their supply there; sailing is not a bridge transfer.",
    more: "Hull size follows supply; the rig follows the peg currency. The sail carries the coin’s colours.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M4 14c4-4 8-4 12 0s8 4 12 0 8-4 12 0M4 23c4-4 8-4 12 0s8 4 12 0 8-4 12 0" /></svg>,
    title: "Sea state", rule: "Sea state is the share of supply off peg.", more: "Four steps, from flat calm (under 0.5 %) to a heavy sea (over 10 %). Coins off peg anchor on the Shoals.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M12 22h20a6 6 0 0 0 0-12 8 8 0 0 0-15-2 6 6 0 0 0-5 14zM16 26l-2 4M24 26l-2 4M32 26l-2 4" /></svg>,
    title: "Weather", rule: "Weather is early-warning stress.", more: "Cloud and wind follow the supply-weighted early-warning level. The storm mast hoists one cone per coin at Alert or worse.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M6 12h26M12 17h28M6 22h24M14 27h20" strokeDasharray="5 3" /></svg>,
    title: "Fog", rule: "Fog means stale data.", more: "When the feed stops refreshing, fog rolls in and every boat finishes its leg and holds. Nothing pretends to be live.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><circle {...G} cx="16" cy="17" r="6" /><path {...G} d="M16 6v3M16 25v3M5 17h3M24 17h3M8 9l2 2M22 23l2 2M8 25l2-2M22 11l2-2" /><path {...G} d="M36 11a7 7 0 1 0 4 12 6 6 0 0 1-4-12z" /></svg>,
    title: "Light and time of day", rule: "Light and time of day follow your clock and are decorative.", more: "Night brings windows, riding lights and pier lamps; it carries no data.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M6 28h34M10 28V18M15 28V12M20 28V20M25 28V8M30 28V16M35 28V22" /></svg>,
    title: "Customs House tide board", rule: "Painted bars are the last 24 hours of mint and burn.", more: "One bar per hour; gaps are hours whose value is not yet known.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M8 26c6-2 12-2 18 0s10 2 14 0M12 24l6-10 10 2 4 8M18 14l-2-6" /></svg>,
    title: "Wreck Cove", rule: "Every grey hulk is a stablecoin that died.", more: "Each carries an epitaph; open the cove or the Wrecks tab to read them.",
  },
];

function Legend() {
  return (
    <>
      <p className="hb-legend-intro">The harbour is the data. Nothing moves without a declared meaning, and anything that is only decoration says so.</p>
      <ul className="hb-legend">
        {LEGEND.map((l) => (
          <li key={l.title}>{l.glyph}<div><b>{l.title}</b><p className="hb-rule">{l.rule}</p><p>{l.more}</p></div></li>
        ))}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ tables

interface Col<T> { key: string; label: string; num?: boolean; wrap?: boolean; get: (r: T) => string | number | null; cell?: (r: T) => ReactNode }

function SortTable<T>({ rows, cols, caption, rowKey, initial, filterOf, noun }: {
  rows: T[]; cols: Col<T>[]; caption: string; rowKey: (r: T) => string; initial: { key: string; dir: 1 | -1 }; filterOf: (r: T) => string; noun: string;
}) {
  const [sort, setSort] = useState(initial);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const f = q.trim().toLowerCase();
    const col = cols.find((c) => c.key === sort.key) ?? cols[0];
    const out = f ? rows.filter((r) => filterOf(r).toLowerCase().includes(f)) : [...rows];
    out.sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
    return out;
  }, [rows, cols, sort, q, filterOf]);
  return (
    <>
      <div className="hb-filter">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${noun}…`} aria-label={`Filter ${noun}`} />
        <span aria-live="polite">{shown.length} of {rows.length}</span>
      </div>
      <table className="hb-table">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={c.num ? "r" : ""} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                <button type="button" className="hb-sc" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : c.num ? -1 : 1 }))}>{c.label}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={rowKey(r)}>{cols.map((c) => <td key={c.key} className={c.num ? "r" : c.wrap ? "hb-wrap" : ""}>{c.cell ? c.cell(r) : String(c.get(r) ?? "—")}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const STATE_WORD: Record<Boat["state"], string> = { circuit: "circuit", moored: "moored", shoals: "Shoals", wrecked: "wrecked" };

function Coins({ model }: { model: HarbourModel | null }) {
  const store = useStore();
  const cols = useMemo<Col<Boat>[]>(() => [
    { key: "symbol", label: "Coin", get: (b) => b.symbol, cell: (b) => <><button type="button" onClick={() => store.select({ kind: "boat", id: b.id })} aria-label={`${b.symbol}, ${b.name}: show in the harbour`}>{b.symbol}</button> <em className="hb-trunc" title={b.name}>{b.name !== b.symbol ? b.name : ""}</em></> },
    { key: "supply", label: "Supply", num: true, get: (b) => b.supply, cell: (b) => money(b.supply) },
    { key: "peg", label: "Peg", get: (b) => pegName(b.pegType) },
    { key: "dev", label: "Deviation", num: true, get: (b) => b.pegDeviationBps, cell: (b) => <span className={b.activeDepeg ? "hb-down" : ""}>{bps(b.pegDeviationBps)}</span> },
    { key: "home", label: "Home", get: (b) => b.chainShares[0]?.chain ?? null },
    { key: "state", label: "State", get: (b) => STATE_WORD[b.state] },
    { key: "grade", label: "Grade", get: (b) => b.grade },
  ], [store]);
  if (!model?.hasFleet) return <p className="hb-empty">Awaiting data: the register has not arrived yet.</p>;
  return <SortTable rows={model.boats} cols={cols} rowKey={(b) => b.id} caption="Every coin is one boat. Select a coin to sail to it." initial={{ key: "supply", dir: -1 }} filterOf={(b) => `${b.symbol} ${b.name}`} noun="coins" />;
}

function Chains({ model }: { model: HarbourModel | null }) {
  const store = useStore();
  type H = HarbourModel["harbours"][number];
  const cols = useMemo<Col<H>[]>(() => [
    { key: "chain", label: "Chain", get: (h) => h.chain, cell: (h) => <button type="button" onClick={() => store.select({ kind: "harbour", id: h.chain })} aria-label={`${h.chain}: show in the harbour`}>{h.chain}</button> },
    { key: "supply", label: "Supply", num: true, get: (h) => h.supplyUsd, cell: (h) => money(h.supplyUsd) },
    { key: "share", label: "Share", num: true, get: (h) => h.share, cell: (h) => share(h.share) },
    { key: "visitors", label: "Boats calling", num: true, get: (h) => h.visitors },
    { key: "where", label: "Berths", get: (h) => (h.piered ? "own pier" : "Far Ports") },
  ], [store]);
  if (!model?.hasFleet) return <p className="hb-empty">Awaiting data.</p>;
  return <SortTable rows={model.harbours} cols={cols} rowKey={(h) => h.chain} caption="Chains with the most supply get a pier; the rest share the Far Ports." initial={{ key: "supply", dir: -1 }} filterOf={(h) => h.chain} noun="chains" />;
}

function Wrecks({ model }: { model: HarbourModel | null }) {
  type W = HarbourModel["readings"]["wrecks"][number];
  const cols = useMemo<Col<W>[]>(() => [
    { key: "name", label: "Coin", get: (w) => w.name, cell: (w) => <><b>{w.name}</b> <em>{w.symbol !== w.name ? w.symbol : ""}</em></> },
    { key: "date", label: "Died", get: (w) => w.deathDate, cell: (w) => wreckDate(w.deathDate) },
    { key: "cause", label: "Cause", get: (w) => titleCase(causeName(w.cause)) },
    { key: "epitaph", label: "Epitaph", get: (w) => epitaphOf(w.id), cell: (w) => <em>{epitaphOf(w.id) ?? "—"}</em>, wrap: true },
    { key: "peak", label: "Peak", num: true, get: (w) => w.peakMcap, cell: (w) => money(w.peakMcap) },
  ], []);
  return <SortTable rows={model?.readings.wrecks ?? []} cols={cols} rowKey={(w) => w.id} caption="The grey hulks of Wreck Cove." initial={{ key: "date", dir: -1 }} filterOf={(w) => `${w.name} ${w.symbol} ${w.cause}`} noun="wrecks" />;
}
