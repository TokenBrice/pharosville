"use client";

import X from "lucide-react/dist/esm/icons/x";
import { visitSnapshotDeltaSummary, type VisitSnapshotDelta } from "../hooks/use-visit-snapshot";

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
      className="pv-notice pv-notice--visit pharosville-since-last-visit"
      aria-label="Since last visit"
      aria-live="polite"
      aria-atomic="true"
      data-testid="pharosville-since-last-visit"
      role="status"
    >
      <span className="pv-notice__text">{summary}</span>
      <button
        type="button"
        aria-label="Dismiss since last visit update"
        className="pv-notice__dismiss"
        title="Dismiss"
        onClick={onDismiss}
      >
        <X aria-hidden="true" size={14} strokeWidth={2.2} />
      </button>
    </aside>
  );
}
