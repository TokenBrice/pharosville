import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWorldUniforms, type WorldUniforms } from "../engine/uniforms";
import { HarbourMaterials } from "../world/materials";
import type { EmblemAtlas } from "./emblems";
import { createFleetMaterials, type FleetUniforms } from "./fleet-material";
import { FleetSystem } from "./fleet-system";
import { HouseFlags } from "./house-flags";
import { tubeRadii } from "./hull-kit";
import { RIG_AIR } from "./shaders/lighting";
import { RIG_FLOOR_PX, rigCoverage } from "./shaders/pose";

interface FleetHarness { uniforms: FleetUniforms }

// No renderer/GL context: exercise the injected shader and shared-uniform contracts only.
describe("fleet material atlas/season ownership", () => {
  it("uses the original combined-atlas gradients for sails and covers and inherits the seasonal shader key", () => {
    let season = "leaf";
    const materials = new HarbourMaterials(createWorldUniforms());
    const kit = materials.kit();
    kit.customProgramCacheKey = () => `kit_${season}`;
    // Test-only access to the same private uniform seam used by the upload harness.
    const system = new FleetSystem() as unknown as FleetHarness;
    const fleet = system.uniforms;
    const world = {} as WorldUniforms;
    const { material, depth } = createFleetMaterials({ kit: () => kit, kitKey: () => "", track: () => undefined } as unknown as HarbourMaterials, world, fleet);
    const key = material.customProgramCacheKey(), depthKey = depth.customProgramCacheKey();
    // Three's callback type also carries renderer internals unused by this source-only hook.
    const shader = { ...THREE.ShaderLib.standard, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms).toMatchObject({
      uEmblems: fleet.uEmblems, uEmblemGrid: fleet.uEmblemGrid,
    });
    expect(shader.fragmentShader).not.toContain("uEmblemLogos");
    expect(shader.fragmentShader).toContain("textureGrad(uEmblems, uv, gx, gy)");
    // Preserve operation order as well as the intended UV formula: subpixel detail is scenery.
    expect(shader.fragmentShader).toContain("vec2(ex.x * sx * uEmblemGrid.z, -ex.y * uEmblemGrid.w)");
    expect(shader.fragmentShader).toContain("vec2(ex.x * sx * 0.97 * uEmblemGrid.z, -ex.y * 0.97 * uEmblemGrid.w)");
    expect(shader.fragmentShader).toContain("vec2((cell.x + inset.x) * uEmblemGrid.z, 1.0 - (cell.y + inset.y) * uEmblemGrid.w)");
    expect(shader.vertexShader).toContain("float phase = hbPaintTexel(idx, 2).w");
    const depthShader = { ...THREE.ShaderLib.depth, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
    depth.onBeforeCompile(depthShader, {} as THREE.WebGLRenderer);
    expect(depthShader.uniforms.uFleetPaint).toBe(fleet.uFleetPaint);
    expect(depthShader.vertexShader).toContain("float phase = hbFleetPhase(idx)");
    expect(depthShader.vertexShader).toContain("phase * 1.7");
    expect(depthShader.vertexShader).not.toContain("float(idx) * 1.7");
    season = "bare";
    expect(material.customProgramCacheKey()).not.toBe(key);
    expect(material.customProgramCacheKey()).toContain("kit_bare");
    expect(depth.customProgramCacheKey()).toBe(depthKey); // classic fleet depth has no seasonal kit hook
    material.dispose(); depth.dispose(); materials.dispose();
    for (const uniform of [fleet.uFleetData, fleet.uFleetPaint, fleet.uEmblems, fleet.uBoards]) uniform.value.dispose();
  });
});

// E04 index fix (O5-F1): the emblem slot reaches the fragment shader as an interpolated varying (320 ± ε)
describe("fleet emblem slots on atlas column 0", () => {
  const glslMod = (x: number, y: number) => x - y * Math.floor(x / y);
  const cellOf = (slot: number, cols = 32) => [glslMod(slot, cols), Math.floor(slot / cols)];
  const round = (v: number) => Math.floor(v + 0.5);   // hbFleetSlot(), and the house flags' slot
  const ulp320 = 320 * 2 ** -23;                      // one float32 step at 320, as interpolation leaves it

  it("rounds the slot before mod/floor so a column-0 mark never flips to the edge of the row above", () => {
    for (const slot of [0, 31, 32, 33, 319, 320, 321, 608, 640, 736]) {
      for (const eps of [0, ulp320, -ulp320, 1e-3, -1e-3, 0.25, -0.25]) {
        expect(cellOf(round(slot + eps))).toEqual([slot % 32, Math.floor(slot / 32)]);
      }
    }
    // the defect: unrounded, USDe's 320 - ε read column 31.99996 of row 9 (the clamped right edge of the row above)
    const [cx, cy] = cellOf(320 - ulp320);
    expect(cx).toBeGreaterThan(31.99);
    expect(cy).toBe(9);
  });

  it("keeps the negative sentinels: no emblem, a v1 hulk, the wreck nameboards", () => {
    for (const eps of [0, 1e-5, -1e-5, 0.25, -0.25]) {
      expect(round(-1 + eps)).toBe(-1);                                              // no emblem (slot >= 0 fails)
      expect(round(-2 + eps)).toBe(-2);                                              // a v1 hulk
      for (const n of [0, 1, 31, 32, 33]) expect(-round(-10 - n + eps) - 10).toBe(n); // nameboard n
    }
    // the defect for nameboard 0: unrounded, -10 + ε gave board -ε and the board dropped out on those pixels
    expect(-(-10 + 1e-5) - 10).toBeLessThan(0);
  });

  it("rounds before every mod/floor in the fleet and the house-flag shaders", () => {
    const materials = new HarbourMaterials(createWorldUniforms());
    const kit = materials.kit();
    const fleet = (new FleetSystem() as unknown as FleetHarness).uniforms;
    const { material, depth } = createFleetMaterials({ kit: () => kit, kitKey: () => "", track: () => undefined } as unknown as HarbourMaterials, {} as WorldUniforms, fleet);
    const shader = { ...THREE.ShaderLib.standard, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const frag = shader.fragmentShader;
    expect(frag).toContain("float hbFleetSlot() { return floor(vFleetBrand.a + 0.5); }");
    expect(frag).toContain("float board = -hbFleetSlot() - 10.0;");
    expect(frag.match(/float slot = hbFleetSlot\(\);/g)).toHaveLength(2);   // the furled cover / bundle and the sail
    expect(frag.match(/vec2 cell = vec2\(mod\(slot, uEmblemGrid\.x\), floor\(slot \/ uEmblemGrid\.x\)\);/g)).toHaveLength(2);
    expect(frag).not.toMatch(/mod\(vFleetBrand\.a|floor\(vFleetBrand\.a \//);
    const atlas = { texture: new THREE.Texture(), grid: new THREE.Vector4(32, 25, 1 / 32, 1 / 25) } as unknown as EmblemAtlas;
    const flags = new HouseFlags({ uTime: { value: 0 } } as unknown as WorldUniforms, atlas, 4);
    const flagFrag = (flags.mesh.material as THREE.ShaderMaterial).fragmentShader;
    expect(flagFrag).toContain("float slot = floor(vSlot + 0.5);");
    expect(flagFrag).toContain("vec2 cell = vec2(mod(slot, uEmblemGrid.x), floor(slot / uEmblemGrid.x));");
    expect(flagFrag).not.toMatch(/mod\(vSlot|floor\(vSlot \//);
    material.dispose(); depth.dispose(); materials.dispose(); flags.mesh.geometry.dispose(); (flags.mesh.material as THREE.Material).dispose();
    for (const uniform of [fleet.uFleetData, fleet.uFleetPaint, fleet.uEmblems, fleet.uBoards]) uniform.value.dispose();
  });
});

// E27 calm rigging (O2-I4, O7-I9): stays and spars as hairlines, energy kept
describe("rig hairlines", () => {
  /** A straight tube of `segs` sides along `axis` (flat faces: each face's corners are its own, as the kit exports a rope). */
  function tube(segs: number, r: number, from: THREE.Vector3, to: THREE.Vector3): THREE.BufferGeometry {
    const d = to.clone().sub(from).normalize(), u = new THREE.Vector3(1, 0, 0).cross(d);
    if (u.lengthSq() < 1e-6) u.set(0, 0, 1).cross(d);
    u.normalize();
    const w = d.clone().cross(u).normalize(), pos: number[] = [], nrm: number[] = [], idx: number[] = [];
    const ring = (c: THREE.Vector3, k: number) => c.clone().addScaledVector(u, r * Math.cos((2 * Math.PI * k) / segs)).addScaledVector(w, r * Math.sin((2 * Math.PI * k) / segs));
    for (let k = 0; k < segs; k++) {
      const a = ring(from, k), b = ring(from, k + 1), c = ring(to, k + 1), e = ring(to, k);
      const n = b.clone().sub(a).cross(e.clone().sub(a)).normalize();
      const base = pos.length / 3;
      for (const p of [a, b, c, e]) { pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    return g;
  }

  it("bakes each stay's and spar's radius and a radial normal, so a widened rope grows round without slits", () => {
    const stay = tube(3, 0.03, new THREE.Vector3(-4, 1, 0), new THREE.Vector3(2, 9, 0.5));
    const mast = tube(6, 0.12, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 11, 0));
    const merged = { attributes: { position: new THREE.Float32BufferAttribute([...stay.attributes.position.array, ...mast.attributes.position.array], 3) },
      index: new THREE.BufferAttribute(new Uint32Array([...stay.index!.array, ...Array.from(mast.index!.array, (i) => i + stay.attributes.position.count)]), 1) } as unknown as THREE.BufferGeometry;
    const out = tubeRadii(merged, new THREE.Matrix4(), () => true)!;
    const nStay = stay.attributes.position.count;
    const p = merged.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const r = v < nStay ? 0.03 : 0.12;
      expect(out.r[v]).toBeCloseTo(r, 3);
      const n = new THREE.Vector3(out.n[v * 3], out.n[v * 3 + 1], out.n[v * 3 + 2]);
      expect(n.length()).toBeCloseTo(1, 5);
      // radial: across the tube's axis, outward
      const axis = v < nStay ? new THREE.Vector3(6, 8, 0.5).normalize() : new THREE.Vector3(0, 1, 0);
      expect(Math.abs(n.dot(axis))).toBeLessThan(1e-3);
    }
    // corners at one position (a flat-shaded rope's split corners) share one normal: they move together
    const seen = new Map<string, THREE.Vector3>();
    for (let v = 0; v < nStay; v++) {
      const key = [p.getX(v), p.getY(v), p.getZ(v)].map((x) => x.toFixed(4)).join();
      const n = new THREE.Vector3(out.n[v * 3], out.n[v * 3 + 1], out.n[v * 3 + 2]);
      const prev = seen.get(key);
      if (prev) expect(prev.distanceTo(n)).toBeLessThan(1e-4); else seen.set(key, n);
    }
    expect(tubeRadii(merged, new THREE.Matrix4(), () => false)).toBeNull();
    stay.dispose(); mast.dispose();
  });

  it("widens only to 0.8 CSS px and fades by true / drawn width", () => {
    const heart = 1000 / (2 * Math.tan((12.5 * Math.PI) / 180)) / 650;   // CSS px per metre at the 650 m landing
    expect(rigCoverage(0.03, heart)).toBeCloseTo(0.03 / (0.5 * RIG_FLOOR_PX / heart), 6);
    expect(rigCoverage(0.03, heart)).toBeLessThan(0.3);
    expect(rigCoverage(0.03, 40)).toBe(1);         // close in, a rope is wider than the floor: untouched
    expect(rigCoverage(0.12, 3)).toBeCloseTo(0.12 / (0.4 / 3), 6);  // a far mast: just under the floor
    for (const k of [0.5, 2, 8, 30]) expect(rigCoverage(0.05, k * 1.5)).toBeGreaterThanOrEqual(rigCoverage(0.05, k));
  });

  it("holds the colour pass's rig at the floor and leaves the shadow twin and struck rigs as they were", () => {
    const materials = new HarbourMaterials(createWorldUniforms());
    const kit = materials.kit();
    const fleet = (new FleetSystem() as unknown as FleetHarness).uniforms;
    const { material, depth } = createFleetMaterials({ kit: () => kit, kitKey: () => "", track: () => undefined } as unknown as HarbourMaterials, {} as WorldUniforms, fleet);
    const shader = { ...THREE.ShaderLib.standard, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const vert = shader.vertexShader;
    expect(vert).toContain("float hbRigCover = hbRigFloor(transformed, hbFleetN, batchingMatrix);");
    expect(vert).toContain("if (hbRigCover < 1.0) vFleetLamp = -hbRigCover;");
    expect(vert).toContain(`float want = ${(RIG_FLOOR_PX * 0.5).toFixed(2)} * depth / max(0.5 * projectionMatrix[1][1] * uFleetScreen.x * length(bm[0].xyz), 1e-6);`);
    // a struck rig (far, furled) stays struck: no live radius once it collapses
    expect(vert).toContain("if (hbFleetStruck(a.w)) { p = vec3(0.0); hbRigR = 0.0; }");
    expect(vert.indexOf("hbRigR = aPaint.x > 7.5 && aPaint.x < 10.5 ? aPaint.y : 0.0;")).toBeLessThan(vert.indexOf("if (hbFleetStruck(a.w)) { p = vec3(0.0); hbRigR = 0.0; }"));
    // the energy: a widened corner gives way to the air behind it by (1 - coverage), after the hover light
    const frag = shader.fragmentShader;
    expect(frag).toContain(`if (vFleetLamp < 0.0) outgoingLight = mix(vec3(dot(mix(uAerialHaze, uHorizon, 0.4), vec3(0.2126, 0.7152, 0.0722)) * ${RIG_AIR.toFixed(2)}), outgoingLight, -vFleetLamp);`);
    expect(frag.indexOf("outgoingLight += hbHoverSheen(")).toBeLessThan(frag.indexOf("if (vFleetLamp < 0.0) outgoingLight"));
    // the shadow twin keeps the true rig
    const depthShader = { ...THREE.ShaderLib.depth, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
    depth.onBeforeCompile(depthShader, {} as THREE.WebGLRenderer);
    expect(depthShader.vertexShader).not.toContain("hbRigFloor");
    expect(depthShader.vertexShader).toContain("if (hbFleetStruck(a.w)) p = vec3(0.0);");
    material.dispose(); depth.dispose(); materials.dispose();
    for (const uniform of [fleet.uFleetData, fleet.uFleetPaint, fleet.uEmblems, fleet.uBoards]) uniform.value.dispose();
  });
});
