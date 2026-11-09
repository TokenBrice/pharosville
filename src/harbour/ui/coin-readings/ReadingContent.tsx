import { useEffect, useState } from "react";
import { PHAROSVILLE_PANEL_ENDPOINT_REGISTRY, PANEL_RESERVES_MAX_AGE_SEC, type PanelEndpointKey } from "@shared/lib/pharosville-panel-endpoints";
import { FRESHNESS_RATIOS } from "@shared/lib/status-thresholds";
import { fetchPanelReading, type PanelReading } from "../../data/panel-fetch";
import { stamped } from "../bits";
import { useReadingNow } from "../source-state";
import { truthCopy, type ReadingName } from "../truth-copy";
import { DepegHistory } from "./DepegHistory";
import { Backing } from "./Backing";
import { Liquidity } from "./Liquidity";

export function ReadingContent({ id, endpoint, reading, retry }: { id: string; endpoint: PanelEndpointKey; reading: ReadingName; retry: () => void }) {
  const [result, setResult] = useState<PanelReading<typeof endpoint> | null>(null);
  const now = useReadingNow();
  useEffect(() => {
    const controller = new AbortController();
    void fetchPanelReading(endpoint, id, controller.signal).then((value) => {
      if (!controller.signal.aborted) setResult(value);
    }, () => {
      if (!controller.signal.aborted) setResult({ state: "unavailable", reason: "network", sourceUpdatedAtMs: null, data: null });
    });
    return () => controller.abort();
  }, [endpoint, id]);

  if (!result) return <p className="hb-caption" role="status">Waiting for {reading}.</p>;
  const maxAge = endpoint === "stablecoinReserves" ? PANEL_RESERVES_MAX_AGE_SEC
    : PHAROSVILLE_PANEL_ENDPOINT_REGISTRY[endpoint].metaMaxAgeSec * FRESHNESS_RATIOS.DEGRADED;
  // Age the visible observation without a timer-driven request.
  const state = result.state === "current" && result.sourceUpdatedAtMs != null && now - result.sourceUpdatedAtMs > maxAge * 1000 ? "stale" : result.state;
  const sentence = truthCopy({ kind: "reading", reading, truth: {
    state, sourceUpdatedAtMs: result.sourceUpdatedAtMs,
    reason: result.reason === "unverified-source" ? "unverified-source" : null,
  } });
  const failed = result.reason === "network" || result.reason === "http" || result.reason === "invalid-payload";
  return <>
    <p className="hb-caption" role="status">{stamped(sentence)}</p>
    {failed && <button type="button" className="hb-textbtn hb-control" onClick={retry}>Try again <span className="hb-sr">· {reading}</span></button>}
    {result.data && <>
      {state !== "current" && result.reason !== "no-observation" && <p className="hb-caption">{truthCopy({ kind: "retained-heading" })}</p>}
      {endpoint === "depegEvents" && <DepegHistory data={(result as PanelReading<"depegEvents">).data!} />}
      {endpoint === "stablecoinReserves" && <Backing data={(result as PanelReading<"stablecoinReserves">).data!} unverified={result.reason === "unverified-source" || result.sourceUpdatedAtMs == null} />}
      {endpoint === "dexLiquidity" && <Liquidity data={(result as PanelReading<"dexLiquidity">).data!} id={id} />}
    </>}
  </>;
}
