import type { PanelPayload } from "@shared/types/pharosville-panels";
import { money } from "../format";

const EVIDENCE = { unobserved: "Unobserved", measured: "Measured", partial_measured: "Partially measured", observed_unmeasured: "Observed, unmeasured" };

export function Liquidity({ data, id }: { data: PanelPayload<"dexLiquidity">; id: string }) {
  const row = data[id];
  if (!row) return null;
  return <>
    {!row.hasMeasuredLiquidityEvidence && <p className="hb-empty">No measured liquidity evidence</p>}
    <dl className="hb-dl">
      <dt>Observed TVL (USD)</dt><dd>{money(row.totalTvlUsd)}</dd>
      <dt>Effective TVL (USD)</dt><dd>{money(row.effectiveTvlUsd)}</dd>
      <dt>Liquidity score</dt><dd>{row.liquidityScore == null ? "Not scored." : `${row.liquidityScore} / 100`}</dd>
      <dt>Coverage class</dt><dd>{row.coverageClass ?? "Not supplied."}</dd>
      <dt>Coverage confidence</dt><dd>{Number((row.coverageConfidence * 100).toFixed(2))}%</dd>
      <dt>Evidence class</dt><dd>{EVIDENCE[row.liquidityEvidenceClass]}</dd>
    </dl>
    <p className="hb-caption">TVL is not executable exit depth.</p>
    <p className="hb-caption">Methodology: {row.methodologyVersion}</p>
  </>;
}
