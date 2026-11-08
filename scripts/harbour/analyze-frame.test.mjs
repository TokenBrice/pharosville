import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { analyzePixels, analyzeFrame, pixelMetrics, speckDensity, box } from "./analyze-frame.mjs";

test("linear sRGB luminance, L* and HSL saturation have standard endpoints", () => {
  assert.equal(pixelMetrics(0, 0, 0).lightness, 0);
  assert.equal(pixelMetrics(255, 255, 255).lightness, 100);
  assert.equal(pixelMetrics(128, 128, 128).saturation, 0);
  assert.equal(pixelMetrics(255, 0, 0).saturation, 1);
  assert.ok(Math.abs(pixelMetrics(255, 0, 0).luminance - 0.2126) < 1e-8);
});
test("hero band excludes tower; fire owns the brightest 0.7%; regions average correctly", async () => {
  const pixels = Buffer.alloc(100 * 100 * 3, 0);
  const paint = (x, y, w, h, v) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) pixels.fill(v, (yy * 100 + xx) * 3, (yy * 100 + xx + 1) * 3); };
  paint(0, 0, 10, 10, 128); paint(20, 0, 10, 10, 200); paint(80, 0, 10, 7, 255);
  const options = { tower: [0, 0, 10, 10], band: [0, 0, 40, 10], fire: [80, 0, 10, 7], region: [0, 50, 100, 50] };
  const result = analyzePixels(pixels, 100, 100, options);
  assert.equal(result.hero.bandShare, 1 / 3);
  assert.equal(result.fire.brightestShare, 1);
  assert.equal(result.region.meanLStar, 0);
  const png = await sharp(pixels, { raw: { width: 100, height: 100, channels: 3 } }).png().toBuffer();
  assert.deepEqual(await analyzeFrame(png, options), result);
});
test("cutoff ties are weighted fairly; large bright areas do not count as specks", () => {
  const options = { tower: [0, 0, 1, 1], band: [0, 0, 10, 10], fire: [0, 0, 5, 10], region: [0, 0, 10, 10] };
  assert.equal(analyzePixels(Buffer.alloc(300), 10, 10, options).fire.brightestShare, 0.5);
  assert.equal(analyzePixels(Buffer.alloc(300, 128), 10, 10, options).hero.bandShare, 1);
  const l = new Float64Array(100); l[0] = l[11] = l[99] = 100;
  assert.equal(speckDensity(l, 10, 10, options.region, 85, 1).count, 1); // diagonal pair is one two-pixel island
  assert.equal(speckDensity(l, 10, 10, options.region).per10kPixels, 200);
  assert.throws(() => box("-1,0,2,2", 10, 10));
});
