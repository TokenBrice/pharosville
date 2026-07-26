"use client";

import Eye from "lucide-react/dist/esm/icons/eye";
import Moon from "lucide-react/dist/esm/icons/moon";
import Pause from "lucide-react/dist/esm/icons/pause";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Sun from "lucide-react/dist/esm/icons/sun";

export interface WorldControlsProps {
  headingId?: string;
  nightMode?: boolean;
  observing?: boolean;
  onResetView?: () => void;
  onToggleNightMode?: () => void;
  onToggleObserve?: () => void;
}

/**
 * The world's only persistent controls: recenter, observe, day/night. They idle
 * faint and come up to full on hover, on focus, and for a beat after any camera
 * input (the shell sets `data-recent-input` for that). Everything the retired
 * toolbar carried beyond these three is either gone or reachable from the URL —
 * see `agents/2026-07-25-interface-revamp-plan.md` DU1/DU10.
 */
export function WorldControls({
  headingId = "pharosville-world-controls-title",
  nightMode = false,
  observing = false,
  onResetView,
  onToggleNightMode,
  onToggleObserve,
}: WorldControlsProps) {
  return (
    <div
      className="pharosville-world-controls"
      role="toolbar"
      aria-labelledby={headingId}
      data-testid="pharosville-world-controls"
    >
      <h2 id={headingId} className="sr-only">World controls</h2>

      <button
        type="button"
        className="pv-glyph-button"
        onClick={onResetView}
        disabled={!onResetView}
        aria-label="Reset view"
        title="Reset view"
      >
        <RotateCcw aria-hidden="true" size={19} />
      </button>

      {onToggleObserve && (
        <button
          type="button"
          className="pv-glyph-button"
          data-observe-control
          onClick={onToggleObserve}
          aria-pressed={observing}
          aria-label={observing ? "Stop observing" : "Observe harbor"}
          title={observing ? "Stop observing" : "Observe harbor"}
        >
          {observing
            ? <Pause aria-hidden="true" size={19} />
            : <Eye aria-hidden="true" size={19} />}
        </button>
      )}

      <button
        type="button"
        className="pv-glyph-button"
        onClick={onToggleNightMode}
        aria-pressed={nightMode}
        aria-label={nightMode ? "Switch to day" : "Switch to night"}
        title={nightMode ? "Switch to day" : "Switch to night"}
      >
        {nightMode ? <Sun aria-hidden="true" size={19} /> : <Moon aria-hidden="true" size={19} />}
      </button>
    </div>
  );
}
