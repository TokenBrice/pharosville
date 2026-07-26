"use client";

import { useEffect, type RefObject } from "react";

export const RECENT_WORLD_INPUT_MS = 2_000;

/**
 * Marks the chrome container for a short beat after any camera input, so the
 * faint controls come up to full while someone is actually handling the world
 * and settle back afterwards. Written straight to the DOM node (like the hover
 * tooltip's transform) rather than through state, so panning never re-renders
 * the world tree.
 */
export function useRecentWorldInput(chromeRef: RefObject<HTMLElement | null>): void {
  // chromeRef is omitted from the dep array: ref identity never changes (HOOKS F4).
  useEffect(() => {
    let timeoutId = 0;

    const mark = (event: Event) => {
      const node = chromeRef.current;
      if (!node) return;
      // Pointing at the controls already reveals them through :hover.
      if (event.target instanceof Node && node.contains(event.target)) return;
      node.dataset.recentInput = "true";
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        const current = chromeRef.current;
        if (current) current.dataset.recentInput = "false";
      }, RECENT_WORLD_INPUT_MS);
    };

    document.addEventListener("pointerdown", mark, true);
    document.addEventListener("wheel", mark, { capture: true, passive: true });
    document.addEventListener("keydown", mark, true);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("pointerdown", mark, true);
      document.removeEventListener("wheel", mark, true);
      document.removeEventListener("keydown", mark, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
