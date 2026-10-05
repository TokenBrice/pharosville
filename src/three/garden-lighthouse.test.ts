import { describe, expect, it } from "vitest";
import { Box3, BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Object3D, ShaderMaterial, Vector3, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import {
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_TOWER_BEACON_WORLD_Y,
  GARDEN_TOWER_CROWN_WORLD_Y,
} from "../systems/garden-observatory-slice";
import { lampStatusModulationForMix } from "../systems/lamp-status";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  GARDEN_LIGHTHOUSE_BEAM_BASE_RADIUS,
  GARDEN_LIGHTHOUSE_BEAM_LENGTH,
  GARDEN_LIGHTHOUSE_BEAM_POOL_DISTANCE,
  LANTERN_SWELL_INTERVAL_SECONDS,
  LANTERN_SWELL_PEAK_HDR,
  LIGHTHOUSE_LANTERN_GLASS_MATERIAL_NAME,
  LIGHTHOUSE_LANTERN_GLASS_UNIFORMS,
  LIGHTHOUSE_RIM_UNIFORMS,
  LIGHTHOUSE_WINDOW_MATERIAL_NAME,
  attachGardenLighthouseModel,
  applyLighthouseRimLight,
  collectLighthouseGlowMaterials,
  createLanternSwell,
  createLighthouse,
  updateLighthouseLampStatus,
  updateLighthouseLanternGlass,
  updateLighthouseRimLight,
} from "./garden-lighthouse";
import { dayCyclePhase } from "./garden-day-cycle";
import { GARDEN_MODEL_MANIFEST } from "./garden-models";
import { gardenKeyLightPose } from "./garden-sun";
import { disposeThreeObjectTree } from "./garden-util";
import { GARDEN_ATMOSPHERE } from "./garden-atmosphere";

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

describe("W2.10 lantern swell (K9)", () => {
  const luminance = (color: Color): number => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

  // A beam sweeping at the full-stress 0.42 rad/s passes the eye-line every
  // ~15 s; the swell must still come at most once a minute.
  const run = (reducedMotion: boolean, seconds: number, period = 15) => {
    const swell = createLanternSwell();
    const samples: number[] = [];
    for (let frame = 0; frame <= seconds * 30; frame += 1) {
      const time = frame / 30;
      const beamFacing = Math.cos((time / period) * Math.PI * 2) ** 2;
      samples.push(swell.update({ beamFacing, glow: 1, reducedMotion, timeSeconds: time }));
    }
    return samples;
  };

  it("swells at most once a minute whatever the sweep rate, over ≥ 1.5 s each way", () => {
    const samples = run(false, 180);
    const starts = samples.flatMap((value, index) => (
      index > 0 && samples[index - 1] === 0 && value > 0 ? [index / 30] : []
    ));
    expect(starts.length).toBeGreaterThan(0);
    expect(starts.length).toBeLessThanOrEqual(Math.floor(180 / LANTERN_SWELL_INTERVAL_SECONDS) + 1);
    for (let index = 1; index < starts.length; index += 1) {
      expect(starts[index]! - starts[index - 1]!).toBeGreaterThanOrEqual(LANTERN_SWELL_INTERVAL_SECONDS - 1e-6);
    }
    // Rise: from the first lit frame to the peak; fall: from the peak back to 0.
    const first = Math.round(starts[0]! * 30);
    let peak = first;
    while (samples[peak + 1]! >= samples[peak]!) peak += 1;
    let end = peak;
    while (samples[end]! > 0) end += 1;
    expect((peak - first) / 30).toBeGreaterThanOrEqual(1.5);
    expect((end - peak) / 30).toBeGreaterThanOrEqual(1.5);
  });

  it("never swells under reduced motion and stays under 2.0 HDR at its peak", () => {
    expect(Math.max(...run(true, 120))).toBe(0);
    updateLighthouseLanternGlass(dayCyclePhase(0));
    const peak = luminance(LIGHTHOUSE_LANTERN_GLASS_UNIFORMS.uGlassSwellColor.value)
      + luminance(LIGHTHOUSE_LANTERN_GLASS_UNIFORMS.uGlassWarmColor.value)
        * LIGHTHOUSE_LANTERN_GLASS_UNIFORMS.uGlassWarm.value
      + luminance(LIGHTHOUSE_LANTERN_GLASS_UNIFORMS.uGlassDark.value);
    expect(peak).toBeLessThanOrEqual(LANTERN_SWELL_PEAK_HDR);
  });
});

describe("T1.7 rim light (2026-09-07)", () => {
  it("raises the whole rim curve, not just its dusk and night lifts", () => {
    // Base 0.1 -> 0.16, dusk lift 0.04 -> 0.06, night lift 0.08 -> 0.12. The
    // rim is what separates the tower from the sky like an engraving, and at
    // 0.1 it only registered where the fresnel already peaked. The shape was
    // right; it was built on too low a base.
    // Expressed in explicit phase weights: the curve is a function of the
    // phase, and on the solar clock full dusk (the blue beat's peak) is a
    // single instant that moves with the date.
    const strengthAt = (phase: { daylight: number; dusk: number; night: number }): number => {
      updateLighthouseRimLight(phase, gardenKeyLightPose(12, phase));
      return LIGHTHOUSE_RIM_UNIFORMS.uLighthouseRimStrength.value;
    };
    expect(strengthAt({ daylight: 1, dusk: 0, night: 0 })).toBeCloseTo(0.16, 6);
    expect(strengthAt({ daylight: 0, dusk: 1, night: 0 })).toBeCloseTo(0.22, 6);
    expect(strengthAt({ daylight: 0, dusk: 0, night: 1 })).toBeCloseTo(0.28, 6);
    // The noon and midnight of the pinned day land on those ends of the curve.
    expect(strengthAt(dayCyclePhase(12))).toBeCloseTo(0.16, 6);
    expect(strengthAt(dayCyclePhase(1))).toBeCloseTo(0.28, 6);
    // Still an accent, never a light: it is added straight to emissive.
    expect(strengthAt(dayCyclePhase(1))).toBeLessThan(0.35);
  });

  it("keeps low-sun GGX glints within the finite solar source without changing noon/night reflection", () => {
    const material = new MeshStandardMaterial({ metalness: 0.6, roughness: 0.22 });
    const mesh = new Mesh(new BoxGeometry(), material);
    applyLighthouseRimLight(mesh);
    const shader = {
      uniforms: {}, vertexShader: "",
      fragmentShader: "#include <common>\n#include <emissivemap_fragment>\n#include <lights_fragment_end>",
    } as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.uniforms.uLighthouseLowSun).toBe(LIGHTHOUSE_RIM_UNIFORMS.uLighthouseLowSun);
    const expression = shader.fragmentShader.match(/float gardenSolarSpecularScale = ([^;]+);/)![1]!;
    const scale = new Function("gardenSpecularPeak", "uLighthouseLowSun", `
      const {min, max} = Math;
      const mix = (a, b, t) => a + (b - a) * t;
      return ${expression};
    `) as (peak: number, lowSun: number) => number;
    for (const peak of [0, 0.1, 1, 20, 500]) {
      expect(Number.isFinite(scale(peak, 1))).toBe(true);
      expect(peak * scale(peak, 1)).toBeLessThanOrEqual(GARDEN_ATMOSPHERE.sunDiscRadiance + 1e-12);
      expect(scale(peak, 0)).toBe(1);
    }
    for (const hour of [7, 18.5, 12.25, 22]) {
      const phase = dayCyclePhase(hour);
      updateLighthouseRimLight(phase, gardenKeyLightPose(hour, phase));
      if (hour === 7 || hour === 18.5) expect(LIGHTHOUSE_RIM_UNIFORMS.uLighthouseLowSun.value).toBeGreaterThan(0);
      else expect(LIGHTHOUSE_RIM_UNIFORMS.uLighthouseLowSun.value).toBe(0);
    }
    expect(material.roughness).toBe(0.22);
    expect(material.metalness).toBe(0.6);
    mesh.geometry.dispose();
    material.dispose();
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
      // Warm recessed lamps follow the common tone mapper, without white
      // exterior speculars masquerading as a lit opening.
      expect(material.toneMapped).toBe(true);
      expect(material.emissive.getHex()).toBe(new Color(HARBOR_PALETTE.lantern_warm).getHex());
      expect(material.roughness).toBe(1);
      expect(material.metalness).toBe(0);
      expect(material.envMapIntensity).toBe(0);
    }
    // The shell shares ONE aperture material across both window rows and the
    // drum windows — and the shell merges by material group — so lighting
    // the whole tower is a single write. The lantern is glass, not a window.
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

describe("W0.7 night beacon discipline", () => {
  it("keeps the beacon's PointLight on the lantern storey, clear of the tower foot", () => {
    const lighthouse = createLighthouse();
    expect(lighthouse.light.position.y).toBeGreaterThan(0);
    expect(lighthouse.light.distance).toBeGreaterThan(0);
    expect(lighthouse.light.distance).toBeLessThan(lighthouse.light.position.y);
    disposeThreeObjectTree(lighthouse.root);
  });

  it("gives the loaded tower the shell's stone and bronze without mutating the model library", () => {
    const lighthouse = createLighthouse();
    // The shell's warm-bounce stones are its unnamed lantern_warm emitters;
    // its god is the named bronze-gilt.
    const warm = new Color(HARBOR_PALETTE.lantern_warm).getHex();
    const shellStoneBounce = new Set<number>();
    const shellGiltMetalness = new Set<number>();
    lighthouse.shell.traverse((object) => {
      if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
      if (object.material.name === "" && object.material.emissive.getHex() === warm) {
        shellStoneBounce.add(object.material.emissiveIntensity);
      }
      if (object.material.name === "bronze-gilt") shellGiltMetalness.add(object.material.metalness);
    });
    const libraryStone = new MeshStandardMaterial({ emissiveIntensity: 0.045, name: "weathered-limestone" });
    const libraryGilt = new MeshStandardMaterial({ metalness: 0.85, name: "bronze-gilt" });
    const libraryWindow = new MeshStandardMaterial({
      color: HARBOR_PALETTE.iron_dark, emissive: "#ffbe6e",
      emissiveIntensity: 0, name: LIGHTHOUSE_WINDOW_MATERIAL_NAME,
      roughness: 0.62, toneMapped: false,
    });
    const model = new Group();
    for (const name of ["anchor-beacon", "anchor-beam"]) {
      const anchor = new Object3D();
      anchor.name = name;
      anchor.position.set(0, 30.2, 0);
      model.add(anchor);
    }
    const stoneMesh = new Mesh(new BoxGeometry(), libraryStone);
    const giltMesh = new Mesh(new BoxGeometry(), libraryGilt);
    const windowMesh = new Mesh(new BoxGeometry(), libraryWindow);
    model.add(stoneMesh, giltMesh, windowMesh);
    const statueGleamMaterials: MeshStandardMaterial[] = [];
    const lighthouseWindowMaterials: MeshStandardMaterial[] = [];
    attachGardenLighthouseModel(model, {
      beacon: lighthouse.beacon,
      beaconHalo: lighthouse.beaconHalo,
      beam: lighthouse.beam,
      lighthouseLight: lighthouse.light,
      lighthouseRoot: lighthouse.root,
      lighthouseShell: lighthouse.shell,
      statueGleamMaterials,
      lighthouseWindowMaterials,
    });
    const stone = stoneMesh.material as MeshStandardMaterial;
    const gilt = giltMesh.material as MeshStandardMaterial;
    expect(stone).not.toBe(libraryStone);
    expect(gilt).not.toBe(libraryGilt);
    expect(libraryStone.emissiveIntensity).toBe(0.045);
    expect(libraryGilt.metalness).toBe(0.85);
    expect([...shellStoneBounce]).toEqual([stone.emissiveIntensity]);
    expect([...shellGiltMetalness]).toEqual([gilt.metalness]);
    expect(statueGleamMaterials).toEqual([gilt]);
    const window = windowMesh.material as MeshStandardMaterial;
    expect(window).not.toBe(libraryWindow);
    expect(libraryWindow.toneMapped).toBe(false);
    expect(libraryWindow.roughness).toBe(0.62);
    expect(libraryWindow.envMapIntensity).toBe(1);
    expect(window.toneMapped).toBe(true);
    expect(window.roughness).toBe(1);
    expect(window.metalness).toBe(0);
    expect(window.envMapIntensity).toBe(0);
    expect(window.emissive.getHex()).toBe(libraryWindow.emissive.getHex());
    expect(window.emissiveIntensity).toBe(libraryWindow.emissiveIntensity);
    expect(lighthouseWindowMaterials).toEqual([window]);
    disposeThreeObjectTree(lighthouse.root);
    libraryWindow.dispose();
  });
});

describe("W1.9 keep traded for the crag", () => {
  it("keeps the world beacon and crown where they stood before the headland", () => {
    // The beam, water road, label, shadow frustum and the rest pose all hang
    // off these two heights; six units of keep went to rock, not to the sky.
    expect(GARDEN_TOWER_BEACON_WORLD_Y).toBeCloseTo(32.75, 9);
    expect(GARDEN_TOWER_CROWN_WORLD_Y).toBeCloseTo(40.55, 9);
    const lighthouse = createLighthouse();
    const shell = new Box3().setFromObject(lighthouse.shell);
    expect(GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + shell.max.y).toBeCloseTo(GARDEN_TOWER_CROWN_WORLD_Y, 5);
    expect(GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + lighthouse.beacon.position.y).toBeCloseTo(GARDEN_TOWER_BEACON_WORLD_Y, 9);
    const glb = GARDEN_MODEL_MANIFEST["garden-lighthouse-shell"];
    expect(GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + glb.dimensions.y).toBeCloseTo(GARDEN_TOWER_CROWN_WORLD_Y, 5);
    expect(GARDEN_LIGHTHOUSE_ROOT_OFFSET.y + glb.anchors.beacon.position[1]).toBeCloseTo(GARDEN_TOWER_BEACON_WORLD_Y, 9);
    disposeThreeObjectTree(lighthouse.root);
  });

  it("turns the GLB's authored lantern glass into a shadowless film drawn after the flame", () => {
    // The GLB drops normals, so the swap must derive them or the fresnel
    // skin has nothing to face; the library's shared material stays intact.
    const lighthouse = createLighthouse();
    const libraryGlass = new MeshStandardMaterial({ name: LIGHTHOUSE_LANTERN_GLASS_MATERIAL_NAME, transparent: true });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    const glass: Mesh = new Mesh(geometry, libraryGlass);
    const model = new Group();
    for (const name of ["anchor-beacon", "anchor-beam"]) {
      const anchor = new Object3D();
      anchor.name = name;
      anchor.position.set(0, GARDEN_LIGHTHOUSE_BEACON_Y, 0);
      model.add(anchor);
    }
    model.add(glass);
    attachGardenLighthouseModel(model, {
      beacon: lighthouse.beacon,
      beaconHalo: lighthouse.beaconHalo,
      beam: lighthouse.beam,
      lighthouseLight: lighthouse.light,
      lighthouseRoot: lighthouse.root,
      lighthouseShell: lighthouse.shell,
    });
    expect(glass.material).toBeInstanceOf(ShaderMaterial);
    const film = glass.material as ShaderMaterial;
    expect(film.transparent).toBe(true);
    expect(film.depthWrite).toBe(false);
    expect(glass.castShadow).toBe(false);
    expect(glass.renderOrder).toBeGreaterThan(0);
    expect(geometry.getAttribute("normal")).toBeDefined();
    expect(libraryGlass.name).toBe(LIGHTHOUSE_LANTERN_GLASS_MATERIAL_NAME);
    disposeThreeObjectTree(lighthouse.root);
  });
});
