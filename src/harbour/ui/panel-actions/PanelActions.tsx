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
  return <div className="hb-panel-actions">
    <button type="button" className="hb-copy" onClick={() => void copy()}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 9.4l2.8-2.8M7.2 4.6l1.1-1.1a2.6 2.6 0 0 1 3.7 3.7l-1.1 1.1M8.8 11.4l-1.1 1.1A2.6 2.6 0 0 1 4 8.8l1.1-1.1" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      Copy link
    </button>
    <div className="hb-link-status" role="status" aria-live="polite">
      {result?.url === url && (result.copied ? "Link copied. Opens latest readings." : <label>Copy this link:
        <input aria-label="Copy this link:" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
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
