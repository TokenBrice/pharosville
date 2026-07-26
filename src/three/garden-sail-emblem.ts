/**
 * H1: turns a coin logo into a sail EMBLEM — the mark alone, with the disc it
 * came on cut away.
 *
 * A ship's sail is dyed in its issuer's colour, so the coloured disc almost
 * every stablecoin logo is drawn on is redundant: the sail already IS that
 * disc. Painting the whole logo on top therefore reads as a sticker stuck to
 * the canvas rather than an emblem painted onto it. Cutting the disc away
 * leaves what a pirate ship carries — one mark, flat against the cloth.
 *
 * Measured over the 111 vendored SVGs on 2026-07-25: 97 are discs (65-85%
 * opaque coverage, the π/4 signature of a circle inscribed in its box), 4 are
 * solid, and only 10 are marks that stand alone. So disc removal is the common
 * case, not an edge case.
 *
 * The mark keeps its OWN colours (operator decision D1). This is subtractive —
 * unlike the harbour flags, nothing is recoloured. Legibility against the cloth
 * is bought by moving the DYE instead (see `gardenSailClothColor`).
 */

/** Working resolution for extraction. Above the 128px atlas cell so the mask
 *  is not the thing that limits emblem detail. */
const SAMPLE_PX = 192;

/** Opaque share above which a logo is treated as a filled badge rather than a
 *  standalone mark. π/4 ≈ 0.785 is a circle in its box; 0.65 clears it. */
const BADGE_COVERAGE = 0.65;

/** Manhattan RGB distance from the disc colour that counts as "not the disc". */
const DISC_TOLERANCE = 110;

/** A usable emblem covers at least this much of the box — below it there is
 *  nothing to see (a bare disc with no inner mark). */
const MIN_INK = 0.03;

/** ...and at most this much — above it the "mark" is the whole logo again. */
const MAX_INK = 0.55;

/** Boundary-to-ink ratio above which a mask is speckle rather than a shape.
 *  Gradient artwork keys into confetti; this is what rejects it. */
const MAX_BOUNDARY_RATIO = 0.62;

export interface SailEmblem {
  /** The mark, in its own colours, on a transparent ground. */
  readonly canvas: HTMLCanvasElement;
  /** Dominant colour of the mark itself — what the cloth must contrast with. */
  readonly inkColor: { b: number; g: number; r: number };
  /** Share of the box the mark occupies; useful for tests and tuning. */
  readonly inkShare: number;
  /** Which key produced it. */
  readonly source: "alpha" | "contrast";
}

/**
 * Extracts the emblem, or returns null when no mask survives the quality gate.
 *
 * Null is a designed outcome, not a failure: the caller then draws the logo
 * unframed (operator decision D3), which still loses the matte and the rim and
 * still sits on a matching dye, so the disc largely melts into the cloth.
 */
export function extractSailEmblem(
  image: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
): SailEmblem | null {
  if (typeof document === "undefined") return null;
  const source = drawContained(image, naturalWidth, naturalHeight);
  if (!source) return null;
  const { data } = source;

  const dominant = dominantOpaqueColor(data);
  if (!dominant) return null;
  const coverage = dominant.opaque / (SAMPLE_PX * SAMPLE_PX);

  // Try contrast keying FIRST even for logos that look like standalone marks.
  // A mark can be a featureless silhouette whose interior detail only exists as
  // a second colour (USDT's hexagon, for one) — keying on alpha there throws
  // the detail away and leaves a blob.
  const contrast = maskByContrast(data, dominant.color);
  if (accepts(contrast)) return finish(source, contrast, "contrast");

  // Standalone marks fall back to their own alpha. Filled badges do not: for a
  // badge, alpha IS the disc, and knocking it out yields a plain circle — worse
  // than drawing the logo untouched.
  if (coverage < BADGE_COVERAGE) {
    const alpha = maskByAlpha(data);
    if (accepts(alpha)) return finish(source, alpha, "alpha");
  }
  return null;
}

interface Sample {
  data: Uint8ClampedArray;
  context: CanvasRenderingContext2D;
}

function drawContained(
  image: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
): Sample | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_PX;
  canvas.height = SAMPLE_PX;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const longest = Math.max(1, Math.max(naturalWidth, naturalHeight));
  const width = (Math.max(1, naturalWidth) / longest) * SAMPLE_PX;
  const height = (Math.max(1, naturalHeight) / longest) * SAMPLE_PX;
  try {
    context.drawImage(image, (SAMPLE_PX - width) / 2, (SAMPLE_PX - height) / 2, width, height);
  } catch {
    return null;
  }
  return { context, data: context.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX).data };
}

/** Most common opaque colour, bucketed to 4 bits per channel so anti-aliasing
 *  and gentle gradients still land in one bin. */
function dominantOpaqueColor(
  data: Uint8ClampedArray,
): { color: [number, number, number]; opaque: number } | null {
  const bins = new Map<number, number>();
  let opaque = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3]! < 128) continue;
    opaque += 1;
    const key = ((data[index]! >> 4) << 8) | ((data[index + 1]! >> 4) << 4) | (data[index + 2]! >> 4);
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  if (opaque === 0) return null;
  let bestKey = 0;
  let bestCount = -1;
  for (const [key, count] of bins) {
    if (count > bestCount) { bestCount = count; bestKey = key; }
  }
  return {
    color: [((bestKey >> 8) & 0xf) * 16 + 8, ((bestKey >> 4) & 0xf) * 16 + 8, (bestKey & 0xf) * 16 + 8],
    opaque,
  };
}

interface Mask {
  bits: Uint8Array;
  ink: number;
}

function maskByContrast(data: Uint8ClampedArray, disc: [number, number, number]): Mask {
  const bits = new Uint8Array(SAMPLE_PX * SAMPLE_PX);
  let ink = 0;
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    if (data[index + 3]! < 128) continue;
    const distance = Math.abs(data[index]! - disc[0])
      + Math.abs(data[index + 1]! - disc[1])
      + Math.abs(data[index + 2]! - disc[2]);
    if (distance > DISC_TOLERANCE) { bits[pixel] = 1; ink += 1; }
  }
  return { bits, ink };
}

function maskByAlpha(data: Uint8ClampedArray): Mask {
  const bits = new Uint8Array(SAMPLE_PX * SAMPLE_PX);
  let ink = 0;
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    if (data[index + 3]! >= 128) { bits[pixel] = 1; ink += 1; }
  }
  return { bits, ink };
}

/**
 * The quality gate (S4). Rejects three distinct failures seen in the sample:
 * a bare disc with nothing inside it, a "mark" that is really the whole logo,
 * and gradient artwork that keys into confetti.
 */
function accepts(mask: Mask): boolean {
  const share = mask.ink / (SAMPLE_PX * SAMPLE_PX);
  if (share < MIN_INK || share > MAX_INK) return false;
  return boundaryRatio(mask) <= MAX_BOUNDARY_RATIO;
}

/** Share of inked pixels that sit on an edge. A clean glyph has a low ratio;
 *  speckle is nearly all edge. */
function boundaryRatio(mask: Mask): number {
  if (mask.ink === 0) return 1;
  let boundary = 0;
  for (let y = 0; y < SAMPLE_PX; y += 1) {
    for (let x = 0; x < SAMPLE_PX; x += 1) {
      const pixel = y * SAMPLE_PX + x;
      if (!mask.bits[pixel]) continue;
      if (
        x === 0 || x === SAMPLE_PX - 1 || y === 0 || y === SAMPLE_PX - 1
        || !mask.bits[pixel - 1] || !mask.bits[pixel + 1]
        || !mask.bits[pixel - SAMPLE_PX] || !mask.bits[pixel + SAMPLE_PX]
      ) boundary += 1;
    }
  }
  return boundary / mask.ink;
}

/** Applies the mask to the ORIGINAL pixels — D1: the mark keeps its colours. */
function finish(sample: Sample, mask: Mask, source: "alpha" | "contrast"): SailEmblem {
  const kept = sample.context.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX);
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let pixel = 0; pixel < mask.bits.length; pixel += 1) {
    const index = pixel * 4;
    if (mask.bits[pixel]) {
      red += kept.data[index]!;
      green += kept.data[index + 1]!;
      blue += kept.data[index + 2]!;
    } else {
      kept.data[index + 3] = 0;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_PX;
  canvas.height = SAMPLE_PX;
  canvas.getContext("2d")?.putImageData(kept, 0, 0);
  return {
    canvas,
    inkColor: { b: blue / mask.ink, g: green / mask.ink, r: red / mask.ink },
    inkShare: mask.ink / (SAMPLE_PX * SAMPLE_PX),
    source,
  };
}
