import * as THREE from "three";
import type { EffectComposer } from "postprocessing";
import { afterEach, expect, it, vi } from "vitest";
import { GpuPassProfiler } from "./gpu-passes";

afterEach(() => vi.unstubAllGlobals());
it("records material and caster submissions, target sizes and capability metadata; restores hooks", () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = "test-hull"; mesh.castShadow = true; scene.add(mesh);
  const before = mesh.onBeforeRender, beforeShadow = mesh.onBeforeShadow;
  const gl = {
    RENDERER: 1, VERSION: 2, QUERY_RESULT_AVAILABLE: 3, QUERY_RESULT: 4,
    getExtension: (name: string) => name === "EXT_disjoint_timer_query_webgl2" ? { TIME_ELAPSED_EXT: 5, GPU_DISJOINT_EXT: 6 } : null,
    getParameter: (name: number) => name === 6 ? false : "test",
    getSupportedExtensions: () => ["EXT_disjoint_timer_query_webgl2"],
    createQuery: () => ({}), beginQuery: vi.fn(), endQuery: vi.fn(), deleteQuery: vi.fn(),
    getQueryParameter: (_q: unknown, name: number) => name === 3 ? true : 1000000,
    drawElements: vi.fn(), drawArrays: vi.fn(), drawArraysInstanced: vi.fn(), drawElementsInstanced: vi.fn(), clear: vi.fn(), blitFramebuffer: vi.fn(), generateMipmap: vi.fn(),
  };
  const target = new THREE.WebGLRenderTarget(400, 250);
  const renderer = {
    getContext: () => gl, getRenderTarget: () => target, getPixelRatio: () => 1,
    domElement: { width: 1600, height: 1000 }, shadowMap: { render: vi.fn() },
    render(_scene: THREE.Scene, _camera: THREE.Camera) {
      mesh.onBeforeShadow(renderer as unknown as THREE.WebGLRenderer, scene, camera, camera, mesh.geometry, mesh.material, new THREE.Group());
      gl.drawElements();
      mesh.onAfterShadow(renderer as unknown as THREE.WebGLRenderer, scene, camera, camera, mesh.geometry, mesh.material, new THREE.Group());
      mesh.onBeforeRender(renderer as unknown as THREE.WebGLRenderer, scene, camera, mesh.geometry, mesh.material, new THREE.Group());
      gl.drawElements();
      mesh.onAfterRender(renderer as unknown as THREE.WebGLRenderer, scene, camera, mesh.geometry, mesh.material, new THREE.Group());
    },
  };
  vi.stubGlobal("window", { __harbour: { ctx: { scene } }, __harbourStats: { quality: "high" } });
  const composer = { passes: [], render: () => renderer.render(scene, camera) };
  const profile = new GpuPassProfiler(renderer as unknown as THREE.WebGLRenderer, composer as unknown as EffectComposer);
  for (let i = 0; i < 12; i++) composer.render();
  const snapshot = profile.snapshot();
  expect(snapshot.sampledFrames).toBeGreaterThan(0);
  expect(snapshot.capabilities.extensions).toEqual(["EXT_disjoint_timer_query_webgl2"]);
  expect(Object.values(snapshot.targets)).toContainEqual({ width: 400, height: 250 });
  expect(snapshot.samples.some((s) => Object.keys(s.submissions).some((key) => key.includes("caster:test-hull")))).toBe(true);
  profile.reset();
  expect(profile.snapshot().samples).toEqual([]);
  profile.dispose();
  expect(mesh.onBeforeRender).toBe(before); expect(mesh.onBeforeShadow).toBe(beforeShadow);
  target.dispose(); mesh.geometry.dispose(); mesh.material.dispose();
});
