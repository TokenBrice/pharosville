/** Arrival camera drift. Analytical light always starts at its true current or neutral target. */
import type { Engine } from "../engine/engine";
import type { MotionService } from "../ui/services";

/** How much further out the drift starts (distance share). The poster is scaled to match. */
export const WAKE_PULLBACK = 0.12;
const WAKE_MS = 6500;
export function wantsWake(engine: Engine): boolean {
  const forced = new URLSearchParams(location.search).get("wake");
  if (forced === "0") return false;
  if ((engine.ctx.services.get("motion") as MotionService | undefined)?.reduced) return false;
  return forced === "1" || !navigator.webdriver;
}

/** Start the wake now (call just before the poster crossfade). Returns a cleanup. */
export function startWake(engine: Engine): () => void {
  const { rig } = engine.ctx;
  const home = {
    target: [rig.target.x, rig.target.y, rig.target.z] as [number, number, number], distance: rig.distance,
    fovDeg: rig.camera.fov, pitchDeg: (rig.pitch * 180) / Math.PI, yawDeg: (rig.yaw * 180) / Math.PI,
  };
  rig.applyPreset({ ...home, distance: home.distance * (1 + WAKE_PULLBACK) }, true);
  rig.glideTo(home, { ms: WAKE_MS, lift: 0 });

  const epoch = rig.inputEpoch;
  const t0 = performance.now();
  let raf = 0;
  let done = false;
  const finish = (letGo: boolean) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    if (letGo) rig.cancelGlide();
    off();
  };
  const onInput = () => finish(true);
  const opts = { capture: true, passive: true } as const;
  addEventListener("pointerdown", onInput, opts);
  addEventListener("wheel", onInput, opts);
  addEventListener("keydown", onInput, opts);
  const off = () => {
    removeEventListener("pointerdown", onInput, opts);
    removeEventListener("wheel", onInput, opts);
    removeEventListener("keydown", onInput, opts);
  };
  const step = () => {
    const t = (performance.now() - t0) / 1000;
    if (rig.inputEpoch !== epoch) { finish(false); return; }
    if (t * 1000 >= WAKE_MS) { finish(false); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => finish(false);
}
