"use client";

import { useEffect, useRef, useState } from "react";
import type { NowCaptionTransition } from "../systems/detail-model";
import type { PharosVilleWorld } from "../systems/world-types";
import { captureAcceptedMarketTransitions, createMarketObservationState, type MarketObservationState } from "../systems/motion-planning";

/** How long one transition holds the now-line before the next may speak. */
export const HARBOR_LOG_HOLD_MS = 12_000;
/** Transitions waiting to be spoken; any beyond this go to the ledger only. */
export const HARBOR_LOG_SPOKEN_LIMIT = 4;
/** Session entries the ledger keeps, newest first. */
export const HARBOR_LOG_SESSION_LIMIT = 24;

export interface HarborLogEntry extends NowCaptionTransition {
  /** Session-unique occurrence key; recurrent category edges remain distinct. */
  id: string;
  detailId: string;
  fromLabel: string;
  message: string;
}

export function harborLogMessage(symbol: string, fromLabel: string, toLabel: string): string {
  return `${symbol} risk reading changed from ${fromLabel} to ${toLabel}`;
}

/**
 * W6.11 — the harbor log as ink, not a panel. Per-refresh risk-band
 * transitions arrive on the now-line one phrase at a time (the caption's own
 * precedence lets a stale warning outrank them) and collect, newest first, in
 * the ledger's harbor log. Nothing sits over the world. The caption's status
 * region is the screen-reader channel for the spoken phrase; the ledger keeps
 * every entry, spoken or not.
 */
export function useHarborLog({ world }: { world: PharosVilleWorld }) {
  const observationsRef = useRef<MarketObservationState | null>(null);
  const currentOccurrenceByShipIdRef = useRef<Map<string, number> | null>(null);
  const queueRef = useRef<HarborLogEntry[]>([]);
  const [entries, setEntries] = useState<HarborLogEntry[]>([]);
  const [current, setCurrent] = useState<HarborLogEntry | null>(null);
  const speakingRef = useRef(false);

  useEffect(() => {
    const observations = observationsRef.current ?? createMarketObservationState();
    observationsRef.current = observations;
    const currentOccurrences = currentOccurrenceByShipIdRef.current ?? new Map<string, number>();
    currentOccurrenceByShipIdRef.current = currentOccurrences;
    const transitions = captureAcceptedMarketTransitions(world, observations);
    const fresh: HarborLogEntry[] = [];
    for (const ship of world.ships) {
      const transition = transitions.get(ship.id);
      if (!transition || currentOccurrences.get(ship.id) === transition.occurrenceId) continue;
      currentOccurrences.set(ship.id, transition.occurrenceId);
      fresh.push({
        id: `${ship.id}:${transition.occurrenceId}`,
        detailId: ship.detailId,
        fromLabel: transition.fromLabel,
        message: harborLogMessage(ship.symbol, transition.fromLabel, transition.toLabel),
        observedAt: transition.observedAt,
        symbol: ship.symbol,
        toLabel: transition.toLabel,
      });
    }
    if (fresh.length === 0) return;

    for (const entry of fresh) {
      if (queueRef.current.length < HARBOR_LOG_SPOKEN_LIMIT) queueRef.current.push(entry);
    }
    // External world-refresh diff: one post-diff update per refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries((log) => [...fresh, ...log].slice(0, HARBOR_LOG_SESSION_LIMIT));
    if (speakingRef.current) return;
    speakingRef.current = true;
    setCurrent(queueRef.current.shift() ?? null);
  }, [world]);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => {
      const next = queueRef.current.shift() ?? null;
      speakingRef.current = next !== null;
      setCurrent(next);
    }, HARBOR_LOG_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [current]);

  return { current, entries };
}
