"use client";

import { LocateFixed, RotateCcw } from "lucide-react";

export interface WorldToolbarProps {
  headingId?: string;
  ledgerVisible?: boolean;
  selectedDetailId?: string | null;
  zoomLabel?: string;
  onFollowSelected?: () => void;
  onResetView?: () => void;
  onToggleLedger?: () => void;
}

export function WorldToolbar({
  headingId = "pharosville-world-toolbar-title",
  ledgerVisible = false,
  selectedDetailId,
  zoomLabel = "100%",
  onFollowSelected,
  onResetView,
  onToggleLedger,
}: WorldToolbarProps) {
  return (
    <div
      className="pharosville-world-toolbar pv-timber"
      role="toolbar"
      aria-labelledby={headingId}
      data-testid="pharosville-world-toolbar"
    >
      <h2 id={headingId} className="sr-only">World toolbar</h2>
      <span className="pv-corner-brass pv-corner-brass--tl" aria-hidden="true" />
      <span className="pv-corner-brass pv-corner-brass--tr" aria-hidden="true" />
      <span className="pv-corner-brass pv-corner-brass--bl" aria-hidden="true" />
      <span className="pv-corner-brass pv-corner-brass--br" aria-hidden="true" />

      <output className="pv-chip-zoom" aria-label="Current zoom">{zoomLabel}</output>

      <button
        type="button"
        className="pv-brass-button"
        onClick={onResetView}
        disabled={!onResetView}
        aria-label="Reset view"
        title="Reset view"
      >
        <RotateCcw aria-hidden="true" size={18} />
      </button>

      <button
        type="button"
        className="pv-brass-button"
        onClick={onFollowSelected}
        disabled={!onFollowSelected || !selectedDetailId}
        aria-label="Follow selected"
        title="Follow selected"
      >
        <LocateFixed aria-hidden="true" size={18} />
      </button>

      {onToggleLedger && (
        <button
          type="button"
          className="pv-brass-button pharosville-world-toolbar__ledger-button"
          aria-pressed={ledgerVisible}
          onClick={onToggleLedger}
          aria-label={ledgerVisible ? "Hide accessibility ledger" : "Show accessibility ledger"}
          title="Ledger"
        >
          Ledger
        </button>
      )}
    </div>
  );
}
