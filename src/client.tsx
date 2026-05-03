"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import { DesktopOnlyFallback } from "./desktop-only-fallback";
import "./pharosville.css";

const MIN_LONG_SIDE_PX = 1000;
const MIN_SHORT_SIDE_PX = 640;

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

export function PharosVilleClient() {
  const canFit = useScreenCapability();

  if (!canFit) return <DesktopOnlyFallback />;

  return (
    <Suspense fallback={<div className="pharosville-loading pharosville-desktop" aria-busy="true">Charting market winds…</div>}>
      <PharosVilleDesktopData />
    </Suspense>
  );
}
