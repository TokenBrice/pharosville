"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import { DesktopOnlyFallback } from "./desktop-only-fallback";
import { RotateToLandscape } from "./rotate-to-landscape";
import { canViewportShowMap, isWidescreenViewport } from "./systems/viewport-gate";
import "./pharosville.css";

const PharosVilleDesktopData = lazy(() => (
  import("./pharosville-desktop-data").then((mod) => ({ default: mod.PharosVilleDesktopData }))
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
 * V1: both halves of the gate share one set of listeners.
 *
 * They used to be two hooks, and the second one watched
 * `(orientation: portrait)` — a viewport aspect test masquerading as a device
 * question. See `canViewportShowMap`. Two `useState<boolean>`s rather than one
 * state object, so a resize that changes neither answer re-renders nothing.
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

  // Both branches return before the lazy chunk is referenced, so a blocked
  // viewport still starts no world data, Three runtime, GLB or logo request.
  if (!screenCapable) return <DesktopOnlyFallback />;
  if (!viewportReady) return <RotateToLandscape />;

  return (
    <Suspense fallback={<div className="pharosville-loading pharosville-desktop" aria-busy="true">Charting market winds…</div>}>
      <PharosVilleDesktopData />
    </Suspense>
  );
}
