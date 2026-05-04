"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import { DesktopOnlyFallback } from "./desktop-only-fallback";
import { RotateToLandscape } from "./rotate-to-landscape";
import { observeOrientation } from "./systems/orientation";
import { isWidescreenViewport } from "./systems/viewport-gate";
import "./pharosville.css";

const PharosVilleDesktopData = lazy(() => (
  import("./pharosville-desktop-data").then((mod) => ({ default: mod.PharosVilleDesktopData }))
));

function screenCanFitMap(): boolean {
  if (typeof window === "undefined" || !window.screen) return false;
  return isWidescreenViewport(window.screen.width, window.screen.height);
}

function useScreenCapability() {
  const [canFit, setCanFit] = useState<boolean>(() => screenCanFitMap());

  useEffect(() => {
    const sync = () => setCanFit(screenCanFitMap());
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

  return canFit;
}

function isPortraitNow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(orientation: portrait)").matches;
}

function useIsPortrait() {
  const [isPortrait, setIsPortrait] = useState<boolean>(() => isPortraitNow());

  useEffect(() => observeOrientation(setIsPortrait), []);

  return isPortrait;
}

export function PharosVilleClient() {
  const canFit = useScreenCapability();
  const isPortrait = useIsPortrait();

  if (!canFit) return <DesktopOnlyFallback />;
  if (isPortrait) return <RotateToLandscape />;

  return (
    <Suspense fallback={<div className="pharosville-loading pharosville-desktop" aria-busy="true">Charting market winds…</div>}>
      <PharosVilleDesktopData />
    </Suspense>
  );
}
