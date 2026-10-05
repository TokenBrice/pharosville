import type { GardenMonthRecord } from "../systems/world-types";
import { gardenMonthRecordLabel } from "../systems/garden-month-record";
import { nodeSourceEvidenceLabel } from "../systems/source-evidence";

/** One DOM implementation for the lighthouse record and complete ledger. */
export function GardenMonthRecordTable({ record }: { record: GardenMonthRecord }) {
  const evidence = record.evidence ? nodeSourceEvidenceLabel({ stability: record.evidence }) : "History source observation unknown; publication time unknown.";
  return (
    <section className="pharosville-detail-panel__section" aria-label="Garden record, 30d" data-testid="garden-month-record-table">
      <p>{gardenMonthRecordLabel(record)}</p>
      <p>{evidence}</p>
      <div role="region" aria-label="Daily PSI table, horizontally scrollable" tabIndex={0} style={{ overflowX: "auto" }}>
        <table>
          <caption>Official PSI daily closes · UTC · {record.windowStartDay ?? "no supplied start"} to {record.windowEndDay ?? "no supplied end"}</caption>
          <thead><tr><th scope="col">UTC day</th><th scope="col">PSI / 100</th><th scope="col">Band</th><th scope="col">Methodology</th><th scope="col">Supplied close time</th><th scope="col">Continuity</th></tr></thead>
          <tbody>{record.days.map((point, index) => {
            const previous = record.days[index - 1];
            const continuity = point.gap ? "Gap — no supplied close" : !point.methodologyVersion
              ? "Methodology unknown — not joined" : previous && !previous.gap && previous.methodologyVersion !== point.methodologyVersion
              ? "Methodology edge — not joined" : previous?.gap ? "After gap — not joined" : "Supplied close";
            return <tr key={point.day}>
              <th scope="row"><time dateTime={point.day}>{point.day}</time></th>
              <td>{point.score ?? "Unavailable"}</td><td>{point.band ?? "Unavailable"}</td><td>{point.methodologyVersion || "Unknown"}</td>
              <td>{point.at === null ? "Not supplied" : <time dateTime={new Date(point.at).toISOString()}>{new Date(point.at).toISOString()}</time>}</td>
              <td>{continuity}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}
