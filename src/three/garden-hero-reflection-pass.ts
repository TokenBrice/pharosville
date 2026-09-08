import {
  Color,
  HalfFloatType,
  Light,
  LinearSRGBColorSpace,
  Matrix4,
  PerspectiveCamera,
  Plane,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from "three";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";

/** Reserved for the island silhouette; fleet meshes retain their default layer. */
export const GARDEN_HERO_REFLECTION_LAYER = 7;

const direction = new Vector3();
const up = new Vector3();
const plane = new Plane();
const clip = new Vector4();
const q = new Vector4();

function enableReflectionLight(object: Object3D): void {
  if (object instanceof Light) object.layers.enable(GARDEN_HERO_REFLECTION_LAYER);
}

/** Reflect the world pose, then keep only geometry above the water plane. */
export function mirrorGardenHeroCamera(main: PerspectiveCamera, mirror: PerspectiveCamera): void {
  main.updateWorldMatrix(true, false);
  mirror.near = main.near;
  mirror.far = main.far;
  mirror.fov = main.fov;
  mirror.aspect = main.aspect;
  mirror.zoom = main.zoom;
  mirror.projectionMatrix.copy(main.projectionMatrix);
  main.getWorldPosition(mirror.position);
  mirror.position.y = 2 * GARDEN_WATER_Y - mirror.position.y;
  main.getWorldDirection(direction);
  direction.y = -direction.y;
  up.setFromMatrixColumn(main.matrixWorld, 1);
  up.y = -up.y;
  mirror.up.copy(up);
  direction.add(mirror.position);
  mirror.lookAt(direction);
  mirror.layers.set(GARDEN_HERO_REFLECTION_LAYER);
  mirror.updateMatrixWorld(true);

  plane.set(up.set(0, 1, 0), -GARDEN_WATER_Y);
  plane.applyMatrix4(mirror.matrixWorldInverse);
  clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const projection = mirror.projectionMatrix.elements;
  q.set(
    (Math.sign(clip.x) + projection[8]!) / projection[0]!,
    (Math.sign(clip.y) + projection[9]!) / projection[5]!,
    -1,
    (1 + projection[10]!) / projection[14]!,
  );
  clip.multiplyScalar(2 / clip.dot(q));
  projection[2] = clip.x;
  projection[6] = clip.y;
  projection[10] = clip.z + 1;
  projection[14] = clip.w;
  mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();
}

export function createGardenHeroReflectionPass(renderer: WebGLRenderer) {
  const target = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
  });
  target.texture.name = "garden-hero-reflection";
  target.texture.colorSpace = LinearSRGBColorSpace;
  const camera = new PerspectiveCamera();
  const matrix = new Matrix4();
  const size = new Vector2();
  const anchor = new Vector3();
  const clearColor = new Color();
  let rendered = false;
  let owner: Object3D | null = null;
  const uniforms = {
    uHeroReflection: { value: target.texture },
    uHeroReflectionMatrix: { value: matrix },
    uHeroReflectionStrength: { value: 0 },
  };
  return {
    uniforms,
    getReflectionTexture: () => target.texture,
    render(scene: Scene, main: PerspectiveCamera, island: Object3D, tower: Object3D, reducedMotion: boolean) {
      if (owner !== island) {
        owner = island;
        rendered = false;
      }
      if (reducedMotion && rendered) return;
      main.updateWorldMatrix(true, false);
      tower.getWorldPosition(anchor);
      anchor.project(main);
      if (anchor.z < -1 || anchor.z > 1 || Math.abs(anchor.x) > 1.5 || Math.abs(anchor.y) > 1.5) {
        uniforms.uHeroReflectionStrength.value = 0;
        return;
      }
      renderer.getDrawingBufferSize(size);
      target.setSize(Math.max(1, Math.floor(size.x / 2)), Math.max(1, Math.floor(size.y / 2)));
      mirrorGardenHeroCamera(main, camera);
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      const previousTarget = renderer.getRenderTarget();
      const previousFace = renderer.getActiveCubeFace();
      const previousMip = renderer.getActiveMipmapLevel();
      const background = scene.background;
      const shadows = renderer.shadowMap.enabled;
      const xr = renderer.xr.enabled;
      const clearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      try {
        scene.traverse(enableReflectionLight);
        scene.background = null;
        renderer.xr.enabled = false;
        // Disable both shadow submission and sampling; leave autoUpdate/needsUpdate intact.
        renderer.shadowMap.enabled = false;
        renderer.setRenderTarget(target);
        renderer.setClearColor(0, 0);
        renderer.clear();
        renderer.render(scene, camera);
        rendered = true;
        uniforms.uHeroReflectionStrength.value = 1;
      } finally {
        scene.background = background;
        renderer.shadowMap.enabled = shadows;
        renderer.xr.enabled = xr;
        renderer.setClearColor(clearColor, clearAlpha);
        renderer.setRenderTarget(previousTarget, previousFace, previousMip);
      }
    },
    dispose() {
      target.dispose();
      uniforms.uHeroReflectionStrength.value = 0;
    },
  };
}
