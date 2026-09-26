/**
 * Picture metrics for `preview.mjs` (plan W0.3): measured value, colour and
 * texture readings of a real-GPU frame, so a value claim cites a number taken
 * on the pinned fixture and clock rather than an eyeball.
 *
 * Everything here is pure image arithmetic on decoded PNG buffers. The page is
 * only asked for PNGs and projected screen points; nothing in here reaches back
 * into the browser.
 *
 * Conventions:
 *   - L* is CIE L* from sRGB → linear → Rec.709 Y → L* (0–100), the same maths
 *     as the light lane's `ninths.mjs`, so its numbers and these compare.
 *   - Hue, saturation and value are HSV on the sRGB bytes; `s·v` is therefore
 *     chroma (max − min) on 0–1, the art-director lane's saturation measure.
 *   - Rectangles and polygons arrive in CSS pixels of the canvas and are scaled
 *     to image pixels here, so a DPR-2 capture measures the same region.
 */
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const SRGB_TO_LINEAR = new Float32Array(256);
for (let value = 0; value < 256; value += 1) {
  const c = value / 255;
  SRGB_TO_LINEAR[value] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function lstarFromY(y) {
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/** Decode a PNG buffer into packed RGB bytes plus its L* plane. */
export async function decodeFrame(png) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const lstar = new Float32Array(width * height);
  for (let pixel = 0, offset = 0; pixel < lstar.length; pixel += 1, offset += 3) {
    const y = 0.2126 * SRGB_TO_LINEAR[data[offset]]
      + 0.7152 * SRGB_TO_LINEAR[data[offset + 1]]
      + 0.0722 * SRGB_TO_LINEAR[data[offset + 2]];
    lstar[pixel] = lstarFromY(y);
  }
  return { height, lstar, rgb: data, width };
}

/** Mean L* per 3×3 ninth, row-major (top-left … bottom-right). */
export function ninths(frame) {
  const { lstar, width, height } = frame;
  const sum = new Float64Array(9);
  const count = new Float64Array(9);
  for (let y = 0; y < height; y += 1) {
    const row = Math.min(2, Math.floor((3 * y) / height));
    for (let x = 0; x < width; x += 1) {
      const cell = row * 3 + Math.min(2, Math.floor((3 * x) / width));
      sum[cell] += lstar[y * width + x];
      count[cell] += 1;
    }
  }
  return Array.from(sum, (total, cell) => total / Math.max(1, count[cell]));
}

export function frameMeanLstar(frame) {
  let total = 0;
  for (const value of frame.lstar) total += value;
  return total / Math.max(1, frame.lstar.length);
}

/** Share (0–1) of pixels brighter than `threshold` L*. */
export function brightShare(frame, threshold = 85) {
  let bright = 0;
  for (const value of frame.lstar) if (value > threshold) bright += 1;
  return bright / Math.max(1, frame.lstar.length);
}

function hsvAt(rgb, offset) {
  const r = rgb[offset];
  const g = rgb[offset + 1];
  const b = rgb[offset + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
    if (hue < 0) hue += 360;
  }
  return { chroma: delta / 255, hue };
}

/**
 * Share (0–1) of pixels that are saturated orange: HSV hue 15–50° with
 * s·v > 0.35 — the golden-hour "one-hue soup" measure (art-director-2).
 */
export function saturatedOrangeShare(frame, { hueMin = 15, hueMax = 50, minChroma = 0.35 } = {}) {
  const { rgb, width, height } = frame;
  let hits = 0;
  const pixels = width * height;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const { chroma, hue } = hsvAt(rgb, pixel * 3);
    if (chroma > minChroma && hue >= hueMin && hue <= hueMax) hits += 1;
  }
  return hits / Math.max(1, pixels);
}

/**
 * Chroma-weighted circular mean hue of an image-pixel rectangle. Grey pixels
 * carry no hue, so they carry no weight; `meanChroma` says how much colour the
 * hue was read from.
 */
export function regionHue(frame, rect) {
  const { rgb, width } = frame;
  const box = clampRect(rect, frame);
  let sumSin = 0;
  let sumCos = 0;
  let sumChroma = 0;
  let count = 0;
  for (let y = box.y0; y < box.y1; y += 1) {
    for (let x = box.x0; x < box.x1; x += 1) {
      const { chroma, hue } = hsvAt(rgb, (y * width + x) * 3);
      const radians = (hue * Math.PI) / 180;
      sumSin += chroma * Math.sin(radians);
      sumCos += chroma * Math.cos(radians);
      sumChroma += chroma;
      count += 1;
    }
  }
  if (count === 0 || sumChroma === 0) return { hue: null, meanChroma: 0 };
  let hue = (Math.atan2(sumSin, sumCos) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return { hue, meanChroma: sumChroma / count };
}

/** Smallest angular distance between two hues, 0–180°. */
export function hueDistance(a, b) {
  if (a === null || b === null) return null;
  const difference = Math.abs(a - b) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/** Left-third vs right-third hue of the top band (top third of the frame). */
export function topBandHueDelta(frame) {
  const band = frame.height / 3;
  const third = frame.width / 3;
  const left = regionHue(frame, { x: 0, y: 0, width: third, height: band });
  const right = regionHue(frame, { x: 2 * third, y: 0, width: third, height: band });
  return { delta: hueDistance(left.hue, right.hue), left, right };
}

/** Separable Gaussian on a single-channel float plane, edges clamped. */
export function gaussianBlur(plane, width, height, sigma) {
  if (!(sigma > 0)) return Float32Array.from(plane);
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let kernelSum = 0;
  for (let index = -radius; index <= radius; index += 1) {
    const weight = Math.exp(-(index * index) / (2 * sigma * sigma));
    kernel[index + radius] = weight;
    kernelSum += weight;
  }
  for (let index = 0; index < kernel.length; index += 1) kernel[index] /= kernelSum;
  const horizontal = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sampleX = x + k < 0 ? 0 : x + k >= width ? width - 1 : x + k;
        total += plane[row + sampleX] * kernel[k + radius];
      }
      horizontal[row + x] = total;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let total = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sampleY = y + k < 0 ? 0 : y + k >= height ? height - 1 : y + k;
        total += horizontal[sampleY * width + x] * kernel[k + radius];
      }
      out[y * width + x] = total;
    }
  }
  return out;
}

/**
 * High-frequency energy of the bottom third: mean |L* − gauss_σ(L*)|. The blur
 * reads a 3σ margin above the band so the band's top edge is not an artefact
 * of clamping. `sigma` is in image pixels (the caller scales CSS σ6 by DPR).
 */
export function bottomThirdHighFrequency(frame, sigma) {
  const { lstar, width, height } = frame;
  const bandTop = Math.floor((2 * height) / 3);
  const marginTop = Math.max(0, bandTop - Math.ceil(sigma * 3));
  const rows = height - marginTop;
  const slice = lstar.subarray(marginTop * width, height * width);
  const blurred = gaussianBlur(slice, width, rows, sigma);
  let total = 0;
  let count = 0;
  for (let y = bandTop - marginTop; y < rows; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      total += Math.abs(slice[index] - blurred[index]);
      count += 1;
    }
  }
  return total / Math.max(1, count);
}

function clampRect(rect, frame) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(frame.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(frame.height, Math.ceil(rect.y + rect.height));
  return { x0, x1: Math.max(x0, x1), y0, y1: Math.max(y0, y1) };
}

/** Mean L* of an image-pixel rectangle, or null when it lies off the frame. */
export function regionMeanLstar(frame, rect) {
  const box = clampRect(rect, frame);
  let total = 0;
  let count = 0;
  for (let y = box.y0; y < box.y1; y += 1) {
    for (let x = box.x0; x < box.x1; x += 1) {
      total += frame.lstar[y * frame.width + x];
      count += 1;
    }
  }
  return count > 0 ? { mean: total / count, pixels: count } : null;
}

/**
 * L* statistics inside an image-pixel polygon (scanline even-odd fill at pixel
 * centres). Returns null when the polygon covers no pixel of the frame.
 */
export function polygonLstarStats(frame, polygon, { brightThreshold = 10 } = {}) {
  const { lstar, width, height } = frame;
  if (polygon.length < 3) return null;
  const ys = polygon.map((point) => point.y);
  const yStart = Math.max(0, Math.floor(Math.min(...ys)));
  const yEnd = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  const values = [];
  let total = 0;
  let bright = 0;
  for (let y = yStart; y <= yEnd; y += 1) {
    const centreY = y + 0.5;
    const crossings = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      if ((a.y <= centreY && b.y > centreY) || (b.y <= centreY && a.y > centreY)) {
        crossings.push(a.x + ((centreY - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    crossings.sort((p, q) => p - q);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const xStart = Math.max(0, Math.ceil(crossings[pair] - 0.5));
      const xEnd = Math.min(width - 1, Math.floor(crossings[pair + 1] - 0.5));
      for (let x = xStart; x <= xEnd; x += 1) {
        const value = lstar[y * width + x];
        values.push(value);
        total += value;
        if (value > brightThreshold) bright += 1;
      }
    }
  }
  if (values.length === 0) return null;
  values.sort((p, q) => p - q);
  return {
    brightShare: bright / values.length,
    brightThreshold,
    max: values[values.length - 1],
    mean: total / values.length,
    p95: values[Math.floor(0.95 * (values.length - 1))],
    pixels: values.length,
  };
}

/**
 * Three-value notan: L* blurred at `sigma` image pixels, posterised at the
 * thirds of its own p5–p95 range so a night frame still separates its masses.
 * Blurs at a reduced scale (box-downsampled) for speed; the posterised plane is
 * written back at full size.
 */
export async function writeNotan(frame, sigma, path) {
  const { lstar, width, height } = frame;
  const factor = Math.max(1, Math.floor(sigma / 4));
  const smallWidth = Math.max(1, Math.floor(width / factor));
  const smallHeight = Math.max(1, Math.floor(height / factor));
  const small = new Float32Array(smallWidth * smallHeight);
  for (let y = 0; y < smallHeight; y += 1) {
    for (let x = 0; x < smallWidth; x += 1) {
      let total = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) total += lstar[(y * factor + dy) * width + x * factor + dx];
      }
      small[y * smallWidth + x] = total / (factor * factor);
    }
  }
  const blurred = gaussianBlur(small, smallWidth, smallHeight, sigma / factor);
  const sorted = Float32Array.from(blurred).sort();
  const p5 = sorted[Math.floor(0.05 * (sorted.length - 1))];
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))];
  const dark = p5 + (p95 - p5) / 3;
  const light = p5 + (2 * (p95 - p5)) / 3;
  const grey = Buffer.alloc(blurred.length);
  const shares = [0, 0, 0];
  for (let index = 0; index < blurred.length; index += 1) {
    const value = blurred[index];
    const band = value < dark ? 0 : value < light ? 1 : 2;
    shares[band] += 1;
    grey[index] = [28, 128, 228][band];
  }
  await sharp(grey, { raw: { channels: 1, height: smallHeight, width: smallWidth } })
    .resize(width, height, { kernel: "nearest" })
    .png()
    .toFile(path);
  return {
    path,
    shares: shares.map((count) => count / blurred.length),
    thresholds: [dark, light],
  };
}

/** Mean |ΔL*| between consecutive frames inside the bottom third, per pair and overall. */
export function temporalBottomThirdDelta(frames) {
  const pairs = [];
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    if (previous.width !== current.width || previous.height !== current.height) {
      throw new Error("temporal frames changed size mid-burst");
    }
    const start = Math.floor((2 * current.height) / 3) * current.width;
    let total = 0;
    for (let pixel = start; pixel < current.lstar.length; pixel += 1) {
      total += Math.abs(current.lstar[pixel] - previous.lstar[pixel]);
    }
    pairs.push(total / Math.max(1, current.lstar.length - start));
  }
  const mean = pairs.length ? pairs.reduce((sum, value) => sum + value, 0) / pairs.length : null;
  return { max: pairs.length ? Math.max(...pairs) : null, mean, pairs };
}

export function meanAbsoluteError(measured, target) {
  return measured.reduce((sum, value, index) => sum + Math.abs(value - target[index]), 0) / measured.length;
}

export function pearson(a, b) {
  const n = a.length;
  const meanA = a.reduce((sum, value) => sum + value, 0) / n;
  const meanB = b.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < n; index += 1) {
    covariance += (a[index] - meanA) * (b[index] - meanB);
    varianceA += (a[index] - meanA) ** 2;
    varianceB += (b[index] - meanB) ** 2;
  }
  const denominator = Math.sqrt(varianceA * varianceB);
  return denominator > 0 ? covariance / denominator : null;
}

export const VALUE_PLAN_COLUMNS = ["noon", "dusk", "night"];

/**
 * The bible's value plan (`docs/pharosville/VISUAL_INVARIANTS.md`, "Value
 * plan"), parsed from the document itself so a G−1 correction to the table is
 * what the metric compares against, with no copy to drift. Each cell's first
 * `a / b / c` triple is noon / dusk / night.
 */
export async function readValuePlan(path) {
  const markdown = await readFile(path, "utf8");
  const section = markdown.split(/^## Value plan\s*$/m)[1]?.split(/^## /m)[0];
  if (!section) throw new Error(`no "## Value plan" section in ${path}`);
  const rows = {};
  for (const line of section.split("\n")) {
    const match = /^\|\s*(Top|Middle|Bottom)\s*\|(.*)\|\s*$/.exec(line.trim());
    if (!match) continue;
    const cells = match[2].split("|").map((cell) => {
      const triple = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(cell);
      if (!triple) throw new Error(`value-plan cell without a noon / dusk / night triple: "${cell.trim()}"`);
      return [Number(triple[1]), Number(triple[2]), Number(triple[3])];
    });
    if (cells.length !== 3) throw new Error(`value-plan row ${match[1]} has ${cells.length} cells, expected 3`);
    rows[match[1]] = cells;
  }
  const order = ["Top", "Middle", "Bottom"];
  const missing = order.filter((name) => !rows[name]);
  if (missing.length) throw new Error(`value-plan table in ${path} lacks row(s) ${missing.join(", ")}`);
  const plan = {};
  VALUE_PLAN_COLUMNS.forEach((column, columnIndex) => {
    plan[column] = order.flatMap((name) => rows[name].map((cell) => cell[columnIndex]));
  });
  return plan;
}

/** noon 7–16, dusk 16–20 or 5–7, night otherwise (hours are the `t=` decimal hour). */
export function valuePlanColumnForHour(hour) {
  if (hour >= 7 && hour < 16) return "noon";
  if ((hour >= 16 && hour < 20) || (hour >= 5 && hour < 7)) return "dusk";
  return "night";
}

/** Tile PNG buffers left→right, top→bottom into one contact sheet (≤ 2400 px wide). */
export async function writeContactSheet(buffers, path) {
  const meta = await sharp(buffers[0]).metadata();
  const cols = Math.ceil(Math.sqrt(buffers.length));
  const rows = Math.ceil(buffers.length / cols);
  const gap = 6;
  const scale = Math.min(1, 2400 / (cols * meta.width));
  const tileWidth = Math.max(1, Math.round(meta.width * scale));
  const tileHeight = Math.max(1, Math.round(meta.height * scale));
  const tiles = await Promise.all(buffers.map((buffer) => sharp(buffer).resize(tileWidth, tileHeight).png().toBuffer()));
  await sharp({
    create: {
      background: "#111",
      channels: 3,
      height: rows * tileHeight + (rows - 1) * gap,
      width: cols * tileWidth + (cols - 1) * gap,
    },
  })
    .composite(tiles.map((input, index) => ({
      input,
      left: (index % cols) * (tileWidth + gap),
      top: Math.floor(index / cols) * (tileHeight + gap),
    })))
    .png()
    .toFile(path);
  return { cols, path, rows, tileHeight, tileWidth };
}
