"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectNotableMovers } from "../systems/notable-movers";
import type { PharosVilleWorld } from "../systems/world-types";

export const VISIT_SNAPSHOT_STORAGE_KEY = "pharosville.snapshot.v1";
export const VISIT_SNAPSHOT_SCHEMA_VERSION = 1;

export interface VisitSnapshot {
  schemaVersion: typeof VISIT_SNAPSHOT_SCHEMA_VERSION;
  psiBand: string | null;
  psiScore: number | null;
  lastFleetDepegAt: number | null;
  generatedAt: number | null;
  notableMoverSymbols: string[];
}

export interface VisitSnapshotDelta {
  psiBandChange: {
    fromBand: string | null;
    toBand: string | null;
    fromScore: number | null;
    toScore: number | null;
  } | null;
  lastFleetDepegAt: number | null;
  notableMoverSymbols: string[];
  previousGeneratedAt: number | null;
  generatedAt: number | null;
}

interface StorageReadResult {
  snapshot: VisitSnapshot | null;
  storageAvailable: boolean;
}

export function useVisitSnapshot(input: {
  world: PharosVilleWorld;
  setAnnouncement: (message: string) => void;
}) {
  const { setAnnouncement, world } = input;
  const snapshotWrittenRef = useRef(false);
  const [delta, setDelta] = useState<VisitSnapshotDelta | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (snapshotWrittenRef.current) return;
    snapshotWrittenRef.current = true;

    const currentSnapshot = snapshotFromWorld(world);
    const stored = readStoredVisitSnapshot();
    if (!stored.storageAvailable) return;

    if (!writeStoredVisitSnapshot(currentSnapshot)) return;

    if (!stored.snapshot) return;
    const nextDelta = computeVisitSnapshotDelta(stored.snapshot, currentSnapshot);
    if (!hasMaterialVisitDelta(nextDelta)) return;

    // External localStorage diff: one post-persistence banner update, not a render-derived cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDelta(nextDelta);
    setAnnouncement(visitSnapshotDeltaSummary(nextDelta));
  }, [setAnnouncement, world]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    delta: dismissed ? null : delta,
    dismiss,
  };
}

export function snapshotFromWorld(world: PharosVilleWorld): VisitSnapshot {
  return {
    schemaVersion: VISIT_SNAPSHOT_SCHEMA_VERSION,
    psiBand: typeof world.lighthouse.psiBand === "string" ? world.lighthouse.psiBand : null,
    psiScore: finiteNumberOrNull(world.lighthouse.score),
    lastFleetDepegAt: finiteNumberOrNull(world.lighthouse.lastFleetDepegAt ?? null),
    generatedAt: finiteNumberOrNull(world.generatedAt),
    notableMoverSymbols: selectNotableMovers(world).map((mover) => mover.symbol),
  };
}

export function computeVisitSnapshotDelta(
  previous: VisitSnapshot,
  current: VisitSnapshot,
): VisitSnapshotDelta {
  const priorMoverSymbols = new Set(previous.notableMoverSymbols);
  const seenNewSymbols = new Set<string>();
  const notableMoverSymbols: string[] = [];
  for (const symbol of current.notableMoverSymbols) {
    if (priorMoverSymbols.has(symbol) || seenNewSymbols.has(symbol)) continue;
    seenNewSymbols.add(symbol);
    notableMoverSymbols.push(symbol);
  }

  return {
    psiBandChange: previous.psiBand !== current.psiBand
      ? {
          fromBand: previous.psiBand,
          toBand: current.psiBand,
          fromScore: previous.psiScore,
          toScore: current.psiScore,
        }
      : null,
    lastFleetDepegAt: current.lastFleetDepegAt !== null
      && (previous.lastFleetDepegAt === null || current.lastFleetDepegAt > previous.lastFleetDepegAt)
      ? current.lastFleetDepegAt
      : null,
    notableMoverSymbols,
    previousGeneratedAt: previous.generatedAt,
    generatedAt: current.generatedAt,
  };
}

export function hasMaterialVisitDelta(delta: VisitSnapshotDelta): boolean {
  return delta.psiBandChange !== null
    || delta.lastFleetDepegAt !== null
    || delta.notableMoverSymbols.length > 0;
}

export function visitSnapshotDeltaSummary(delta: VisitSnapshotDelta): string {
  const parts: string[] = [];
  if (delta.psiBandChange) {
    parts.push(`PSI ${formatBand(delta.psiBandChange.fromBand)} -> ${formatBand(delta.psiBandChange.toBand)}`);
  }
  if (delta.lastFleetDepegAt !== null) {
    parts.push("new fleet depeg recorded");
  }
  if (delta.notableMoverSymbols.length > 0) {
    const visibleSymbols = delta.notableMoverSymbols.slice(0, 4);
    const extraCount = delta.notableMoverSymbols.length - visibleSymbols.length;
    const suffix = extraCount > 0 ? `, +${extraCount} more` : "";
    parts.push(`new notable movers: ${visibleSymbols.join(", ")}${suffix}`);
  }
  return parts.length > 0 ? `Since last visit: ${parts.join("; ")}.` : "";
}

function readStoredVisitSnapshot(): StorageReadResult {
  if (typeof window === "undefined") return { snapshot: null, storageAvailable: false };

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(VISIT_SNAPSHOT_STORAGE_KEY);
  } catch {
    return { snapshot: null, storageAvailable: false };
  }

  if (!raw) return { snapshot: null, storageAvailable: true };

  try {
    const parsed = JSON.parse(raw) as unknown;
    return {
      snapshot: isVisitSnapshot(parsed) ? parsed : null,
      storageAvailable: true,
    };
  } catch {
    return { snapshot: null, storageAvailable: true };
  }
}

function writeStoredVisitSnapshot(snapshot: VisitSnapshot): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(VISIT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

function isVisitSnapshot(value: unknown): value is VisitSnapshot {
  if (!isRecord(value)) return false;
  return value.schemaVersion === VISIT_SNAPSHOT_SCHEMA_VERSION
    && (typeof value.psiBand === "string" || value.psiBand === null)
    && (typeof value.psiScore === "number" || value.psiScore === null)
    && (typeof value.lastFleetDepegAt === "number" || value.lastFleetDepegAt === null)
    && (typeof value.generatedAt === "number" || value.generatedAt === null)
    && Array.isArray(value.notableMoverSymbols)
    && value.notableMoverSymbols.every((symbol) => typeof symbol === "string")
    && (value.psiScore === null || Number.isFinite(value.psiScore))
    && (value.lastFleetDepegAt === null || Number.isFinite(value.lastFleetDepegAt))
    && (value.generatedAt === null || Number.isFinite(value.generatedAt));
}

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatBand(value: string | null): string {
  return value ?? "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
