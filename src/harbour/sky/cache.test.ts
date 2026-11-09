import * as THREE from "three";
import { expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import type { FullscreenPass } from "../ocean/gpu-bake";
import { createWorldUniforms } from "../engine/uniforms";
import { SkyCameraFrame } from "./camera-frame";
import { SkyBandCache } from "./band-cache";

it("keeps the horizon beyond visible land and invalidates camera geometry only for its inputs", () => {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 1, 10000);
  camera.position.set(0, 100, 100); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const uniforms = createWorldUniforms(), target = new THREE.Vector3();
  const layout = { island: { coast: [[0, -1000]], islets: [[[0, -1200]]] } } as unknown as HarbourLayout;
  const services = new Map<string, unknown>([["layout", layout]]);
  const ctx = { camera, uniforms, services, rig: { target } } as unknown as EngineContext;
  const frame = new SkyCameraFrame(), mesh = new THREE.Mesh();
  const bd = { uCam: { value: new THREE.Vector3() }, uFwdAzV: { value: 0 }, uR: { value: 0 }, uSpan: { value: 0 },
    uYBot: { value: 0 }, uYTop: { value: 0 }, uPxDeg: { value: 0 } };
  const parallax = { value: new THREE.Vector4() };
  expect(frame.update(ctx, mesh, bd, parallax)).toBe(true);
  expect(frame.geometry.R).toBe(1314); expect(bd.uR.value).toBe(1314);
  expect(frame.update(ctx, mesh, bd, parallax)).toBe(false);
  uniforms.uNight.value = 1; expect(frame.update(ctx, mesh, bd, parallax)).toBe(false);
  target.x = 50; expect(frame.update(ctx, mesh, bd, parallax)).toBe(true);
  expect(parallax.value.x).toBeCloseTo(50 / 9000 * 180 / Math.PI);
  uniforms.uResolution.value.y = 700; expect(frame.update(ctx, mesh, bd, parallax)).toBe(true);
  expect(bd.uPxDeg.value).toBe(40 / 700);
  services.set("layout", undefined); expect(frame.update(ctx, mesh, bd, parallax)).toBe(true);
  expect(frame.geometry.R).toBeLessThan(1314);
});

it("reuses only identical band inputs, preserving animated deck/rain cadence and failed-render retries", () => {
  const cache = new SkyBandCache(), uniforms = createWorldUniforms();
  const ctx = { uniforms, renderer: {} } as EngineContext;
  const u = { uWeather: { value: new THREE.Vector3(0.1, 0.3, 0) }, uPrecipSky: { value: new THREE.Vector4() },
    uStorm: { value: 0 }, uSkyNoise: { value: new THREE.Texture() } };
  const color = { value: new THREE.Color(0.1, 0.2, 0.3) }, storm = u.uStorm;
  cache.setInputs([color, storm]);
  const render = vi.fn(), pass = { render } as unknown as FullscreenPass, rt = new THREE.WebGLRenderTarget(1, 1);
  const draw = () => cache.render(ctx, u, pass, rt, uniforms.uTime.value);
  draw(); draw(); expect(render).toHaveBeenCalledTimes(1);
  uniforms.uTime.value++; u.uWeather.value.z++; draw(); expect(render).toHaveBeenCalledTimes(1);
  color.value.r++; draw(); expect(render).toHaveBeenCalledTimes(2);
  u.uPrecipSky.value.x = 0.01; draw(); uniforms.uTime.value++; draw(); expect(render).toHaveBeenCalledTimes(4);
  u.uPrecipSky.value.x = 0; draw(); storm.value = 0.1; draw(); u.uWeather.value.z++; draw(); expect(render).toHaveBeenCalledTimes(7);
  u.uSkyNoise.value.needsUpdate = true; draw(); expect(render).toHaveBeenCalledTimes(8);
  cache.dirty = true; render.mockImplementationOnce(() => { throw new Error("driver"); });
  expect(draw).toThrow("driver"); draw(); expect(render).toHaveBeenCalledTimes(10);
  u.uSkyNoise.value.dispose(); rt.dispose();
});
