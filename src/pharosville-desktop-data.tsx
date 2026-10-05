"use client";

import { lazy, memo, Suspense } from "react";
import type { ComponentType } from "react";
import type { PharosVilleWorld as WorldModel } from "./systems/world-types";
import { QueryErrorNotice } from "@/components/query-error-notice";
import { usePharosVilleWorldData } from "@/hooks/use-pharosville-world-data";
import { ArrivalModuleFailure, ArrivalShell } from "./components/arrival-shell";

const PharosVilleWorld = lazy<ComponentType<{ world: WorldModel }>>(() => import("./pharosville-world").then(
  (mod) => ({ default: mod.PharosVilleWorld }),
  () => ({ default: ArrivalModuleFailure }),
));

function PharosVilleDesktopDataComponent() {
  const { world, error, hasRenderableData, refetchAll } = usePharosVilleWorldData();

  return (
    <>
      <QueryErrorNotice
        error={error}
        hasData={hasRenderableData}
        onRetry={refetchAll}
      />
      <Suspense fallback={<ArrivalShell stage="Loading the world presentation module." />}>
        <PharosVilleWorld world={world} />
      </Suspense>
    </>
  );
}

// memo skips parent-driven re-renders since this component takes no props.
// Internal state still updates via TanStack Query's notifier path; the test
// suite mirrors this with useSyncExternalStore-backed mocks.
export const PharosVilleDesktopData = memo(PharosVilleDesktopDataComponent);
