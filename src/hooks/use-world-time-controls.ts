import { useCallback, useEffect, useRef, useState } from "react";
import {
  resolveWallClockHour,
  restoreTestWallClockOverrideHour,
  writeTestWallClockOverrideHour,
} from "../lib/pharosville-clock";

export const WORLD_TIME_STEP_HOUR = 0.25;
export const WORLD_TIME_MAX_HOUR = 23.75;

export function clampManualTimeOverrideHour(hour: number): number | null {
  if (!Number.isFinite(hour)) return null;
  const stepped = Math.round(hour / WORLD_TIME_STEP_HOUR) * WORLD_TIME_STEP_HOUR;
  const clamped = Math.max(0, Math.min(WORLD_TIME_MAX_HOUR, stepped));
  return Number(clamped.toFixed(2));
}

export function useWorldTimeControls(input: {
  initialManualTimeOverrideHour?: number | null;
  initialNightMode?: boolean;
  requestPaint: () => void;
}) {
  const { initialManualTimeOverrideHour = null, initialNightMode = false, requestPaint } = input;
  const [nightMode, setNightMode] = useState(initialNightMode);
  const [autoNightCycle, setAutoNightCycle] = useState(false);
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
    if (!autoNightCycle) return;
    const id = setInterval(() => setNightMode((n) => !n), 60_000);
    return () => clearInterval(id);
  }, [autoNightCycle]);

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

  const clearTimeOverride = useCallback(() => {
    if (restoreManualWallClockOverride()) requestPaint();
    setManualTimeOverrideHourState(null);
  }, [requestPaint, restoreManualWallClockOverride]);

  const setManualTimeOverrideHour = useCallback((hour: number | null) => {
    if (hour === null) {
      if (restoreManualWallClockOverride()) requestPaint();
      setManualTimeOverrideHourState(null);
      return;
    }
    const nextHour = clampManualTimeOverrideHour(hour);
    if (nextHour === null) return;
    setManualTimeOverrideHourState(nextHour);
  }, [requestPaint, restoreManualWallClockOverride]);

  const toggleNightMode = useCallback(() => {
    if (restoreManualWallClockOverride()) requestPaint();
    setManualTimeOverrideHourState(null);
    setNightMode((n) => !n);
  }, [requestPaint, restoreManualWallClockOverride]);

  const toggleAutoNightCycle = useCallback(() => {
    if (restoreManualWallClockOverride()) requestPaint();
    setManualTimeOverrideHourState(null);
    setAutoNightCycle((a) => !a);
  }, [requestPaint, restoreManualWallClockOverride]);

  const wallClockHour = resolveWallClockHour({ manualTimeOverrideHour, nightMode });

  return {
    autoNightCycle,
    clearTimeOverride,
    manualTimeOverrideHour,
    nightMode,
    setManualTimeOverrideHour,
    wallClockHour,
    toggleAutoNightCycle,
    toggleNightMode,
  };
}
