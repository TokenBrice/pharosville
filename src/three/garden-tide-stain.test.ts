import { Mesh } from "three";
import { describe, expect, it } from "vitest";
import { PSI_BAND_SEVERITY, psiBandSeverity } from "../systems/world-types";
import { LIGHTHOUSE_TERRACE_STEPS } from "./garden-lighthouse";
import { createGardenTideStain, TIDE_STAIN_MAX_COURSES } from "./garden-tide-stain";

function stainMesh(root: { getObjectByName(name: string): unknown }): Mesh {
  const mesh = root.getObjectByName("lighthouse-tide-stain");
  expect(mesh).toBeInstanceOf(Mesh);
  return mesh as Mesh;
}

describe("garden tide stain (3c)", () => {
  it("carries one course per band above the calmest one", () => {
    const stain = createGardenTideStain();

    expect(stain.courseCount).toBe(TIDE_STAIN_MAX_COURSES);
    expect(stain.courseCount).toBe(PSI_BAND_SEVERITY.length - 1);
    // MELTDOWN, the worst band there is, must have a course to reach.
    expect(psiBandSeverity("MELTDOWN")).toBe(stain.courseCount);

    stain.dispose();
  });

  it("leaves the stone bare for BEDROCK and for no history at all", () => {
    const stain = createGardenTideStain();

    // The two cases look identical on the rock ON PURPOSE — neither is a mark.
    // Telling them apart is the DOM row's job, and `highWaterMarkLabel` says
    // "the sea never rose past the footing" versus "no index history to read".
    stain.setMark(psiBandSeverity("BEDROCK"));
    expect(stain.root.visible).toBe(false);
    expect(stainMesh(stain.root).geometry.drawRange.count).toBe(0);

    stain.setMark(null);
    expect(stain.root.visible).toBe(false);
    expect(stainMesh(stain.root).geometry.drawRange.count).toBe(0);

    stain.dispose();
  });

  it("climbs a course for every step of severity", () => {
    const stain = createGardenTideStain();
    const geometry = stainMesh(stain.root).geometry;

    let previous = 0;
    for (const band of PSI_BAND_SEVERITY.slice(1)) {
      stain.setMark(psiBandSeverity(band));
      expect(stain.root.visible, band).toBe(true);
      expect(geometry.drawRange.count, band).toBeGreaterThan(previous);
      previous = geometry.drawRange.count;
    }
    // The worst band spends the whole scale; nothing is left unreachable.
    expect(previous).toBe(geometry.getIndex()?.count);

    stain.dispose();
  });

  it("never reads past the courses it owns", () => {
    const stain = createGardenTideStain();
    const geometry = stainMesh(stain.root).geometry;

    // A band this build does not know could rank past the top of the scale;
    // that must clamp, not run off the end of the index buffer.
    stain.setMark(40);
    expect(geometry.drawRange.count).toBe(geometry.getIndex()?.count);
    stain.setMark(-3);
    expect(geometry.drawRange.count).toBe(0);

    stain.dispose();
  });

  it("bands the terrace it stands on rather than floating around it", () => {
    const stain = createGardenTideStain();
    stain.setMark(TIDE_STAIN_MAX_COURSES);
    const mesh = stainMesh(stain.root);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;

    // Proud of Epic Pharos's 6.2-half-width step, but not enough for a cornice.
    const widest = LIGHTHOUSE_TERRACE_STEPS[0]![0] / 2;
    expect(box.max.x).toBeGreaterThan(widest);
    expect(box.max.x).toBeLessThan(widest + 0.2);
    // Inside the terrace's own 0 - 2.5 run, so it never climbs the tower.
    expect(box.min.y).toBeGreaterThan(0);
    expect(box.max.y).toBeLessThan(2.5);

    stain.dispose();
  });

  it("is built once and never rebuilt as the mark moves", () => {
    // Data refreshes are frequent and the stain is on the hot path for none of
    // them: setting the mark is a draw-range write, not an allocation.
    const stain = createGardenTideStain();
    const geometry = stainMesh(stain.root).geometry;

    stain.setMark(1);
    stain.setMark(5);
    stain.setMark(2);

    expect(stainMesh(stain.root).geometry).toBe(geometry);

    stain.dispose();
  });
});
