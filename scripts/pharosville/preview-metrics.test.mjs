import assert from "node:assert/strict";
import test from "node:test";
import { measureLightRois, polygonLstarStats, readValuePlan } from "./preview-metrics.mjs";

const rect = (x, y, width, height) => [
  { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
];
const frame = (width, values) => ({ width, height: values.length / width, lstar: Float32Array.from(values) });
const annotation = () => ({
  viewport: { width: 6, height: 2 },
  boundaryPairs: [
    { name: "threshold-inlet", a: rect(0, 0, 1, 2), b: rect(3, 0, 1, 2) },
    { name: "headland-water", a: rect(1, 0, 1, 2), b: rect(3, 0, 1, 2) },
  ],
  materialPatches: { stone: rect(2, 0, 1, 2), moss: rect(0, 0, 1, 2), timber: rect(1, 0, 1, 2) },
  approach: { polygon: rect(0, 0, 6, 2), exclusions: [rect(3, 0, 1, 2)] },
});
const values = [6, 9, 12, 2, 6, 6, 6, 9, 12, 2, 6, 6];

test("polygon medians use central values; coverage includes exactly L*6", () => {
  const stats = polygonLstarStats(frame(4, [2, 6, 8, 12]), rect(0, 0, 4, 1));
  assert.equal(stats.median, 7);
  assert.equal(stats.mean, 7);
  assert.equal(stats.coverageAtOrAbove, 0.75);
  assert.equal(stats.brightShare, 0.25);
  assert.equal(polygonLstarStats(frame(3, [2, 6, 12]), rect(0, 0, 3, 1)).median, 6);
});

test("pixel-centre polygon sampling clips and respects nonrectangular shapes", () => {
  const image = frame(3, [1, 2, 100, 3, 100, 100]);
  const triangle = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 2 }];
  const stats = polygonLstarStats(image, triangle);
  assert.equal(stats.pixels, 3);
  assert.equal(stats.median, 2);
  assert.equal(polygonLstarStats(image, rect(-1, -1, 2, 2)).pixels, 1);
  assert.equal(polygonLstarStats(image, rect(10, 10, 1, 1)), null);
});

test("boundary and material median contrasts meet inclusive floors, copying polygons", () => {
  const rois = annotation();
  const result = measureLightRois(frame(6, values), rois, { cssWidth: 6, cssHeight: 2 });
  assert.deepEqual(result.boundaryPairs.map((pair) => pair.contrast), [4, 7]);
  assert.deepEqual(result.materialPairs.map((pair) => pair.contrast), [6, 3, 3]);
  assert.equal(result.approach.pixels, 10);
  assert.equal(result.approach.coverageAtOrAbove, 1);
  assert.equal(result.pass, true);
  assert.deepEqual(result.polygons, rois);
  rois.boundaryPairs[0].a[0].x = 999;
  assert.equal(result.polygons.boundaryPairs[0].a[0].x, 0);
});

test("DPR2 samples the same CSS polygons without changing the arithmetic", () => {
  const doubled = values.slice(0, 6).flatMap((value) => [value, value]);
  const image = frame(12, [...doubled, ...doubled, ...doubled, ...doubled]);
  const result = measureLightRois(image, annotation(), { cssWidth: 6, cssHeight: 2 });
  assert.equal(result.pass, true);
  assert.equal(result.approach.pixels, 40);
  assert.deepEqual(result.boundaryPairs.map((pair) => pair.contrast), [4, 7]);
});

test("approach exclusions are a union and the 90% floor is inclusive", () => {
  const rois = annotation();
  rois.approach.exclusions.push(rect(3, 0, 1, 2));
  const image = frame(6, [6, 9, 12, 2, 5, 6, 6, 9, 12, 2, 6, 6]);
  const result = measureLightRois(image, rois, { cssWidth: 6, cssHeight: 2 });
  assert.equal(result.approach.pixels, 10);
  assert.equal(result.approach.coverageAtOrAbove, 0.9);
  assert.equal(result.approach.pass, true);
  image.lstar[5] = 5;
  assert.equal(measureLightRois(image, rois, { cssWidth: 6, cssHeight: 2 }).approach.pass, false);
});

test("insufficient contrast and empty regions cannot pass", () => {
  const image = frame(6, values.map(() => 6));
  const rois = annotation();
  assert.equal(measureLightRois(image, rois, { cssWidth: 6, cssHeight: 2 }).pass, false);
  rois.approach.polygon = rect(10, 10, 1, 1);
  assert.equal(measureLightRois(image, rois, { cssWidth: 6, cssHeight: 2 }).approach.pass, false);
});

test("different aspect annotations and malformed vertices are rejected", () => {
  const rois = annotation();
  assert.throws(() => measureLightRois(frame(6, values), rois, { cssWidth: 3, cssHeight: 4 }), /viewport/);
  rois.materialPatches.stone[0].x = Number.NaN;
  assert.throws(() => measureLightRois(frame(6, values), rois, { cssWidth: 6, cssHeight: 2 }), /finite/);
});

test("night ninths are diagnostic, not near-black land targets", async () => {
  const plan = await readValuePlan(new URL("../../docs/pharosville/VISUAL_INVARIANTS.md", import.meta.url));
  assert.equal(plan.noon.length, 9);
  assert.equal(plan.dusk.length, 9);
  assert.equal(plan.night, null);
});
