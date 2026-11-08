import * as THREE from "three";
import type { Grade } from "../time-of-day";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Display-space S-curve around 0.5 (AgX "Medium High Contrast"-like). */
function sCurve(v: number, c: number): number {
  if (c === 1) return v;
  return v < 0.5 ? 0.5 * Math.pow(2 * v, c) : 1 - 0.5 * Math.pow(2 * (1 - v), c);
}

const smooth = (e0: number, e1: number, x: number) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

/** Soft hue window (degrees, may wrap): 1 inside [a, b], easing out over `soft` degrees. */
function hueBand(h: number, a: number, b: number, soft: number): number {
  const d = (x: number) => ((x % 360) + 360) % 360;
  const w = d(b - a), p = d(h - a);
  if (p <= w) return 1;
  const out = Math.min(p - w, 360 - p);
  return 1 - smooth(0, soft, out);
}

/**
 * Pure grade function on sRGB-encoded display values (what LUT3DEffect samples with).
 * Blender colour balance (LGG): x = ((v - 1)·(2 - lift) + 1)·gain; out = x^(1/gamma).
 * Then an S-curve, and a saturation that may depend on value (shadowSat) and hue (blueSat: cyan→blue,
 * warmSat: red→green), so the grade can keep the sea receding while roofs and sails carry the colour.
 */
export function gradePixel(rgb: [number, number, number], g: Grade, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  for (let c = 0; c < 3; c++) {
    let x = ((rgb[c] - 1) * (2 - g.lift[c]) + 1) * g.gain[c];
    x = Math.pow(Math.max(0, x), 1 / g.gamma[c]);
    out[c] = sCurve(clamp01(x), g.contrast);
  }
  const l = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
  let sat = g.saturation;
  const shadowSat = g.shadowSat ?? 1, blueSat = g.blueSat ?? 1, warmSat = g.warmSat ?? 1;
  if (shadowSat !== 1) sat *= shadowSat + (1 - shadowSat) * smooth(0.03, 0.42, l);
  if (blueSat !== 1 || warmSat !== 1) {
    const mx = Math.max(out[0], out[1], out[2]), mn = Math.min(out[0], out[1], out[2]), ch = mx - mn;
    if (ch > 1e-4) {
      let h: number;
      if (mx === out[0]) h = 60 * (((out[1] - out[2]) / ch) % 6);
      else if (mx === out[1]) h = 60 * ((out[2] - out[0]) / ch + 2);
      else h = 60 * ((out[0] - out[1]) / ch + 4);
      const chroma = smooth(0.02, 0.12, ch);   // near-greys keep their (tiny) hue untouched
      sat *= 1 + (blueSat - 1) * hueBand(h, 180, 245, 25) * chroma;
      sat *= 1 + (warmSat - 1) * hueBand(h, 345, 115, 25) * chroma;
    }
  }
  for (let c = 0; c < 3; c++) out[c] = clamp01(l + (out[c] - l) * sat);
  return out;
}

/** Fills an RGBA half-float 3D LUT (size³) with the grade. */
export function fillGradeLUT(data: Uint16Array, size: number, g: Grade, firstRow = 0, endRow = size * size): void {
  const px: [number, number, number] = [0, 0, 0], o: [number, number, number] = [0, 0, 0];
  const toHalf = THREE.DataUtils.toHalfFloat;
  let i = firstRow * size * 4;
  for (let row = firstRow; row < endRow; row++) {
    const b = Math.floor(row / size), gg = row % size;
    for (let r = 0; r < size; r++) {
      px[0] = r / (size - 1); px[1] = gg / (size - 1); px[2] = b / (size - 1);
      gradePixel(px, g, o);
      data[i++] = toHalf(o[0]); data[i++] = toHalf(o[1]); data[i++] = toHalf(o[2]); data[i++] = toHalf(1);
    }
  }
}
