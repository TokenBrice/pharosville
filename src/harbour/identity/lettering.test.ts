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
