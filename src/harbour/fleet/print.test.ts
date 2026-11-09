import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWorldUniforms, type WorldUniforms } from "../engine/uniforms";
import { PRINT_RULE } from "../ui/facts";
import { HarbourMaterials } from "../world/materials";
import type { EmblemAtlas } from "./emblems";
import { createFleetMaterials, type FleetUniforms } from "./fleet-material";
import { BUOY_EASE, BUOY_FAR_SCALE, BUOY_HIDE_PX, buoyScale, FleetSystem } from "./fleet-system";
import { FLAG_AIR, FLAG_BURGEE, FLAG_DISTRESS, HouseFlags } from "./house-flags";
import { DYE_MAX_SAT, flagPigment } from "./livery";
import { PRINT_FULL_PX, PRINT_HI, PRINT_SOFT_PX, printContrast } from "./shaders/print";

interface FleetHarness { uniforms: FleetUniforms }

/** The fleet's assembled colour shader (no GL context): the kit hook plus the fleet's patches. */
function fleetShader() {
  const materials = new HarbourMaterials(createWorldUniforms());
  const kit = materials.kit();
  const fleet = (new FleetSystem() as unknown as FleetHarness).uniforms;
  const { material, depth } = createFleetMaterials({ kit: () => kit, kitKey: () => "", track: () => undefined } as unknown as HarbourMaterials, {} as WorldUniforms, fleet);
  const shader = { ...THREE.ShaderLib.standard, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  const depthShader = { ...THREE.ShaderLib.depth, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
  depth.onBeforeCompile(depthShader, {} as THREE.WebGLRenderer);
  const dispose = () => {
    material.dispose(); depth.dispose(); materials.dispose();
    for (const uniform of [fleet.uFleetData, fleet.uFleetPaint, fleet.uEmblems, fleet.uBoards]) uniform.value.dispose();
  };
  return { shader, depthShader, fleet, dispose };
}

// E04 coins as print (ruling V1: a promise amendment of v1.4.1's full-contrast emblems)
describe("the print law", () => {
  it("softens a device below 12 CSS px and prints it crisp from 30, by its size in CSS px at any DPR", () => {
    expect(printContrast(8, 1)).toBe(0);
    expect(printContrast(PRINT_SOFT_PX, 1)).toBe(0);
    expect(printContrast(PRINT_FULL_PX, 1)).toBe(1);
    expect(printContrast(56, 1)).toBe(1);
    const mid = printContrast(21, 1);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    for (let px = 10; px < 34; px += 1) expect(printContrast(px + 1, 1)).toBeGreaterThanOrEqual(printContrast(px, 1));
    // DPR 2 draws the same device across twice the render px: the same CSS footprint, the same contrast
    for (const css of [9, 12, 18, 24, 30, 40]) expect(printContrast(css * 2, 2)).toBeCloseTo(printContrast(css, 1), 10);
    // a rescue resolution (fewer render px per CSS px) is the same CSS footprint too
    expect(printContrast(15, 0.75)).toBeCloseTo(printContrast(20, 1), 10);
  });

  it("restores the full print for a hovered, selected or searched hull at any range", () => {
    for (const px of [2, 6, 12, 20]) {
      expect(printContrast(px, 1, 1)).toBe(1);     // hover
      expect(printContrast(px, 1, 0.5)).toBe(1);   // selected / searched
      expect(printContrast(px, 2, PRINT_HI[1])).toBe(1);
      expect(printContrast(px, 1, PRINT_HI[0])).toBe(printContrast(px, 1));   // an easing highlight below the band: none yet
    }
  });

  it("prints every set sail, cover and bundle through one law, under the far shading and the cloth", () => {
    const { shader, dispose } = fleetShader();
    const frag = shader.fragmentShader;
    expect(frag).toContain("float hbPrintK(float era) {");
    expect(frag).toContain(`smoothstep(${PRINT_SOFT_PX.toFixed(2)}, ${PRINT_FULL_PX.toFixed(2)}, 0.98 / (era * max(uFleetScreen.y, 0.25)))`);
    expect(frag).toContain(`float hbPrintHi() { return smoothstep(${PRINT_HI[0].toFixed(2)}, ${PRINT_HI[1].toFixed(2)}, vFleetMisc.x); }`);
    // the size law reads |derivatives| (fwidth): a mirrored rig (port tack) prints at the same contrast
    expect(frag).toContain("float er = length(e - 0.5), era = fwidth(er) + 1e-5;");
    expect(frag).toContain("bool flipU = !gl_FrontFacing;");
    // covers / bundles and the sail both print, with lettering from the atlas's monogram slots
    expect(frag).toContain("c = hbPrint(c, fam, t, t.a * show, hbPrintK(era), slot >= uEmblemLetters);");
    expect(frag).toContain("c = hbPrint(c, fam, t, a, k, letters);");
    // paper becomes canvas (paper again when highlighted); far, the ground melts into the cloth
    expect(frag).toContain("ground = mix(canvas, vec3(0.92), hi);");
    expect(frag).toContain("vec3 ink = t.rgb / max(t.a, 1e-4), ground = c, soft = c * 1.15;");
    // seams, tabling and the far value law run over the print, not under it
    const sail = frag.slice(frag.indexOf("c = hbPrint(c, fam, t, a, k, letters);"));
    expect(sail.indexOf("c *= 1.0 - (seams * 0.07 + tabling * 0.09) * fine;")).toBeGreaterThan(0);
    expect(sail.indexOf("hbFarCloth(c);")).toBeGreaterThan(sail.indexOf("c *= 1.0 - (seams * 0.07"));
    expect(frag).not.toContain("t.rgb * 0.92");   // no paper-white pin over the cloth
    // a monogram is lettering (no ring round a disc that is not there)
    expect(frag).toContain("if (slot >= 0.0 && !letters && show > 0.0 && er < 0.56) {");
    dispose();
  });

  it("hides the print while a sail comes down, LOD sails included (they furl through their own morph)", () => {
    const { shader, dispose } = fleetShader();
    expect(shader.fragmentShader).toContain("float show = (1.0 - smoothstep(0.2, 0.6, vFleetRig.x)) * clampR;");
    expect(shader.vertexShader).toContain("vFleetRig = vec4(furl, node, aMeta.w, n.z);");
    expect(shader.vertexShader).not.toContain("lodSail");
    dispose();
  });

  it("names the amendment in the ledger's own words", () => {
    expect(PRINT_RULE).toBe("Coin marks are printed on cloth. At a distance their contrast softens; hover, select or search to inspect a coin.");
  });
});

describe("flags in the harbour's pigment and air (E04, ruling V3)", () => {
  it("caps the field's chroma at the dye's earth pigment, keeping hue and lightness", () => {
    for (const hex of ["#1E5EFF", "#26A17B", "#E84142", "#F5AC37", "#8A2BE2"]) {
      const hsl = { h: 0, s: 0, l: 0 }, src = { h: 0, s: 0, l: 0 };
      flagPigment(hex).getHSL(hsl, THREE.SRGBColorSpace);
      new THREE.Color(hex).getHSL(src, THREE.SRGBColorSpace);
      expect(hsl.s).toBeLessThanOrEqual(DYE_MAX_SAT + 1e-4);
      expect(hsl.h).toBeCloseTo(src.h, 3);
      expect(hsl.l).toBeCloseTo(src.l, 3);
    }
    // an already earthy colour is unchanged
    expect(flagPigment("#7A6A55").getHexString(THREE.SRGBColorSpace)).toBe("7a6a55");
  });

  it("packs the highlight into the style, takes 0.6 of the air, exempts the distress signal and the highlighted hull", () => {
    const atlas = { texture: new THREE.Texture(), grid: new THREE.Vector4(32, 25, 1 / 32, 1 / 25), letterSlot: 640 } as unknown as EmblemAtlas;
    const flags = new HouseFlags(createWorldUniforms(), atlas, 4);
    const brand = new THREE.Color(0.2, 0.3, 0.6);
    flags.add(0, 5, 0, 2, 0, 1, 12, 0, brand, FLAG_BURGEE);
    flags.add(0, 5, 0, 2, 0, 1, 12, 0, brand, FLAG_BURGEE, true);
    flags.add(0, 5, 0, 2, 0, 1, -1, 0, brand, FLAG_DISTRESS);
    const styles = flags.mesh.geometry.getAttribute("aBrand") as THREE.InstancedBufferAttribute;
    expect([styles.getW(0), styles.getW(1), styles.getW(2)]).toEqual([FLAG_BURGEE, FLAG_BURGEE + 8, FLAG_DISTRESS]);
    const material = flags.mesh.material as THREE.ShaderMaterial;
    expect(material.uniforms.uEmblemLetters.value).toBe(640);
    expect(material.fragmentShader).toContain("float hi = step(7.50, vBrand.w);");
    expect(material.fragmentShader).toContain(`hbAerial(c, vec3(0.0), style > 1.5 ? 1.0 : max(${(1 - FLAG_AIR).toFixed(2)}, hi));`);
    expect(material.fragmentShader).toContain("if (slot >= uEmblemLetters) {");
    // the device on the flag follows the same size law (its roundel's diameter in CSS px)
    expect(material.fragmentShader).toContain(`smoothstep(${PRINT_SOFT_PX.toFixed(2)}, ${PRINT_FULL_PX.toFixed(2)}, 2.0 * R / (ax * max(uFleetScreen.y, 0.25)))`);
    expect(material.vertexShader).toContain("hbAerialVert((modelMatrix * instanceMatrix * vec4(p, 1.0)).xyz);");
    flags.dispose();
  });
});

describe("buoys recede (E04, ruling V10)", () => {
  const pxPerM = (d: number) => (1000 / (2 * Math.tan((12.5 * Math.PI) / 180))) / d;   // CSS px per metre, 1000 px high, 25° fov
  it("ease to 0.7 between 300 and 450 m and shrink away below 2.5 CSS px, by distance alone", () => {
    expect(buoyScale(150, pxPerM(150), 1)).toBe(1);
    expect(buoyScale(BUOY_EASE[0], 50, 1)).toBe(1);
    expect(buoyScale(BUOY_EASE[1], 50, 1)).toBeCloseTo(BUOY_FAR_SCALE, 6);
    expect(buoyScale(600, 50, 1)).toBeCloseTo(BUOY_FAR_SCALE, 6);
    // the default heart view's Roads (~900 m): a metre-high buoy is ~1.8 px at 0.7: gone
    expect(buoyScale(900, pxPerM(900), 1)).toBe(0);
    // exactly at the floor it is gone; a px above the ramp it is whole
    expect(buoyScale(600, BUOY_HIDE_PX[0] / BUOY_FAR_SCALE, 1)).toBe(0);
    expect(buoyScale(600, BUOY_HIDE_PX[1] / BUOY_FAR_SCALE, 1)).toBeCloseTo(BUOY_FAR_SCALE, 6);
    let last = 2;
    for (let d = 100; d <= 1200; d += 25) { const k = buoyScale(d, pxPerM(d), 1); expect(k).toBeLessThanOrEqual(last + 1e-9); last = k; }
    // (no occupancy input: the law has no notion of whether a mooring is taken)
    expect(buoyScale.length).toBe(3);
  });

  it("paints the buoy a weathered ochre through its slot sentinel", () => {
    const { shader, dispose } = fleetShader();
    expect(shader.fragmentShader).toContain("if (abs(hbFleetSlot() + 3.0) < 0.5) {");
    dispose();
  });
});
