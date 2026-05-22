import { useCallback, useEffect, useRef, useState } from "react";
import {
  resolveWallClockHour,
  restoreTestWallClockOverrideHour,
  writeTestWallClockOverrideHour,
} from "../lib/pharosville-clock";

export function useWorldTimeControls(input: {
  requestPaint: () => void;
}) {
  const { requestPaint } = input;
  const [nightMode, setNightMode] = useState(false);
  const [autoNightCycle, setAutoNightCycle] = useState(false);
  const [manualTimeOverrideHour, setManualTimeOverrideHourState] = useState<number | null>(null);
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
    setManualTimeOverrideHourState(hour);
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
