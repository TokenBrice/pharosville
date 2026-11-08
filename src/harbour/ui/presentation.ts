import { useSyncExternalStore } from "react";
import type { ReadinessState, RenderedFleetState } from "../engine/types";
import { truthCopy } from "./truth-copy";
import { useStore } from "./hooks";

export interface PresentationStatus {
  status: "pending" | "failed" | "partial" | "complete";
  revision: number;
  displayed: number;
  expected: number;
}
const PENDING: PresentationStatus = { status: "pending", revision: 0, displayed: 0, expected: 0 };
const states = new WeakMap<object, { value: PresentationStatus; listeners: Set<() => void> }>();
function state(owner: object) {
  let record = states.get(owner);
  if (!record) { record = { value: PENDING, listeners: new Set() }; states.set(owner, record); }
  return record;
}
export function renderedPresentation(rendered: RenderedFleetState, ready: ReadinessState | undefined, failed: boolean): PresentationStatus {
  const matching = ready?.prepared && ready.revision > 0 && rendered.revision === ready.revision;
  const displayed = rendered.drawn ?? rendered.boats; // view culling is not an incomplete display
  return { status: failed ? "failed" : !matching ? "pending" : displayed === ready.boats ? "complete" : "partial",
    revision: rendered.revision, displayed, expected: ready?.boats ?? 0 };
}
/** Publication comes only from a composer-completed frame, independently of endpoint freshness. */
export function publishPresentation(owner: object, next: PresentationStatus): void {
  const record = state(owner), prev = record.value;
  // A newer pending revision cannot erase the last frame’s incomplete-display warning.
  if (next.status === "pending" && prev.status === "partial") return;
  if (prev.status === next.status && prev.revision === next.revision && prev.displayed === next.displayed && prev.expected === next.expected) return;
  record.value = next;
  for (const notify of record.listeners) notify();
}
export function presentationCopy(value: PresentationStatus | undefined): string {
  return value ? truthCopy({ kind: "presentation", presentation: value }) : "";
}
export const readPresentation = (owner: object): PresentationStatus => state(owner).value;

export function usePresentation(): PresentationStatus {
  const store = useStore(), record = state(store.ctx);
  return useSyncExternalStore((notify) => { record.listeners.add(notify); return () => { record.listeners.delete(notify); }; }, () => record.value, () => PENDING);
}
