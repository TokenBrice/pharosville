import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { CAUSE_META } from "@shared/lib/cause-of-death";
import { deadRecords, FAMILIES, FAMILY_ORDER, type CauseFamily } from "../model/obituary";
import { anniversaryToday, worldToday } from "../model/anniversary";
import type { Boat, EndpointKey, HarbourModel } from "../model/types";
import { ChainSplit, chainLogo, Crest, DEWS_INK, FlowBars, Freshness, Logo, PSI_INK, Sparkline, TideBars } from "./bits";
import { ANNIVERSARY_RULE, FLOW_RULE, HULL_RULE, LETTERING_RULE, OFFICE_RULE, SAIL_RULE, SEA_RULE, TIDE_RULE, WREATH_RULE, WRECK_RULE, alertCountLine, allocationLine, BOAT_SIGNALS_RULE, circuitStops, FAR_PORTS_LINE, flowTotals, MAIDEN_LINE, REEF_FLARE_LINE, obituaryText, officeLine, quoted, SOUND_FLOW, SOUND_PHAROS, SOUND_SURF, STATION_RULE, stationFact, stormSignalLine, whereLine, whyHere, wreckDate } from "./facts";
import { bps, causeName, MINUS, money, pctChange, pegName, share, titleCase, vesselKind } from "./format";
import { observedEmpty, qualificationCopy, readingCoverage, readingSentence, READING_NAMES, sourceTruth } from "./source-state";
import { presentationCopy, usePresentation } from "./presentation";
import { psiObservations, psiChange, psiRange, type PsiObservation } from "./charts";
import { truthCopy } from "./truth-copy";
import { useFeedHealth } from "./feed-health";
import { coinNet, coverageLine, CUSTOMS_BARS, flowValued, flowWindow, grossFlow, NET_UNAVAILABLE, VALUATION_UNKNOWN, type CoinFlow } from "./flow-copy";
import { gradeTally } from "../civic/yard";
import { hasFlowDay } from "../civic/flows";
import { CHAIN_COLOR, placeName, scopeName } from "./places";
import { expectedLabel, groupYard, launchedFromYard, PHASE_NAME, PHASES, STAGE_NAME, STAGE_OF, UPCOMING_URL, yardCoins, YARD_EXPLANATION, type YardCoin } from "./yard";

/** The hull each phase stands for, in one word (the build line's second row). */
const STAGE_WORD = { keel: "keel", ribs: "frames", planked: "planks", painted: "paint", rigged: "rigging" } as const;

const signed = (v: number) => (v < 0 ? MINUS : "") + Math.abs(v).toFixed(2);
import { stormTrend } from "../weather/director";
import { usePresence, useStore, useSticky, useUI, useUISlice } from "./hooks";
import { getFeed, getLighthouse, type PickHit } from "./services";
import type { HarbourUIStore } from "./store";
import { DEV_OVERRIDE_KEYS, TIDE_SLACK_PCT } from "../readings/bind";
import { DayBook } from "./DayBook";
import { DecorativeCalendar } from "./DecorativeCalendar";
import { usePanelSpace } from "./panel-space";
import { guideStopFor } from "./Guide";
import { CoinReadings } from "./coin-readings/CoinReadings";
import { HarbourReports } from "./harbour-report/HarbourReports";
import { PanelActions, PanelOutbound } from "./panel-actions/PanelActions";

type Raw = Record<string, unknown>;
const raw = (store: HarbourUIStore, key: string): Raw | null => {
  const feed = getFeed(store.ctx);
  return ((feed?.payloads as Record<string, { data?: unknown } | undefined> | undefined)?.[key]?.data as Raw | undefined) ?? null;
};
const sumBuckets = (o: unknown) => (o && typeof o === "object" ? Object.values(o as Record<string, unknown>).reduce<number>((s, v) => s + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0) : 0);

/** Dev only: URL reading overrides bend the world, not the payloads this panel reads, so say so. */
function DevOverrideNote({ store }: { store: HarbourUIStore }) {
  if (!store.ctx.services.get("readings")?.overridden) return null;
  const q = new URLSearchParams(location.search);
  const keys = DEV_OVERRIDE_KEYS.filter((k) => q.has(k)).map((k) => `${k}=${q.get(k)}`).join(" ");
  return <p className="hb-caption hb-dev-override" role="note">Dev override ({keys}): the world shows forced readings; the figures below are the live data.</p>;
}

export function SidePanel({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const selected = useUISlice((s) => s.selected);
  const [mounted, shown] = usePresence(selected != null, 220);
  const hit = useSticky(selected);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const panel = usePanelSpace("panel", mounted && selected != null);
  const origin = useUISlice((s) => s.ledgerOrigin);
  const guideStop = hit ? guideStopFor(hit) : null;
  const key = hit ? `${hit.kind}:${hit.id}` : "";
  useEffect(() => { if (selected && mounted) titleRef.current?.focus({ preventScroll: true }); }, [key, selected, mounted]);
  if (!mounted || !hit) return null;
  return (
    <aside ref={panel} inert={selected == null} className="hb-panel hb-paper hb-neat hb-fade" data-shown={shown && selected != null} aria-labelledby="hb-panel-title" role="complementary">
      <PanelActions />
      <button type="button" className="hb-close" aria-label="Close panel (Esc)" onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      </button>
      <DevOverrideNote store={store} />
      {origin && <button type="button" className="hb-return hb-textbtn" onClick={() => store.returnToLedger()}>Return to ledger</button>}
      <div className="hb-panel-record">
        <PanelContent hit={hit} titleRef={titleRef} key={key} />
        <PanelOutbound />
        {guideStop != null && <button type="button" className="hb-textbtn hb-how" onClick={() => store.startGuide(guideStop)}>How to read this</button>}
        <PanelSources hit={hit} />
      </div>
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
          <h2 id="hb-panel-title" className="hb-title" data-long={title.length > 10 ? (title.length > 13 ? "2" : "1") : undefined} tabIndex={-1} ref={titleRef}>{title}</h2>
          {sub && <div className="hb-sub">{sub}</div>}
        </div>
      </div>
    </header>
  );
}

function Scenery({ children }: { children: ReactNode }) {
  return <details className="hb-scenery hb-sec"><summary>How this appears in the harbour</summary>{children}</details>;
}

function PanelSources({ hit }: { hit: PickHit }) {
  const store = useStore();
  const sources: EndpointKey[] = hit.kind === "boat" && store.boat?.(hit.id)?.state === "wrecked" ? [] : hit.kind === "boat" ? ["stablecoins", "pegSummary", "stress", "safetyGrades", "mintBurn"]
    : hit.kind === "harbour" ? ["stablecoins", "chains"]
      : hit.id === "pharos" || hit.id === "chartroom" ? ["stability"]
        : hit.id === "shoals" ? ["stablecoins", "pegSummary"] : hit.id === "storm-mast" ? ["stablecoins", "stress"]
          : hit.id === "mint" || hit.id === "burn" || hit.id === "customs-house" || hit.id === "tide-board" ? ["mintBurn"]
            : hit.id === "tide-gauge" ? ["chains"] : hit.id === "registry" ? ["stablecoins", "safetyGrades"] : [];
  if (!sources.length) return null;
  return <details className="hb-sources"><summary>Sources</summary>{sources.map((source) => <p key={source}><button type="button" className="hb-textbtn" onClick={() => store.select({ kind: "landmark", id: "keeperslog" }, { fly: false })}>{READING_NAMES[source]} · source state and observation time</button></p>)}</details>;
}

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return <section className="hb-sec"><h3 className="hb-sec-h hb-sc">{title}</h3>{children}</section>;
}

function PanelContent({ hit, titleRef }: { hit: PickHit; titleRef: React.RefObject<HTMLHeadingElement | null> }) {
  const store = useStore();
  const { model } = useUI();
  if (hit.kind === "boat") {
    const b = model?.boats.find((x) => x.id === hit.id);
    if (b?.state === "wrecked" && deadRecords().has(b.id)) return <ObituaryPanel id={b.id} titleRef={titleRef} />;
    return b ? <BoatPanel b={b} titleRef={titleRef} /> : <Head kicker="Vessel" title={hit.id} sub="no longer on the register" titleRef={titleRef} />;
  }
  if (hit.kind === "wreck") return <ObituaryPanel id={hit.id} titleRef={titleRef} />;
  if (hit.kind === "harbour") return <HarbourPanel chain={hit.id} model={model} titleRef={titleRef} />;
  if (hit.kind === "yard") return <YardCoinPanel id={hit.id} titleRef={titleRef} />;
  const L = store.ctx.services.get("layout");
  const name = placeName(L ?? null, hit.id);
  switch (hit.id) {
    case "pharos": return <PharosPanel model={model} titleRef={titleRef} />;
    case "shoals": return <ShoalsPanel model={model} titleRef={titleRef} />;
    case "customs-house": case "tide-board": return <CustomsPanel model={model} titleRef={titleRef} />;
    case "mint": return <FlowPanel side="mint" model={model} titleRef={titleRef} />;
    case "burn": return <FlowPanel side="burn" model={model} titleRef={titleRef} />;
    case "slipway": return <ShipyardPanel titleRef={titleRef} />;
    case "storm-mast": return <StormPanel model={model} titleRef={titleRef} />;
    case "wreck-cove": return <WreckPanel model={model} titleRef={titleRef} />;
    case "far-ports": return <FarPortsPanel model={model} titleRef={titleRef} />;
    case "the-roads": return <RoadsPanel titleRef={titleRef} />;
    case "harbourmaster": return <HarbourmasterPanel titleRef={titleRef} />;
    case "tide-gauge": return <TidePanel model={model} titleRef={titleRef} />;
    case "chartroom": return <ChartRoomPanel model={model} titleRef={titleRef} />;
    case "keeperslog": return <KeepersLogPanel model={model} titleRef={titleRef} />;
    case "registry": return <RegistryPanel model={model} titleRef={titleRef} />;
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
  const mint = ((raw(store, "mintBurn")?.coins as Array<CoinFlow & { stablecoinId: string }> | undefined) ?? []).find((c) => c.stablecoinId === b.id) ?? null;
  const flowCoverage = coverageLine(mint?.coverage);
  const flowAvailable = mint && flowCoverage !== "Flow reading unavailable.";
  const flowAt = getFeed(store.ctx)?.payloads.mintBurn?.meta?.updatedAt ?? null;
  const net24 = mint ? coinNet(mint, 1, flowAt) : null;
  const net7 = mint ? coinNet(mint, 7, flowAt) : null;
  const model = store.getSnapshot().model;
  const sub = `${b.name} · ${vesselKind(b.rig, b.hullClass)}`;
  const ch = (v: number | null) => <b className={v == null ? "" : v > 0.0005 ? "hb-up" : v < -0.0005 ? "hb-down" : ""}>{v == null ? "Comparison unavailable." : pctChange(v)}</b>;
  const signal = stormSignalLine(b, store.getSnapshot().model?.truth.stress.state === "current");
  const pegReading = (
    <Sec title="Peg">
      <Freshness model={model} source="pegSummary" />
      <dl className="hb-dl">
        <dt>Pegged to</dt><dd>{pegName(b.pegType)}</dd>
        <dt>Deviation</dt><dd className={b.activeDepeg ? "hb-down" : ""}>{b.nullPeg ? <em>{truthCopy({ kind: "absent-row", reading: "peg" })}</em> : bps(b.pegDeviationBps)}{b.activeDepeg ? " · off peg" : ""}</dd>
        {ref?.valueUsd != null && <><dt>Reference</dt><dd>${ref.valueUsd < 10 ? ref.valueUsd.toFixed(4) : ref.valueUsd.toFixed(2)} <em>{ref.source === "median" && ref.contributorCount ? `median of ${ref.contributorCount}` : ref.source ?? ""}</em></dd></>}
        {typeof peg?.pegScore === "number" && <><dt>Peg score</dt><dd>{peg.pegScore}<em> / 100</em></dd></>}
      </dl>
    </Sec>
  );
  return (
    <>
      <Head kicker="Vessel" title={b.symbol} sub={sub} logo={<Logo src={b.logo} label={b.symbol} color={b.brandColor} />} titleRef={titleRef} />
      <div className="hb-panel-body">
        {b.activeDepeg && pegReading}
        <Sec title="Supply (USD)">
          <Freshness model={model} source="stablecoins" />
          <div className="hb-big hb-num">{money(b.supply)}</div>
          <div className="hb-changes">
            <div><span className="hb-sc">24 h</span>{ch(prev("circulatingPrevDay"))}</div>
            <div><span className="hb-sc">7 d</span>{ch(prev("circulatingPrevWeek"))}</div>
            <div><span className="hb-sc">30 d</span>{ch(prev("circulatingPrevMonth"))}</div>
          </div>
          {b.maiden && <p className="hb-caption">Maiden voyage: {MAIDEN_LINE}, with no supply on record a week or a month ago.</p>}
        </Sec>

        {!b.activeDepeg && pegReading}
        <Sec title="Supply by chain">
          <ChainSplit boat={b} />
        </Sec>

        <Sec title="Signals">
          <Freshness model={model} source="stress" />
          <Freshness model={model} source="safetyGrades" />
          <dl className="hb-dl">
            <dt>Early warning</dt>
            <dd>{b.dews ? <span className="hb-band" style={{ "--band": DEWS_INK[b.dews] } as React.CSSProperties}>{titleCase(b.dews)}{b.dewsScore != null ? <em>&nbsp;{Math.round(b.dewsScore)}</em> : null}</span> : <em>{truthCopy({ kind: "absent-row", reading: "stress" })}</em>}</dd>
            <dt>Safety grade</dt><dd>{sourceTruth(model, "safetyGrades").state === "current" ? <span>{truthCopy({ kind: "grade", grade: b.grade, truth: sourceTruth(model, "safetyGrades") })}</span> : b.grade && <em>Last received grade: {b.grade}.</em>}</dd>
            {signal && <><dt>Storm signal</dt><dd>{signal}</dd></>}
          </dl>
        </Sec>

        <Sec title="Mint & burn">
          <Freshness model={model} source="mintBurn" />
          {mint ? <>
            {flowCoverage && <p className="hb-caption">{flowCoverage}</p>}
            {flowAvailable && <>
              <dl className="hb-dl">
                <dt>Net, {flowCoverage ? "partial history" : "24 h"}</dt><dd className={net24 == null ? "" : net24 > 0 ? "hb-up" : net24 < 0 ? "hb-down" : ""}>{money(net24, { signed: true })}</dd>
                <dt>Minted</dt><dd>{grossFlow(mint.mintVolume24hUsd, "mint", mint.valuation?.window24h.mintCompleteness === "complete")}</dd>
                <dt>Burned</dt><dd>{grossFlow(mint.burnVolume24hUsd, "burn", mint.valuation?.window24h.burnCompleteness === "complete")}</dd>
                <dt>Net, 7 d{net7 == null ? " · incomplete or unavailable" : ""}</dt><dd>{money(net7, { signed: true })}</dd>
              </dl>
              {mint.valuation?.window24h.completeness === "partial" || mint.valuation?.netFlow7d === "partial" ? <p className="hb-caption">{NET_UNAVAILABLE}</p> : null}
              {(!mint.valuation || mint.valuation.window24h.completeness === "unknown" || mint.valuation.netFlow7d === "unknown") && <p className="hb-caption">{VALUATION_UNKNOWN}</p>}
              {flowAt == null || mint.coverage?.historyStartAt == null || mint.coverage.historyStartAt > flowAt - 7 * 86400 ? <p className="hb-caption">Partial history</p> : null}
            </>}
          </> : <p className="hb-empty">No flow reading is available for this coin.</p>}
        </Sec>
        <CoinReadings id={b.id} model={model} />
        <Scenery>
        {whereLine(b, w) && <div className="hb-where">{titleCase(whereLine(b, w).charAt(0)) + whereLine(b, w).slice(1)}</div>}
        <FollowToggle id={b.id} underWay={w.kind === "sailing" || w.kind === "casting-off" || w.kind === "outing"} />
        <p className="hb-why">{whyHere(b, w)}</p>

        {b.state !== "wrecked" && <CircuitSec b={b} />}

          <p className="hb-caption">{HULL_RULE} {SAIL_RULE}</p>
        </Scenery>
      </div>
    </>
  );
}

/** Follow her (F): a quiet toggle while she is under way; hidden under reduced motion (the world is still). */
function FollowToggle({ id, underWay }: { id: string; underWay: boolean }) {
  const store = useStore();
  const following = useUISlice((s) => s.follow) === id;
  const reduced = useUISlice((s) => s.reducedMotion);
  if (reduced || (!underWay && !following)) return null;
  return (
    <button type="button" className="hb-follow" aria-pressed={following} onClick={() => store.setFollow(following ? null : id)}>
      <kbd>F</kbd>{following ? "following" : "follow her"}
    </button>
  );
}

/** The stops the boat actually calls at (the prose names the same ones), each a way into that harbour. */
function CircuitSec({ b }: { b: Boat }) {
  const store = useStore();
  const stops = circuitStops(b);
  const single = stops.length <= 1;
  return (
    <Sec title={single ? "Berth" : `Circuit · ${stops.length} stops`}>
      <ul className="hb-list hb-stops">
        {stops.map((s) => (
          <li key={s.name}>
            <button type="button" className="hb-row" onClick={() => store.select(s.chain ? { kind: "harbour", id: s.chain } : { kind: "landmark", id: "far-ports" })}>
              <span><b>{s.chain ?? "Far Ports"}</b>{s.folded.length > 0 && <em>{s.folded.slice(0, 2).join(", ")}{s.folded.length > 2 ? ` + ${s.folded.length - 2} more` : ""}</em>}</span>
              <span className="hb-num">{single ? "home berth" : share(s.supplyShare)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="hb-caption">
        {single ? "Its supply sits at this one harbour, so it swings at its home mooring." : "Docks at each stop for a time in proportion to its supply there. Sailing is not a bridge transfer."}
        {stops.some((s) => s.folded.length > 0) ? " Chains without a pier, or under 5 % of its supply, fold into the Far Ports." : ""}
      </p>
      {!single && <p className="hb-caption hb-route-note">The dashed line on the water is her route: today’s rounds (from supply share).</p>}
    </Sec>
  );
}

// ------------------------------------------------------------------ landmarks

type P = { model: HarbourModel | null; titleRef: React.RefObject<HTMLHeadingElement | null> };

function PharosPanel({ model, titleRef }: P) {
  const store = useStore();
  const p = model?.readings.psi;
  const stab = raw(store, "stability");
  const cur = stab?.current as { components?: Record<string, number> } | undefined;
  const hist = psiObservations((stab?.history as PsiObservation[] | undefined) ?? []);
  const lh = getLighthouse(store.ctx);
  return (
    <>
      <Head kicker="The beacon" title="The Pharos" sub="Pharos Stability Index" titleRef={titleRef} />
      <div className="hb-panel-body">
        <Freshness model={model} source="stability" />
        {qualificationCopy(getFeed(store.ctx)?.payloads) && <p className="hb-caption">{qualificationCopy(getFeed(store.ctx)?.payloads)}</p>}
        {p?.score == null ? <p className="hb-why">{readingSentence(model, "stability")}</p> : (
          <>
            <div className="hb-big hb-num">{p.score.toFixed(1)}<small><span className="hb-band" style={{ "--band": PSI_INK[p.band ?? ""] } as React.CSSProperties}>{titleCase(p.band ?? "")}</span></small></div>

            <Sec title="PSI observations">
              <Sparkline observations={hist} now={sourceTruth(model, "stability").state === "current" ? p.score : null} nowAt={p?.computedAt ?? null} />
              <dl className="hb-dl" style={{ marginTop: 8 }}>
                <dt>24 h average</dt><dd>{p.avg24h != null ? p.avg24h.toFixed(1) : "Average unavailable."}</dd>
                {hist.length > 1 && <><dt>Observation range</dt><dd>{psiRange(hist)}</dd><dt>Change over the period</dt><dd>{psiChange(hist)}</dd></>}
              </dl>
            </Sec>
            {cur?.components && <PsiComponents c={cur.components} score={p.score} />}
          </>
        )}
        <p className="hb-caption">{SOUND_PHAROS}</p>
        <Scenery>
            <p className="hb-why">{p?.lit ? <>A fire burns in the lantern and a bronze mirror throws it out to sea. The beam’s rhythm is the stability band{p?.sweepSec ? `: one sweep every ${Math.round(lh?.period ?? p.sweepSec)} seconds` : ""}; its reach follows the score.</> : model?.truth.stability.state === "stale" ? "The beacon is unlit while its reading is stale." : "The beacon is unlit while its current reading is unavailable."}</p>
        </Scenery>
      </div>
    </>
  );
}

/**
 * The score is 100 less what each component costs (the trend can add points back). Each row is drawn
 * as the points it moves the score, on one shared scale, so the biggest drag reads at a glance.
 */
function PsiComponents({ c, score }: { c: Record<string, number>; score: number }) {
  const rows: Array<{ key: string; label: string; hint: string; pts: number }> = [
    { key: "severity", label: "Severity", hint: "how far off peg stressed coins trade", pts: -(c.severity ?? 0) },
    { key: "breadth", label: "Breadth", hint: "how much supply is off peg", pts: -(c.breadth ?? 0) },
    { key: "stressBreadth", label: "Stress breadth", hint: "supply under early warning", pts: -(c.stressBreadth ?? 0) },
    { key: "trend", label: "Trend", hint: "the drift of recent days", pts: c.trend ?? 0 },
  ].filter((r) => c[r.key] != null && Number.isFinite(c[r.key]));
  const scale = Math.max(5, ...rows.map((r) => Math.abs(r.pts)));
  return (
    <Sec title="Points off 100">
      <ul className="hb-pts">
        {rows.map((r) => (
          <li key={r.key}>
            <span className="hb-pts-label">{r.label}<em>{r.hint}</em></span>
            <span className="hb-pts-bar" aria-hidden="true"><i data-sign={r.pts < 0 ? "down" : "up"} style={{ width: `${Math.max(Math.abs(r.pts) > 0.004 ? 2 : 0, (Math.abs(r.pts) / scale) * 100).toFixed(1)}%` }} /></span>
            <span className={`hb-num hb-pts-v${r.pts < -0.004 ? " hb-down" : r.pts > 0.004 ? " hb-up" : ""}`}>{Math.abs(r.pts) < 0.005 ? "0.00" : signed(r.pts).replace(/^(?!−)/, "+")}</span>
          </li>
        ))}
      </ul>
      <p className="hb-caption">100 {rows.map((r) => `${r.pts < 0 ? MINUS : "+"} ${Math.abs(r.pts).toFixed(2)}`).join(" ")} = {score.toFixed(1)}. Red costs points; green adds them back.</p>
    </Sec>
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
  const coverage = readingCoverage(model, "pegSummary") ?? 0;
  const current = model?.truth.pegSummary.state === "current" && model.truth.stablecoins.state === "current" && coverage > 0;
  return (
    <>
      <Head kicker="Sea zone · the reef" title="The Shoals" sub={!current ? "Peg readings unavailable" : s.length ? `${s.length} ${s.length === 1 ? "boat" : "boats"} observed off peg` : "No observed depegs"} titleRef={titleRef} />
      <div className="hb-panel-body">
        <Freshness model={model} source="pegSummary" />
        <Freshness model={model} source="stablecoins" />
        {!current && s.length > 0 && <p className="hb-caption">Positions are last observed; current peg readings are unavailable.</p>}

        {coverage > 0 && sea?.offPegShare != null && <p className="hb-caption">{coverage < 1 ? `At least ${Math.floor(sea.offPegShare * 10_000) / 100}% of tracked supply is observed off peg.` : `${share(sea.offPegShare)} of tracked supply is observed off peg.`}</p>}
        <Sec title="Aground">
          {s.length ? <BoatList rows={s.map((x) => ({ id: x.id, label: <><b>{bySym.get(x.id)?.symbol ?? x.id}</b> <em>{money(x.supply)}</em></>, value: <span className="hb-down">{bps(x.bps)}</span> }))} />
            : <p className="hb-empty">{observedEmpty(model, "shoals")}</p>}
        </Sec>
        <Scenery>
        <p className="hb-why">Coins that lose their peg leave their circuit and anchor here, heeling on the reef, until the peg holds again.</p>
        <p className="hb-caption">Know it by the surf breaking on the reef, the red-and-white hazard buoys and the reef beacon.</p>
        <p className="hb-caption">{SAIL_RULE}</p>
        <p className="hb-caption">{SEA_RULE} {readingSentence(model, "pegSummary")}</p>
        <p className="hb-caption">{REEF_FLARE_LINE}</p>
        <p className="hb-caption">{SOUND_SURF}</p>
        </Scenery>
      </div>
    </>
  );
}

function CustomsPanel({ model, titleRef }: P) {
  const f = model?.readings.flows;
  const mint = f?.hourly.reduce((s, h) => s + h.mintUsd, 0) ?? 0, burn = f?.hourly.reduce((s, h) => s + h.burnUsd, 0) ?? 0;
  return (
    <>
      <Head kicker="The flows quarter" title="Customs House" sub="the ledger of mint and burn" titleRef={titleRef} />
      <div className="hb-panel-body">
        <Freshness model={model} source="mintBurn" />
        {!f?.available || !f.hourly.length ? <p className="hb-why">The books are closed: there is no flow reading.</p> : (
          <>
            <div className="hb-big hb-num">{money(flowTotals(model)?.net, { signed: true })}<small>net · {flowWindow(f.hourly)}</small></div>

            {!flowValued(f.hourly) && <p className="hb-caption">{f.hourly.some((h) => h.netUsd == null) ? NET_UNAVAILABLE : VALUATION_UNKNOWN}</p>}
            <Sec title="Hourly net"><TideBars hourly={f.hourly} /></Sec>
            <Sec title="Totals">
              <dl className="hb-dl">
                <dt>Minted</dt><dd>{grossFlow(mint, "mint", flowValued(f.hourly))}</dd>
                <dt>Burned</dt><dd>{grossFlow(burn, "burn", flowValued(f.hourly))}</dd>
                {f.scope.length > 0 && <><dt>Chains read</dt><dd>{f.scope.map(scopeName).join(" · ")}</dd></>}
              </dl>
            </Sec>
            {!f.scope.length && <p className="hb-caption">Flow scope is unavailable.</p>}
            <FlowLinks />
          </>
        )}
        <Scenery>
            <p className="hb-why">The Customs House keeps the reported books of the Mint beside it and the Burn across the mouth. {CUSTOMS_BARS}</p>
        </Scenery>
      </div>
    </>
  );
}

function StormPanel({ model, titleRef }: P) {
  const store = useStore();
  useUI(); // re-render on tick: the front crosses in about a minute
  const wx = store.ctx.services.get("weather");
  const trend = stormTrend(wx?.state.front ?? null);
  const recovered = wx?.recoveryLine ?? null;
  const alerts = (model?.boats ?? []).filter((b) => b.state !== "wrecked" && (b.dews === "ALERT" || b.dews === "WARNING" || b.dews === "DANGER"))
    .sort((a, b) => (b.dewsScore ?? 0) - (a.dewsScore ?? 0));
  const w = model?.readings.weather;
  return (
    <>
      <Head kicker="Landmark" title="Storm-signal Station" sub={stationFact(model)} titleRef={titleRef} />
      <div className="hb-panel-body">
        <Freshness model={model} source="stress" />
        <Freshness model={model} source="stablecoins" />

        {w?.band && <p className="hb-caption">{model?.truth.stress.state === "current" && model.truth.stablecoins.state === "current" ? "Weather" : "Last received weather"}: {titleCase(w.band)}, over {share(w.coverage)} of supply.{trend ? ` ${trend.text.charAt(0).toUpperCase()}${trend.text.slice(1)}.` : ""}{recovered ? ` ${recovered}.` : ""}</p>}
        <p className="hb-caption">{alertCountLine(model)}</p>
        <Sec title="Alerts">
          {alerts.length ? <BoatList rows={alerts.map((b) => ({ id: b.id, label: <><b>{b.symbol}</b> <em>{money(b.supply)}</em></>, value: <span className="hb-band" style={{ "--band": DEWS_INK[b.dews!] } as React.CSSProperties}>{titleCase(b.dews!)} {Math.round(b.dewsScore ?? 0)}</span> }))} />
            : <p className="hb-empty">{observedEmpty(model, "alerts")}</p>}
        </Sec>
        <Scenery>
        <p className="hb-why">{STATION_RULE}</p>
        <p className="hb-caption">{BOAT_SIGNALS_RULE}</p>
        </Scenery>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Wreck Cove: the register of the dead

type CoveSort = "newest" | "oldest" | "peak" | "name";
const COVE_SORTS: Array<[CoveSort, string]> = [["newest", "Newest"], ["oldest", "Oldest"], ["peak", "Peak cap"], ["name", "A–Z"]];
/** The list's sort and filter outlive the panel (an obituary and back finds the list as it was left). */
const coveView: { sort: CoveSort; family: CauseFamily | null } = { sort: "newest", family: null };

/** A dead coin's hit: its wreck in the cove, or the payload hull lying wrecked (the sim beaches those). */
export function wreckHit(store: HarbourUIStore, id: string): PickHit {
  return store.boat(id)?.state === "wrecked" ? { kind: "boat", id } : { kind: "wreck", id };
}

function WreckPanel({ model, titleRef }: P) {
  const store = useStore();
  const [sort, setSort] = useState<CoveSort>(coveView.sort);
  const [family, setFamily] = useState<CauseFamily | null>(coveView.family);
  useEffect(() => { coveView.sort = sort; coveView.family = family; }, [sort, family]);
  const recs = deadRecords();
  const all = (model?.readings.wrecks ?? []).map((w) => ({ w, r: recs.get(w.id) ?? null }));
  const counts = new Map<CauseFamily, number>();
  for (const { w } of all) counts.set(w.family, (counts.get(w.family) ?? 0) + 1);
  const rows = all.filter(({ w }) => !family || w.family === family).sort((a, b) =>
    sort === "peak" ? (b.w.peakMcap ?? -1) - (a.w.peakMcap ?? -1)
      : sort === "name" ? a.w.symbol.localeCompare(b.w.symbol, "en", { sensitivity: "base" })
        : sort === "oldest" ? a.w.deathDate.localeCompare(b.w.deathDate) : b.w.deathDate.localeCompare(a.w.deathDate));
  const fam = family ? FAMILIES[family] : null;
  return (
    <>
      <Head kicker="Sea zone · the cove" title="Wreck Cove" sub={`${all.length} wrecks, one for every stablecoin that died`} titleRef={titleRef} />
      <div className="hb-panel-body">

        {all.filter(({ w }) => anniversaryToday(w.deathDate, worldToday())).map(({ w }) => <p key={w.id} className="hb-caption">{w.symbol} died on this day in {w.deathDate.slice(0, 4)}: anniversary today.</p>)}
        <Sec title="How they died">
          <div className="hb-chips" role="group" aria-label="Show one cause of death">
            {FAMILY_ORDER.filter((f) => counts.get(f)).map((f) => (
              <button key={f} type="button" className="hb-chip" aria-pressed={family === f} onClick={() => setFamily(family === f ? null : f)}>
                <i style={{ background: FAMILIES[f].ink }} aria-hidden="true" />{FAMILIES[f].name}<b className="hb-num">{counts.get(f)}</b>
              </button>
            ))}
          </div>
          <p className="hb-caption">{fam ? <>{fam.name}: each lies {fam.form}. <button type="button" className="hb-textbtn" onClick={() => setFamily(null)}>Show all</button></> : FAMILY_ORDER.map((f) => `${FAMILIES[f].name}: ${FAMILIES[f].form}.`).join(" ")}</p>
        </Sec>
        <p className="hb-caption">{WRECK_RULE} {WREATH_RULE} {ANNIVERSARY_RULE}</p>
        <Sec title={`The wrecks · ${rows.length}`}>
          <div className="hb-sorts" role="group" aria-label="Sort the wrecks">
            {COVE_SORTS.map(([k, label]) => <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}>{label}</button>)}
          </div>
          <ul className="hb-list hb-wrecks">
            {rows.map(({ w, r }) => (
              <li key={w.id}>
                <button type="button" className="hb-row" onClick={() => store.select(wreckHit(store, w.id))}>
                  <span className="hb-wreck-name"><Logo src={r?.logo ?? null} label={w.symbol} color="var(--fill-wreck)" size={20} /><b>{w.symbol}</b><em>{w.name !== w.symbol ? w.name : ""}</em></span>
                  <span className="hb-num">{sort === "peak" ? money(w.peakMcap) : wreckDate(w.deathDate)}</span>
                  <span className="hb-wreck-line">{family && r?.epitaph ? <span className="hb-wreck-epitaph">{quoted(r.epitaph)}</span>
                    : <span className="hb-band" style={{ "--band": FAMILIES[w.family].ink } as React.CSSProperties}>{FAMILIES[w.family].name}</span>}
                    <span className="hb-wreck-meta">{sort === "peak" ? wreckDate(w.deathDate) : w.peakMcap ? `peak ${money(w.peakMcap)}` : "peak not recorded"}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </Sec>
        <p className="hb-caption" style={{ marginTop: 14 }}><a className="hb-out" href="https://pharos.watch/cemetery/" target="_blank" rel="noopener noreferrer">The full cemetery on pharos.watch<span aria-hidden="true"> ↗</span><span className="hb-sr"> (opens in a new tab)</span></a></p>
        <Scenery>
        <p className="hb-why">Each wreck is one dead coin. Its size is the peak market cap it reached; its form tells how it died. The twenty largest have their posts on the memorial above the tide line, lit at dusk.</p>
        </Scenery>
      </div>
    </>
  );
}

/** One dead coin's obituary, in the chart-paper voice: its lived dates, peak, cause, epitaph, story and sources. */
function ObituaryPanel({ id, titleRef }: { id: string; titleRef: P["titleRef"] }) {
  const store = useStore();
  const r = deadRecords().get(id);
  if (!r) return <Head kicker="In memoriam" title={id} sub="not in the register of the dead" titleRef={titleRef} />;
  const fam = FAMILIES[r.family];
  const filed = (CAUSE_META as Record<string, { label: string } | undefined>)[r.cause]?.label ?? causeName(r.cause);
  return (
    <>
      <Head kicker="In memoriam · Wreck Cove" title={r.symbol} sub={r.name !== r.symbol ? r.name : `a ${pegName(r.pegCurrency)} stablecoin`}
        logo={<Logo src={r.logo} label={r.symbol} color="var(--fill-wreck)" />} titleRef={titleRef} />
      <div className="hb-panel-body">
        {r.epitaph && <p className="hb-obit-epitaph">{quoted(r.epitaph)}</p>}
        <div className="hb-where">Lies in Wreck Cove, {fam.form}</div>
        <dl className="hb-dl hb-obit-dl" style={{ marginTop: 12 }}>
          <dt>Lived</dt><dd>{r.born ? <>{r.born} – {wreckDate(r.deathDate)}</> : <>† {wreckDate(r.deathDate)}<em> · launch not recorded</em></>}</dd>
          <dt>Peak market cap</dt><dd>{r.peakMcap ? money(r.peakMcap) : <em>not recorded</em>}</dd>
          <dt>Cause of death</dt><dd><span className="hb-band" style={{ "--band": fam.ink } as React.CSSProperties}>{fam.name}</span>{filed.toLowerCase() !== fam.name.toLowerCase() ? <em> · filed as {filed.toLowerCase()}</em> : null}</dd>
          <dt>Pegged to</dt><dd>{pegName(r.pegCurrency)}</dd>
        </dl>
        <Sec title="Obituary"><p className="hb-obit">{obituaryText(r.obituary)}</p></Sec>
        {r.sourceUrl && (
          <Sec title="Sources">
            <p className="hb-obit-src"><a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">{r.sourceLabel ?? new URL(r.sourceUrl).hostname}<span aria-hidden="true"> ↗</span><span className="hb-sr"> (source, opens in a new tab)</span></a></p>
          </Sec>
        )}
        <p className="hb-caption" style={{ marginTop: 16 }}><a className="hb-out" href={r.pharosUrl} target="_blank" rel="noopener noreferrer">Its grave on pharos.watch<span aria-hidden="true"> ↗</span><span className="hb-sr"> (opens in a new tab)</span></a></p>
        <ul className="hb-list hb-stops" style={{ marginTop: 10 }}>
          <li><button type="button" className="hb-row" onClick={() => store.select({ kind: "landmark", id: "wreck-cove" })}><span><b>Wreck Cove</b><em>every wreck, by date, cause and peak</em></span><span className="hb-num" aria-hidden="true">→</span></button></li>
        </ul>
      </div>
    </>
  );
}

function FarPortsPanel({ model, titleRef }: P) {
  const far = (model?.harbours ?? []).filter((h) => !h.piered);
  return (
    <>
      <Head kicker="Sea zone · offshore" title="The Far Ports" sub={`${far.length} chains without a pier`} titleRef={titleRef} />
      <div className="hb-panel-body">
        <Freshness model={model} source="stablecoins" />

        {model && <p className="hb-caption">{allocationLine(model.boats)}</p>}

        <Sec title="Chains">
          <ul className="hb-list">
            {far.slice(0, 40).map((h) => <li key={h.chain}><div className="hb-row"><span>{h.chain}</span><span className="hb-num">{money(h.supplyUsd)}</span></div></li>)}
          </ul>
          {far.length > 40 && <p className="hb-caption">and {far.length - 40} more in the ledger.</p>}
        </Sec>
        <Scenery>
        <p className="hb-caption">Know it by the buoyed anchorage and its marker lights, out on the horizon.</p>
        <p className="hb-why">{FAR_PORTS_LINE}</p>
        </Scenery>
      </div>
    </>
  );
}

function HarbourmasterPanel({ titleRef }: { titleRef: P["titleRef"] }) {
  const store = useStore();
  const { model } = useUI();
  const s = store.ctx.services.get("sim");
  return (
    <>
      <Head kicker="Landmark" title="Harbourmaster’s Office" sub="the day’s movements" titleRef={titleRef} />
      <div className="hb-panel-body">
        <Freshness model={model} source="stablecoins" />
        {s?.frozen && <p className="hb-caption">The data is stale, so every boat finishes its leg and holds.</p>}
        <Sec title="Movers board"><Freshness model={model} source="chains" /></Sec>

        {s && (
          <Sec title="Right now">
            <dl className="hb-dl">
              <dt>Under way</dt><dd>{s.stats.underWay}</dd>
              {s.stats.outings != null && s.stats.outings > 0 && <><dt><em>of which out for a sail</em></dt><dd><em>{s.stats.outings}</em></dd></>}
              <dt>Alongside</dt><dd>{s.stats.docked}</dd>
              <dt>On moorings</dt><dd>{s.stats.moored}</dd>
              <dt>At anchor</dt><dd>{s.stats.anchored}</dd>
            </dl>
            {s.stats.outings != null && <p className="hb-caption">A boat out for a sail is decoration: a loop out of its own harbour and back to the same berth.</p>}
          </Sec>
        )}
        <HarbourReports />
        <DayBook open={store.getSnapshot().selected?.id === "harbourmaster"} />
        <Scenery>
        <p className="hb-why">Boats follow deterministic schedules shared by visitors.</p>
        </Scenery>
      </div>
    </>
  );
}

/** The tide gauge's DOM twin: the same /api/chains figure the water column stands at, plus the 24 h and 30 d. */
function TidePanel({ model, titleRef }: P) {
  const t = model?.readings.tide;
  const ch = (v: number | null | undefined) => <b className={v == null ? "" : v > 0.0005 ? "hb-up" : v < -0.0005 ? "hb-down" : ""}>{v == null ? "Comparison unavailable." : pctChange(v)}</b>;
  const slack = t?.change7d != null && Math.abs(t.change7d * 100) < TIDE_SLACK_PCT;
  return (
    <>
      <Head kicker="Landmark · the harbour wall" title="Tide Gauge" sub="all stablecoin supply, week on week" titleRef={titleRef} />
      <div className="hb-panel-body">
        <Freshness model={model} source="chains" />
        {!t?.available || t.change7d == null ? <p className="hb-why">The gauge is dry: there is no supply-change reading. It never shows slack water by default.</p> : (
          <>
            <div className="hb-big hb-num">{pctChange(t.change7d)}<small>over 7 d</small></div>

            <div className="hb-changes">
              <div><span className="hb-sc">24 h</span>{ch(t.change24h)}</div>
              <div><span className="hb-sc">7 d</span>{ch(t.change7d)}</div>
              <div><span className="hb-sc">30 d</span>{ch(t.change30d)}</div>
            </div>
            <p className="hb-caption">{TIDE_RULE}</p>
          </>
        )}
        <Scenery>
            <p className="hb-why">The water on the gauge stands at the week’s change in all stablecoin supply: above the datum when it grew, below when it shrank{slack ? "; this week it is slack water, at the datum" : ""}.</p>
        </Scenery>
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
  const officeState = store.ctx.services.get("readings")?.offices?.[chain];
  const office = officeLine(officeState, chainRow?.change30dPct as number | undefined);
  return (
    <>
      <Head kicker={h?.piered === false ? "Far port" : CHAIN_COLOR[chain] ? `${chain} harbour · harbour office` : "Harbour"} title={chain} sub={h ? `${share(h.share)} of reported chain-attributed supply` : undefined}
        logo={CHAIN_COLOR[chain] ? <Crest chain={chain} color={CHAIN_COLOR[chain]} /> : <Logo src={chainLogo(chain)} label={chain} color="var(--fill-chain)" />} titleRef={titleRef} />
      <div className="hb-panel-body">
        <Freshness model={model} source="stablecoins" />
        {h && (
          <>
            <div className="hb-big hb-num">{money(h.supplyUsd)}</div>
            <Freshness model={model} source="chains" />
            <div className="hb-changes">
              <div><span className="hb-sc">24 h</span><b>{chainRow?.change24hPct == null ? "Comparison unavailable." : pctChange(chainRow.change24hPct as number)}</b></div>
              <div><span className="hb-sc">7 d</span><b>{chainRow?.change7dPct == null ? "Comparison unavailable." : pctChange(chainRow.change7dPct as number)}</b></div>
              <div><span className="hb-sc">30 d</span><b>{chainRow?.change30dPct == null ? "Comparison unavailable." : pctChange(chainRow.change30dPct as number)}</b></div>
            </div>

            {office && <p className="hb-caption">{office}.</p>}
            {model && <p className="hb-caption">{allocationLine(model.boats)}</p>}
            {/* the health score is a chain comparison too: it reads the foot above the 24 h · 7 d · 30 d, printed once */}
            <Sec title="Chain health">{h.healthScore != null ? <dl className="hb-dl"><dt>Health score</dt><dd>{Math.round(h.healthScore)}</dd></dl> : <p className="hb-caption">Chain health unavailable.</p>}</Sec>
            <Sec title="Largest reported holdings">
              <BoatList rows={visitors.slice(0, 10).map(({ b, usd }) => ({ id: b.id, label: <><b>{b.symbol}</b> <em>{share(usd / h.supplyUsd)}</em></>, value: money(usd) }))} />
            </Sec>
            <button type="button" className="hb-textbtn" onClick={() => store.coinsOnChain(chain)}>All coins on this chain</button>
          </>
        )}
        <Scenery>
            {h?.piered && CHAIN_COLOR[chain] && <p className="hb-caption">Know it by the harbour office with the {chain} crest, the house flag and awnings in its colour.</p>}
            {h?.piered && <p className="hb-caption">{LETTERING_RULE} {OFFICE_RULE}</p>}
            {h && <p className="hb-why">{h.visitors} {h.visitors === 1 ? "boat calls" : "boats call"} here. A pier’s length and its berths follow the supply it holds.</p>}
        </Scenery>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ P6: the flows quarter

/** Cross-links between the three flow buildings (the Customs House keeps the books of both). */
function FlowLinks({ except }: { except?: string }) {
  const store = useStore();
  const rows = [
    { id: "mint", label: "The Mint", note: "supply created" },
    { id: "burn", label: "The Burn", note: "supply destroyed" },
    { id: "customs-house", label: "Customs House", note: "the exact books" },
  ].filter((r) => r.id !== except);
  return (
    <Sec title="The flows quarter">
      <ul className="hb-list hb-stops">
        {rows.map((r) => (
          <li key={r.id}><button type="button" className="hb-row" onClick={() => store.select({ kind: "landmark", id: r.id })}><span><b>{r.label}</b><em>{r.note}</em></span><span className="hb-num" aria-hidden="true">→</span></button></li>
        ))}
      </ul>
    </Sec>
  );
}

/** THE MINT / THE BURN: one side of the 24 h flows, the scope it is read on, and what drives the works. */
function FlowPanel({ side, model, titleRef }: { side: "mint" | "burn" } & P) {
  const f = model?.readings.flows;
  const t = flowTotals(model);
  const mint = side === "mint";
  const vol = t ? (mint ? t.mint : t.burn) : null;
  const dominant = f && hasFlowDay(f.hourly) && !f.stale && t && t.net != null && t.net !== 0 ? (t.net > 0 ? "mint" : "burn") : null;
  const scope = f?.scope.map(scopeName) ?? [];
  const valued = flowValued(f?.hourly ?? []);
  return (
    <>
      <Head kicker="The flows quarter" title={mint ? "The Mint" : "The Burn"} sub={mint ? "where supply is struck" : "where supply is destroyed"} titleRef={titleRef} />
      <div className="hb-panel-body">
        <Freshness model={model} source="mintBurn" />
        {!t || vol == null ? <p className="hb-why">{mint ? "The furnaces are banked: there is no flow reading." : "The fire is banked: there is no flow reading."}</p> : (
          <>
            <div className="hb-big hb-num">{valued ? money(vol) : `At least ${money(vol)}`}<small>{mint ? "minted" : "burned"} · {flowWindow(f?.hourly ?? [])}</small></div>

            {f && (!hasFlowDay(f.hourly) || f.stale) && <p className="hb-caption">The fires are banked until a current, complete daily window is available.</p>}
            {!valued && <p className="hb-caption">{f?.hourly.some((h) => h.netUsd == null) ? NET_UNAVAILABLE : VALUATION_UNKNOWN}</p>}
            <Sec title={`Hourly, ${mint ? "minted" : "burned"}`}><FlowBars hourly={f?.hourly ?? []} side={side} /></Sec>
            <Sec title={flowWindow(f?.hourly ?? [])}>
              <dl className="hb-dl">
                <dt>{mint ? "Minted" : "Burned"}</dt><dd>{grossFlow(vol, side, valued)}</dd>
                <dt>{mint ? "Burned, across the mouth" : "Minted, at the Mint"}</dt><dd>{grossFlow(mint ? t.burn : t.mint, mint ? "burn" : "mint", valued)}</dd>
                <dt>Net</dt><dd className={t.net == null ? "" : t.net > 0 ? "hb-up" : t.net < 0 ? "hb-down" : ""}>{money(t.net, { signed: true })}</dd>
              </dl>
            </Sec>
          </>
        )}
        <Sec title="Scope">
          <div className="hb-scope">
            {scope.map((c) => <span key={c}>{CHAIN_COLOR[c] ? <Crest chain={c} color={CHAIN_COLOR[c]} size={20} /> : <Logo src={chainLogo(c)} label={c} color="var(--fill-chain)" size={20} />}{c}</span>)}
          </div>
          <p className="hb-caption">{scope.length ? `Mint and burn are read on ${scope.length === 3 ? `${scope[0]}, ${scope[1]} and ${scope[2]}` : scope.join(", ")} only, the honest scope of the data. Issuance elsewhere is not counted here.` : "Flow scope is unavailable."}</p>
        </Sec>
        <p className="hb-caption">{FLOW_RULE}</p>
        <p className="hb-caption">{SOUND_FLOW}</p>
        <FlowLinks except={side} />
        <Scenery>
            <p className="hb-why">{mint
              ? "Its chimneys smoke, its furnaces glow, its presses stamp and its workers bustle with reported minting activity."
              : "Its fire and smoke follow reported burning (redemption) activity."}
              {dominant === side ? (mint ? " More is being minted than burned, so the Mint outworks the Burn." : " More is being burned than minted, so the Burn outshines the Mint.") : ""}</p>
        </Scenery>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ P6: the Shipyard

const fullDate = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : d;
};

function UpcomingLink({ children }: { children: ReactNode }) {
  return <a className="hb-out" href={UPCOMING_URL} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true"> ↗</span><span className="hb-sr"> (opens pharos.watch in a new tab)</span></a>;
}

/** The yard's build line: one step per launch phase, the coin's own step marked. */
function BuildStages({ coins, current }: { coins?: readonly YardCoin[]; current?: YardCoin }) {
  const counts = new Map(PHASES.map((p) => [p, coins?.filter((c) => c.phase === p).length ?? 0]));
  const at = current?.phase ? PHASES.indexOf(current.phase) : -1;
  return (
    <ol className="hb-stages" aria-label={current ? `Launch phase: ${current.phase ? PHASE_NAME[current.phase] : "not stated"}` : "Coins by launch phase"}>
      {PHASES.map((p, i) => (
        <li key={p} data-done={current ? i <= at : undefined} aria-current={current && i === at ? "step" : undefined}>
          <i aria-hidden="true" />
          <span>{PHASE_NAME[p]}</span>
          <small>{STAGE_WORD[STAGE_OF[p]]}</small>
          {coins && <b className="hb-num">{counts.get(p)}</b>}
        </li>
      ))}
    </ol>
  );
}

function ShipyardPanel({ titleRef }: { titleRef: P["titleRef"] }) {
  const store = useStore();
  const { model } = useUI();
  const coins = yardCoins(store.ctx);
  const gone = launchedFromYard(model).filter((g) => !coins.some((c) => c.id === g.id));
  const groups = groupYard(coins);
  return (
    <>
      <Head kicker="The yard" title="The Shipyard" sub="Awaiting admission to the tracked fleet." titleRef={titleRef} />
      <div className="hb-panel-body">
        <p className="hb-why">{YARD_EXPLANATION}</p>
        <Sec title="By phase"><BuildStages coins={coins} /></Sec>
        {gone.length > 0 && (
          <Sec title="Admitted to the fleet">
            <BoatList rows={gone.map((g) => ({ id: g.id, label: <><b>{g.symbol}</b> <em>down the slip, now with the fleet</em></>, value: "→" }))} />
          </Sec>
        )}
        {groups.map((g) => (
          <Sec key={g.label} title={`${g.label} · ${g.coins.length}`}>
            <ul className="hb-list hb-yard">
              {g.coins.map((c) => (
                <li key={c.id}>
                  <button type="button" className="hb-row" onClick={() => store.select({ kind: "yard", id: c.id })}>
                    <span><Logo src={c.logo} label={c.symbol} color="var(--fill-yard)" size={22} /><b>{c.symbol}</b><em>{c.name !== c.symbol ? c.name : ""}</em></span>
                    <span className="hb-num">{expectedLabel(c.expected)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Sec>
        ))}
        {coins.length === 0 && <p className="hb-empty">No records are awaiting admission to the tracked fleet.</p>}
        <p className="hb-caption" style={{ marginTop: 16 }}>Bundled admission records; see sources for dates. Dates are expected, not promised. <UpcomingLink>All upcoming coins on Pharos</UpcomingLink></p>
      </div>
    </>
  );
}

/** A pre-launch coin's dossier: phase, expected date, milestones. */
function YardCoinPanel({ id, titleRef }: { id: string; titleRef: P["titleRef"] }) {
  const store = useStore();
  const c = yardCoins(store.ctx).find((y) => y.id === id);
  if (!c) return <Head kicker="On the slips" title={id} sub="no longer in the yard" titleRef={titleRef} />;
  const shown = c.milestones.slice(0, 6);
  return (
    <>
      <Head kicker="Awaiting admission to the tracked fleet." title={c.symbol} sub={c.name !== c.symbol ? c.name : c.issuer ?? "Awaiting admission to the tracked fleet."} logo={<Logo src={c.logo} label={c.symbol} color="var(--fill-yard)" />} titleRef={titleRef} />
      <div className="hb-panel-body">
        <div className="hb-where">Building at the Shipyard · {STAGE_NAME[c.stage]}</div>
        <p className="hb-why">{YARD_EXPLANATION}</p>
        <Sec title="Launch phase"><BuildStages current={c} /></Sec>
        <dl className="hb-dl" style={{ marginTop: 10 }}>
          <dt>Expected</dt><dd>{c.expected ? expectedLabel(c.expected) : <em>not stated</em>}</dd>
          {c.peg && c.peg !== "OTHER" && <><dt>Pegged to</dt><dd>{pegName(c.peg)}</dd></>}
        </dl>
        {c.phaseDetail && <details><summary>More about this record</summary><p className="hb-caption">{c.phaseDetail}</p></details>}
        <Sec title={`Milestones${c.milestones.length ? ` · ${c.milestones.length}` : ""}`}>
          {shown.length ? (
            <ol className="hb-milestones">
              {shown.map((m, i) => (
                <li key={`${m.date}-${i}`}>
                  <span className="hb-ms-date hb-num">{fullDate(m.date)}<i className="hb-sc">{m.type}</i></span>
                  <span className="hb-ms-title">{m.sourceUrl ? <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer">{m.title}<span className="hb-sr"> (source, opens in a new tab)</span></a> : m.title}</span>
                </li>
              ))}
            </ol>
          ) : <p className="hb-empty">No milestones recorded yet.</p>}
          {c.milestones.length > shown.length && <p className="hb-caption">and {c.milestones.length - shown.length} earlier on pharos.watch.</p>}
        </Sec>
        <p className="hb-caption" style={{ marginTop: 16 }}>Bundled admission records; see sources for dates. <UpcomingLink>All upcoming coins on Pharos</UpcomingLink></p>
        <ul className="hb-list hb-stops" style={{ marginTop: 10 }}>
          <li><button type="button" className="hb-row" onClick={() => store.select({ kind: "landmark", id: "slipway" })}><span><b>The Shipyard</b><em>every coin on the slips</em></span><span className="hb-num" aria-hidden="true">→</span></button></li>
        </ul>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ P6: sea zones and civic buildings

function RoadsPanel({ titleRef }: { titleRef: P["titleRef"] }) {
  const store = useStore();
  useUI(); // re-render on tick: boats come and go
  const here = store.boatsInZone("the-roads") ?? [];
  return (
    <>
      <Head kicker="Sea zone · anchorage" title="The Roads" sub="the outer mooring field" titleRef={titleRef} />
      <div className="hb-panel-body">

        <Sec title={`In the Roads now · ${here.length}`}>
          {here.length ? <BoatList rows={here.slice(0, 12).map((b) => ({ id: b.id, label: <><b>{b.symbol}</b> <em>{whereLine(b, store.whereaboutsOf(b.id))}</em></>, value: money(b.supply) }))} />
            : <p className="hb-empty">No boat lies in the Roads just now.</p>}
          {here.length > 12 && <p className="hb-caption">and {here.length - 12} more.</p>}
        </Sec>
        <Scenery>
        <p className="hb-why">Ethereum holds more small hulls than its piers can berth, so the rest ride to swing moorings here, in the lee of the breakwater. A boat in the Roads is still in Ethereum’s harbour.</p>
        <p className="hb-caption">Know it by the field of mooring buoys beyond the town, every bow into the wind.</p>
        </Scenery>
      </div>
    </>
  );
}

function ChartRoomPanel({ model, titleRef }: P) {
  const store = useStore();
  const p = model?.readings.psi;
  const stab = raw(store, "stability");
  const hist = psiObservations((stab?.history as PsiObservation[] | undefined) ?? []);
  return (
    <>
      <Head kicker="Landmark" title="The Chart Room" sub="the Pharos’s dated observations" titleRef={titleRef} />
      <div className="hb-panel-body">
        <Freshness model={model} source="stability" />

        <Sec title="PSI observations">
          <Sparkline observations={hist} now={sourceTruth(model, "stability").state === "current" ? p?.score ?? null : null} nowAt={p?.computedAt ?? null} />
          {hist.length > 1 && (
            <dl className="hb-dl" style={{ marginTop: 8 }}>
              <dt>Observation range</dt><dd>{psiRange(hist)}</dd>
              <dt>Change over the period</dt><dd>{psiChange(hist)}</dd>
            </dl>
          )}
        </Sec>
        <ul className="hb-list hb-stops" style={{ marginTop: 14 }}>
          <li><button type="button" className="hb-row" onClick={() => store.select({ kind: "landmark", id: "pharos" })}><span><b>The Pharos</b><em>the reading now</em></span><span className="hb-num" aria-hidden="true">→</span></button></li>
        </ul>
        <Scenery>
        <p className="hb-why">Where the keepers chart the stability index day by day: the beacon shows the market now, the Chart Room shows how it got here.</p>
        </Scenery>
      </div>
    </>
  );
}

function KeepersLogPanel({ model, titleRef }: P) {
  const presentation = presentationCopy(usePresentation());
  const health = useFeedHealth();
  const rows = (Object.keys(READING_NAMES) as EndpointKey[]).map((k) => ({ k, label: READING_NAMES[k], t: sourceTruth(model, k) }));
  const lag = rows.filter((r) => r.t.state !== "current").length;
  return (
    <>
      <Head kicker="Landmark" title="The Keeper’s Log" sub={!model ? "awaiting data" : lag === 0 ? "every reading fresh" : `${lag} ${lag === 1 ? "reading" : "readings"} lagging`} titleRef={titleRef} />
      <div className="hb-panel-body">
        {presentation && <p className="hb-caption" role="status">{presentation}</p>}
        {health && <p role="status" className="hb-caption">{health}</p>}

        <Sec title="Readings">
          <table className="hb-table hb-log">
            <caption className="hb-sr">Source state and observation time for each reading</caption>
            <thead><tr><th scope="col"><span className="hb-sc">Reading</span></th><th scope="col"><span className="hb-sc">Source state</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k}>
                  <td><span className="hb-dot" data-state={r.t.state} aria-hidden="true" /> {r.label}</td>
                  <td><Freshness model={model} source={r.k} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Sec>
        <DecorativeCalendar />
        <Scenery>
        <p className="hb-why">The keeper records each source’s state and last observed time. When the register itself goes stale, fog rolls in and every boat finishes its leg and holds: nothing pretends to be live.</p>
        </Scenery>
      </div>
    </>
  );
}

function RegistryPanel({ model, titleRef }: P) {
  const live = (model?.boats ?? []).filter((b) => b.state !== "wrecked");
  const available = model?.truth.safetyGrades.state !== "unavailable";
  const tally = gradeTally(available ? live : []);
  const order = ["A", "B", "C", "D", "E", "F", "—"].filter((g) => tally.has(g));
  return (
    <>
      <Head kicker="Landmark" title="The Registry" sub={`${model?.payloadCount ?? 0} coins on the register`} titleRef={titleRef} />
      <div className="hb-panel-body">
        <Freshness model={model} source="safetyGrades" />
        <Freshness model={model} source="stablecoins" />

        {order.length > 0 && (
          <Sec title="Safety grades">
            <dl className="hb-dl">
              {order.map((g) => <Fragment key={g}><dt>{g === "—" ? "Not rated" : `Grade ${g}`}</dt><dd>{tally.get(g)}</dd></Fragment>)}
            </dl>
          </Sec>
        )}
        <p className="hb-caption">The grade board groups live boats by grade letter; NR and missing grades are Not rated. Wrecks are excluded.</p>
        <p className="hb-caption">Press <kbd>L</kbd> for the ledger, or <kbd>/</kbd> to find one coin.</p>
        <Scenery>
        <p className="hb-why">Every stablecoin the register knows is a boat in this harbour: no sampling, no sister ships. The Registry also keeps each coin’s safety grade.</p>
        </Scenery>
      </div>
    </>
  );
}
