"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import { DesktopOnlyFallback } from "./desktop-only-fallback";
import { RotateToLandscape } from "./rotate-to-landscape";
import { dayCycleBeats, type DayCycleBeatName } from "./systems/day-cycle-beats";
import { gardenSkyDay } from "./systems/sky-almanac";
import { canViewportShowMap, isWidescreenViewport } from "./systems/viewport-gate";
import "./pharosville.css";

/**
 * K17 / chrome-1: five chrome-free stills of the rest seat, one per light beat,
 * served from public so the gate never boots the world to show them. Captured
 * with `preview.mjs --clean` at the rest pose; regenerate them with each
 * release that moves the seat or the look (docs/pharosville/TESTING.md).
 */
const HOUR_STILL_ALT: Record<DayCycleBeatName, string> = {
  dawn: "PharosVille at dawn: the lighthouse on its crag under a pale rose sky, ships at anchor on quiet water.",
  day: "PharosVille by day: a white lighthouse on its pine-dressed crag above blue water, ships at anchor around it.",
  golden: "PharosVille at golden hour: the lighthouse in low warm light over violet water, ships at anchor.",
  blue: "PharosVille in the blue hour: the lighthouse beacon lit over darkening water, the fleet at anchor.",
  night: "PharosVille at night: the lit lighthouse over dark water under the moon, ships at anchor.",
};

/** The still for the visitor's own local hour: the dominant beat of the sky clock that day. */
export function stillForLocalHour(date: Date): { alt: string; avif: string; beat: DayCycleBeatName; jpeg: string } {
  const beats = dayCycleBeats(date.getHours() + date.getMinutes() / 60, gardenSkyDay(date));
  let beat: DayCycleBeatName = "day";
  for (const name of Object.keys(beats) as DayCycleBeatName[]) if (beats[name] > beats[beat]) beat = name;
  const base = `/pharosville/stills/garden-${beat}`;
  return { alt: HOUR_STILL_ALT[beat], avif: `${base}.avif`, beat, jpeg: `${base}.jpg` };
}

function HourStill() {
  const [still] = useState(() => stillForLocalHour(new Date()));
  return (
    <picture>
      <source type="image/avif" srcSet={still.avif} />
      <img className="pharosville-gate__still" src={still.jpeg} alt={still.alt} />
    </picture>
  );
}

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
  if (!screenCapable) {
    return (
      <div className="pharosville-gate">
        <HourStill />
        <DesktopOnlyFallback />
      </div>
    );
  }
  if (!viewportReady) {
    return (
      <div className="pharosville-gate">
        <HourStill />
        <RotateToLandscape />
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="pharosville-loading pharosville-desktop" aria-busy="true">Charting market winds…</div>}>
      <PharosVilleDesktopData />
    </Suspense>
  );
}
