"use client";

import type { CSSProperties } from "react";
import X from "lucide-react/dist/esm/icons/x";
import { visitSnapshotDeltaSummary, type VisitSnapshotDelta } from "../hooks/use-visit-snapshot";

const bannerStyle: CSSProperties = {
  position: "absolute",
  top: 76,
  right: 32,
  zIndex: 8,
  display: "flex",
  alignItems: "center",
  gap: 8,
  maxWidth: "min(520px, calc(100% - 96px))",
  padding: "6px 8px 6px 11px",
  border: "1px solid rgba(216, 184, 122, 0.48)",
  borderRadius: 3,
  background: "linear-gradient(180deg, rgba(31, 20, 12, 0.92), rgba(9, 15, 20, 0.9))",
  boxShadow: "0 10px 24px rgba(0, 0, 0, 0.34)",
  color: "rgba(248, 236, 205, 0.9)",
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: "0.76rem",
  lineHeight: 1.25,
  pointerEvents: "auto",
};

const textStyle: CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const buttonStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  padding: 0,
  border: "1px solid rgba(216, 184, 122, 0.34)",
  borderRadius: 2,
  background: "rgba(8, 14, 20, 0.54)",
  color: "var(--pv-brass-highlight)",
  cursor: "pointer",
};

export function SinceLastVisitBanner({
  delta,
  onDismiss,
}: {
  delta: VisitSnapshotDelta | null;
  onDismiss: () => void;
}) {
  if (!delta) return null;

  const summary = visitSnapshotDeltaSummary(delta);
  if (!summary) return null;

  return (
    <aside
      className="pharosville-since-last-visit"
      aria-label="Since last visit"
      aria-live="polite"
      aria-atomic="true"
      data-testid="pharosville-since-last-visit"
      role="status"
      style={bannerStyle}
    >
      <span style={textStyle}>{summary}</span>
      <button
        type="button"
        aria-label="Dismiss since last visit update"
        title="Dismiss"
        style={buttonStyle}
        onClick={onDismiss}
      >
        <X aria-hidden="true" size={14} strokeWidth={2.2} />
      </button>
    </aside>
  );
}
