"use client";

import { memo } from "react";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { usePharosVilleWorldData } from "@/hooks/use-pharosville-world-data";
import { PharosVilleWorld } from "./pharosville-world";

function PharosVilleDesktopDataComponent() {
  const { world, error, hasRenderableData, refetchAll } = usePharosVilleWorldData();

  return (
    <>
      <QueryErrorNotice
        error={error}
        hasData={hasRenderableData}
        onRetry={refetchAll}
      />
      <PharosVilleWorld world={world} />
    </>
  );
}

// memo skips parent-driven re-renders since this component takes no props.
// Internal state still updates via TanStack Query's notifier path; the test
// suite mirrors this with useSyncExternalStore-backed mocks.
export const PharosVilleDesktopData = memo(PharosVilleDesktopDataComponent);
