"use client";

import LocateFixed from "lucide-react/dist/esm/icons/locate-fixed";
import Moon from "lucide-react/dist/esm/icons/moon";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Sun from "lucide-react/dist/esm/icons/sun";
import SunMoon from "lucide-react/dist/esm/icons/sun-moon";
import Timer from "lucide-react/dist/esm/icons/timer";

export interface WorldToolbarProps {
  autoNightCycle?: boolean;
  headingId?: string;
  manualTimeOverrideHour?: number | null;
  nightMode?: boolean;
  selectedDetailId?: string | null;
  timeOfDayHour?: number;
  zoomLabel?: string;
  onClearTimeOverride?: () => void;
  onFollowSelected?: () => void;
  onResetView?: () => void;
  onTimeOfDayChange?: (hour: number) => void;
  onToggleAutoNightCycle?: () => void;
  onToggleNightMode?: () => void;
}

export function WorldToolbar({
  autoNightCycle = false,
  headingId = "pharosville-world-toolbar-title",
  manualTimeOverrideHour = null,
  nightMode = false,
  selectedDetailId,
  timeOfDayHour = nightMode ? 22 : 12,
  zoomLabel = "100%",
  onClearTimeOverride,
  onFollowSelected,
  onResetView,
  onTimeOfDayChange,
  onToggleAutoNightCycle,
  onToggleNightMode,
}: WorldToolbarProps) {
  const normalizedHour = normalizeHour(manualTimeOverrideHour ?? timeOfDayHour);
  const timeLabel = formatHourLabel(normalizedHour);

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

      <div className={manualTimeOverrideHour === null ? "pv-time-control" : "pv-time-control pv-time-control--manual"}>
        <Timer aria-hidden="true" size={17} />
        <output className="pv-time-control__badge" aria-label="Time of day">{timeLabel}</output>
        <input
          type="range"
          min="0"
          max="23.75"
          step="0.25"
          value={normalizedHour}
          onChange={(event) => onTimeOfDayChange?.(Number(event.currentTarget.value))}
          aria-label="Set session hour"
          disabled={!onTimeOfDayChange}
        />
      </div>

      {manualTimeOverrideHour !== null && onClearTimeOverride && (
        <button
          type="button"
          className="pv-brass-button pv-brass-button--compact"
          onClick={onClearTimeOverride}
          aria-label="Return to day-night preset"
          title="Return to day-night preset"
        >
          <SunMoon aria-hidden="true" size={16} />
        </button>
      )}

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

      <button
        type="button"
        className="pv-brass-button"
        onClick={onToggleNightMode}
        aria-pressed={nightMode}
        aria-label={nightMode ? "Switch to day" : "Switch to night"}
        title={nightMode ? "Switch to day" : "Switch to night"}
      >
        {nightMode ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
      </button>

      {onToggleAutoNightCycle && (
        <button
          type="button"
          className="pv-brass-button"
          onClick={onToggleAutoNightCycle}
          aria-pressed={autoNightCycle}
          aria-label={autoNightCycle ? "Disable auto day-night cycle" : "Enable auto day-night cycle"}
          title={autoNightCycle ? "Auto day-night: on" : "Auto day-night: off"}
        >
          <SunMoon aria-hidden="true" size={18} />
        </button>
      )}
    </div>
  );
}

function normalizeHour(hour: number): number {
  if (!Number.isFinite(hour)) return 12;
  return ((hour % 24) + 24) % 24;
}

function formatHourLabel(hour: number): string {
  const totalMinutes = Math.round(normalizeHour(hour) * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
