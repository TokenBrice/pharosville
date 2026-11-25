import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createTerrainDetailAtlas,
  createTerrainDetailFallback,
  generateTerrainDetailData,
  TERRAIN_DETAIL_LAYERS,
  TERRAIN_DETAIL_SIZE,
} from "./terrain-detail";

describe("terrain micro-detail procedural atlas (256x256x4)", () => {
  it("generates exact RGBA8 dimensions, valid GPU settings, and runs quickly", () => {
    const t0 = performance.now();
    const tex = createTerrainDetailAtlas();
    const elapsedMs = performance.now() - t0;

    expect(tex).toBeInstanceOf(THREE.DataArrayTexture);
    expect(tex.image.width).toBe(TERRAIN_DETAIL_SIZE);
    expect(tex.image.height).toBe(TERRAIN_DETAIL_SIZE);
    expect(tex.image.depth).toBe(TERRAIN_DETAIL_LAYERS);
    expect((tex.image.data as Uint8Array).byteLength).toBe(TERRAIN_DETAIL_SIZE * TERRAIN_DETAIL_SIZE * TERRAIN_DETAIL_LAYERS * 4);
    expect(tex.colorSpace).toBe(THREE.NoColorSpace);
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.wrapT).toBe(THREE.RepeatWrapping);
    expect(tex.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
    expect(tex.generateMipmaps).toBe(true);
    expect(tex.anisotropy).toBe(8);
    // Deterministic & fast at boot (generous ceiling for loaded CI runners while verifying lightweight synthesis)
    expect(elapsedMs).toBeLessThan(250);
    tex.dispose();
  });

  it("produces deterministic, non-degenerate normals, meaningful height/cavity relief, and seamless periodic seams", () => {
    const a = generateTerrainDetailData(TERRAIN_DETAIL_SIZE);
    const b = generateTerrainDetailData(TERRAIN_DETAIL_SIZE);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);

    const n = TERRAIN_DETAIL_SIZE;
    const stride = n * n * 4;
    for (let layer = 0; layer < TERRAIN_DETAIL_LAYERS; layer++) {
      const base = layer * stride;
      let minH = 255, maxH = 0, minA = 255, maxA = 0, maxLen2 = 0, normalTiltSum = 0;
      for (let i = 0; i < n * n; i++) {
        const o = base + i * 4;
        const nx = (a[o] / 255) * 2 - 1;
        const ny = (a[o + 1] / 255) * 2 - 1;
        const len2 = nx * nx + ny * ny;
        if (len2 > maxLen2) maxLen2 = len2;
        normalTiltSum += Math.sqrt(len2);
        const hv = a[o + 2], av = a[o + 3];
        if (hv < minH) minH = hv;
        if (hv > maxH) maxH = hv;
        if (av < minA) minA = av;
        if (av > maxA) maxA = av;
      }
      // Normal XY must stay strictly inside the unit disc so nz = sqrt(1 - nx^2 - ny^2) is real and positive
      expect(maxLen2, `layer ${layer} max normal XY squared length`).toBeLessThan(0.999);
      // Every layer has genuine relief & normal variation (not flat neutral)
      expect(maxH - minH, `layer ${layer} height range`).toBeGreaterThan(100);
      expect(maxA - minA, `layer ${layer} cavity range`).toBeGreaterThan(80);
      expect(normalTiltSum / (n * n), `layer ${layer} mean normal tilt`).toBeGreaterThan(0.05);

      // Periodic wrap check: seam delta across x=0/n-1 and y=0/n-1 matches interior neighbour deltas (no step discontinuity)
      let seamH = 0, interiorH = 0;
      for (let i = 0; i < n; i++) {
        // Horizontal seam (col 0 vs col n-1) vs interior (col 127 vs col 128)
        seamH += Math.abs(a[base + (i * n + 0) * 4 + 2] - a[base + (i * n + (n - 1)) * 4 + 2]);
        interiorH += Math.abs(a[base + (i * n + 127) * 4 + 2] - a[base + (i * n + 128) * 4 + 2]);
        // Vertical seam (row 0 vs row n-1) vs interior (row 127 vs row 128)
        seamH += Math.abs(a[base + (0 * n + i) * 4 + 2] - a[base + ((n - 1) * n + i) * 4 + 2]);
        interiorH += Math.abs(a[base + (127 * n + i) * 4 + 2] - a[base + (128 * n + i) * 4 + 2]);
      }
      expect(seamH / (2 * n), `layer ${layer} tile seam continuity`).toBeLessThan((interiorH / (2 * n)) * 1.6 + 2);
    }
  });

  it("provides a valid 1x1x4 neutral fallback DataArrayTexture for early shader compilation", () => {
    const fb = createTerrainDetailFallback();
    expect(fb).toBeInstanceOf(THREE.DataArrayTexture);
    expect(fb.image.width).toBe(1);
    expect(fb.image.height).toBe(1);
    expect(fb.image.depth).toBe(TERRAIN_DETAIL_LAYERS);
    const bytes = fb.image.data as Uint8Array;
    for (let i = 0; i < TERRAIN_DETAIL_LAYERS; i++) {
      expect([bytes[i * 4], bytes[i * 4 + 1], bytes[i * 4 + 2], bytes[i * 4 + 3]]).toEqual([128, 128, 128, 255]);
    }
    fb.dispose();
  });
});
