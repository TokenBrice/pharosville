import { useMemo } from "react";
import { buildObserveSequence, type ObserveBeatKind } from "../systems/observe-sequence";
import type { PharosVilleWorld } from "../systems/world-types";

const beatTitles: Record<ObserveBeatKind, string> = {
  concentration: "Dock concentration",
  lighthouse: "Lighthouse",
  risk: "Risk watch",
  supply: "Weekly supply",
};

export function WorldStaticOverview({
  onSelectDetail,
  world,
}: {
  onSelectDetail: (detailId: string) => void;
  world: PharosVilleWorld;
}) {
  const beats = useMemo(() => buildObserveSequence(world), [world]);

  return (
    <section
      className="pharosville-static-overview"
      data-testid="pharosville-renderer-fallback"
      aria-labelledby="pharosville-static-overview-title"
    >
      <div className="pharosville-static-overview__content">
        <p className="pharosville-static-overview__status" role="status">
          The 3D harbor is unavailable. Current signals remain available.
        </p>
        <h2 id="pharosville-static-overview-title">Harbor signal overview</h2>
        <ul>
          {beats.map((beat) => (
            <li key={beat.kind}>
              <button
                type="button"
                aria-label={`Open ${beatTitles[beat.kind]} details`}
                onClick={() => onSelectDetail(beat.detailId)}
              >
                <span>{beatTitles[beat.kind]}</span>
                <strong>{beat.label}</strong>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
