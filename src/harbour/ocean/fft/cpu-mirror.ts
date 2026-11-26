import { SWELL_DIR } from "../waves";
import { buildStockhamTwiddles, stockhamIfft2D } from "./butterfly";
import {
  dispersionOmega,
  evaluateSpectrumPsi,
  FFT_CASCADE_BANDS,
  FFT_CASCADE_SEEDS,
  FFT_PATCH_SIZES,
  FFT_TIME_LOOP_S,
  gaussRandAt,
} from "./spectrum";

/**
 * Zero-allocation 64×64 CPU C0 (509 m) FFT buoyancy mirror (Phase 2 Workstream A, §5.1).
 *
 * Uses the exact same bit-exact wavenumber hash (`hashU32`), JONSWAP directional spectrum,
 * `WAVES[0]` soft notch, and Stockham radix-2 IFFT as GPU cascade C0, plus 2-step fixed-point
 * Newton horizontal-displacement inversion so all 560 boats heave, pitch, and roll in phase lock
 * with the live GPU FFT swells.
 *
 * All working `Float32Array` buffers and twiddle tables are pre-allocated in the constructor
 * (zero per-frame heap allocations in `update()` or `heightAt()`).
 */
export const CPU_FFT_N = 64;
const CPU_FFT_LOG2 = 6;
const CPU_FFT_MASK = CPU_FFT_N - 1;
const CPU_FFT_COUNT = CPU_FFT_N * CPU_FFT_N;
const C0_PATCH = FFT_PATCH_SIZES[0];
const INV_C0_PATCH = 1.0 / C0_PATCH;

export class CpuFftMirror {
  readonly size = CPU_FFT_N;
  readonly patchSize = C0_PATCH;

  private active = false;
  private isZero = true;
  private h0Baked = false;
  private gpuN = 256;
  private lastWindSpeed = NaN;
  private lastWindDirX = NaN;
  private lastWindDirZ = NaN;

  // Time-invariant precomputed tables (allocated once)
  private readonly omega = new Float32Array(CPU_FFT_COUNT);
  private readonly kxNorm = new Float32Array(CPU_FFT_COUNT);
  private readonly kzNorm = new Float32Array(CPU_FFT_COUNT);
  private readonly h0Re = new Float32Array(CPU_FFT_COUNT);
  private readonly h0Im = new Float32Array(CPU_FFT_COUNT);
  private readonly h0NegConjRe = new Float32Array(CPU_FFT_COUNT);
  private readonly h0NegConjIm = new Float32Array(CPU_FFT_COUNT);
  private readonly twCos: Float32Array;
  private readonly twSin: Float32Array;

  // Ping-pong Stockham buffers: z0 = dy + i*dx, z1 = dz + i*0
  private readonly re0A = new Float32Array(CPU_FFT_COUNT);
  private readonly im0A = new Float32Array(CPU_FFT_COUNT);
  private readonly re0B = new Float32Array(CPU_FFT_COUNT);
  private readonly im0B = new Float32Array(CPU_FFT_COUNT);
  private readonly re1A = new Float32Array(CPU_FFT_COUNT);
  private readonly im1A = new Float32Array(CPU_FFT_COUNT);
  private readonly re1B = new Float32Array(CPU_FFT_COUNT);
  private readonly im1B = new Float32Array(CPU_FFT_COUNT);

  // Spatial displacement fields (metres)
  private readonly dispY = new Float32Array(CPU_FFT_COUNT);
  private readonly dispX = new Float32Array(CPU_FFT_COUNT);
  private readonly dispZ = new Float32Array(CPU_FFT_COUNT);

  private readonly gaussScratch: [number, number] = [0, 0];

  constructor() {
    const { twCos, twSin } = buildStockhamTwiddles(CPU_FFT_LOG2);
    this.twCos = twCos;
    this.twSin = twSin;

    const half = CPU_FFT_N >> 1;
    const dk = (2.0 * Math.PI) / C0_PATCH;
    for (let n = 0; n < CPU_FFT_N; n++) {
      const kzi = n < half ? n : n - CPU_FFT_N;
      const kz = kzi * dk;
      const row = n * CPU_FFT_N;
      for (let m = 0; m < CPU_FFT_N; m++) {
        const kxi = m < half ? m : m - CPU_FFT_N;
        const kx = kxi * dk;
        const idx = row + m;
        const k = Math.hypot(kx, kz);
        if (k > 1e-6 && kxi !== -half && kzi !== -half) {
          const wBase = (2.0 * Math.PI) / FFT_TIME_LOOP_S;
          this.omega[idx] = Math.max(Math.floor(dispersionOmega(k) / wBase + 0.5), 1.0) * wBase;
          this.kxNorm[idx] = kx / k;
          this.kzNorm[idx] = kz / k;
        }
      }
    }
  }

  setGpuResolution(size: number): void {
    this.gpuN = size > 0 ? size : 256;
  }

  get isActive(): boolean {
    return this.active;
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.isZero = true;
      this.dispY.fill(0);
      this.dispX.fill(0);
      this.dispZ.fill(0);
    }
  }

  private bakeH0(windSpeed: number, windDirX: number, windDirZ: number): void {
    const half = CPU_FFT_N >> 1;
    const dk = (2.0 * Math.PI) / C0_PATCH;
    const kNyq = (Math.PI * CPU_FFT_N) / C0_PATCH;
    const [bandLow, bandHigh] = FFT_CASCADE_BANDS[0];
    const seed = FFT_CASCADE_SEEDS[0];
    const g = this.gaussScratch;

    for (let n = 0; n < CPU_FFT_N; n++) {
      const kzi = n < half ? n : n - CPU_FFT_N;
      const row = n * CPU_FFT_N;
      for (let m = 0; m < CPU_FFT_N; m++) {
        const kxi = m < half ? m : m - CPU_FFT_N;
        const idx = row + m;
        if ((kxi === 0 && kzi === 0) || kxi === -half || kzi === -half) {
          this.h0Re[idx] = 0;
          this.h0Im[idx] = 0;
          this.h0NegConjRe[idx] = 0;
          this.h0NegConjIm[idx] = 0;
          continue;
        }
        const kx = kxi * dk;
        const kz = kzi * dk;

        const psiPos = evaluateSpectrumPsi(kx, kz, windSpeed, windDirX, windDirZ, bandLow, bandHigh, kNyq, 1.0);
        const ampPos = 0.5 * Math.sqrt(psiPos * dk * dk);
        gaussRandAt(kxi, kzi, seed, g);
        this.h0Re[idx] = g[0] * ampPos;
        this.h0Im[idx] = g[1] * ampPos;

        const psiNeg = evaluateSpectrumPsi(-kx, -kz, windSpeed, windDirX, windDirZ, bandLow, bandHigh, kNyq, 1.0);
        const ampNeg = 0.5 * Math.sqrt(psiNeg * dk * dk);
        gaussRandAt(-kxi, -kzi, seed, g);
        this.h0NegConjRe[idx] = g[0] * ampNeg;
        this.h0NegConjIm[idx] = -g[1] * ampNeg;
      }
    }

    this.lastWindSpeed = windSpeed;
    this.lastWindDirX = windDirX;
    this.lastWindDirZ = windDirZ;
    this.h0Baked = true;
  }

  /**
   * Advances the 64×64 C0 buoyancy field to `time` (zero allocations).
   */
  update(
    time: number,
    windSpeed: number,
    windDirX: number,
    windDirZ: number,
    seaAmp: number,
    chop: number,
  ): void {
    if (!this.active) return;

    const dirLen = Math.hypot(windDirX, windDirZ);
    const wx = dirLen > 1e-5 ? windDirX / dirLen : SWELL_DIR[0];
    const wz = dirLen > 1e-5 ? windDirZ / dirLen : SWELL_DIR[1];

    if (
      !this.h0Baked ||
      Math.abs(windSpeed - this.lastWindSpeed) > 0.05 ||
      wx * this.lastWindDirX + wz * this.lastWindDirZ < 0.9998
    ) {
      this.bakeH0(windSpeed, wx, wz);
    }

    if (!(seaAmp > 1e-6)) {
      if (!this.isZero) {
        this.dispY.fill(0);
        this.dispX.fill(0);
        this.dispZ.fill(0);
        this.isZero = true;
      }
      return;
    }

    this.isZero = false;
    const {
      omega,
      kxNorm,
      kzNorm,
      h0Re,
      h0Im,
      h0NegConjRe,
      h0NegConjIm,
      re0A,
      im0A,
      re1A,
      im1A,
    } = this;

    const tWrap = ((time % FFT_TIME_LOOP_S) + FFT_TIME_LOOP_S) % FFT_TIME_LOOP_S;
    for (let i = 0; i < CPU_FFT_COUNT; i++) {
      const w = omega[i];
      if (w === 0) {
        re0A[i] = 0;
        im0A[i] = 0;
        re1A[i] = 0;
        im1A[i] = 0;
        continue;
      }
      const wt = w * tWrap;
      const c = Math.cos(wt);
      const s = Math.sin(wt);
      const aRe = h0Re[i];
      const aIm = h0Im[i];
      const bRe = h0NegConjRe[i];
      const bIm = h0NegConjIm[i];

      // H(k, t) = h0(k) * exp(-i*wt) + conj(h0(-k)) * exp(+i*wt)
      const hRe = (aRe * c + aIm * s + bRe * c - bIm * s) * seaAmp;
      const hIm = (aIm * c - aRe * s + bIm * c + bRe * s) * seaAmp;

      // A_dx = +i * kxNorm * H = (-kxNorm * hIm, kxNorm * hRe)
      // packComplex(A_dy, A_dx) = (H.re - A_dx.im, H.im + A_dx.re)
      //                         = (hRe - kxNorm * hRe, hIm - kxNorm * hIm)
      const kxn = kxNorm[i];
      const kzn = kzNorm[i];
      re0A[i] = hRe * (1.0 - kxn);
      im0A[i] = hIm * (1.0 - kxn);

      // A_dz = +i * kzNorm * H = (-kzNorm * hIm, kzNorm * hRe)
      re1A[i] = -kzn * hIm;
      im1A[i] = kzn * hRe;
    }

    const out0 = stockhamIfft2D(CPU_FFT_N, CPU_FFT_LOG2, re0A, im0A, this.re0B, this.im0B, this.twCos, this.twSin);
    const out1 = stockhamIfft2D(CPU_FFT_N, CPU_FFT_LOG2, re1A, im1A, this.re1B, this.im1B, this.twCos, this.twSin);

    const src0Re = out0 === 0 ? re0A : this.re0B;
    const src0Im = out0 === 0 ? im0A : this.im0B;
    const src1Re = out1 === 0 ? re1A : this.re1B;

    const { dispY, dispX, dispZ } = this;
    for (let i = 0; i < CPU_FFT_COUNT; i++) {
      dispY[i] = src0Re[i];
      dispX[i] = src0Im[i] * chop;
      dispZ[i] = src1Re[i] * chop;
    }
  }

  /** Periodic bilinear sample phase-aligned to GPU C0 texel centres `(i + 0.5) / gpuN` (zero half-texel shift). */
  private sampleBilinear(grid: Float32Array, wx: number, wz: number): number {
    const u = wx * INV_C0_PATCH;
    const v = wz * INV_C0_PATCH;
    const halfShift = 0.5 * (CPU_FFT_N / this.gpuN);
    let fx = (u - Math.floor(u)) * CPU_FFT_N - halfShift;
    let fz = (v - Math.floor(v)) * CPU_FFT_N - halfShift;
    if (fx < 0) fx += CPU_FFT_N;
    if (fz < 0) fz += CPU_FFT_N;

    const i0 = fx | 0;
    const j0 = fz | 0;
    const tx = fx - i0;
    const tz = fz - j0;
    const x0 = i0 & CPU_FFT_MASK;
    const x1 = (x0 + 1) & CPU_FFT_MASK;
    const row0 = (j0 & CPU_FFT_MASK) * CPU_FFT_N;
    const row1 = ((j0 + 1) & CPU_FFT_MASK) * CPU_FFT_N;

    const a = grid[row0 + x0] + (grid[row0 + x1] - grid[row0 + x0]) * tx;
    const b = grid[row1 + x0] + (grid[row1 + x1] - grid[row1 + x0]) * tx;
    return a + (b - a) * tz;
  }

  /**
   * Samples undisplaced displacement `(dx, dy, dz)` directly at `(x, z)` into `out` (test/diagnostic helper).
   */
  sampleRawDisplacement(x: number, z: number, out: [number, number, number]): [number, number, number] {
    if (!this.active || this.isZero) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      return out;
    }
    out[0] = this.sampleBilinear(this.dispX, x, z);
    out[1] = this.sampleBilinear(this.dispY, x, z);
    out[2] = this.sampleBilinear(this.dispZ, x, z);
    return out;
  }

  /**
   * Sea-surface vertical height (m) at world `(x, z)` using 2-step Newton horizontal-displacement
   * inversion (`x_est = x - dx(x_est, z_est)`, `z_est = z - dz(x_est, z_est)`).
   */
  heightAt(x: number, z: number): number {
    if (!this.active || this.isZero) return 0;
    let xEst = x;
    let zEst = z;
    for (let it = 0; it < 2; it++) {
      const dx = this.sampleBilinear(this.dispX, xEst, zEst);
      const dz = this.sampleBilinear(this.dispZ, xEst, zEst);
      xEst = x - dx;
      zEst = z - dz;
    }
    return this.sampleBilinear(this.dispY, xEst, zEst);
  }
}
