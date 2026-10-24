import { useEffect, useRef, useState } from "react";
import { ArrivalModuleFailure, ArrivalShell } from "@/components/arrival-shell";
import { reportClientError } from "@/error-reporter";
import { installGoogleAnalytics } from "@/google-analytics";
import { preloadDetails } from "../ui/details";
import { Engine } from "../engine/engine";
import { SYSTEMS } from "../systems";
import { mountHarbourUI } from "../ui/mount";
import type { HarbourFeed } from "../data/fetch";
import type { ReadinessState, RenderedFleetState, SimulationStatus } from "../engine/types";
import type { HarbourModel } from "../model/types";
import { dismissPoster, resetPosterState } from "./poster";
import { startWake, wantsWake, WAKE_PULLBACK } from "./wake";
import "./harbour-app.css";

/** Pending-only hold, measured from this mount's first composer-completed frame, not navigation/init. */
const DATA_WAIT_MS = 2000;
/** A prepared revision with an incomplete rendered fleet must not strand the poster indefinitely. */
const FLEET_WAIT_MS = 3000;

type Stage = "loading" | "waiting" | "live" | "empty" | "partial" | "unavailable" | "failed";

const STAGE_TEXT: Record<Exclude<Stage, "failed">, string> = {
  loading: "Raising the harbour.",
  waiting: "Waiting for the fleet’s readings.",
  live: "The harbour is live.",
  empty: "The harbour is ready. No boats in the current readings.",
  partial: "Harbour ready; some boats could not be displayed.",
  unavailable: "Harbour ready; live readings unavailable.",
};

/**
 * Production mount of the Harbour: the same Engine + SYSTEMS + overlay UI as the dev entry
 * (src/harbour/main.ts), owned by React so the viewport gate can unmount it. Lazily loaded by
 * src/client.tsx only after both size checks pass, so blocked viewports never start the world
 * runtime or its /api/* feed.
 */
export function HarbourApp() {
  const worldRef = useRef<HTMLDivElement>(null);
  const uiRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [shellGone, setShellGone] = useState(false);

  useEffect(() => {
    const world = worldRef.current;
    const ui = uiRef.current;
    if (!world || !ui) return;
    let cancelled = false;
    let engine: Engine | null = null;
    let unmountUI: (() => void) | null = null;
    let stopWatching: (() => void) | undefined;
    let shellTimer = 0;
    let stopWake: (() => void) | null = null;

    resetPosterState();
    const boot = async () => {
      engine = new Engine(world);
      for (const make of SYSTEMS) engine.add(make());
      await engine.init();
      if (cancelled) return;
      delete window.__harbourStats; // a previous mount's stats must not count as this world's first frame
      const feed = engine.ctx.services.get("feed") as HarbourFeed | undefined;
      const readiness = engine.ctx.services.get("readiness") as ReadinessState | undefined;
      let firstRenderedAt: number | undefined;
      let incompleteSince: number | undefined;
      let incompleteRevision: number | undefined;
      const simulation = engine.ctx.services.get("simulation-status") as SimulationStatus | undefined;
      let revealed = false;
      const reveal = (next: Exclude<Stage, "loading" | "failed">) => {
        setStage(next);
        if (next !== "waiting" && !(next === "unavailable" && simulation?.unavailable)) stopWatching?.();
        if (revealed) return;
        revealed = true;
        // the harbour wakes (wake.ts): the live camera starts pulled back and the poster shrinks to match
        const wake = !!engine && wantsWake(engine);
        if (wake && engine) stopWake = startWake(engine);
        dismissPoster("crossfade", wake ? 1 / (1 + WAKE_PULLBACK) : 1);
        void preloadDetails().catch(() => { /* A later interaction may retry a failed warmup. */ });
        shellTimer = window.setTimeout(() => {
          setShellGone(true);
          installGoogleAnalytics();
        }, 1200);
      };
      stopWatching = engine.onRendered((rendered: RenderedFleetState) => {
        if (cancelled) return;
        const now = performance.now();
        firstRenderedAt ??= now;
        const model = engine?.ctx.services.get("model") as HarbourModel | undefined;
        // A snapshot alone is not proof: the committed revision's entire fleet must have drawn.
        const complete = model?.hasFleet && readiness?.prepared && readiness.revision > 0
          && rendered.revision === readiness.revision && rendered.boats === readiness.boats;
        if (complete) {
          reveal(readiness.boats === 0 ? "empty" : "live");
          return;
        }
        const incomplete = readiness?.prepared && rendered.revision === readiness.revision && rendered.boats < readiness.boats;
        if (incomplete) {
          if (incompleteRevision !== readiness.revision) incompleteSince = undefined;
          incompleteRevision = readiness.revision;
          incompleteSince ??= now;
          if (now - incompleteSince > FLEET_WAIT_MS) {
            console.warn("[harbour] revealing incomplete fleet", { revision: readiness.revision, rendered: rendered.boats, expected: readiness.boats });
            reveal("partial");
            return;
          }
        } else {
          incompleteSince = undefined;
          incompleteRevision = undefined;
        }
        const snapshot = feed?.payloads.stablecoins;
        const boatless = model?.boats.length === 0 && rendered.boats === 0;
        if (boatless && (snapshot?.data === null || simulation?.unavailable)) {
          reveal("unavailable");
        } else if (!revealed && boatless && snapshot === undefined && now - firstRenderedAt >= DATA_WAIT_MS) {
          // Pending is not stale: retain the real empty awaiting model, without inventing fog or boats.
          // DataSystem later commits a prepared model+pose atomically; Fleet draws it in one step.
          reveal("waiting");
        }
      });
      engine.start();
      unmountUI = mountHarbourUI(engine, ui);
    };

    const settled = boot().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[harbour] boot failed", error);
      if (cancelled) return;
      reportClientError("render", { kind: "harbour-boot-failure", message }, `harbour-boot:${message}`);
      setStage("failed");
    });

    return () => {
      cancelled = true;
      engine?.abort(); // a mount torn down mid-boot (React's dev double-mount) stops booting at once
      stopWatching?.();
      clearTimeout(shellTimer);
      stopWake?.();
      resetPosterState();
      // dispose only after init settles: systems must not be torn down mid-load
      void settled.finally(() => {
        try { unmountUI?.(); engine?.dispose(); } catch (error) { console.error("[harbour] dispose failed", error); }
      });
    };
  }, []);

  return (
    <>
      <div ref={worldRef} className="pv-world" aria-hidden="true" />
      <div ref={uiRef} />
      {stage === "failed"
        ? <ArrivalModuleFailure reason="This browser could not start the WebGL2 harbour." />
        : !shellGone && <ArrivalShell stage={STAGE_TEXT[stage]} />}
    </>
  );
}
