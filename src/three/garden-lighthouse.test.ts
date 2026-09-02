import { describe, expect, it } from "vitest";
import { lampStatusModulationForMix } from "../systems/lamp-status";
import {
  GARDEN_LIGHTHOUSE_BEAM_BASE_RADIUS,
  GARDEN_LIGHTHOUSE_BEAM_LENGTH,
  GARDEN_LIGHTHOUSE_BEAM_POOL_DISTANCE,
  createLighthouse,
  updateLighthouseLampStatus,
} from "./garden-lighthouse";
import { disposeThreeObjectTree } from "./garden-util";

describe("garden lighthouse beam ownership", () => {
  it("creates one primary cone, one low-tier fallback, and no radial fan", () => {
    const lighthouse = createLighthouse();
    expect(lighthouse.root.getObjectByName("lighthouse-ray-fan")).toBeUndefined();
    expect(lighthouse.root.getObjectByName("lighthouse-beam-outer-cone")).toBeUndefined();
    expect(lighthouse.beam.children.map((child) => child.name)).toEqual([
      "lighthouse-beam-cone",
      "lighthouse-beam-dust",
      "lighthouse-beam",
    ]);
    disposeThreeObjectTree(lighthouse.root);
  });

  it("reaches the rim with a broad, subordinate landing envelope", () => {
    expect(GARDEN_LIGHTHOUSE_BEAM_LENGTH).toBeGreaterThanOrEqual(90);
    expect(GARDEN_LIGHTHOUSE_BEAM_BASE_RADIUS).toBeGreaterThanOrEqual(4);
    expect(GARDEN_LIGHTHOUSE_BEAM_POOL_DISTANCE).toBeLessThan(
      GARDEN_LIGHTHOUSE_BEAM_LENGTH,
    );
    expect(GARDEN_LIGHTHOUSE_BEAM_POOL_DISTANCE).toBeGreaterThanOrEqual(80);
  });

  it("layers cool/dim status modulation over the lamp and beam materials", () => {
    const lighthouse = createLighthouse();
    const warm = lighthouse.light.intensity;
    const warmColor = lighthouse.light.color.getHex();
    const lampTarget = {
      beacon: lighthouse.beacon,
      beaconHalo: lighthouse.beaconHalo,
      beam: lighthouse.beam,
      lighthouseLight: lighthouse.light,
    };
    updateLighthouseLampStatus(lampTarget, lampStatusModulationForMix(1));
    expect(lighthouse.light.intensity).toBeLessThan(warm);
    expect(lighthouse.light.color.getHex()).not.toBe(warmColor);

    const beamMaterial = (lighthouse.beam.children[0] as unknown as {
      material: { uniforms: { uColor: { value: { getHex: () => number } } } };
    }).material;
    expect(beamMaterial.uniforms.uColor.value.getHex()).not.toBe(0);
    updateLighthouseLampStatus(lampTarget, lampStatusModulationForMix(2));
    expect(lighthouse.light.intensity).toBeCloseTo(warm * 0.82 * 0.2, 6);
    disposeThreeObjectTree(lighthouse.root);
  });
});
