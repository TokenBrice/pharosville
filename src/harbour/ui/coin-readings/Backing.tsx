import type { PanelPayload } from "@shared/types/pharosville-panels";

const MODES = { live: "Live", "live-stale": "Live, stale", "curated-fallback": "Curated fallback", "template-fallback": "Template fallback", unavailable: "Unavailable" };
const words = (value: string) => value.replaceAll("-", " ");

export function Backing({ data, unverified }: { data: PanelPayload<"stablecoinReserves">; unverified: boolean }) {
  const estimated = data.estimated || data.mode === "curated-fallback" || data.mode === "template-fallback";
  const sum = data.reserves.reduce((total, slice) => total + slice.pct, 0);
  const links = [...new Set([data.displayUrl, ...(data.evidenceUrls ?? [])].filter((url): url is string => !!url))];
  return <>
    {estimated && <p className="hb-caption">Estimated reserve composition</p>}
    <dl className="hb-dl">
      <dt>Presentation mode</dt><dd>{MODES[data.mode]}</dd>
      <dt>Evidence class</dt><dd>{data.provenance ? words(data.provenance.evidenceClass) : "Not supplied."}</dd>
      <dt>Source model</dt><dd>{data.provenance ? words(data.provenance.sourceModel) : "Not supplied."}</dd>
    </dl>
    {(unverified || data.provenance?.freshnessMode !== "verified" || estimated) && <p className="hb-caption">Freshness unverified</p>}
    {data.mode !== "unavailable" && data.reserves.length ? <>
      <table className="hb-table">
        <caption>Reserves · {estimated ? "Estimated reserve composition" : "Reported reserve composition"}</caption>
        <thead><tr><th scope="col"><span>Name</span></th><th scope="col"><span>Share</span></th><th scope="col"><span>Risk</span></th></tr></thead>
        <tbody>{data.reserves.map((slice, index) => <tr key={index}><th scope="row">{slice.name}</th><td>{slice.pct}%</td><td className="hb-wrap">{words(slice.risk)}</td></tr>)}</tbody>
      </table>
      {Math.abs(sum - 100) > 0.000001 && <p className="hb-caption">Reported shares total {Number(sum.toFixed(6))}%; they do not reconcile to 100%.</p>}
    </> : <p className="hb-empty">No reserve slices are available.</p>}
    {!!links.length && <ul className="hb-caption" aria-label="Reserves evidence sources">{links.map((url) => <li key={url}>
      <a className="hb-out" href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}{" "}<span aria-hidden="true">↗</span><span className="hb-sr"> (source, opens in a new tab)</span></a>
    </li>)}</ul>}
    <p className="hb-caption">Reserve composition is not proof of solvency.</p>
  </>;
}
