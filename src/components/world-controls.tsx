"use client";

import { useState, type ReactNode } from "react";
import { formatHourLabel } from "../lib/pharosville-clock";
import Eye from "lucide-react/dist/esm/icons/eye";
import Moon from "lucide-react/dist/esm/icons/moon";
import Pause from "lucide-react/dist/esm/icons/pause";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import Sun from "lucide-react/dist/esm/icons/sun";

export interface WorldControlsProps {
  headingId?: string;
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
  onStay?: () => void;
  onStrollNext?: () => void;
  onStrollPrevious?: () => void;
  strollTitle?: string | null;
  onToggleNightMode?: () => void;
  onToggleObserve?: () => void;
  /**
   * C-A: further drawer controls (the sound control) join the revealed row
   * after the light drawer, built on the same `pv-drawer-control` pattern.
   */
  children?: ReactNode;
}

/**
 * Distinct resting actions: Find owns `/`; Explore discloses the view
 * controls. Disclosed controls keep their native keyboard order and paper drawers.
 */
export function WorldControls({
  headingId = "pharosville-world-controls-title",
  nightMode = false,
  observing = false,
  onOpenFind,
  onOpenLegend,
  onOpenLedger,
  onResetView,
  onStay,
  onStrollNext,
  onStrollPrevious,
  strollTitle = null,
  onToggleNightMode,
  onToggleObserve,
  hour = 12,
  manualTime = false,
  onChangeHour,
  onLocalTime,
  still = false,
  osReducedMotion = false,
  onChangeStill,
  children,
}: WorldControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const actionsId = `${headingId}-actions`;
  const drawerId = `${headingId}-light`;

  return (
    <div
      className="pharosville-world-controls"
      role="toolbar"
      aria-labelledby={headingId}
      data-expanded={expanded ? "true" : "false"}
      data-testid="pharosville-world-controls"
    >
      <h2 id={headingId} className="sr-only">World controls</h2>
      {onOpenFind && (
        <button id="pharosville-find" type="button" className="pv-chrome-action pharosville-world-controls__find" aria-label="Find a ship or harbor" aria-keyshortcuts="/" onClick={onOpenFind}>
          <span>Find</span><kbd aria-hidden="true">/</kbd>
        </button>
      )}

      <button
        type="button"
        className="pharosville-world-controls__affordance"
        id="pharosville-explore"
        aria-controls={actionsId}
        aria-expanded={expanded}
        aria-label="Explore harbor controls"
        onClick={() => setExpanded((open) => !open)}
      >
        <span className="pharosville-world-controls__word">Explore</span>
      </button>
      <div id={actionsId} className="pharosville-world-controls__revealed" hidden={!expanded}>
        <div className="pharosville-world-controls__words">
          {onOpenLegend && (
            <button type="button" className="pv-chrome-action" onClick={onOpenLegend}>
              <span>legend</span>
            </button>
          )}
          {onOpenLedger && (
            <button type="button" className="pv-chrome-action" aria-label="Harbor ledger" onClick={onOpenLedger}>
              <span>ledger</span>
            </button>
          )}
          {onStay && (
            <button type="button" className="pv-chrome-action" aria-label="Stay" title="Leave the harbour open as a window" onClick={onStay}>
              <span>stay</span>
            </button>
          )}
          {onStrollNext && (
            <>
              {strollTitle && <span className="pharosville-world-controls__station" role="status">{strollTitle}</span>}
              {strollTitle && onStrollPrevious && (
                <button type="button" className="pv-chrome-action" data-stroll-control onClick={onStrollPrevious}>Previous</button>
              )}
              <button type="button" className="pv-chrome-action" aria-keyshortcuts="W" data-stroll-control onClick={onStrollNext}>
                <span>{strollTitle ? "Next" : "Stroll"}</span>
              </button>
            </>
          )}
        </div>
        <button
          type="button"
          className="pv-glyph-button"
          onClick={onResetView}
          disabled={!onResetView}
          aria-label="Home"
          title="Return to the garden seat"
        >
          <RotateCcw aria-hidden="true" size={17} strokeWidth={1.5} />
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
            {observing ? <Pause aria-hidden="true" size={17} strokeWidth={1.5} /> : <Eye aria-hidden="true" size={17} strokeWidth={1.5} />}
          </button>
        )}
        <details className="pv-drawer-control pharosville-light-control">
          <summary className="pv-glyph-button" aria-label={`Light and motion: ${formatHourLabel(hour)}${manualTime ? " manual" : " local"}`} title="Light and motion">
            {hour < 6 || hour >= 20 ? <Moon aria-hidden="true" size={17} strokeWidth={1.5} /> : <Sun aria-hidden="true" size={17} strokeWidth={1.5} />}
          </summary>
          <div id={drawerId} className="pv-drawer pv-paper" role="group" aria-label="Light and motion">
            <label className="pv-drawer__row">
              <span>Time of day</span>
              <input
                className="pv-drawer__time"
                type="time"
                step="900"
                value={formatHourLabel(hour)}
                onChange={(event) => {
                  const [hours, minutes] = event.target.value.split(":").map(Number);
                  if (hours !== undefined && minutes !== undefined) onChangeHour?.(hours + minutes / 60);
                }}
              />
            </label>
            <div className="pv-drawer__row">
              <button type="button" className="pv-drawer__button" data-active={manualTime ? undefined : "true"} onClick={onLocalTime}>Local time</button>
              <button type="button" className="pv-drawer__button" onClick={onToggleNightMode}>{nightMode ? "Day preset" : "Night preset"}</button>
            </div>
            <label className="pv-drawer__row">
              <span>Still</span>
              <input
                className="pv-drawer__switch"
                type="checkbox"
                role="switch"
                checked={still}
                disabled={osReducedMotion}
                onChange={(event) => onChangeStill?.(event.target.checked)}
              />
            </label>
            {osReducedMotion && <p className="pv-drawer__note">Reduced motion follows your system setting.</p>}
          </div>
        </details>
        {children}
      </div>

    </div>
  );
}
