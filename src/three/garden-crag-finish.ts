import { Color, type Material } from "three";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { SupplyTide } from "../systems/supply-tide";
import { chainGardenMaterialPatch } from "./garden-aerial";
import { TIDE_DATUM_RISE, TIDE_DATUM_THICKNESS, tideStrandlineRise } from "./garden-tide-line";

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
 * - **Tide-wet skirt**: darker stone (wet sand on the beach) up to the supply
 *   tide's strandline, hard top edge, grading lighter upward — the same reading
 *   `sampleTideLine` paints on the quay plates, so the island carries the cue
 *   instead of hiding it. With no tide reading only a low splash foot is wet,
 *   which never lands on the datum and so never reads as a slack week.
 * - **Datum notch**: scored iron at the fixed datum height (distinct from salt).
 * - **Wave-cut notch**: a shadowed undercut just above the water on the faces.
 * - **High-water salt line**: one pale band above the tide's widest excursion.
 *
 * Value only: nothing here touches roughness, metalness or the environment, so
 * the wet band is darker, never glazed.
 */

/** Height of one bedding course, world units (≈ 11 px at the rest seat). */
const STRATA_PERIOD = 0.9;
/** Wet foot height when the tide has no reading: spray, below every strandline read. */
const SPLASH_FOOT = 0.12;
/** The pale salt band sits just above the tide's widest excursion (2 × datum). */
const HIGH_WATER_RISE = TIDE_DATUM_RISE * 2 + 0.05;
/**
 * Wet stone keeps its own hue but loses about half its value and cools toward
 * the submerged stone: a relative multiply (the wet hue normalised to its
 * brightest channel), so pebble and rock each stay themselves when wet.
 */
const WET_HUE = new Color(HARBOR_PALETTE.stone_dark).lerp(new Color(HARBOR_PALETTE.deep_sea_1), 0.55);
const WET_MULTIPLY = WET_HUE.clone().multiplyScalar(0.36 / Math.max(WET_HUE.r, WET_HUE.g, WET_HUE.b));
const IRON = new Color(HARBOR_PALETTE.iron_dark);
const SALT = new Color(HARBOR_PALETTE.foam_white).multiplyScalar(0.62);

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
uniform float uCragStrandline;
varying vec3 vCragLocal;
varying float vCragUp;
`;

// Wet stone follows `sampleTideLine`'s weights (0.65 at the hard edge → 1 at
// 0.38 below it) as a relative multiply, so pebble and rock keep their hue.
// The datum is scored into rock faces only; on the beach it would be a stripe.
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

  bool cragReading = uCragStrandline >= 0.0;
  float cragSkirt = cragReading ? uCragStrandline : ${float(SPLASH_FOOT)};
  float cragWetEdge = 1.0 - smoothstep( cragSkirt - 0.015, cragSkirt + 0.015, cragAbove );
  float cragWet = cragWetEdge * ( 0.65 + 0.35 * clamp( ( cragSkirt - cragAbove ) / 0.38, 0.0, 1.0 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * ${vec3(WET_MULTIPLY)}, cragWet * 0.85 );

  float cragNotch = cragSteep * ( 1.0 - smoothstep( 0.05, 0.2, abs( cragAbove - 0.06 ) ) );
  diffuseColor.rgb *= 1.0 - 0.6 * cragNotch;

  if ( cragReading ) {
    float cragDatum = 1.0 - smoothstep(
      ${float(TIDE_DATUM_THICKNESS / 2)}, ${float(TIDE_DATUM_THICKNESS / 2 + 0.015)},
      abs( cragAbove - ${float(TIDE_DATUM_RISE)} )
    );
    diffuseColor.rgb = mix( diffuseColor.rgb, ${vec3(IRON)}, 0.7 * cragDatum * cragSteep );
  }

  float cragSalt = cragSteep * ( 1.0 - smoothstep( 0.035, 0.085, abs( cragAbove - ${float(HIGH_WATER_RISE)} ) ) );
  float cragSaltResolve = 1.0 - smoothstep( 0.06, 0.14, fwidth( cragAbove ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, ${vec3(SALT)}, 0.42 * cragSalt * cragSaltResolve );
}
`;

export const GARDEN_CRAG_FINISH_KEY = "garden-crag-finish";

/** Strandline height above still water, or −1 when the tide has no reading. */
export function gardenCragStrandline(tide: SupplyTide | undefined): number {
  return tide && tide.state !== "unavailable" ? tideStrandlineRise(tide) : -1;
}

/**
 * Chains the crag finish onto a rock material through the shared patch chain
 * (K5). Works on plain meshes (root-local position) and instanced ones. The
 * tide is a uniform, so every island build shares one program.
 */
export function applyGardenCragFinish(material: Material, tide: SupplyTide | undefined): void {
  const strandline = { value: gardenCragStrandline(tide) };
  chainGardenMaterialPatch(material, {
    key: GARDEN_CRAG_FINISH_KEY,
    compile: (shader) => {
      shader.uniforms.uCragStrandline = strandline;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`)
        .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT_BODY}`);
    },
  });
}
