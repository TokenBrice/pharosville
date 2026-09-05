import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatHourLabel,
  resolveWallClockHour,
  restoreTestWallClockOverrideHour,
  writeTestWallClockOverrideHour,
} from "../lib/pharosville-clock";

export const WORLD_TIME_STEP_HOUR = 0.25;
export const WORLD_TIME_MAX_HOUR = 23.75;
/**
 * One `[` or `]` press. A multiple of `WORLD_TIME_STEP_HOUR`, so a press always
 * lands on a representable hour instead of drifting against the rounding. Half
 * an hour rather than a whole one because dawn and dusk are where the sky
 * actually changes, and an hourly step crosses each of them in two presses.
 */
export const WORLD_TIME_NUDGE_HOUR = 0.5;

export function clampManualTimeOverrideHour(hour: number): number | null {
  if (!Number.isFinite(hour)) return null;
  const stepped = Math.round(hour / WORLD_TIME_STEP_HOUR) * WORLD_TIME_STEP_HOUR;
  const clamped = Math.max(0, Math.min(WORLD_TIME_MAX_HOUR, stepped));
  return Number(clamped.toFixed(2));
}

export function sessionHourAnnouncement(hour: number): string {
  return `Time of day ${formatHourLabel(hour)}.`;
}

export function useWorldTimeControls(input: {
  initialManualTimeOverrideHour?: number | null;
  initialNightMode?: boolean;
  requestPaint: () => void;
}) {
  const { initialManualTimeOverrideHour = null, initialNightMode = false, requestPaint } = input;
  const [nightMode, setNightMode] = useState(initialNightMode);
  const [manualTimeOverrideHour, setManualTimeOverrideHourState] = useState<number | null>(() => (
    initialManualTimeOverrideHour === null ? null : clampManualTimeOverrideHour(initialManualTimeOverrideHour)
  ));
  const manualWallClockRestoreRef = useRef<{ active: boolean; previous: number | undefined }>({
    active: false,
    previous: undefined,
  });

  const restoreManualWallClockOverride = useCallback((): boolean => {
    if (!manualWallClockRestoreRef.current.active) return false;
    restoreTestWallClockOverrideHour(manualWallClockRestoreRef.current.previous);
    manualWallClockRestoreRef.current = { active: false, previous: undefined };
    return true;
  }, []);

  useEffect(() => {
    if (manualTimeOverrideHour === null) {
      if (restoreManualWallClockOverride()) {
        requestPaint();
      }
      return;
    }

    if (!manualWallClockRestoreRef.current.active) {
      manualWallClockRestoreRef.current = {
        active: true,
        previous: globalThis.__pharosVilleTestWallClockHour,
      };
    }
    writeTestWallClockOverrideHour(manualTimeOverrideHour);
    requestPaint();
  }, [manualTimeOverrideHour, requestPaint, restoreManualWallClockOverride]);

  useEffect(() => () => {
    restoreManualWallClockOverride();
  }, [restoreManualWallClockOverride]);

  const toggleNightMode = useCallback(() => {
    if (restoreManualWallClockOverride()) requestPaint();
    setManualTimeOverrideHourState(null);
    setNightMode((n) => !n);
  }, [requestPaint, restoreManualWallClockOverride]);

  const wallClockHour = resolveWallClockHour({ manualTimeOverrideHour, nightMode });

  // Steps from whatever the sky is showing — the visitor's clock, the night
  // preset, or a `t=` link — so the first press moves from there instead of
  // jumping to a default hour. It stops at the ends of the day rather than
  // wrapping, and leaves `nightMode` alone: the override outranks the preset
  // while it is set, and the day-night control still clears it.
  const nudgeSessionHour = useCallback((deltaHour: number): number | null => {
    const next = clampManualTimeOverrideHour(wallClockHour + deltaHour);
    if (next === null) return null;
    setManualTimeOverrideHourState(next);
    return next;
  }, [wallClockHour]);

  return {
    setSessionHour: (hour: number) => setManualTimeOverrideHourState(clampManualTimeOverrideHour(hour)),
    resetLocalTime: () => { restoreManualWallClockOverride(); setManualTimeOverrideHourState(null); setNightMode(false); requestPaint(); },
    manualTimeOverrideHour,
    nightMode,
    nudgeSessionHour,
    wallClockHour,
    toggleNightMode,
  };
}
