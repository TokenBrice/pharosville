import * as THREE from "three";
import type { QualityTier } from "../engine/quality";
import { FFT_PATCH_SIZES } from "./fft/spectrum";

/**
 * Camera-centered Projected Grid for the WebGL2 ocean surface (Phase 2 Workstream A, §5.3).
 *
 * Replaces the static adaptive `oceanGeometry` on High (`320 × 300`, ~96.6k verts, ~1 vert / 4×4 px at 1080p)
 * and Medium (`216 × 200`, ~43.6k verts, ~1 vert / 6×6 px at 1080p), while Low stays on static geometry (0 VRAM).
 *
 * Projects the camera's expanded NDC frustum (`±1.08`, covering horizontal/vertical wave displacement at screen
 * borders without edge gaps) onto the `Y = 0` plane clamped smoothly to `horizonDist * 1.05` around
 * `camera.position.xz` so upper rays pointing at or above the horizon never produce singularities.
 *
 * Vertices store screen-space coordinates `position.xy ∈ [0, 1]^2` (`u` left→right, `v` near→far).
 * Winding `(a, b, c), (b, d, c)` yields `+Y` upward-facing front normals for any camera yaw.
 * Projective depth interpolation (`hbProjectedGridXZ`) weights near/far edges harmonically in `1 / depth`
 * (`wNear = dNear`, `wFar = dFar`) for uniform screen-space vertex density from near foreground to horizon,
 * while snapping the grid anchor along the camera XZ basis to `L0 / 256 ≈ 1.988 m` texel increments to
 * eliminate vertex swimming during pans.
 */

export const PROJECTED_GRID_DIMS = {
  high: [320, 300] as const,
  medium: [216, 200] as const,
} as const;

/** World-XZ origin snap step aligned to C0 (509 m) 256² texel spacing (~1.988 m). */
export const PROJECTED_GRID_SNAP = FFT_PATCH_SIZES[0] / 256;

const NDC_PAD = 1.08;
const MIN_DEPTH_WEIGHT = 5.0;
const HORIZON_SCALE = 1.05;

export interface ProjectedGridUniforms {
  uProjGridOn: THREE.IUniform<number>;
  uGridBL: THREE.IUniform<THREE.Vector2>;
  uGridBR: THREE.IUniform<THREE.Vector2>;
  uGridTL: THREE.IUniform<THREE.Vector2>;
  uGridTR: THREE.IUniform<THREE.Vector2>;
  /** (wNear, wFar, horizonDist * 1.05, 0) */
  uGridWeights: THREE.IUniform<THREE.Vector4>;
}

/**
 * GLSL vertex-shader helper matching `evalProjectedGridXZ`: maps `uv ∈ [0, 1]^2` onto the camera's
 * perspective-uniform `Y = 0` ground quad with zero division-by-zero risk (`wNear >= 5, wFar >= 5`).
 */
export const PROJECTED_GRID_GLSL = /* glsl */ `
vec2 hbProjectedGridXZ(vec2 uv, vec2 bl, vec2 br, vec2 tl, vec2 tr, vec4 weights) {
  vec2 nearP = mix(bl, br, uv.x);
  vec2 farP = mix(tl, tr, uv.x);
  float wN = (1.0 - uv.y) * weights.y;
  float wF = uv.y * weights.x;
  return (wN * nearP + wF * farP) / max(wN + wF, 1e-5);
}
`;

/** CPU twin of `hbProjectedGridXZ` for testing perspective vertex spacing and frustum coverage. */
export function evalProjectedGridXZ(
  u: number,
  v: number,
  uniforms: ProjectedGridUniforms,
  out: [number, number] = [0, 0],
): [number, number] {
  const bl = uniforms.uGridBL.value;
  const br = uniforms.uGridBR.value;
  const tl = uniforms.uGridTL.value;
  const tr = uniforms.uGridTR.value;
  const wNear = uniforms.uGridWeights.value.x;
  const wFar = uniforms.uGridWeights.value.y;

  const nx = bl.x + (br.x - bl.x) * u;
  const nz = bl.y + (br.y - bl.y) * u;
  const fx = tl.x + (tr.x - tl.x) * u;
  const fz = tl.y + (tr.y - tl.y) * u;

  const wN = (1.0 - v) * wFar;
  const wF = v * wNear;
  const invDen = 1.0 / Math.max(wN + wF, 1e-5);
  out[0] = (wN * nx + wF * fx) * invDen;
  out[1] = (wN * nz + wF * fz) * invDen;
  return out;
}

// Pre-allocated scratch math objects (zero per-frame heap allocations)
const _invVP = new THREE.Matrix4();
const _vp = new THREE.Matrix4();
const _nearPt = new THREE.Vector3();
const _farPt = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camPos = new THREE.Vector3();

const CORNER_NDC: readonly (readonly [number, number])[] = [
  [-NDC_PAD, -NDC_PAD], // 0: BL (near-left)
  [NDC_PAD, -NDC_PAD],  // 1: BR (near-right)
  [-NDC_PAD, NDC_PAD],  // 2: TL (far-left)
  [NDC_PAD, NDC_PAD],   // 3: TR (far-right)
];

/**
 * Intersects the 4 expanded frustum corner rays with `Y = 0`, clamped cleanly to `horizonDist * 1.05`
 * around `camera.position.xz`, and writes `(worldX, 0, worldZ, camDepth)` into `outCorners[0..3]`
 * (`[BL, BR, TL, TR]`).
 *
 * When `snapStep > 0`, shifts all 4 corners uniformly by `<= snapStep / 2` along the camera's
 * horizontal `(rightXZ, fwdXZ)` basis so the near anchor locks onto exact `snapStep` multiples
 * without uncovering viewport borders.
 *
 * Returns `false` if the camera cannot see the `Y = 0` plane (e.g. looking upward above the horizon),
 * still populating `outCorners` with finite fallback coordinates around `target`.
 */
export function computeProjectedGrid(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
  horizonDist: number,
  outCorners: THREE.Vector4[],
  snapStep = PROJECTED_GRID_SNAP,
): boolean {
  while (outCorners.length < 4) outCorners.push(new THREE.Vector4());

  camera.updateMatrixWorld();
  _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const det = _vp.determinant();
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    fillFallbackCorners(target, horizonDist, outCorners);
    return false;
  }
  _invVP.copy(_vp).invert();

  _camPos.setFromMatrixPosition(camera.matrixWorld);
  const camX = _camPos.x;
  const camY = _camPos.y;
  const camZ = _camPos.z;
  const maxR = Math.max(horizonDist * HORIZON_SCALE, 500);

  camera.getWorldDirection(_camForward);
  let fwdX = _camForward.x;
  let fwdZ = _camForward.z;
  let fwdLen = Math.hypot(fwdX, fwdZ);
  if (fwdLen < 1e-4) {
    fwdX = target.x - camX;
    fwdZ = target.z - camZ;
    fwdLen = Math.hypot(fwdX, fwdZ);
  }
  if (fwdLen < 1e-4) {
    fwdX = 0;
    fwdZ = -1;
    fwdLen = 1;
  }
  fwdX /= fwdLen;
  fwdZ /= fwdLen;
  // Right-handed horizontal right = fwd × up = (-fwdZ, 0, fwdX)
  const rightX = -fwdZ;
  const rightZ = fwdX;

  if (camY <= 0.05) {
    fillFallbackCorners(target, horizonDist, outCorners);
    return false;
  }

  let anyHitWater = false;
  for (let i = 0; i < 4; i++) {
    const [nx, ny] = CORNER_NDC[i];
    _nearPt.set(nx, ny, -1).applyMatrix4(_invVP);
    _farPt.set(nx, ny, 1).applyMatrix4(_invVP);
    _rayDir.subVectors(_farPt, _nearPt);
    const dirLen = _rayDir.length();
    if (dirLen < 1e-8) {
      fillFallbackCorners(target, horizonDist, outCorners);
      return false;
    }
    _rayDir.multiplyScalar(1 / dirLen);

    let hx = _rayDir.x;
    let hz = _rayDir.z;
    let hLen = Math.hypot(hx, hz);
    if (hLen < 1e-6) {
      // Degenerate vertical ray: project slightly along camera forward/side
      hx = fwdX * (i >= 2 ? 1 : -1) + rightX * (i % 2 === 1 ? 1 : -1);
      hz = fwdZ * (i >= 2 ? 1 : -1) + rightZ * (i % 2 === 1 ? 1 : -1);
      hLen = Math.hypot(hx, hz) || 1;
    }

    let wx: number;
    let wz: number;
    const hUnitX = hx / hLen;
    const hUnitZ = hz / hLen;
    const fwdComp = Math.max(hUnitX * fwdX + hUnitZ * fwdZ, 0.35);
    const maxHorizForRay = Math.min(maxR / fwdComp, maxR * 1.6);

    if (_rayDir.y < -1e-4) {
      anyHitWater = true;
      const t = -camY / _rayDir.y;
      const dHoriz = t * hLen;
      const dFwd = t * (_rayDir.x * fwdX + _rayDir.z * fwdZ);
      if (dFwd <= maxR && dHoriz <= maxHorizForRay) {
        wx = camX + _rayDir.x * t;
        wz = camZ + _rayDir.z * t;
      } else {
        wx = camX + hUnitX * maxHorizForRay;
        wz = camZ + hUnitZ * maxHorizForRay;
      }
    } else {
      // Top ray aims at or above horizon: clamp cleanly to horizon line on Y = 0
      wx = camX + hUnitX * maxHorizForRay;
      wz = camZ + hUnitZ * maxHorizForRay;
    }

    const dx = wx - camX;
    const dz = wz - camZ;
    // Exact 3D camera-view depth (clip-space w) so projective interpolation is strictly linear in screen NDC Y
    const viewDepth = dx * _camForward.x - camY * _camForward.y + dz * _camForward.z;
    const camDepth = Math.max(MIN_DEPTH_WEIGHT, viewDepth);
    outCorners[i].set(wx, 0, wz, camDepth);
  }

  if (!anyHitWater) {
    fillFallbackCorners(target, horizonDist, outCorners);
    return false;
  }

  if (snapStep > 0) {
    const nearMidX = 0.5 * (outCorners[0].x + outCorners[1].x);
    const nearMidZ = 0.5 * (outCorners[0].z + outCorners[1].z);
    const projR = nearMidX * rightX + nearMidZ * rightZ;
    const projF = nearMidX * fwdX + nearMidZ * fwdZ;
    const dR = Math.round(projR / snapStep) * snapStep - projR;
    const dF = Math.round(projF / snapStep) * snapStep - projF;
    const shiftX = dR * rightX + dF * fwdX;
    const shiftZ = dR * rightZ + dF * fwdZ;
    for (let i = 0; i < 4; i++) {
      outCorners[i].x += shiftX;
      outCorners[i].z += shiftZ;
      const dx = outCorners[i].x - camX;
      const dz = outCorners[i].z - camZ;
      const viewDepth = dx * _camForward.x - camY * _camForward.y + dz * _camForward.z;
      outCorners[i].w = Math.max(MIN_DEPTH_WEIGHT, viewDepth);
    }
  }

  return true;
}

function fillFallbackCorners(target: THREE.Vector3, horizonDist: number, outCorners: THREE.Vector4[]): void {
  const r = Math.max(horizonDist * HORIZON_SCALE, 500);
  const cx = target.x;
  const cz = target.z;
  outCorners[0].set(cx - r, 0, cz + r, MIN_DEPTH_WEIGHT);
  outCorners[1].set(cx + r, 0, cz + r, MIN_DEPTH_WEIGHT);
  outCorners[2].set(cx - r, 0, cz - r, Math.max(MIN_DEPTH_WEIGHT + 1, r));
  outCorners[3].set(cx + r, 0, cz - r, Math.max(MIN_DEPTH_WEIGHT + 1, r));
}

function createScreenGridGeometry(segsU: number, segsV: number): THREE.BufferGeometry {
  const cols = segsU + 1;
  const rows = segsV + 1;
  const vertCount = cols * rows;
  const pos = new Float32Array(vertCount * 3);
  let p = 0;
  for (let j = 0; j <= segsV; j++) {
    const v = j / segsV;
    for (let i = 0; i <= segsU; i++) {
      pos[p++] = i / segsU;
      pos[p++] = v;
      pos[p++] = 0;
    }
  }

  const indexCount = segsU * segsV * 6;
  const indices = vertCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let k = 0;
  for (let j = 0; j < segsV; j++) {
    for (let i = 0; i < segsU; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // (+rightXZ) × (+fwdXZ) = +Y upward front-facing normal
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = c;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(
    indices instanceof Uint32Array
      ? new THREE.Uint32BufferAttribute(indices, 1)
      : new THREE.Uint16BufferAttribute(indices, 1),
  );
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5);
  return geo;
}

export class ProjectedGrid {
  readonly uniforms: ProjectedGridUniforms;

  private currentTier: QualityTier = "low";
  private highGeo: THREE.BufferGeometry | null = null;
  private mediumGeo: THREE.BufferGeometry | null = null;
  private disposed = false;

  private readonly corners: THREE.Vector4[] = [
    new THREE.Vector4(),
    new THREE.Vector4(),
    new THREE.Vector4(),
    new THREE.Vector4(),
  ];

  constructor() {
    this.uniforms = {
      uProjGridOn: { value: 0 },
      uGridBL: { value: new THREE.Vector2(-1000, 1000) },
      uGridBR: { value: new THREE.Vector2(1000, 1000) },
      uGridTL: { value: new THREE.Vector2(-1000, -1000) },
      uGridTR: { value: new THREE.Vector2(1000, -1000) },
      uGridWeights: { value: new THREE.Vector4(50, 2500, 2625, 0) },
    };
  }

  get tier(): QualityTier {
    return this.currentTier;
  }

  setTier(tier: QualityTier): void {
    if (this.disposed) return;
    this.currentTier = tier;
    if (tier === "high") {
      if (!this.highGeo) {
        this.highGeo = createScreenGridGeometry(PROJECTED_GRID_DIMS.high[0], PROJECTED_GRID_DIMS.high[1]);
      }
      if (this.mediumGeo) {
        this.mediumGeo.dispose();
        this.mediumGeo = null;
      }
      this.uniforms.uProjGridOn.value = 1;
    } else if (tier === "medium") {
      if (!this.mediumGeo) {
        this.mediumGeo = createScreenGridGeometry(PROJECTED_GRID_DIMS.medium[0], PROJECTED_GRID_DIMS.medium[1]);
      }
      if (this.highGeo) {
        this.highGeo.dispose();
        this.highGeo = null;
      }
      this.uniforms.uProjGridOn.value = 1;
    } else {
      this.uniforms.uProjGridOn.value = 0;
      if (this.highGeo) {
        this.highGeo.dispose();
        this.highGeo = null;
      }
      if (this.mediumGeo) {
        this.mediumGeo.dispose();
        this.mediumGeo = null;
      }
    }
  }

  /** Returns the screen-space grid geometry for `tier` (null on Low, which keeps static geometry). */
  geometryFor(tier: QualityTier): THREE.BufferGeometry | null {
    if (this.disposed || tier === "low") return null;
    if (tier === "high") {
      if (!this.highGeo) {
        this.highGeo = createScreenGridGeometry(PROJECTED_GRID_DIMS.high[0], PROJECTED_GRID_DIMS.high[1]);
      }
      return this.highGeo;
    }
    if (!this.mediumGeo) {
      this.mediumGeo = createScreenGridGeometry(PROJECTED_GRID_DIMS.medium[0], PROJECTED_GRID_DIMS.medium[1]);
    }
    return this.mediumGeo;
  }

  update(camera: THREE.PerspectiveCamera, target: THREE.Vector3, horizonDist: number): boolean {
    if (this.disposed || this.currentTier === "low") {
      this.uniforms.uProjGridOn.value = 0;
      return false;
    }

    const ok = computeProjectedGrid(camera, target, horizonDist, this.corners, PROJECTED_GRID_SNAP);
    const [bl, br, tl, tr] = this.corners;
    this.uniforms.uGridBL.value.set(bl.x, bl.z);
    this.uniforms.uGridBR.value.set(br.x, br.z);
    this.uniforms.uGridTL.value.set(tl.x, tl.z);
    this.uniforms.uGridTR.value.set(tr.x, tr.z);

    const wNear = Math.max(MIN_DEPTH_WEIGHT, 0.5 * (bl.w + br.w));
    const wFar = Math.max(wNear + 1.0, 0.5 * (tl.w + tr.w));
    this.uniforms.uGridWeights.value.set(wNear, wFar, Math.max(horizonDist * HORIZON_SCALE, 500), 0);
    // Keep uProjGridOn = 1 whenever screen-grid geometry is active (even on !ok, fillFallbackCorners covers ground).
    this.uniforms.uProjGridOn.value = 1;
    return ok;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.uniforms.uProjGridOn.value = 0;
    if (this.highGeo) {
      this.highGeo.dispose();
      this.highGeo = null;
    }
    if (this.mediumGeo) {
      this.mediumGeo.dispose();
      this.mediumGeo = null;
    }
  }
}
