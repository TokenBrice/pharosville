import { useEffect, useRef } from "react";
import { BOATS_GUIDE, BOAT_SIGNALS_RULE, FOG_GUIDE, PHAROS_GUIDE, SAIL_RULE, SEA_RULE, STATION_RULE } from "./facts";
import { useStore, useUISlice } from "./hooks";
import { readingSentence } from "./source-state";
import type { EndpointKey } from "../model/types";
import type { PickHit } from "./services";

const STOPS: Array<{ title: string; body: string; target: string; sources: EndpointKey[] }> = [
  { title: "The Pharos: market-wide stability", body: PHAROS_GUIDE, target: "pharos", sources: ["stability"] },
  { title: "Boats and piers: supply by chain", body: BOATS_GUIDE, target: "far-ports", sources: ["stablecoins"] },
  { title: "The Shoals: off-peg coins", body: `${SAIL_RULE} ${SEA_RULE}`, target: "shoals", sources: ["stablecoins", "pegSummary"] },
  { title: "Weather: early warning", body: `${STATION_RULE} ${BOAT_SIGNALS_RULE}`, target: "storm-mast", sources: ["stablecoins", "stress"] },
  { title: "The Keeper’s Log: freshness", body: `Fog means stale data. ${FOG_GUIDE}`, target: "keeperslog", sources: [] },
];
export function guideStopFor(hit: PickHit): number | null {
  if (hit.kind === "boat" || hit.kind === "harbour") return 1;
  if (hit.kind !== "landmark") return null;
  return hit.id === "pharos" || hit.id === "chartroom" ? 0
    : hit.id === "far-ports" || hit.id === "the-roads" || hit.id === "registry" ? 1
      : hit.id === "shoals" ? 2 : hit.id === "storm-mast" ? 3 : hit.id === "keeperslog" ? 4 : null;
}

/** Mount beside the help sheet; it remains silent until startGuide() is explicitly called. */
export function Guide() {
  const stop = useUISlice((s) => s.guideStop);
  return stop == null ? null : <GuideReading stop={stop} />;
}
function GuideReading({ stop }: { stop: number }) {
  const store = useStore(), model = useUISlice((s) => s.model);
  const head = useRef<HTMLHeadingElement>(null), inspected = useRef(false);
  useEffect(() => {
    const origin = document.activeElement;
    return () => {
      if (inspected.current) return;
      const target = origin instanceof HTMLElement && origin !== document.body && origin.isConnected ? origin : document.querySelector<HTMLElement>(".hb-mark-btn");
      target?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => { head.current?.focus({ preventScroll: true }); }, [stop]);
  const reading = STOPS[stop];
  const boat = stop === 1 ? model?.boats.find((b) => b.state !== "wrecked") : null;
  const hit: PickHit = boat ? { kind: "boat", id: boat.id } : { kind: "landmark", id: reading.target };
  const available = !!store.picking.worldPosition(hit);
  return <section className="hb-guide hb-paper hb-neat" role="dialog" aria-modal="false" aria-labelledby="hb-guide-title" onKeyDown={(e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); store.closeGuide(); }
  }}>
    <h2 id="hb-guide-title" className="hb-sec-h">How to read the harbour</h2>
    <p className="hb-caption">{stop + 1} of {STOPS.length}</p>
    <h3 className="hb-title" tabIndex={-1} ref={head}>{reading.title}</h3>
    <p>{reading.body}</p>
    {reading.sources.map((source) => <p key={source} className="hb-caption">{readingSentence(model, source)}</p>)}
    {!available && <p className="hb-caption">This subject is unavailable here. You can still read its explanation.</p>}
    <div className="hb-reading-actions">
      <button type="button" disabled={stop === 0} onClick={() => store.startGuide(stop - 1)}>Back</button>
      <button type="button" disabled={stop === STOPS.length - 1} onClick={() => store.startGuide(stop + 1)}>Next</button>
      <button type="button" disabled={!available} onClick={() => { inspected.current = true; store.closeGuide(); store.select(hit); }}>Inspect reading</button>
      <button type="button" onClick={() => store.closeGuide()}>Close guide</button>
    </div>
  </section>;
}
