/**
 * The arrival (E28/E29). Analytical light always starts at its true current or neutral target (A16): nothing here
 * reads or writes the beam, the fire or the PSI sweep's phase.
 *
 *  - The drift: the live camera starts WAKE_PULLBACK further out and settles home over WAKE_MS. The pull-back is a
 *    homothety about the Pharos's lantern (its fire), so the hero holds still on screen while the harbour settles
 *    round it, on every aspect.
 *  - The beat: after the poster the decorative lamps (windows, quay lamps, pier heads, riding lights) start dark and
 *    catch outward from the Pharos between BEAT_FROM_S and BEAT_TO_S, then rest on the clock's true state
 *    (lamp-wave.ts `uLampArrive`). By day they are dark anyway, so the beat shows only at dusk and night.
 *  - Interruption: camera input on the canvas (a press, the wheel, a pan or zoom from any device) lets go of the
 *    drift and settles the beat over BEAT_SETTLE_S. Tab, search and the other keys do not touch either.
 *  - The poster's registration (E28): the CSS transform that lays the poster's hero points over the live first frame.
 */
import * as THREE from "three";
import type { CameraPreset } from "../engine/camera-rig";
import type { Engine } from "../engine/engine";
import { heroPoints } from "../layout/framing";
import { defaultPresetName, toCameraPreset } from "../layout/layout-system";
import type { Vec3 } from "../layout/types";
import { lampWaveUniforms } from "../lights/lamp-wave";
import type { PosterFade, PosterRegistration } from "./poster";

/**
 * How much further out the drift starts (distance share), about the Pharos's lantern. 8 % rather than v1.6's 12 %: a
 * dolly's parallax is the one thing a 2D poster cannot follow, and at 8 % the registered poster's ghost over the near
 * moles stays under about 19 px (p90 at 1600×1000), as the old axis pull-back's did at 12 %, with the fire held still.
 */
export const WAKE_PULLBACK = 0.08;
export const WAKE_MS = 6500;
/** E29: the decorative lamps catch outward over this window after the poster (s from the reveal). */
export const BEAT_FROM_S = 2.9;
export const BEAT_TO_S = 6;
/** E29: after canvas camera input the beat comes to the clock's true state over this long (s). */
export const BEAT_SETTLE_S = 0.4;
/** E28: the hero points' weights in the poster fit (heroPoints order: the Pharos's foot and lantern first). */
const HERO_WEIGHTS = [4, 4, 1, 1, 1, 1];

export function wantsWake(engine: Engine): boolean {
  const forced = new URLSearchParams(location.search).get("wake");
  if (forced === "0") return false;
  if (engine.ctx.services.get("motion")?.reduced) return false;
  return forced === "1" || !navigator.webdriver;
}

/** The drift's fixed point: the lantern (the beam's origin), else the Pharos landmark's head, else none. */
export function wakePivot(engine: Engine): Vec3 | null {
  const lantern = engine.ctx.services.get("lighthouse")?.lanternPosition;
  if (lantern && lantern.lengthSq() > 0) return [lantern.x, lantern.y, lantern.z];
  const pharos = engine.ctx.services.get("layout")?.landmarks.find((l) => l.id === "pharos")?.position;
  return pharos ? [pharos[0], pharos[1] + 88, pharos[2]] : null;
}

/** The drift's first pose: home scaled about the pivot by 1 + WAKE_PULLBACK (about the target when there is none). */
export function wakeStart(home: CameraPreset, pivot: Vec3 | null): CameraPreset {
  const k = 1 + WAKE_PULLBACK;
  const p = pivot ?? home.target;
  return { ...home, distance: home.distance * k, target: [0, 1, 2].map((i) => p[i] + (home.target[i] - p[i]) * k) as [number, number, number] };
}

/** The beat's value at `t` s after the reveal: 0 every decorative lamp dark … 1 the clock's true state. */
export function beatAt(t: number): number {
  return Math.min(1, Math.max(0, (t - BEAT_FROM_S) / (BEAT_TO_S - BEAT_FROM_S)));
}

/** Start the wake now (call just before the poster crossfade). Returns a cleanup that leaves the true state. */
export function startWake(engine: Engine): () => void {
  const { rig, services, renderer } = engine.ctx;
  const home: CameraPreset = {
    target: [rig.target.x, rig.target.y, rig.target.z], distance: rig.distance,
    fovDeg: rig.camera.fov, pitchDeg: (rig.pitch * 180) / Math.PI, yawDeg: (rig.yaw * 180) / Math.PI,
  };
  rig.applyPreset(wakeStart(home, wakePivot(engine)), true);
  rig.glideTo(home, { ms: WAKE_MS, lift: 0 });
  const arrive = lampWaveUniforms.uLampArrive;
  arrive.value = 0;

  const epoch = rig.inputEpoch;
  const t0 = performance.now();
  let raf = 0;
  let drifting = true;
  let done = false;
  let settle: { at: number; from: number } | null = null;
  const canvas = renderer.domElement;
  /** Camera input: the visitor takes the camera (the drift lets go) and the beat settles, never cuts. */
  const interrupt = (letGo: boolean) => {
    if (drifting) { drifting = false; if (letGo) rig.cancelGlide(); }
    if (!settle && arrive.value < 1) settle = { at: performance.now(), from: arrive.value };
  };
  const onInput = () => interrupt(true);
  const opts = { capture: true, passive: true } as const;
  canvas.addEventListener("pointerdown", onInput, opts);
  canvas.addEventListener("wheel", onInput, opts);
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    arrive.value = 1;
    canvas.removeEventListener("pointerdown", onInput, opts);
    canvas.removeEventListener("wheel", onInput, opts);
    offMotion();
  };
  // reduced motion (the OS or Still world) mid-arrival: the drift stops where it stands and the lamps cut to the clock
  const offMotion = services.get("motion")?.subscribe((reduced) => { if (reduced) { if (drifting) rig.cancelGlide(); drifting = false; finish(); } }) ?? (() => undefined);
  const step = () => {
    const now = performance.now();
    if (drifting && rig.inputEpoch !== epoch) interrupt(false);
    if (drifting && now - t0 >= WAKE_MS) drifting = false;
    arrive.value = settle ? Math.min(1, settle.from + ((1 - settle.from) * (now - settle.at)) / (BEAT_SETTLE_S * 1000)) : beatAt((now - t0) / 1000);
    if (!drifting && arrive.value >= 1) { finish(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return finish;
}

const posterCam = new THREE.PerspectiveCamera();
const v = new THREE.Vector3();

/** A preset's camera, as the rig would place it (camera-rig.ts sync), at `aspect`. */
function placeCamera(p: CameraPreset, aspect: number, cam: THREE.PerspectiveCamera): THREE.PerspectiveCamera {
  const yaw = THREE.MathUtils.degToRad(p.yawDeg), pitch = THREE.MathUtils.degToRad(p.pitchDeg), cp = Math.cos(pitch);
  cam.fov = p.fovDeg; cam.aspect = aspect; cam.near = Math.max(1, p.distance * 0.05); cam.far = p.distance * 12;
  cam.updateProjectionMatrix();
  cam.position.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).multiplyScalar(p.distance).add(v.set(...p.target));
  cam.lookAt(v.set(...p.target));
  cam.updateMatrixWorld(true);
  return cam;
}

/**
 * The weighted least-squares similarity (one scale, a translation) taking points `from` onto points `to`;
 * null when it is degenerate.
 */
export function fitSimilarity(from: ReadonlyArray<[number, number]>, to: ReadonlyArray<[number, number]>, weights: readonly number[]): { s: number; x: number; y: number } | null {
  let w = 0, fx = 0, fy = 0, tx = 0, ty = 0;
  for (let i = 0; i < from.length; i++) { const k = weights[i] ?? 1; w += k; fx += k * from[i][0]; fy += k * from[i][1]; tx += k * to[i][0]; ty += k * to[i][1]; }
  if (from.length < 2 || w <= 0) return null;
  fx /= w; fy /= w; tx /= w; ty /= w;
  let num = 0, den = 0;
  for (let i = 0; i < from.length; i++) {
    const k = weights[i] ?? 1, ax = from[i][0] - fx, ay = from[i][1] - fy;
    num += k * (ax * (to[i][0] - tx) + ay * (to[i][1] - ty));
    den += k * (ax * ax + ay * ay);
  }
  const s = num / den;
  return Number.isFinite(s) && s > 0 ? { s, x: tx - s * fx, y: ty - s * fy } : null;
}

/**
 * E28: the CSS transform (px; origin at the poster box's top-left) that lays the poster's hero points (the poster is
 * the landing preset's frame at the image's own aspect, scripts/harbour/render-poster.mjs) over where the live camera
 * draws them now. `box` is the poster element's box (it may run past the window, arrival-shell.css); the image covers it.
 */
export function posterRegistration(engine: Engine, box: { left: number; top: number; width: number; height: number }, image = { width: 1600, height: 1000 }): PosterRegistration | null {
  const { ctx } = engine, layout = ctx.services.get("layout");
  if (!layout || !(box.width > 0 && box.height > 0 && image.width > 0 && image.height > 0)) return null;
  const preset = layout.camera.presets[defaultPresetName(layout)];
  if (!preset) return null;
  const poster = placeCamera(toCameraPreset(preset), image.width / image.height, posterCam);
  const live = ctx.camera, canvas = ctx.renderer.domElement.getBoundingClientRect();
  live.updateMatrixWorld(true);
  const c = Math.max(box.width / image.width, box.height / image.height);
  const ox = (box.width - image.width * c) / 2, oy = (box.height - image.height * c) / 2;
  const from: Array<[number, number]> = [], to: Array<[number, number]> = [], weights: number[] = [];
  heroPoints(layout).forEach((p, i) => {
    v.set(...p).project(poster);
    if (Math.abs(v.z) > 1) return;
    const e: [number, number] = [ox + ((v.x + 1) / 2) * image.width * c, oy + ((1 - v.y) / 2) * image.height * c];
    v.set(...p).project(live);
    if (Math.abs(v.z) > 1) return;
    from.push(e);
    to.push([canvas.left - box.left + ((v.x + 1) / 2) * canvas.width, canvas.top - box.top + ((1 - v.y) / 2) * canvas.height]);
    weights.push(HERO_WEIGHTS[i] ?? 1);
  });
  const fit = fitSimilarity(from, to, weights);
  // a degenerate or wild fit (a hidden canvas, a camera somewhere else entirely) keeps the plain fade
  return fit && fit.s > 0.25 && fit.s < 4 ? fit : null;
}

/**
 * E28: how the poster leaves. Reduced motion: opacity only. Otherwise it settles onto the live harbour (registration)
 * and, when it is the day key art over a dusk or night harbour, dims toward night (brightness 0.4, saturation 0.6 at
 * full night) in step with its fade; the night key art needs no dip.
 */
export function arrivalFade(engine: Engine): PosterFade {
  const reduced = engine.ctx.services.get("motion")?.reduced ?? false;
  const poster = document.getElementById("pv-poster");
  if (reduced || !poster) return { reduced };
  const img = poster.querySelector("img");
  const night = document.documentElement.getAttribute("data-pv-hour") === "night";
  return {
    register: posterRegistration(engine, poster.getBoundingClientRect(), { width: img?.naturalWidth || 1600, height: img?.naturalHeight || 1000 }),
    dip: night ? 0 : engine.ctx.uniforms.uNight.value,
  };
}
