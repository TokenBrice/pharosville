"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import { DesktopOnlyFallback } from "./desktop-only-fallback";
import { RotateToLandscape } from "./rotate-to-landscape";
import { observeOrientation } from "./systems/orientation";
import "./pharosville.css";

const MIN_LONG_SIDE_PX = 720;
const MIN_SHORT_SIDE_PX = 360;

const PharosVilleDesktopData = lazy(() => (
  import("./pharosville-desktop-data").then((mod) => ({ default: mod.PharosVilleDesktopData }))
));

function screenCanFitMap(): boolean {
  if (typeof window === "undefined" || !window.screen) return false;
  const w = window.screen.width;
  const h = window.screen.height;
  if (!w || !h) return false;
  return Math.max(w, h) >= MIN_LONG_SIDE_PX && Math.min(w, h) >= MIN_SHORT_SIDE_PX;
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
