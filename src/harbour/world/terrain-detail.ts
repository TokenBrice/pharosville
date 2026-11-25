import * as THREE from "three";

/**
 * Boot-time deterministic procedural 256×256×4 RGBA8 seamless terrain micro-detail atlas (0 KB wire cost).
 *
 * Channel packing per layer (NoColorSpace, RepeatWrapping, mipmapped):
 *   R = tangent normal X * 0.5 + 0.5
 *   G = tangent normal Y * 0.5 + 0.5
 *   B = height ∈ [0..255]
 *   A = micro-cavity AO ∈ [0..255] (255 = exposed crown, low = recessed crack/thatch shadow)
 *
 * Layers:
 *   0: Stratified pale Alexandrian limestone (stepped horizontal bedding shelves + vertical karst fissures)
 *   1: Warm ochre stony earth & embedded rounded limestone pebbles
 *   2: Mediterranean tussock grass (clumped grass tufts + straw grain + deep inter-tuft thatch micro-AO)
 *   3: Pine-needle duff & coastal shingle (interlocking needles / small pebbles + crisp micro-cavity)
 */
export const TERRAIN_DETAIL_SIZE = 256;
export const TERRAIN_DETAIL_LAYERS = 4;

const SIN_BITS = 10;
const SIN_LEN = 1 << SIN_BITS;
const SIN_MASK = SIN_LEN - 1;
const SIN_LUT = new Float32Array(SIN_LEN);
for (let i = 0; i < SIN_LEN; i++) SIN_LUT[i] = Math.sin((i / SIN_LEN) * Math.PI * 2);

/** Fast periodic sine for phase in cycles (`1.0 == 2π`). */
function sinTurns(turns: number): number {
  const scaled = turns * SIN_LEN;
  const idx = Math.floor(scaled);
  const f = scaled - idx;
  const a = SIN_LUT[idx & SIN_MASK];
  return a + (SIN_LUT[(idx + 1) & SIN_MASK] - a) * f;
}

function hash2i(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * Fill `dst` (`size × size`) with tileable 2D value fBM on integer periods `(basePx, basePy)`
 * (powers of two). Precomputes small lattice grids per octave so the inner pixel loop does zero hashes.
 */
function fillPeriodicFbm(
  dst: Float32Array,
  size: number,
  basePx: number,
  octaves: number,
  seed: number,
  basePy = basePx,
): void {
  dst.fill(0);
  const invSize = 1 / size;
  let amp = 1;
  let norm = 0;
  let px = basePx;
  let py = basePy;

  for (let o = 0; o < octaves; o++) {
    const mx = px - 1;
    const my = py - 1;
    const grid = new Float32Array(px * py);
    const oSeed = seed + o * 17;
    for (let gy = 0; gy < py; gy++) {
      const row = gy * px;
      for (let gx = 0; gx < px; gx++) grid[row + gx] = hash2i(gx, gy, oSeed);
    }

    // Precompute X indices and Hermite weights once per octave
    const x0Arr = new Int32Array(size);
    const x1Arr = new Int32Array(size);
    const sxArr = new Float32Array(size);
    for (let x = 0; x < size; x++) {
      const fx = x * invSize * px;
      const ix = Math.floor(fx);
      const t = fx - ix;
      x0Arr[x] = ix & mx;
      x1Arr[x] = (ix + 1) & mx;
      sxArr[x] = t * t * (3 - 2 * t);
    }

    for (let y = 0; y < size; y++) {
      const fy = y * invSize * py;
      const iy = Math.floor(fy);
      const ty = fy - iy;
      const sy = ty * ty * (3 - 2 * ty);
      const r0 = (iy & my) * px;
      const r1 = ((iy + 1) & my) * px;
      const dstRow = y * size;
      for (let x = 0; x < size; x++) {
        const x0 = x0Arr[x];
        const x1 = x1Arr[x];
        const sx = sxArr[x];
        const a = grid[r0 + x0];
        const b = grid[r0 + x1];
        const c = grid[r1 + x0];
        const d = grid[r1 + x1];
        const top = a + (b - a) * sx;
        const bot = c + (d - c) * sx;
        dst[dstRow + x] += amp * (top + (bot - top) * sy);
      }
    }

    norm += amp;
    amp *= 0.5;
    px <<= 1;
    py <<= 1;
  }

  const invNorm = 1 / norm;
  for (let i = 0, len = size * size; i < len; i++) dst[i] *= invNorm;
}

/** Precomputed periodic jittered cell centres for fast O(9) tileable Worley / pebble lookups. */
function makeCellCenters(cells: number, seed: number): Float32Array {
  const out = new Float32Array(cells * cells * 3);
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const i = (cy * cells + cx) * 3;
      out[i] = 0.14 + 0.72 * hash2i(cx, cy, seed);
      out[i + 1] = 0.14 + 0.72 * hash2i(cx, cy, seed + 31);
      out[i + 2] = hash2i(cx, cy, seed + 67);
    }
  }
  return out;
}

/**
 * Fill tileable Worley F1, optional F2, and winning cell ID across `size × size` with zero heap allocations
 * in the inner loop.
 */
function fillWorleyPeriodic(
  outF1: Float32Array,
  outId: Float32Array,
  outF2: Float32Array | null,
  size: number,
  cells: number,
  centers: Float32Array,
): void {
  const mask = cells - 1;
  const scale = cells / size;
  const needF2 = outF2 !== null;

  for (let y = 0; y < size; y++) {
    const gy = y * scale;
    const iy = Math.floor(gy);
    const cyM = ((iy - 1) & mask) * cells;
    const cy0 = (iy & mask) * cells;
    const cyP = ((iy + 1) & mask) * cells;
    const baseY0 = iy - 1 - gy;
    const baseY1 = iy - gy;
    const baseY2 = iy + 1 - gy;
    const dstRow = y * size;

    for (let x = 0; x < size; x++) {
      const gx = x * scale;
      const ix = Math.floor(gx);
      const cxM = (ix - 1) & mask;
      const cx0 = ix & mask;
      const cxP = (ix + 1) & mask;
      const baseX0 = ix - 1 - gx;
      const baseX1 = ix - gx;
      const baseX2 = ix + 1 - gx;

      let f1 = 9;
      let f2 = 9;
      let id = 0;

      // 3×3 periodic neighborhood
      for (let ry = 0; ry < 3; ry++) {
        const rowOff = ry === 0 ? cyM : ry === 1 ? cy0 : cyP;
        const by = ry === 0 ? baseY0 : ry === 1 ? baseY1 : baseY2;
        for (let rx = 0; rx < 3; rx++) {
          const o = (rowOff + (rx === 0 ? cxM : rx === 1 ? cx0 : cxP)) * 3;
          const dx = (rx === 0 ? baseX0 : rx === 1 ? baseX1 : baseX2) + centers[o]!;
          const dy = by + centers[o + 1]!;
          const d = dx * dx + dy * dy;
          if (d < f1) { f2 = f1; f1 = d; id = centers[o + 2]!; } else if (d < f2) { f2 = d; }
        }
      }

      const idx = dstRow + x;
      outF1[idx] = Math.sqrt(f1);
      outId[idx] = id;
      if (needF2) outF2[idx] = Math.sqrt(f2);
    }
  }
}

function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Pack height + cavity fields into RGBA8 with tile-wrapped Sobel tangent normals. */
function packLayer(
  dst: Uint8Array, layer: number, size: number, height: Float32Array, cavity: Float32Array, normalStrength: number,
): void {
  const mask = size - 1;
  const base = layer * size * size * 4;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1) & mask) * size;
    const y0 = y * size;
    const yp = ((y + 1) & mask) * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;
      const gx = (height[ym + xp] + 2 * height[y0 + xp] + height[yp + xp]
                - height[ym + xm] - 2 * height[y0 + xm] - height[yp + xm]) * normalStrength;
      const gy = (height[yp + xm] + 2 * height[yp + x] + height[yp + xp]
                - height[ym + xm] - 2 * height[ym + x] - height[ym + xp]) * normalStrength;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const nx = -gx * inv;
      const ny = -gy * inv;
      const o = base + (y0 + x) * 4;
      dst[o] = Math.round(clamp01(nx * 0.5 + 0.5) * 255);
      dst[o + 1] = Math.round(clamp01(ny * 0.5 + 0.5) * 255);
      dst[o + 2] = Math.round(clamp01(height[y0 + x]) * 255);
      dst[o + 3] = Math.round(clamp01(cavity[y0 + x]) * 255);
    }
  }
}

/** Pure deterministic synthesizer returning packed RGBA8 bytes (`size * size * 4 * 4`). */
export function generateTerrainDetailData(size = TERRAIN_DETAIL_SIZE): Uint8Array {
  const pixels = size * size;
  const data = new Uint8Array(pixels * TERRAIN_DETAIL_LAYERS * 4);
  const h = new Float32Array(pixels);
  const c = new Float32Array(pixels);
  const nA = new Float32Array(pixels);
  const nB = new Float32Array(pixels);
  const nC = new Float32Array(pixels);
  const nD = new Float32Array(pixels);
  const wF1 = new Float32Array(pixels);
  const wF2 = new Float32Array(pixels);
  const wId = new Float32Array(pixels);
  const w2F1 = new Float32Array(pixels);
  const w2Id = new Float32Array(pixels);
  const invSize = 1 / size;

  const rockCells = makeCellCenters(4, 19);
  const pebbleCells = makeCellCenters(16, 101);
  const gritCells = makeCellCenters(32, 211);
  const tuftCells = makeCellCenters(16, 307);
  const shingleCells = makeCellCenters(32, 409);

  // Layer 0: Natural stratified karst limestone (3 asymmetric wavy strata + sparse per-bed staggered rock joints + chalky pitting)
  fillPeriodicFbm(nA, size, 4, 3, 11, 2);
  fillPeriodicFbm(nB, size, 4, 1, 37, 4);
  fillPeriodicFbm(nC, size, 32, 2, 73);
  fillPeriodicFbm(nD, size, 16, 2, 59);
  fillWorleyPeriodic(wF1, wId, wF2, size, 4, rockCells);
  const sizeMask = size - 1;
  const bedShifts = [0, (size * 3) >> 3, (size * 5) >> 3];
  for (let y = 0; y < size; y++) {
    const v = y * invSize;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const idx = row + x;
      const u = x * invSize;
      const warpV = (nA[idx] - 0.5) * 0.24 + 0.042 * sinTurns(u + 0.18) + 0.024 * sinTurns(u * 2.0 - 0.31);
      const vwRaw = v + warpV;
      const vw = vwRaw - Math.floor(vwRaw);

      // 3 asymmetric bedding strata per tile: [0, 0.41), [0.41, 0.68), [0.68, 1.0)
      let bedIdx = 0;
      let bStart = 0.0;
      let bWidth = 0.41;
      if (vw >= 0.68) {
        bedIdx = 2;
        bStart = 0.68;
        bWidth = 0.32;
      } else if (vw >= 0.41) {
        bedIdx = 1;
        bStart = 0.41;
        bWidth = 0.27;
      }
      const bedT = (vw - bStart) / bWidth;
      const distSeam = Math.min(bedT, 1.0 - bedT) * bWidth;
      const bedSeam = 1.0 - smoothstep(0.0, 0.024 + 0.018 * nD[idx], distSeam);
      const bedInterior = smoothstep(0.014, 0.058, distSeam);
      const bedCrown = smoothstep(0.03, 0.24, bedT) * (1.0 - 0.28 * smoothstep(0.76, 1.0, bedT));
      const bedBias = (bedIdx === 0 ? 0.06 : bedIdx === 1 ? -0.05 : 0.02) * bedInterior;

      // Sparse staggered coarse 4-cell Worley rock joints kept only where per-bed field > 0.60, terminating cleanly inside one stratum
      const jx = (x + bedShifts[bedIdx]!) & sizeMask;
      const jIdx = row + jx;
      const bedKeep = smoothstep(0.56, 0.65, nB[jIdx]);
      const jointEdge = 1.0 - smoothstep(0.010, 0.052, wF2[jIdx] - wF1[jIdx]);
      const joint = jointEdge * bedKeep * bedInterior;

      // Subtle low-amplitude sedimentary micro-laminae & chalky karst surface pitting (no harsh dark lines)
      const laminae = (sinTurns((v + warpV * 1.05) * 16.0 + (nD[idx] - 0.5) * 0.45) * 0.5 + 0.5 - 0.5) * 0.06;
      const pit = smoothstep(0.68, 0.90, nC[idx]) * 0.11;
      const grain = (nD[idx] - 0.5) * 0.14;
      const crack = Math.min(1.0, bedSeam * 0.72 + joint * 0.62);

      const shelf = 0.64 + 0.22 * bedCrown + bedBias + laminae + grain - pit;
      h[idx] = clamp01(shelf * (1.0 - 0.64 * crack) + 0.07 * crack);
      c[idx] = clamp01((0.95 - 0.58 * crack - 0.16 * pit) * (0.88 + 0.12 * bedCrown) + (nD[idx] - 0.5) * 0.06);
    }
  }
  packLayer(data, 0, size, h, c, 2.0);

  // Layer 1: Warm ochre stony earth & embedded rounded limestone pebbles
  fillPeriodicFbm(nA, size, 8, 3, 127);
  fillWorleyPeriodic(wF1, wId, null, size, 16, pebbleCells);
  fillWorleyPeriodic(w2F1, w2Id, null, size, 32, gritCells);
  for (let idx = 0; idx < pixels; idx++) {
    const soil = 0.24 + 0.32 * nA[idx];
    const pId = wId[idx];
    const pF1 = wF1[idx];
    const hasPeb = pId > 0.52 ? 1 : 0;
    const pebR = 0.24 + 0.18 * pId;
    const pebDome = hasPeb * (1 - smoothstep(0.0, pebR, pF1));
    const pebProfile = pebDome > 0 ? Math.sqrt(pebDome) : 0;
    const gritDome = (w2Id[idx] > 0.45 ? 1 : 0) * (1 - smoothstep(0.0, 0.28, w2F1[idx])) * 0.24;
    const hv = clamp01(Math.max(soil + gritDome, 0.42 + 0.53 * pebProfile));
    const collar = hasPeb * smoothstep(pebR * 0.72, pebR * 1.05, pF1) * (1 - smoothstep(pebR * 1.05, pebR * 1.45, pF1));
    h[idx] = hv;
    c[idx] = clamp01(0.42 + 0.56 * smoothstep(0.18, 0.85, hv) - 0.28 * collar);
  }
  packLayer(data, 1, size, h, c, 2.1);

  // Layer 2: Mediterranean tussock grass (clumped grass tufts + straw grain + deep inter-tuft thatch AO)
  fillWorleyPeriodic(wF1, wId, null, size, 16, tuftCells);
  fillPeriodicFbm(nA, size, 16, 1, 313);
  fillPeriodicFbm(nB, size, 16, 1, 331);
  fillPeriodicFbm(nC, size, 64, 1, 349);
  for (let y = 0; y < size; y++) {
    const v = y * invSize;
    const v8 = v * 8;
    const v28 = v * 28;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const idx = row + x;
      const u = x * invSize;
      const crown = 1 - smoothstep(0.06, 0.56, wF1[idx]);
      const bladeA = sinTurns(u * 24 + v8 + nA[idx] * 1.4) * 0.5 + 0.5;
      const bladeB = sinTurns(u * 12 - v28 + nB[idx] * 1.4) * 0.5 + 0.5;
      const straw = 0.55 * bladeA + 0.45 * bladeB;
      const fine = nC[idx];
      h[idx] = clamp01(0.16 + 0.46 * crown + 0.24 * straw * (0.45 + 0.55 * crown) + 0.10 * fine);
      c[idx] = clamp01(0.22 + 0.52 * crown + 0.18 * straw * crown + 0.06 * fine);
    }
  }
  packLayer(data, 2, size, h, c, 1.9);

  // Layer 3: Pine-needle duff & coastal shingle (interlocking needles / small pebbles + crisp micro-cavity)
  fillWorleyPeriodic(wF1, wId, wF2, size, 32, shingleCells);
  fillPeriodicFbm(nA, size, 16, 1, 421);
  fillPeriodicFbm(nB, size, 16, 1, 443);
  for (let y = 0; y < size; y++) {
    const v = y * invSize;
    const v16 = v * 16;
    const v32 = v * 32;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const idx = row + x;
      const u = x * invSize;
      const f1 = wF1[idx];
      const shEdge = smoothstep(0.03, 0.20, wF2[idx] - f1);
      const shCrown = (1 - smoothstep(0.0, 0.48, f1)) * (0.45 + 0.55 * wId[idx]);
      const n1 = sinTurns(u * 32 + v16 + nA[idx] * 1.8) * 0.5 + 0.5;
      const n2 = sinTurns(u * 16 - v32 + nB[idx] * 1.8) * 0.5 + 0.5;
      const needles = Math.max(smoothstep(0.55, 0.92, n1), smoothstep(0.55, 0.92, n2));
      h[idx] = clamp01(0.16 + 0.48 * shCrown * shEdge + 0.28 * needles);
      c[idx] = clamp01(0.24 + 0.54 * shEdge * (0.4 + 0.6 * shCrown) + 0.20 * needles);
    }
  }
  packLayer(data, 3, size, h, c, 2.2);

  return data;
}

function makeArrayTex(data: Uint8Array, size: number, mip: boolean): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(data, size, size, TERRAIN_DETAIL_LAYERS);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = mip;
  if (mip) tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Create the GPU-ready `256×256×4` `THREE.DataArrayTexture` micro-detail atlas. */
export function createTerrainDetailAtlas(size = TERRAIN_DETAIL_SIZE): THREE.DataArrayTexture {
  return makeArrayTex(generateTerrainDetailData(size), size, true);
}

/** Tiny 1×1×4 neutral fallback `DataArrayTexture` so shaders compile before the full atlas binds. */
export function createTerrainDetailFallback(): THREE.DataArrayTexture {
  const data = new Uint8Array(TERRAIN_DETAIL_LAYERS * 4).fill(128);
  for (let i = 0; i < TERRAIN_DETAIL_LAYERS; i++) data[i * 4 + 3] = 255;
  return makeArrayTex(data, 1, false);
}
