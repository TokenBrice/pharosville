"use client";

import { formatHourLabel } from "../lib/pharosville-clock";
import Eye from "lucide-react/dist/esm/icons/eye";
import Moon from "lucide-react/dist/esm/icons/moon";
import Pause from "lucide-react/dist/esm/icons/pause";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
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
  onResetView?: () => void;
  onToggleNightMode?: () => void;
  onToggleObserve?: () => void;
}

/** Compact view controls, with light and stillness behind a native disclosure. */
export function WorldControls({
  headingId = "pharosville-world-controls-title",
  nightMode = false,
  observing = false,
  onResetView,
  onToggleNightMode,
  onToggleObserve,
  onLightControlsOpen,
  hour = 12, manualTime = false, onChangeHour, onLocalTime, still = false, osReducedMotion = false, onChangeStill,
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

      {onToggleObserve && <button type="button" className="pv-glyph-button" data-observe-control onClick={onToggleObserve} aria-pressed={observing} aria-label={observing ? "Stop observing" : "Observe harbor"} title={observing ? "Stop observing" : "Observe harbor"}>
        {observing ? <Pause aria-hidden="true" size={19} /> : <Eye aria-hidden="true" size={19} />}
      </button>}
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
  );
}
