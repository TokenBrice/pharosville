// Owns the PharosVille asset manager, critical/deferred load lifecycle, and
// per-world logo loading. Exposes readiness flags for the rendering hook.
import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { PharosVilleAssetManager, type PharosVilleAssetLoadError } from "../renderer/asset-manager";
import { SHIP_SAIL_EMBLEM_OVERRIDES } from "../renderer/layers/ships";
import type { buildMotionPlan } from "../systems/motion";
import { warmAllWaterPaths } from "../systems/motion-water";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";

type MotionPlan = ReturnType<typeof buildMotionPlan>;

export interface UseAssetLoadingPipelineResult {
  assetLoadErrors: PharosVilleAssetLoadError[];
  assetLoadTick: number;
  assetManager: PharosVilleAssetManager;
  criticalAssetAttemptsSettled: boolean;
  criticalAssetsLoaded: boolean;
  criticalFramePainted: boolean;
  deferredAssetsLoaded: boolean;
  setCriticalFramePainted: Dispatch<SetStateAction<boolean>>;
  criticalFramePaintedRef: MutableRefObject<boolean>;
}

export function useAssetLoadingPipeline(input: {
  motionPlanRef: MutableRefObject<MotionPlan>;
  world: PharosVilleWorldModel;
}): UseAssetLoadingPipelineResult {
  const { motionPlanRef, world } = input;
  const [assetManager] = useState(() => new PharosVilleAssetManager());
  const criticalFramePaintedRef = useRef(false);
  const deferredLoadStartedRef = useRef(false);
  const [assetLoadTick, setAssetLoadTick] = useState(0);
  const [assetLoadErrors, setAssetLoadErrors] = useState<PharosVilleAssetLoadError[]>([]);
  const [criticalFramePainted, setCriticalFramePainted] = useState(false);
  const [criticalAssetAttemptsSettled, setCriticalAssetAttemptsSettled] = useState(false);
  const [criticalAssetsLoaded, setCriticalAssetsLoaded] = useState(false);
  const [deferredAssetsLoaded, setDeferredAssetsLoaded] = useState(false);
  const logoSourcesSignatureRef = useRef("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    criticalFramePaintedRef.current = false;
    deferredLoadStartedRef.current = false;
    // Synchronous resets at the start of each load attempt: these are
    // intentional "back to zero" before the async chain populates. They run
    // exactly once per dep-change (asset manager identity), not in a loop —
    // no cascading renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCriticalFramePainted(false);
    setCriticalAssetAttemptsSettled(false);
    setCriticalAssetsLoaded(false);
    setDeferredAssetsLoaded(false);
    assetManager.loadCritical(controller.signal)
      .then((criticalResult) => {
        if (!active) return;
        setAssetLoadErrors(criticalResult.errors);
        setCriticalAssetsLoaded(assetManager.areCriticalAssetsLoaded());
        setCriticalAssetAttemptsSettled(true);
        setAssetLoadTick((tick) => tick + 1);
      })
      .catch((error) => {
        if (!active) return;
        setCriticalAssetsLoaded(false);
        setCriticalAssetAttemptsSettled(true);
        setAssetLoadErrors([{
          id: "manifest",
          message: error instanceof Error ? error.message : String(error),
          path: "manifest.json",
          priority: "critical",
        }]);
        setAssetLoadTick((tick) => tick + 1);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [assetManager]);

  useEffect(() => {
    if (!criticalAssetAttemptsSettled || !criticalFramePainted || deferredLoadStartedRef.current) return;

    const controller = new AbortController();
    let active = true;
    deferredLoadStartedRef.current = true;
    const startDeferredLoad = () => {
      const planForWarmup = motionPlanRef.current;
      if (planForWarmup) warmAllWaterPaths(planForWarmup);
      assetManager.loadDeferred(controller.signal)
        .then((deferredResult) => {
          if (!active) return;
          setAssetLoadErrors((previous) => [...previous, ...deferredResult.errors]);
          setDeferredAssetsLoaded(assetManager.areDeferredAssetsSettled() && deferredResult.errors.length === 0);
          setAssetLoadTick((tick) => tick + 1);
        })
        .catch((error) => {
          if (!active) return;
          setAssetLoadErrors((previous) => [
            ...previous,
            {
              id: "deferred-assets",
              message: error instanceof Error ? error.message : String(error),
              path: "manifest.json",
              priority: "deferred",
            },
          ]);
          setAssetLoadTick((tick) => tick + 1);
        });
    };

    const requestIdleCallback = window.requestIdleCallback?.bind(window);
    const cancelIdleCallback = window.cancelIdleCallback?.bind(window);
    if (requestIdleCallback && cancelIdleCallback) {
      const idleId = requestIdleCallback(startDeferredLoad, { timeout: 800 });
      return () => {
        active = false;
        controller.abort();
        cancelIdleCallback(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(startDeferredLoad, 0);
    return () => {
      active = false;
      controller.abort();
      globalThis.clearTimeout(timeoutId);
    };
  }, [assetManager, criticalAssetAttemptsSettled, criticalFramePainted, motionPlanRef]);

  // Hoist the logo-source set + signature so the effect can key on the
  // signature string instead of three array refs. After a refetch produces a
  // new `world`, identity-different but content-identical logo arrays now
  // skip the effect body entirely (no controller abort/restart, no
  // loadLogos call).
  const uniqueLogoSrcs = useMemo(() => {
    const logoSrcs = [
      ...world.docks.map((dock) => dock.logoSrc),
      ...world.graves
        .filter((grave) => grave.visual.scale >= 0.41)
        .map((grave) => grave.logoSrc),
      ...world.ships.map((ship) => ship.logoSrc),
      ...Object.values(SHIP_SAIL_EMBLEM_OVERRIDES),
    ]
      .filter((src): src is string => typeof src === "string" && src.startsWith("/"));
    return [...new Set(logoSrcs)].sort();
  }, [world.docks, world.graves, world.ships]);
  const logoSourcesSignature = uniqueLogoSrcs.join("|");

  useEffect(() => {
    if (uniqueLogoSrcs.length === 0) {
      logoSourcesSignatureRef.current = "";
      return;
    }
    if (logoSourcesSignature === logoSourcesSignatureRef.current) return;
    logoSourcesSignatureRef.current = logoSourcesSignature;

    const controller = new AbortController();
    assetManager.loadLogos(uniqueLogoSrcs, controller.signal)
      .then(() => setAssetLoadTick((tick) => tick + 1))
      .catch(() => setAssetLoadTick((tick) => tick + 1));
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetManager, logoSourcesSignature]);

  return {
    assetLoadErrors,
    assetLoadTick,
    assetManager,
    criticalAssetAttemptsSettled,
    criticalAssetsLoaded,
    criticalFramePainted,
    criticalFramePaintedRef,
    deferredAssetsLoaded,
    setCriticalFramePainted,
  };
}
