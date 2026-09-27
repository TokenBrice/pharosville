import {
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { gardenInletDistance } from "../systems/garden-inlet";
import { LAST_VISIT_TIDE_MIN_DELTA } from "../systems/garden-last-visit";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import { TILE_SCALE } from "../systems/projection";
import { REST_SEAT_EYE_LANDSCAPE } from "../systems/rest-seat";
import type { SupplyTide } from "../systems/supply-tide";
import { chainGardenMaterialPatch } from "./garden-aerial";

/**
 * X2 (O9, K45; data-poetry-3/-5) — the tidal flat: the week's stablecoin
 * supply as how much of one sheltered shore lies bare.
 *
 * A gently sloping flat of wet sand in the lee of the island's south-east
 * beach, inside the island's non-attributed halo (never a named risk water)
 * and outside the empty inlet. The weekly supply tide (`supply-tide.ts`,
 * signed √ against a 2% full scale) stands the water high over it after a week
 * of growth (flood: the flat almost covered) and draws it back after a week of
 * contraction (ebb: the flat bare and shining). Vertical change is invisible
 * at rest distance, so the flat turns it into AREA: its 1:40 slope runs across
 * the view, so ±0.12 u of water moves the waterline ±4.8 u sideways. Its
 * contours run straight out from the rest seat, so every waterline and the
 * wrack line stand upright on screen rather than lying foreshortened.
 *
 * - **The tide-stone** stands on the slack-water line: water at its foot is a
 *   flat week, water beyond it (bare sand in front) is an ebb, water above its
 *   foot a flood. No stone at all means no chain data arrived — distinct from
 *   every real state, and the flat then lies at the datum.
 * - **The wrack line** (data-poetry-5) is a broken line of dark weed where the
 *   water stood at the visitor's last visit (`garden-last-visit.ts`), drawn
 *   only when the tide has moved at least 0.15 since. A first visit shows none.
 *
 * The tide never oscillates: it is a weekly state, not a clock. A changed
 * reading eases over ~20 minutes (the water going out while you watch); reduced
 * motion shows the identical static flat. Two draws (flat + stone), no
 * textures; ripple marks and weed are procedural.
 */

/** Vertical water excursion at a full-scale week (offset ±1), world units. */
export const TIDAL_FLAT_RANGE = 0.12;
/** The flat's slope across the view (1:40). */
export const TIDAL_FLAT_SLOPE = 0.025;
/** Time constant of the ease toward a changed reading (≈ 95 % in 20 minutes). */
export const TIDAL_FLAT_EASE_SECONDS = 400;

/** The flat's centre (tile units) and half-extents (world units, across × away). */
export const TIDAL_FLAT_SITE = Object.freeze({
  tile: { x: 90.5, y: 80.5 },
  halfAcross: 10,
  halfAway: 6,
});
const CENTRE = { x: TIDAL_FLAT_SITE.tile.x * TILE_SCALE, z: TIDAL_FLAT_SITE.tile.y * TILE_SCALE };
/** Away from the rest seat through the flat, and screen-right, in world XZ. */
const SIGHT = Math.hypot(CENTRE.x - REST_SEAT_EYE_LANDSCAPE.world.x, CENTRE.z - REST_SEAT_EYE_LANDSCAPE.world.z);
const AWAY = {
  x: (CENTRE.x - REST_SEAT_EYE_LANDSCAPE.world.x) / SIGHT,
  z: (CENTRE.z - REST_SEAT_EYE_LANDSCAPE.world.z) / SIGHT,
};
const ACROSS = { x: -AWAY.z, z: AWAY.x };
/** Keeps the whole flat out of the inlet capsule (its half-width is 12 tiles). */
const INLET_CLEARANCE_TILES = 13;
/** Where the tide-stone stands: the slack line, toward the viewer. */
const STONE_AWAY = -0.45 * TIDAL_FLAT_SITE.halfAway;
const SUNK = -0.45;

function hash(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Height of the flat above the tidal datum at a world point, before the tide
 * moves the water: a plane falling across the view at 1:40 (higher toward the
 * island), sunk below any tide at its irregular rim and inside the inlet.
 */
export function tidalFlatHeight(worldX: number, worldZ: number): number {
  const dx = worldX - CENTRE.x;
  const dz = worldZ - CENTRE.z;
  const across = dx * ACROSS.x + dz * ACROSS.z;
  const away = dx * AWAY.x + dz * AWAY.z;
  const u = across / TIDAL_FLAT_SITE.halfAcross;
  const v = away / TIDAL_FLAT_SITE.halfAway;
  const angle = Math.atan2(v, u);
  const wobble = 0.08 * Math.sin(angle * 3 + 0.7) + 0.05 * Math.sin(angle * 7 - 1.3);
  const radius = Math.hypot(u, v) * (1 - wobble);
  const rim = smoothstep(0.72, 1, radius);
  const inlet = smoothstep(
    INLET_CLEARANCE_TILES + 1.5,
    INLET_CLEARANCE_TILES,
    gardenInletDistance(worldX / TILE_SCALE, worldZ / TILE_SCALE),
  );
  const plane = -TIDAL_FLAT_SLOPE * across;
  return plane + (SUNK - plane) * Math.max(rim, inlet);
}

/**
 * Where the waterline crosses the flat's centre line for a tide offset, as a
 * signed distance across the view (positive = further right, more sand bare).
 */
export function tidalFlatWaterlineAcross(offset: number): number {
  return (-offset * TIDAL_FLAT_RANGE) / TIDAL_FLAT_SLOPE;
}

const GRID_ACROSS = 40;
const GRID_AWAY = 30;

function createFlatGeometry(): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= GRID_AWAY; row += 1) {
    const away = (row / GRID_AWAY * 2 - 1) * TIDAL_FLAT_SITE.halfAway;
    for (let column = 0; column <= GRID_ACROSS; column += 1) {
      const across = (column / GRID_ACROSS * 2 - 1) * TIDAL_FLAT_SITE.halfAcross;
      const x = CENTRE.x + across * ACROSS.x + away * AWAY.x;
      const z = CENTRE.z + across * ACROSS.z + away * AWAY.z;
      positions.push(x, tidalFlatHeight(x, z), z);
    }
  }
  const stride = GRID_ACROSS + 1;
  for (let row = 0; row < GRID_AWAY; row += 1) {
    for (let column = 0; column < GRID_ACROSS; column += 1) {
      const a = row * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // Wound so the +Y face is the front face (away × across points down).
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const glslColor = (color: Color): string =>
  `vec3(${color.r.toFixed(4)}, ${color.g.toFixed(4)}, ${color.b.toFixed(4)})`;
const glslFloat = (value: number): string => (Number.isInteger(value) ? value.toFixed(1) : String(value));

// Warm, mid-value sand (it sits in the mid-right ninth, L* ≈ 45 at noon), wet
// sand a clear step darker and cooler.
const DRY_SAND = new Color(HARBOR_PALETTE.stone_pale).lerp(new Color(HARBOR_PALETTE.timber_warm), 0.25);
const WET_SAND = new Color(HARBOR_PALETTE.stone_mid).lerp(new Color(HARBOR_PALETTE.deep_sea_1), 0.3);
const MUD = new Color(HARBOR_PALETTE.stone_dark).lerp(new Color(HARBOR_PALETTE.roof_weathered_copper), 0.3);
const WEED = new Color(HARBOR_PALETTE.timber_dark).lerp(new Color(HARBOR_PALETTE.roof_weathered_copper), 0.35)
  .multiplyScalar(0.62);

const VERTEX_PARS = /* glsl */ `
varying vec3 vFlatWorld;
`;
const VERTEX_BODY = /* glsl */ `
vFlatWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
`;
const FRAGMENT_PARS = /* glsl */ `
uniform float uFlatWater;
uniform float uFlatWrackAbove;
varying vec3 vFlatWorld;
float flatHash( vec2 p ) {
  return fract( sin( dot( mod( p, 289.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float flatNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( flatHash( i ), flatHash( i + vec2( 1.0, 0.0 ) ), u.x ),
    mix( flatHash( i + vec2( 0.0, 1.0 ) ), flatHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;
// Heights are measured against the still water, so the bands follow the tide
// wherever the flat stands. Widths are across-the-view distances (height /
// slope), which is what a viewer sees.
const FRAGMENT_BODY = /* glsl */ `
float flatAbove = vFlatWorld.y - uFlatWater;
vec2 flatP = vFlatWorld.xz;
float flatAlong = dot( flatP, vec2( ${glslFloat(AWAY.x)}, ${glslFloat(AWAY.z)} ) );
float flatAcross = dot( flatP, vec2( ${glslFloat(ACROSS.x)}, ${glslFloat(ACROSS.z)} ) );
float flatDamp = 1.0 - smoothstep( 0.0, 0.1, flatAbove );
vec3 flatSand = mix( ${glslColor(DRY_SAND)}, ${glslColor(WET_SAND)}, flatDamp );
flatSand = mix( flatSand, ${glslColor(MUD)}, 0.35 * smoothstep( 0.5, 0.8, flatNoise( flatP * 0.45 ) ) * flatDamp );
// Ripple marks on the bare sand: low ridges running with the view, warped.
float flatRidge = sin( flatAcross * 4.2 + 1.6 * flatNoise( flatP * 0.6 ) );
float flatRidgeResolve = 1.0 - smoothstep( 0.8, 1.8, fwidth( flatAcross * 4.2 ) );
flatSand *= 1.0 + 0.05 * flatRidge * flatRidgeResolve * smoothstep( 0.0, 0.03, flatAbove );
// The fresh wet edge just above the waterline.
float flatEdge = 1.0 - smoothstep( 0.0, 0.012, flatAbove );
flatSand *= 1.0 - 0.18 * flatEdge;
if ( uFlatWrackAbove > -9.0 ) {
  float flatWrackDistance = abs( flatAbove - uFlatWrackAbove ) / ${glslFloat(TIDAL_FLAT_SLOPE)};
  float flatClump = smoothstep( 0.3, 0.55, flatNoise( vec2( flatAlong * 1.1, 3.7 ) ) );
  float flatWrack = ( 1.0 - smoothstep( 0.18, 0.34, flatWrackDistance + 0.12 * flatNoise( flatP * 2.3 ) ) )
    * mix( 0.35, 1.0, flatClump );
  flatSand = mix( flatSand, ${glslColor(WEED)}, 0.9 * flatWrack );
}
diffuseColor.rgb = flatSand;
`;
const ROUGHNESS_BODY = /* glsl */ `
roughnessFactor = mix( roughnessFactor, 0.55, 1.0 - smoothstep( 0.0, 0.1, vFlatWorld.y - uFlatWater ) );
`;

export const GARDEN_TIDAL_FLAT_KEY = "garden-tidal-flat";

export interface GardenTidalFlatFrame {
  reducedMotion: boolean;
  timeSeconds: number;
  /** The last visit's tide offset, or null (no wrack line). */
  lastVisitOffset: number | null;
}

export interface GardenTidalFlat {
  readonly root: Group;
  /** The offset the water currently stands at (eases toward the reading). */
  displayedOffset(): number;
  /** Whether the wrack line is drawn this frame. */
  wrackVisible(): boolean;
  update(frame: GardenTidalFlatFrame): void;
  dispose(): void;
}

/** A flat must have stood this long before a new reading eases from it. */
const EASE_AFTER_SHOWN_SECONDS = 60;

/**
 * Survives a world rebuild: a refreshed reading eases from where the water was
 * shown. The load's first real reading snaps instead — the loading world is
 * not a tide the visitor watched — so easing needs a measured flat that has
 * stood for a minute.
 */
let shown: { offset: number; seconds: number } | null = null;

export function createGardenTidalFlat(tide: SupplyTide): GardenTidalFlat {
  const available = tide.state !== "unavailable";
  const target = available ? tide.offset : 0;
  let displayed = shown && shown.seconds >= EASE_AFTER_SHOWN_SECONDS ? shown.offset : target;
  let lastSeconds: number | null = null;
  let shownSeconds = 0;
  let wrackShown = false;

  const root = new Group();
  root.name = "garden-tidal-flat";
  const geometry = createFlatGeometry();
  const material = new MeshStandardMaterial({ color: 0xffffff, envMapIntensity: 0.3, roughness: 0.92 });
  material.name = "tidal-flat-sand";
  const uniforms = {
    uFlatWater: { value: GARDEN_WATER_Y },
    uFlatWrackAbove: { value: -99 },
  };
  chainGardenMaterialPatch(material, {
    key: GARDEN_TIDAL_FLAT_KEY,
    compile: (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`)
        .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT_BODY}`)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n${ROUGHNESS_BODY}`);
    },
  });
  const flat = new Mesh(geometry, material);
  flat.name = "garden-tidal-flat-sand";
  flat.receiveShadow = true;
  // Not a pick target: the reading is named in the lighthouse detail.
  flat.raycast = () => {};
  root.add(flat);

  let stoneGeometry: CylinderGeometry | null = null;
  let stoneMaterial: MeshStandardMaterial | null = null;
  if (available) {
    stoneGeometry = new CylinderGeometry(0.2, 0.3, 1.5, 6, 1);
    stoneMaterial = new MeshStandardMaterial({
      color: new Color(HARBOR_PALETTE.stone_mid).lerp(new Color(HARBOR_PALETTE.stone_pale), 0.35),
      envMapIntensity: 0.3,
      flatShading: true,
      roughness: 0.95,
    });
    const stone = new Mesh(stoneGeometry, stoneMaterial);
    stone.name = "garden-tidal-flat-tide-stone";
    const x = CENTRE.x + STONE_AWAY * AWAY.x;
    const z = CENTRE.z + STONE_AWAY * AWAY.z;
    // Its foot is the slack line: seated so a flat week's water laps it.
    stone.position.set(x, tidalFlatHeight(x, z) + 0.55, z);
    stone.rotation.set(0.08, hash(x, z) * Math.PI, -0.06);
    stone.castShadow = true;
    stone.receiveShadow = true;
    stone.raycast = () => {};
    root.add(stone);
  }

  const apply = (lastVisitOffset: number | null) => {
    root.position.y = GARDEN_WATER_Y - displayed * TIDAL_FLAT_RANGE;
    wrackShown = available
      && lastVisitOffset !== null
      && Math.abs(lastVisitOffset - target) >= LAST_VISIT_TIDE_MIN_DELTA;
    uniforms.uFlatWrackAbove.value = wrackShown
      ? (lastVisitOffset! - displayed) * TIDAL_FLAT_RANGE
      : -99;
  };
  apply(null);

  return {
    root,
    displayedOffset: () => displayed,
    wrackVisible: () => wrackShown,
    update(frame) {
      if (frame.reducedMotion || lastSeconds === null) {
        displayed = frame.reducedMotion ? target : displayed;
      } else {
        const delta = Math.max(0, Math.min(1, frame.timeSeconds - lastSeconds));
        shownSeconds += delta;
        displayed += (target - displayed) * (1 - Math.exp(-delta / TIDAL_FLAT_EASE_SECONDS));
        if (Math.abs(target - displayed) < 1e-4) displayed = target;
      }
      lastSeconds = frame.timeSeconds;
      // Only a measured flat is a tide to ease from.
      shown = available
        ? { offset: displayed, seconds: frame.reducedMotion ? EASE_AFTER_SHOWN_SECONDS : shownSeconds }
        : null;
      apply(frame.lastVisitOffset);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      stoneGeometry?.dispose();
      stoneMaterial?.dispose();
    },
  };
}
