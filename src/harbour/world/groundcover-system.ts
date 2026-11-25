import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { QualityTier } from "../engine/quality";
import { assetUrl } from "../engine/assets";
import { consumeBinary, GROUNDCOVER_URL } from "../engine/prefetch";
import { transport } from "../engine/transport";
import { isAbort } from "../engine/failure";
import { drySeasonAt } from "./ground-year";
import { getHarbourMaterials } from "./materials";
import {
  ARCHETYPE_COUNT,
  buildGroundCoverKit,
  GROUNDCOVER_ARCHETYPES,
  type GroundCoverArchetype,
} from "./groundcover-kit";
import {
  createGroundCoverMaterial,
  GROUNDCOVER_FADE,
  GROUNDCOVER_STIFFNESS,
} from "./groundcover-shader";

/**
 * Phase 4A — Frame-1 Instanced Ground-Cover & Biome Ecosystem runtime loader and system.
 *
 * Binary format `HBGC` v1 (little-endian, glTF Y-up coordinates):
 * - Header (32 B):
 *     magic "HBGC" (4 B) | version u16 (1) | archetypeCount u16 (7)
 *     minX, minY, minZ, scaleX, scaleY, scaleZ (6 × f32 = 24 B)
 * - Archetype table (7 × 4 × u16 = 56 B):
 *     cumulative anchor counts [cumRescue, cumLow, cumMedium, cumHigh] per archetype
 * - Per-archetype Morton-sorted planar SoA streams (12 B/anchor):
 *     dx_lo, dx_hi, dz_lo, dz_hi, dy_lo, dy_hi (delta-coded u16)
 *     rgb565_lo, rgb565_hi                     (delta-coded u16 linear terrain RGB565)
 *     nx, nz                                   (delta-coded i8 mod 256, glTF Y-up normal)
 *     props_lo, props_hi                       (u16: yaw 6b | scale 4b | variant 4b | clusterCount 2b)
 */

export { GROUNDCOVER_URL };
export const HBGC_MAGIC = "HBGC";
export const HBGC_VERSION = 1;
export const HBGC_HEADER_BYTES = 32;
export const HBGC_MIN_SCALE = 0.65;
export const HBGC_MAX_SCALE = 1.45;
export const HBGC_FAR_CULL_DISTANCE = 860;

/** Progressive importance stratum index: 0=rescue, 1=low, 2=medium, 3=high. */
export type StratumBand = 0 | 1 | 2 | 3;

export interface GroundCoverBounds {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
}

export interface GroundCoverAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Linear terrain RGB sampled beneath the anchor (0..1 each). */
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** Terrain surface normal in glTF Y-up space (`ny >= 0`). */
  readonly nx: number;
  readonly nz: number;
  /** Yaw in radians [0, 2*PI). */
  readonly yaw: number;
  /** Uniform scale multiplier in [0.65, 1.45]. */
  readonly scale: number;
  /** Variant index 0..15. */
  readonly variant: number;
  /** Micro-cluster sub-instance count: 1, 2, or 3. */
  readonly clusterCount: 1 | 2 | 3;
  /** Importance stratum band 0=rescue, 1=low, 2=medium, 3=high. */
  readonly stratum: StratumBand;
}

export interface DecodedArchetypeInstances {
  readonly archetype: GroundCoverArchetype;
  readonly archetypeIndex: number;
  readonly anchorCount: number;
  readonly instanceCount: number;
  /** Exact cumulative expanded instance counts for `[rescue, low, medium, high]`. */
  readonly stratumPrefix: readonly [number, number, number, number];
  /** Packed `vec4(x, y, z, yaw)` float32 (16 B/inst). */
  readonly aInstPos: Float32Array;
  /** Packed `vec4(r, g, b, scaleNorm)` u8norm (4 B/inst). */
  readonly aInstGround: Uint8Array;
  /** Packed `vec4(normX, normZ, variantNorm, archAndPhase)` u8norm (4 B/inst). */
  readonly aInstMeta: Uint8Array;
}

export interface DecodedGroundCover {
  readonly version: number;
  readonly bounds: GroundCoverBounds;
  readonly totalAnchors: number;
  readonly totalInstances: number;
  readonly archetypes: readonly DecodedArchetypeInstances[];
}

/** Tangent-plane micro-cluster expansion radius (metres) per archetype index 0..6. */
const CLUSTER_RADIUS: readonly number[] = [0.55, 0.72, 0.82, 0.48, 0.75, 0.65, 0.45];

/** Deterministic integer hash (0..0xffffffff) for reproducible tangent-plane cluster expansion. */
function hashU32(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function zigzagDecode16(zz: number): number {
  return (zz >>> 1) ^ -(zz & 1);
}

function zigzagDecode8(zz: number): number {
  return (zz >>> 1) ^ -(zz & 1);
}

function packScaleNorm(scale: number): number {
  return Math.max(0, Math.min(255, Math.round(((scale - 0.4) / 1.2) * 255)));
}

/**
 * Decode an `HBGC` v1 binary buffer and expand multi-instance clusters (`clusterCount ∈ {2, 3}`)
 * deterministically inside each anchor's local tangent plane `(T, B)` into 24 B/inst typed arrays.
 */
export function decodeGroundCover(buf: ArrayBuffer): DecodedGroundCover {
  if (buf.byteLength < HBGC_HEADER_BYTES) {
    throw new Error(`HBGC buffer too short (${buf.byteLength} B)`);
  }
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== HBGC_MAGIC) {
    throw new Error(`Invalid HBGC magic: "${magic}"`);
  }
  const version = view.getUint16(4, true);
  if (version !== HBGC_VERSION) {
    throw new Error(`Unsupported HBGC version: ${version}`);
  }
  const archetypeCount = view.getUint16(6, true);
  if (archetypeCount !== ARCHETYPE_COUNT) {
    throw new Error(`Unexpected HBGC archetypeCount: ${archetypeCount} (expected ${ARCHETYPE_COUNT})`);
  }

  const bounds: GroundCoverBounds = {
    minX: view.getFloat32(8, true),
    minY: view.getFloat32(12, true),
    minZ: view.getFloat32(16, true),
    scaleX: view.getFloat32(20, true),
    scaleY: view.getFloat32(24, true),
    scaleZ: view.getFloat32(28, true),
  };

  const tableBytes = archetypeCount * 4 * 2;
  if (buf.byteLength < HBGC_HEADER_BYTES + tableBytes) {
    throw new Error("HBGC buffer truncated in archetype table");
  }

  const cumCounts: Array<[number, number, number, number]> = [];
  let off = HBGC_HEADER_BYTES;
  let totalAnchors = 0;
  for (let ai = 0; ai < archetypeCount; ai++) {
    const c0 = view.getUint16(off, true);
    const c1 = view.getUint16(off + 2, true);
    const c2 = view.getUint16(off + 4, true);
    const c3 = view.getUint16(off + 6, true);
    off += 8;
    if (!(c0 <= c1 && c1 <= c2 && c2 <= c3)) {
      throw new Error(`Non-monotonic HBGC strata for archetype ${ai}: [${c0}, ${c1}, ${c2}, ${c3}]`);
    }
    cumCounts.push([c0, c1, c2, c3]);
    totalAnchors += c3;
  }

  const expectedBytes = HBGC_HEADER_BYTES + tableBytes + totalAnchors * 12;
  if (buf.byteLength < expectedBytes) {
    throw new Error(`HBGC buffer truncated: got ${buf.byteLength} B, need ${expectedBytes} B`);
  }

  const inv65535 = 1 / 65535;
  const archetypes: DecodedArchetypeInstances[] = [];
  let totalInstances = 0;

  for (let ai = 0; ai < archetypeCount; ai++) {
    const [c0, c1, c2, c3] = cumCounts[ai];
    const n = c3;
    if (n === 0) {
      archetypes.push({
        archetype: GROUNDCOVER_ARCHETYPES[ai],
        archetypeIndex: ai,
        anchorCount: 0,
        instanceCount: 0,
        stratumPrefix: [0, 0, 0, 0],
        aInstPos: new Float32Array(0),
        aInstGround: new Uint8Array(0),
        aInstMeta: new Uint8Array(0),
      });
      continue;
    }

    const dxLo = bytes.subarray(off, off + n); off += n;
    const dxHi = bytes.subarray(off, off + n); off += n;
    const dzLo = bytes.subarray(off, off + n); off += n;
    const dzHi = bytes.subarray(off, off + n); off += n;
    const dyLo = bytes.subarray(off, off + n); off += n;
    const dyHi = bytes.subarray(off, off + n); off += n;
    const rgbLo = bytes.subarray(off, off + n); off += n;
    const rgbHi = bytes.subarray(off, off + n); off += n;
    const nxS = bytes.subarray(off, off + n); off += n;
    const nzS = bytes.subarray(off, off + n); off += n;
    const prLo = bytes.subarray(off, off + n); off += n;
    const prHi = bytes.subarray(off, off + n); off += n;

    // Pass 1: exact expanded instance count per stratum so buffers allocate once with zero resizing
    let instTotal = 0;
    let p0 = 0, p1 = 0, p2 = 0;
    for (let i = 0; i < n; i++) {
      if (i === c0) p0 = instTotal;
      if (i === c1) p1 = instTotal;
      if (i === c2) p2 = instTotal;
      const clCode = (prHi[i] >>> 6) & 0x03;
      const cl = clCode < 1 ? 1 : clCode > 3 ? 3 : clCode;
      instTotal += cl;
    }
    if (c0 === n) p0 = instTotal;
    if (c1 === n) p1 = instTotal;
    if (c2 === n) p2 = instTotal;
    const stratumPrefix: [number, number, number, number] = [p0, p1, p2, instTotal];

    const aInstPos = new Float32Array(instTotal * 4);
    const aInstGround = new Uint8Array(instTotal * 4);
    const aInstMeta = new Uint8Array(instTotal * 4);

    // Pass 2: decode deltas and expand clusters in each anchor's local tangent plane (T, B)
    let qx = 0, qz = 0, qy = 0, rgb565 = 0, nxAcc = 0, nzAcc = 0;
    let outIdx = 0;
    const clusterRad = CLUSTER_RADIUS[ai] ?? 0.55;
    const archBits = (ai & 0x07) << 5;

    for (let i = 0; i < n; i++) {
      qx = (qx + zigzagDecode16(dxLo[i] | (dxHi[i] << 8))) & 0xffff;
      qz = (qz + zigzagDecode16(dzLo[i] | (dzHi[i] << 8))) & 0xffff;
      qy = (qy + zigzagDecode16(dyLo[i] | (dyHi[i] << 8))) & 0xffff;
      rgb565 = (rgb565 + zigzagDecode16(rgbLo[i] | (rgbHi[i] << 8))) & 0xffff;
      nxAcc = (nxAcc + zigzagDecode8(nxS[i])) & 0xff;
      nzAcc = (nzAcc + zigzagDecode8(nzS[i])) & 0xff;

      const props = prLo[i] | (prHi[i] << 8);
      const yaw0 = ((props & 0x3f) / 64) * Math.PI * 2;
      const scale0 = HBGC_MIN_SCALE + (((props >>> 6) & 0x0f) / 15) * (HBGC_MAX_SCALE - HBGC_MIN_SCALE);
      const var0 = (props >>> 10) & 0x0f;
      const clCode = (props >>> 14) & 0x03;
      const cl = clCode < 1 ? 1 : clCode > 3 ? 3 : clCode;

      const ax = bounds.minX + qx * inv65535 * bounds.scaleX;
      const ay = bounds.minY + qy * inv65535 * bounds.scaleY;
      const az = bounds.minZ + qz * inv65535 * bounds.scaleZ;

      const nxSigned = nxAcc >= 128 ? nxAcc - 256 : nxAcc;
      const nzSigned = nzAcc >= 128 ? nzAcc - 256 : nzAcc;
      let nx = Math.max(-1, Math.min(1, nxSigned / 127));
      let nz = Math.max(-1, Math.min(1, nzSigned / 127));
      const xz2 = nx * nx + nz * nz;
      if (xz2 > 0.995) {
        const inv = Math.sqrt(0.995 / xz2);
        nx *= inv;
        nz *= inv;
      }
      const ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));

      const r8 = Math.round((((rgb565 >>> 11) & 31) * 255) / 31);
      const g8 = Math.round((((rgb565 >>> 5) & 63) * 255) / 63);
      const b8 = Math.round(((rgb565 & 31) * 255) / 31);
      const nxU8 = Math.max(0, Math.min(255, Math.round((nx * 0.5 + 0.5) * 255)));
      const nzU8 = Math.max(0, Math.min(255, Math.round((nz * 0.5 + 0.5) * 255)));

      // Orthonormal tangent basis (T, B) perpendicular to N = (nx, ny, nz)
      // For near-flat terrain N ≈ (0, 1, 0), T ≈ (1, 0, 0), B ≈ (0, 0, -1).
      let tx: number, ty: number, tz: number;
      const tLen = Math.hypot(ny, nx);
      if (tLen > 1e-4) {
        tx = ny / tLen;
        ty = -nx / tLen;
        tz = 0;
      } else {
        tx = 1;
        ty = 0;
        tz = 0;
      }
      // B = N × T (guaranteed unit length & perpendicular to both N and T)
      const bx = ny * tz - nz * ty;
      const by = nz * tx - nx * tz;
      const bz = nx * ty - ny * tx;

      for (let k = 0; k < cl; k++) {
        const h = hashU32(ai * 100003 + i, k + 1, qx ^ (qz << 16));
        let px = ax, py = ay, pz = az;
        let yaw = yaw0;
        let sc = scale0;
        let variant = var0;

        if (k > 0) {
          const u0 = (h & 0xffff) / 65536;
          const u1 = ((h >>> 16) & 0xff) / 256;
          const u2 = ((h >>> 24) & 0xff) / 256;
          const theta = yaw0 + (k * Math.PI * 2) / cl + (u0 - 0.5) * 0.9;
          const rad = clusterRad * scale0 * (0.62 + 0.38 * u1);
          const ox = Math.cos(theta) * rad;
          const oz = Math.sin(theta) * rad;
          px = ax + tx * ox + bx * oz;
          py = ay + ty * ox + by * oz;
          pz = az + tz * ox + bz * oz;
          sc = Math.max(0.55, Math.min(1.45, scale0 * (0.72 + 0.24 * u2)));
          yaw = (yaw0 + 2.3999632 * k + (u0 - 0.5) * 1.1) % (Math.PI * 2);
          if (yaw < 0) yaw += Math.PI * 2;
          variant = (var0 + k * 5) & 0x0f;
        }

        const p4 = outIdx * 4;
        aInstPos[p4] = px;
        aInstPos[p4 + 1] = py;
        aInstPos[p4 + 2] = pz;
        aInstPos[p4 + 3] = yaw;

        aInstGround[p4] = r8;
        aInstGround[p4 + 1] = g8;
        aInstGround[p4 + 2] = b8;
        aInstGround[p4 + 3] = packScaleNorm(sc);

        aInstMeta[p4] = nxU8;
        aInstMeta[p4 + 1] = nzU8;
        aInstMeta[p4 + 2] = Math.round((variant / 15) * 255);
        aInstMeta[p4 + 3] = archBits | ((h >>> 3) & 0x1f);

        outIdx++;
      }
    }

    archetypes.push({
      archetype: GROUNDCOVER_ARCHETYPES[ai],
      archetypeIndex: ai,
      anchorCount: n,
      instanceCount: instTotal,
      stratumPrefix,
      aInstPos,
      aInstGround,
      aInstMeta,
    });
    totalInstances += instTotal;
  }

  return { version, bounds, totalAnchors, totalInstances, archetypes };
}

/** Map `QualityGovernor` `(tier, dpr)` rung to the O(1) progressive stratum band. */
export function stratumBandFor(tier: QualityTier, dpr: number): StratumBand {
  if (tier === "high") return 3;
  if (tier === "medium") return 2;
  return dpr >= 1 ? 1 : 0;
}

/** Seasonal wildflower scale `uFlowerScale` (0..1): peaks spring / early summer, recedes in winter & peak drought. */
export function flowerScaleForSeason(
  weights: readonly [number, number, number, number],
  phase: number,
): number {
  const [spring, summer, autumn, winter] = weights;
  const dry = drySeasonAt(phase);
  const raw = spring * 1.0 + summer * (1 - 0.72 * dry) * 0.80 + autumn * 0.28 + winter * 0.04;
  return THREE.MathUtils.clamp(THREE.MathUtils.smoothstep(raw, 0.08, 0.88), 0, 1);
}

interface ArchetypeSlot {
  readonly archetype: GroundCoverArchetype;
  readonly mesh: THREE.Mesh;
  readonly geom: THREE.InstancedBufferGeometry;
  readonly mat: THREE.MeshStandardMaterial;
  readonly stratumPrefix: readonly [number, number, number, number];
}

export interface GroundCoverSystemOptions {
  /** URL of the binary `HBGC` asset (default `/harbour/groundcover.bin`). */
  url?: string;
  /** Optional preloaded `HBGC` buffer (for fixtures and unit tests). */
  buffer?: ArrayBuffer;
}

/**
 * Frame-1 Instanced Ground-Cover & Biome Ecosystem system.
 *
 * Designed to initialize in parallel with `island.glb`, prepare its single unified shader program
 * via `preparation.prepareGroup(root)`, and scale instance density in O(1) via `geom.instanceCount`
 * across all `QualityGovernor` rungs.
 */
export class GroundCoverSystem implements WorldSystem {
  readonly name = "groundcover";
  readonly id = "groundcover";
  readonly root = new THREE.Group();

  private readonly url: string;
  private readonly initialBuffer: ArrayBuffer | undefined;
  private readonly uFlowerScale: THREE.IUniform<number> = { value: 1.0 };
  private readonly slots: ArchetypeSlot[] = [];
  private rockDepthMat: THREE.MeshDepthMaterial | null = null;
  private unsubQuality: (() => void) | null = null;
  private currentBand: StratumBand = 3;
  private lastFarCull = false;

  constructor(opts: GroundCoverSystemOptions = {}) {
    this.url = opts.url ?? GROUNDCOVER_URL;
    this.initialBuffer = opts.buffer;
    this.root.name = "harbour-groundcover";
  }

  /** Active O(1) stratum band (`0=rescue, 1=low, 2=medium, 3=high`). */
  get stratumBand(): StratumBand { return this.currentBand; }

  /** Live per-archetype meshes & instance counts (for diagnostics & tests). */
  get meshes(): ReadonlyArray<THREE.Mesh> { return this.slots.map((s) => s.mesh); }

  private async fetchBinary(ctx: EngineContext): Promise<ArrayBuffer | null> {
    if (this.initialBuffer) return this.initialBuffer;
    if (ctx.assets && typeof ctx.assets === "object" && "signal" in ctx.assets && ctx.assets.signal) {
      return consumeBinary(ctx.assets, this.url);
    }
    const resolved = assetUrl(this.url);
    return transport(ctx.signal, async (signal) => {
      const res = await fetch(resolved, { signal });
      if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) return null;
      return res.arrayBuffer();
    });
  }

  async init(ctx: EngineContext): Promise<void> {
    ctx.signal?.throwIfAborted();
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("groundcover") === "0") {
      return;
    }

    let raw: ArrayBuffer | null;
    try {
      raw = await this.fetchBinary(ctx);
    } catch (err) {
      if (ctx.signal?.aborted || isAbort(err)) throw err;
      console.warn(`[harbour] groundcover asset unavailable (${this.url}), skipping`, err);
      return;
    }
    ctx.signal?.throwIfAborted();
    if (!raw || raw.byteLength === 0) return;

    let decoded: DecodedGroundCover;
    try {
      decoded = decodeGroundCover(raw);
    } catch (err) {
      console.warn(`[harbour] groundcover asset invalid (${this.url}), skipping`, err);
      return;
    }
    if (decoded.totalInstances === 0) return;
    const mats = getHarbourMaterials(ctx);
    const kit = buildGroundCoverKit();

    const { minX, minY, minZ, scaleX, scaleY, scaleZ } = decoded.bounds;
    const pad = 3.0;
    const boundsBox = new THREE.Box3(
      new THREE.Vector3(minX - pad, minY - pad, minZ - pad),
      new THREE.Vector3(minX + scaleX + pad, minY + scaleY + pad, minZ + scaleZ + pad),
    );
    const boundsSphere = boundsBox.getBoundingSphere(new THREE.Sphere());

    let sharedRockDepth: THREE.MeshDepthMaterial | null = null;
    for (const archData of decoded.archetypes) {
      const base = kit[archData.archetype];
      const geom = new THREE.InstancedBufferGeometry();
      geom.name = `gc-${archData.archetype}-inst`;
      if (base.index) geom.setIndex(base.index);
      for (const attrName of ["position", "normal", "aBladeT", "aPart", "aColorHint"] as const) {
        const attr = base.getAttribute(attrName);
        if (attr) geom.setAttribute(attrName, attr);
      }
      geom.setAttribute("aInstPos", new THREE.InstancedBufferAttribute(archData.aInstPos, 4, false));
      geom.setAttribute("aInstGround", new THREE.InstancedBufferAttribute(archData.aInstGround, 4, true));
      geom.setAttribute("aInstMeta", new THREE.InstancedBufferAttribute(archData.aInstMeta, 4, true));
      geom.instanceCount = archData.instanceCount;
      geom.boundingBox = boundsBox.clone();
      geom.boundingSphere = boundsSphere.clone();
      base.dispose();

      const built = createGroundCoverMaterial(mats, {
        stiffness: GROUNDCOVER_STIFFNESS[archData.archetype],
        fade: GROUNDCOVER_FADE[archData.archetype],
        flowerScale: this.uFlowerScale,
      });
      if (archData.archetype === "rocks") {
        sharedRockDepth = built.rockDepthMat;
      } else {
        built.rockDepthMat.dispose();
      }

      const mesh = new THREE.Mesh(geom, built.colorMat);
      mesh.name = `gc-${archData.archetype}`;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.castShadow = archData.archetype === "rocks";
      if (archData.archetype === "rocks" && sharedRockDepth) {
        mesh.customDepthMaterial = sharedRockDepth;
      }

      this.root.add(mesh);
      this.slots.push({
        archetype: archData.archetype,
        mesh,
        geom,
        mat: built.colorMat,
        stratumPrefix: archData.stratumPrefix,
      });
    }
    this.rockDepthMat = sharedRockDepth;

    // Initialize flower scale and quality stratum before preparation so Frame 1 renders cleanly
    this.syncFlowerScale(ctx);
    const quality = ctx.services.get("quality");
    if (quality) {
      this.applyQuality(quality.tier, quality.dpr, ctx, false);
      this.unsubQuality = quality.onChange((s, dpr) => this.applyQuality(s.tier, dpr, ctx, true));
    } else {
      this.applyQuality("high", 1.5, ctx, false);
    }

    const preparation = ctx.services.get("preparation");
    if (preparation) {
      await preparation.prepareGroup(this.root);
      ctx.signal?.throwIfAborted();
    }

    ctx.scene.add(this.root);
    ctx.services.get("sun")?.casters.invalidate();
  }

  /** Apply O(1) stratum instance count & rock shadow casting toggle for the active quality rung. */
  applyQuality(tier: QualityTier, dpr: number, ctx?: EngineContext, invalidateShadows = true): void {
    const band = stratumBandFor(tier, dpr);
    this.currentBand = band;
    let rockShadowChanged = false;
    for (const slot of this.slots) {
      const nextCount = slot.stratumPrefix[band];
      const countChanged = slot.geom.instanceCount !== nextCount;
      slot.geom.instanceCount = nextCount;
      if (slot.archetype === "rocks") {
        const nextCast = tier !== "low" && nextCount > 0;
        if (slot.mesh.castShadow !== nextCast || countChanged) rockShadowChanged = true;
        slot.mesh.castShadow = nextCast;
      }
      const farHidden = this.lastFarCull && (slot.archetype === "grass" || slot.archetype === "flowers");
      slot.mesh.visible = !farHidden && nextCount > 0;
    }
    if (invalidateShadows && rockShadowChanged) {
      ctx?.services.get("sun")?.casters.invalidate();
    }
  }

  private syncFlowerScale(ctx: EngineContext): void {
    const season = ctx.services.get("season");
    const phase = ctx.uniforms.uSeasonPhase.value;
    const weights: readonly [number, number, number, number] = season
      ? season.weights
      : [
          ctx.uniforms.uFoliage.value.x,
          ctx.uniforms.uFoliage.value.y,
          ctx.uniforms.uFoliage.value.z,
          ctx.uniforms.uFoliage.value.w,
        ];
    this.uFlowerScale.value = flowerScaleForSeason(weights, phase);
  }

  update(_frame: FrameState, ctx: EngineContext): void {
    if (this.slots.length === 0) return;
    this.syncFlowerScale(ctx);
    const far = ctx.rig.distance > HBGC_FAR_CULL_DISTANCE;
    if (far !== this.lastFarCull) {
      this.lastFarCull = far;
      for (const slot of this.slots) {
        if (slot.archetype === "grass" || slot.archetype === "flowers") {
          slot.mesh.visible = !far && slot.geom.instanceCount > 0;
        }
      }
    }
  }

  dispose(ctx: EngineContext): void {
    this.unsubQuality?.();
    this.unsubQuality = null;
    if (this.root.parent) {
      ctx.scene.remove(this.root);
    }
    for (const slot of this.slots) {
      slot.geom.dispose();
      slot.mat.dispose();
    }
    this.slots.length = 0;
    this.rockDepthMat?.dispose();
    this.rockDepthMat = null;
    this.currentBand = 3;
    this.lastFarCull = false;
  }
}
