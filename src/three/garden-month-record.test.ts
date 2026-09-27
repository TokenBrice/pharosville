import { Color, InstancedMesh } from "three";
import { describe, expect, it } from "vitest";
import { hexToOklch } from "../systems/palette";
import type { GardenMonthRecord, PharosVilleWorld } from "../systems/world-types";
import { createTerracedIsland } from "./garden-island";
import { applyGardenMonthRecord } from "./garden-month-record";

const world = { lighthouse: { tile: { x: 40, y: 40 }, detailId: "lighthouse" } } as unknown as PharosVilleWorld;
const CALM: GardenMonthRecord = { averagePsi: 90, growth: 1, sampleCount: 30, spanDays: 29, unavailable: false };
const STRESSED: GardenMonthRecord = { averagePsi: 20, growth: 0, sampleCount: 30, spanDays: 29, unavailable: false };
const MISSING: GardenMonthRecord = { averagePsi: null, growth: 0.5, sampleCount: 0, spanDays: 0, unavailable: true };

/** Mean OKLCH L and C of the pine pads, the red/green balance, and one pad's span. */
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
  const firstPad = foliage.getX(Array.from({ length: foliage.count }, (_, index) => index).find((index) => foliage.getX(index) > 0)!);
  let minX = Infinity;
  let maxX = -Infinity;
  for (let vertex = 0; vertex < foliage.count; vertex += 1) {
    if (foliage.getX(vertex) <= 0) continue;
    color.setRGB(colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex));
    const oklch = hexToOklch(`#${color.getHexString()}`);
    l += oklch.l;
    c += oklch.c;
    red += color.r;
    green += color.g;
    count += 1;
    if (foliage.getX(vertex) === firstPad) {
      minX = Math.min(minX, position.getX(vertex));
      maxX = Math.max(maxX, position.getX(vertex));
    }
  }
  const karikomi = root.getObjectByName("island-karikomi") as InstancedMesh;
  const hedge = hexToOklch(`#${karikomi.getColorAt(0, new Color()).getHexString()}`);
  return { c: c / count, hedgeL: hedge.l, l: l / count, redness: red / green, span: maxX - minX };
}

describe("garden month record rendering", () => {
  const neutral = pineRead(MISSING);

  it("deepens and fills the island evergreens after a calm month, never brightening them", () => {
    const calm = pineRead(CALM);
    expect(calm.l).toBeLessThan(neutral.l - 0.03);
    expect(calm.c).toBeLessThanOrEqual(neutral.c + 0.005);
    expect(calm.hedgeL).toBeLessThan(neutral.hedgeL);
    expect(calm.span).toBeGreaterThan(neutral.span);
  });

  it("thins the pads and browns them toward straw after a stressed month", () => {
    const stressed = pineRead(STRESSED);
    expect(stressed.redness).toBeGreaterThan(neutral.redness);
    expect(stressed.span).toBeLessThan(neutral.span);
  });

  it("leaves a neutral garden when there is no history", () => {
    const again = pineRead(MISSING);
    expect(again).toEqual(neutral);
  });
});
