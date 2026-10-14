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
