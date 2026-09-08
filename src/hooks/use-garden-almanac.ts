"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  gardenAlmanacEventAt,
  gardenAlmanacLogEntry,
  requestGardenAlmanac,
  type GardenAlmanacEvent,
  type GardenAlmanacLogEntry,
} from "../systems/garden-almanac";
import { type GardenBeat, type GardenDirectorState } from "../systems/garden-director";

/** Occurrence, visible envelope, evidence and attention have independent lifetimes. */
export function useGardenAlmanac(input: {
  date: Date;
  director: GardenDirectorState;
  timeSeconds: number;
  reducedMotion: boolean;
  wallClockHour: number;
}) {
  const dayKey = input.date.toISOString().slice(0, 10);
  const candidate = useMemo(() => gardenAlmanacEventAt(
    new Date(`${dayKey}T00:00:00Z`), input.wallClockHour, input.reducedMotion,
  ), [dayKey, input.reducedMotion, input.wallClockHour]);
  const attemptedRef = useRef<string | null>(null);
  const resumedRef = useRef(false);
  const [sighting, setSighting] = useState<{ event: GardenAlmanacEvent; beat: GardenBeat } | null>(null);
  const [entries, setEntries] = useState<GardenAlmanacLogEntry[]>([]);

  useEffect(() => {
    const visibilityChanged = () => {
      // A sighting whose occurrence passed while hidden is not replayed on resume.
      resumedRef.current = true;
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => document.removeEventListener("visibilitychange", visibilityChanged);
  }, []);

  useEffect(() => {
    if (document.visibilityState === "hidden") return;
    const resumed = resumedRef.current;
    resumedRef.current = false;
    if (!candidate || input.reducedMotion) return;
    const entry = gardenAlmanacLogEntry(candidate);
    if (attemptedRef.current === entry.id) return;
    attemptedRef.current = entry.id;
    if (resumed) return;
    const beat = requestGardenAlmanac(input.director, candidate, input.timeSeconds);
    if (!beat) return;
    // The director request is the external side effect; recording its
    // accepted beat once per candidate is not a render-derived cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSighting({ event: candidate, beat });
    setEntries((current) => [entry, ...current].slice(0, 64));
  }, [candidate, input.director, input.reducedMotion, input.timeSeconds]);

  const age = sighting ? input.timeSeconds - sighting.beat.startSeconds : Infinity;
  const interrupted = !!sighting && input.director.log.some((beat) => beat.kind === "market"
    && beat.priority >= 100 && beat.startSeconds >= sighting.beat.startSeconds && beat.id !== sighting.beat.id);
  const visible = !input.reducedMotion && !interrupted && sighting && age >= 0;
  const activeEvent = visible && age < sighting.event.envelopeSeconds ? sighting.event : null;
  const evidenceEvent = visible && age < sighting.event.envelopeSeconds + sighting.event.evidenceSeconds
    ? sighting.event : null;
  const attentionActive = !!visible && sighting.beat.foreground
    && input.director.active?.id === sighting.beat.id && age < sighting.beat.durationSeconds;
  return { activeEvent, evidenceEvent, attentionActive, entries };
}
