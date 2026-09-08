import { describe, expect, it } from "vitest";
import { AdditiveBlending, Box3, Mesh, MeshStandardMaterial, ShaderMaterial, Vector3 } from "three";
import { GARDEN_LIGHTHOUSE_HEIGHT } from "../systems/garden-observatory-slice";
import { lampStatusModulationForMix } from "../systems/lamp-status";
import {
  GARDEN_LIGHTHOUSE_BEAM_BASE_RADIUS,
  GARDEN_LIGHTHOUSE_BEAM_LENGTH,
  GARDEN_LIGHTHOUSE_BEAM_CORE_OPACITY_RATIO,
  GARDEN_LIGHTHOUSE_BEAM_CORE_RADIUS,
  GARDEN_LIGHTHOUSE_BEAM_POOL_DISTANCE,
  LIGHTHOUSE_RIM_UNIFORMS,
  LIGHTHOUSE_WINDOW_MATERIAL_NAME,
  collectLighthouseGlowMaterials,
  createLighthouse,
  updateLighthouseLampStatus,
  updateLighthouseRimLight,
} from "./garden-lighthouse";
import { dayCyclePhase } from "./garden-day-cycle";
import { disposeThreeObjectTree } from "./garden-util";

describe("garden lighthouse beam ownership", () => {
  it("keeps the fallback silhouette aligned with the monumental GLB envelope", () => {
    const lighthouse = createLighthouse();
    const bounds = new Box3().setFromObject(lighthouse.shell);
    const size = bounds.getSize(new Vector3());
    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(bounds.max.y).toBeCloseTo(GARDEN_LIGHTHOUSE_HEIGHT, 5);
    expect(size.x).toBeCloseTo(12.4, 5);
    expect(size.z).toBeCloseTo(12.4, 5);
    disposeThreeObjectTree(lighthouse.root);
  });

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

  it("nests a narrow 0.25 high-energy core in the soft cone", () => {
    const lighthouse = createLighthouse();
    const cone = lighthouse.beam.getObjectByName("lighthouse-beam-cone") as Mesh;
    const core = cone.geometry.getAttribute("aBeamCore");
    expect(Array.from(core.array)).toContain(0);
    expect(Array.from(core.array)).toContain(1);
    expect(
      Math.atan(GARDEN_LIGHTHOUSE_BEAM_CORE_RADIUS / GARDEN_LIGHTHOUSE_BEAM_LENGTH)
        * 180 / Math.PI,
    ).toBeLessThanOrEqual(3);
    expect(0.11 * GARDEN_LIGHTHOUSE_BEAM_CORE_OPACITY_RATIO).toBeCloseTo(0.25, 6);
    expect((cone.material as ShaderMaterial).blending).toBe(AdditiveBlending);
    expect(cone.castShadow).toBe(false);
    expect(cone.receiveShadow).toBe(false);
    // 20 extra triangles: well inside W2.9's +200-triangle ceiling.
    expect(cone.geometry.index!.count / 3).toBe(48);
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

describe("T1.7 rim light (2026-09-07)", () => {
  it("raises the whole rim curve, not just its dusk and night lifts", () => {
    // Base 0.1 -> 0.16, dusk lift 0.04 -> 0.06, night lift 0.08 -> 0.12. The
    // rim is what separates the tower from the sky like an engraving, and at
    // 0.1 it only registered where the fresnel already peaked. The shape was
    // right; it was built on too low a base.
    const strengthAt = (hour: number): number => {
      updateLighthouseRimLight(dayCyclePhase(hour));
      return LIGHTHOUSE_RIM_UNIFORMS.uLighthouseRimStrength.value;
    };
    expect(strengthAt(12)).toBeCloseTo(0.16, 6);
    expect(strengthAt(18.5)).toBeCloseTo(0.2, 2);
    expect(strengthAt(1)).toBeCloseTo(0.28, 6);
    // Still an accent, never a light: it is added straight to emissive.
    expect(strengthAt(1)).toBeLessThan(0.35);
  });
});

describe("T0.2 tower apertures (2026-09-07)", () => {
  it("names every window so the day cycle can find it without a handle", () => {
    // `lighthouse-window-glow` occurred twice in the repo, both declarations,
    // never read — VISUAL_INVARIANTS.md:115 promised these glow at dusk and
    // nothing drove them. The name is now the collection contract, shared by
    // the procedural shell, the generated GLB and the precinct gatehouse.
    const lighthouse = createLighthouse();
    const collected: MeshStandardMaterial[] = [];
    collectLighthouseGlowMaterials(lighthouse.root, collected);
    expect(collected.length).toBeGreaterThan(0);
    for (const material of collected) {
      expect(material.name).toBe(LIGHTHOUSE_WINDOW_MATERIAL_NAME);
      // Emissive-only apertures, and outside the tone mapper — the day-cycle
      // curve peaks at 1.53 so they stay gold rather than clipping to white.
      expect(material.toneMapped).toBe(false);
    }
    // The shell shares ONE aperture material across all three window rows,
    // the lantern gallery and the lantern glass — and the shell merges by
    // material group — so lighting the whole tower is a single write.
    expect(new Set(collected).size).toBe(collected.length);
    expect(collected.length).toBe(1);
    let windowMeshes = 0;
    lighthouse.root.traverse((object) => {
      if (object instanceof Mesh && object.material === collected[0]) windowMeshes += 1;
    });
    expect(windowMeshes).toBeGreaterThanOrEqual(1);
    disposeThreeObjectTree(lighthouse.root);
  });

  it("collects each material once however often it is asked", () => {
    // The GLB attach appends its clones to the same per-build array and can
    // run again on an island rebuild; duplicates must not accumulate.
    const lighthouse = createLighthouse();
    const collected: MeshStandardMaterial[] = [];
    collectLighthouseGlowMaterials(lighthouse.root, collected);
    const first = collected.length;
    collectLighthouseGlowMaterials(lighthouse.root, collected);
    expect(collected.length).toBe(first);
    disposeThreeObjectTree(lighthouse.root);
  });
});
