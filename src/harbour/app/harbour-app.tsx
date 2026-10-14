import { useEffect, useRef, useState } from "react";
import { ArrivalModuleFailure, ArrivalShell } from "@/components/arrival-shell";
import { reportClientError } from "@/error-reporter";
import { Engine } from "../engine/engine";
import { SYSTEMS } from "../systems";
import { mountHarbourUI } from "../ui/mount";
import type { HarbourFeed } from "../data/fetch";
import { dismissPoster, resetPosterState } from "./poster";
import "./harbour-app.css";

/** Crossfade without data after this long: an honest "awaiting data" harbour beats a frozen poster. */
const DATA_WAIT_MS = 8000;
/** Frames to let the fleet place its boats after the first payloads land. */
const SETTLE_FRAMES = 4;

type Stage = "loading" | "live" | "failed";

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
    let raf = 0;
    let shellTimer = 0;

    const boot = async () => {
      engine = new Engine(world);
      for (const make of SYSTEMS) engine.add(make());
      await engine.init();
      if (cancelled) return;
      delete window.__harbourStats; // a previous mount's stats must not count as this world's first frame
      engine.start();
      unmountUI = mountHarbourUI(engine, ui);

      const feed = engine.ctx.services.get("feed") as HarbourFeed | undefined;
      const t0 = performance.now();
      let settle = -1;
      const watch = () => {
        if (cancelled) return;
        const drawn = window.__harbourStats?.firstFrameMs != null;
        const dataIn = !feed || feed.payloads.stablecoins !== undefined || performance.now() - t0 > DATA_WAIT_MS;
        if (drawn && dataIn && settle < 0) settle = SETTLE_FRAMES;
        if (settle > 0) settle--;
        if (settle === 0) {
          setStage("live");
          dismissPoster("crossfade");
          shellTimer = window.setTimeout(() => setShellGone(true), 1200);
          return;
        }
        raf = requestAnimationFrame(watch);
      };
      raf = requestAnimationFrame(watch);
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
      cancelAnimationFrame(raf);
      clearTimeout(shellTimer);
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
        : !shellGone && <ArrivalShell stage={stage === "live" ? "The harbour is live." : "Raising the harbour."} />}
    </>
  );
}
