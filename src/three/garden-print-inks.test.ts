import { describe, expect, it } from "vitest";
import { BoxGeometry, Color, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import {
  GARDEN_PRINT_AI_INKS,
  gardenFirstLight,
  gardenPrintInkUniforms,
  isGardenPrintInkExempt,
  updateGardenPrintInks,
} from "./garden-print-inks";
import { HARBOR_PALETTE } from "../systems/palette";

const luma = (color: Color): number => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

describe("ai-zuri shade plate", () => {
  it("re-inks the shade without adding or removing energy at any beat mix", () => {
    for (const beat of Object.values(GARDEN_PRINT_AI_INKS)) expect(luma(beat.ink)).toBeCloseTo(1, 9);
    updateGardenPrintInks(18.5, { dawn: 0, day: 0, golden: 0.4, blue: 0.6, night: 0 });
    expect(luma(gardenPrintInkUniforms.uGardenAiInk.value)).toBeCloseTo(1, 9);
    expect(gardenPrintInkUniforms.uGardenAiAmount.value).toBeCloseTo(
      0.4 * GARDEN_PRINT_AI_INKS.golden.amount + 0.6 * GARDEN_PRINT_AI_INKS.blue.amount,
      12,
    );
  });

  it("never inks identity cloth, marks or practicals, but prints the tower stone", () => {
    const mesh = (name: string, material: MeshStandardMaterial | MeshBasicMaterial) => {
      const object = new Mesh(new BoxGeometry(), material);
      object.name = name;
      return object;
    };
    const atlasSail = new MeshStandardMaterial();
    atlasSail.userData.gardenSailAtlas = true;
    const exempt = [
      mesh("hero-hull", atlasSail),
      mesh("fleet-pennants", new MeshStandardMaterial()),
      mesh("dock-chain-flag", new MeshStandardMaterial()),
      mesh("hero-merged-canvas", new MeshStandardMaterial()),
      mesh("garden-cue-marker", new MeshBasicMaterial()),
      mesh("station-lamp", new MeshStandardMaterial({ toneMapped: false })),
      mesh("hull-flag", new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_glow, emissiveIntensity: 0.08 })),
    ];
    for (const object of exempt) expect(isGardenPrintInkExempt(object, object.material), object.name).toBe(true);
    const stone = new MeshStandardMaterial({ emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: 0.015 });
    stone.name = "weathered-limestone";
    expect(isGardenPrintInkExempt(mesh("lighthouse-shell-part-0", stone), stone)).toBe(false);
    const timber = new MeshStandardMaterial();
    expect(isGardenPrintInkExempt(mesh("island-merged-0", timber), timber)).toBe(false);
  });
});

describe("first light, last light", () => {
  it("sweeps the warm line down the tower as the sun climbs and lets go by mid-morning", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let elevation = 0; elevation <= 0.17; elevation += 0.01) {
      const { lineY } = gardenFirstLight(elevation);
      expect(lineY).toBeLessThanOrEqual(previous);
      previous = lineY;
    }
    expect(gardenFirstLight(0).lineY).toBeGreaterThan(38);
    expect(gardenFirstLight(0.17).lineY).toBeLessThan(0);
    // At 18:30 on the pinned day (displayed sun ≈ 0.057 rad) the whole world
    // is still in the golden key; the line only climbs in the last minutes.
    expect(gardenFirstLight(0.057).lineY).toBeLessThan(0);
    expect(gardenFirstLight(0.08).gate).toBe(1);
    expect(gardenFirstLight(0.3).gate).toBe(0);
    expect(gardenFirstLight(-0.2).gate).toBe(0);
  });
});
