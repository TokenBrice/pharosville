"use client";

import { useEffect, useMemo } from "react";
import type { DewsAreaBand, PharosVilleWorld } from "../systems/world-types";

const DEFAULT_TITLE = "PharosVille";
const ELEVATED_DEWS_BANDS = new Set<DewsAreaBand>(["ALERT", "WARNING", "DANGER"]);

export function useLiveTitle(world: PharosVilleWorld): void {
  const title = useMemo(() => liveTitleForWorld(world), [world]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (document.title !== title) document.title = title;
    return () => {
      if (document.title === title) document.title = DEFAULT_TITLE;
    };
  }, [title]);
}

export function liveTitleForWorld(world: Pick<PharosVilleWorld, "areas" | "lighthouse">): string {
  const band = world.lighthouse.psiBand ?? "unavailable";
  const underStress = world.areas.reduce((total, area) => {
    if (!area.band || !ELEVATED_DEWS_BANDS.has(area.band)) return total;
    return total + Math.max(0, area.count ?? 0);
  }, 0);
  return `${DEFAULT_TITLE} — PSI ${band} · ${underStress} under stress`;
}
