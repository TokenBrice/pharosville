import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { assembleShader } from "../engine/shader-recipes";
import { createWorldUniforms } from "../engine/uniforms";
import type { QualityService, QualitySettings, QualityTier } from "../engine/quality";
import { TIERS } from "../engine/quality";
import type { EngineContext, FrameState, PreparationService } from "../engine/types";
import type { SeasonService } from "../season/season-system";
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
  encodeGroundCover,
  flowerScaleForSeason,
  GroundCoverSystem,
  HBGC_HEADER_BYTES,
  HBGC_VERSION,
  morton2D,
  stratumBandFor,
  type GroundCoverAnchor,
  type StratumBand,
} from "./groundcover-system";

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
