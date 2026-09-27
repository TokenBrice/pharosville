"use client";

import { useEffect, useMemo, useState } from "react";
import {
  gardenAlmanacDay,
  gardenRitualLedgerEntry,
  type GardenAlmanacDay,
  type GardenAlmanacLogEntry,
} from "../systems/garden-almanac";
import type { GardenDirectorState, GardenRitualKind } from "../systems/garden-director";
import { gardenDayScore, setGardenDayScore, subscribeGardenRituals, type GardenScoreEntry } from "../systems/garden-score";
import { gardenSkyToday } from "../systems/sky-almanac";
import type { GardenSoundBeat } from "../lib/pharosville-audio/pharosville-audio";
import { playGardenSoundBeat } from "./use-garden-sound";

/** W7.3: the beat a ritual start sounds (crossings sound from fleet-motion's own handler). */
const RITUAL_SOUND: Partial<Record<GardenRitualKind, GardenSoundBeat>> = {
  "heron-arrives": "heron-wings",
  "heron-departs": "heron-wings",
  kindling: "kindling-tock",
  meteor: "meteor-silence",
};

/**
 * The day score's DOM side (W5.1): sets the day's score for the renderer's
 * driver, writes one ledger line per ritual start (with its local time), sounds
 * it (W7.3, silent unless Sound is on) and gives the Almanac section its kō
 * and moon. A ritual that passed while the tab was hidden is not replayed:
 * the driver only starts what the clock admits now.
 */
export function useGardenAlmanac(input: {
  date: Date;
  director: GardenDirectorState;
  utcDayKey: string;
  wallClockHour: number;
}): {
  entries: GardenAlmanacLogEntry[];
  attentionActive: boolean;
  almanac: GardenAlmanacDay;
  score: readonly GardenScoreEntry[];
} {
  const { date, utcDayKey } = input;
  const score = useMemo(() => gardenDayScore({ seed: utcDayKey, date }), [utcDayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [entries, setEntries] = useState<GardenAlmanacLogEntry[]>([]);

  useEffect(() => {
    setGardenDayScore(score);
  }, [score]);

  useEffect(() => subscribeGardenRituals((event) => {
    const sound = RITUAL_SOUND[event.kind];
    if (sound) playGardenSoundBeat(sound);
    const entry = gardenRitualLedgerEntry(event, utcDayKey);
    setEntries((current) => [entry, ...current].slice(0, 64));
  }), [utcDayKey]);

  const hourMinute = Math.floor(input.wallClockHour * 60);
  const almanac = useMemo(
    () => gardenAlmanacDay(date, hourMinute / 60, gardenSkyToday()),
    [utcDayKey, hourMinute], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const active = input.director.active;
  const attentionActive = active !== null && active.kind === "ritual" && active.foreground;
  return { entries, attentionActive, almanac, score };
}
