#!/usr/bin/env node
/**
 * Deterministically generates the two post-chain lookup textures the fused
 * grade pass consumes (Garden of Light W1.1 / W1.2):
 *
 *   public/pharosville/textures/garden-grade-lut.png   1024x96 RGB
 *   public/pharosville/textures/garden-blue-noise.png  64x64 grey
 *
 * WHY A SCRIPT AND NOT A COLOURIST'S .cube: this repository has no Resolve and
 * no Photoshop, and a hand-dragged curve nobody can regenerate is exactly the
 * kind of artifact `ASSET_PIPELINE.md` forbids. The grade below is therefore
 * written as PARAMETRIC colour transforms — a lift toward a tinted floor, a
 * gentle S-curve, a luma-keyed shadow/highlight hue push, and per-hue-family
 * saturation and rotation — evaluated over the 32^3 cube. The parameters are
 * the review surface, the PNG is a build product, and `--check` proves the two
 * agree.
 *
 * LAYOUT: one 32^3 LUT is a 32x32 grid of blue slices, written as a 1024x32
 * strip (x = red within a 32px slice, slice index = blue, y = green). The three
 * day-phase LUTs are STACKED into one 1024x96 image, night on top, then dusk,
 * then day, so the runtime carries a single texture and a single owner instead
 * of three. The shader samples each band with a manual trilinear lookup that
 * never crosses a slice or band boundary, so linear filtering is safe.
 *
 * DOMAIN: the LUT is applied POST-AgX, on the sRGB-ENCODED display signal (see
 * the GardenLut effect in `src/three/garden-post.ts`). Encoded space is where a
 * 32-step axis has its resolution in the right places and where a 1/255 dither
 * is exactly one output code, so both halves of the plan agree on one domain.
 *
 * Usage:
 *   node scripts/pharosville/generate-garden-luts.mjs
 *   node scripts/pharosville/generate-garden-luts.mjs --check
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { deflateSync, inflateSync } from "node:zlib";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const outputDirectory = path.join(repoRoot, "public", "pharosville", "textures");
const lutPath = path.join(outputDirectory, "garden-grade-lut.png");
const blueNoisePath = path.join(outputDirectory, "garden-blue-noise.png");
const consumerPath = path.join(repoRoot, "src", "three", "garden-post.ts");
const checkOnly = process.argv.includes("--check");

/** Cube edge. 32 is the ceiling a 2D strip can carry without a huge texture. */
const LUT_SIZE = 32;
/** Night, dusk, day — the same three phases the parametric grade table blends. */
const LUT_BANDS = 3;
const BLUE_NOISE_SIZE = 64;

/**
 * How much of each authored transform survives into the baked cube.
 *
 * The LUT is a REFINEMENT over an already-tuned parametric grade, not a filter:
 * the lift/gamma/gain/split-tone pass in `garden-post.ts` still does the heavy
 * lifting, and this cube only bends the result toward the dentō-shoku palette.
 * Every phase below is authored at its natural strength and then mixed back
 * toward identity by this one dial, so "make it subtler" is a single number.
 */
const LUT_STRENGTH = 0.9;

/**
 * The three phase grades.
 *
 * Every colour is a hex anchor rather than a raw vector: the shadow/highlight
 * pushes are derived from the anchor by subtracting its own mean, so what the
 * transform adds is the anchor's HUE, never its brightness. A push of 0.035
 * therefore means "at most ±9 output codes of hue lean in the deepest
 * shadows", which is the order of magnitude a refinement is allowed.
 *
 * Hue bands are raised-cosine windows in degrees. They are how a per-hue
 * saturation curve is written without a curve editor: name the family, say how
 * wide it is, and say what happens to it. Near-neutral colours are excluded
 * from every band (see `bandWeight`) so the cube can never twist greys.
 */
const PHASES = [
  {
    id: "night",
    // Night is the phase that already works; the cube's whole job here is to
    // put the shadows on the indigo (ai/kachi-iro) axis the palette calls for
    // and keep the lantern gold from drifting with them.
    contrast: 0.16,
    highlightAnchor: "#cfe0f5",
    highlightPush: 0.02,
    highlightRange: [0.55, 1.0],
    hueBands: [
      // Lantern and beacon warmth is the one thing night must not lose.
      { center: 38, rotate: 0, saturation: 1.08, width: 46 },
      // Foliage at night is a silhouette, not a colour.
      { center: 110, rotate: 0, saturation: 0.88, width: 50 },
      // Cyan-leaning water pulled toward the indigo family.
      { center: 195, rotate: 12, saturation: 0.95, width: 42 },
    ],
    lift: 0.014,
    liftTint: "#6078bd",
    saturation: 1.0,
    shadowAnchor: "#1a1f3a",
    shadowPush: 0.05,
    shadowRange: [0.0, 0.55],
  },
  {
    id: "dusk",
    // Dusk is the split: gold-amber highlights over teal shadows, with the
    // foliage falling to olive the way it actually does under a low sun.
    contrast: 0.24,
    highlightAnchor: "#f2b56b",
    highlightPush: 0.062,
    highlightRange: [0.5, 1.0],
    hueBands: [
      { center: 40, rotate: -4, saturation: 1.06, width: 48 },
      { center: 110, rotate: -12, saturation: 0.85, width: 48 },
      { center: 200, rotate: 8, saturation: 1.04, width: 45 },
    ],
    lift: 0.01,
    liftTint: "#55a6b4",
    saturation: 1.05,
    shadowAnchor: "#164f58",
    shadowPush: 0.055,
    shadowRange: [0.0, 0.58],
  },
  {
    id: "day",
    // Day is the frame the plan calls "milk": no value structure. The cube
    // answers with the one thing a LUT can honestly contribute — a gentle
    // S-curve for structure, a cool printed black so the darks read as ai
    // rather than milk, an ivory (shironeri) highlight, and a light
    // overall desaturation that spares the reserved vermilion.
    contrast: 0.55,
    highlightAnchor: "#f6f0e2",
    highlightPush: 0.045,
    highlightRange: [0.45, 1.0],
    hueBands: [
      // Shu vermilion is the sacred accent; it survives the desaturation.
      { center: 8, rotate: 0, saturation: 1.04, width: 28 },
      { center: 40, rotate: 0, saturation: 1.0, width: 40 },
      // Foliage toward matsuba-iro: less chroma, a touch more yellow.
      { center: 110, rotate: -10, saturation: 0.86, width: 45 },
      // The jade sea is most of the frame — it is calmed, never re-hued.
      { center: 180, rotate: 0, saturation: 0.97, width: 45 },
      // Sky blue toward mizu-iro.
      { center: 225, rotate: 0, saturation: 0.93, width: 45 },
    ],
    lift: 0.016,
    liftTint: "#6685ae",
    saturation: 0.98,
    shadowAnchor: "#213f66",
    shadowPush: 0.06,
    shadowRange: [0.0, 0.62],
  },
];

// --- colour maths -----------------------------------------------------------

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
}

/**
 * The hue of an anchor as a signed, mean-free direction, scaled so its largest
 * component is 1. Adding `push * direction` therefore leans a colour toward the
 * anchor's hue without changing its luminance by more than rounding.
 */
function hueDirection(hex) {
  const rgb = hexToRgb(hex);
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
  const centered = rgb.map((channel) => channel - mean);
  const scale = Math.max(...centered.map(Math.abs)) || 1;
  return centered.map((channel) => channel / scale);
}

/** The tint a lift lands on, normalized so the lift amount alone sets its depth. */
function liftDirection(hex) {
  const rgb = hexToRgb(hex);
  const scale = Math.max(...rgb) || 1;
  return rgb.map((channel) => channel / scale);
}

function luma(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function rgbToHsv(rgb) {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 1e-9) {
    if (max === r) hue = ((g - b) / delta + 6) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
  }
  return { hue, saturation: max <= 1e-9 ? 0 : delta / max, value: max };
}

function hsvToRgb(hue, saturation, value) {
  const h = ((hue % 360) + 360) % 360 / 60;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(h % 2 - 1));
  const m = value - chroma;
  const table = [
    [chroma, x, 0], [x, chroma, 0], [0, chroma, x],
    [0, x, chroma], [x, 0, chroma], [chroma, 0, x],
  ];
  return table[Math.floor(h) % 6].map((channel) => channel + m);
}

/**
 * Raised-cosine window over the hue circle, faded out for near-neutral colours
 * so a band can never rotate a grey (whose hue is numerical noise).
 */
function bandWeight(hue, saturation, band) {
  // Shortest arc between the colour and the band centre, in degrees.
  const distance = Math.abs(((hue - band.center + 540) % 360) - 180);
  const t = Math.min(1, distance / band.width);
  return (0.5 + 0.5 * Math.cos(Math.PI * t)) * Math.min(1, saturation * 4);
}

/** The authored grade for one phase, evaluated on one sRGB-encoded triple. */
function gradeTexel(input, phase) {
  const shadowDirection = phase.shadowDirection;
  const highlightDirection = phase.highlightDirection;
  const tint = phase.liftDirection;

  // 1. Lift toward a tinted floor. Print blacks, never absence.
  let color = input.map((channel, index) => (
    channel * (1 - phase.lift) + phase.lift * tint[index]
  ));

  // 2. A gentle S-curve for value structure. Monotone, so nothing inverts.
  color = color.map((channel) => {
    const shaped = channel * channel * (3 - 2 * channel);
    return channel + (shaped - channel) * phase.contrast;
  });

  // 3. Luma-keyed hue push: shadows one way, highlights the other.
  const l = luma(color);
  const shadowWeight = smoothstep(phase.shadowRange[1], phase.shadowRange[0], l);
  const highlightWeight = smoothstep(phase.highlightRange[0], phase.highlightRange[1], l);
  color = color.map((channel, index) => (
    channel
    + phase.shadowPush * shadowDirection[index] * shadowWeight
    + phase.highlightPush * highlightDirection[index] * highlightWeight
  ));
  color = color.map(clamp01);

  // 4. Per-hue-family rotation, then a luma-preserving saturation. Rotation
  //    runs through HSV (it is a hue operation); saturation does not, because
  //    HSV desaturation brightens and a grade must not.
  const hsv = rgbToHsv(color);
  let saturationScale = phase.saturation;
  let rotation = 0;
  for (const band of phase.hueBands) {
    const weight = bandWeight(hsv.hue, hsv.saturation, band);
    saturationScale *= 1 + (band.saturation - 1) * weight;
    rotation += band.rotate * weight;
  }
  if (rotation !== 0) {
    color = hsvToRgb(hsv.hue + rotation, hsv.saturation, hsv.value);
  }
  const gradedLuma = luma(color);
  color = color.map((channel) => clamp01(gradedLuma + (channel - gradedLuma) * saturationScale));

  // 5. Back toward identity by the global strength dial.
  return color.map((channel, index) => clamp01(
    input[index] + (channel - input[index]) * LUT_STRENGTH,
  ));
}

// --- LUT strip --------------------------------------------------------------

function buildLutStrip() {
  const width = LUT_SIZE * LUT_SIZE;
  const height = LUT_SIZE * LUT_BANDS;
  const pixels = new Uint8Array(width * height * 3);
  const stats = [];

  for (const [bandIndex, phase] of PHASES.entries()) {
    let maxDelta = 0;
    let sumDelta = 0;
    let samples = 0;
    for (let blue = 0; blue < LUT_SIZE; blue += 1) {
      for (let green = 0; green < LUT_SIZE; green += 1) {
        const row = bandIndex * LUT_SIZE + green;
        for (let red = 0; red < LUT_SIZE; red += 1) {
          const input = [red, green, blue].map((index) => index / (LUT_SIZE - 1));
          const output = gradeTexel(input, phase);
          const offset = (row * width + blue * LUT_SIZE + red) * 3;
          for (let channel = 0; channel < 3; channel += 1) {
            const encoded = Math.round(output[channel] * 255);
            pixels[offset + channel] = encoded;
            const delta = Math.abs(encoded - Math.round(input[channel] * 255));
            maxDelta = Math.max(maxDelta, delta);
            sumDelta += delta;
            samples += 1;
          }
        }
      }
    }
    stats.push({
      id: phase.id,
      maxCodeDelta: maxDelta,
      meanCodeDelta: Number((sumDelta / samples).toFixed(3)),
    });
  }

  return { height, pixels, stats, width };
}

// --- blue noise (void-and-cluster) -----------------------------------------

/**
 * Ulichney's void-and-cluster (1993), the standard way to build a blue-noise
 * threshold mask: rank every pixel of the tile by repeatedly locating the
 * tightest CLUSTER of set pixels and the largest VOID between them, so no
 * ranking prefix ever clumps. The energy field is a wrap-around Gaussian
 * (sigma 1.5), which is what makes the result tile seamlessly across the frame.
 *
 * Phases II and III of the original paper collapse into one loop here, and that
 * is exact rather than a shortcut: with a linear filter the complement energy
 * is `constant - energy`, so "tightest cluster of zeros" and "largest void of
 * ones" select the same pixel.
 */
function buildBlueNoise(size, seed) {
  const count = size * size;
  const radius = 6;
  const sigma = 1.5;
  const kernel = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      kernel.push({ dx, dy, weight: Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)) });
    }
  }

  const energy = new Float64Array(count);
  const binary = new Uint8Array(count);

  const stamp = (index, sign) => {
    const x = index % size;
    const y = (index - x) / size;
    for (const { dx, dy, weight } of kernel) {
      const nx = (x + dx + size) % size;
      const ny = (y + dy + size) % size;
      energy[ny * size + nx] += sign * weight;
    }
  };
  const place = (index) => {
    binary[index] = 1;
    stamp(index, 1);
  };
  const remove = (index) => {
    binary[index] = 0;
    stamp(index, -1);
  };
  const tightestCluster = () => {
    let best = -1;
    let bestEnergy = -Infinity;
    for (let index = 0; index < count; index += 1) {
      if (binary[index] === 1 && energy[index] > bestEnergy) {
        bestEnergy = energy[index];
        best = index;
      }
    }
    return best;
  };
  const largestVoid = () => {
    let best = -1;
    let bestEnergy = Infinity;
    for (let index = 0; index < count; index += 1) {
      if (binary[index] === 0 && energy[index] < bestEnergy) {
        bestEnergy = energy[index];
        best = index;
      }
    }
    return best;
  };

  // A fixed-seed prototype: one tenth of the tile, then relaxed until moving
  // the tightest cluster into the largest void is a no-op.
  const random = mulberry32(seed);
  const initialOnes = Math.round(count / 10);
  let placed = 0;
  while (placed < initialOnes) {
    const index = Math.floor(random() * count) % count;
    if (binary[index] === 0) {
      place(index);
      placed += 1;
    }
  }
  for (let iteration = 0; iteration < count * 4; iteration += 1) {
    const cluster = tightestCluster();
    remove(cluster);
    const hole = largestVoid();
    if (hole === cluster) {
      place(cluster);
      break;
    }
    place(hole);
  }

  const rank = new Int32Array(count).fill(-1);
  const prototype = Uint8Array.from(binary);

  // Phase I: unpick the prototype, tightest cluster first.
  for (let index = initialOnes - 1; index >= 0; index -= 1) {
    const cluster = tightestCluster();
    remove(cluster);
    rank[cluster] = index;
  }

  // Phases II/III: refill from the prototype, largest void first.
  binary.set(prototype);
  energy.fill(0);
  for (let index = 0; index < count; index += 1) {
    if (binary[index] === 1) stamp(index, 1);
  }
  for (let index = initialOnes; index < count; index += 1) {
    const hole = largestVoid();
    place(hole);
    rank[hole] = index;
  }

  const pixels = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    pixels[index] = Math.round(rank[index] * 255 / (count - 1));
  }
  return pixels;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- PNG ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** Standard minimum-sum-of-absolute-differences filter choice, per scanline. */
function filterScanlines(pixels, width, height, channels) {
  const stride = width * channels;
  const out = Buffer.alloc((stride + 1) * height);
  const candidates = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  for (let y = 0; y < height; y += 1) {
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prior = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);
    let bestFilter = 0;
    let bestScore = Infinity;
    for (let filter = 0; filter < 5; filter += 1) {
      const target = candidates[filter];
      let score = 0;
      for (let x = 0; x < stride; x += 1) {
        const left = x >= channels ? row[x - channels] : 0;
        const up = prior ? prior[x] : 0;
        const upLeft = prior && x >= channels ? prior[x - channels] : 0;
        let value;
        switch (filter) {
          case 0: value = row[x]; break;
          case 1: value = row[x] - left; break;
          case 2: value = row[x] - up; break;
          case 3: value = row[x] - ((left + up) >> 1); break;
          default: value = row[x] - paeth(left, up, upLeft); break;
        }
        const byte = value & 255;
        target[x] = byte;
        score += byte < 128 ? byte : 256 - byte;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
      }
    }
    out[y * (stride + 1)] = bestFilter;
    candidates[bestFilter].copy(out, y * (stride + 1) + 1);
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function encodePng(pixels, width, height, channels) {
  const colorType = channels === 1 ? 0 : 2;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(filterScanlines(Buffer.from(pixels), width, height, channels), { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Decoder for our own output only. `--check` compares PIXELS, not file bytes:
 * a zlib upgrade in a future Node may legitimately re-pack the same image, and
 * a check that fails on that would train people to ignore it.
 */
function decodePng(bytes) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const data = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = body[9] === 0 ? 1 : 3;
    } else if (type === "IDAT") {
      data.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let value = row[x];
      switch (filter) {
        case 1: value += left; break;
        case 2: value += up; break;
        case 3: value += (left + up) >> 1; break;
        case 4: value += paeth(left, up, upLeft); break;
        default: break;
      }
      pixels[y * stride + x] = value & 255;
    }
  }
  return { channels, height, pixels, width };
}

// --- run ---------------------------------------------------------------------

for (const phase of PHASES) {
  phase.shadowDirection = hueDirection(phase.shadowAnchor);
  phase.highlightDirection = hueDirection(phase.highlightAnchor);
  phase.liftDirection = liftDirection(phase.liftTint);
}

const strip = buildLutStrip();
const lutPng = encodePng(strip.pixels, strip.width, strip.height, 3);
const noisePixels = buildBlueNoise(BLUE_NOISE_SIZE, 0x5eed10ad);
const noisePng = encodePng(noisePixels, BLUE_NOISE_SIZE, BLUE_NOISE_SIZE, 1);

const lutSha = createHash("sha256").update(lutPng).digest("hex");
const noiseSha = createHash("sha256").update(noisePng).digest("hex");

const artifacts = [
  { bytes: lutPng, channels: 3, name: "garden-grade-lut.png", path: lutPath, pixels: strip.pixels, sha256: lutSha },
  { bytes: noisePng, channels: 1, name: "garden-blue-noise.png", path: blueNoisePath, pixels: noisePixels, sha256: noiseSha },
];

const problems = [];
if (checkOnly) {
  for (const artifact of artifacts) {
    let current;
    try {
      current = readFileSync(artifact.path);
    } catch {
      problems.push(`${artifact.name} is missing; run this generator without --check.`);
      continue;
    }
    const decoded = decodePng(current);
    if (!Buffer.from(artifact.pixels).equals(decoded.pixels)) {
      problems.push(`${artifact.name} is stale; rerun this generator without --check.`);
    }
  }
  // The runtime carries a content-hash cache-buster per texture. A stale one
  // ships a stale texture behind a long-lived cache header, which is the exact
  // failure a hashed URL exists to prevent, so it is checked here too.
  const consumer = readFileSync(consumerPath, "utf8");
  for (const artifact of artifacts) {
    const found = new RegExp(`${artifact.name.replace(".", "\\.")}\\?v=([0-9a-f]{12})`).exec(consumer);
    if (!found) {
      problems.push(`src/three/garden-post.ts does not reference ${artifact.name} with a ?v= content hash.`);
    } else if (found[1] !== artifact.sha256.slice(0, 12)) {
      problems.push(
        `src/three/garden-post.ts pins ${artifact.name}?v=${found[1]}, but the generated file hashes to ${artifact.sha256.slice(0, 12)}.`,
      );
    }
  }
} else {
  mkdirSync(outputDirectory, { recursive: true });
  for (const artifact of artifacts) writeFileSync(artifact.path, artifact.bytes);
}

console.log(JSON.stringify({
  blueNoise: {
    bytes: noisePng.length,
    method: "void-and-cluster (Ulichney 1993), wrap-around Gaussian sigma 1.5",
    sha256: noiseSha,
    size: BLUE_NOISE_SIZE,
    url: `/pharosville/textures/garden-blue-noise.png?v=${noiseSha.slice(0, 12)}`,
  },
  lut: {
    bands: PHASES.map((phase) => phase.id),
    bytes: lutPng.length,
    dimensions: `${strip.width}x${strip.height}`,
    phases: strip.stats,
    sha256: lutSha,
    size: LUT_SIZE,
    strength: LUT_STRENGTH,
    url: `/pharosville/textures/garden-grade-lut.png?v=${lutSha.slice(0, 12)}`,
  },
  mode: checkOnly ? "check" : "write",
  totalBytes: lutPng.length + noisePng.length,
}, null, 2));

if (problems.length > 0) {
  console.error("Garden LUT artifacts are out of date:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
