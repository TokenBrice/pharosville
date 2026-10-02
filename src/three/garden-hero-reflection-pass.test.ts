import {
  Color, DirectionalLight, Group, Mesh, PerspectiveCamera, Scene, Vector2, Vector3,
  WebGLRenderTarget, type WebGLRenderer,
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  GARDEN_HERO_REFLECTION_LAYER,
  createGardenHeroReflectionPass,
  mirrorGardenHeroCamera,
} from "./garden-hero-reflection-pass";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";

describe("garden hero reflection camera", () => {
  it("reflects the world position and orientation about the water, including parent transforms", () => {
    const rig = new Group();
    rig.position.set(11, 3, -7);
    rig.rotation.y = 0.3;
    const main = new PerspectiveCamera(32, 16 / 9, 0.1, 1000);
    main.position.set(20, 35, 70);
    main.lookAt(0, GARDEN_WATER_Y, 0);
    rig.add(main);
    const mirror = new PerspectiveCamera();
    const originalProjection = main.projectionMatrix.clone();
    mirrorGardenHeroCamera(main, mirror);
    const position = main.getWorldPosition(new Vector3());
    expect(mirror.position.x).toBeCloseTo(position.x);
    expect(mirror.position.y).toBeCloseTo(2 * GARDEN_WATER_Y - position.y);
    expect(mirror.position.z).toBeCloseTo(position.z);
    const forward = main.getWorldDirection(new Vector3());
    forward.y *= -1;
    expect(mirror.getWorldDirection(new Vector3()).distanceTo(forward)).toBeLessThan(1e-10);
    expect(main.projectionMatrix.equals(originalProjection)).toBe(true);
  });

  it("clips submerged geometry while admitting the hero and excluding fleet layers", () => {
    const main = new PerspectiveCamera(32, 1, 0.1, 1000);
    main.position.set(0, 20, 80);
    main.lookAt(0, GARDEN_WATER_Y, 0);
    const mirror = new PerspectiveCamera();
    mirrorGardenHeroCamera(main, mirror);
    const hero = new Mesh();
    hero.layers.enable(GARDEN_HERO_REFLECTION_LAYER);
    const fleet = new Mesh();
    expect(mirror.layers.test(hero.layers)).toBe(true);
    expect(mirror.layers.test(fleet.layers)).toBe(false);
    const above = new Vector3(0, GARDEN_WATER_Y + 5, 0).project(mirror);
    const below = new Vector3(0, GARDEN_WATER_Y - 5, 0).project(mirror);
    expect(above.z).toBeGreaterThanOrEqual(-1);
    expect(above.z).toBeLessThanOrEqual(1);
    expect(below.z).toBeLessThan(-1);
  });
});

function reflectionFixture() {
  let dpr = 1;
  const css = new Vector2(1600, 1000);
  const previousTarget = new WebGLRenderTarget(4, 4);
  let bound: WebGLRenderTarget | null = previousTarget;
  let face = 2;
  let mip = 3;
  const clearColor = new Color("#123456");
  let clearAlpha = 0.7;
  let captureTarget: WebGLRenderTarget | null = null;
  const captures: Array<{ model: boolean; intensity: number }> = [];
  const scene = new Scene();
  scene.background = new Color("#abcdef");
  const island = new Group();
  const tower = new Group();
  const model = new Mesh();
  tower.position.y = GARDEN_WATER_Y + 10;
  island.add(tower);
  scene.add(island);
  const light = new DirectionalLight();
  scene.add(light);
  const renderer = {
    shadowMap: { enabled: true, autoUpdate: false, needsUpdate: true },
    xr: { enabled: true },
    getDrawingBufferSize: (out: Vector2) => out.copy(css).multiplyScalar(dpr),
    getPixelRatio: () => dpr,
    getRenderTarget: () => bound,
    getActiveCubeFace: () => face,
    getActiveMipmapLevel: () => mip,
    getClearAlpha: () => clearAlpha,
    getClearColor: (out: Color) => out.copy(clearColor),
    setClearColor: (color: Color | number, alpha: number) => {
      clearColor.set(color);
      clearAlpha = alpha;
    },
    clear: vi.fn(),
    setRenderTarget: (target: WebGLRenderTarget | null, nextFace = 0, nextMip = 0) => {
      bound = target;
      face = nextFace;
      mip = nextMip;
    },
    render: vi.fn((capturedScene: Scene, camera: PerspectiveCamera) => {
      captureTarget = bound;
      captures.push({
        model: capturedScene.getObjectById(model.id) === model && camera.layers.test(model.layers),
        intensity: light.intensity,
      });
    }),
  };
  const camera = new PerspectiveCamera(32, 1.6, 0.1, 1000);
  camera.position.set(0, 35, 90);
  camera.lookAt(0, GARDEN_WATER_Y, 0);
  const pass = createGardenHeroReflectionPass(renderer as unknown as WebGLRenderer);
  return {
    renderer, camera, island, tower, model, light, scene, css, pass, captures, previousTarget,
    paint: (reduced = true) => pass.render(scene, camera, island, tower, reduced),
    target: () => captureTarget!,
    setDpr: (value: number) => { dpr = value; },
    dispose: () => { pass.dispose(); previousTarget.dispose(); },
  };
}

describe("garden hero reflection capture", () => {
  it("reuses identical successful static capture", () => {
    const f = reflectionFixture();
    f.paint();
    const matrix = f.pass.uniforms.uHeroReflectionMatrix.value.clone();
    f.paint();
    expect(f.captures).toHaveLength(1);
    expect(f.pass.uniforms.uHeroReflectionMatrix.value.equals(matrix)).toBe(true);
    f.pass.invalidate();
    f.paint();
    f.paint();
    expect(f.captures).toHaveLength(2);
    f.dispose();
  });

  it("recaptures changed view and projection", () => {
    const f = reflectionFixture();
    const rig = new Group();
    rig.add(f.camera);
    f.paint();
    let previous = f.pass.uniforms.uHeroReflectionMatrix.value.clone();
    rig.position.x += 0.000001;
    f.paint();
    expect(f.pass.uniforms.uHeroReflectionMatrix.value.equals(previous)).toBe(false);
    f.paint();
    expect(f.captures).toHaveLength(2);
    previous = f.pass.uniforms.uHeroReflectionMatrix.value.clone();
    f.camera.fov = 38;
    f.camera.aspect = 1.8;
    f.camera.updateProjectionMatrix();
    f.paint();
    expect(f.pass.uniforms.uHeroReflectionMatrix.value.equals(previous)).toBe(false);
    f.paint();
    expect(f.captures).toHaveLength(3);
    f.dispose();
  });

  it("resizes half CSS target at DPR 1 and 2", () => {
    const f = reflectionFixture();
    f.paint();
    expect([f.target().width, f.target().height]).toEqual([800, 500]);
    f.setDpr(2);
    f.paint();
    expect([f.target().width, f.target().height]).toEqual([800, 500]);
    f.css.set(1200, 640);
    f.paint();
    expect([f.target().width, f.target().height]).toEqual([600, 320]);
    f.setDpr(1);
    f.paint();
    f.paint();
    expect([f.target().width, f.target().height]).toEqual([600, 320]);
    expect(f.captures).toHaveLength(4);
    f.dispose();
  });

  it("invalidated same-wrapper content and light are captured", () => {
    const f = reflectionFixture();
    f.paint();
    f.model.layers.enable(GARDEN_HERO_REFLECTION_LAYER);
    f.tower.add(f.model);
    f.light.intensity = 0.2;
    f.pass.invalidate();
    f.paint();
    f.paint();
    expect(f.captures).toEqual([
      { model: false, intensity: 1 }, { model: true, intensity: 0.2 },
    ]);
    f.island.clear();
    f.island.add(f.tower);
    f.tower.remove(f.model);
    f.pass.invalidate();
    f.paint();
    f.paint();
    expect(f.captures.at(-1)).toEqual({ model: false, intensity: 0.2 });
    expect(f.captures).toHaveLength(3);
    f.dispose();
  });

  it("culling and mode changes do not reuse incompatible capture", () => {
    const f = reflectionFixture();
    f.paint(false);
    f.paint(true);
    f.paint(true);
    expect(f.captures).toHaveLength(2);
    f.camera.lookAt(1000, 35, 90);
    f.pass.invalidate();
    f.paint();
    expect(f.pass.uniforms.uHeroReflectionStrength.value).toBe(0);
    expect(f.captures).toHaveLength(2);
    f.camera.lookAt(0, GARDEN_WATER_Y, 0);
    f.paint();
    f.paint();
    expect(f.pass.uniforms.uHeroReflectionStrength.value).toBe(1);
    expect(f.captures).toHaveLength(3);
    f.paint(false);
    f.paint(false);
    expect(f.captures).toHaveLength(5);
    f.dispose();
  });

  it("failed capture remains dirty and restores renderer state", () => {
    const f = reflectionFixture();
    f.paint();
    const background = f.scene.background;
    f.pass.invalidate();
    f.renderer.render.mockImplementationOnce(() => { throw new Error("capture failed"); });
    expect(() => f.paint()).toThrow("capture failed");
    expect(f.renderer.getRenderTarget()).toBe(f.previousTarget);
    expect(f.renderer.getActiveCubeFace()).toBe(2);
    expect(f.renderer.getActiveMipmapLevel()).toBe(3);
    expect(f.scene.background).toBe(background);
    expect(f.renderer.getClearColor(new Color()).getHex()).toBe(new Color("#123456").getHex());
    expect(f.renderer.getClearAlpha()).toBe(0.7);
    expect(f.renderer.xr.enabled).toBe(true);
    expect(f.renderer.shadowMap).toEqual({ enabled: true, autoUpdate: false, needsUpdate: true });
    f.paint();
    f.paint();
    expect(f.captures).toHaveLength(2);
    expect(f.pass.uniforms.uHeroReflectionStrength.value).toBe(1);
    f.dispose();
  });
});
