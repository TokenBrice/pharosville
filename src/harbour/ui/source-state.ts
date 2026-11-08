import { useSyncExternalStore } from "react";
import type { EndpointKey, EndpointTruth, HarbourModel, HarbourPayloads } from "../model/types";
import { truthCopy, type ReadingName } from "./truth-copy";

export const READING_NAMES: Record<EndpointKey, ReadingName> = {
  stablecoins: "Supply", chains: "Chain comparisons", stability: "PSI", pegSummary: "Peg readings",
  stress: "Stress readings", safetyGrades: "Safety grades", mintBurn: "Flow readings",
};
const ABSENT: EndpointTruth = { state: "unavailable", reason: "no-observation", ageSec: null, serverStatus: null };

/** Coverage uses retained, finite observations; the sea still divides by all live supply. */
export function readingCoverage(model: HarbourModel | null, key: EndpointKey): number | null {
  if (!model || (key !== "pegSummary" && key !== "stress")) return null;
  let total = 0, observed = 0;
  for (const b of model.boats) {
    if (b.state === "wrecked") continue;
    total += b.supply;
    if (key === "pegSummary" ? b.pegDeviationBps != null && Number.isFinite(b.pegDeviationBps) : b.dews != null) observed += b.supply;
  }
  return total > 0 ? observed / total : 0;
}

export function sourceTruth(model: HarbourModel | null, key: EndpointKey): EndpointTruth {
  return model?.truth[key] ?? ABSENT;
}

export function readingSentence(model: HarbourModel | null, key: EndpointKey): string {
  const coverage = readingCoverage(model, key);
  const truth = sourceTruth(model, key);
  return truthCopy({ kind: "reading", reading: READING_NAMES[key],
    truth: coverage === 0 && truth.state === "current" ? ABSENT : truth,
    ...(coverage != null && coverage > 0 && coverage < 1 ? { coveragePct: Math.min(99.99, Number((coverage * 100).toFixed(2))) } : {}),
  });
}

export function observedEmpty(model: HarbourModel | null, reading: "shoals" | "alerts"): string {
  const key = reading === "shoals" ? "pegSummary" : "stress";
  return sourceTruth(model, key).state === "current" && sourceTruth(model, "stablecoins").state === "current" && (readingCoverage(model, key) ?? 0) > 0
    ? truthCopy({ kind: "observed-empty", reading }) : readingSentence(model, key);
}

export function qualificationCopy(payloads: HarbourPayloads | undefined): string {
  return truthCopy({ kind: "psi-qualification", ...payloads?.stability?.data?.current?.inputDegradation });
}

// Visible disclosures share one clock; no route/model rebuilds or timer when the last one closes.
let clockNow = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
function subscribeClock(fn: () => void): () => void {
  listeners.add(fn);
  if (timer == null) {
    clockNow = Date.now();
    timer = setInterval(() => { clockNow = Date.now(); for (const listener of listeners) listener(); }, 60_000);
  }
  return () => { listeners.delete(fn); if (!listeners.size) { clearInterval(timer); timer = undefined; } };
}
export const useReadingNow = (): number => useSyncExternalStore(subscribeClock, () => clockNow, () => clockNow);
