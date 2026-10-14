import { Fragment, useEffect, useRef, type ReactNode } from "react";
import type { HarbourLayout } from "../layout/types";
import type { Boat, HarbourModel } from "../model/types";
import { ChainSplit, chainLogo, DEWS_INK, Freshness, Logo, PSI_INK, Sparkline, TideBars } from "./bits";
import { epitaphOf, quoted, whereLine, whyHere, wreckDate } from "./facts";
import { bps, causeName, HULL_NAME, MINUS, money, pctChange, pegName, share, titleCase } from "./format";

const signed = (v: number) => (v < 0 ? MINUS : "") + Math.abs(v).toFixed(2);
import { usePresence, useStore, useSticky, useUI, useUISlice } from "./hooks";
import { getFeed, getLighthouse, type PickHit } from "./services";
import type { HarbourUIStore } from "./store";

type Raw = Record<string, unknown>;
const raw = (store: HarbourUIStore, key: string): Raw | null => {
  const feed = getFeed(store.ctx);
  return ((feed?.payloads as Record<string, { data?: unknown } | undefined> | undefined)?.[key]?.data as Raw | undefined) ?? null;
};
const sumBuckets = (o: unknown) => (o && typeof o === "object" ? Object.values(o as Record<string, unknown>).reduce<number>((s, v) => s + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0) : 0);

export function SidePanel({ onClose }: { onClose: () => void }) {
  const selected = useUISlice((s) => s.selected);
  const [mounted, shown] = usePresence(selected != null, 220);
  const hit = useSticky(selected);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const key = hit ? `${hit.kind}:${hit.id}` : "";
  useEffect(() => { if (selected && mounted) titleRef.current?.focus({ preventScroll: true }); }, [key, selected, mounted]);
  if (!mounted || !hit) return null;
  return (
    <aside className="hb-panel hb-paper hb-neat hb-fade" data-shown={shown && selected != null} aria-labelledby="hb-panel-title" role="complementary">
      <button type="button" className="hb-close" aria-label="Close panel (Esc)" onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      </button>
      <PanelContent hit={hit} titleRef={titleRef} key={key} />
    </aside>
  );
}

interface HeadProps { kicker: string; title: string; sub?: ReactNode; logo?: ReactNode; titleRef: React.RefObject<HTMLHeadingElement | null> }
function Head({ kicker, title, sub, logo, titleRef }: HeadProps) {
  return (
    <header className="hb-panel-head">
      <span className="hb-kicker hb-sc">{kicker}</span>
      <div className="hb-title-row">
        {logo}
        <div>
          <h2 id="hb-panel-title" className="hb-title" tabIndex={-1} ref={titleRef}>{title}</h2>
          {sub && <div className="hb-sub">{sub}</div>}
        </div>
      </div>
    </header>
  );
}

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return <section className="hb-sec"><h3 className="hb-sec-h hb-sc">{title}</h3>{children}</section>;
}

function PanelContent({ hit, titleRef }: { hit: PickHit; titleRef: React.RefObject<HTMLHeadingElement | null> }) {
  const store = useStore();
  const { model } = useUI();
  if (hit.kind === "boat") {
    const b = model?.boats.find((x) => x.id === hit.id);
    return b ? <BoatPanel b={b} titleRef={titleRef} /> : <Head kicker="Vessel" title={hit.id} sub="no longer on the register" titleRef={titleRef} />;
  }
  if (hit.kind === "harbour") return <HarbourPanel chain={hit.id} model={model} titleRef={titleRef} />;
  const L = store.ctx.services.get("layout") as HarbourLayout | undefined;
  const name = L?.landmarks.find((l) => l.id === hit.id)?.name ?? hit.id;
  switch (hit.id) {
    case "pharos": return <PharosPanel model={model} titleRef={titleRef} />;
    case "shoals": return <ShoalsPanel model={model} titleRef={titleRef} />;
    case "customs-house": case "tide-board": return <CustomsPanel model={model} titleRef={titleRef} />;
    case "storm-mast": return <StormPanel model={model} titleRef={titleRef} />;
    case "wreck-cove": return <WreckPanel model={model} titleRef={titleRef} />;
    case "far-ports": return <FarPortsPanel model={model} titleRef={titleRef} />;
    case "harbourmaster": return <HarbourmasterPanel titleRef={titleRef} />;
    case "registry": return (
      <><Head kicker="Landmark" title={name} sub={`${model?.payloadCount ?? 0} coins on the register`} titleRef={titleRef} />
        <div className="hb-panel-body"><p className="hb-why">Every stablecoin the register knows is a boat in this harbour: no sampling, no sister ships. The full list lives in the ledger.</p>
          <p className="hb-caption">Press <b>L</b> to open the ledger, or <b>/</b> to find one coin.</p></div></>
    );
    case "slipway": return (
      <><Head kicker="Landmark" title={name} sub="where new coins are launched" titleRef={titleRef} />
        <div className="hb-panel-body"><p className="hb-why">When a coin first appears on the register, its hull slides down this slipway and sails to the harbour that holds most of its supply.</p></div></>
    );
    default: return <Head kicker="Landmark" title={name} titleRef={titleRef} />;
  }
}

// ------------------------------------------------------------------ boat

function BoatPanel({ b, titleRef }: { b: Boat; titleRef: React.RefObject<HTMLHeadingElement | null> }) {
  const store = useStore();
  useUI(); // re-render on tick: whereabouts change
  const w = store.whereaboutsOf(b.id);
  const coin = ((raw(store, "stablecoins")?.peggedAssets as Raw[] | undefined) ?? []).find((c) => c.id === b.id) ?? null;
  const prev = (k: string) => { const v = sumBuckets(coin?.[k]); return v > 0 ? b.supply / v - 1 : null; };
  const peg = ((raw(store, "pegSummary")?.coins as Raw[] | undefined) ?? []).find((c) => c.id === b.id) ?? null;
  const ref = peg?.pegReference as { valueUsd?: number; source?: string; contributorCount?: number } | undefined;
  const mint = ((raw(store, "mintBurn")?.coins as Raw[] | undefined) ?? []).find((c) => c.stablecoinId === b.id) ?? null;
  const cov = mint?.coverage as { status?: string } | undefined;
  const mintTracked = mint && cov?.status !== "unavailable";
  const truth = store.getSnapshot().model?.truth.stablecoins;
  const sub = `${b.name} · ${HULL_NAME[b.hullClass] ?? b.hullClass}`;
  const ch = (v: number | null) => <b className={v == null ? "" : v > 0.0005 ? "hb-up" : v < -0.0005 ? "hb-down" : ""}>{pctChange(v)}</b>;
  return (
    <>
      <Head kicker="Vessel" title={b.symbol} sub={sub} logo={<Logo src={b.logo} label={b.symbol} color={b.brandColor} />} titleRef={titleRef} />
      <div className="hb-panel-body">
        {whereLine(b, w) && <div className="hb-where">{titleCase(whereLine(b, w).charAt(0)) + whereLine(b, w).slice(1)}</div>}
        <p className="hb-why">{whyHere(b, w)}</p>

        <Sec title="Supply">
          <div className="hb-big hb-num">{money(b.supply)}</div>
          <div className="hb-changes">
            <div><span className="hb-sc">24 h</span>{ch(prev("circulatingPrevDay"))}</div>
            <div><span className="hb-sc">7 d</span>{ch(prev("circulatingPrevWeek"))}</div>
            <div><span className="hb-sc">30 d</span>{ch(prev("circulatingPrevMonth"))}</div>
          </div>
        </Sec>

        {b.state !== "wrecked" && (
          <Sec title="Circuit">
            <ChainSplit boat={b} />
            <p className="hb-caption">Visits each chain in proportion to its supply there. Sailing is not a bridge transfer.</p>
          </Sec>
        )}

        <Sec title="Peg">
          <dl className="hb-dl">
            <dt>Pegged to</dt><dd>{pegName(b.pegType)}</dd>
            <dt>Deviation</dt><dd className={b.activeDepeg ? "hb-down" : ""}>{b.nullPeg ? <em>no reading</em> : bps(b.pegDeviationBps)}{b.activeDepeg ? " · off peg" : ""}</dd>
            {ref?.valueUsd != null && <><dt>Reference</dt><dd>${ref.valueUsd < 10 ? ref.valueUsd.toFixed(4) : ref.valueUsd.toFixed(2)} <em>{ref.source === "median" && ref.contributorCount ? `median of ${ref.contributorCount}` : ref.source ?? ""}</em></dd></>}
            {typeof peg?.pegScore === "number" && <><dt>Peg score</dt><dd>{peg.pegScore}<em> / 100</em></dd></>}
          </dl>
        </Sec>

        <Sec title="Signals">
          <dl className="hb-dl">
            <dt>Early warning</dt>
            <dd>{b.dews ? <span className="hb-band" style={{ "--band": DEWS_INK[b.dews] } as React.CSSProperties}>{titleCase(b.dews)}{b.dewsScore != null ? <em>&nbsp;{Math.round(b.dewsScore)}</em> : null}</span> : <em>not covered</em>}</dd>
            <dt>Safety grade</dt><dd>{b.grade ?? <em>unrated</em>}</dd>
          </dl>
        </Sec>

        {mintTracked && (
          <Sec title="Mint & burn">
            <dl className="hb-dl">
              {Number(mint.mintVolume24hUsd) === 0 && Number(mint.burnVolume24hUsd) === 0 ? <><dt>Last 24 h</dt><dd><em>no mint or burn</em></dd></> : <>
              <dt>Net, 24 h</dt><dd className={Number(mint.netFlow24hUsd) > 0 ? "hb-up" : Number(mint.netFlow24hUsd) < 0 ? "hb-down" : ""}>{money(Number(mint.netFlow24hUsd), { signed: true })}</dd>
              <dt>Minted · burned</dt><dd>{money(Number(mint.mintVolume24hUsd))} · {money(Number(mint.burnVolume24hUsd))}</dd></>}
              <dt>Net, 7 d</dt><dd>{money(Number(mint.netFlow7dUsd), { signed: true })}</dd>
            </dl>
          </Sec>
        )}
        {truth && <Freshness label="Supply data" state={truth.state} ageSec={truth.ageSec} />}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ landmarks

type P = { model: HarbourModel | null; titleRef: React.RefObject<HTMLHeadingElement | null> };

function PharosPanel({ model, titleRef }: P) {
  const store = useStore();
  const p = model?.readings.psi;
  const stab = raw(store, "stability");
  const cur = stab?.current as { components?: Record<string, number> } | undefined;
  const hist = ((stab?.history as Array<{ date: number; score: number }> | undefined) ?? []).filter((h) => Number.isFinite(h.score))
    .sort((a, b) => a.date - b.date).slice(-30);
  const histDates = hist.map((h) => h.date);
  const histScores = hist.map((h) => h.score);
  const lh = getLighthouse(store.ctx);
  const comps: Array<[string, string, string]> = [
    ["severity", "Severity", "how far off peg the stressed coins are"],
    ["breadth", "Breadth", "how much supply is off peg"],
    ["stressBreadth", "Stress breadth", "how much supply carries early-warning stress"],
    ["trend", "Trend", "the direction of the last days"],
  ];
  return (
    <>
      <Head kicker="The lighthouse" title="The Pharos" sub="Pharos Stability Index" titleRef={titleRef} />
      <div className="hb-panel-body">
        {!p?.lit || p.score == null ? <p className="hb-why">The lantern is unlit: there is no stability reading. It never shows a calm default.</p> : (
          <>
            <div className="hb-big hb-num" style={{ marginTop: 6 }}>{p.score.toFixed(1)}<small><span className="hb-band" style={{ "--band": PSI_INK[p.band ?? ""] } as React.CSSProperties}>{titleCase(p.band ?? "")}</span></small></div>
            <p className="hb-why">The beam’s rhythm is the stability band{p.sweepSec ? `: one sweep every ${Math.round(lh?.period ?? p.sweepSec)} seconds` : ""}. Its reach follows the score.</p>
            <Sec title="Last 30 days">
              <Sparkline values={histScores} dates={histDates} label={`PSI over the last ${hist.length} days, now ${p.score.toFixed(1)}`} />
              <dl className="hb-dl" style={{ marginTop: 8 }}>
                <dt>24 h average</dt><dd>{p.avg24h != null ? p.avg24h.toFixed(1) : "—"}</dd>
                {hist.length > 1 && <><dt>30-day range</dt><dd>{Math.min(...histScores).toFixed(1)} – {Math.max(...histScores).toFixed(1)}</dd></>}
              </dl>
            </Sec>
            {cur?.components && (
              <Sec title="Components">
                <dl className="hb-dl">
                  {comps.map(([k, label, hint]) => cur.components?.[k] != null && (
                    <Fragment key={k}><dt>{label}<br /><em style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{hint}</em></dt><dd>{signed(cur.components[k])}</dd></Fragment>
                  ))}
                </dl>
              </Sec>
            )}
          </>
        )}
        {model && <Freshness label="Stability index" state={model.truth.stability.state} ageSec={model.truth.stability.ageSec} />}
      </div>
    </>
  );
}

function BoatList({ rows }: { rows: Array<{ id: string; label: ReactNode; value: ReactNode }> }) {
  const store = useStore();
  return (
    <ul className="hb-list">
      {rows.map((r) => (
        <li key={r.id}><button type="button" className="hb-row" onClick={() => store.select({ kind: "boat", id: r.id })}><span>{r.label}</span><span className="hb-num">{r.value}</span></button></li>
      ))}
    </ul>
  );
}

function ShoalsPanel({ model, titleRef }: P) {
  const s = model?.readings.shoals ?? [];
  const sea = model?.readings.seaState;
  const bySym = new Map(model?.boats.map((b) => [b.id, b]) ?? []);
  return (
    <>
      <Head kicker="The reef" title="The Shoals" sub={s.length ? `${s.length} ${s.length === 1 ? "boat" : "boats"} off peg` : "clear water"} titleRef={titleRef} />
      <div className="hb-panel-body">
        <p className="hb-why">Coins that lose their peg leave their circuit and anchor here, heeling on the reef, until the peg holds again.</p>
        {sea?.offPegShare != null && <p className="hb-caption">Sea state {sea.step ?? "—"} of 3: {share(sea.offPegShare)} of supply is off peg.</p>}
        <Sec title="Aground">
          {s.length ? <BoatList rows={s.map((x) => ({ id: x.id, label: <><b>{bySym.get(x.id)?.symbol ?? x.id}</b> <em>{money(x.supply)}</em></>, value: <span className="hb-down">{bps(x.bps)}</span> }))} />
            : <p className="hb-empty">No coin is off its peg.</p>}
        </Sec>
        {model && <Freshness label="Peg data" state={model.truth.pegSummary.state} ageSec={model.truth.pegSummary.ageSec} />}
      </div>
    </>
  );
}

function CustomsPanel({ model, titleRef }: P) {
  const f = model?.readings.flows;
  const mint = f?.hourly.reduce((s, h) => s + h.mintUsd, 0) ?? 0, burn = f?.hourly.reduce((s, h) => s + h.burnUsd, 0) ?? 0;
  return (
    <>
      <Head kicker="Landmark" title="Customs House" sub="the tide board of mint and burn" titleRef={titleRef} />
      <div className="hb-panel-body">
        {!f?.available ? <p className="hb-why">The tide board is dark: there is no flow reading.</p> : (
          <>
            <div className="hb-big hb-num" style={{ marginTop: 6 }}>{money(f.net24hUsd, { signed: true })}<small>net, 24 h</small></div>
            <p className="hb-why">Each painted bar on the board is one hour: blue above the line for supply minted, red below for supply burned.</p>
            <Sec title="Hourly net"><TideBars hourly={f.hourly} /></Sec>
            <Sec title="Totals">
              <dl className="hb-dl">
                <dt>Minted</dt><dd>{money(mint)}</dd>
                <dt>Burned</dt><dd>{money(burn)}</dd>
                {f.scope.length > 0 && <><dt>Chains read</dt><dd>{f.scope.length}</dd></>}
              </dl>
            </Sec>
          </>
        )}
        {model && <Freshness label="Flow data" state={model.truth.mintBurn.state} ageSec={model.truth.mintBurn.ageSec} />}
      </div>
    </>
  );
}

function StormPanel({ model, titleRef }: P) {
  const c = model?.readings.stormCones;
  const alerts = (model?.boats ?? []).filter((b) => b.state !== "wrecked" && (b.dews === "ALERT" || b.dews === "WARNING" || b.dews === "DANGER"))
    .sort((a, b) => (b.dewsScore ?? 0) - (a.dewsScore ?? 0));
  const w = model?.readings.weather;
  return (
    <>
      <Head kicker="Landmark" title="Storm-signal Mast" sub={!c ? "no stress reading" : c.count === 0 ? "no cones hoisted" : `${c.count} ${c.count === 1 ? "cone" : "cones"} hoisted`} titleRef={titleRef} />
      <div className="hb-panel-body">
        <p className="hb-why">One cone for each coin at early-warning Alert or worse, up to five{c && c.extra > 0 ? `; ${c.extra} more are not shown on the mast` : ""}. The weather over the bay is the same stress, weighted by supply.</p>
        {w?.band && <p className="hb-caption">Weather: {titleCase(w.band)}, over {share(w.coverage)} of supply.</p>}
        <Sec title="Alerts">
          {alerts.length ? <BoatList rows={alerts.map((b) => ({ id: b.id, label: <><b>{b.symbol}</b> <em>{money(b.supply)}</em></>, value: <span className="hb-band" style={{ "--band": DEWS_INK[b.dews!] } as React.CSSProperties}>{titleCase(b.dews!)} {Math.round(b.dewsScore ?? 0)}</span> }))} />
            : <p className="hb-empty">Calm. No coin is at Alert or worse.</p>}
        </Sec>
        {model && <Freshness label="Stress signals" state={model.truth.stress.state} ageSec={model.truth.stress.ageSec} />}
      </div>
    </>
  );
}

function WreckPanel({ model, titleRef }: P) {
  const wrecks = [...(model?.readings.wrecks ?? [])].reverse();
  return (
    <>
      <Head kicker="The cove" title="Wreck Cove" sub={`${wrecks.length} wrecks, newest first`} titleRef={titleRef} />
      <div className="hb-panel-body">
        <p className="hb-why">Stablecoins that died lie beached here as grey hulks, each with its epitaph.</p>
        <Sec title="The hulks">
          <ul className="hb-list">
            {wrecks.map((w) => (
              <li key={w.id}>
                <div className="hb-row"><span><b>{w.name}</b> <em>{w.symbol !== w.name ? w.symbol : ""}</em></span><span className="hb-wreck-meta">{wreckDate(w.deathDate)}</span></div>
                <span className="hb-epitaph">{epitaphOf(w.id) ? quoted(epitaphOf(w.id)!) : causeName(w.cause)}{w.peakMcap ? <span className="hb-wreck-meta"> · peak {money(w.peakMcap)}</span> : null}</span>
              </li>
            ))}
          </ul>
        </Sec>
      </div>
    </>
  );
}

function FarPortsPanel({ model, titleRef }: P) {
  const far = (model?.harbours ?? []).filter((h) => !h.piered);
  return (
    <>
      <Head kicker="Offshore" title="Far Ports" sub={`${far.length} chains without a pier`} titleRef={titleRef} />
      <div className="hb-panel-body">
        <p className="hb-why">Supply on chains too small for a pier of their own. Boats sail out here for the share of their supply these chains hold.</p>
        <Sec title="Chains">
          <ul className="hb-list">
            {far.slice(0, 40).map((h) => <li key={h.chain}><div className="hb-row"><span>{h.chain}</span><span className="hb-num">{money(h.supplyUsd)}</span></div></li>)}
          </ul>
          {far.length > 40 && <p className="hb-caption">and {far.length - 40} more in the ledger.</p>}
        </Sec>
      </div>
    </>
  );
}

function HarbourmasterPanel({ titleRef }: { titleRef: P["titleRef"] }) {
  const store = useStore();
  useUI();
  const s = (store.ctx.services.get("sim") as { stats: { underWay: number; docked: number; moored: number; anchored: number }; frozen: boolean } | undefined);
  return (
    <>
      <Head kicker="Landmark" title="Harbourmaster’s Office" sub="the day’s movements" titleRef={titleRef} />
      <div className="hb-panel-body">
        <p className="hb-why">{s?.frozen ? "The data is stale, so every boat finishes its leg and holds." : "Every boat follows a published four-hour circuit, so every visitor sees the same harbour."}</p>
        {s && (
          <Sec title="Right now">
            <dl className="hb-dl">
              <dt>Under way</dt><dd>{s.stats.underWay}</dd>
              <dt>Alongside</dt><dd>{s.stats.docked}</dd>
              <dt>On moorings</dt><dd>{s.stats.moored}</dd>
              <dt>At anchor</dt><dd>{s.stats.anchored}</dd>
            </dl>
          </Sec>
        )}
      </div>
    </>
  );
}

function HarbourPanel({ chain, model, titleRef }: { chain: string } & P) {
  const store = useStore();
  const h = model?.harbours.find((x) => x.chain === chain);
  const visitors = (model?.boats ?? []).map((b) => ({ b, usd: b.chainShares.find((c) => c.chain === chain)?.usd ?? 0 }))
    .filter((x) => x.usd > 0).sort((a, b) => b.usd - a.usd);
  const chainRow = ((raw(store, "chains")?.chains as Raw[] | undefined) ?? []).find((c) => c.name === chain);
  return (
    <>
      <Head kicker={h?.piered === false ? "Far port" : "Harbour"} title={chain} sub={h ? `${share(h.share)} of all stablecoin supply` : undefined}
        logo={<Logo src={chainLogo(chain)} label={chain} color="#1f5873" />} titleRef={titleRef} />
      <div className="hb-panel-body">
        {h && (
          <>
            <div className="hb-big hb-num" style={{ marginTop: 6 }}>{money(h.supplyUsd)}</div>
            <div className="hb-changes">
              <div><span className="hb-sc">24 h</span><b>{pctChange(chainRow?.change24hPct as number | undefined)}</b></div>
              <div><span className="hb-sc">7 d</span><b>{pctChange(chainRow?.change7dPct as number | undefined)}</b></div>
              <div><span className="hb-sc">30 d</span><b>{pctChange(chainRow?.change30dPct as number | undefined)}</b></div>
            </div>
            <p className="hb-why">{h.visitors} {h.visitors === 1 ? "boat calls" : "boats call"} here. A pier’s length and its berths follow the supply it holds.</p>
            <Sec title="Largest callers">
              <BoatList rows={visitors.slice(0, 10).map(({ b, usd }) => ({ id: b.id, label: <><b>{b.symbol}</b> <em>{share(usd / h.supplyUsd)}</em></>, value: money(usd) }))} />
            </Sec>
            {h.healthScore != null && <Sec title="Chain health"><dl className="hb-dl"><dt>Health score</dt><dd>{Math.round(h.healthScore)}</dd></dl></Sec>}
          </>
        )}
        {model && <Freshness label="Chain data" state={model.truth.chains.state} ageSec={model.truth.chains.ageSec} />}
      </div>
    </>
  );
}
