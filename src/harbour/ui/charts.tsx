import { useState } from "react";
import { datedObservations, hourlyObservations, validObservationDate } from "@shared/lib/dated-observations";
import { money } from "./format";
import { grossFlow, NET_UNAVAILABLE, VALUATION_UNKNOWN, type FlowHour } from "./flow-copy";

export interface PsiObservation { date: number; score: number; methodologyVersion?: string | null }
export const utcObservation = (seconds: number): string => new Date(seconds * 1000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
export const psiObservations = (rows: readonly { date: number; score?: unknown; methodologyVersion?: string | null }[]): PsiObservation[] => datedObservations(rows).filter((r): r is PsiObservation => typeof r.score === "number" && Number.isFinite(r.score)).slice(-30);
export const PSI_COMPARISON_UNAVAILABLE = "Comparison unavailable across methodology versions.";
function comparablePsi(rows: readonly PsiObservation[]): boolean {
  const method = rows[0]?.methodologyVersion;
  return rows.length >= 2 && !!method?.trim() && rows.every((r) => r.methodologyVersion === method);
}
export function psiRange(rows: readonly PsiObservation[]): string {
  if (!comparablePsi(rows)) return PSI_COMPARISON_UNAVAILABLE;
  const scores = rows.map((r) => r.score);
  return `${Math.min(...scores).toFixed(1)} – ${Math.max(...scores).toFixed(1)}`;
}
export function psiChange(rows: readonly PsiObservation[]): string {
  if (!comparablePsi(rows)) return PSI_COMPARISON_UNAVAILABLE;
  const delta = rows[rows.length - 1].score - rows[0].score;
  return `${delta < 0 ? "−" : "+"}${Math.abs(delta).toFixed(1)} points.`;
}

/** Dated observations are dots: nothing between daily reports is an observed PSI value. */
export function Sparkline({ observations, now, nowAt, label = "PSI observations" }: { observations: readonly PsiObservation[]; now?: number | null; nowAt?: number | null; label?: string }) {
  const rows = psiObservations(observations);
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const index = Math.max(0, rows.findIndex((r) => r.date === selectedDate));
  const selected = rows[index];
  const current = now != null && Number.isFinite(now) && validObservationDate(nowAt) ? { date: nowAt, score: now } : null;
  const plotted = [...rows, ...(current ? [current] : [])];
  if (!plotted.length) return <p className="hb-empty">No dated observations available.</p>;
  const start = Math.min(...plotted.map((r) => r.date)), end = Math.max(...plotted.map((r) => r.date));
  const lo = Math.min(...plotted.map((r) => r.score)), hi = Math.max(...plotted.map((r) => r.score));
  const x = (date: number) => 5 + (end === start ? 0.5 : (date - start) / (end - start)) * 290;
  const y = (score: number) => 50 - ((score - lo + 0.5) / (hi - lo + 1)) * 44;
  const caption = rows.length ? `${rows.length} observations from ${utcObservation(rows[0].date)} to ${utcObservation(rows[rows.length - 1].date)} (UTC).` : "No dated observations available.";
  return <div>
    <svg className="hb-spark" viewBox="0 0 300 56" role="img" aria-label={label}>
      {rows.map((r) => <circle className="hb-chart-observation" key={r.date} cx={x(r.date)} cy={y(r.score)} r={selected?.date === r.date ? 3.5 : 2.5} fill="currentColor" onMouseEnter={() => setSelectedDate(r.date)}><title>{utcObservation(r.date)} UTC · {r.score.toFixed(1)}</title></circle>)}
      {current && <circle className="hb-chart-now" cx={x(current.date)} cy={y(current.score)} r="4" fill="none" stroke="currentColor" strokeWidth="1.5"><title>Now · {current.score.toFixed(1)} · {utcObservation(current.date)} UTC</title></circle>}
    </svg>
    <p className="hb-caption">{caption}</p>
    {selected && <>
      <div className="hb-axis-note" role="status" aria-live="polite">{utcObservation(selected.date)} UTC · {selected.score.toFixed(1)}</div>
      <div className="hb-chart-controls hb-reading-actions">
        <button type="button" className="hb-control" disabled={index === 0} onClick={() => setSelectedDate(rows[index - 1].date)}>Previous observation</button>{" "}
        <button type="button" className="hb-control" disabled={index === rows.length - 1} onClick={() => setSelectedDate(rows[index + 1].date)}>Next observation</button>
      </div>
    </>}
    <details><summary>View values</summary><table className="hb-table"><caption>PSI observations (UTC)</caption><thead><tr><th scope="col"><span className="hb-sc">Observation (UTC)</span></th><th scope="col"><span className="hb-sc">PSI</span></th><th scope="col"><span className="hb-sc">Methodology</span></th></tr></thead><tbody>
      {rows.map((r) => <tr key={r.date}><th scope="row">{utcObservation(r.date)}</th><td>{r.score.toFixed(1)}</td><td className="hb-wrap">{r.methodologyVersion ?? "Unknown"}</td></tr>)}
      {current && <tr><th scope="row">Now · {utcObservation(current.date)}</th><td>{current.score.toFixed(1)}</td><td>Current reading</td></tr>}
    </tbody></table></details>
  </div>;
}

/** Retain actual time positions and materialize absent hours as empty slots, ending at the last report. */
export function flowObservations(hourly: readonly FlowHour[]): Array<{ date: number; hour: FlowHour | null }> {
  const rows = hourlyObservations(hourly).map((hour) => ({ date: hour.hourTs, hour }));
  if (!rows.length) return [];
  const end = rows[rows.length - 1].date, start = rows[0].date;
  const byDate = new Map<number, FlowHour | null>(rows.map((r) => [r.date, r.hour]));
  for (let date = Math.max(0, start); date <= end; date += 3600) if (!byDate.has(date)) byDate.set(date, null);
  return [...byDate].sort(([a], [b]) => a - b).map(([date, hour]) => ({ date, hour }));
}

export function FlowChart({ hourly, side }: { hourly: FlowHour[]; side?: "mint" | "burn" }) {
  const rows = flowObservations(hourly);
  const [hoverDate, setHoverDate] = useState<number | null>(null);
  const hovered = rows.find((r) => r.date === hoverDate);
  if (!rows.length) return <p className="hb-empty">No dated observations available.</p>;
  const values = rows.map(({ hour: h }) => !h ? null : side ? (side === "mint" ? h.mintUsd : h.burnUsd) : h.valuation === "complete" ? h.netUsd : null);
  const max = Math.max(1, ...values.map((v) => Math.abs(v ?? 0)));
  const start = rows[0].date, end = rows[rows.length - 1].date;
  const x = (date: number) => (date - start) / (end - start + 3600) * 300;
  const bw = 300 * 3600 / (end - start + 3600);
  const H = side ? 46 : 92, baseline = side ? H : H / 2;
  const valueLine = (h: FlowHour | null): string => !h ? "Missing hourly observation." : side ? grossFlow(side === "mint" ? h.mintUsd : h.burnUsd, side, h.valuation === "complete") : h.valuation === "partial" || h.netUsd == null ? NET_UNAVAILABLE : h.valuation !== "complete" ? VALUATION_UNKNOWN : `${money(h.netUsd, { signed: true })} net ${h.netUsd >= 0 ? "minted" : "burned"}`;
  const observed = rows.filter((r) => r.hour);
  const caption = `${utcObservation(start)} to ${utcObservation(end)} (UTC). ${observed.length} of 24 hourly observations.`;
  return <div>
    <svg className={side ? "hb-flowbars" : "hb-bars"} viewBox={`0 0 300 ${H}`} preserveAspectRatio="none" role="img" aria-label={side ? `Supply ${side === "mint" ? "minted" : "burned"} each hour · ${caption}` : `Hourly net flow: mint minus burn · ${caption}`} onMouseLeave={() => setHoverDate(null)}>
      <line className="hb-chart-axis" x1="0" x2="300" y1={baseline} y2={baseline} stroke="currentColor" strokeWidth="0.75" />
      {rows.map(({ date, hour }, i) => {
        const v = values[i], height = v == null ? 0 : Math.max(v === 0 ? 0 : 1, Math.abs(v) / max * (baseline - 4));
        return <g key={date} onMouseEnter={() => setHoverDate(date)}><title>{utcObservation(date)} UTC · {valueLine(hour)}</title>
          <rect x={x(date)} y="0" width={bw} height={H} fill="transparent" />
          {v == null && hour && <line className="hb-chart-unavailable" x1={x(date) + bw / 2} x2={x(date) + bw / 2} y1={baseline - 3} y2={baseline + 3} stroke="currentColor" />}
          {v != null && <rect className={side === "burn" || v < 0 ? "hb-chart-negative hb-down" : "hb-chart-positive hb-up"} x={x(date) + 1} y={side || v >= 0 ? baseline - height : baseline} width={Math.max(1, bw - 2)} height={height} fill="currentColor" opacity={!hovered || hoverDate === date ? 1 : 0.45} />}
        </g>;
      })}
    </svg>
    <p className="hb-caption">{caption}</p>
    <div className="hb-axis-note">{hovered ? `${utcObservation(hovered.date)} UTC · ${valueLine(hovered.hour)}` : side ? `${side === "mint" ? "minted" : "burned"} each hour${rows.some((r) => r.hour && r.hour.valuation !== "complete") ? " · lower bounds" : ""}` : "net minted above, net burned below"}</div>
    <details><summary>View values</summary><table className="hb-table"><caption>Hourly flow observations (UTC)</caption><thead><tr><th scope="col"><span className="hb-sc">Hour (UTC)</span></th><th scope="col"><span className="hb-sc">Value</span></th><th scope="col"><span className="hb-sc">Valuation</span></th></tr></thead><tbody>{rows.map(({ date, hour }) => <tr key={date}><th scope="row">{utcObservation(date)}</th><td className="hb-wrap">{valueLine(hour)}</td><td>{hour?.valuation ?? (hour ? "Unknown" : "Missing")}</td></tr>)}</tbody></table></details>
  </div>;
}
export const TideBars = ({ hourly }: { hourly: FlowHour[] }) => <FlowChart hourly={hourly} />;
export const FlowBars = ({ hourly, side }: { hourly: FlowHour[]; side: "mint" | "burn" }) => <FlowChart hourly={hourly} side={side} />;
