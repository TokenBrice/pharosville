import { Color, InstancedMesh } from "three";
import { describe, expect, it } from "vitest";
import { hexToOklch } from "../systems/palette";
import type { GardenMonthRecord } from "../systems/world-types";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { createTerracedIsland } from "./garden-island";
import { applyGardenMonthRecord } from "./garden-month-record";

const world = buildPharosVilleWorld(makePharosVilleWorldInput());
const CALM: GardenMonthRecord = { averagePsi: 90, growth: 1, sampleCount: 30, spanDays: 29, unavailable: false };
const STRESSED: GardenMonthRecord = { averagePsi: 20, growth: 0, sampleCount: 30, spanDays: 29, unavailable: false };
const MISSING: GardenMonthRecord = { averagePsi: null, growth: 0.5, sampleCount: 0, spanDays: 0, unavailable: true };

/** Mean pine pigment response and the horizontal span of every independently ranked pad. */
function pineRead(record: GardenMonthRecord) {
  const root = createTerracedIsland(world).root;
  applyGardenMonthRecord(root, record);
  const grove = root.getObjectByName("island-niwaki-grove") as InstancedMesh;
  const foliage = grove.geometry.getAttribute("aGardenFoliage");
  const colors = grove.geometry.getAttribute("color");
  const position = grove.geometry.getAttribute("position");
  const color = new Color();
  let l = 0;
  let c = 0;
  let red = 0;
  let green = 0;
  let count = 0;
  const spans = new Map<number, { min: number; max: number }>();
  for (let vertex = 0; vertex < foliage.count; vertex += 1) {
    if (foliage.getX(vertex) <= 0) continue;
    color.setRGB(colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex));
    const oklch = hexToOklch(`#${color.getHexString()}`);
    l += oklch.l;
    c += oklch.c;
    red += color.r;
    green += color.g;
    count += 1;
    const rank = foliage.getX(vertex);
    const span = spans.get(rank) ?? { min: Infinity, max: -Infinity };
    span.min = Math.min(span.min, position.getX(vertex));
    span.max = Math.max(span.max, position.getX(vertex));
    spans.set(rank, span);
  }
  const karikomi = root.getObjectByName("island-karikomi") as InstancedMesh;
  const hedge = hexToOklch(`#${karikomi.getColorAt(0, new Color()).getHexString()}`);
  return { c: c / count, hedgeL: hedge.l, l: l / count, redness: red / green,
    spans: Array.from(spans.values(), ({ min, max }) => max - min) };
}

describe("garden month record rendering", () => {
  const neutral = pineRead(MISSING);

  it("deepens and fills the island evergreens after a calm month, never brightening them", () => {
    const calm = pineRead(CALM);
    expect(calm.l).toBeLessThan(neutral.l - 0.03);
    expect(calm.c).toBeLessThanOrEqual(neutral.c + 0.005);
    expect(calm.hedgeL).toBeLessThan(neutral.hedgeL);
    for (let pad = 0; pad < calm.spans.length; pad += 1) {
      expect(calm.spans[pad]! / neutral.spans[pad]!).toBeCloseTo(1.07, 5);
    }
  });

  it("thins the pads and browns them toward straw after a stressed month", () => {
    const stressed = pineRead(STRESSED);
    expect(stressed.redness).toBeGreaterThan(neutral.redness);
    for (let pad = 0; pad < stressed.spans.length; pad += 1) {
      expect(stressed.spans[pad]! / neutral.spans[pad]!).toBeCloseTo(0.93, 5);
    }
  });

  it("scales every positive-rank pad about its own centre and seat without touching maple or bark", () => {
    for (const record of [CALM, STRESSED]) {
      const root = createTerracedIsland(world).root;
      const grove = root.getObjectByName("island-niwaki-grove") as InstancedMesh;
      const geometry = grove.geometry;
      const foliage = geometry.getAttribute("aGardenFoliage");
      const position = geometry.getAttribute("position");
      const beforePosition = position.array.slice();
      const beforeColor = geometry.getAttribute("color").array.slice();
      const beforeNormal = geometry.getAttribute("normal").array.slice();
      const beforeIndex = geometry.index!.array.slice();
      const beforeRanks = foliage.array.slice();
      const beforeCentres = geometry.getAttribute("aGardenPadCentre").array.slice();
      const hedge = root.getObjectByName("island-karikomi") as InstancedMesh;
      const hedgeMatrices = hedge.instanceMatrix.array.slice();
      const pads = new Map<number, { vertices: number[]; floor: number; x: number; z: number }>();
      for (let vertex = 0; vertex < foliage.count; vertex += 1) {
        const rank = foliage.getX(vertex);
        if (rank <= 0) continue;
        const pad = pads.get(rank) ?? { vertices: [], floor: Infinity, x: 0, z: 0 };
        pad.vertices.push(vertex);
        pad.floor = Math.min(pad.floor, position.getY(vertex));
        pad.x += position.getX(vertex);
        pad.z += position.getZ(vertex);
        pads.set(rank, pad);
      }
      applyGardenMonthRecord(root, record);
      const scale = record === CALM ? 1.07 : 0.93;
      for (const pad of pads.values()) {
        const cx = pad.x / pad.vertices.length;
        const cz = pad.z / pad.vertices.length;
        for (const vertex of pad.vertices) {
          expect(position.getX(vertex)).toBeCloseTo(cx + (beforePosition[vertex * 3]! - cx) * scale, 5);
          expect(position.getY(vertex)).toBeCloseTo(pad.floor + (beforePosition[vertex * 3 + 1]! - pad.floor) * scale, 5);
          expect(position.getZ(vertex)).toBeCloseTo(cz + (beforePosition[vertex * 3 + 2]! - cz) * scale, 5);
        }
      }
      const color = geometry.getAttribute("color");
      for (let vertex = 0; vertex < foliage.count; vertex += 1) {
        if (foliage.getX(vertex) > 0) continue;
        for (let axis = 0; axis < 3; axis += 1) {
          expect(position.array[vertex * 3 + axis]).toBe(beforePosition[vertex * 3 + axis]);
          expect(color.array[vertex * 3 + axis]).toBe(beforeColor[vertex * 3 + axis]);
        }
      }
      expect(geometry.getAttribute("normal").array).toEqual(beforeNormal);
      expect(geometry.index!.array).toEqual(beforeIndex);
      expect(foliage.array).toEqual(beforeRanks);
      expect(geometry.getAttribute("aGardenPadCentre").array).toEqual(beforeCentres);
      expect(hedge.instanceMatrix.array).toEqual(hedgeMatrices);
    }
  });

  it("leaves unavailable or absent history identical to a fresh unmodified garden", () => {
    for (const record of [MISSING, undefined]) {
      const root = createTerracedIsland(world).root;
      const grove = root.getObjectByName("island-niwaki-grove") as InstancedMesh;
      const positions = grove.geometry.getAttribute("position").array.slice();
      const colors = grove.geometry.getAttribute("color").array.slice();
      const normals = grove.geometry.getAttribute("normal").array.slice();
      const hedge = root.getObjectByName("island-karikomi") as InstancedMesh;
      const hedgeColors = hedge.instanceColor!.array.slice();
      applyGardenMonthRecord(root, record);
      expect(grove.geometry.getAttribute("position").array).toEqual(positions);
      expect(grove.geometry.getAttribute("color").array).toEqual(colors);
      expect(grove.geometry.getAttribute("normal").array).toEqual(normals);
      expect(hedge.instanceColor!.array).toEqual(hedgeColors);
    }
  });
});
