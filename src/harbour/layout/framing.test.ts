import * as THREE from "three";
import { describe, expect, it } from "vitest";
import layout from "../data/layout.json";
import { CameraRig, type CameraPreset } from "../engine/camera-rig";
import type { EngineContext } from "../engine/types";
import { SkyCameraFrame } from "../sky/camera-frame";
import { FIT_BELOW_ASPECT, fitPresetToAspect, footLevel, footPoints, heroPoints } from "./framing";
import { toCameraPreset } from "./layout-system";
import type { HarbourLayout, Vec3 } from "./types";

const L = layout as unknown as HarbourLayout;
const heart = toCameraPreset(L.camera.presets.heart);
const overview = toCameraPreset(L.camera.presets.overview);
const hero = heroPoints(L);
const foot = footPoints(L);

/** NDC bounds of `pts` from preset `p` (the same placement as the camera rig). */
function ndc(p: CameraPreset, aspect: number, pts: readonly Vec3[]) {
  const camera = new THREE.PerspectiveCamera(p.fovDeg, aspect, 1, 20000);
  new CameraRig(camera).applyPreset(p, true);
  camera.updateMatrixWorld(true);
  let x = 0, y = 0;
  for (const q of pts) { const s = new THREE.Vector3(...q).project(camera); x = Math.max(x, Math.abs(s.x)); y = Math.max(y, Math.abs(s.y)); }
  return { x, y };
}

describe("aspect-aware framing", () => {
  it("finds the hero composition in the layout", () => {
    expect(hero.length).toBeGreaterThanOrEqual(6);
  });

  it("leaves the 16:10 framing (and anything at or above the threshold) untouched", () => {
    expect(fitPresetToAspect(heart, 1.6, hero)).toBe(heart);
    expect(fitPresetToAspect(heart, FIT_BELOW_ASPECT, hero)).toBe(heart);
  });

  it("is continuous at the threshold and backs off further the narrower the screen", () => {
    const edge = fitPresetToAspect(heart, FIT_BELOW_ASPECT - 1e-4, hero);
    expect(edge.distance).toBeCloseTo(heart.distance, -1);
    const fold = fitPresetToAspect(heart, 832 / 680, hero);
    const portrait = fitPresetToAspect(heart, 744 / 1133, hero);
    expect(fold.distance).toBeGreaterThanOrEqual(heart.distance);
    expect(fold.target).not.toEqual(heart.target); // the hero is drawn toward the centre
    expect(portrait.distance).toBeGreaterThan(fold.distance * 1.3);
    expect(portrait.distance).toBeLessThan(heart.distance * 3);
    // pitch, yaw and lens are the preset's own
    expect([portrait.pitchDeg, portrait.yawDeg, portrait.fovDeg]).toEqual([heart.pitchDeg, heart.yawDeg, heart.fovDeg]);
  });
});

describe("D12 portrait composition: the island holds the frame's foot", () => {
  const squarer = [0.6, 744 / 1133, 834 / 1112, 0.83, 0.9, 1, 1.1, 1.2, 1.3, FIT_BELOW_ASPECT - 1e-4];

  it("keeps the landing (heart) fit: its harbours already reach the bottom edge, or the hero's margin binds", () => {
    for (const a of squarer) {
      const fit = fitPresetToAspect(heart, a, hero, foot);
      expect(fit).toEqual(fitPresetToAspect(heart, a, hero));
      if (a >= 744 / 1133) expect(footLevel(fit, a, foot)).toBeLessThanOrEqual(-1);
      else expect(ndc(fit, a, hero).x).toBeGreaterThan(0.69);
    }
  });

  it("brings a squarer overview in until the foot is held, never past the hero's margin or the preset's lens", () => {
    for (const a of squarer) {
      const heroOnly = fitPresetToAspect(overview, a, hero), fit = fitPresetToAspect(overview, a, hero, foot);
      expect(fit.distance).toBeLessThanOrEqual(heroOnly.distance);
      const b = ndc(fit, a, hero);
      expect(b.x).toBeLessThanOrEqual(0.7 + 2e-3);
      expect(b.y).toBeLessThanOrEqual(0.9 + 2e-3);
      // either the foot is held, or the hero already stands at its margin and nothing nearer is allowed
      if (footLevel(fit, a, foot) > -1 + 2e-3) expect(b.x).toBeGreaterThan(0.69);
      expect([fit.pitchDeg, fit.yawDeg, fit.fovDeg]).toEqual([overview.pitchDeg, overview.yawDeg, overview.fovDeg]);
    }
    // tablet portrait: no longer an island floating over a third of empty sea
    const tablet = 834 / 1112;
    expect(footLevel(fitPresetToAspect(overview, tablet, hero), tablet, foot)).toBeGreaterThan(-0.7);
    expect(fitPresetToAspect(overview, tablet, hero, foot).distance).toBeLessThan(fitPresetToAspect(overview, tablet, hero).distance * 0.8);
  });

  it("is continuous across aspect, at the 1.4 threshold and untouched at or above it", () => {
    for (const base of [heart, overview]) {
      expect(fitPresetToAspect(base, FIT_BELOW_ASPECT, hero, foot)).toBe(base);
      expect(fitPresetToAspect(base, 2.4, hero, foot)).toBe(base);
      expect(fitPresetToAspect(base, FIT_BELOW_ASPECT - 1e-4, hero, foot).distance).toBeCloseTo(base.distance, -1);
      let prev = fitPresetToAspect(base, 0.6, hero, foot);
      for (let a = 0.6025; a < FIT_BELOW_ASPECT; a += 0.0025) {
        const next = fitPresetToAspect(base, a, hero, foot);
        expect(Math.abs(next.distance - prev.distance)).toBeLessThan(12);
        expect(Math.hypot(next.target[0] - prev.target[0], next.target[2] - prev.target[2])).toBeLessThan(12);
        prev = next;
      }
    }
  });
});

describe("E02: the card's painted ridges are the only far land", () => {
  const land: Array<[number, number]> = [...L.island.coast, ...L.island.breakwater, ...L.island.mole, ...(L.island.islets ?? []).flat()];
  const { min, max } = L.camera.panClamp;
  it.each([0.75, 1, 1.2, 1.4, 1.6, 2, 2.4])("stands beyond every land point in view at aspect %s: landing, max zoom and pan extremes", (aspect) => {
    const camera = new THREE.PerspectiveCamera(heart.fovDeg, aspect, 1, 20000);
    const rig = new CameraRig(camera), frame = new SkyCameraFrame();
    const ctx = { camera, rig, uniforms: { uResolution: { value: new THREE.Vector2(1000 * aspect, 1000) } }, services: new Map([["layout", L]]) } as unknown as EngineContext;
    const bd = { uCam: { value: new THREE.Vector3() }, uFwdAzV: { value: 0 }, uR: { value: 0 }, uSpan: { value: 0 }, uYBot: { value: 0 }, uYTop: { value: 0 }, uPxDeg: { value: 0 } };
    const card = new THREE.Mesh(), parallax = { value: new THREE.Vector4() };
    const landing = fitPresetToAspect(heart, aspect, hero, foot);
    const far = Math.max(L.camera.maxDistance ?? 0, landing.distance * 1.15);
    const pans = [[min[0], min[1]], [min[0], max[1]], [max[0], min[1]], [max[0], max[1]]];
    const views: CameraPreset[] = [landing, { ...landing, distance: far }, ...pans.map(([x, z]) => ({ ...heart, target: [x, heart.target[1], z] as Vec3, distance: far }))];
    let seen = 0;
    for (const view of views) {
      rig.applyPreset(view, true);
      camera.updateMatrixWorld(true);
      frame.update(ctx, card, bd, parallax);
      const R = frame.geometry.R, fwd = camera.getWorldDirection(new THREE.Vector3()), fl = Math.hypot(fwd.x, fwd.z);
      for (const [x, z] of land) {
        const s = new THREE.Vector3(x, 0, z).project(camera);
        if (Math.abs(s.x) > 1 || Math.abs(s.y) > 1 || s.z > 1) continue;
        seen++;
        expect(((x - camera.position.x) * fwd.x + (z - camera.position.z) * fwd.z) / fl).toBeLessThan(R);
      }
      // the ridges sit on screen, in the frame's upper part
      const horizon = new THREE.Vector3(camera.position.x + (fwd.x / fl) * R, 0, camera.position.z + (fwd.z / fl) * R).project(camera);
      expect(card.visible).toBe(true);
      expect(horizon.y).toBeGreaterThan(0.5);
      expect(horizon.y).toBeLessThan(1);
    }
    expect(seen).toBeGreaterThan(0);
  });
});
