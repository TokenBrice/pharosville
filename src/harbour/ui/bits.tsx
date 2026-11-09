/** Small shared pieces: logo medallion, chart glyphs (sparkline, tide bars, chain split), freshness. */
import { useState } from "react";
import type { Boat, DewsBand, EndpointKey, Freshness, HarbourModel } from "../model/types";
import { age, money, share } from "./format";
import { runtimeLogoPath } from "../../lib/logos";
import { allocationLine } from "./facts";
export { Sparkline, TideBars, FlowBars } from "./charts";
import { readingSentence, sourceTruth, useReadingNow } from "./source-state";
import { truthCopy } from "./truth-copy";

export function truthState(m: HarbourModel | null): { state: Freshness; word: string; detail: string } {
  const supply = sourceTruth(m, "stablecoins");
  const lagging = m ? Object.entries(m.truth).filter(([k, t]) => k !== "stablecoins" && t.state !== "current").length : 6;
  const others = lagging === 0 ? "" : ` ${lagging} other ${lagging === 1 ? "reading is" : "readings are"} stale or unavailable.`;
  // The corner keeps a compact word; the full sentences (shared formatter) stay in `detail` for assistive tech and hover.
  const word = supply.state === "current" ? (lagging === 0 ? "live" : `live · ${lagging} not current`)
    : supply.state === "stale" ? (supply.ageSec != null ? `stale · ${age(supply.ageSec)} old` : "stale")
    : supply.state === "unknown" ? "unverified"
    : m?.hasFleet ? "unavailable" : "awaiting data";
  return { state: supply.state, word, detail: `${readingSentence(m, "stablecoins")}${others}` };
}

export function Logo({ src, label, color, size }: { src: string | null; label: string; color: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = size ? { width: size, height: size } : undefined;
  return (
    <span className="hb-logo" style={style} aria-hidden="true">
      {src && !broken ? <img src={runtimeLogoPath(src)} alt="" onError={() => setBroken(true)} /> : <span style={{ background: color }}>{label.slice(0, 2)}</span>}
    </span>
  );
}

export const chainLogo = (chain: string) => `/chains/${chain.toLowerCase().replace(/\s+/g, "-")}.svg`;

/** Validated categorical inks on chart paper (dataviz validator: CVD ≥ 11, contrast ≥ 3:1), per palette: harbour-ui.css --c1…--c5. */
export const CHAIN_INKS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];
export const OTHER_INK = "var(--c-other)";

export const DEWS_INK: Record<DewsBand, string> = { CALM: "#3f8a5e", WATCH: "#b0912e", ALERT: "#c0702a", WARNING: "#b5382b", DANGER: "#7e1f2a" };
export const PSI_INK: Record<string, string> = { BEDROCK: "#3f8a5e", STEADY: "#6f9a4a", TREMOR: "#b0912e", FRACTURE: "#c0702a", CRISIS: "#b5382b", MELTDOWN: "#7e1f2a" };

export function ChainSplit({ boat }: { boat: Boat }) {
  const top = boat.chainShares.slice(0, 5);
  const rest = boat.chainShares.slice(5);
  const restShare = rest.reduce((s, c) => s + c.share, 0);
  const restUsd = rest.reduce((s, c) => s + c.usd, 0);
  const rows = [...top.map((c, i) => ({ ...c, ink: CHAIN_INKS[i] })), ...(restShare > 0 ? [{ chain: `${rest.length} other ${rest.length === 1 ? "chain" : "chains"}`, share: restShare, usd: restUsd, ink: OTHER_INK }] : [])];
  if (!rows.length) return <><p className="hb-empty">No chain breakdown reported.</p><p className="hb-caption">{allocationLine([boat])}</p></>;
  return (
    <>
      <div className="hb-split" role="img" aria-label={rows.map((r) => `${r.chain} ${share(r.share)}`).join(", ")}>
        {rows.map((r) => <span key={r.chain} title={`${r.chain} · ${share(r.share)} · ${money(r.usd)}`} style={{ flexGrow: Math.max(r.share, 0.004), background: r.ink }} />)}
      </div>
      <ul className="hb-split-legend">
        {rows.map((r) => (
          <li key={r.chain}><i style={{ background: r.ink }} /><span>{r.chain}</span><span className="hb-num">{money(r.usd)}</span><span className="hb-num hb-pct">{share(r.share)}</span></li>
        ))}
      </ul>
      <p className="hb-caption">Percentages are shares of reported chain-attributed holdings.</p>
      <p className="hb-caption">{allocationLine([boat])}</p>
    </>
  );
}

/** A chain's crest on its house colour (many crests are white on transparent). */
export function Crest({ chain, color, size = 52 }: { chain: string; color: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="hb-crest" style={{ width: size, height: size, background: color }} aria-hidden="true">
      {!broken ? <img src={chainLogo(chain)} alt="" onError={() => setBroken(true)} /> : <span>{chain.slice(0, 2)}</span>}
    </span>
  );
}

export function Freshness({ model, source }: { model: HarbourModel | null; source: EndpointKey }) {
  const now = useReadingNow();
  const truth = sourceTruth(model, source);
  const stamp = truth.sourceUpdatedAtMs;
  const dated = stamp != null && Number.isFinite(stamp) && stamp >= 0;
  const elapsed = dated ? Math.max(0, (now - stamp) / 1000) : null;
  return (
    <>
      {(truth.state === "unknown" || (truth.state !== "unavailable" && !dated)) && <p className="hb-caption">{truthCopy({ kind: "retained-heading" })}</p>}
      <div className="hb-foot">
        <span className="hb-dot" data-state={truth.state} aria-hidden="true" />
        <span>{readingSentence(model, source)}</span>
        {elapsed != null && <span>{elapsed < 90 ? "Observed just now." : `Observed ${age(elapsed)} ago.`}</span>}
      </div>
    </>
  );
}
