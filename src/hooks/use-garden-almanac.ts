"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  gardenAlmanacEventAt,
  gardenAlmanacLogEntry,
  type GardenAlmanacLogEntry,
} from "../systems/garden-almanac";

/**
 * React seam for the route-owned harbor clock. The visible hour stays owned by
 * the existing time controls; one UTC-midnight timeout only advances the
 * shared daily seed in a tab that remains open overnight.
 */
export function useGardenAlmanac(input: {
  date?: Date;
  reducedMotion: boolean;
  wallClockHour: number;
}) {
  const [date, setDate] = useState(() => input.date ?? new Date());
  useEffect(() => {
    if (input.date) return undefined;
    const now = new Date();
    const nextUtcMidnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    );
    const timeoutId = window.setTimeout(
      () => setDate(new Date()),
      Math.max(1, nextUtcMidnight - now.getTime() + 50),
    );
    return () => window.clearTimeout(timeoutId);
  }, [date, input.date]);
  const activeEvent = useMemo(() => gardenAlmanacEventAt(
    date,
    input.wallClockHour,
    input.reducedMotion,
  ), [date, input.reducedMotion, input.wallClockHour]);
  const seenIdsRef = useRef(new Set<string>());
  const [entries, setEntries] = useState<GardenAlmanacLogEntry[]>([]);

  useEffect(() => {
    if (!activeEvent) return;
    const entry = gardenAlmanacLogEntry(activeEvent);
    if (seenIdsRef.current.has(entry.id)) return;
    seenIdsRef.current.add(entry.id);
    // One quiet, persistent ledger write. No announcement and no floating log.
    setEntries((current) => [entry, ...current]);
  }, [activeEvent]);

  return { activeEvent, entries };
}
