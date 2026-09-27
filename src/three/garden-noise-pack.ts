import { LinearFilter, NoColorSpace, RepeatWrapping, TextureLoader, type Texture } from "three";

/**
 * The ONE shared garden-noise texture (Hour-Print W8.4, K41, headroom-6).
 *
 * The whole-map texture census is at its 72/72 ceiling (`TESTING.md`), so no
 * lane may ship a noise texture of its own. Every noise a shader needs comes
 * from this single 256x256 RGBA8 pack, generated bit-exact by
 * `scripts/pharosville/generate-garden-luts.mjs` (`npm run check:garden-luts`
 * guards pixels and the `?v=` pin below):
 *
 *   R  blue-noise dither — the 64x64 void-and-cluster mask, repeated 4x4. It
 *      keeps its 64-pixel period and is addressed 1:1 with device pixels
 *      (`gl_FragCoord.xy / GARDEN_NOISE_PACK_SIZE`), which lands every fetch on
 *      a texel centre, so linear filtering returns the exact mask value.
 *   G  fbm — five octaves of periodic gradient noise, 0..1.
 *   B  Worley F1 — distance to the nearest of 16x16 seeded features, 0..1.
 *   A  curl — direction of a divergence-free flow as angle/2π. Angles wrap, so
 *      read A with `texelFetch` (a filtered fetch across the 1→0 seam turns
 *      the flow around); `vec2(cos, sin)(2π·a)` is the unit direction.
 *
 * Every channel tiles seamlessly at 256. One module-owned texture is leased to
 * every consumer: the GPU holds it once however many materials sample it, and
 * the last release frees it.
 */
export const GARDEN_NOISE_PACK_URL = "/pharosville/textures/garden-noise-pack.png?v=dc6fbffda05e";
export const GARDEN_NOISE_PACK_SIZE = 256;

export interface GardenNoisePackLease {
  readonly texture: Texture;
  /** Idempotent; the texture is disposed when the last lease is released. */
  release(): void;
}

interface SharedNoisePack {
  readonly texture: Texture;
  readonly waiting: Set<() => void>;
  ready: boolean;
  leases: number;
}

let shared: SharedNoisePack | null = null;

function createSharedNoisePack(): SharedNoisePack {
  const pack: SharedNoisePack = {
    leases: 0,
    ready: false,
    texture: new TextureLoader().load(GARDEN_NOISE_PACK_URL, () => {
      pack.ready = true;
      for (const onReady of pack.waiting) onReady();
      pack.waiting.clear();
    }),
    waiting: new Set(),
  };
  const texture = pack.texture;
  texture.name = "garden-noise-pack";
  // Raw data, not colour: no transfer function on read, no mip averaging of
  // the dither, and no Y flip — the generator's row 0 is the texture's row 0.
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.flipY = false;
  return pack;
}

/**
 * Lease the pack. `onReady` runs once the PNG has decoded (synchronously when
 * it already has). Returns null without a DOM, where no image can decode —
 * the same guard every texture loader in the garden uses.
 */
export function acquireGardenNoisePack(onReady: () => void): GardenNoisePackLease | null {
  if (typeof document === "undefined") return null;
  shared ??= createSharedNoisePack();
  const pack = shared;
  pack.leases += 1;
  if (pack.ready) onReady();
  else pack.waiting.add(onReady);
  let released = false;
  return {
    texture: pack.texture,
    release() {
      if (released) return;
      released = true;
      pack.waiting.delete(onReady);
      pack.leases -= 1;
      if (pack.leases > 0) return;
      pack.texture.dispose();
      if (shared === pack) shared = null;
    },
  };
}
