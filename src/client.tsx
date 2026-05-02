"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import { DesktopOnlyFallback } from "./desktop-only-fallback";
import "./pharosville.css";

const DESKTOP_QUERY = "(min-width: 1280px) and (min-height: 760px)";

const PharosVilleDesktopData = lazy(() => (
  import("./pharosville-desktop-data").then((mod) => ({ default: mod.PharosVilleDesktopData }))
));

function useDesktopViewport() {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isDesktop;
}

export function PharosVilleClient() {
  const isDesktop = useDesktopViewport();

  if (isDesktop === null) {
    return (
      <>
        <DesktopOnlyFallback />
        <div className="pharosville-loading pharosville-desktop" aria-busy="true">Charting market winds…</div>
      </>
    );
  }
  if (!isDesktop) return <DesktopOnlyFallback />;

  return (
    <Suspense fallback={<div className="pharosville-loading pharosville-desktop" aria-busy="true">Charting market winds…</div>}>
      <PharosVilleDesktopData />
    </Suspense>
  );
}
