/**
 * Stockham radix-2 auto-sorting 2D IFFT butterfly pass (`hb_fft_bfly`, Phase 2 Workstream A, §5.1).
 *
 * Uses WebGL2 GLSL3 2× RGBA MRT (`out0`, `out1`) so each Stockham stage transforms all 4 complex
 * wave fields (8 real spatial channels) simultaneously in a single fullscreen draw, with zero
 * bit-reversal pass and zero checkerboard sign-flip.
 *
 * Stage invariant (`s = 0 .. log2(N) - 1`, sub-DFT size `m = 1 << s`):
 * - For output index `p ∈ [0, N - 1]`:
 *   `j = p >> (s + 1)`, `rPrime = p & (2*m - 1)`, `r = p & (m - 1)`
 *   `idx0 = j * m + r`, `idx1 = idx0 + (N >> 1)`
 *   `twiddle = exp(+i * π * rPrime / m)` (inverse DFT `+2π` sign convention)
 *   `out[p] = in[idx0] + twiddle * in[idx1]`
 *
 * Horizontal stages (`uAxis = 0`, `s = 0 .. log2(N)-1`) followed by vertical stages
 * (`uAxis = 1`, `s = 0 .. log2(N)-1`) compute the exact unnormalized 2D inverse DFT:
 * `f[x, z] = Σ_{m,n} F[m, n] exp(+i 2π (m·x + n·z) / N)`.
 */

export const FFT_BFLY_FRAG = /* glsl */ `
uniform sampler2D uSrc0;
uniform sampler2D uSrc1;
uniform int uSize;
uniform int uStage;
uniform int uAxis;

layout(location = 0) out vec4 out0;
layout(location = 1) out vec4 out1;

const float PI = 3.1415926535897932;

vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  int p = uAxis == 0 ? coord.x : coord.y;
  int m = 1 << uStage;
  int j = p >> (uStage + 1);
  int rPrime = p & ((m << 1) - 1);
  int r = p & (m - 1);
  int idx0 = j * m + r;
  int idx1 = idx0 + (uSize >> 1);

  ivec2 c0 = uAxis == 0 ? ivec2(idx0, coord.y) : ivec2(coord.x, idx0);
  ivec2 c1 = uAxis == 0 ? ivec2(idx1, coord.y) : ivec2(coord.x, idx1);

  vec4 a0 = texelFetch(uSrc0, c0, 0);
  vec4 b0 = texelFetch(uSrc0, c1, 0);
  vec4 a1 = texelFetch(uSrc1, c0, 0);
  vec4 b1 = texelFetch(uSrc1, c1, 0);

  float angle = (PI / float(m)) * float(rPrime);
  vec2 tw = vec2(cos(angle), sin(angle));

  out0 = vec4(a0.xy + cmul(tw, b0.xy), a0.zw + cmul(tw, b0.zw));
  out1 = vec4(a1.xy + cmul(tw, b1.xy), a1.zw + cmul(tw, b1.zw));
}
`;

/**
 * Pure TypeScript reference Stockham radix-2 2D inverse DFT mirroring `FFT_BFLY_FRAG` line-for-line.
 * Runs in zero allocations when caller supplies pre-allocated ping-pong `Float32Array` scratch buffers.
 *
 * Computes `out[y * N + x] = Σ_{m,n} in[n * N + m] · exp(+i · 2π · (m·x + n·y) / N)`.
 * Returns which buffer pair (`0` = A, `1` = B) holds the final spatial result (always `0` for even `2·log2N`).
 */
export function stockhamIfft2D(
  n: number,
  log2N: number,
  reA: Float32Array,
  imA: Float32Array,
  reB: Float32Array,
  imB: Float32Array,
  twCos: Float32Array,
  twSin: Float32Array,
): 0 | 1 {
  const halfN = n >> 1;
  let srcRe = reA;
  let srcIm = imA;
  let dstRe = reB;
  let dstIm = imB;
  let outBuf: 0 | 1 = 0;

  // Horizontal stages (axis = 0)
  let twOffset = 0;
  for (let s = 0; s < log2N; s++) {
    const m = 1 << s;
    const m2 = m << 1;
    const rMask = m - 1;
    const rPrimeMask = m2 - 1;
    const shift = s + 1;
    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let p = 0; p < n; p++) {
        const j = p >> shift;
        const rPrime = p & rPrimeMask;
        const r = p & rMask;
        const idx0 = row + j * m + r;
        const idx1 = idx0 + halfN;
        const c = twCos[twOffset + rPrime];
        const sn = twSin[twOffset + rPrime];
        const br = srcRe[idx1];
        const bi = srcIm[idx1];
        dstRe[row + p] = srcRe[idx0] + (c * br - sn * bi);
        dstIm[row + p] = srcIm[idx0] + (c * bi + sn * br);
      }
    }
    twOffset += m2;
    const tr = srcRe; srcRe = dstRe; dstRe = tr;
    const ti = srcIm; srcIm = dstIm; dstIm = ti;
    outBuf = outBuf === 0 ? 1 : 0;
  }

  // Vertical stages (axis = 1)
  twOffset = 0;
  for (let s = 0; s < log2N; s++) {
    const m = 1 << s;
    const m2 = m << 1;
    const rMask = m - 1;
    const rPrimeMask = m2 - 1;
    const shift = s + 1;
    for (let p = 0; p < n; p++) {
      const j = p >> shift;
      const rPrime = p & rPrimeMask;
      const r = p & rMask;
      const row0 = (j * m + r) * n;
      const row1 = (j * m + r + halfN) * n;
      const dstRow = p * n;
      const c = twCos[twOffset + rPrime];
      const sn = twSin[twOffset + rPrime];
      for (let x = 0; x < n; x++) {
        const br = srcRe[row1 + x];
        const bi = srcIm[row1 + x];
        dstRe[dstRow + x] = srcRe[row0 + x] + (c * br - sn * bi);
        dstIm[dstRow + x] = srcIm[row0 + x] + (c * bi + sn * br);
      }
    }
    twOffset += m2;
    const tr = srcRe; srcRe = dstRe; dstRe = tr;
    const ti = srcIm; srcIm = dstIm; dstIm = ti;
    outBuf = outBuf === 0 ? 1 : 0;
  }

  return outBuf;
}

/** Precomputes Stockham IFFT twiddle tables `cos(+π·r'/m)`, `sin(+π·r'/m)` for all `log2N` stages. */
export function buildStockhamTwiddles(log2N: number): { twCos: Float32Array; twSin: Float32Array } {
  // Total entries = Σ_{s=0}^{log2N-1} 2^(s+1) = 2 * (N - 1)
  const total = ((1 << log2N) - 1) << 1;
  const twCos = new Float32Array(total);
  const twSin = new Float32Array(total);
  let off = 0;
  for (let s = 0; s < log2N; s++) {
    const m = 1 << s;
    const m2 = m << 1;
    const step = Math.PI / m;
    for (let rPrime = 0; rPrime < m2; rPrime++) {
      const a = step * rPrime;
      twCos[off + rPrime] = Math.cos(a);
      twSin[off + rPrime] = Math.sin(a);
    }
    off += m2;
  }
  return { twCos, twSin };
}
