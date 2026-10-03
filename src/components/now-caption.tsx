"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { useLatestRef } from "../hooks/use-latest-ref";
import {
  nowCaptionAnnouncement,
  nowCaptionParts,
  type NowCaptionInput,
  type NowCaptionParts,
} from "../systems/detail-model";

export type NowCaptionProps = NowCaptionInput & {
  /** Swaps the sentence at once instead of crossfading it. */
  reducedMotion?: boolean;
};

/** K18/K19 caption tokens: the old sentence leaves over 800 ms, the new one arrives over 1000 ms (CSS). */
export const NOW_LINE_FADE_OUT_MS = 800;

/** What makes a new sentence; the minute clock alone never does. */
function sentenceKey({ clock, clause, phrase, warning }: NowCaptionParts): string {
  return `${clock === null ? "" : "clocked"}|${warning ? "warning" : ""}|${phrase}|${clause ?? ""}`;
}

/**
 * The now-line (W6.2): one boundary-driven sentence over the world in three
 * voices — the minute in quiet tabular figures, the phrase in Garamond italic,
 * the provenance a step lighter — on a feathered pool of shade. The minute
 * swaps in place; a new sentence crossfades (800 ms out, 1000 ms in). The
 * status region carries only the phrase, so a screen reader hears it when an
 * arrival, a transition, a qualified source or the phase changes, never on the
 * minute. An evidence warning is set roman with a glyph, never as poetry.
 */
export const NowCaption = memo(function NowCaption({
  arrivalAnnotation,
  beats,
  freshness,
  hour,
  latestTransition,
  psi,
  psiBand = null,
  reducedMotion = false,
  visitorLine = null,
}: NowCaptionProps) {
  const input = useMemo(() => ({
    arrivalAnnotation,
    beats,
    freshness,
    hour,
    latestTransition,
    psi,
    psiBand,
    visitorLine,
  }), [arrivalAnnotation, beats, freshness, hour, latestTransition, psi, psiBand, visitorLine]);
  const parts = useMemo(() => nowCaptionParts(input), [input]);
  const announcement = useMemo(() => nowCaptionAnnouncement(input), [input]);
  const partsRef = useLatestRef(parts);
  const key = sentenceKey(parts);
  const [shown, setShown] = useState(parts);
  const [leaving, setLeaving] = useState(false);
  const shownKey = sentenceKey(shown);

  useEffect(() => {
    if (key === shownKey) return undefined;
    if (reducedMotion) {
      setShown(partsRef.current);
      return undefined;
    }
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setShown(partsRef.current);
      setLeaving(false);
    }, NOW_LINE_FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [key, partsRef, reducedMotion, shownKey]);

  // Within one sentence the clock ticks in place; while a new sentence waits,
  // the old one fades out as it was.
  const line = key === shownKey ? parts : shown;

  return (
    <>
      <p
        className="pharosville-now-caption"
        data-testid="pharosville-now-caption"
        data-leaving={leaving ? "true" : undefined}
        data-warning={line.warning ? "true" : undefined}
      >
        {line.clock && <time className="pharosville-now-caption__clock">{line.clock}</time>}
        {line.clock && " "}
        <span className="pharosville-now-caption__phrase">{line.phrase}</span>
        {line.clause && <span className="pharosville-now-caption__clause"> · {line.clause}</span>}
      </p>
      <p className="sr-only" role="status" data-testid="pharosville-now-caption-status">
        {announcement}
      </p>
    </>
  );
});
