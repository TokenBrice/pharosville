"use client";

import { memo, useMemo } from "react";
import {
  nowCaption,
  type NowCaptionInput,
} from "../systems/detail-model";

export type NowCaptionProps = NowCaptionInput;

/** A single, boundary-driven sentence over the world. */
export const NowCaption = memo(function NowCaption({
  arrivalAnnotation,
  beats,
  freshness,
  hour,
  latestTransition,
  psi,
}: NowCaptionProps) {
  const sentence = useMemo(() => nowCaption({
    arrivalAnnotation,
    beats,
    freshness,
    hour,
    latestTransition,
    psi,
  }), [arrivalAnnotation, beats, freshness, hour, latestTransition, psi]);

  return (
    <p className="pharosville-now-caption" data-testid="pharosville-now-caption" aria-live="polite">
      {sentence}
    </p>
  );
});
