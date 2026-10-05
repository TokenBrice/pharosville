import { Color, type Material } from "three";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import { chainGardenMaterialPatch } from "./garden-aerial";
import { GARDEN_SHORE_CONTACT } from "./garden-rim-mesh";
import { gardenShoreContactGlsl } from "./garden-water-contract";

/**
 * W4.P1 / X10 — the crag finish (pharos-2 strata and benches, pharos-6 wave-cut
 * foot), drawn as value shapes in the fragment.
 *
 * The headland is a smooth-shaded height field (the hand, §1.1): its risers
 * span one or two grid rows, so bedding, the tide-wet skirt and the notch
 * cannot live in vertex colour — they smeared into one gradient up a whole
 * face. Here they are authored planes keyed to height and pitch:
 *
 * - **Strata** only where the rock is steep: warped bedding courses of
 *   alternating hard and soft stone with a shadow line under each proud bed,
 *   faded out once a course is smaller than a few pixels (no moiré, no 1-px
 *   line at whole-map distance).
 * - **Wet foot**: darker stone (wet sand on the beach) up to a low splash
 *   line, hard top edge, grading lighter upward. It is spray, not a reading:
 *   the supply tide lives on the tidal flat alone (X2, K45), so the crag
 *   carries no strandline, datum or salt line.
 * - **Wave-cut notch**: a shadowed undercut just above the water on the faces.
 *
 * Value only: nothing here touches roughness, metalness or the environment, so
 * the wet band is darker, never glazed.
 */

/** Height of one bedding course, world units (≈ 11 px at the rest seat). */
const STRATA_PERIOD = 0.9;
/**
 * Wet stone keeps its own hue but loses about half its value and cools toward
 * the submerged stone: a relative multiply (the wet hue normalised to its
 * brightest channel), so pebble and rock each stay themselves when wet.
 */
const WET_HUE = new Color(HARBOR_PALETTE.stone_dark).lerp(new Color(HARBOR_PALETTE.deep_sea_1), 0.55);
const WET_MULTIPLY = WET_HUE.clone().multiplyScalar(0.36 / Math.max(WET_HUE.r, WET_HUE.g, WET_HUE.b));

function vec3(color: Color): string {
  return `vec3( ${color.r.toFixed(4)}, ${color.g.toFixed(4)}, ${color.b.toFixed(4)} )`;
}

function float(value: number): string {
  return value.toFixed(4);
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vCragLocal;
varying float vCragUp;
`;

const VERTEX_BODY = /* glsl */ `
{
  vec4 cragLocal = vec4( position, 1.0 );
  vec3 cragNormal = normal;
  #ifdef USE_INSTANCING
    cragLocal = instanceMatrix * cragLocal;
    cragNormal = mat3( instanceMatrix ) * cragNormal;
  #endif
  vCragLocal = cragLocal.xyz;
  vCragUp = normalize( cragNormal ).y;
}
`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vCragLocal;
varying float vCragUp;
`;

// Preserve mineral hue; contact thresholds match the terrain and edge stones.
const FRAGMENT_BODY = /* glsl */ `
{
  float cragAbove = vCragLocal.y - ${float(GARDEN_WATER_Y)};
  float cragSteep = 1.0 - smoothstep( 0.55, 0.82, vCragUp );

  float cragWarp = 0.24 * sin( 0.52 * vCragLocal.x + 0.31 * vCragLocal.z + 0.7 )
    + 0.11 * sin( 1.45 * vCragLocal.z - 0.83 * vCragLocal.x + 2.1 );
  float cragPhase = ( cragAbove + cragWarp ) / ${float(STRATA_PERIOD)};
  float cragBed = fract( cragPhase );
  float cragLot = fract( sin( floor( cragPhase ) * 12.9898 + 4.1 ) * 43758.5453 );
  float cragLedge = 1.0 - smoothstep( 0.0, 0.3, cragBed );
  float cragResolve = 1.0 - smoothstep( 0.18, 0.45, fwidth( cragPhase ) );
  float cragStrata = mix( 0.86, 1.08, cragLot ) * ( 1.0 - 0.34 * cragLedge );
  diffuseColor.rgb *= mix( 1.0, cragStrata, cragSteep * cragResolve * step( 0.0, cragAbove ) );

  ${gardenShoreContactGlsl("cragAbove", GARDEN_SHORE_CONTACT)}
  float cragWet = shoreDamp * (0.65 + 0.35 * shoreSubmerged);
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * ${vec3(WET_MULTIPLY)}, cragWet * 0.85 );

  float cragNotch = cragSteep * ( 1.0 - smoothstep( 0.05, 0.2, abs( cragAbove - 0.06 ) ) );
  diffuseColor.rgb *= 1.0 - 0.6 * cragNotch;
}
`;

export const GARDEN_CRAG_FINISH_KEY = "garden-crag-finish";

/**
 * Chains the crag finish onto a rock material through the shared patch chain
 * (K5). Works on plain meshes (root-local position) and instanced ones.
 */
export function applyGardenCragFinish(material: Material): void {
  chainGardenMaterialPatch(material, {
    key: GARDEN_CRAG_FINISH_KEY,
    compile: (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`)
        .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT_BODY}`);
    },
  });
}
