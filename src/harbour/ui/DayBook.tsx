import { useEffect, useState } from "react";
import type { DayBookEntry } from "../model/event-hub";
import { dayBookLine } from "../model/events";
import { CEREMONY_RULE } from "./facts";
import { utcObservation } from "./charts";
import { READING_NAMES } from "./source-state";
import { useStore } from "./hooks";

const clock = (ms: number) => `${utcObservation(ms / 1000)} UTC`;

/** The Day book: every confirmed change since the viewer arrived (model/events.ts), newest first. */
export function DayBook({ open = true }: { open?: boolean }) {
  const store = useStore();
  const ev = store.ctx.services.get("events");
  const [, bump] = useState(0);
  const [visible, setVisible] = useState(40);
  const [focused, setFocused] = useState<DayBookEntry | null>(null);
  const [notice, setNotice] = useState({ text: "", version: 0 });
  useEffect(() => {
    if (!open) return;
    let seen = new Set(ev?.book.map((e) => e.id));
    return ev?.subscribe(() => {
      const added = ev.book.filter((e) => !seen.has(e.id));
      seen = new Set(ev.book.map((e) => e.id));
      const count = added.filter((e) => !e.dev).length;
      if (count) setNotice((old) => ({ text: `${count} new entries.`, version: old.version + 1 }));
      bump((n) => n + 1);
    });
  }, [ev, open]);
  if (!ev) return null;
  const book = ev.book;
  const shown = book.slice(0, visible);
  if (focused && !shown.some((e) => e.id === focused.id)) shown.push(focused);
  return (
    <section className="hb-sec"><h3 className="hb-sec-h hb-sc"><span>Day book · since you arrived at <span className="hb-num">{clock(ev.arrivedAtMs)}</span></span></h3>
      <div className="hb-sr" aria-live="polite"><span key={notice.version}>{notice.text}</span></div>
      {book.length ? (
        <ol className="hb-list hb-daybook">
          {shown.map((e) => {
            const line = dayBookLine(e, clock(e.atMs));
            return (
              <li key={e.id} onFocus={() => setFocused(e)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null); }}>
                {e.coinId ? <button type="button" className="hb-row" onClick={() => store.select({ kind: "boat", id: e.coinId! })}><span>{e.dev ? <em>{line}</em> : line}</span></button>
                  : <div className="hb-row"><span>{e.dev ? <em>{line}</em> : line}</span></div>}
                <details><summary>Observation details</summary>
                  <p>First observed {clock(e.firstSeenMs)}; confirmed {clock(e.atMs)}.</p>
                  <p>Source: {READING_NAMES[e.endpoint]}. {e.field}: {e.from ?? "—"} → {e.to ?? "—"}. {e.staged ? "Staged in the harbour." : "Recorded without a ceremony."}</p>
                </details>
              </li>
            );
          })}
        </ol>
      ) : <p className="hb-empty">No confirmed changes recorded this visit.</p>}
      <p className="hb-caption">Showing {shown.filter((e) => book.some((retained) => retained.id === e.id)).length} of {book.length} retained entries; {ev.droppedCount} earlier entries discarded.</p>
      {focused && !book.some((e) => e.id === focused.id) && <p className="hb-caption">The focused entry is no longer retained; it stays here until focus leaves it.</p>}
      {book.length > 0 && <p className="hb-caption">Earliest retained confirmation: {clock(book[book.length - 1].atMs)}.</p>}
      {book.length > visible && <button type="button" className="hb-textbtn" onClick={() => setVisible((n) => n + 40)}>Show earlier entries</button>}
      <p className="hb-caption">{CEREMONY_RULE}</p>
      <p className="hb-caption">State changes require two consecutive accepted readings. Completed, fully valued flow hours are evaluated once per new hour. Missing, stale and methodology-change readings do not establish market changes.</p>
    </section>
  );
}

