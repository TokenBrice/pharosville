"use client";

import { useEffect, useState } from "react";

/** Set once the first-visit teachings have been read or skipped; never cleared. */
export const ORIENTATION_STORAGE_KEY = "pharosville.orientation.seen";
/** W6.8: the three coarse readings the bible names, one line at a time. */
export const FIRST_VISIT_LINES = [
  "Each sail is a stablecoin.",
  "The water beneath it is its peg risk.",
  "The lighthouse keeps the whole fleet's stability — press / to find a ship.",
] as const;
export const FIRST_VISIT_LINE_MS = 7_000;
/** W6.10: how long the return-visit sentence holds the now-line. */
export const RETURN_VISIT_LINE_MS = 20_000;

const SKIP_EVENTS = ["pointerdown", "wheel", "keydown", "touchstart"] as const;

type VisitorLineStage =
  | { kind: "waiting" }
  | { kind: "return" }
  | { kind: "teaching"; index: number }
  | { kind: "done" };

function orientationSeen(): boolean {
  try {
    return window.localStorage.getItem(ORIENTATION_STORAGE_KEY) !== null;
  } catch {
    // Without storage the lines could not be kept from repeating on every
    // visit, so they are not spoken at all.
    return true;
  }
}

function markOrientationSeen(): void {
  try {
    window.localStorage.setItem(ORIENTATION_STORAGE_KEY, "1");
  } catch {
    // Storage refused: nothing to remember, nothing to repeat.
  }
}

/**
 * The now-line's visitor voice, after the arrival settles: a returning
 * visitor hears the one-sentence "since you were here" for 20 s; a first
 * visitor hears three teachings, 7 s each, skipped by any input and never
 * repeated. Under reduced motion the teachings are one sentence held until
 * the first input. Returns the line to show, or null when the voice is quiet.
 */
export function useVisitorLine(input: {
  ready: boolean;
  reducedMotion: boolean;
  returnSummary: string | null;
}): string | null {
  const { ready, reducedMotion, returnSummary } = input;
  const [stage, setStage] = useState<VisitorLineStage>({ kind: "waiting" });

  useEffect(() => {
    if (!ready || stage.kind !== "waiting") return;
    // Arrival completion is the external event this voice waits for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStage(returnSummary
      ? { kind: "return" }
      : orientationSeen() ? { kind: "done" } : { kind: "teaching", index: 0 });
  }, [ready, returnSummary, stage.kind]);

  useEffect(() => {
    if (stage.kind === "return") {
      const timer = window.setTimeout(() => {
        setStage(orientationSeen() ? { kind: "done" } : { kind: "teaching", index: 0 });
      }, RETURN_VISIT_LINE_MS);
      return () => window.clearTimeout(timer);
    }
    if (stage.kind !== "teaching") return undefined;
    const finish = () => {
      markOrientationSeen();
      setStage({ kind: "done" });
    };
    for (const eventName of SKIP_EVENTS) window.addEventListener(eventName, finish, { capture: true, passive: true });
    const timer = reducedMotion
      ? 0
      : window.setTimeout(() => {
        if (stage.index + 1 < FIRST_VISIT_LINES.length) setStage({ kind: "teaching", index: stage.index + 1 });
        else finish();
      }, FIRST_VISIT_LINE_MS);
    return () => {
      window.clearTimeout(timer);
      for (const eventName of SKIP_EVENTS) window.removeEventListener(eventName, finish, { capture: true });
    };
  }, [reducedMotion, stage]);

  if (stage.kind === "return") return returnSummary;
  if (stage.kind !== "teaching") return null;
  return reducedMotion ? FIRST_VISIT_LINES.join(" ") : FIRST_VISIT_LINES[stage.index] ?? null;
}
