import { useState } from "react";
import { RUNTIME_ACTIVE_IDS } from "@shared/lib/stablecoins/runtime-active-ids";
import { PHAROSVILLE_PANEL_ENDPOINT_REGISTRY, type PanelEndpointKey } from "@shared/lib/pharosville-panel-endpoints";
import type { HarbourModel } from "../../model/types";
import { truthCopy } from "../truth-copy";
import { ReadingContent } from "./ReadingContent";

const SECTIONS: { endpoint: PanelEndpointKey; title: string }[] = [
  { endpoint: "depegEvents", title: "Depeg history" },
  { endpoint: "stablecoinReserves", title: "Backing" },
  { endpoint: "dexLiquidity", title: "Liquidity" },
];

function ReadingSection({ id, endpoint, title }: typeof SECTIONS[number] & { id: string }) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reading = PHAROSVILLE_PANEL_ENDPOINT_REGISTRY[endpoint].label;
  return <details className="hb-sec" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="hb-sec-h hb-sc">{title}</summary>
    {open && (RUNTIME_ACTIVE_IDS.has(id)
      ? <ReadingContent key={attempt} id={id} endpoint={endpoint} reading={reading} retry={() => setAttempt((value) => value + 1)} />
      : <p className="hb-empty">{truthCopy({ kind: "reading", reading, truth: { state: "unavailable" } })}</p>)}
  </details>;
}

export function CoinReadings({ id }: { id: string; model: HarbourModel | null }) {
  return <>{SECTIONS.map((section) => <ReadingSection key={`${id}:${section.endpoint}`} id={id} {...section} />)}</>;
}
