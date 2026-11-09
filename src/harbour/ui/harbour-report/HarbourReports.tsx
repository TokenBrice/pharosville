import { useMemo, useState, useSyncExternalStore } from "react";
import { useStore, useUISlice } from "../hooks";
import { getFeed } from "../services";
import { useReadingNow } from "../source-state";
import { browserObservation, returnDigest } from "./digest";
import { harbourReport, type ReportSentence } from "./report";
import { readingSession } from "./recorder";

export function ReportSentences({ sentences }: { sentences: ReportSentence[] }) {
  return <>{sentences.map((sentence, i) => <details className="hb-evidence" key={i}>
    <summary>{sentence.text}</summary>
    <table className="hb-table"><caption>Underlying readings</caption><tbody>{sentence.inputs.map(([label, value], j) => <tr key={j}><th scope="row">{label}</th><td className="hb-wrap">{value}</td></tr>)}</tbody></table>
  </details>)}</>;
}

export function HarbourReports() {
  const store = useStore(), model = useUISlice((s) => s.model), now = useReadingNow();
  const session = readingSession();
  const baseline = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [days, setDays] = useState<1 | 7>(1), [open, setOpen] = useState(false);
  const payloads = getFeed(store.ctx)?.payloads;
  const digest = useMemo(() => returnDigest(baseline.unavailable ? null : baseline.prior, browserObservation(model, payloads ?? {}, now)), [baseline, model, payloads, now]);
  const report = useMemo(() => open ? harbourReport(model, payloads ?? {}, days, now) : [], [open, model, payloads, days, now]);
  return <>
    <section className="hb-sec">
      <h3 className="hb-sec-h hb-sc">Since your last reading</h3>
      <ReportSentences sentences={digest} />
      <button type="button" className="hb-textbtn" onClick={() => session.forget()}>Forget saved reading</button>
    </section>
    <details className="hb-sec" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="hb-sec-h hb-sc">Harbour report</summary>
      {open && <>
        <div className="hb-tabs" role="group" aria-label="Report comparison window">
          <button type="button" className="hb-tab" aria-pressed={days === 1} onClick={() => setDays(1)}>24-hour comparison</button>{" "}
          <button type="button" className="hb-tab" aria-pressed={days === 7} onClick={() => setDays(7)}>Seven-day comparison</button>
        </div>
        <ReportSentences sentences={report} />
      </>}
    </details>
  </>;
}
