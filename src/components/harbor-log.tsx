"use client";

import type { CSSProperties } from "react";
import X from "lucide-react/dist/esm/icons/x";
import type { HarborLogEntry } from "../hooks/use-harbor-log";

const logStyle: CSSProperties = {
  position: "absolute",
  bottom: 64,
  left: 30,
  zIndex: 7,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  maxWidth: "min(420px, calc(100% - 96px))",
  padding: "6px 8px 6px 11px",
  border: "1px solid rgba(216, 184, 122, 0.48)",
  borderRadius: 3,
  background: "linear-gradient(180deg, rgba(31, 20, 12, 0.92), rgba(9, 15, 20, 0.9))",
  boxShadow: "0 10px 24px rgba(0, 0, 0, 0.34)",
  color: "rgba(248, 236, 205, 0.9)",
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: "0.76rem",
  lineHeight: 1.3,
  pointerEvents: "auto",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.68rem",
  fontStyle: "italic",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "rgba(216, 184, 122, 0.85)",
};

const entryButtonStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  border: 0,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
  textDecoration: "underline",
  textDecorationColor: "rgba(216, 184, 122, 0.45)",
  textUnderlineOffset: 2,
};

const dismissButtonStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  padding: 0,
  border: "1px solid rgba(216, 184, 122, 0.34)",
  borderRadius: 2,
  background: "rgba(8, 14, 20, 0.54)",
  color: "var(--pv-brass-highlight)",
  cursor: "pointer",
};

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
      data-testid="pharosville-harbor-log"
      role="log"
      style={logStyle}
    >
      <div style={headerStyle}>
        <p style={titleStyle}>Harbor log</p>
        <button
          type="button"
          aria-label="Dismiss harbor log"
          title="Dismiss"
          style={dismissButtonStyle}
          onClick={onDismiss}
        >
          <X aria-hidden="true" size={13} strokeWidth={2.2} />
        </button>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              style={entryButtonStyle}
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
