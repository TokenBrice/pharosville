"use client";

import { memo, useMemo } from "react";
import {
  nowCaption,
  nowCaptionAnnouncement,
  type NowCaptionInput,
} from "../systems/detail-model";

export type NowCaptionProps = NowCaptionInput;

/**
 * A single, boundary-driven sentence over the world. The visible line ticks
 * with the minute; the status region carries only the phrase, so a screen
 * reader hears it when an arrival, a transition, a stale feed or the phase
 * changes, never on the minute.
 */
export const NowCaption = memo(function NowCaption({
  arrivalAnnotation,
  beats,
  freshness,
  hour,
  latestTransition,
  psi,
}: NowCaptionProps) {
  const input = useMemo(() => ({
    arrivalAnnotation,
    beats,
    freshness,
    hour,
    latestTransition,
    psi,
  }), [arrivalAnnotation, beats, freshness, hour, latestTransition, psi]);
  const sentence = useMemo(() => nowCaption(input), [input]);
  const announcement = useMemo(() => nowCaptionAnnouncement(input), [input]);

  return (
    <>
      <p className="pharosville-now-caption" data-testid="pharosville-now-caption">
        {sentence}
      </p>
      <p className="sr-only" role="status" data-testid="pharosville-now-caption-status">
        {announcement}
      </p>
    </>
  );
});
