"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShipRiskTransitionEntry } from "../components/accessibility-ledger";
import type { ShipNode } from "../systems/world-types";

export const HARBOR_LOG_LIMIT = 4;

export interface HarborLogEntry {
  /** Stable per-transition key: shipId + from + to. */
  id: string;
  detailId: string;
  symbol: string;
  message: string;
}

export function harborLogMessage(symbol: string, fromLabel: string, toLabel: string): string {
  return `${symbol} left ${fromLabel} for ${toLabel}`;
}

/**
 * Session harbor log: turns per-refresh risk-band transitions (already
 * computed for the detail panel and accessibility ledger) into a short,
 * clickable event feed so zone changes read as story beats instead of
 * passing silently. Session-scoped DOM state only — no canvas impact.
 */
export function useHarborLog(input: {
  riskTransitionByShipId: ReadonlyMap<string, ShipRiskTransitionEntry>;
  shipsById: ReadonlyMap<string, ShipNode>;
  setAnnouncement: (message: string) => void;
}) {
  const { riskTransitionByShipId, setAnnouncement, shipsById } = input;
  const seenTransitionKeysRef = useRef(new Set<string>());
  const [entries, setEntries] = useState<HarborLogEntry[]>([]);

  useEffect(() => {
    const fresh: HarborLogEntry[] = [];
    for (const [shipId, transition] of riskTransitionByShipId) {
      const key = `${shipId}:${transition.fromLabel}->${transition.toLabel}`;
      if (seenTransitionKeysRef.current.has(key)) continue;
      seenTransitionKeysRef.current.add(key);
      const ship = shipsById.get(shipId);
      if (!ship) continue;
      fresh.push({
        id: key,
        detailId: ship.detailId,
        symbol: ship.symbol,
        message: harborLogMessage(ship.symbol, transition.fromLabel, transition.toLabel),
      });
    }
    if (fresh.length === 0) return;

    // External world-refresh diff: one post-diff update per refresh, newest
    // first, capped to the visible log length.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries((current) => [...fresh, ...current].slice(0, HARBOR_LOG_LIMIT));
    for (const entry of fresh) {
      setAnnouncement(`Harbor log: ${entry.message}.`);
    }
  }, [riskTransitionByShipId, setAnnouncement, shipsById]);

  const dismiss = useCallback(() => {
    setEntries([]);
  }, []);

  return { dismiss, entries };
}
