"use client";

import { useCallback, useEffect, useState } from "react";

/** Existing visitors keep the same key and "1" value; never re-teach them. */
export const ORIENTATION_STORAGE_KEY = "pharosville.orientation.seen";
export const RETURN_VISIT_LINE_MS = 20_000;

let sessionOrientationSeen = false;

function orientationSeen(): boolean {
  try {
    return window.localStorage.getItem(ORIENTATION_STORAGE_KEY) !== null || sessionOrientationSeen;
  } catch {
    return sessionOrientationSeen;
  }
}

function markOrientationSeen(): void {
  try {
    window.localStorage.setItem(ORIENTATION_STORAGE_KEY, "1");
  } catch {
    // The explicit dismissal still lasts for this session when storage is denied.
    sessionOrientationSeen = true;
  }
}

/** Teaching belongs to the reading key; only the return summary is caption copy. */
export function useVisitorLine(input: {
  ready: boolean;
  returnReady?: boolean;
  returnSummary: string | null;
}) {
  const { ready, returnReady = ready, returnSummary } = input;
  const [teachingOpen, setTeachingOpen] = useState<boolean | null>(null);
  const [returnStage, setReturnStage] = useState<"waiting" | "open" | "done">("waiting");

  useEffect(() => {
    if (!ready || teachingOpen !== null) return;
    // Ready world publication is the external event this presentation mirrors.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTeachingOpen(!orientationSeen());
  }, [ready, teachingOpen]);

  useEffect(() => {
    if (!returnReady || returnStage !== "waiting") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReturnStage(returnSummary ? "open" : "done");
  }, [returnReady, returnStage, returnSummary]);

  useEffect(() => {
    if (returnStage !== "open") return;
    const timer = window.setTimeout(() => setReturnStage("done"), RETURN_VISIT_LINE_MS);
    return () => window.clearTimeout(timer);
  }, [returnStage]);

  const dismissTeaching = useCallback(() => {
    if (!ready || !teachingOpen) return;
    markOrientationSeen();
    setTeachingOpen(false);
  }, [ready, teachingOpen]);

  return {
    visitorLine: returnReady && returnStage === "open" ? returnSummary : null,
    teachingOpen: ready && teachingOpen === true,
    dismissTeaching,
  };
}
