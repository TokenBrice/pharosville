import type { PanelPayload } from "@shared/types/pharosville-panels";

function EventTime({ seconds }: { seconds: number }) {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return <>(date unavailable)</>;
  const iso = date.toISOString();
  return <time dateTime={iso}>{iso.replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}</time>;
}

function duration(start: number, end: number) {
  const seconds = end - start;
  if (seconds < 0) return "Recorded duration unavailable.";
  if (seconds < 60) return `Recorded duration: ${seconds} s.`;
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
  const parts = [days && `${days} d`, hours && `${hours} h`, minutes && `${minutes} min`].filter(Boolean);
  return `Recorded duration: ${parts.join(" ")}.`;
}

export function DepegHistory({ data }: { data: PanelPayload<"depegEvents"> }) {
  const events = [...data.events].sort((a, b) => b.startedAt - a.startedAt).slice(0, 30);
  return <>
    {events.length ? <ol className="hb-list hb-events" aria-label="Depeg events, newest first">
      {events.map((event, index) => <li key={index}>
        <p>Started <EventTime seconds={event.startedAt} />.</p>
        <p>{event.endedAt == null ? "Ongoing recorded event" : <>Ended <EventTime seconds={event.endedAt} />. {duration(event.startedAt, event.endedAt)}</>}</p>
        <p>Peak deviation: {Math.abs(event.peakDeviationBps)} bps {event.direction} peg. {event.source === "live" ? "Live record." : "Backfill record."}</p>
      </li>)}
    </ol> : <p className="hb-empty">No recorded events were returned. An empty history does not imply safety.</p>}
    {data.total > events.length && <p className="hb-caption">Showing {events.length} of {data.total} recorded events.</p>}
    <p className="hb-caption">Methodology: {data.methodology?.version ?? "Version unavailable."}</p>
  </>;
}
