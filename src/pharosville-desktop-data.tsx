"use client";

import { lazy, memo, Suspense } from "react";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { usePharosVilleWorldData } from "@/hooks/use-pharosville-world-data";

const PharosVilleWorld = lazy(() => import("./pharosville-world").then((mod) => ({
  default: mod.PharosVilleWorld,
})));

function PharosVilleDesktopDataComponent() {
  const { world, error, hasRenderableData, refetchAll } = usePharosVilleWorldData();

  return (
    <>
      <QueryErrorNotice
        error={error}
        hasData={hasRenderableData}
        onRetry={refetchAll}
      />
      <Suspense fallback={<div className="pharosville-loading pharosville-desktop" aria-busy="true" aria-live="polite">Charting market winds…</div>}>
        <PharosVilleWorld world={world} />
      </Suspense>
    </>
  );
}

// memo skips parent-driven re-renders since this component takes no props.
// Internal state still updates via TanStack Query's notifier path; the test
// suite mirrors this with useSyncExternalStore-backed mocks.
export const PharosVilleDesktopData = memo(PharosVilleDesktopDataComponent);
