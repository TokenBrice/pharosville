import { dayOfYear, meteorShowerOn, moonAge, moonIllumination, SYNODIC_DAYS } from "../season/calendar";
import { useStore } from "./hooks";
import { useReadingNow } from "./source-state";
import { titleCase } from "./format";

export const CALENDAR_NOTE = "Solar timing uses a nominal latitude of 35°. This is decoration, not local astronomy or market data.";

export function DecorativeCalendar() {
  const store = useStore(), now = useReadingNow();
  const season = store.ctx.services.get("season");
  if (!season) return null;
  const date = new Date(now), age = moonAge(now);
  const phase = age < SYNODIC_DAYS / 2 ? "waxing" : "waning";
  const shower = meteorShowerOn(dayOfYear(date.getFullYear(), date.getMonth() + 1, date.getDate()), season.southern);
  return <details className="hb-sec hb-calendar"><summary>Decorative calendar</summary>
    <p className="hb-caption">{date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} · {season.southern ? "southern" : "northern"} hemisphere{season.overridden ? " · dev season override" : ""}</p>
    <dl className="hb-dl">
      <dt>Season</dt><dd>{titleCase(season.season)}</dd>
      <dt>Nominal day length</dt><dd>{Math.floor(Math.round(season.dayLengthHours * 60) / 60)} h {Math.round(season.dayLengthHours * 60) % 60} min</dd>
      <dt>Painted moon</dt><dd>{Math.round(moonIllumination(age) * 100)}% illuminated · {phase}</dd>
      <dt>Painted meteor period</dt><dd>{shower ? titleCase(shower.shower.name.replaceAll("-", " ")) : "Sporadic meteors"}</dd>
    </dl>
    <p className="hb-caption">{CALENDAR_NOTE}</p>
    <p className="hb-caption">Moon phase and painted meteor periods follow the calendar; they do not predict local visibility. Still mode keeps the same readings without motion.</p>
  </details>;
}
