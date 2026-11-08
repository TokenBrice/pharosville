import { VERT_PARS, DEPTH_VERT_PARS } from "./shaders/pose";
export { FLEET_DATA_TEXELS } from "./shaders/pose";
import { FRAG_PARS } from "./shaders/print";
import { HOVER_SHEEN, FLEET_LIGHTING } from "./shaders/lighting";
import { patch } from "../engine/shader-patch";
import * as THREE from "three";
import type { HarbourMaterials } from "../world/materials";
import type { WorldUniforms } from "../engine/uniforms";

/**
 * The fleet material: the shared harbour kit material (patterns, world breakup, env spec, light
 * pools, height-field AO — so boats sit in the island's light) extended for one BatchedMesh draw of
 * every hull. Per-instance state lives in `uFleetData` (3 RGBA32F texels per batch instance, FLEET_DATA_TEXELS):
 *   texel 0 = (furl 0..1, signed boom swing rad (>0 = port tack, mirrored rig), highlight 0..1,
 *              pennant: sign = flies (>0) or struck (<0); |w| = 1 + far (0..1: spars recede far away), + 2 when
 *              the CPU struck the rig (see STRUCK))
 *   texel 1 = (brand r, g, b linear, emblem slot or -1; -2 = a v1 hulk; ≤ -9 = a wreck kit v2 piece, -10 - n = nameboard n)
 *   (wreck kit v2 pieces: texel 0.x = their lantern lit 0..1; kinds 3 = epitaph board, 4 = lantern glass)
 *   texel 2 = motion (F-fleet3, written by fleet-system writeMotion; all 0 = a still, unbellied rig):
 *             x = sail fill 0..1 (belly depth: wind × gust, 06-F2), y = shake 0..1 (luff shiver head to wind / flog
 *             through a tack, 07-M1 / 06-F2; 0 under reduced motion), z = lantern lit 0|1 (RESERVED for the stern-
 *             lantern lane, 06-F6; unread here), w = oar stroke 0..1 (galleys rowing, 06-F3; 0 = oars frozen)
 * and the static livery in `uFleetPaint` (5 RGBA32F texels per instance, written once at install):
 *   texel 0 = (topside rgb, name board 0|1) · 1 = (stripe / trim rgb, painted 0|1) · 2 = (deck rgb, -) ·
 *   3 = (coachroof rgb, painted 0|1) · 4 = (sail dye rgb, mode 0 canvas | 1 dyed | 2 canvas + brand bands; livery.sailDye).
 *   The kit's aPaint region picks which one a corner wears; sails wear texel 4 by their sail-plan role (aMeta.z).
 * The vertex shader poses the rig (furl morph, mirror, boom/boom_2 about the gooseneck, jib about its
 * stay); the fragment tints _BRAND corners and covers, prints the emblem from the atlas onto sail_main
 * (manifest flip rule; sail-plan.ts re-measures the emblem square: a bigger roundel, and one on the second sail),
 * dyes the sail cloth in the brand colour, and adds cloth seams, sail translucency and the hover rim.
 */
export interface FleetUniforms {
  uFleetData: THREE.IUniform<THREE.DataTexture>;
  uFleetPaint: THREE.IUniform<THREE.DataTexture>;
  uEmblems: THREE.IUniform<THREE.Texture>;
  /** (cols, rows, 1/cols, 1/rows) */
  uEmblemGrid: THREE.IUniform<THREE.Vector4>;
  uWind: THREE.IUniform<number>;
  /** The fleet's decorative clock (s): stands still under reduced motion (rig life, flags, lamp shimmer). */
  uFleetTime: THREE.IUniform<number>;
  /** Wreck Cove epitaph nameboards (alpha = ink) and their grid (cols, rows, 1/cols, 1/rows). */
  uBoards: THREE.IUniform<THREE.Texture>;
  uBoardGrid: THREE.IUniform<THREE.Vector4>;
}

export function createFleetMaterials(mats: HarbourMaterials, u: WorldUniforms, fleet: FleetUniforms): { material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const kit = mats.kit();
  const baseHook = kit.onBeforeCompile.bind(kit);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
  m.name = "hb_fleet";
  m.onBeforeCompile = (shader, renderer) => {
    baseHook(shader, renderer);
    shader.defines = { ...shader.defines, HB_FLEET: "" };   // world/metal.ts: only unpainted hull trim turns metal
    Object.assign(shader.uniforms, fleet, { uSunDir: u.uSunDir, uSunColor: u.uSunColor, uTime: fleet.uFleetTime, uLamp: u.uLamp });
    shader.vertexShader = patch(shader.vertexShader, "#include <batching_pars_vertex>", `#include <batching_pars_vertex>\nuniform float uTime;\n${VERT_PARS}`, { id: "fleet.1.batching_pars_vertex" });
    shader.vertexShader = patch(shader.vertexShader, "#include <beginnormal_vertex>", "hbFleetPose(position, normal);\nvec3 objectNormal = hbFleetN;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif", { id: "fleet.2.beginnormal_vertex" });
    shader.vertexShader = patch(shader.vertexShader, "#include <begin_vertex>", "vec3 transformed = hbFleetP;", { id: "fleet.3.begin_vertex" });
    // the kit port derives vHbWorld from instanceMatrix only: add the batch matrix
    shader.vertexShader = patch(shader.vertexShader, "hbW = instanceMatrix * hbW;\n    #endif", "hbW = instanceMatrix * hbW;\n    #endif\n    #ifdef USE_BATCHING\n      hbW = batchingMatrix * hbW;\n    #endif", { id: "fleet.4.hbW-instanceMatrix-hbW-endif" });
    shader.fragmentShader = patch(shader.fragmentShader, "#include <common>", `#include <common>\n${FRAG_PARS}\n${HOVER_SHEEN}`, { id: "fleet.5.common" });
    shader.fragmentShader = patch(shader.fragmentShader, "float hbRough;", "hbFleetColor(diffuseColor.rgb);\n  float hbRough;", { id: "fleet.6.float-hbRough-" });
    // distance tint: the hovered / selected hull and the pennant keep their colour (world/aerial.ts)
    shader.fragmentShader = patch(shader.fragmentShader, "hbAerial(outgoingLight, vHbWorld, 0.0);", "hbAerial(outgoingLight, vHbWorld, max(smoothstep(0.05, 0.5, vFleetMisc.x), step(0.5, vFleetRig.z) * step(vFleetMisc.z, 0.5)));", { id: "fleet.7.hbAerial-outgoingLight-vHbWorld-0-0" });
    shader.fragmentShader = patch(shader.fragmentShader, "#include <normal_fragment_begin>", patch(THREE.ShaderChunk.normal_fragment_begin, "gl_FrontFacing ? 1.0 : - 1.0", "(gl_FrontFacing != (vFleetMisc.y > 0.5)) ? 1.0 : - 1.0", { id: "fleet.9.gl_FrontFacing-1-0-1-0" }), { id: "fleet.8.normal_fragment_begin" });
    shader.fragmentShader = patch(shader.fragmentShader, "#include <opaque_fragment>", FLEET_LIGHTING, { id: "fleet.10.opaque_fragment" });
  };
  // the kit's own key carries its season and Low-tier (kitKey) switches
  m.customProgramCacheKey = () => `hb_fleet_v11_${kit.customProgramCacheKey()}`;
  mats.track(m);   // recompiles with the kit's Low-tier switch

  const depth = new THREE.MeshDepthMaterial();
  depth.name = "hb_fleet_depth";
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uFleetData: fleet.uFleetData, uFleetPaint: fleet.uFleetPaint, uTime: fleet.uFleetTime });
    shader.vertexShader = patch(shader.vertexShader, "#include <batching_pars_vertex>", `#include <batching_pars_vertex>\n${DEPTH_VERT_PARS}`, { id: "fleet.11.batching_pars_vertex" });
    shader.vertexShader = patch(shader.vertexShader, "#include <begin_vertex>", "vec3 transformed = hbFleetPoseP(position);", { id: "fleet.12.begin_vertex" });
  };
  depth.customProgramCacheKey = () => "hb_fleet_depth_v5";
  return { material: m, depth };
}
