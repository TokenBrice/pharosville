"use client";

import X from "lucide-react/dist/esm/icons/x";
import type { HarborLogEntry } from "../hooks/use-harbor-log";

export function HarborLog({
  entries,
  onDismiss,
  onSelectDetail,
}: {
  entries: readonly HarborLogEntry[];
  onDismiss: () => void;
  onSelectDetail: (detailId: string) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <aside
      aria-label="Harbor log"
      className="pv-notice pv-notice--log"
      data-testid="pharosville-harbor-log"
      role="log"
    >
      <div className="pv-notice__header">
        <p className="pv-notice__title">Harbor log</p>
        <button
          type="button"
          aria-label="Dismiss harbor log"
          className="pv-notice__dismiss"
          title="Dismiss"
          onClick={onDismiss}
        >
          <X aria-hidden="true" size={13} strokeWidth={2.2} />
        </button>
      </div>
      <ol className="pv-notice__list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="pv-notice__entry"
              onClick={() => onSelectDetail(entry.detailId)}
            >
              {entry.message}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
