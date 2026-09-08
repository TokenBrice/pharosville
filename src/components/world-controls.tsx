"use client";

import { useState } from "react";
import { formatHourLabel } from "../lib/pharosville-clock";
import BookOpen from "lucide-react/dist/esm/icons/book-open";
import Eye from "lucide-react/dist/esm/icons/eye";
import Menu from "lucide-react/dist/esm/icons/menu";
import Moon from "lucide-react/dist/esm/icons/moon";
import Pause from "lucide-react/dist/esm/icons/pause";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Search from "lucide-react/dist/esm/icons/search";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Sun from "lucide-react/dist/esm/icons/sun";

export interface WorldControlsProps {
  headingId?: string;
  onLightControlsOpen?: (open: boolean) => void;
  hour?: number;
  manualTime?: boolean;
  onChangeHour?: (hour: number) => void;
  onLocalTime?: () => void;
  still?: boolean;
  osReducedMotion?: boolean;
  onChangeStill?: (still: boolean) => void;
  nightMode?: boolean;
  observing?: boolean;
  onOpenFind?: () => void;
  onOpenLegend?: () => void;
  onOpenLedger?: () => void;
  onResetView?: () => void;
  onToggleNightMode?: () => void;
  onToggleObserve?: () => void;
}

/** One resting affordance with the inspection and view controls behind it. */
export function WorldControls({
  headingId = "pharosville-world-controls-title",
  nightMode = false,
  observing = false,
  onOpenFind,
  onOpenLegend,
  onOpenLedger,
  onResetView,
  onToggleNightMode,
  onToggleObserve,
  onLightControlsOpen,
  hour = 12,
  manualTime = false,
  onChangeHour,
  onLocalTime,
  still = false,
  osReducedMotion = false,
  onChangeStill,
}: WorldControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const actionsId = `${headingId}-actions`;

  return (
    <div
      className="pharosville-world-controls"
      role="toolbar"
      aria-labelledby={headingId}
      data-expanded={expanded ? "true" : "false"}
      data-testid="pharosville-world-controls"
    >
      <h2 id={headingId} className="sr-only">World controls</h2>

      <div id={actionsId} className="pharosville-world-controls__revealed">
        {onOpenFind && (
          <button type="button" className="pv-chrome-action" onClick={onOpenFind}>
            <Search aria-hidden="true" size={17} />
            <span>Find</span>
            <kbd>/</kbd>
          </button>
        )}
        {onOpenLegend && (
          <button type="button" className="pv-chrome-action" onClick={onOpenLegend}>
            <BookOpen aria-hidden="true" size={17} />
            <span>Legend</span>
          </button>
        )}
        {onOpenLedger && (
          <button type="button" className="pv-chrome-action" onClick={onOpenLedger}>
            <ScrollText aria-hidden="true" size={17} />
            <span>Harbor ledger</span>
          </button>
        )}
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
            {observing ? <Pause aria-hidden="true" size={19} /> : <Eye aria-hidden="true" size={19} />}
          </button>
        )}
        <details className="pharosville-light-control" onToggle={(event) => onLightControlsOpen?.(event.currentTarget.open)}>
          <summary className="pv-glyph-button" aria-label={`Light and motion: ${formatHourLabel(hour)}${manualTime ? " manual" : " local"}`} title="Light and motion">
            {hour < 6 || hour >= 20 ? <Moon aria-hidden="true" size={19} /> : <Sun aria-hidden="true" size={19} />}
          </summary>
          <div className="pharosville-light-control__panel">
            <label>Time of day <input type="time" step="900" value={formatHourLabel(hour)} onChange={(event) => {
              const [hours, minutes] = event.target.value.split(":").map(Number);
              if (hours !== undefined && minutes !== undefined) onChangeHour?.(hours + minutes / 60);
            }} /></label>
            <button type="button" onClick={onLocalTime}>Local time</button>
            <button type="button" onClick={onToggleNightMode}>{nightMode ? "Day preset" : "Night preset"}</button>
            <label><input type="checkbox" checked={still} disabled={osReducedMotion} onChange={(event) => onChangeStill?.(event.target.checked)} /> Still</label>
            {osReducedMotion && <small>Reduced motion follows your system setting.</small>}
          </div>
        </details>
      </div>

      <button
        type="button"
        className="pharosville-world-controls__affordance"
        id="pharosville-find"
        aria-controls={actionsId}
        aria-expanded={expanded}
        aria-label="Explore harbor controls"
        onClick={() => setExpanded((open) => !open)}
      >
        <Menu aria-hidden="true" size={18} />
        <span>Explore</span>
        <kbd>/</kbd>
      </button>
    </div>
  );
}
