import * as THREE from "three";

/**
 * 'ground' service: a top-down height field of the static island (terrain, quays, piers, roofs), rendered
 * once from above. Used for light-pool heights, water-pillar land masking, prop/label placement.
 * Below-sea texels read as the sea floor (< 0).
 */
export interface GroundService {
  /** Highest static surface at (x, z), metres; -Infinity-safe (returns the sea floor value off-island). */
  heightAt(x: number, z: number): number;
  /** R = height (metres), linear-filtered float texture. */
  texture: THREE.Texture;
  /** [minX, minZ, maxX, maxZ] covered by the texture. */
  bounds: [number, number, number, number];
  /** Raw heights, row 0 = world z max (same layout as the texture). */
  heights: Float32Array;
  size: number;
  /** Owned by IslandSystem; release only after GPU consumers (including pillar masking) are gone. */
  dispose(): void;
}

/** Max-pooled, half-float, linearly filterable copy of the height field (for height-field AO). */
export function aoHeightTexture(g: GroundService, out = 512): THREE.DataTexture {
  const k = Math.max(1, Math.round(g.size / out));
  const n = Math.floor(g.size / k);
  const data = new Uint16Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let m = -1e9;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) m = Math.max(m, g.heights[(y * k + j) * g.size + x * k + i]);
    data[y * n + x] = THREE.DataUtils.toHalfFloat(m);
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

const FLOOR = -8;

export function renderGround(renderer: THREE.WebGLRenderer, root: THREE.Object3D, bounds: [number, number, number, number], size = 1024): GroundService {
  const [minX, minZ, maxX, maxZ] = bounds;
  const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
  const cam = new THREE.OrthographicCamera(minX, maxX, -minZ, -maxZ, 0.1, 2000);
  // looking straight down: screen x = world x, screen up = world -z
  cam.position.set(0, 1000, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying float vY;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vec4 w = modelMatrix * p;
        vY = w.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `varying float vY; void main() { gl_FragColor = vec4(vY, 0.0, 0.0, 1.0); }`,
    side: THREE.DoubleSide,
  });
  const scene = new THREE.Scene();
  const parent = root.parent;
  scene.add(root);
  scene.overrideMaterial = mat;
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(new THREE.Color(FLOOR, 0, 0), 1);
  renderer.clear();
  renderer.render(scene, cam);
  const data = new Float32Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, data);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  scene.remove(root);
  if (parent) parent.add(root);
  mat.dispose();

  // CPU copy (R only); texture row 0 = bottom of the ortho view = world z max
  const h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) h[i] = data[i * 4];
  const heightAt = (x: number, z: number): number => {
    const fx = ((x - minX) / (maxX - minX)) * size - 0.5;
    const fy = ((maxZ - z) / (maxZ - minZ)) * size - 0.5;
    const x0 = Math.max(0, Math.min(size - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(size - 1, Math.floor(fy)));
    const x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
    const tx = THREE.MathUtils.clamp(fx - x0, 0, 1), ty = THREE.MathUtils.clamp(fy - y0, 0, 1);
    const a = h[y0 * size + x0], b = h[y0 * size + x1], c = h[y1 * size + x0], d = h[y1 * size + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };
  return { heightAt, texture: rt.texture, bounds, heights: h, size, dispose: () => rt.dispose() };
}
