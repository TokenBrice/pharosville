import { useCallback, useEffect, useState } from "react";

export const LEGEND_DISMISSED_STORAGE_KEY = "pharosville.legend.dismissed";

function legendDismissed(): boolean {
  try {
    return window.localStorage.getItem(LEGEND_DISMISSED_STORAGE_KEY) === "1";
  } catch {
    // Storage unavailable (privacy mode): treat as dismissed so the overlay
    // never traps users who can't persist the dismissal.
    return true;
  }
}

function persistLegendDismissed(): void {
  try {
    window.localStorage.setItem(LEGEND_DISMISSED_STORAGE_KEY, "1");
  } catch {
    // Best effort only.
  }
}

/**
 * Legend dialog state. Auto-opens once for first-time visitors (no dismissal
 * recorded in localStorage); closing always records the dismissal so the
 * overlay never auto-opens twice. Reopening stays available from the footer
 * "Legend" button.
 */
export function useLegendDialog(input: {
  setAnnouncement: (message: string) => void;
}) {
  const { setAnnouncement } = input;
  const [legendOpen, setLegendOpen] = useState(() => !legendDismissed());

  const openLegend = useCallback(() => {
    setLegendOpen(true);
    setAnnouncement("Opened PharosVille legend.");
  }, [setAnnouncement]);

  const closeLegend = useCallback(() => {
    setLegendOpen(false);
    persistLegendDismissed();
    setAnnouncement("Closed PharosVille legend.");
  }, [setAnnouncement]);

  useEffect(() => {
    if (!legendOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeLegend();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [legendOpen, closeLegend]);

  return {
    closeLegend,
    legendOpen,
    openLegend,
  };
}
