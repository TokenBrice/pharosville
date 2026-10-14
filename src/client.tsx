"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { DesktopOnlyFallback } from "./desktop-only-fallback";
import { RotateToLandscape } from "./rotate-to-landscape";
import { ArrivalModuleFailure, ArrivalShell } from "./components/arrival-shell";
import { dismissPoster } from "./harbour/app/poster";
import { canViewportShowMap, isWidescreenViewport } from "./systems/viewport-gate";

const HarbourApp = lazy<ComponentType>(() => (
  import("./harbour/app/harbour-app").then(
    (mod) => ({ default: mod.HarbourApp }),
    () => ({ default: ArrivalModuleFailure }),
  )
));

/** Is this device capable at all? Measured on the physical screen. */
function screenCanFitMap(): boolean {
  if (typeof window === "undefined" || !window.screen) return false;
  return isWidescreenViewport(window.screen.width, window.screen.height);
}

/** Has the window itself got the room right now? Measured on the viewport. */
function viewportCanFitMap(): boolean {
  if (typeof window === "undefined") return false;
  return canViewportShowMap(window.innerWidth, window.innerHeight);
}

/**
 * Both halves of the gate are SIZE tests sharing one set of listeners. Never
 * `(orientation: portrait)`: that is a viewport aspect test, see `canViewportShowMap`.
 * Two `useState<boolean>`s, so a resize that changes neither answer re-renders nothing.
 */
function useViewportGate(): { screenCapable: boolean; viewportReady: boolean } {
  const [screenCapable, setScreenCapable] = useState<boolean>(screenCanFitMap);
  const [viewportReady, setViewportReady] = useState<boolean>(viewportCanFitMap);

  useEffect(() => {
    const sync = () => {
      setScreenCapable(screenCanFitMap());
      setViewportReady(viewportCanFitMap());
    };
    sync();
    const orientation = window.screen?.orientation;
    orientation?.addEventListener?.("change", sync);
    window.addEventListener("orientationchange", sync);
    window.addEventListener("resize", sync);
    return () => {
      orientation?.removeEventListener?.("change", sync);
      window.removeEventListener("orientationchange", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return { screenCapable, viewportReady };
}

export function PharosVilleClient() {
  const { screenCapable, viewportReady } = useViewportGate();
  const admitted = screenCapable && viewportReady;

  // The full-window poster belongs to the loading harbour; the gate pages carry their own still.
  useEffect(() => { if (!admitted) dismissPoster("now"); }, [admitted]);

  // Both branches return before the lazy chunk is referenced, so a blocked
  // viewport starts no world data, Three runtime, GLB or logo request.
  if (!screenCapable) {
    return <div className="pharosville-gate"><DesktopOnlyFallback /></div>;
  }
  if (!viewportReady) {
    return <div className="pharosville-gate"><RotateToLandscape /></div>;
  }

  return (
    <Suspense fallback={<ArrivalShell stage="Raising the harbour." />}>
      <HarbourApp />
    </Suspense>
  );
}
