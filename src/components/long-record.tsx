"use client";

import { useId } from "react";
import {
  LONG_RECORD_RECENT_DAYS,
  longRecordMonthLabel,
  longRecordScoreLabel,
  longRecordSummary,
  type LongRecordModel,
} from "../systems/long-record";

const DAY_MS = 24 * 60 * 60 * 1000;
// The card's content column is ~340 px, so one viewBox unit is ~one pixel and
// the year labels stay at the 12 px type floor.
const WIDTH = 340;
const HEIGHT = 102;
const RIDGE_TOP = 6;
const RIDGE_BOTTOM = 72;
const STONE_Y = 80;
const TICK_TOP = 85;
const LABEL_BASELINE = 100;

/**
 * X7 — the Long Record: every daily PSI close brushed as one ink ridge, the
 * last thirty days washed in moss, today a dot, and a small stone under each
 * month a stablecoin died. One line, year ticks, hover titles on the two
 * valleys — never a chart widget. The SVG is an image with a summary; the
 * yearly table beneath it is the screen reader's copy of the figures.
 */
export function LongRecord({ record }: { record: LongRecordModel }) {
  const summaryId = useId();
  const span = Math.max(1, record.lastAt - record.firstAt);
  const x = (at: number) => ((at - record.firstAt) / span) * WIDTH;
  const y = (score: number) => RIDGE_BOTTOM - (Math.max(0, Math.min(100, score)) / 100) * (RIDGE_BOTTOM - RIDGE_TOP);
  let ridge = "";
  for (const [index, point] of record.points.entries()) {
    ridge += `${index === 0 ? "M" : "L"}${x(point.at).toFixed(1)} ${y(point.score).toFixed(1)}`;
  }
  const wash = `${ridge}L${WIDTH} ${RIDGE_BOTTOM}L0 ${RIDGE_BOTTOM}Z`;
  const recentX = x(record.lastAt - LONG_RECORD_RECENT_DAYS * DAY_MS);
  const firstYear = new Date(record.firstAt).getUTCFullYear();
  const lastYear = new Date(record.lastAt).getUTCFullYear();
  const yearTicks: { year: number; x: number }[] = [];
  for (let year = firstYear + 1; year <= lastYear; year += 1) {
    yearTicks.push({ year, x: x(Date.UTC(year, 0, 1)) });
  }
  const summary = longRecordSummary(record);

  return (
    <section className="pv-long-record" aria-labelledby={`${summaryId}-title`} data-testid="pharosville-long-record">
      <h3 id={`${summaryId}-title`} className="pv-section-title">The long record</h3>
      <svg
        className="pv-long-record__scroll"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={summaryId}
      >
        <title id={summaryId}>{summary}</title>
        <rect x={recentX} y={RIDGE_TOP - 4} width={WIDTH - recentX} height={RIDGE_BOTTOM - RIDGE_TOP + 4} opacity={0.22} style={{ fill: "var(--moss)" }} />
        <path d={wash} fill="currentColor" opacity={0.08} />
        <path d={ridge} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
        {record.lows.map((low) => (
          <circle key={low.at} cx={x(low.at)} cy={y(low.score)} r={6} fill="transparent" stroke="currentColor" strokeWidth={0.8} strokeOpacity={0.45}>
            <title>{`${longRecordMonthLabel(low.at)} — low ${longRecordScoreLabel(low.score)}`}</title>
          </circle>
        ))}
        <circle cx={WIDTH} cy={y(record.latestScore)} r={2.5} fill="currentColor" />
        <g className="pv-long-record__marks" fill="currentColor" stroke="currentColor" textAnchor="middle">
          {record.deaths.map((month) => (
            <ellipse
              key={month.month}
              cx={x(month.at)}
              cy={STONE_Y}
              rx={1.8 + Math.min(month.symbols.length, 5) * 0.5}
              ry={1.3 + Math.min(month.symbols.length, 5) * 0.3}
              opacity={0.7}
              stroke="none"
            >
              <title>{`${longRecordMonthLabel(month.at)} — ${month.symbols.join(", ")}`}</title>
            </ellipse>
          ))}
          {yearTicks.map((tick) => (
            <g key={tick.year}>
              <line x1={tick.x} x2={tick.x} y1={TICK_TOP} y2={TICK_TOP + 3} strokeWidth={0.8} />
              {tick.year % 2 === 0 && <text x={tick.x} y={LABEL_BASELINE} stroke="none">{tick.year}</text>}
            </g>
          ))}
        </g>
      </svg>
      <p className="pv-long-record__note">PSI is an index; lows are daily closes.</p>
      <table className="sr-only">
        <caption>PSI by year, with stablecoins that died that year</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Low</th>
            <th scope="col">Average</th>
            <th scope="col">Died</th>
          </tr>
        </thead>
        <tbody>
          {record.years.map((year) => (
            <tr key={year.year}>
              <th scope="row">{year.year}</th>
              <td>{longRecordScoreLabel(year.low)}</td>
              <td>{longRecordScoreLabel(year.average)}</td>
              <td>{year.deaths}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
