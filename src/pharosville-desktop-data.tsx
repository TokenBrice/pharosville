"use client";

import { QueryErrorNotice } from "@/components/query-error-notice";
import { usePharosVilleWorldData } from "@/hooks/use-pharosville-world-data";
import { PharosVilleWorld } from "./pharosville-world";

export function PharosVilleDesktopData() {
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
