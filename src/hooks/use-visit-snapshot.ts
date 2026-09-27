"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { selectNotableMovers } from "../systems/notable-movers";
import { psiBandSeverity, type PharosVilleWorld } from "../systems/world-types";

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

/**
 * W6.10 — the harbour remembers. On the first settled world of a visit, the
 * stored baseline is compared with today's and replaced. A material change
 * becomes one prose sentence for the now-line (`useVisitorLine` times it) and
 * a permanent "Since your last visit" line in the ledger; there is no toast
 * and no camera glide.
 */
export function useVisitSnapshot(input: { world: PharosVilleWorld }) {
  const { world } = input;
  const snapshotWrittenRef = useRef(false);
  const [delta, setDelta] = useState<VisitSnapshotDelta | null>(null);

  useEffect(() => {
    if (snapshotWrittenRef.current) return;
    // Wait for the settled world: the first commits render the empty loading
    // world, and snapshotting that would overwrite the stored baseline with
    // nulls and kill every future "since last visit" delta.
    if (world.routeMode !== "world") return;
    snapshotWrittenRef.current = true;

    const currentSnapshot = snapshotFromWorld(world);
    const stored = readStoredVisitSnapshot();
    if (!stored.storageAvailable) return;

    if (!writeStoredVisitSnapshot(currentSnapshot)) return;

    if (!stored.snapshot) return;
    const nextDelta = computeVisitSnapshotDelta(stored.snapshot, currentSnapshot);
    if (!hasMaterialVisitDelta(nextDelta)) return;

    // External localStorage diff: one post-persistence update, not a render-derived cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDelta(nextDelta);
  }, [world]);

  const summary = useMemo(() => (delta ? visitSnapshotDeltaSummary(delta) : null), [delta]);
  return { delta, summary };
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

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long" });

/** "earlier today", "yesterday", "on Tuesday", "12 days ago"; null when unknown. */
function visitWhenLabel(previousAt: number | null, now: number | null): string | null {
  if (previousAt === null || now === null || previousAt > now) return null;
  const previousDay = new Date(previousAt);
  const today = new Date(now);
  const days = Math.round((
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    - new Date(previousDay.getFullYear(), previousDay.getMonth(), previousDay.getDate()).getTime()
  ) / DAY_MS);
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `on ${WEEKDAY.format(previousDay)}`;
  return `${days} days ago`;
}

function bandName(band: string | null): string {
  return band ? `${band.charAt(0)}${band.slice(1).toLowerCase()}` : "unavailable";
}

function symbolList(symbols: readonly string[]): string {
  const named = symbols.slice(0, 2);
  const extra = symbols.length - named.length;
  if (extra > 0) return `${named.join(", ")} and ${extra} more`;
  return named.join(" and ");
}

/**
 * One sentence in the garden's voice, a pure restatement of the stored delta:
 * "Since you were here on Tuesday — stability fell from Steady to Tremor;
 * USDC and DAI are among today's movers."
 */
export function visitSnapshotDeltaSummary(delta: VisitSnapshotDelta): string {
  const parts: string[] = [];
  const change = delta.psiBandChange;
  if (change) {
    const from = psiBandSeverity(change.fromBand);
    const to = psiBandSeverity(change.toBand);
    const verb = from === null || to === null ? "moved" : to > from ? "fell" : "rose";
    parts.push(`stability ${verb} from ${bandName(change.fromBand)} to ${bandName(change.toBand)}`);
  }
  if (delta.lastFleetDepegAt !== null) {
    parts.push("a new fleet depeg was recorded");
  }
  if (delta.notableMoverSymbols.length > 0) {
    parts.push(`${symbolList(delta.notableMoverSymbols)} ${delta.notableMoverSymbols.length === 1 ? "is" : "are"} among today's movers`);
  }
  if (parts.length === 0) return "";
  const when = visitWhenLabel(delta.previousGeneratedAt, delta.generatedAt);
  return `${when ? `Since you were here ${when}` : "Since your last visit"} — ${parts.join("; ")}.`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
