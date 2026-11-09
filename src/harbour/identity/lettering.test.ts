import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import font from "../../../public/harbour/chart-lettering.json";

describe("chart lettering atlas", () => {
  it("decodes the lossless runtime WebP to the original PNG's exact pixels and dimensions", async () => {
    const [png, webp] = await Promise.all(["png", "webp"].map((ext) => sharp(resolve(__dirname, `../../../public/harbour/chart-lettering.${ext}`))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    expect([webp.info.width, webp.info.height]).toEqual(font.atlas);
    expect(webp.info).toEqual(png.info);
    expect(webp.data.equals(png.data)).toBe(true);
  });
});

/** TS twin of the print's tone by the hour (lettering.ts FRAG), pinned to the source below. */
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const silver = (night: number) => smoothstep(0.5, 0.65, night);
const density = (night: number) => mix(mix(0.86, 0.55, smoothstep(0.0, 0.15, night)), 0.13, silver(night));
const halo = (night: number) => 1 - smoothstep(0.0, 0.12, night);

describe("chart lettering tone by the hour", () => {
  it("keeps the day print and the night silver exactly as they were", () => {
    expect([density(0), silver(0), halo(0)]).toEqual([0.86, 0, 1]);           // noon: dark ink .86, the full pale halo
    expect([density(1), silver(1), halo(1)]).toEqual([0.13, 1, 0]);           // night: faint silver .13, no halo
  });

  it("holds a thinner dark print through dawn, the golden hour and sunset, and turns silver only after sunset", () => {
    for (let n = 0.12; n <= 0.5; n += 0.01) {
      expect(silver(n)).toBe(0);                                              // dark ink, never a mid-grey glow
      expect(density(n)).toBeGreaterThanOrEqual(0.55 - 1e-9);                 // still a legible print
      expect(halo(n)).toBe(0);                                                // the pale knock-out is gone by sunset
    }
    for (let n = 0.65; n <= 1; n += 0.05) expect(silver(n)).toBe(1);
    let prev = Infinity;
    for (let n = 0; n <= 1; n += 0.01) { expect(density(n)).toBeLessThanOrEqual(prev + 1e-12); prev = density(n); }
  });

  it("is the shader's law", () => {
    const src = readFileSync(resolve(__dirname, "lettering.ts"), "utf8");
    expect(src).toContain("float silver = smoothstep(0.5, 0.65, uNight);");
    expect(src).toContain("float dens = mix(mix(0.86, 0.55, smoothstep(0.0, 0.15, uNight)), 0.13, silver) * grain;");
    expect(src).toContain("vec3 ink = mix(uInkDay, uInkNight, silver);");
    expect(src).toContain("gl_FragColor = vec4(uHaloCol, halo * uHalo * (1.0 - smoothstep(0.0, 0.12, uNight)) * vA);");
    // the day knock-out is a faint wash (.12 printed a pale rim round the names on the deeper v1.6.0 sea)
    expect(src).toContain("uHalo: { value: 0.04 },");
  });
});
