import { describe, expect, it } from "vitest";

/**
 * The runtime loads public/harbour/sea-sdf.webp; its RGBA channels are data (coast distance etc.), so the
 * WebP must be a lossless, pixel-exact copy of the baked PNG (assets/harbour/sea-sdf.png, not deployed), alpha = 1 throughout (no premultiplication
 * can touch the colour channels). Decoded with sharp when it is installed (it is, through wrangler).
 */
describe("sea-sdf.webp", () => {
  it("decodes to the baked PNG's exact RGBA, alpha 1", async () => {
    let sharp: typeof import("sharp").default | null = null;
    try { sharp = (await import("sharp")).default; } catch { /* no decoder here: nothing to compare */ }
    if (!sharp) { console.warn("sea-sdf.webp: sharp unavailable, not compared"); return; }
    const png = new URL("../../../assets/harbour/sea-sdf.png", import.meta.url).pathname;
    const webp = new URL("../../../public/harbour/sea-sdf.webp", import.meta.url).pathname;
    const [a, b] = await Promise.all([png, webp].map((p) => sharp!(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    expect([b.info.width, b.info.height, b.info.channels]).toEqual([a.info.width, a.info.height, 4]);
    expect(Buffer.compare(a.data, b.data)).toBe(0);
    let opaque = true;
    for (let i = 3; i < b.data.length; i += 4) if (b.data[i] !== 255) { opaque = false; break; }
    expect(opaque).toBe(true);
  }, 30_000);
});

/**
 * E02: the baked SDF still holds the retired mainland; the ocean fades its coast and depth out between
 * SDF_ISLAND_RADII about the layout-bounds centre. Every island shore must stay inside the fade, the mainland's
 * outside it, so no island coast loses its foam and no trace of the mainland's reaches the sea.
 */
describe("sea-sdf.webp and the retired mainland", () => {
  it("keeps every island shore inside the fade and the mainland's shore outside it", async () => {
    let sharp: typeof import("sharp").default | null = null;
    try { sharp = (await import("sharp")).default; } catch { /* no decoder here */ }
    if (!sharp) { console.warn("sea-sdf.webp: sharp unavailable, not measured"); return; }
    const { SDF_ISLAND_RADII, SDF_COAST_RANGE } = await import("./sea-sdf");
    const layout = (await import("../data/layout.json")).default as { bounds: { min: number[]; max: number[] }; sea: { bounds: number[] } };
    const cx = (layout.bounds.min[0] + layout.bounds.max[0]) / 2, cz = (layout.bounds.min[2] + layout.bounds.max[2]) / 2;
    const [minX, minZ, maxX, maxZ] = layout.sea.bounds;
    const webp = new URL("../../../public/harbour/sea-sdf.webp", import.meta.url).pathname;
    const { data, info } = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // shore band: within 12 m of land (the coast foam, the shallows' colour); the PNG's top row is maxZ
    const shore = Math.round((0.5 + 12 / SDF_COAST_RANGE) * 255);
    let islandMax = 0, mainlandMin = Infinity;
    for (let row = 0; row < info.height; row++) for (let col = 0; col < info.width; col++) {
      if (data[(row * info.width + col) * 4] > shore) continue;
      const x = minX + ((col + 0.5) / info.width) * (maxX - minX), z = maxZ - ((row + 0.5) / info.height) * (maxZ - minZ);
      const d = Math.hypot(x - cx, z - cz);
      if (d < 500) islandMax = Math.max(islandMax, d); else mainlandMin = Math.min(mainlandMin, d);
    }
    expect(islandMax).toBeLessThan(SDF_ISLAND_RADII[0] - 15);
    expect(mainlandMin).toBeGreaterThan(SDF_ISLAND_RADII[1] + 15);
  }, 30_000);
});
