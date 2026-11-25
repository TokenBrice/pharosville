import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWorldUniforms } from "../engine/uniforms";
import { SDF_COAST_RANGE, SDF_DEPTH_RANGE, SDF_ISLAND_RADII, type Bounds4, type HeightField } from "./sea-sdf";
import { Seabed, SEABED_FRAG, SEABED_VERT, seabedHeightAt } from "./seabed";

const dampOf = (coast: number) =>
  THREE.MathUtils.smoothstep(coast, 0, 34) * 0.9 + 0.1 * THREE.MathUtils.smoothstep(coast, -2, 2);

function makeSdf(size: number, coastM: number, depthM: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const r = Math.round(THREE.MathUtils.clamp(0.5 + coastM / SDF_COAST_RANGE, 0, 1) * 255);
  const g = Math.round(THREE.MathUtils.clamp(depthM / SDF_DEPTH_RANGE, 0, 1) * 255);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe("seabedHeightAt (H6 depth & clearance invariants)", () => {
  const scx = 12, scz = -18;

  it("applies sdfMainlandFade so retired mainland past 560 m stays deep (-28 m) with zero bump", () => {
    const [r0, r1] = SDF_ISLAND_RADII;
    expect([r0, r1]).toEqual([470, 560]);

    // Beyond 560 m: always -28.0 m even with land-like SDF values or shoals weight
    for (const angle of [0, 0.9, 2.3, 4.1]) {
      const x = scx + Math.cos(angle) * 620;
      const z = scz + Math.sin(angle) * 620;
      expect(seabedHeightAt(x, z, -24, 0, scx, scz, 2.5, 1.0)).toBeCloseTo(-28.0, 6);
      expect(seabedHeightAt(x, z, 5, 1.2, scx, scz, null, 0.8)).toBeCloseTo(-28.0, 6);
    }

    // Smooth monotonic descent through the 470..560 m mainland fade band
    let prev = seabedHeightAt(scx + 465, scz, 40, 8.0, scx, scz, null, 0);
    for (let d = 470; d <= 570; d += 10) {
      const y = seabedHeightAt(scx + d, scz, 40, 8.0, scx, scz, null, 0);
      expect(y).toBeLessThanOrEqual(prev + 1e-6);
      prev = y;
    }
    expect(prev).toBeCloseTo(-28.0, 6);
  });

  it("enforces continuous coastline clearance y <= groundY - 0.30 (zero beach pop-through) and tucks under quays", () => {
    for (const coastM of [-3.0, -1.5, -0.5, 0.0, 0.5, 1.2]) {
      for (const groundY of [-3.0, -1.5, -0.4, 0.0, 0.25, 0.8, 2.5]) {
        const y = seabedHeightAt(scx + 40, scz + 20, coastM, 2.0, scx, scz, groundY, 0);
        expect(y, `coast=${coastM} ground=${groundY}`).toBeLessThanOrEqual(groundY - 0.30 + 1e-9);
      }
    }

    // Deep inland or under elevated quays: tucks cleanly to <= -4.3 m
    expect(seabedHeightAt(scx + 20, scz, -5.0, 0, scx, scz, 2.0, 0)).toBeLessThanOrEqual(-4.3);
    expect(seabedHeightAt(scx + 20, scz, -2.5, 0, scx, scz, null, 0)).toBeLessThanOrEqual(-4.3);

    // Submerged stone footings exported down to -4.3 m (-3.8 m) must still stay unburied (y <= groundY - 0.30, Astra #7)
    expect(seabedHeightAt(scx + 40, scz + 20, 1.5, 1.8, scx, scz, -3.8, 0)).toBeLessThanOrEqual(-4.1 + 1e-9);

    // Quay walls / harbour basins drop cleanly to >= 3.2 m depth so newly exported stone courses are never buried (Opus #2)
    expect(seabedHeightAt(scx + 40, scz + 20, 1.5, 1.4, scx, scz, null, 0, 1.0, 1.0)).toBeLessThanOrEqual(-3.2);

    // Off-island FLOOR (-8 m) in ground heightfield must not pull shallow water down to -8.3 m
    const shallowWater = seabedHeightAt(scx + 80, scz + 30, 4.0, 2.2, scx, scz, -8.0, 0.5);
    expect(shallowWater).toBeGreaterThan(-4.0);
  });

  it("enforces H6 storm-trough clearance y <= -max(0.95, 1.35 * dampOf(coast)) over water", () => {
    for (const coastM of [1.01, 1.5, 3.0, 8.0, 18.0, 34.0, 60.0]) {
      const ceiling = -Math.max(0.95, 1.35 * dampOf(coastM));
      for (const shoals of [0, 0.5, 1.0]) {
        for (const depthM of [0.1, 0.6, 1.2, 5.0]) {
          const y = seabedHeightAt(scx + 120, scz - 90, coastM, depthM, scx, scz, null, shoals);
          expect(y, `coast=${coastM} depth=${depthM} shoals=${shoals}`).toBeLessThanOrEqual(ceiling + 1e-9);
        }
      }
    }
  });
});

describe("Seabed mesh, in-place rebuild, material & shader contracts", () => {
  const bounds: Bounds4 = [-900, -900, 900, 900];
  const makeOpts = () => {
    const sdfSize = 32;
    const sdfData = makeSdf(sdfSize, 20, 6);
    const sdfTex = new THREE.DataTexture(sdfData, sdfSize, sdfSize, THREE.RGBAFormat);
    const zonesTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    const noiseTex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
    return {
      bounds,
      sdfData,
      sdfSize,
      sceneCenter: [0, 0] as const,
      ground: null,
      uSdf: { value: sdfTex as THREE.Texture },
      uSdfBounds: { value: new THREE.Vector4(...bounds) },
      uZones: { value: zonesTex as THREE.Texture },
      uNoise: { value: noiseTex as THREE.Texture },
      uniforms: createWorldUniforms(),
    };
  };

  it("constructs an opaque hb_seabed mesh with adaptive 256x256 density and upward normals", () => {
    const opts = makeOpts();
    const seabed = new Seabed(opts);
    const { mesh } = seabed;
    const mat = mesh.material;

    expect(mesh.name).toBe("ocean-seabed");
    expect(mesh.renderOrder).toBe(0);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    expect(mat.name).toBe("hb_seabed");
    expect(mat.transparent).toBe(false);
    expect(mat.depthWrite).toBe(true);
    expect(mat.depthTest).toBe(true);
    expect(mat.side).toBe(THREE.FrontSide);
    expect(mat.fog).toBe(false);

    // No-op raycast
    const hits: THREE.Intersection[] = [];
    mesh.raycast(new THREE.Raycaster(), hits);
    expect(hits).toHaveLength(0);

    const posAttr = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const normAttr = mesh.geometry.getAttribute("normal") as THREE.BufferAttribute;
    expect(posAttr.count).toBe(257 * 257);
    expect(normAttr.count).toBe(257 * 257);

    // Adaptive density: step near center is strictly finer than step near outer boundary
    const pos = posAttr.array as Float32Array;
    const innerStep = pos[(128 * 257 + 129) * 3] - pos[(128 * 257 + 128) * 3];
    const outerStep = pos[(128 * 257 + 256) * 3] - pos[(128 * 257 + 255) * 3];
    expect(innerStep).toBeGreaterThan(0);
    expect(outerStep).toBeGreaterThan(innerStep);

    // All vertex normals are unit-length and upward-facing (+Y)
    const norm = normAttr.array as Float32Array;
    for (let k = 0; k < normAttr.count; k += 29) {
      const nx = norm[k * 3], ny = norm[k * 3 + 1], nz = norm[k * 3 + 2];
      expect(ny).toBeGreaterThan(0);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
    }

    seabed.setVisible(false);
    expect(mesh.visible).toBe(false);
    seabed.setVisible(true);
    expect(mesh.visible).toBe(true);

    seabed.dispose();
    opts.uSdf.value.dispose();
    opts.uZones.value.dispose();
    opts.uNoise.value.dispose();
  });

  it("reads SDF rows from minZ and ground heightfield rows from maxZ without Y-axis inversion", () => {
    const opts = makeOpts();
    const n = 32;
    // Non-uniform SDF: southern half (row < n/2 -> z < 0) is shallow sea (depth=1 m), northern half (z > 0) is deep sea (depth=18 m)
    const sdf = new Uint8Array(n * n * 4);
    for (let row = 0; row < n; row++) {
      const deep = row >= n / 2;
      const r = Math.round((0.5 + 25 / SDF_COAST_RANGE) * 255);
      const g = Math.round(((deep ? 18 : 1.0) / SDF_DEPTH_RANGE) * 255);
      for (let col = 0; col < n; col++) {
        const o = (row * n + col) * 4;
        sdf[o] = r; sdf[o + 1] = g; sdf[o + 2] = 255; sdf[o + 3] = 255;
      }
    }
    // Non-uniform ground (row 0 = maxZ = +200, row 15 = minZ = -200): submerged stone footing (-3.8 m) ONLY in south half (z < 0 -> row >= 8)
    const gn = 16;
    const heights = new Float32Array(gn * gn).fill(-8.0);
    for (let row = gn / 2; row < gn; row++) for (let col = 0; col < gn; col++) heights[row * gn + col] = -3.8;
    const ground: HeightField = { bounds: [-200, -200, 200, 200], size: gn, heights };

    const seabed = new Seabed(opts);
    seabed.rebuild(sdf, n, ground);
    const pos = (seabed.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const yAt = (tx: number, tz: number) => {
      let best = 0, bestD = Infinity;
      for (let k = 0; k < pos.length; k += 3) {
        const d = Math.hypot(pos[k] - tx, pos[k + 2] - tz);
        if (d < bestD) { bestD = d; best = pos[k + 1]; }
      }
      return best;
    };
    // North (z = +100): deep SDF (-18 m)
    expect(yAt(0, 100)).toBeLessThan(-14);
    // South outside ground box (z = -300): shallow SDF (~-1.2..-2.5 m)
    expect(yAt(0, -300)).toBeGreaterThan(-4.0);
    // South inside ground box (z = -100): submerged -3.8 m stone footing forces y <= -4.1 m
    expect(yAt(0, -100)).toBeLessThanOrEqual(-4.1 + 1e-3);

    seabed.dispose();
    opts.uSdf.value.dispose();
    opts.uZones.value.dispose();
    opts.uNoise.value.dispose();
  });

  it("rebuild() updates position and normal attributes in-place without reallocating geometry or buffers", () => {
    const opts = makeOpts();
    const seabed = new Seabed(opts);
    const geo = seabed.mesh.geometry;
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const normAttr = geo.getAttribute("normal") as THREE.BufferAttribute;
    const posArray = posAttr.array;
    const normArray = normAttr.array;
    const centerIdx = (128 * 257 + 128) * 3 + 1;
    const yBefore = (posArray as Float32Array)[centerIdx];

    // Supply an inland quay SDF + ground height field over the island center
    const deepSdf = makeSdf(32, -2.5, 1.5);
    const ground: HeightField = {
      bounds: [-200, -200, 200, 200],
      size: 16,
      heights: new Float32Array(16 * 16).fill(1.8),
    };
    const posVer = posAttr.version;
    const normVer = normAttr.version;
    seabed.rebuild(deepSdf, 32, ground);

    expect(seabed.mesh.geometry).toBe(geo);
    expect(geo.getAttribute("position")).toBe(posAttr);
    expect(geo.getAttribute("normal")).toBe(normAttr);
    expect(posAttr.array).toBe(posArray);
    expect(normAttr.array).toBe(normArray);
    expect(posAttr.version).toBeGreaterThan(posVer);
    expect(normAttr.version).toBeGreaterThan(normVer);
    // Center height tucked under quay ground (<= -4.3 m), different from initial open water
    expect((posArray as Float32Array)[centerIdx]).toBeLessThanOrEqual(-4.3);
    expect((posArray as Float32Array)[centerIdx]).not.toBeCloseTo(yBefore, 2);

    // Also verify sloping beach coastline clearance after another in-place rebuild
    const beachSdf = makeSdf(32, 0.2, 0.6);
    const beachGround: HeightField = {
      bounds: [-200, -200, 200, 200],
      size: 16,
      heights: new Float32Array(16 * 16).fill(-0.1),
    };
    seabed.rebuild(beachSdf, 32, beachGround);
    expect(posAttr.array).toBe(posArray);
    expect((posArray as Float32Array)[centerIdx]).toBeLessThanOrEqual(-0.1 - 0.30 + 1e-5);

    seabed.dispose();
    opts.uSdf.value.dispose();
    opts.uZones.value.dispose();
    opts.uNoise.value.dispose();
  });

  it("complies with B07/C04 defined GLSL arithmetic and avoids Beer-Lambert or caustics inside hb_seabed", () => {
    const src = `${SEABED_VERT}\n${SEABED_FRAG}`;
    // Ascending smoothstep literals only
    for (const m of src.matchAll(/smoothstep\s*\(\s*([^,]+),\s*([^,]+),/g)) {
      const e0 = Number(m[1]), e1 = Number(m[2]);
      if (Number.isFinite(e0) && Number.isFinite(e1)) {
        expect(e0, `smoothstep(${m[1]}, ${m[2]}, ...)`).toBeLessThan(e1);
      }
    }
    // No pow(..., 2.0)
    expect(src).not.toMatch(/\bpow\s*\([^,]+,\s*2(\.0*)?\s*\)/);
    // Includes required shadow & seagrass helpers; main() excludes water-surface Beer-Lambert / caustics
    const mainBody = SEABED_FRAG.slice(SEABED_FRAG.indexOf("void main()"));
    expect(SEABED_FRAG).toContain("hbSeaSunShadow(wp)");
    expect(SEABED_FRAG).toContain("uKeyShadowDepth");
    expect(mainBody).toContain("hbSeabedShadow(vWorld)");
    expect(mainBody).toContain("hbCloudShadow(xz)");
    expect(mainBody).toContain("hbPosidonia(");
    expect(mainBody).not.toContain("exp(-");
    expect(mainBody).not.toContain("uCausticMap");
  });
});
