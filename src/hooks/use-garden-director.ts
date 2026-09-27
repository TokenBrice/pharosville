"use client";

import { useState } from "react";
import { advanceGardenDirector, createGardenDirector, type GardenDirectorState } from "../systems/garden-director";

function initialDirector(seed: string, reducedMotion: boolean, timeSeconds: number): GardenDirectorState {
  // Created on the director's own wall clock so its first 90 s stay silent
  // (K17): the opening caption is the phase line, not a minor arrival.
  const state = createGardenDirector(seed, timeSeconds);
  // A frozen director refuses every request, so reduced motion can never
  // animate a beat by accident.
  return reducedMotion ? Object.freeze(state) : state;
}

/**
 * The route's visible wall clock is the only subscription; no private beat
 * timer. Requests mutate the state object in place (RAF callbacks hold it by
 * reference); expiry produces a new object, adopted with React's
 * previous-render adjustment pattern rather than an effect, so the frame that
 * observes the expiry is the frame that renders it.
 */
export function useGardenDirector(input: {
  seed: string;
  timeSeconds: number;
  reducedMotion: boolean;
}): GardenDirectorState {
  const [state, setState] = useState(() => initialDirector(input.seed, input.reducedMotion, input.timeSeconds));
  const [seen, setSeen] = useState({ reducedMotion: input.reducedMotion, seed: input.seed });
  if (seen.seed !== input.seed || seen.reducedMotion !== input.reducedMotion) {
    const next = initialDirector(input.seed, input.reducedMotion, input.timeSeconds);
    setSeen({ reducedMotion: input.reducedMotion, seed: input.seed });
    setState(next);
    return next;
  }
  if (input.reducedMotion) return state;
  const advanced = advanceGardenDirector(state, input.timeSeconds);
  if (advanced !== state) setState(advanced);
  return advanced;
}
