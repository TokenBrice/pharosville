/**
 * The harbour wakes (12-M2): at the poster crossfade the camera stands a little further out and drifts
 * in to the landing framing over ~6.5 s on the minimum-jerk curve, while the Pharos fire is kindled up
 * to its live value (beam intro scale 0 → 1: it ends on the true PSI reading, it never lies). Any input
 * (pointer, wheel, key) lets go at once: the camera stays where it is and the fire is at full value.
 * Skipped under reduced motion, and in automated captures unless forced with `?wake=1` (`?wake=0`
 * suppresses it).
 */
import { minJerk } from "../engine/camera-rig";
import type { Engine } from "../engine/engine";
import type { MotionService } from "../ui/services";

/** How much further out the drift starts (distance share). The poster is scaled to match. */
export const WAKE_PULLBACK = 0.12;
const WAKE_MS = 6500;
/** The fire kindles over this window (s after the crossfade starts). */
const KINDLE_FROM = 0.3, KINDLE_S = 2.6;

interface BeamIntro { setIntroScale?(k: number): void }

/** The fire's intro scale at `t` s after the crossfade: dark, then kindled to full on the M1 curve. */
export const kindle = (t: number): number => minJerk((t - KINDLE_FROM) / KINDLE_S);

export function wantsWake(engine: Engine): boolean {
  const forced = new URLSearchParams(location.search).get("wake");
  if (forced === "0") return false;
  if ((engine.ctx.services.get("motion") as MotionService | undefined)?.reduced) return false;
  return forced === "1" || !navigator.webdriver;
}

/** Start the wake now (call just before the poster crossfade). Returns a cleanup. */
export function startWake(engine: Engine): () => void {
  const { rig, services } = engine.ctx;
  const beam = () => services.get("beam") as BeamIntro | undefined;
  const home = {
    target: [rig.target.x, rig.target.y, rig.target.z] as [number, number, number], distance: rig.distance,
    fovDeg: rig.camera.fov, pitchDeg: (rig.pitch * 180) / Math.PI, yawDeg: (rig.yaw * 180) / Math.PI,
  };
  rig.applyPreset({ ...home, distance: home.distance * (1 + WAKE_PULLBACK) }, true);
  rig.glideTo(home, { ms: WAKE_MS, lift: 0 });
  beam()?.setIntroScale?.(0);

  const epoch = rig.inputEpoch;
  const t0 = performance.now();
  let raf = 0;
  let done = false;
  const finish = (letGo: boolean) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    if (letGo) rig.cancelGlide();
    beam()?.setIntroScale?.(1);
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
    beam()?.setIntroScale?.(kindle(t));
    if (t * 1000 >= WAKE_MS) { finish(false); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => finish(false);
}
