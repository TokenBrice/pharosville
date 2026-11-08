import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FAMILIES, FAMILY_ORDER } from "../model/obituary";
import type { Boat, EndpointKey, HarbourModel } from "../model/types";
import { ANNIVERSARY_RULE, CEREMONY_RULE, FLOW_RULE, HULL_RULE, LETTERING_RULE, OFFICE_RULE, PRINT_RULE, SAIL_RULE, SEA_RULE, TIDE_RULE, WREATH_RULE, WRECK_RULE, REEF_FLARE_LINE, alertCountLine, allocationLine, BOAT_SIGNALS_RULE, BY_EAR, epitaphOf, FAR_PORTS_LINE, STATION_RULE, stationFact, wreckDate } from "./facts";
import { bps, causeName, money, pegName, share, titleCase } from "./format";
import { Freshness } from "./bits";
import { observedEmpty, readingSentence, qualificationCopy, READING_NAMES, sourceTruth } from "./source-state";
import { truthCopy } from "./truth-copy";
import { getFeed } from "./services";
import { usePresence, useStore, useUISlice } from "./hooks";
import { KeyList } from "./KeyList";
import { expectedKey, expectedLabel, launchedFromYard, PHASE_NAME, PHASES, UPCOMING_URL, yardCoins, YARD_EXPLANATION, type YardCoin } from "./yard";

const TABS = ["Legend", "Coins", "Pre-launch", "Chains", "Wrecks"] as const;
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
  const store = useStore();
  const yard = yardCoins(store.ctx);
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
              {t}{t === "Coins" && model ? ` · ${model.boats.length}` : t === "Pre-launch" ? ` · ${yard.length}` : t === "Chains" && model ? ` · ${model.harbours.length}` : t === "Wrecks" && model ? ` · ${model.readings.wrecks.length}` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="hb-ledger-body" role="tabpanel" id={`hb-tp-${tab}`} aria-labelledby={`hb-tab-${tab}`} tabIndex={0}>
        {tab === "Legend" && <Legend model={model} />}
        {tab === "Coins" && <Coins model={model} />}
        {tab === "Pre-launch" && <PreLaunch coins={yard} />}
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
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M7 30h16M9 30V20h12v10M11 20V12h8v8M13 12V7h4v5" /><path {...G} d="M15 7c-1.5-1.5 0-3 0-4 1 1 2.5 2 0 4" /><path {...G} d="M18 6l22-4M18 7l22 5" strokeDasharray="2 2.5" /></svg>,
    title: "The Pharos", rule: "The beam’s rhythm is the stability band.", more: "A fire in the lantern, thrown out to sea by a bronze mirror. A slow, wide sweep is a calm market; a faster, shorter beam is stress. A dark lantern means no reading. Its light passes over the ships and walls it reaches; a horn shutter narrows it when the index was computed without early-warning data.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M10 24h22l-3 4H13zM21 24V6M21 7l9 14h-9M20 9l-7 12h7" /></svg>,
    title: "Boats", rule: "Every stablecoin is one boat. Boats visit each chain in proportion to their supply there; sailing is not a bridge transfer.",
    more: `${HULL_RULE} ${SAIL_RULE} Hull size follows supply; the rig follows the peg currency. The sail carries the coin’s colours. ${PRINT_RULE} A lit bronze stern lantern means the coin has a peg reading. A boat dressed overall in signal flags is new to the register this week or joined the tracked register this visit.`,
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M14 24h18l-3 4H17zM23 24V10M23 11l7 11h-7" /><path {...G} d="M10 18c-5-8 6-15 13-15s16 5 14 13" strokeDasharray="2.5 2.5" /><path {...G} d="M35 14l2 2.5 2.5-2" /></svg>,
    title: "Harbour outings", rule: "A boat out for a sail is decoration.",
    more: "Now and then a boat that lives at one harbour sails a loop out and back to the same berth. Its tag says “out for a sail”; a boat “sailing to” a chain is on its circuit.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M5 13h36M5 23h36" strokeWidth={0.6} /><text x="23" y="21" textAnchor="middle" fontSize="8.5" letterSpacing="1.6" fill="currentColor" fontStyle="italic" fontWeight={600}>ETH</text></svg>,
    title: "Harbours and chart lettering", rule: LETTERING_RULE,
    more: OFFICE_RULE,
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M4 30h18M6 30V18h14v12M9 18V6h3v12M14 18V9h3v9" /><path {...G} d="M10 5c-2-2 1-3 0-4M15 8c-2-2 1-3 0-4" strokeDasharray="1.5 1.5" /><path {...G} d="M28 30h14M30 30l2-6h6l2 6" /><path {...G} d="M35 23c-3-3-1-6 0-9 1 3 4 5 0 9z" /></svg>,
    title: "The Mint and the Burn", rule: FLOW_RULE,
    more: "Incomplete daily windows bank the fires. Partial or unknown valuation makes gross amounts lower bounds. The Customs House lists the reported scope.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M4 28l38-8" /><path {...G} d="M10 25c4 2 14 0 20-5M12 25V17M17 24V15M22 23V14M27 21V14" /><path {...G} d="M36 4v14M36 5l-10 5" /></svg>,
    title: "The Shipyard", rule: "Awaiting admission to the tracked fleet.",
    more: YARD_EXPLANATION,
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M4 14c4-4 8-4 12 0s8 4 12 0 8-4 12 0M4 23c4-4 8-4 12 0s8 4 12 0 8-4 12 0" /></svg>,
    title: "Sea state", rule: "Sea state is the share of supply off peg.", more: SEA_RULE,
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M12 22h20a6 6 0 0 0 0-12 8 8 0 0 0-15-2 6 6 0 0 0-5 14zM16 26l-2 4M24 26l-2 4M32 26l-2 4" /></svg>,
    title: "Weather", rule: "Weather is early-warning stress.", more: `${STATION_RULE} ${BOAT_SIGNALS_RULE} Weather rolling in from the horizon is the reading rising; a clearing line, a rainbow or a moonbow, a recovery.`,
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M6 12h26M12 17h28M6 22h24M14 27h20" strokeDasharray="5 3" /></svg>,
    title: "Fog", rule: "Fog means stale data.", more: "When the feed stops refreshing, fog rolls in and every boat finishes its leg and holds. Nothing pretends to be live.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><circle {...G} cx="16" cy="17" r="6" /><path {...G} d="M16 6v3M16 25v3M5 17h3M24 17h3M8 9l2 2M22 23l2 2M8 25l2-2M22 11l2-2" /><path {...G} d="M36 11a7 7 0 1 0 4 12 6 6 0 0 1-4-12z" /></svg>,
    title: "Light and time of day", rule: "Light and time of day follow your clock and are decorative.", more: "Night brings windows, riding lights and pier lamps, lit outward from the Pharos at dusk; it carries no data. So are the moon’s phase, meteors, the distance haze, sun shadows on the water, the seasons, the townsfolk and animals, and the trees moving in the wind.",
  },
  {
    glyph: <svg viewBox="0 0 46 34" aria-hidden="true"><path {...G} d="M8 26c6-2 12-2 18 0s10 2 14 0M12 24l6-10 10 2 4 8M18 14l-2-6" /></svg>,
    title: "Wreck Cove", rule: "Every grey hulk is a stablecoin that died.", more: `${WRECK_RULE} ${FAMILY_ORDER.map((f) => `${FAMILIES[f].name}: ${FAMILIES[f].form}.`).join(" ")} ${WREATH_RULE} ${ANNIVERSARY_RULE}`,
  },
];

function Legend({ model }: { model: HarbourModel | null }) {
  const store = useStore();
  const qualification = qualificationCopy(getFeed(store.ctx)?.payloads);
  return (
    <>
      <p className="hb-legend-intro">The harbour is the data. Nothing moves without a declared meaning, and anything that is only decoration says so.</p>
      <ul className="hb-legend">
        {LEGEND.map((l) => (
          <li key={l.title}>{l.glyph}<div><b>{l.title}</b><p className="hb-rule">{l.rule}</p><p>{l.more}{l.title === "Sea state" ? ` ${readingSentence(model, "pegSummary")}` : ""}</p></div></li>
        ))}
      </ul>
      <p className="hb-caption">{TIDE_RULE}</p>
      <p className="hb-caption">{REEF_FLARE_LINE}</p>
      <p className="hb-caption">{CEREMONY_RULE}</p>
      <p className="hb-caption">{stationFact(model)}</p>
      <p className="hb-caption">{alertCountLine(model)}</p>
      {!(model?.readings.shoals.length) && <p className="hb-caption">{observedEmpty(model, "shoals")}</p>}
      {!(model?.readings.stormCones?.count) && <p className="hb-caption">{observedEmpty(model, "alerts")}</p>}
      <section className="hb-sec" aria-label="Reading sources">
        {(Object.keys(READING_NAMES) as EndpointKey[]).map((source) => <Freshness key={source} model={model} source={source} />)}
        {qualification && <p className="hb-caption">{qualification}</p>}
      </section>
      <section className="hb-sec" aria-labelledby="hb-by-ear">
        <h3 id="hb-by-ear" className="hb-sec-h hb-sc">By ear</h3>
        <p>{BY_EAR}</p>
      </section>
      <KeyList />
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
  const gradeTruth = sourceTruth(model, "safetyGrades");
  const cols = useMemo<Col<Boat>[]>(() => [
    { key: "symbol", label: "Coin", get: (b) => b.symbol, cell: (b) => <><button type="button" onClick={() => store.select({ kind: "boat", id: b.id })} aria-label={`${b.symbol}, ${b.name}: show in the harbour`}>{b.symbol}</button> <em className="hb-trunc" title={b.name}>{b.name !== b.symbol ? b.name : ""}</em></> },
    { key: "supply", label: "Supply", num: true, get: (b) => b.supply, cell: (b) => money(b.supply) },
    { key: "peg", label: "Peg", get: (b) => pegName(b.pegType) },
    { key: "dev", label: "Deviation", num: true, get: (b) => b.pegDeviationBps, cell: (b) => <span className={b.activeDepeg ? "hb-down" : ""}>{b.pegDeviationBps == null ? truthCopy({ kind: "absent-row", reading: "peg" }) : bps(b.pegDeviationBps)}</span> },
    { key: "home", label: "Home", get: (b) => b.chainShares[0]?.chain ?? "No chain allocation reported." },
    { key: "state", label: "State", get: (b) => STATE_WORD[b.state] },
    { key: "grade", label: "Grade", get: (b) => truthCopy({ kind: "grade", grade: b.grade, truth: gradeTruth }), cell: (b) => <>{truthCopy({ kind: "grade", grade: b.grade, truth: gradeTruth })}{gradeTruth.state !== "current" && b.grade && <em> Last received grade: {b.grade}.</em>}</> },
  ], [store, gradeTruth]);
  if (!model?.hasFleet) return <p className="hb-empty">Awaiting data: the register has not arrived yet.</p>;
  return <>{(["stablecoins", "pegSummary", "stress", "safetyGrades", "mintBurn"] as const).map((source) => <Freshness key={source} model={model} source={source} />)}<SortTable rows={model.boats} cols={cols} rowKey={(b) => b.id} caption="Supply and holdings: Supply source; deviation: Peg readings; early warning: Stress readings; grade: Safety grades; flows: Flow readings. Every coin is one boat. Select a coin to sail to it." initial={{ key: "supply", dir: -1 }} filterOf={(b) => `${b.symbol} ${b.name}`} noun="coins" /></>;
}

function PreLaunch({ coins }: { coins: YardCoin[] }) {
  const store = useStore();
  const cols = useMemo<Col<YardCoin>[]>(() => [
    { key: "symbol", label: "Coin", get: (c) => c.symbol, cell: (c) => <><button type="button" onClick={() => store.select({ kind: "yard", id: c.id })} aria-label={`${c.symbol}, ${c.name}: show on the Shipyard`}>{c.symbol}</button> <em className="hb-trunc" title={c.name}>{c.name !== c.symbol ? c.name : ""}</em></> },
    { key: "phase", label: "Phase", get: (c) => (c.phase ? PHASES.indexOf(c.phase) : -1), cell: (c) => (c.phase ? PHASE_NAME[c.phase] : <em>not stated</em>) },
    { key: "expected", label: "Expected", get: (c) => (c.expected ? expectedKey(c.expected) : null), cell: (c) => (c.expected ? expectedLabel(c.expected) : <em>not stated</em>) },
    { key: "peg", label: "Peg", get: (c) => (c.peg && c.peg !== "OTHER" ? pegName(c.peg) : null) },
    { key: "news", label: "Latest news", num: true, get: (c) => c.milestones[0]?.date ?? null, cell: (c) => (c.milestones[0] ? expectedLabel(c.milestones[0].date.slice(0, 7)) : "—") },
  ], [store]);
  const model = useUISlice((s) => s.model);
  const gone = launchedFromYard(model);
  return (
    <>
      {coins.length === 0 && <p className="hb-empty">No records are awaiting admission to the tracked fleet.</p>}
      <SortTable rows={coins} cols={cols} rowKey={(c) => c.id} caption={`Awaiting admission to the tracked fleet. ${YARD_EXPLANATION}${gone.length ? ` Admitted to the fleet: ${gone.map((c) => c.symbol).join(", ")}.` : ""}`}
        initial={{ key: "phase", dir: -1 }} filterOf={(c) => `${c.symbol} ${c.name} ${c.phase ?? ""}`} noun="records" />
      <p className="hb-caption" style={{ marginTop: 12 }}>Bundled admission records; see sources for dates. <a className="hb-out" href={UPCOMING_URL} target="_blank" rel="noopener noreferrer">pharos.watch/upcoming<span aria-hidden="true"> ↗</span><span className="hb-sr"> (opens in a new tab)</span></a></p>
    </>
  );
}

function Chains({ model }: { model: HarbourModel | null }) {
  const store = useStore();
  type H = HarbourModel["harbours"][number];
  const cols = useMemo<Col<H>[]>(() => [
    { key: "chain", label: "Chain", get: (h) => h.chain, cell: (h) => <button type="button" onClick={() => store.select({ kind: "harbour", id: h.chain })} aria-label={`${h.chain}: show in the harbour`}>{h.chain}</button> },
    { key: "supply", label: "Supply", num: true, get: (h) => h.supplyUsd, cell: (h) => money(h.supplyUsd) },
    { key: "share", label: "Share", num: true, get: (h) => h.share, cell: (h) => `${share(h.share)} of reported chain-attributed supply` },
    { key: "visitors", label: "Boats calling", num: true, get: (h) => h.visitors },
    { key: "where", label: "Berths", get: (h) => (h.piered ? "own pier" : "Far Ports") },
  ], [store]);
  if (!model?.hasFleet) return <p className="hb-empty">Awaiting data.</p>;
  return <><Freshness model={model} source="stablecoins" /><Freshness model={model} source="chains" /><p className="hb-caption">{allocationLine(model.boats)}</p><SortTable rows={model.harbours} cols={cols} rowKey={(h) => h.chain} caption={FAR_PORTS_LINE} initial={{ key: "supply", dir: -1 }} filterOf={(h) => h.chain} noun="chains" /></>;
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
