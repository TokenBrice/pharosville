"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { DesktopOnlyFallback } from "./desktop-only-fallback";
import { RotateToLandscape } from "./rotate-to-landscape";
import { ArrivalModuleFailure, ArrivalShell } from "./components/arrival-shell";
import { dayCycleBeats, type DayCycleBeatName } from "./systems/day-cycle-beats";
import { gardenSkyDay } from "./systems/sky-almanac";
import { canViewportShowMap, isWidescreenViewport } from "./systems/viewport-gate";
import "./pharosville.css";

/**
 * Five chrome-free illustrations from accepted real-GPU rest captures.
 * The publication manifest prevents the old harbour assets from being shown
 * before the Garden Observatory edition is generated and accepted.
 */
const HOUR_STILL_ALT: Record<DayCycleBeatName, string> = {
  dawn: "PharosVille garden at dawn, with the Pharos and anchored stablecoin sails beyond the viewing garden.",
  day: "PharosVille garden by day, with the Pharos and anchored stablecoin sails beyond the viewing garden.",
  golden: "PharosVille garden in golden light, with the Pharos beyond the viewing garden.",
  blue: "PharosVille garden in blue-hour light, with the lighthouse beacon beyond the viewing garden.",
  night: "PharosVille garden at night, with the lighthouse beacon beyond the viewing garden.",
};

/** The still for the visitor's own local hour: the dominant beat of the sky clock that day. */
export function stillForLocalHour(date: Date, portrait = false): { alt: string; avif: string; beat: DayCycleBeatName; jpeg: string } {
  const beats = dayCycleBeats(date.getHours() + date.getMinutes() / 60, gardenSkyDay(date));
  let beat: DayCycleBeatName = "day";
  for (const name of Object.keys(beats) as DayCycleBeatName[]) if (beats[name] > beats[beat]) beat = name;
  const base = `/pharosville/stills/garden-${beat}${portrait ? "-portrait" : ""}`;
  return { alt: `${HOUR_STILL_ALT[beat]} Illustration, not live readings.`, avif: `${base}.avif`, beat, jpeg: `${base}.jpg` };
}

function HourStill() {
  const [date] = useState(() => new Date());
  const [publication, setPublication] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/pharosville/stills/garden-social.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value: unknown) => {
        if (value && typeof value === "object" && "edition" in value && value.edition === "garden-observatory"
          && "revision" in value && typeof value.revision === "string" && /^[a-f0-9]{64}$/.test(value.revision)
          && !controller.signal.aborted) setPublication(value.revision);
      })
      .catch(() => { /* The welcome remains useful when publication is absent. */ });
    return () => controller.abort();
  }, []);
  if (!publication || failed) return null;
  const still = stillForLocalHour(date);
  const portrait = stillForLocalHour(date, true);
  const published = (path: string) => `${path}?v=${publication}`;
  return (
    <figure className="pharosville-gate__illustration">
      <picture>
        <source media="(max-aspect-ratio: 1/1)" type="image/avif" srcSet={published(portrait.avif)} />
        <source media="(max-aspect-ratio: 1/1)" type="image/jpeg" srcSet={published(portrait.jpeg)} />
        <source type="image/avif" srcSet={published(still.avif)} />
        <img className="pharosville-gate__still" src={published(still.jpeg)} alt={still.alt} onError={() => setFailed(true)} />
      </picture>
      <figcaption>Illustration, not live readings</figcaption>
    </figure>
  );
}

const PharosVilleDesktopData = lazy<ComponentType>(() => (
  import("./pharosville-desktop-data").then(
    (mod) => ({ default: mod.PharosVilleDesktopData }),
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
        <DesktopOnlyFallback illustration={<HourStill />} />
      </div>
    );
  }
  if (!viewportReady) {
    return (
      <div className="pharosville-gate">
        <RotateToLandscape illustration={<HourStill />} />
      </div>
    );
  }

  return (
    <Suspense fallback={<ArrivalShell stage="Loading the world data module." />}>
      <PharosVilleDesktopData />
    </Suspense>
  );
}
