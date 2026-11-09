import { useState } from "react";
import { resolveChainId } from "@shared/lib/chains";
import { canonicalSubjectUrl, pickToSubject } from "@shared/lib/selection-link";
import { useUISlice } from "../hooks";

export function PanelActions() {
  const selected = useUISlice((s) => s.selected);
  const chart = useUISlice((s) => s.chartMode);
  const [result, setResult] = useState<{ url: string; copied: boolean } | null>(null);
  if (!selected) return null;
  const subject = pickToSubject(selected);
  if (subject.kind === "chain") subject.id = resolveChainId(subject.id) ?? subject.id;
  const url = canonicalSubjectUrl(subject, chart);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setResult({ url, copied: true });
    } catch { setResult({ url, copied: false }); }
  };
  return <div className="hb-panel-actions" style={{ minHeight: 44 }}>
    <button type="button" className="hb-control hb-textbtn" style={{ minWidth: 44, minHeight: 44, position: "absolute", top: 12, right: "calc(20px + var(--ctl))" }} onClick={() => void copy()}>Copy link</button>
    <div className="hb-caption" role="status" aria-live="polite" style={{ paddingTop: result?.url === url ? 44 : undefined }}>
      {result?.url === url && (result.copied ? "Link copied. Opens latest readings." : <label>Copy this link:
        <input aria-label="Copy this link:" readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ width: "100%", minHeight: 44 }} />
      </label>)}
    </div>
  </div>;
}

export function PanelOutbound() {
  const selected = useUISlice((s) => s.selected);
  const directory = selected?.kind === "boat" ? ["stablecoins", "Stablecoins on Pharos analytics"]
    : selected?.kind === "harbour" ? ["chains", "Chains on Pharos analytics"] : null;
  if (!directory) return null;
  return <p className="hb-caption"><a className="hb-out" href={`https://pharos.watch/${directory[0]}/`} target="_blank" rel="noopener noreferrer">
    {directory[1]}<span aria-hidden="true"> ↗</span><span className="hb-sr"> (opens in a new tab)</span>
  </a></p>;
}
