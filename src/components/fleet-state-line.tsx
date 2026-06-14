"use client";

import { useEffect, useMemo, useState } from "react";
import { maxActiveThreatLevel, threatLevelForArea } from "../renderer/layers/weather";
import { seaStateForWorld } from "../systems/sea-state";
import type { AreaNode, DewsAreaBand, LighthouseNode, PharosVilleWorld } from "../systems/world-types";

const ELEVATED_DEWS_BANDS = new Set<DewsAreaBand>(["ALERT", "WARNING", "DANGER"]);
const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function FleetStateLine({ world }: { world: PharosVilleWorld }) {
  const freshnessNow = useFreshnessNow();
  const fields = useMemo(() => {
    const worstArea = worstActiveArea(world);
    const underStressCount = world.areas.reduce((total, area) => {
      if (!area.band || !ELEVATED_DEWS_BANDS.has(area.band)) return total;
      return total + Math.max(0, area.count ?? 0);
    }, 0);

    return [
      formatPsi(world.lighthouse),
      worstArea ? `${worstArea.label} ${worstArea.band}` : "No active storm band",
      `${underStressCount} under stress`,
      seaStateForWorld(world).label,
    ];
  }, [world]);
  // The 60s timer is deliberately only a DOM text refresh; it never touches
  // canvas paint scheduling or the render loop.
  const freshness = formatFreshness(world.generatedAt, freshnessNow);

  return (
    <p className="pharosville-fleet-state-line" data-testid="pharosville-fleet-state-line">
      {[...fields, freshness].map((field, index) => (
        <span key={`${index}:${field}`}>
          {index > 0 && <span className="pharosville-fleet-state-line__separator" aria-hidden="true">|</span>}
          {field}
        </span>
      ))}
    </p>
  );
}

function useFreshnessNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return now;
}

function worstActiveArea(world: PharosVilleWorld): AreaNode | null {
  const maxThreat = maxActiveThreatLevel(world);
  if (maxThreat === 0) return null;
  let bestArea: AreaNode | null = null;
  let bestCount = -1;
  for (const area of world.areas) {
    if (threatLevelForArea(area) !== maxThreat) continue;
    const count = area.count ?? 0;
    if (count > bestCount) {
      bestArea = area;
      bestCount = count;
    }
  }
  return bestArea;
}

function formatPsi(lighthouse: LighthouseNode): string {
  if (lighthouse.unavailable || (!lighthouse.psiBand && lighthouse.score == null)) return "PSI unavailable";
  const band = lighthouse.psiBand ?? "unavailable";
  if (lighthouse.score == null) return `PSI ${band}`;
  return `PSI ${band} ${Math.round(lighthouse.score)}`;
}

function formatFreshness(generatedAt: number, now: number): string {
  const deltaMs = generatedAt - now;
  const absMs = Math.abs(deltaMs);
  if (absMs < 60_000) return "updated just now";
  const absMinutes = Math.round(absMs / 60_000);
  if (absMinutes < 60) return `updated ${RELATIVE_TIME_FORMAT.format(Math.sign(deltaMs) * absMinutes, "minute")}`;
  const absHours = Math.round(absMinutes / 60);
  if (absHours < 48) return `updated ${RELATIVE_TIME_FORMAT.format(Math.sign(deltaMs) * absHours, "hour")}`;
  const absDays = Math.round(absHours / 24);
  return `updated ${RELATIVE_TIME_FORMAT.format(Math.sign(deltaMs) * absDays, "day")}`;
}
