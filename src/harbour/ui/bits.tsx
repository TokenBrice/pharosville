/** Small shared pieces: logo medallion, chart glyphs (sparkline, tide bars, chain split), freshness. */
import { useState } from "react";
import type { Boat, DewsBand, Freshness, HarbourModel } from "../model/types";
import { age, money, share } from "./format";

export function truthState(m: HarbourModel | null): { state: Freshness; word: string; detail: string } {
  if (!m || !m.hasFleet) return { state: "unavailable", word: "awaiting data", detail: "no harbour data has arrived" };
  const t = m.truth;
  const essential = [t.stablecoins, t.chains];
  const worst: Freshness = essential.some((e) => e.state === "unavailable") ? "stale" : essential.some((e) => e.state === "stale") ? "stale" : "current";
  const lagging = (Object.keys(t) as Array<keyof typeof t>).filter((k) => t[k].state !== "current").length;
  const ageSec = t.stablecoins.ageSec;
  if (worst === "stale") return { state: "stale", word: `stale · ${age(ageSec)} old`, detail: "the harbour is holding still until fresh data arrives" };
  return { state: "current", word: lagging ? `live · ${lagging} ${lagging === 1 ? "reading" : "readings"} lagging` : "live", detail: "" };
}

export function Logo({ src, label, color, size }: { src: string | null; label: string; color: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = size ? { width: size, height: size } : undefined;
  return (
    <span className="hb-logo" style={style} aria-hidden="true">
      {src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : <span style={{ background: color, width: "100%", height: "100%", display: "grid", placeItems: "center" }}>{label.slice(0, 2)}</span>}
    </span>
  );
}

export const chainLogo = (chain: string) => `/chains/${chain.toLowerCase().replace(/\s+/g, "-")}.svg`;

/** Validated categorical inks on chart paper (dataviz validator: CVD ≥ 11, contrast ≥ 3:1). */
export const CHAIN_INKS = ["#1668a3", "#b8700f", "#7a4ca6", "#008c80", "#b5382b"];
export const OTHER_INK = "#a99f8c";

export const DEWS_INK: Record<DewsBand, string> = { CALM: "#3f8a5e", WATCH: "#b0912e", ALERT: "#c0702a", WARNING: "#b5382b", DANGER: "#7e1f2a" };
export const PSI_INK: Record<string, string> = { BEDROCK: "#3f8a5e", STEADY: "#6f9a4a", TREMOR: "#b0912e", FRACTURE: "#c0702a", CRISIS: "#b5382b", MELTDOWN: "#7e1f2a" };

export function ChainSplit({ boat }: { boat: Boat }) {
  const top = boat.chainShares.slice(0, 5);
  const rest = boat.chainShares.slice(5);
  const restShare = rest.reduce((s, c) => s + c.share, 0);
  const restUsd = rest.reduce((s, c) => s + c.usd, 0);
  const rows = [...top.map((c, i) => ({ ...c, ink: CHAIN_INKS[i] })), ...(restShare > 0 ? [{ chain: `${rest.length} other ${rest.length === 1 ? "chain" : "chains"}`, share: restShare, usd: restUsd, ink: OTHER_INK }] : [])];
  if (!rows.length) return <p className="hb-empty">No chain breakdown reported.</p>;
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
    </>
  );
}

/** 30-day line with an end dot, a direct label and a hover crosshair; one series, so no legend. */
export function Sparkline({ values, dates, label }: { values: number[]; dates?: number[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (values.length < 2) return <p className="hb-empty">Not enough history yet.</p>;
  const W = 300, H = 56, PW = W - 34, lo = Math.min(...values), hi = Math.max(...values);
  const pad = Math.max(0.5, (hi - lo) * 0.15);
  const y = (v: number) => H - 6 - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 12);
  const x = (i: number) => (i / (values.length - 1)) * PW;
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values.length - 1;
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(last, Math.round((fx / PW) * last))));
  };
  const hv = hover != null ? values[hover] : null;
  const day = hover != null && dates?.[hover] ? new Date(dates[hover] * 1000).toLocaleDateString([], { day: "numeric", month: "short" }) : "";
  return (
    <div>
      <svg className="hb-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={PW} y1={y(lo)} y2={y(lo)} stroke="#a68242" strokeWidth="0.5" strokeDasharray="1 3" />
        <path d={d} fill="none" stroke="#23201a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && hv != null && <><line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="#7a5a22" strokeWidth="0.75" /><circle cx={x(hover)} cy={y(hv)} r="3" fill="#23201a" /></>}
        <circle cx={x(last)} cy={y(values[last])} r="3" fill="#f4ecda" stroke="#23201a" strokeWidth="1.4" />
        <text x={W - 26} y={y(values[last]) + 4.5} fontSize="13" fill="#23201a" fontFamily="inherit" style={{ fontVariantNumeric: "tabular-nums" }}>{values[last].toFixed(1)}</text>
      </svg>
      <div className="hb-axis-note"><span>30 days ago</span><span>{hv != null ? `${day} · ${hv.toFixed(1)}` : ""}</span><span>today</span></div>
    </div>
  );
}

/** 24 hourly net-flow bars around a zero line; partial-valuation hours are gaps, never zero. */
export function TideBars({ hourly }: { hourly: Array<{ hourTs: number; netUsd: number | null }> }) {
  const W = 300, H = 92, mid = H / 2;
  const maxAbs = Math.max(1, ...hourly.map((h) => Math.abs(h.netUsd ?? 0)));
  const bw = W / Math.max(24, hourly.length);
  const [hover, setHover] = useState<number | null>(null);
  const h = hover != null ? hourly[hover] : null;
  return (
    <div style={{ position: "relative" }}>
      <svg className="hb-bars" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Hourly net mint and burn, last ${hourly.length} hours`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={mid} y2={mid} stroke="#7a5a22" strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
        {hourly.map((b, i) => {
          const v = b.netUsd;
          const x = i * bw + 1;
          if (v == null) return <line key={b.hourTs} x1={x + bw / 2 - 1} x2={x + bw / 2 - 1} y1={mid - 3} y2={mid + 3} stroke="#a99f8c" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
          const hgt = Math.max(1, (Math.abs(v) / maxAbs) * (mid - 4));
          return (
            <g key={b.hourTs} onMouseEnter={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              <rect x={x} y={v >= 0 ? mid - hgt : mid} width={bw - 2} height={hgt} rx="1" fill={v >= 0 ? "#1f5873" : "#b5382b"} opacity={hover == null || hover === i ? 1 : 0.45} />
            </g>
          );
        })}
      </svg>
      <div className="hb-axis-note"><span>24 h ago</span><span>{h ? `${new Date(h.hourTs * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${h.netUsd == null ? "partial" : money(h.netUsd, { signed: true })}` : "minted above, burned below"}</span><span>now</span></div>
    </div>
  );
}

/**
 * One side of the flows, hour by hour (the Mint's minting or the Burn's burning): bars up from a
 * baseline, on the series' own scale. Hover reads one hour.
 */
export function FlowBars({ hourly, side }: { hourly: Array<{ hourTs: number; mintUsd: number; burnUsd: number }>; side: "mint" | "burn" }) {
  const W = 300, H = 46;
  const vals = hourly.map((h) => (side === "mint" ? h.mintUsd : h.burnUsd));
  const max = Math.max(1, ...vals);
  const bw = W / Math.max(24, vals.length);
  const [hover, setHover] = useState<number | null>(null);
  const ink = side === "mint" ? "#1f5873" : "#b5382b";
  const word = side === "mint" ? "minted" : "burned";
  const h = hover != null ? hourly[hover] : null;
  return (
    <div>
      <svg className="hb-flowbars" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Supply ${word} each hour, last ${vals.length} hours; largest hour ${money(max)}`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#7a5a22" strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
        {vals.map((v, i) => {
          const hgt = v > 0 ? Math.max(1.5, (v / max) * (H - 3)) : 0;
          return (
            <g key={hourly[i].hourTs} onMouseEnter={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              {hgt > 0 && <rect x={i * bw + 1} y={H - hgt} width={bw - 2} height={hgt} rx="1" fill={ink} opacity={hover == null || hover === i ? 0.9 : 0.4} />}
            </g>
          );
        })}
      </svg>
      <div className="hb-axis-note"><span>24 h ago</span><span>{h ? `${new Date(h.hourTs * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${money(side === "mint" ? h.mintUsd : h.burnUsd)} ${word}` : `${word} each hour`}</span><span>now</span></div>
    </div>
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

export function Freshness({ label, state, ageSec }: { label: string; state: Freshness; ageSec: number | null }) {
  return (
    <div className="hb-foot">
      <span className="hb-dot" data-state={state} aria-hidden="true" />
      <span>{label} {state === "unavailable" ? "unavailable" : `${state === "stale" ? "stale, " : ""}updated ${age(ageSec)}${ageSec != null && ageSec >= 90 ? " ago" : ""}`}</span>
    </div>
  );
}
