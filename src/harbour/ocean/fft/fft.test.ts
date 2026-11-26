import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { SWELL_DIR, WAVES } from "../waves";
import { shoalCoordsCpu } from "../shaders/ocean-disp";
import { OCEAN_SURFACE } from "../shaders/surface";
import { buildStockhamTwiddles, FFT_BFLY_FRAG, stockhamIfft2D } from "./butterfly";
import { CPU_FFT_N, CpuFftMirror } from "./cpu-mirror";
import {
  FFT_CASCADE_BANDS,
  FFT_FULLSCREEN_VERT,
  FFT_H0_FRAG,
  FFT_PACK_DISP_FRAG,
  FFT_PACK_SLOPE_FRAG,
  FFT_PATCH_SIZES,
  FFT_SPEC_FRAG,
  FFT_W0_K,
  FftWaveSystem,
} from "./fft-system";
import { dispersionOmega, evaluateSpectrumPsi, FFT_TIME_LOOP_S, gaussRandAt, hashU32 } from "./spectrum";

function makeMockRenderer(hasFloatExt = true) {
  let currentTarget: THREE.WebGLRenderTarget | null = null;
  let currentCubeFace = 0;
  let currentMipLevel = 0;

  const glTexMap = new WeakMap<object, { __webglTexture?: object }>();
  const gl = {
    TEXTURE_2D_ARRAY: 0x8c1a,
    getExtension: vi.fn((name: string) => {
      if (name === "EXT_color_buffer_float") return hasFloatExt ? {} : null;
      if (name === "EXT_color_buffer_half_float") return {};
      return null;
    }),
    generateMipmap: vi.fn(),
  };

  const state = {
    bindTexture: vi.fn(),
    unbindTexture: vi.fn(),
  };

  const properties = {
    get: vi.fn((obj: object) => {
      let entry = glTexMap.get(obj);
      if (!entry) {
        entry = { __webglTexture: { id: "mock-gl-tex" } };
        glTexMap.set(obj, entry);
      }
      return entry;
    }),
  };

  const renderLog: Array<{ target: THREE.WebGLRenderTarget | null; face: number; matName: string }> = [];

  const renderer = {
    autoClear: true,
    getContext: () => gl,
    state,
    properties,
    getRenderTarget: () => currentTarget,
    getActiveCubeFace: () => currentCubeFace,
    getActiveMipmapLevel: () => currentMipLevel,
    setRenderTarget: vi.fn((target: THREE.WebGLRenderTarget | null, face = 0, mip = 0) => {
      currentTarget = target;
      currentCubeFace = face;
      currentMipLevel = mip;
    }),
    render: vi.fn((scene: THREE.Scene) => {
      const mesh = scene.children[0] as THREE.Mesh | undefined;
      const mat = mesh?.material as THREE.ShaderMaterial | undefined;
      renderLog.push({ target: currentTarget, face: currentCubeFace, matName: mat?.name ?? "" });
    }),
  };

  return { renderer: renderer as unknown as THREE.WebGLRenderer, mock: renderer, gl, state, renderLog };
}

describe("Stockham radix-2 2D IFFT (butterfly.ts)", () => {
  it("inverts a 2D DFT impulse to exact complex exponentials (< 1e-5 error)", () => {
    const N = 16;
    const log2N = 4;
    const { twCos, twSin } = buildStockhamTwiddles(log2N);
    const reA = new Float32Array(N * N);
    const imA = new Float32Array(N * N);
    const reB = new Float32Array(N * N);
    const imB = new Float32Array(N * N);

    const m0 = 3;
    const n0 = 11;
    reA[n0 * N + m0] = 1.0;

    const outBuf = stockhamIfft2D(N, log2N, reA, imA, reB, imB, twCos, twSin);
    const outRe = outBuf === 0 ? reA : reB;
    const outIm = outBuf === 0 ? imA : imB;

    let maxErr = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const ang = ((2 * Math.PI) / N) * (m0 * x + n0 * y);
        const expRe = Math.cos(ang);
        const expIm = Math.sin(ang);
        const idx = y * N + x;
        maxErr = Math.max(maxErr, Math.abs(outRe[idx] - expRe), Math.abs(outIm[idx] - expIm));
      }
    }
    expect(maxErr).toBeLessThan(1e-5);
  });

  it("recovers an arbitrary 2D complex signal after forward DFT → Stockham IFFT (< 1e-5 error)", () => {
    const N = 16;
    const log2N = 4;
    const { twCos, twSin } = buildStockhamTwiddles(log2N);

    const origRe = new Float32Array(N * N);
    const origIm = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const h0 = hashU32(i + 17);
      const h1 = hashU32(i + 997);
      origRe[i] = ((h0 >>> 8) / 16777216) * 2 - 1;
      origIm[i] = ((h1 >>> 8) / 16777216) * 2 - 1;
    }

    // Naive forward 2D DFT: F[m,n] = Σ f[x,y] exp(-i 2π (mx + ny) / N)
    const specRe = new Float32Array(N * N);
    const specIm = new Float32Array(N * N);
    for (let n = 0; n < N; n++) {
      for (let m = 0; m < N; m++) {
        let sr = 0;
        let si = 0;
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const ang = ((-2 * Math.PI) / N) * (m * x + n * y);
            const c = Math.cos(ang);
            const s = Math.sin(ang);
            const idx = y * N + x;
            sr += origRe[idx] * c - origIm[idx] * s;
            si += origRe[idx] * s + origIm[idx] * c;
          }
        }
        specRe[n * N + m] = sr;
        specIm[n * N + m] = si;
      }
    }

    const reB = new Float32Array(N * N);
    const imB = new Float32Array(N * N);
    const outBuf = stockhamIfft2D(N, log2N, specRe, specIm, reB, imB, twCos, twSin);
    const outRe = outBuf === 0 ? specRe : reB;
    const outIm = outBuf === 0 ? specIm : imB;

    const invN2 = 1 / (N * N);
    let maxErr = 0;
    for (let i = 0; i < N * N; i++) {
      maxErr = Math.max(maxErr, Math.abs(outRe[i] * invN2 - origRe[i]), Math.abs(outIm[i] * invN2 - origIm[i]));
    }
    expect(maxErr).toBeLessThan(1e-5);
  });

  it("packs 2 real Hermitian fields into 1 complex channel with exact Gerstner crest-pinching sign", () => {
    // Single cosine wave y(x) = cos(k0 * x): crest at x = 0, trough at x = L / 2
    const N = 16;
    const log2N = 4;
    const L = 16;
    const dk = (2 * Math.PI) / L;
    const k0 = dk; // m = 1 and m = N - 1
    const { twCos, twSin } = buildStockhamTwiddles(log2N);

    // Channel c0 = A_dy + i * A_dx, where A_dy = H, A_dx = +i * (kx / |k|) * H
    const reA = new Float32Array(N * N);
    const imA = new Float32Array(N * N);
    const reB = new Float32Array(N * N);
    const imB = new Float32Array(N * N);

    // H(+k0) = 0.5, H(-k0) = 0.5; packComplex(H, +i * sign(kx) * H) = H * (1 - sign(kx))
    reA[1] = 0.5 * (1 - 1); // +k0
    reA[N - 1] = 0.5 * (1 - -1); // -k0

    const out0 = stockhamIfft2D(N, log2N, reA, imA, reB, imB, twCos, twSin);
    const dyBuf = out0 === 0 ? reA : reB;
    const dxBuf = out0 === 0 ? imA : imB;

    // Also verify A_dxx = -(kx^2 / |k|) * H produces negative dxx at crest x = 0 (J_det < 1)
    const dxxRe = new Float32Array(N * N);
    const dxxIm = new Float32Array(N * N);
    dxxRe[1] = -k0 * 0.5;
    dxxRe[N - 1] = -k0 * 0.5;
    const out1 = stockhamIfft2D(N, log2N, dxxRe, dxxIm, reB, imB, twCos, twSin);
    const dxxBuf = out1 === 0 ? dxxRe : reB;

    for (let x = 0; x < N; x++) {
      const X = (x / N) * L;
      expect(dyBuf[x]).toBeCloseTo(Math.cos(k0 * X), 5);
      expect(dxBuf[x]).toBeCloseTo(-Math.sin(k0 * X), 5);
      expect(dxxBuf[x]).toBeCloseTo(-k0 * Math.cos(k0 * X), 5);
    }

    // At crest x = 0: J_det = 1 + chop * dxx < 1 and convergence -(dxx) > 0
    const chop = 0.8;
    const jCrest = 1.0 + chop * dxxBuf[0];
    const jTrough = 1.0 + chop * dxxBuf[N / 2];
    expect(jCrest).toBeLessThan(1.0);
    expect(jTrough).toBeGreaterThan(1.0);
    expect(-dxxBuf[0]).toBeGreaterThan(0);
  });
});

describe("JONSWAP spectrum & WAVES[0] notch (spectrum.ts)", () => {
  it("exports mutually coprime patch sizes and matches WAVES[0] wavenumber", () => {
    expect(FFT_PATCH_SIZES).toEqual([509, 97, 17.3]);
    expect(FFT_W0_K).toBeCloseTo(WAVES[0].k, 12);
    expect(dispersionOmega(FFT_W0_K)).toBeCloseTo(WAVES[0].w, 5);
  });

  it("concentrates directional energy downwind and notches WAVES[0] on C0 without zeroing neighbours", () => {
    const [bLo, bHi] = FFT_CASCADE_BANDS[0];
    const kNyq = (Math.PI * 256) / FFT_PATCH_SIZES[0];
    const windSpeed = 12;
    const wx = SWELL_DIR[0];
    const wz = SWELL_DIR[1];

    // Downwind vs upwind at peak swell wavenumber away from notch
    const kTest = 0.065;
    const psiDown = evaluateSpectrumPsi(kTest * wx, kTest * wz, windSpeed, wx, wz, bLo, bHi, kNyq, 1.0);
    const psiUp = evaluateSpectrumPsi(-kTest * wx, -kTest * wz, windSpeed, wx, wz, bLo, bHi, kNyq, 1.0);
    expect(psiDown).toBeGreaterThan(0);
    expect(psiDown).toBeGreaterThan(psiUp * 5);

    // Soft Gaussian notch at (FFT_W0_K, SWELL_DIR) suppresses ~88% of energy on C0
    const k0x = FFT_W0_K * wx;
    const k0z = FFT_W0_K * wz;
    const psiUnnotched = evaluateSpectrumPsi(k0x, k0z, windSpeed, wx, wz, bLo, bHi, kNyq, 0.0);
    const psiNotched = evaluateSpectrumPsi(k0x, k0z, windSpeed, wx, wz, bLo, bHi, kNyq, 1.0);
    expect(psiUnnotched).toBeGreaterThan(0);
    expect(psiNotched / psiUnnotched).toBeCloseTo(0.12, 2);

    // Zero at DC and finite/zero past Nyquist
    expect(evaluateSpectrumPsi(0, 0, windSpeed, wx, wz, bLo, bHi, kNyq, 1.0)).toBe(0);
    expect(evaluateSpectrumPsi(kNyq * 1.1, 0, windSpeed, wx, wz, bLo, bHi, kNyq, 0.0)).toBe(0);

    // Strictly complementary cascade crossover bands: C0/C1 at 0.50 and C1/C2 at 3.0 sum to 1.000
    const sstep = (e0: number, e1: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    for (const [a, b] of [[0, 1], [1, 2]] as const) {
      const bEdge = FFT_CASCADE_BANDS[a][1];
      expect(FFT_CASCADE_BANDS[b][0]).toBe(bEdge);
      for (const k of [bEdge * 0.85, bEdge * 0.92, bEdge, bEdge * 1.08, bEdge * 1.15]) {
        const wA = 1 - sstep(bEdge * 0.85, bEdge * 1.15, k);
        const wB = sstep(bEdge * 0.85, bEdge * 1.15, k);
        expect(wA + wB).toBeCloseTo(1.0, 12);
      }
    }
  });

  it("produces deterministic, finite zero-mean Gaussians from hashU32 / gaussRandAt", () => {
    const a: [number, number] = [0, 0];
    const b: [number, number] = [0, 0];
    gaussRandAt(7, -13, 0x13579bdf, a);
    gaussRandAt(7, -13, 0x13579bdf, b);
    expect(a).toEqual(b);

    let sumR = 0;
    let sumSq = 0;
    let count = 0;
    for (let z = -16; z < 16; z++) {
      for (let x = -16; x < 16; x++) {
        gaussRandAt(x, z, 0x13579bdf, a);
        expect(Number.isFinite(a[0])).toBe(true);
        expect(Number.isFinite(a[1])).toBe(true);
        sumR += a[0] + a[1];
        sumSq += a[0] * a[0] + a[1] * a[1];
        count += 2;
      }
    }
    const mean = sumR / count;
    const variance = sumSq / count - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.1);
    expect(variance).toBeGreaterThan(0.8);
    expect(variance).toBeLessThan(1.2);
  });
});

describe("CPU 64² Buoyancy Mirror (cpu-mirror.ts)", () => {
  it("returns 0 when inactive or seaAmp = 0, and bounded periodic heights scaling with seaAmp", () => {
    const mirror = new CpuFftMirror();
    expect(mirror.size).toBe(CPU_FFT_N);
    expect(mirror.heightAt(10, 20)).toBe(0);

    mirror.setActive(true);
    mirror.update(1.25, 11, SWELL_DIR[0], SWELL_DIR[1], 0, 0.55);
    expect(mirror.heightAt(10, 20)).toBe(0);

    mirror.update(1.25, 11, SWELL_DIR[0], SWELL_DIR[1], 0.24, 0.55);
    const hMod = mirror.heightAt(42.5, -18.3);
    expect(Number.isFinite(hMod)).toBe(true);

    // Exact 509 m spatial periodicity
    expect(mirror.heightAt(42.5 + FFT_PATCH_SIZES[0], -18.3 - FFT_PATCH_SIZES[0])).toBeCloseTo(hMod, 5);

    // RMS scales linearly with seaAmp (at chop = 0 to isolate pure vertical linearity)
    const sampleRms = (amp: number) => {
      mirror.update(2.5, 12, SWELL_DIR[0], SWELL_DIR[1], amp, 0.0);
      let s2 = 0;
      const n = 32;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const h = mirror.heightAt((i / n) * FFT_PATCH_SIZES[0], (j / n) * FFT_PATCH_SIZES[0]);
          expect(Number.isFinite(h)).toBe(true);
          expect(Math.abs(h)).toBeLessThan(8.0);
          s2 += h * h;
        }
      }
      return Math.sqrt(s2 / (n * n));
    };

    const rmsLow = sampleRms(0.25);
    const rmsHigh = sampleRms(0.75);
    expect(rmsLow).toBeGreaterThan(0.02);
    expect(rmsHigh / rmsLow).toBeCloseTo(3.0, 4);

    // Deactivating resets heightAt to 0 immediately
    mirror.setActive(false);
    expect(mirror.heightAt(42.5, -18.3)).toBe(0);
  });

  it("inverts horizontal displacement via 2-step Newton iteration accurately", () => {
    const mirror = new CpuFftMirror();
    mirror.setActive(true);
    mirror.update(4.2, 13, SWELL_DIR[0], SWELL_DIR[1], 0.85, 0.9);

    const raw: [number, number, number] = [0, 0, 0];
    let newtonErrSum = 0;
    let uninvertedErrSum = 0;
    const samples = 25;
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 5; i++) {
        const x0 = 31 + i * 87;
        const z0 = -45 + j * 93;
        mirror.sampleRawDisplacement(x0, z0, raw);
        const displacedX = x0 + raw[0];
        const displacedZ = z0 + raw[2];
        const expectedY = raw[1];

        const invY = mirror.heightAt(displacedX, displacedZ);
        mirror.sampleRawDisplacement(displacedX, displacedZ, raw);
        const naiveY = raw[1];

        newtonErrSum += Math.abs(invY - expectedY);
        uninvertedErrSum += Math.abs(naiveY - expectedY);
      }
    }
    expect(newtonErrSum / samples).toBeLessThan(0.03);
    expect(newtonErrSum).toBeLessThan(uninvertedErrSum);
  });

  it("matches GPU hardware texel-centre sampling for shared C0 modes with < 0.01 m phase error on both 256² and 128²", () => {
    const L = FFT_PATCH_SIZES[0];
    const m = 3;
    const n = 2;
    const kx = (2 * Math.PI * m) / L;
    const kz = (2 * Math.PI * n) / L;

    for (const gpuN of [256, 128] as const) {
      const mirror = new CpuFftMirror();
      mirror.setGpuResolution(gpuN);
      mirror.setActive(true);
      mirror.update(0, 10, SWELL_DIR[0], SWELL_DIR[1], 0.5, 0.0);

      // Populate CPU dispY with exact IFFT of single shared mode cos(kx * x_i + kz * z_j)
      const dispY = (mirror as unknown as { dispY: Float32Array; isZero: boolean }).dispY;
      for (let j = 0; j < CPU_FFT_N; j++) {
        for (let i = 0; i < CPU_FFT_N; i++) {
          dispY[j * CPU_FFT_N + i] = Math.cos(kx * (i / CPU_FFT_N) * L + kz * (j / CPU_FFT_N) * L);
        }
      }
      // Build GPU N×N texture containing the exact same single Fourier mode at texel i -> phase i/gpuN
      const gpuGrid = new Float32Array(gpuN * gpuN);
      for (let j = 0; j < gpuN; j++) {
        for (let i = 0; i < gpuN; i++) {
          gpuGrid[j * gpuN + i] = Math.cos(kx * (i / gpuN) * L + kz * (j / gpuN) * L);
        }
      }
      const sampleGpuLinear = (wx: number, wz: number) => {
        const u = wx / L;
        const v = wz / L;
        let fx = (u - Math.floor(u)) * gpuN - 0.5;
        let fz = (v - Math.floor(v)) * gpuN - 0.5;
        if (fx < 0) fx += gpuN;
        if (fz < 0) fz += gpuN;
        const i0 = Math.floor(fx), j0 = Math.floor(fz);
        const tx = fx - i0, tz = fz - j0;
        const x0 = i0 & (gpuN - 1), x1 = (x0 + 1) & (gpuN - 1);
        const y0 = j0 & (gpuN - 1), y1 = (y0 + 1) & (gpuN - 1);
        const a = gpuGrid[y0 * gpuN + x0] * (1 - tx) + gpuGrid[y0 * gpuN + x1] * tx;
        const b = gpuGrid[y1 * gpuN + x0] * (1 - tx) + gpuGrid[y1 * gpuN + x1] * tx;
        return a * (1 - tz) + b * tz;
      };

      const raw: [number, number, number] = [0, 0, 0];
      // Exact phase lock at CPU grid nodes mapped to GPU texel centres (zero 2.98 m half-texel shift!)
      let nodeErr = 0;
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
          const wx = ((i * 8) / CPU_FFT_N + 0.5 / gpuN) * L;
          const wz = ((j * 8) / CPU_FFT_N + 0.5 / gpuN) * L;
          mirror.sampleRawDisplacement(wx, wz, raw);
          nodeErr = Math.max(nodeErr, Math.abs(raw[1] - sampleGpuLinear(wx, wz)));
        }
      }
      expect(nodeErr, `node phase lock gpuN=${gpuN}`).toBeLessThan(1e-4);

      // Arbitrary off-grid points stay strictly within bilinear interpolation sagitta (< 0.016 vs > 0.18 with 2.98 m shift)
      let maxErr = 0;
      for (let s = 0; s < 24; s++) {
        const wx = -211.3 + s * 37.9;
        const wz = 143.7 - s * 29.1;
        mirror.sampleRawDisplacement(wx, wz, raw);
        maxErr = Math.max(maxErr, Math.abs(raw[1] - sampleGpuLinear(wx, wz)));
      }
      expect(maxErr, `gpuN=${gpuN}`).toBeLessThan(0.016);

      // Periodic 3600 s time wrap preserves continuity cleanly
      mirror.update(12.5, 10, SWELL_DIR[0], SWELL_DIR[1], 0.4, 0.5);
      const hA = mirror.heightAt(37, -51);
      mirror.update(12.5 + FFT_TIME_LOOP_S, 10, SWELL_DIR[0], SWELL_DIR[1], 0.4, 0.5);
      expect(mirror.heightAt(37, -51)).toBeCloseTo(hA, 5);
    }
  });

  it("keeps the 2D shoaling coordinate transform strictly positive-Jacobian (non-folding) for every depth, coast distance, and swell angle", () => {
    const eps = 0.05;
    const p0: [number, number, number] = [0, 0, 0];
    const px: [number, number, number] = [0, 0, 0];
    const pz: [number, number, number] = [0, 0, 0];
    let minDet = Infinity;
    for (const depth of [0.1, 0.5, 1.5, 2.5, 3.5, 8.0]) {
      for (let angIdx = 0; angIdx < 16; angIdx++) {
        const ang = (angIdx / 16) * Math.PI * 2;
        const snx = Math.cos(ang);
        const snz = Math.sin(ang);
        for (let coast = -1.0; coast <= 58.0; coast += 0.5) {
          // Local shoreline plane: coast(x, z) = coast0 + dot((x, z), shoreN)
          shoalCoordsCpu(0, 0, depth, coast, snx, snz, p0);
          shoalCoordsCpu(eps, 0, depth, coast + eps * snx, snx, snz, px);
          shoalCoordsCpu(0, eps, depth, coast + eps * snz, snx, snz, pz);
          const jxx = (px[0] - p0[0]) / eps;
          const jxz = (pz[0] - p0[0]) / eps;
          const jzx = (px[1] - p0[1]) / eps;
          const jzz = (pz[1] - p0[1]) / eps;
          const det = jxx * jzz - jxz * jzx;
          if (det < minDet) minDet = det;
        }
      }
    }
    expect(minDet).toBeGreaterThan(0.25);

    // Fine 0.01 m continuity sweep across the near-shore ramp-in (specifically covering 0.260 -> 0.270 m at depth 1 m)
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [0, 0, 0];
    shoalCoordsCpu(0.26, 0, 1.0, 0.26, 1, 0, a);
    shoalCoordsCpu(0.27, 0, 1.0, 0.27, 1, 0, b);
    expect(b[0]).toBeGreaterThan(a[0]);
    expect((b[0] - a[0]) / 0.01).toBeGreaterThan(0.5);
    for (let c = -0.5; c <= 2.0; c += 0.01) {
      shoalCoordsCpu(c, 0, 1.0, c, 1, 0, a);
      shoalCoordsCpu(c + 0.01, 0, 1.0, c + 0.01, 1, 0, b);
      expect((b[0] - a[0]) / 0.01, `coast=${c.toFixed(2)}`).toBeGreaterThan(0.3);
    }

    // Saddle-gradient continuity: fragment shader must share hbShoreNormal's smoothstep(0.002, 0.008, gl) fade
    // so crossing gl = 1e-4 at coast = 14 m, depth = 1 m produces zero offset jump on either side.
    expect(OCEAN_SURFACE).toContain("hbShoreNormal(uSdf, suv, coast, inside)");
    expect(OCEAN_SURFACE).not.toContain("shoreN = sg / sgL");
    const prev: [number, number, number] = [0, 0, 0];
    const curr: [number, number, number] = [0, 0, 0];
    const evalFaded = (gl: number, out: [number, number, number]) => {
      const f = THREE.MathUtils.smoothstep(gl, 0.002, 0.008);
      shoalCoordsCpu(14, 0, 1.0, 14, gl > 1e-4 ? f : 0, 0, out);
    };
    evalFaded(0.00005, prev);
    evalFaded(0.00015, curr);
    expect(prev[0]).toBe(14);
    expect(curr[0]).toBe(14);
    expect(curr[1]).toBe(0);
    for (let gl = 0; gl <= 0.012; gl += 0.0002) {
      evalFaded(gl, prev);
      evalFaded(gl + 0.0002, curr);
      expect(Math.hypot(curr[0] - prev[0], curr[1] - prev[1])).toBeLessThan(0.25);
    }
  });
});

describe("FftWaveSystem WebGL2 contracts (index.ts)", () => {
  it("starts on Low with 0 RTs and 1×1×6 zero/J=1 fallback, allocates on High/Medium, and disposes cleanly on Low", () => {
    const fft = new FftWaveSystem();
    const fallback = fft.uniforms.uFftAtlas.value;
    expect(fft.tier).toBe("low");
    expect(fft.uniforms.uFftOn.value).toBe(0);
    expect(fft.atlasTarget).toBeNull();
    expect(fft.workTargets.h0).toBeNull();
    expect(fallback).toBeInstanceOf(THREE.DataArrayTexture);
    expect(fallback.image.depth).toBe(6);
    expect(fft.heightAt(0, 0)).toBe(0);

    // High tier -> 256² C0/C1 + 128² C2 (§5.1) + 6-layer RGBA16F WebGLArrayRenderTarget with generateMipmaps: false
    fft.setTier("high");
    expect(fft.resolution).toBe(256);
    expect(fft.c2Resolution).toBe(128);
    expect(fft.uniforms.uFftOn.value).toBe(1);
    const atlasHigh = fft.atlasTarget!;
    expect(atlasHigh).toBeInstanceOf(THREE.WebGLArrayRenderTarget);
    expect([atlasHigh.width, atlasHigh.height, atlasHigh.depth]).toEqual([256, 256, 6]);
    expect(atlasHigh.texture.type).toBe(THREE.HalfFloatType);
    expect(atlasHigh.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(atlasHigh.texture.magFilter).toBe(THREE.LinearFilter);
    expect(atlasHigh.texture.generateMipmaps).toBe(false);
    expect(fft.uniforms.uFftAtlas.value).toBe(atlasHigh.texture);
    expect(fft.workTargets.ping!.textures).toHaveLength(2);
    expect(fft.workTargets.pong!.textures).toHaveLength(2);
    expect(fft.workTargets.h0).toHaveLength(3);
    expect(fft.workTargets.h0![0].width).toBe(256);
    expect(fft.workTargets.h0![1].width).toBe(256);
    expect(fft.workTargets.h0![2].width).toBe(128);

    // Medium tier -> 128²
    fft.setTier("medium");
    expect(fft.resolution).toBe(128);
    expect(fft.atlasTarget!.width).toBe(128);
    expect(fft.atlasTarget!.depth).toBe(6);

    // Downgrade to Low restores fallback BEFORE disposing atlas RT
    const medAtlas = fft.atlasTarget!;
    let fallbackRestoredBeforeDispose = false;
    const onDispose = vi.fn(() => {
      fallbackRestoredBeforeDispose = fft.uniforms.uFftAtlas.value === fallback;
    });
    medAtlas.addEventListener("dispose", onDispose);
    fft.setTier("low");
    expect(onDispose).toHaveBeenCalledOnce();
    expect(fallbackRestoredBeforeDispose).toBe(true);
    expect(fft.uniforms.uFftOn.value).toBe(0);
    expect(fft.atlasTarget).toBeNull();
    expect(fft.workTargets.h0).toBeNull();
    expect(fft.workTargets.ping).toBeNull();
    expect(fft.workTargets.pong).toBeNull();

    fft.dispose();
  });

  it("probes EXT_color_buffer_float once and automatically falls back to HalfFloatType when unavailable", () => {
    const fftNoFloat = new FftWaveSystem();
    fftNoFloat.setTier("high");
    expect(fftNoFloat.workType).toBe(THREE.FloatType);

    const { renderer, gl } = makeMockRenderer(false);
    fftNoFloat.update(renderer, 1.0, 10, SWELL_DIR[0], SWELL_DIR[1], 0.24, 0.55);

    expect(gl.getExtension).toHaveBeenCalledWith("EXT_color_buffer_float");
    expect(gl.getExtension).toHaveBeenCalledWith("EXT_color_buffer_half_float");
    expect(fftNoFloat.workType).toBe(THREE.HalfFloatType);
    expect(fftNoFloat.workTargets.ping!.textures[0].type).toBe(THREE.HalfFloatType);
    expect(fftNoFloat.workTargets.h0![0].texture.type).toBe(THREE.HalfFloatType);
    fftNoFloat.dispose();

    const fftFloat = new FftWaveSystem();
    fftFloat.setTier("high");
    const env2 = makeMockRenderer(true);
    fftFloat.update(env2.renderer, 1.0, 10, SWELL_DIR[0], SWELL_DIR[1], 0.24, 0.55);
    expect(fftFloat.workType).toBe(THREE.FloatType);
    expect(fftFloat.workTargets.ping!.textures[0].type).toBe(THREE.FloatType);
    fftFloat.dispose();
  });

  it("caches h0 across constant wind, staggers C1/C2 on Medium, emits ONE manual mipmap, and restores renderer state", () => {
    const fft = new FftWaveSystem();
    fft.setTier("medium");
    const { renderer, mock, gl, state, renderLog } = makeMockRenderer(true);

    const prevRT = new THREE.WebGLRenderTarget(16, 16);
    mock.setRenderTarget(prevRT, 2, 1);
    mock.autoClear = true;
    mock.setRenderTarget.mockClear();

    // Frame 0 on Medium: bakes h0 once, updates all 3 cascades [0, 1, 2], 1 manual mipmap
    fft.update(renderer, 0.5, 10, SWELL_DIR[0], SWELL_DIR[1], 0.24, 0.55);
    expect(fft.h0BakeCount).toBe(1);
    expect(fft.lastCascadesUpdated).toEqual([0, 1, 2]);
    expect(gl.generateMipmap).toHaveBeenCalledTimes(1);
    expect(gl.generateMipmap).toHaveBeenCalledWith(gl.TEXTURE_2D_ARRAY);
    expect(state.bindTexture).toHaveBeenCalledTimes(1);
    expect(state.unbindTexture).toHaveBeenCalledTimes(1);
    expect(mock.getRenderTarget()).toBe(prevRT);
    expect(mock.getActiveCubeFace()).toBe(2);
    expect(mock.getActiveMipmapLevel()).toBe(1);
    expect(mock.autoClear).toBe(true);

    // Verify all 4 profiler material names were rendered
    const matNames = new Set(renderLog.map((e) => e.matName));
    expect(matNames).toEqual(new Set(["hb_fft_h0", "hb_fft_spec", "hb_fft_bfly", "hb_fft_pack"]));

    // Frame 1 (frameCounter = 1, odd): no h0 rebake, staggers [0, 2]
    gl.generateMipmap.mockClear();
    fft.update(renderer, 0.6, 10, SWELL_DIR[0], SWELL_DIR[1], 0.5, 0.7);
    expect(fft.h0BakeCount).toBe(1);
    expect(fft.lastCascadesUpdated).toEqual([0, 2]);
    expect(gl.generateMipmap).toHaveBeenCalledTimes(1);

    // Frame 2 (frameCounter = 2, even): no h0 rebake, staggers [0, 1]
    gl.generateMipmap.mockClear();
    fft.update(renderer, 0.7, 10, SWELL_DIR[0], SWELL_DIR[1], 0.5, 0.7);
    expect(fft.h0BakeCount).toBe(1);
    expect(fft.lastCascadesUpdated).toEqual([0, 1]);
    expect(gl.generateMipmap).toHaveBeenCalledTimes(1);

    // Wind change triggers h0 rebake + full 3-cascade update
    fft.update(renderer, 0.8, 15, SWELL_DIR[0], SWELL_DIR[1], 0.5, 0.7);
    expect(fft.h0BakeCount).toBe(2);
    expect(fft.lastCascadesUpdated).toEqual([0, 1, 2]);

    // High tier updates all 3 cascades every frame
    fft.setTier("high");
    fft.update(renderer, 0.9, 15, SWELL_DIR[0], SWELL_DIR[1], 0.5, 0.7);
    expect(fft.lastCascadesUpdated).toEqual([0, 1, 2]);
    fft.update(renderer, 1.0, 15, SWELL_DIR[0], SWELL_DIR[1], 0.5, 0.7);
    expect(fft.lastCascadesUpdated).toEqual([0, 1, 2]);

    // Renderer state still restored on render throw
    mock.render.mockImplementationOnce(() => {
      throw new Error("fft gpu failure");
    });
    expect(() => fft.update(renderer, 1.1, 15, SWELL_DIR[0], SWELL_DIR[1], 0.5, 0.7)).toThrow("fft gpu failure");
    expect(mock.getRenderTarget()).toBe(prevRT);
    expect(mock.getActiveCubeFace()).toBe(2);
    expect(mock.getActiveMipmapLevel()).toBe(1);
    expect(mock.autoClear).toBe(true);

    prevRT.dispose();
    fft.dispose();
  });

  it("exposes stall-free preparationEntries with GLSL3 shaders and satisfies B07/C04 GLSL arithmetic rules", () => {
    const fft = new FftWaveSystem();
    const entries = fft.preparationEntries();
    expect(entries).toHaveLength(5);

    const names = entries.map((e) => ((e.root as THREE.Mesh).material as THREE.ShaderMaterial).name);
    expect(names).toEqual(["hb_fft_h0", "hb_fft_spec", "hb_fft_bfly", "hb_fft_pack", "hb_fft_pack"]);
    for (const e of entries) {
      const mat = (e.root as THREE.Mesh).material as THREE.ShaderMaterial;
      expect(mat.glslVersion).toBe(THREE.GLSL3);
      const t = e.target();
      expect(t).not.toBeNull();
      expect([t!.width, t!.height]).toEqual([1, 1]);
    }
    // MRT entries target 2-attachment compilation RTs
    expect(entries[1].target()!.textures).toHaveLength(2);
    expect(entries[2].target()!.textures).toHaveLength(2);

    // Exported shader strings are non-empty GLSL3 sources
    for (const src of [FFT_FULLSCREEN_VERT, FFT_H0_FRAG, FFT_SPEC_FRAG, FFT_BFLY_FRAG, FFT_PACK_DISP_FRAG, FFT_PACK_SLOPE_FRAG]) {
      expect(src.trim().length).toBeGreaterThan(20);
    }

    // B07 / C04 arithmetic guard across all GLSL-bearing FFT source files
    for (const file of ["spectrum.ts", "butterfly.ts", "pack.ts"]) {
      const src = readFileSync(resolve(__dirname, file), "utf8");
      // No pow(x, 2.0)
      expect(src).not.toMatch(/(?<![\w.])pow\s*\([^,]+,\s*2(\.0*)?\s*\)/);
      // No descending literal smoothstep(hi, lo, x)
      for (const m of src.matchAll(/(?<![\w.])smoothstep\s*\(\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*,/g)) {
        expect(Number(m[1]), `${file}: smoothstep(${m[1]}, ${m[2]}, ...)`).toBeLessThan(Number(m[2]));
      }
    }

    fft.dispose();
  });
});
