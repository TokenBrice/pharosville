import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetStore } from "../engine/assets";
import { GROUNDCOVER_URL as PREFETCH_GROUNDCOVER_URL, prefetchBinary } from "../engine/prefetch";
import { assembleShader } from "../engine/shader-recipes";
import { createWorldUniforms } from "../engine/uniforms";
import type { QualityService, QualitySettings, QualityTier } from "../engine/quality";
import { TIERS } from "../engine/quality";
import type { EngineContext, FrameState, PreparationService } from "../engine/types";
import type { SeasonService } from "../season/season-system";
import { LazyGroundCoverSystem, SYSTEMS } from "../systems";
import { HarbourMaterials } from "./materials";
import { swayUniforms } from "./sway";
import {
  ARCHETYPE_COUNT,
  buildArchetypeGeometry,
  buildGroundCoverKit,
  GROUNDCOVER_ARCHETYPES,
} from "./groundcover-kit";
import {
  createGroundCoverMaterial,
  GROUNDCOVER_FADE,
  GROUNDCOVER_STIFFNESS,
} from "./groundcover-shader";
import {
  decodeGroundCover,
  flowerScaleForSeason,
  GROUNDCOVER_URL,
  GroundCoverSystem,
  HBGC_HEADER_BYTES,
  HBGC_MAX_SCALE,
  HBGC_MIN_SCALE,
  HBGC_VERSION,
  stratumBandFor,
  type GroundCoverAnchor,
  type GroundCoverBounds,
  type StratumBand,
} from "./groundcover-system";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function morton2D(x: number, z: number): number {
  let a = x & 0xffff;
  let b = z & 0xffff;
  a = (a | (a << 8)) & 0x00ff00ff;
  a = (a | (a << 4)) & 0x0f0f0f0f;
  a = (a | (a << 2)) & 0x33333333;
  a = (a | (a << 1)) & 0x55555555;
  b = (b | (b << 8)) & 0x00ff00ff;
  b = (b | (b << 4)) & 0x0f0f0f0f;
  b = (b | (b << 2)) & 0x33333333;
  b = (b | (b << 1)) & 0x55555555;
  return (a | (b << 1)) >>> 0;
}

function zigzagEncode16(deltaMod65536: number): number {
  const s = ((deltaMod65536 + 32768) & 0xffff) - 32768;
  return ((s << 1) ^ (s >> 15)) & 0xffff;
}

function zigzagEncode8(deltaMod256: number): number {
  const s = ((deltaMod256 + 128) & 0xff) - 128;
  return ((s << 1) ^ (s >> 7)) & 0xff;
}

function packRgb565(r: number, g: number, b: number): number {
  const r5 = Math.max(0, Math.min(31, Math.round(r * 31)));
  const g6 = Math.max(0, Math.min(63, Math.round(g * 63)));
  const b5 = Math.max(0, Math.min(31, Math.round(b * 31)));
  return (r5 << 11) | (g6 << 5) | b5;
}

/** Test fixture encoder producing an exact `HBGC` v1 binary `ArrayBuffer` (Morton-sorted per stratum). */
function encodeGroundCover(
  anchorsByArchetype: ReadonlyArray<readonly GroundCoverAnchor[]>,
  explicitBounds?: GroundCoverBounds,
): ArrayBuffer {
  if (anchorsByArchetype.length !== ARCHETYPE_COUNT) {
    throw new Error(`HBGC encode expects ${ARCHETYPE_COUNT} archetype lists, got ${anchorsByArchetype.length}`);
  }
  let bounds: GroundCoverBounds;
  if (explicitBounds) {
    bounds = {
      minX: explicitBounds.minX,
      minY: explicitBounds.minY,
      minZ: explicitBounds.minZ,
      scaleX: Math.max(explicitBounds.scaleX, 1e-3),
      scaleY: Math.max(explicitBounds.scaleY, 1e-3),
      scaleZ: Math.max(explicitBounds.scaleZ, 1e-3),
    };
  } else {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const list of anchorsByArchetype) {
      for (const a of list) {
        if (a.x < minX) minX = a.x;
        if (a.y < minY) minY = a.y;
        if (a.z < minZ) minZ = a.z;
        if (a.x > maxX) maxX = a.x;
        if (a.y > maxY) maxY = a.y;
        if (a.z > maxZ) maxZ = a.z;
      }
    }
    bounds = !Number.isFinite(minX)
      ? { minX: 0, minY: 0, minZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
      : { minX, minY, minZ, scaleX: Math.max(maxX - minX, 1e-3), scaleY: Math.max(maxY - minY, 1e-3), scaleZ: Math.max(maxZ - minZ, 1e-3) };
  }

  const quantize16 = (v: number, min: number, scale: number): number =>
    Math.max(0, Math.min(65535, Math.round(((v - min) / scale) * 65535)));

  interface PreparedAnchor {
    qx: number; qy: number; qz: number; morton: number;
    rgb565: number; nx: number; nz: number; props: number;
  }

  const preparedPerArch: PreparedAnchor[][] = [];
  const cumTable = new Uint16Array(ARCHETYPE_COUNT * 4);
  let totalAnchors = 0;

  for (let ai = 0; ai < ARCHETYPE_COUNT; ai++) {
    const strata: PreparedAnchor[][] = [[], [], [], []];
    for (const a of anchorsByArchetype[ai]) {
      const qx = quantize16(a.x, bounds.minX, bounds.scaleX);
      const qy = quantize16(a.y, bounds.minY, bounds.scaleY);
      const qz = quantize16(a.z, bounds.minZ, bounds.scaleZ);
      const yawNorm = ((a.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const yawQ = Math.round((yawNorm / (Math.PI * 2)) * 64) & 0x3f;
      const scaleQ = Math.max(0, Math.min(15, Math.round(((a.scale - HBGC_MIN_SCALE) / (HBGC_MAX_SCALE - HBGC_MIN_SCALE)) * 15)));
      const variantQ = Math.max(0, Math.min(15, Math.round(a.variant)));
      const clusterQ = Math.max(1, Math.min(3, Math.round(a.clusterCount)));
      const props = (yawQ & 0x3f) | ((scaleQ & 0x0f) << 6) | ((variantQ & 0x0f) << 10) | ((clusterQ & 0x03) << 14);
      const nxS8 = Math.max(-127, Math.min(127, Math.round(a.nx * 127)));
      const nzS8 = Math.max(-127, Math.min(127, Math.round(a.nz * 127)));
      const band = Math.max(0, Math.min(3, a.stratum)) as StratumBand;
      strata[band].push({ qx, qy, qz, morton: morton2D(qx, qz), rgb565: packRgb565(a.r, a.g, a.b), nx: nxS8 & 0xff, nz: nzS8 & 0xff, props });
    }
    const ordered: PreparedAnchor[] = [];
    for (let s = 0; s < 4; s++) {
      strata[s].sort((u, v) => u.morton - v.morton);
      for (const item of strata[s]) ordered.push(item);
      if (ordered.length > 65535) throw new Error(`HBGC archetype ${ai} exceeds u16 anchor count`);
      cumTable[ai * 4 + s] = ordered.length;
    }
    preparedPerArch.push(ordered);
    totalAnchors += ordered.length;
  }

  const tableBytes = ARCHETYPE_COUNT * 4 * 2;
  const buf = new ArrayBuffer(HBGC_HEADER_BYTES + tableBytes + totalAnchors * 12);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  bytes[0] = 0x48; bytes[1] = 0x42; bytes[2] = 0x47; bytes[3] = 0x43;
  view.setUint16(4, HBGC_VERSION, true);
  view.setUint16(6, ARCHETYPE_COUNT, true);
  view.setFloat32(8, bounds.minX, true);
  view.setFloat32(12, bounds.minY, true);
  view.setFloat32(16, bounds.minZ, true);
  view.setFloat32(20, bounds.scaleX, true);
  view.setFloat32(24, bounds.scaleY, true);
  view.setFloat32(28, bounds.scaleZ, true);

  let off = HBGC_HEADER_BYTES;
  for (let i = 0; i < cumTable.length; i++) { view.setUint16(off, cumTable[i], true); off += 2; }
  for (let ai = 0; ai < ARCHETYPE_COUNT; ai++) {
    const list = preparedPerArch[ai];
    const n = list.length;
    if (n === 0) continue;
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

    let px = 0, pz = 0, py = 0, prgb = 0, pnx = 0, pnz = 0;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      const dx = zigzagEncode16((a.qx - px) & 0xffff); px = a.qx;
      const dz = zigzagEncode16((a.qz - pz) & 0xffff); pz = a.qz;
      const dy = zigzagEncode16((a.qy - py) & 0xffff); py = a.qy;
      const dr = zigzagEncode16((a.rgb565 - prgb) & 0xffff); prgb = a.rgb565;
      const dnx = zigzagEncode8((a.nx - pnx) & 0xff); pnx = a.nx;
      const dnz = zigzagEncode8((a.nz - pnz) & 0xff); pnz = a.nz;
      dxLo[i] = dx & 0xff; dxHi[i] = (dx >>> 8) & 0xff;
      dzLo[i] = dz & 0xff; dzHi[i] = (dz >>> 8) & 0xff;
      dyLo[i] = dy & 0xff; dyHi[i] = (dy >>> 8) & 0xff;
      rgbLo[i] = dr & 0xff; rgbHi[i] = (dr >>> 8) & 0xff;
      nxS[i] = dnx; nzS[i] = dnz;
      prLo[i] = a.props & 0xff; prHi[i] = (a.props >>> 8) & 0xff;
    }
  }
  return buf;
}

function makeAnchor(overrides: Partial<GroundCoverAnchor> = {}): GroundCoverAnchor {
  return {
    x: 12.5,
    y: 8.25,
    z: -34.75,
    r: 0.16,
    g: 0.24,
    b: 0.08,
    nx: 0.12,
    nz: -0.18,
    yaw: 1.25,
    scale: 1.05,
    variant: 7,
    clusterCount: 1,
    stratum: 2,
    ...overrides,
  };
}

function makeTestAnchors(): GroundCoverAnchor[][] {
  const lists: GroundCoverAnchor[][] = Array.from({ length: ARCHETYPE_COUNT }, () => []);
  // Grass (0): 0 rescue, 2 low, 2 medium, 2 high (mixed cluster counts 1, 2, 3)
  lists[0].push(
    makeAnchor({ x: -120, y: 4.2, z: 80, nx: 0.25, nz: -0.15, clusterCount: 3, stratum: 1, variant: 2 }),
    makeAnchor({ x: -115, y: 4.8, z: 76, nx: -0.20, nz: 0.30, clusterCount: 2, stratum: 1, variant: 5 }),
    makeAnchor({ x: 40, y: 12.1, z: -90, nx: 0.05, nz: 0.10, clusterCount: 2, stratum: 2, variant: 9 }),
    makeAnchor({ x: 45, y: 11.4, z: -86, nx: -0.10, nz: -0.08, clusterCount: 1, stratum: 2, variant: 11 }),
    makeAnchor({ x: 180, y: 18.5, z: 120, nx: 0.0, nz: 0.0, clusterCount: 3, stratum: 3, variant: 14 }),
    makeAnchor({ x: 184, y: 19.0, z: 118, nx: 0.15, nz: 0.15, clusterCount: 1, stratum: 3, variant: 0 }),
  );
  // Understory (1): 0 rescue, 1 low, 1 medium, 1 high
  lists[1].push(
    makeAnchor({ x: -60, y: 15.0, z: -20, clusterCount: 2, stratum: 1, r: 0.12, g: 0.18, b: 0.06 }),
    makeAnchor({ x: -58, y: 15.4, z: -22, clusterCount: 1, stratum: 2, r: 0.14, g: 0.16, b: 0.05 }),
    makeAnchor({ x: -55, y: 15.8, z: -24, clusterCount: 2, stratum: 3, r: 0.11, g: 0.15, b: 0.06 }),
  );
  // Maquis (2): 1 rescue, 1 low, 1 medium, 1 high
  lists[2].push(
    makeAnchor({ x: 10, y: 14.2, z: 30, clusterCount: 1, stratum: 0 }),
    makeAnchor({ x: 14, y: 14.5, z: 34, clusterCount: 2, stratum: 1 }),
    makeAnchor({ x: 18, y: 14.9, z: 38, clusterCount: 1, stratum: 2 }),
    makeAnchor({ x: 22, y: 15.2, z: 42, clusterCount: 2, stratum: 3 }),
  );
  // Flowers (3): 0 rescue, 1 low, 1 medium, 1 high
  lists[3].push(
    makeAnchor({ x: -25, y: 9.0, z: 12, clusterCount: 3, stratum: 1, variant: 3 }),
    makeAnchor({ x: -20, y: 9.4, z: 15, clusterCount: 2, stratum: 2, variant: 8 }),
    makeAnchor({ x: -16, y: 9.6, z: 18, clusterCount: 1, stratum: 3, variant: 13 }),
  );
  // Rocks (4): 2 rescue, 1 low, 1 medium, 1 high (clusterCount = 1)
  lists[4].push(
    makeAnchor({ x: -90, y: 10.5, z: -50, nx: 0.35, nz: 0.25, clusterCount: 1, stratum: 0, scale: 1.35 }),
    makeAnchor({ x: 95, y: 16.0, z: 60, nx: -0.30, nz: 0.20, clusterCount: 1, stratum: 0, scale: 1.2 }),
    makeAnchor({ x: 98, y: 16.4, z: 62, nx: -0.25, nz: 0.15, clusterCount: 1, stratum: 1, scale: 0.9 }),
    makeAnchor({ x: 102, y: 16.9, z: 66, nx: -0.15, nz: 0.10, clusterCount: 1, stratum: 2, scale: 0.8 }),
    makeAnchor({ x: 105, y: 17.2, z: 70, nx: -0.10, nz: 0.05, clusterCount: 1, stratum: 3, scale: 0.7 }),
  );
  // Coastal (5): 0 rescue, 1 low, 1 medium, 1 high
  lists[5].push(
    makeAnchor({ x: -210, y: 3.1, z: -110, clusterCount: 1, stratum: 1 }),
    makeAnchor({ x: -206, y: 3.5, z: -108, clusterCount: 2, stratum: 2 }),
    makeAnchor({ x: -202, y: 3.9, z: -105, clusterCount: 1, stratum: 3 }),
  );
  // Urban (6): 1 rescue, 1 low, 1 medium, 1 high
  lists[6].push(
    makeAnchor({ x: 52, y: 8.0, z: 10, nx: 0.0, nz: 0.0, clusterCount: 1, stratum: 0, variant: 10 }),
    makeAnchor({ x: 56, y: 8.0, z: 12, nx: 0.0, nz: 0.0, clusterCount: 1, stratum: 1, variant: 12 }),
    makeAnchor({ x: 60, y: 13.5, z: 14, nx: 0.0, nz: 0.0, clusterCount: 1, stratum: 2, variant: 14 }),
    makeAnchor({ x: 64, y: 13.5, z: 16, nx: 0.0, nz: 0.0, clusterCount: 1, stratum: 3, variant: 4 }),
  );
  return lists;
}

describe("Phase 4A — 7 opaque procedural ground-cover archetypes", () => {
  it("builds all 7 indexed opaque BufferGeometries with exact attributes, rooted bases, and finite unit normals", () => {
    const kit = buildGroundCoverKit();
    expect(Object.keys(kit)).toEqual([...GROUNDCOVER_ARCHETYPES]);

    const expectedTriBounds: Record<(typeof GROUNDCOVER_ARCHETYPES)[number], readonly [number, number]> = {
      grass: [14, 24],
      understory: [18, 30],
      maquis: [34, 48],
      flowers: [12, 22],
      rocks: [24, 38],
      coastal: [22, 34],
      urban: [28, 42],
    };

    for (const kind of GROUNDCOVER_ARCHETYPES) {
      const g = kit[kind];
      expect(g.index, `${kind} must be indexed`).not.toBeNull();
      const pos = g.getAttribute("position") as THREE.BufferAttribute;
      const nor = g.getAttribute("normal") as THREE.BufferAttribute;
      const bladeT = g.getAttribute("aBladeT") as THREE.BufferAttribute;
      const part = g.getAttribute("aPart") as THREE.BufferAttribute;
      const hint = g.getAttribute("aColorHint") as THREE.BufferAttribute;

      expect(pos.itemSize).toBe(3);
      expect(nor.itemSize).toBe(3);
      expect(bladeT.itemSize).toBe(1);
      expect(part.itemSize).toBe(1);
      expect(hint.itemSize).toBe(3);
      expect(nor.count).toBe(pos.count);
      expect(bladeT.count).toBe(pos.count);
      expect(part.count).toBe(pos.count);
      expect(hint.count).toBe(pos.count);

      const triCount = g.index!.count / 3;
      const [loT, hiT] = expectedTriBounds[kind];
      expect(triCount, `${kind} tri count`).toBeGreaterThanOrEqual(loT);
      expect(triCount, `${kind} tri count`).toBeLessThanOrEqual(hiT);

      let minY = Infinity;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < minY) minY = y;
        const nLen = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i));
        expect(nLen, `${kind} vert ${i} unit normal`).toBeCloseTo(1, 3);
        const bt = bladeT.getX(i);
        expect(bt).toBeGreaterThanOrEqual(0);
        expect(bt).toBeLessThanOrEqual(1);
        const pt = part.getX(i);
        expect(pt === 0 || pt === 1).toBe(true);
        for (let c = 0; c < 3; c++) {
          const hv = hint.array[i * 3 + c];
          expect(Number.isFinite(hv) && hv > 0).toBe(true);
        }
      }
      // Every archetype is sunk at its root (-0.05..-0.08 m) so nothing floats on slopes
      expect(minY, `${kind} root sink`).toBeLessThanOrEqual(-0.045);
      g.dispose();
    }
  });

  it("transfers spherical-radial smooth outward normals on gc-maquis from (0, -0.25*h, 0)", () => {
    const g = buildArchetypeGeometry("maquis");
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const nor = g.getAttribute("normal") as THREE.BufferAttribute;
    let maxY = 0;
    for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
    const originY = -0.25 * maxY;
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i);
      const dy = pos.getY(i) - originY;
      const dz = pos.getZ(i);
      const len = Math.hypot(dx, dy, dz);
      expect(nor.getX(i)).toBeCloseTo(dx / len, 4);
      expect(nor.getY(i)).toBeCloseTo(dy / len, 4);
      expect(nor.getZ(i)).toBeCloseTo(dz / len, 4);
    }
    g.dispose();
  });

  it("separates aPart=0 (stem/mound/pot/slab) and aPart=1 (foliage/petal/scree) on compound archetypes", () => {
    for (const kind of ["understory", "flowers", "rocks", "urban"] as const) {
      const g = buildArchetypeGeometry(kind);
      const part = g.getAttribute("aPart") as THREE.BufferAttribute;
      let has0 = false, has1 = false;
      for (let i = 0; i < part.count; i++) {
        if (part.getX(i) === 0) has0 = true;
        if (part.getX(i) === 1) has1 = true;
      }
      expect(has0, `${kind} has aPart=0`).toBe(true);
      expect(has1, `${kind} has aPart=1`).toBe(true);
      g.dispose();
    }
  });
});

describe("Phase 4A — HBGC v1 binary codec & tangent-plane micro-cluster expansion", () => {
  it("round-trips header, AABB, Morton-sorted delta streams, RGB565, normals, and props accurately", () => {
    const input = makeTestAnchors();
    const buf = encodeGroundCover(input);
    const totalAnchors = input.reduce((s, l) => s + l.length, 0);
    expect(buf.byteLength).toBe(HBGC_HEADER_BYTES + ARCHETYPE_COUNT * 8 + totalAnchors * 12);

    const decoded = decodeGroundCover(buf);
    expect(decoded.version).toBe(HBGC_VERSION);
    expect(decoded.totalAnchors).toBe(totalAnchors);

    // Total expanded instances equals exact sum of clusterCount across all anchors
    const expectedInstances = input.reduce((s, l) => s + l.reduce((c, a) => c + a.clusterCount, 0), 0);
    expect(decoded.totalInstances).toBe(expectedInstances);

    // Every archetype packs exactly 24 B/inst (16 + 4 + 4) and preserves monotonic stratum prefixes
    for (let ai = 0; ai < ARCHETYPE_COUNT; ai++) {
      const d = decoded.archetypes[ai];
      expect(d.aInstPos.byteLength).toBe(d.instanceCount * 16);
      expect(d.aInstGround.byteLength).toBe(d.instanceCount * 4);
      expect(d.aInstMeta.byteLength).toBe(d.instanceCount * 4);
      expect(d.stratumPrefix[0]).toBeLessThanOrEqual(d.stratumPrefix[1]);
      expect(d.stratumPrefix[1]).toBeLessThanOrEqual(d.stratumPrefix[2]);
      expect(d.stratumPrefix[2]).toBeLessThanOrEqual(d.stratumPrefix[3]);
      expect(d.stratumPrefix[3]).toBe(d.instanceCount);

      // Verify archetype id packed in top 3 bits of aInstMeta.w
      for (let k = 0; k < d.instanceCount; k++) {
        expect(d.aInstMeta[k * 4 + 3] >>> 5).toBe(ai);
      }
    }

    // Precision check on rocks (clusterCount = 1, 1:1 anchor mapping): XZ <= 2 cm, Y <= 2 mm, normal <= 0.02
    const rocks = decoded.archetypes[4];
    expect(rocks.instanceCount).toBe(input[4].length);
    for (let k = 0; k < rocks.instanceCount; k++) {
      const rx = rocks.aInstPos[k * 4];
      const ry = rocks.aInstPos[k * 4 + 1];
      const rz = rocks.aInstPos[k * 4 + 2];
      const rnx = (rocks.aInstMeta[k * 4] / 255) * 2 - 1;
      const rnz = (rocks.aInstMeta[k * 4 + 1] / 255) * 2 - 1;
      const match = input[4].find((a) => Math.hypot(a.x - rx, a.z - rz) < 0.05);
      expect(match).toBeDefined();
      expect(Math.abs(match!.x - rx)).toBeLessThan(0.02);
      expect(Math.abs(match!.z - rz)).toBeLessThan(0.02);
      expect(Math.abs(match!.y - ry)).toBeLessThan(0.005);
      expect(Math.abs(match!.nx - rnx)).toBeLessThan(0.02);
      expect(Math.abs(match!.nz - rnz)).toBeLessThan(0.02);
    }
  });

  it("expands multi-instance clusters strictly within each anchor's local tangent plane (T, B) ⊥ N", () => {
    const single: GroundCoverAnchor[][] = Array.from({ length: ARCHETYPE_COUNT }, () => []);
    const nx = 0.42, nz = -0.31;
    const ny = Math.sqrt(1 - nx * nx - nz * nz);
    single[0].push(makeAnchor({ x: 10, y: 12, z: -20, nx, nz, clusterCount: 3, scale: 1.15, stratum: 0 }));

    const decoded = decodeGroundCover(encodeGroundCover(single, {
      minX: -100, minY: 0, minZ: -100, scaleX: 200, scaleY: 40, scaleZ: 200,
    }));
    const grass = decoded.archetypes[0];
    expect(grass.anchorCount).toBe(1);
    expect(grass.instanceCount).toBe(3);

    const p0 = new THREE.Vector3(grass.aInstPos[0], grass.aInstPos[1], grass.aInstPos[2]);
    // Exact i8-quantized normal used to construct the tangent frame (T, B)
    const i8Nx = Math.round(nx * 127) / 127;
    const i8Nz = Math.round(nz * 127) / 127;
    const i8Ny = Math.sqrt(Math.max(0, 1 - i8Nx * i8Nx - i8Nz * i8Nz));
    const nExact = new THREE.Vector3(i8Nx, i8Ny, i8Nz);
    // Re-quantized u8 attribute normal passed to the GPU shader
    const uNx = (grass.aInstMeta[0] / 255) * 2 - 1;
    const uNz = (grass.aInstMeta[1] / 255) * 2 - 1;
    const uNy = Math.sqrt(Math.max(0, 1 - uNx * uNx - uNz * uNz));
    const nGpu = new THREE.Vector3(uNx, uNy, uNz);
    expect(nExact.distanceTo(new THREE.Vector3(nx, ny, nz))).toBeLessThan(0.01);
    expect(nGpu.distanceTo(nExact)).toBeLessThan(0.01);

    for (let k = 1; k < 3; k++) {
      const pk = new THREE.Vector3(grass.aInstPos[k * 4], grass.aInstPos[k * 4 + 1], grass.aInstPos[k * 4 + 2]);
      const delta = pk.clone().sub(p0);
      // Offset has non-trivial horizontal spread and lies strictly orthogonal to N
      expect(delta.length()).toBeGreaterThan(0.25);
      expect(Math.abs(delta.dot(nExact))).toBeLessThan(1e-5);
      expect(Math.abs(delta.dot(nGpu))).toBeLessThan(0.005);
    }

    // Verify large signed wrap-around deltas (e.g. negative/positive edges of AABB and ±127 normals) round-trip cleanly
    const wrapAnchors: GroundCoverAnchor[][] = Array.from({ length: ARCHETYPE_COUNT }, () => []);
    wrapAnchors[4].push(
      makeAnchor({ x: -300, y: 0.5, z: -300, nx: -0.95, nz: 0.25, r: 0.05, g: 0.9, b: 0.1, stratum: 0 }),
      makeAnchor({ x: 300, y: 39.5, z: 300, nx: 0.95, nz: -0.25, r: 0.9, g: 0.05, b: 0.85, stratum: 0 }),
      makeAnchor({ x: -299, y: 1.0, z: 299, nx: -0.60, nz: -0.70, r: 0.2, g: 0.4, b: 0.6, stratum: 3 }),
    );
    const wrapDec = decodeGroundCover(encodeGroundCover(wrapAnchors));
    expect(wrapDec.archetypes[4].instanceCount).toBe(3);
    for (const src of wrapAnchors[4]) {
      let matched = false;
      for (let k = 0; k < 3; k++) {
        const dx = Math.abs(wrapDec.archetypes[4].aInstPos[k * 4] - src.x);
        const dy = Math.abs(wrapDec.archetypes[4].aInstPos[k * 4 + 1] - src.y);
        const dz = Math.abs(wrapDec.archetypes[4].aInstPos[k * 4 + 2] - src.z);
        if (dx < 0.02 && dy < 0.005 && dz < 0.02) matched = true;
      }
      expect(matched).toBe(true);
    }

    // Expansion is 100% deterministic across repeated decodes
    const decoded2 = decodeGroundCover(encodeGroundCover(single, {
      minX: -100, minY: 0, minZ: -100, scaleX: 200, scaleY: 40, scaleZ: 200,
    }));
    expect(Array.from(decoded2.archetypes[0].aInstPos)).toEqual(Array.from(grass.aInstPos));
  });

  it("rejects corrupted magic, unsupported version, or truncated buffers, and computes exact 2D Morton keys", () => {
    expect(morton2D(0b101, 0b011)).toBe(0b011011);
    const badMagic = new ArrayBuffer(96);
    expect(() => decodeGroundCover(badMagic)).toThrow(/Invalid HBGC magic/);

    const valid = encodeGroundCover(makeTestAnchors());
    const badVer = valid.slice(0);
    new DataView(badVer).setUint16(4, 99, true);
    expect(() => decodeGroundCover(badVer)).toThrow(/Unsupported HBGC version/);

    expect(() => decodeGroundCover(valid.slice(0, valid.byteLength - 4))).toThrow(/truncated/);
  });
});

describe("Phase 4A — Unified WebGL2 ground-cover shader (full & HB_LITE) + rockDepthMat", () => {
  it("assembles full & HB_LITE variants cleanly with root blending, GUST_GLSL wind waves, SSS, and zero discard", () => {
    const u = createWorldUniforms();
    const mats = new HarbourMaterials(u);
    const { colorMat, rockDepthMat, uniforms } = createGroundCoverMaterial(mats, {
      stiffness: GROUNDCOVER_STIFFNESS.grass,
      fade: GROUNDCOVER_FADE.grass,
    });
    expect(colorMat.name).toBe("hb_groundcover");
    expect(rockDepthMat.name).toBe("hb_groundcover_rock_depth");
    expect(uniforms.uStiffness.value).toBe(1.0);

    // Full tier compilation
    const full = assembleShader(colorMat);
    expect("HB_LITE" in (full.defines ?? {})).toBe(false);
    expect(full.vertexShader).toContain("attribute vec4 aInstPos;");
    expect(full.vertexShader).toContain("attribute vec4 aInstGround;");
    expect(full.vertexShader).toContain("attribute vec4 aInstMeta;");
    expect(full.vertexShader).toContain("float hbGust(");
    expect(full.vertexShader).toContain("hbGcRootSeasonColor");
    expect(full.vertexShader).toContain("hbDrySeason()");
    expect(full.vertexShader).toContain("vGustSheen =");
    expect(full.vertexShader).toContain("hbAerialVert(vHbWorld);");
    expect(full.fragmentShader).toContain("hbFoliageSSS(");
    expect(full.fragmentShader).toContain("hbPool(vHbWorld, hbGcNw)");
    expect(full.fragmentShader).toContain("hbBeamLight(vHbWorld, hbGcNw)");
    expect(full.fragmentShader).toContain("hbAO(vHbWorld, hbGcNw)");
    expect(full.fragmentShader).toContain("hbAerial(outgoingLight, vHbWorld, 0.0)");
    expect(full.fragmentShader).not.toContain("discard;");
    expect(full.uniforms.uSwayK).toBe(swayUniforms.uSwayK);
    expect(full.uniforms.uSwayGust).toBe(swayUniforms.uSwayGust);
    expect(full.uniforms.uSwayWind).toBe(u.uWindVec);
    expect(full.uniforms.uSwayTime).toBe(u.uTime);
    expect(full.uniforms.uAOTex).toBe(mats.ao.uAOTex);
    expect(full.uniforms.uAOBounds).toBe(mats.ao.uAOBounds);
    expect(full.uniforms.uHbSunDir).toBe(u.uSunDir);

    // Second archetype shares the EXACT same customProgramCacheKey (1 unified WebGL2 program!)
    const rockBuilt = createGroundCoverMaterial(mats, {
      stiffness: GROUNDCOVER_STIFFNESS.rocks,
      fade: GROUNDCOVER_FADE.rocks,
    });
    expect(rockBuilt.colorMat.customProgramCacheKey()).toBe(colorMat.customProgramCacheKey());

    // Switching to Low tier invalidates tracked ground-cover materials and enables HB_LITE + HB_BEAM_VERT
    const verBefore = colorMat.version;
    const keyBefore = colorMat.customProgramCacheKey();
    mats.setLite(true);
    expect(colorMat.version).toBe(verBefore + 1);
    expect(colorMat.customProgramCacheKey()).not.toBe(keyBefore);
    expect(colorMat.customProgramCacheKey()).toContain("HB_LITE");
    expect(colorMat.customProgramCacheKey()).toContain(mats.kitKey());

    const lite = assembleShader(colorMat);
    expect("HB_LITE" in (lite.defines ?? {})).toBe(true);
    expect("HB_BEAM_VERT" in (lite.defines ?? {})).toBe(true);
    expect(lite.vertexShader).toContain("hbBeamVert(vHbWorld);");
    expect(lite.fragmentShader).not.toContain("discard;");

    // Static shadow-casting rock depth material unpacks aInstPos + scale with zero sway and zero discard
    const depthShader = assembleShader(rockDepthMat);
    expect(depthShader.vertexShader).toContain("attribute vec4 aInstPos;");
    expect(depthShader.vertexShader).toContain("attribute vec4 aInstGround;");
    expect(depthShader.vertexShader).not.toContain("hbGust");
    expect(depthShader.fragmentShader).not.toContain("discard");
    expect(rockDepthMat.customProgramCacheKey()).toBe("hb_groundcover_rock_depth_v1");

    colorMat.dispose();
    rockDepthMat.dispose();
    rockBuilt.colorMat.dispose();
    rockBuilt.rockDepthMat.dispose();
    mats.dispose();
  });
});

describe("Phase 4A — GroundCoverSystem runtime, O(1) strata scaling, seasonal flowers & far cull", () => {
  it("maps quality rungs to progressive strata and computes seasonal flower visibility", () => {
    expect(stratumBandFor("high", 2.0)).toBe(3);
    expect(stratumBandFor("high", 1.5)).toBe(3);
    expect(stratumBandFor("medium", 1.5)).toBe(2);
    expect(stratumBandFor("medium", 1.25)).toBe(2);
    expect(stratumBandFor("low", 1.25)).toBe(1);
    expect(stratumBandFor("low", 1.0)).toBe(1);
    expect(stratumBandFor("low", 0.8)).toBe(0);
    expect(stratumBandFor("low", 0.5)).toBe(0);

    const springScale = flowerScaleForSeason([1, 0, 0, 0], 0.28);
    const earlySummerScale = flowerScaleForSeason([0, 1, 0, 0], 0.38);
    const peakDroughtScale = flowerScaleForSeason([0, 1, 0, 0], 0.62);
    const winterScale = flowerScaleForSeason([0, 0, 0, 1], 0.03);
    expect(springScale).toBe(1);
    expect(earlySummerScale).toBeGreaterThan(peakDroughtScale);
    expect(peakDroughtScale).toBeGreaterThan(winterScale);
    expect(winterScale).toBe(0);
  });

  it("initializes 7 instanced meshes, prepares group, scales O(1) on quality changes, and culls grass/flowers > 860 m", async () => {
    const input = makeTestAnchors();
    const buf = encodeGroundCover(input);
    const decoded = decodeGroundCover(buf);

    const u = createWorldUniforms();
    const scene = new THREE.Scene();
    const listeners: Array<(s: QualitySettings, dpr: number) => void> = [];
    let currentTier: QualityTier = "high";
    let currentDpr = 1.5;
    const quality: QualityService = {
      get tier() { return currentTier; },
      get settings() { return TIERS[currentTier]; },
      get dpr() { return currentDpr; },
      auto: true,
      gpuMs: null,
      set() {},
      onChange(fn) {
        listeners.push(fn);
        return () => {
          const idx = listeners.indexOf(fn);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      },
    };

    let preparedRoot: THREE.Object3D | null = null;
    const preparation = {
      prepareGroup: async (root: THREE.Object3D) => { preparedRoot = root; },
    } as unknown as PreparationService;

    let invalidated = 0;
    const sun = { casters: { invalidate: () => { invalidated++; } } };
    let seasonWeights: [number, number, number, number] = [1, 0, 0, 0];
    const season = { get weights() { return seasonWeights; } } as unknown as SeasonService;

    const services = new Map<string, unknown>([
      ["quality", quality],
      ["preparation", preparation],
      ["sun", sun],
      ["season", season],
    ]);
    const rig = { distance: 320 };
    const ctx = {
      scene,
      uniforms: u,
      services,
      rig,
      assets: {},
    } as unknown as EngineContext;

    const sys = new GroundCoverSystem({ buffer: buf });
    expect(sys.name).toBe("groundcover");
    expect(sys.id).toBe("groundcover");

    await sys.init(ctx);
    expect(preparedRoot).toBe(sys.root);
    expect(scene.children).toContain(sys.root);
    expect(sys.meshes.length).toBe(ARCHETYPE_COUNT);
    expect(invalidated).toBe(1);

    const meshByName = new Map(sys.meshes.map((m) => [m.name, m]));
    const rocksMesh = meshByName.get("gc-rocks")!;
    const grassMesh = meshByName.get("gc-grass")!;
    const flowersMesh = meshByName.get("gc-flowers")!;
    const maquisMesh = meshByName.get("gc-maquis")!;

    // High tier: 100% instances, rocks castShadow=true with rockDepthMat
    expect(rocksMesh.castShadow).toBe(true);
    expect(rocksMesh.customDepthMaterial?.name).toBe("hb_groundcover_rock_depth");
    expect(grassMesh.castShadow).toBe(false);
    expect((grassMesh.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(decoded.archetypes[0].stratumPrefix[3]);

    // Transition through Medium -> Low(dpr=1.0) -> Rescue(dpr=0.67) in O(1)
    const stepTier = (tier: QualityTier, dpr: number, expectedBand: StratumBand) => {
      currentTier = tier;
      currentDpr = dpr;
      for (const fn of listeners) fn(TIERS[tier], dpr);
      expect(sys.stratumBand).toBe(expectedBand);
      for (let ai = 0; ai < ARCHETYPE_COUNT; ai++) {
        const g = sys.meshes[ai].geometry as THREE.InstancedBufferGeometry;
        expect(g.instanceCount).toBe(decoded.archetypes[ai].stratumPrefix[expectedBand]);
      }
    };

    stepTier("medium", 1.25, 2);
    expect(rocksMesh.castShadow).toBe(true);

    stepTier("low", 1.0, 1);
    expect(rocksMesh.castShadow).toBe(false);

    stepTier("low", 0.67, 0);
    // Rescue rung hides grass/flowers/understory/coastal (0 rescue count), retains rocks/maquis/urban
    expect((grassMesh.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(0);
    expect(grassMesh.visible).toBe(false);
    expect((rocksMesh.geometry as THREE.InstancedBufferGeometry).instanceCount).toBeGreaterThan(0);
    expect(rocksMesh.visible).toBe(true);
    expect(rocksMesh.castShadow).toBe(false);
    expect(maquisMesh.visible).toBe(true);

    // Return to High and test far-overview (> 860 m) grass & flower visibility culling
    stepTier("high", 1.5, 3);
    expect(grassMesh.visible).toBe(true);
    expect(flowersMesh.visible).toBe(true);
    expect(rocksMesh.castShadow).toBe(true);

    const frame: FrameState = { elapsed: 1, delta: 0.016, nowMs: Date.now() };
    rig.distance = 900;
    seasonWeights = [0, 0, 0, 1];
    u.uSeasonPhase.value = 0.03;
    sys.update(frame, ctx);
    expect(grassMesh.visible).toBe(false);
    expect(flowersMesh.visible).toBe(false);
    expect(rocksMesh.visible).toBe(true);
    expect(maquisMesh.visible).toBe(true);

    rig.distance = 400;
    sys.update(frame, ctx);
    expect(grassMesh.visible).toBe(true);
    expect(flowersMesh.visible).toBe(true);

    const listenersAfterInit = listeners.length;
    expect(listenersAfterInit).toBeGreaterThanOrEqual(1);

    sys.dispose(ctx);
    expect(scene.children).not.toContain(sys.root);
    // GroundCoverSystem unsubscribes its own quality listener (HarbourMaterials keeps its own)
    expect(listeners.length).toBe(listenersAfterInit - 1);
    (services.get("materials") as HarbourMaterials | undefined)?.dispose();
  });
});

describe("Phase 4B — Frame-1 runtime wiring, LazyGroundCoverSystem, consumeBinary & 404 fallback", () => {
  it("registers LazyGroundCoverSystem in SYSTEMS immediately after vegetation with canonical URL", () => {
    vi.stubGlobal("location", { search: "", hash: "" });
    expect(GROUNDCOVER_URL).toBe("/harbour/groundcover.bin");
    expect(PREFETCH_GROUNDCOVER_URL).toBe(GROUNDCOVER_URL);
    const names = SYSTEMS.map((make) => make().name);
    const islandIdx = names.indexOf("island");
    const vegIdx = names.indexOf("vegetation");
    const gcIdx = names.indexOf("groundcover");
    expect(islandIdx).toBeGreaterThanOrEqual(0);
    expect(vegIdx).toBe(islandIdx + 1);
    expect(gcIdx).toBe(vegIdx + 1);
  });

  it("LazyGroundCoverSystem consumes prefetched groundcover.bin via consumeBinary in a single fetch and disposes cleanly", async () => {
    const buf = encodeGroundCover(makeTestAnchors());
    const fetcher = vi.fn(async (url: string) => {
      if (url === GROUNDCOVER_URL) {
        return new Response(buf, { status: 200, headers: { "content-type": "application/octet-stream" } });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetcher);

    const assets = new AssetStore();
    void prefetchBinary(assets, GROUNDCOVER_URL);

    const u = createWorldUniforms();
    const scene = new THREE.Scene();
    const services = new Map<string, unknown>();
    const rig = { distance: 320 };
    const ctx = { scene, uniforms: u, services, rig, assets } as unknown as EngineContext;

    const lazy = new LazyGroundCoverSystem();
    expect(lazy.name).toBe("groundcover");
    await lazy.init(ctx);

    // Prefetched binary was consumed without a second HTTP fetch
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(GROUNDCOVER_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));

    const root = scene.getObjectByName("harbour-groundcover") as THREE.Group | undefined;
    expect(root).toBeDefined();
    expect(root!.children).toHaveLength(ARCHETYPE_COUNT);

    // update / resize / dispose delegate cleanly through LazyGroundCoverSystem
    rig.distance = 900;
    lazy.update({ elapsed: 1, delta: 0.016, nowMs: Date.now() }, ctx);
    expect(root!.getObjectByName("gc-grass")?.visible).toBe(false);
    expect(root!.getObjectByName("gc-rocks")?.visible).toBe(true);
    lazy.resize(1280, 720, ctx);

    lazy.dispose(ctx);
    expect(scene.getObjectByName("harbour-groundcover")).toBeUndefined();
    (services.get("materials") as HarbourMaterials | undefined)?.dispose();
    assets.dispose();
  });

  it("handles missing / 404, empty, or corrupted groundcover.bin gracefully without throwing or mounting", async () => {
    const cases: Array<() => Response> = [
      () => new Response(null, { status: 404 }),
      () => new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }),
      () => new Response(new Uint8Array(0), { status: 200, headers: { "content-type": "application/octet-stream" } }),
      () => new Response(new Uint8Array([0x00, 0x01, 0x02, 0x03]), { status: 200, headers: { "content-type": "application/octet-stream" } }),
    ];

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const makeRes of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => makeRes()));
      const assets = new AssetStore();
      const u = createWorldUniforms();
      const scene = new THREE.Scene();
      const services = new Map<string, unknown>();
      const ctx = { scene, uniforms: u, services, rig: { distance: 320 }, assets } as unknown as EngineContext;

      const lazy = new LazyGroundCoverSystem();
      await expect(lazy.init(ctx)).resolves.toBeUndefined();
      expect(scene.children).toHaveLength(0);
      lazy.update({ elapsed: 1, delta: 0.016, nowMs: Date.now() }, ctx);
      lazy.dispose(ctx);
      assets.dispose();
    }
    expect(warn).toHaveBeenCalledTimes(1); // corrupted buffer warns once
  });
});
