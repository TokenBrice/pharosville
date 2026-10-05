import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_HEIGHT,
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_WATER_Y,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  blendDayCycleColor,
  DAY_CYCLE_SKY_PRESETS,
  type DayCyclePhase,
} from "./garden-day-cycle";
import type { LampStatusModulation } from "../systems/lamp-status";
import { setGardenAerialBeacon } from "./garden-aerial";
import {
  bindGardenKindleUniforms,
  GARDEN_KINDLE_ORDER,
  gardenLanternKindleFactor,
  gardenLanternKindleState,
} from "./garden-lanterns";
import { gardenModelAnchor } from "./garden-models";
import type { GardenLightPose } from "./garden-sun";
import { GARDEN_ATMOSPHERE } from "./garden-atmosphere";

// L1 silhouette contract (Epic Pharos 2026-09-05; W1.9 keep trade): shell and
// GLB share a 12.4-wide stepped stylobate, battered square (2.5→14.5, half
// 4.6→3.7), octagonal drum (14.5→23, radius 2.75→2.5), columned lantern
// (23.4→26.8) with a glass skin, conical cap (27.2→28.4), pedestal and Zeus
// (29→32, sceptre tip). The tower stands on the crag court six units higher
// than the pre-W1.9 plinth, so its world beacon and crown are unchanged.
// The lantern brazier/beam share GARDEN_LIGHTHOUSE_BEACON_Y; the crown
// shares GARDEN_LIGHTHOUSE_HEIGHT, including on pre-load/failure frames.
const TERRACE_TOP_Y = 2.5;
const SQUARE_TOP_Y = 14.5;
const SQUARE_BASE_HALF = 4.6;
const SQUARE_TOP_HALF = 3.7;
const OCT_TOP_Y = 23;
const OCT_BASE_RADIUS = 2.75;
const OCT_TOP_RADIUS = 2.5;
const LANTERN_BASE_Y = OCT_TOP_Y + 0.4;
const LANTERN_TOP_Y = LANTERN_BASE_Y + 3.4;
const LANTERN_RADIUS = 1.9;
/** Half-extent of the projecting gallery at the square tier's head. */
const GALLERY_HALF = 4.7;
const OCT_FACE = Math.cos(Math.PI / 8);
const SQRT2 = Math.SQRT2;
/**
 * Both the procedural shell and the GLB author the doorway, approach ramp and
 * the statue's sea-facing arm on local +Z. The precinct's open gate and the
 * quay stair that climbs to it sit east of the tower (+X), so the tower body
 * is yawed a quarter turn to put the door on that axis. Only the tower turns:
 * the beam, beacon, fire and birds are siblings under `lighthouseRoot` and
 * keep world-space bearings.
 */
const TOWER_YAW = Math.PI / 2;

const squareHalf = (y: number): number => SQUARE_BASE_HALF
  + (SQUARE_TOP_HALF - SQUARE_BASE_HALF)
    * (y - TERRACE_TOP_Y) / (SQUARE_TOP_Y - TERRACE_TOP_Y);

const octRadius = (y: number): number => OCT_BASE_RADIUS
  + (OCT_TOP_RADIUS - OCT_BASE_RADIUS)
    * (y - SQUARE_TOP_Y) / (OCT_TOP_Y - SQUARE_TOP_Y);

// C1: every colour derives from HARBOR_PALETTE — no local hex literals.
const P = HARBOR_PALETTE;
const palette = (hex: string): Color => new Color(hex);
// pharos-5: neutral weathered limestone (≈ #e4dfd2), not the yellow cream.
const STONE_PALE_WARM = palette(P.foam_white).lerp(palette(P.fog_day), 0.45);
const STONE_MID = STONE_PALE_WARM.clone().lerp(palette(P.stone_pale), 0.35);
const STONE_SHADOW = palette(P.stone_pale).lerp(palette(P.fog_blue), 0.25);
const BRONZE = palette(P.timber_mid).lerp(palette(P.iron_dark), 0.4);
// pharos-7: the statue is dark bronze that reads by its specular line, not
// by self-light; the day cycle lends it only a dusk gleam (≤ 0.4, W0.9) and
// the rim light does the separation. Metalness 0.6 keeps it from mirroring
// the sky into a cream doll.
const GILT = palette(P.timber_mid).lerp(palette(P.stone_dark), 0.45)
  .lerp(palette(P.roof_weathered_copper), 0.12);
const GILT_METALNESS = 0.6;
const GILT_ROUGHNESS = 0.22;
// Night beacon discipline (W0.7): the stone's warm-bounce whisper is an
// emissive term, so it lights the masonry at every hour. 0.015 keeps the day
// shade side warm without turning the night shaft into a lit wall.
const STONE_WARM_BOUNCE = 0.015;
// The beacon's PointLight grazes the lantern storey only; it no longer
// floods the masonry (22 < the 24.2-unit beacon, so it stops short of the foot).
const LIGHTHOUSE_LIGHT_RANGE = 22;
const STAIR_STONE = palette(P.foam_white).lerp(palette(P.fog_day), 0.5);
const SHORE_STONE = palette(P.stone_mid).lerp(palette(P.fog_pale), 0.25);
const LAMP_BASE_COLOR = palette(P.lantern_warm);
const LAMP_BASE_EMISSIVE = palette(P.lantern_glow);
const LAMP_COOL_COLOR = palette(P.lantern_cold);

interface LighthouseModelTarget {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconFireRoot?: Object3D | null;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
  /** T0.2: filled with the attached GLB's cloned aperture materials. */
  lighthouseWindowMaterials?: MeshStandardMaterial[];
  statueGleamMaterials?: MeshStandardMaterial[];
}

export interface LighthouseLampTarget {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  lighthouseLight: PointLight;
}

export function attachGardenLighthouseModel(
  model: Group | null,
  content: LighthouseModelTarget | null,
): void {
  if (!content || !model) return;

  model.removeFromParent();
  model.traverse((object) => {
    if (object instanceof Mesh) object.castShadow = true;
  });
  model.rotation.y = TOWER_YAW;
  content.lighthouseRoot.add(model);
  content.lighthouseShell.visible = false;

  const beaconPosition = gardenModelAnchor(
    model,
    "garden-lighthouse-shell",
    "beacon",
  ).position;
  const beamPosition = gardenModelAnchor(
    model,
    "garden-lighthouse-shell",
    "beam",
  ).position;
  content.beacon.position.copy(beaconPosition);
  content.beaconHalo.position.copy(beaconPosition);
  content.lighthouseLight.position.copy(beaconPosition);
  content.beam.position.copy(beamPosition);
  content.beaconFireRoot?.position.copy(beaconPosition);
  prepareLighthouseModelMaterials(
    model,
    content.statueGleamMaterials,
    content.lighthouseWindowMaterials,
  );
}

/**
 * The material-name contract shared by the procedural shell, the generated GLB
 * (`scripts/pharosville/generate-garden-lighthouse.mjs`) and the precinct
 * gatehouse: any lit aperture in the world carries this name, and the runtime
 * finds it by name alone. Same technique as "bronze-gilt" for the statue.
 */
export const LIGHTHOUSE_WINDOW_MATERIAL_NAME = "lighthouse-window-glow";

/**
 * pharos-1: the lantern glass. The opaque glow drum that shared the window
 * material (and hid the flame) is gone; a thin open glass skin sits just
 * inside the lantern columns in both the procedural shell and the GLB, which
 * authors it under this name for the runtime to find.
 */
export const LIGHTHOUSE_LANTERN_GLASS_MATERIAL_NAME = "lighthouse-lantern-glass";

const GLASS_SKY_NIGHT = DAY_CYCLE_SKY_PRESETS.night.horizon.clone()
  .lerp(DAY_CYCLE_SKY_PRESETS.night.zenith, 0.5);
const GLASS_SKY_DUSK = DAY_CYCLE_SKY_PRESETS.dusk.horizon.clone()
  .lerp(DAY_CYCLE_SKY_PRESETS.dusk.zenith, 0.5);
const GLASS_SKY_DAY = DAY_CYCLE_SKY_PRESETS.day.horizon.clone()
  .lerp(DAY_CYCLE_SKY_PRESETS.day.zenith, 0.55);

/**
 * K9 lantern swell ceiling: the swollen glass's source luminance (linear HDR)
 * stays ≤ 2.0 — a sub-knee swell, never a flare (restraint council 7). The
 * swell colour carries all but 0.3 of it; the warm inner reflection (0.35 ×
 * glow luminance ≈ 0.24) and the dark glass take the rest.
 */
export const LANTERN_SWELL_PEAK_HDR = 2.0;
const GLASS_SWELL_COLOR = palette(P.lantern_glow);
GLASS_SWELL_COLOR.multiplyScalar((LANTERN_SWELL_PEAK_HDR - 0.3) / (
  0.2126 * GLASS_SWELL_COLOR.r + 0.7152 * GLASS_SWELL_COLOR.g + 0.0722 * GLASS_SWELL_COLOR.b
));

/**
 * Shared by the shell's glass and every GLB clone's, so one day-cycle write
 * (updateLighthouseLanternGlass) retunes whichever tower is standing. The
 * defaults are the day read: dark glass with a sky glint, no warmth.
 */
export const LIGHTHOUSE_LANTERN_GLASS_UNIFORMS = {
  uGlassDark: { value: palette(P.iron_dark) },
  uGlassSky: { value: GLASS_SKY_DAY.clone() },
  uGlassSwell: { value: 0 },
  uGlassSwellColor: { value: GLASS_SWELL_COLOR },
  uGlassWarm: { value: 0 },
  uGlassWarmColor: { value: palette(P.lantern_glow) },
};

/**
 * A fresnel film: alpha 0.05 + 0.4·(1 − |N·V|)³, dark glass reflecting the
 * sky of the hour at grazing angles, plus a warm inner reflection of the fire
 * at night (lantern_glow × 0.35 × night). It never emits by day, writes no
 * depth and draws after the flame (renderOrder 1), so the fire reads through.
 * The K9 swell (`uGlassSwell`, 0–1) fills the panes with the fire's light for
 * a few seconds at most about once a minute (createLanternSwell).
 */
function createLanternGlassMaterial(): ShaderMaterial {
  const material = new ShaderMaterial({
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uGlassDark;
      uniform vec3 uGlassSky;
      uniform float uGlassSwell;
      uniform vec3 uGlassSwellColor;
      uniform float uGlassWarm;
      uniform vec3 uGlassWarmColor;
      varying vec3 vGlassNormal;
      varying vec3 vGlassView;

      void main() {
        float facing = abs(dot(normalize(vGlassNormal), normalize(vGlassView)));
        float fresnel = pow(1.0 - facing, 3.0);
        vec3 color = mix(uGlassDark, uGlassSky, fresnel * (1.0 - uGlassSwell))
          + uGlassWarmColor * uGlassWarm
          + uGlassSwellColor * uGlassSwell;
        float alpha = mix(0.05 + 0.4 * fresnel, 0.82, uGlassSwell);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: DoubleSide,
    transparent: true,
    uniforms: { ...LIGHTHOUSE_LANTERN_GLASS_UNIFORMS },
    vertexShader: /* glsl */ `
      varying vec3 vGlassNormal;
      varying vec3 vGlassView;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vGlassNormal = normalize(mat3(modelMatrix) * normal);
        vGlassView = cameraPosition - world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
  });
  material.name = LIGHTHOUSE_LANTERN_GLASS_MATERIAL_NAME;
  return material;
}

function seatLanternGlass(mesh: Mesh): void {
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 1;
}

/**
 * Day-cycle driver for the shared lantern-glass uniforms (once per frame,
 * beside updateLighthouseRimLight).
 */
export function updateLighthouseLanternGlass(phase: DayCyclePhase): void {
  blendDayCycleColor(
    LIGHTHOUSE_LANTERN_GLASS_UNIFORMS.uGlassSky.value,
    GLASS_SKY_NIGHT,
    GLASS_SKY_DUSK,
    GLASS_SKY_DAY,
    phase.dusk,
    phase.daylight,
  );
  LIGHTHOUSE_LANTERN_GLASS_UNIFORMS.uGlassWarm.value = 0.35 * phase.night;
}

/** K9: at most one lantern swell per minute, whatever the PSI-paced sweep rate. */
export const LANTERN_SWELL_INTERVAL_SECONDS = 60;
/** K9: the swell rises and falls over ≥ 1.5 s each — a breath, not a flash. */
export const LANTERN_SWELL_RISE_SECONDS = 1.6;
export const LANTERN_SWELL_FALL_SECONDS = 2.2;
/** cos² of the beam axis against the view axis: the beam is swinging through the eye-line. */
const LANTERN_SWELL_FACING = 0.8;

export interface LanternSwellInput {
  /** cos² of the beam axis against the camera's view axis (1 = pointing at the eye). */
  beamFacing: number;
  /** Night weight of the lamp, already scaled by its status (0 by day). */
  glow: number;
  /**
   * K20: how far the lantern has caught (`gardenLanternCatch`). When a
   * kindling carries it through one half, the glass swells once — the fire
   * taking hold — whatever the beam's bearing.
   */
  caught?: number;
  reducedMotion: boolean;
  timeSeconds: number;
}

export interface LanternSwell {
  /** Advances the swell and writes the shared glass uniform; returns 0–1. */
  update: (input: LanternSwellInput) => number;
}

const easeUnit = (value: number): number => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

/**
 * K20 / K-A: how far the lantern has caught, 0–1 — the kindle factor at the
 * lantern's place in the evening order. The keeper's climb carries it
 * through when he reaches the lantern room; without a ritual the sun's
 * default clock does, shortly after sunset.
 */
export function gardenLanternCatch(): number {
  const { progress, window } = gardenLanternKindleState();
  return gardenLanternKindleFactor(GARDEN_KINDLE_ORDER.lantern, progress, window);
}

/**
 * W2.10 (K9, art-director-5, restraint council 7): when the beam swings
 * through the viewer's eye-line the lantern glass fills with the fire's light
 * and lets it go again — at most once a minute, on a fixed 1.6 s rise and
 * 2.2 s fall that the sweep rate (which carries PSI stress) never paces, and
 * never above 2.0 HDR. Revolutions in between pass without it. K20: the
 * lantern catching (`caught` rising through one half) starts one swell of
 * its own, which also restarts the minute. Reduced motion has no swell at
 * all; a clock that runs backwards (a new deep link) re-arms it.
 */
export function createLanternSwell(): LanternSwell {
  let lastStart = Number.NEGATIVE_INFINITY;
  let lastTime = Number.NEGATIVE_INFINITY;
  let lastCaught = Number.NaN;
  let catchSwell = false;
  return {
    update({ beamFacing, caught, glow, reducedMotion, timeSeconds }) {
      let swell = 0;
      if (reducedMotion || timeSeconds < lastTime) lastStart = Number.NEGATIVE_INFINITY;
      if (!reducedMotion) {
        const caughtNow = caught ?? 1;
        if (lastCaught < 0.5 && caughtNow >= 0.5) {
          lastStart = timeSeconds;
          catchSwell = true;
        } else if (
          glow > 0.05
          && beamFacing >= LANTERN_SWELL_FACING
          && timeSeconds - lastStart >= LANTERN_SWELL_INTERVAL_SECONDS
        ) {
          lastStart = timeSeconds;
          catchSwell = false;
        }
        lastCaught = caughtNow;
        const age = timeSeconds - lastStart;
        swell = age < LANTERN_SWELL_RISE_SECONDS
          ? easeUnit(age / LANTERN_SWELL_RISE_SECONDS)
          : 1 - easeUnit((age - LANTERN_SWELL_RISE_SECONDS) / LANTERN_SWELL_FALL_SECONDS);
        swell *= catchSwell ? 1 : Math.min(1, Math.max(0, glow));
      }
      lastTime = timeSeconds;
      LIGHTHOUSE_LANTERN_GLASS_UNIFORMS.uGlassSwell.value = swell;
      return swell;
    },
  };
}

const scratchBeaconWorld = new Vector3();
const scratchBeamAxis = new Vector3();

/**
 * pharos-8 through the one air (C1, `gardenAerial`): the beacon lights its own
 * mist. Publishes the lantern's world position, the in-scatter strength
 * (night 0.12, dusk 0.04, breathing with the flame's flicker and dimmed with
 * the lamp's status, 0 by day) and the beam's world XZ axis, so the air around
 * the crown is faintly warmer and the fog the beam crosses brightens. Under
 * reduced motion the beam is parked, so the term is static.
 */
export function updateLighthouseAir(
  target: { beaconHalo: Object3D; beam: Object3D },
  phase: DayCyclePhase,
  flicker: number,
  intensityScale: number,
): void {
  target.beaconHalo.getWorldPosition(scratchBeaconWorld);
  scratchBeamAxis.set(1, 0, 0).transformDirection(target.beam.matrixWorld);
  const horizontal = Math.hypot(scratchBeamAxis.x, scratchBeamAxis.z) || 1;
  const air = (phase.night * 0.12 + phase.dusk * 0.04)
    * (0.92 + flicker * 0.16)
    * Math.max(0, intensityScale);
  setGardenAerialBeacon(
    scratchBeaconWorld.x,
    scratchBeaconWorld.y,
    scratchBeaconWorld.z,
    air,
    scratchBeamAxis.x / horizontal,
    scratchBeamAxis.z / horizontal,
  );
}

/**
 * T0.2 (2026-09-07): collects the day-cycle-driven materials out of a freshly
 * built island. Both arrays are per-build, so they cannot leak across
 * rebuilds; the window array is additive (deduped) because the GLB attach
 * appends its clones to the same list rather than replacing the shell's.
 */
export function collectLighthouseGlowMaterials(
  root: Object3D,
  windowMaterials: MeshStandardMaterial[],
): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      if (material.name !== LIGHTHOUSE_WINDOW_MATERIAL_NAME) continue;
      if (!windowMaterials.includes(material)) windowMaterials.push(material);
    }
  });
}

/**
 * W2.9 / pharos-4: at night the tower is dark stone with a few stair lights,
 * not a lit grid. Of the 32 apertures (two registers of three bays on four
 * faces, eight drum windows) three stay lit, switching back up the face the
 * rest seat sees square-on (tower-local −90°; the seat sits at ≈ −65°, so the
 * doorway face is too oblique for its reveals to show a light): register 1 at
 * the far bay, register 2 at the near bay, then the drum window above them.
 * Every other aperture keeps its dark `iron_dark` void. The mask reads the
 * tower-local object position, which the GLB (one merged window mesh) and the
 * procedural shell (merged in shell space) share; the precinct gatehouse owns
 * its own material and stays unmasked. Chained before the rim light, so the
 * mask scales the aperture emissive only. The lit three burn at
 * STAIR_EMBER_GAIN of the shared aperture curve: the GLB's `#ffbe6e` at the
 * day cycle's night 1.0 is ≈ 0.59 linear (L* ≈ 80, measured), an ember is
 * ≈ 0.27 (L* ≈ 57) — far below the lantern, while the gatehouse keeps the
 * full curve. K20: each ember is kindled at its own rung of the evening
 * order, low to high, so the embers climb the stair with the keeper.
 */
const STAIR_EMBER_GAIN = 0.45;
const [EMBER_LOW, EMBER_MID, EMBER_HIGH] = GARDEN_KINDLE_ORDER.stairEmbers;
const STAIR_EMBER_VERTEX_PARS = /* glsl */ `
  varying float vStairLit;
  varying float vStairOrder;
  float lighthouseStairLight( vec3 p ) {
    float az = atan( p.x, p.z );
    if ( p.y < 14.0 ) {
      float face = floor( az / PI_HALF + 0.5 );
      float faceAngle = face * PI_HALF;
      float bay = p.x * cos( faceAngle ) - p.z * sin( faceAngle );
      if ( p.y < 9.5 ) return ( abs( face + 1.0 ) < 0.5 && bay < -1.1 ) ? 1.0 : 0.0;
      return ( abs( face + 1.0 ) < 0.5 && bay > 1.1 ) ? 1.0 : 0.0;
    }
    return abs( floor( az / ( PI * 0.25 ) + 0.5 ) + 2.0 ) < 0.5 ? 1.0 : 0.0;
  }
  float lighthouseStairOrder( vec3 p ) {
    return p.y < 9.5 ? ${EMBER_LOW.toFixed(3)} : p.y < 14.0 ? ${EMBER_MID.toFixed(3)} : ${EMBER_HIGH.toFixed(3)};
  }
`;

export function applyLighthouseStairEmbers(material: MeshStandardMaterial): void {
  if (material.userData.lighthouseStairEmbers) return;
  material.userData.lighthouseStairEmbers = true;
  // These are recessed lamp openings, not polished glazing: retain the warm
  // authored emissive, but do not reflect a white solar/PMREM highlight into
  // the opening. Their fill follows the same output curve as the masonry.
  material.toneMapped = true;
  material.roughness = 1;
  material.metalness = 0;
  material.envMapIntensity = 0;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${STAIR_EMBER_VERTEX_PARS}`)
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  vStairLit = lighthouseStairLight( position );\n  vStairOrder = lighthouseStairOrder( position );",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vStairLit;\nvarying float vStairOrder;")
      .replace(
        "#include <emissivemap_fragment>",
        `totalEmissiveRadiance *= vStairLit * ${STAIR_EMBER_GAIN.toFixed(2)} * gardenKindleFactor( vStairOrder );\n#include <emissivemap_fragment>`,
      );
    bindGardenKindleUniforms(shader);
  };
  material.customProgramCacheKey = () => "lighthouse-stair-embers-kindled";
}

/**
 * W7 presence for the loaded GLB: the shared-cache bronze-gilt is cloned once
 * per attached instance so the day-cycle can animate the Zeus Soter statue
 * gleam without mutating the model library's materials, then the rim light is
 * chained onto every lit material (the cloud-shadow hook composes the same
 * way — see applyLighthouseRimLight).
 */
function prepareLighthouseModelMaterials(
  model: Group,
  statueGleamMaterials: MeshStandardMaterial[] | undefined,
  windowMaterials?: MeshStandardMaterial[],
): void {
  if (!model.userData.lighthouseGleamCloned) {
    model.userData.lighthouseGleamCloned = true;
    const clones = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    // T0.2: the apertures join the gilt in the per-instance clone set — the
    // day cycle animates their emissive, and the model library's shared cache
    // material must not be mutated. The limestone is cloned too so the W0.7
    // stone and bronze retune below applies to this tower alone.
    const animated = new Set(["bronze-gilt", LIGHTHOUSE_WINDOW_MATERIAL_NAME, "weathered-limestone"]);
    let glass: ShaderMaterial | null = null;
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const next = materials.map((material) => {
        if (material instanceof MeshStandardMaterial && material.name === LIGHTHOUSE_LANTERN_GLASS_MATERIAL_NAME) {
          // pharos-1: the authored glass becomes the fresnel skin. The GLB
          // drops normals (flat-shaded masonry), so the skin derives its own;
          // the shared geometry gains them once for every clone.
          if (!object.geometry.getAttribute("normal")) object.geometry.computeVertexNormals();
          seatLanternGlass(object);
          glass ??= createLanternGlassMaterial();
          return glass;
        }
        if (!(material instanceof MeshStandardMaterial) || !animated.has(material.name)) {
          return material;
        }
        let clone = clones.get(material);
        if (!clone) {
          clone = material.clone();
          clone.name = material.name;
          // The GLB authors the pre-W0.7 values; the shell and the loaded
          // tower share one stone and one bronze.
          if (clone.name === "weathered-limestone") clone.emissiveIntensity = STONE_WARM_BOUNCE;
          if (clone.name === "bronze-gilt") clone.metalness = GILT_METALNESS;
          if (clone.name === LIGHTHOUSE_WINDOW_MATERIAL_NAME) applyLighthouseStairEmbers(clone);
          clones.set(material, clone);
        }
        return clone;
      });
      object.material = Array.isArray(object.material) ? next : next[0]!;
    });
  }
  applyLighthouseRimLight(model);
  if (statueGleamMaterials) {
    statueGleamMaterials.length = 0;
    model.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial && material.name === "bronze-gilt") {
          statueGleamMaterials.push(material);
        }
      }
    });
  }
  // The shell's own aperture materials stay in the list (its meshes are hidden
  // once the GLB stands, so the extra writes are inert) and the GLB's clones
  // are appended, so one array drives whichever tower is visible.
  if (windowMaterials) collectLighthouseGlowMaterials(model, windowMaterials);
}

/**
 * W7 rim light: a fresnel rim in a sky-palette colour, masked to sky-facing
 * normals, injected into the tower's lit materials via onBeforeCompile so the
 * Pharos separates from the sky like an engraving. Composes with the I3
 * cloud-shadow hook (garden-island.ts): whichever patch ran first is chained,
 * never clobbered, and the program cache key is extended so rim-only and
 * cloud+rim variants never collide. Uniforms are module-level and shared, so
 * updateLighthouseRimLight retunes every patched material in one write.
 */
/** Exported so the rim curve (T1.7) can be pinned without a renderer. */
export const LIGHTHOUSE_RIM_UNIFORMS = {
  uLighthouseRimColor: { value: new Color(HARBOR_PALETTE.moonlight) },
  // T1.7 (2026-09-07): 0.1 -> 0.16. The rim is what separates the tower from
  // the sky like an engraving, and at 0.1 it was doing that only where the
  // fresnel already peaked. See updateLighthouseRimLight for the phase curve.
  uLighthouseRimStrength: { value: 0.16 },
  // The live key light (sun by day, moon after dark), written every frame by
  // updateLighthouseRimLight so the rim sits on the side the light is on.
  uLighthouseRimSunDir: { value: new Vector3(0, 1, 0) },
  uLighthouseLowSun: { value: 0 },
};
const RIM_NIGHT_COLOR = palette(P.moonlight).lerp(palette(P.fog_blue), 0.4);
const RIM_DUSK_COLOR = DAY_CYCLE_SKY_PRESETS.dusk.horizon.clone();
const RIM_DAY_COLOR = DAY_CYCLE_SKY_PRESETS.day.horizon.clone();

const RIM_FRAGMENT_PARS = /* glsl */ `
  uniform vec3 uLighthouseRimColor;
  uniform float uLighthouseRimStrength;
  uniform vec3 uLighthouseRimSunDir;
  uniform float uLighthouseLowSun;
`;
const RIM_FRAGMENT_CHUNK = /* glsl */ `
  {
    vec3 rimViewDir = normalize( vViewPosition );
    float rimFresnel = pow(
      1.0 - clamp( dot( normalize( normal ), rimViewDir ), 0.0, 1.0 ),
      2.6
    );
    vec3 rimSunView = normalize(
      ( viewMatrix * vec4( uLighthouseRimSunDir, 0.0 ) ).xyz
    );
    float rimSkyMask = smoothstep( 0.0, 0.6, dot( normal, rimSunView ) );
    totalEmissiveRadiance += uLighthouseRimColor
      * ( uLighthouseRimStrength * rimFresnel * rimSkyMask );
  }
`;

export function applyLighthouseRimLight(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      if (material.userData.lighthouseRim) continue;
      material.userData.lighthouseRim = true;
      const previous = material.onBeforeCompile;
      // Captured now (not at key time): the previous hook's source
      // discriminates cloud+rim materials from rim-only ones below.
      const previousHookSource = previous.toString();
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        // Share the module-level uniform objects — never copy — so one
        // day-cycle write reaches every tower material.
        shader.uniforms.uLighthouseRimColor = LIGHTHOUSE_RIM_UNIFORMS.uLighthouseRimColor;
        shader.uniforms.uLighthouseRimStrength = LIGHTHOUSE_RIM_UNIFORMS.uLighthouseRimStrength;
        shader.uniforms.uLighthouseRimSunDir = LIGHTHOUSE_RIM_UNIFORMS.uLighthouseRimSunDir;
        shader.uniforms.uLighthouseLowSun = LIGHTHOUSE_RIM_UNIFORMS.uLighthouseLowSun;
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>\n${RIM_FRAGMENT_PARS}`,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>\n${RIM_FRAGMENT_CHUNK}`,
          )
          .replace("#include <lights_fragment_end>", /* glsl */ `
#include <lights_fragment_end>
// Point-key GGX on the gilt's flat facets otherwise outshines the finite sun
// and clips to white. Bound only low-sun reflection, preserving its warm hue;
// diffuse masonry, lamp emission, and accepted noon/night remain untouched.
if (uLighthouseLowSun > 0.0) {
  vec3 gardenSolarSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
  float gardenSpecularPeak = max(gardenSolarSpecular.r, max(gardenSolarSpecular.g, gardenSolarSpecular.b));
  float gardenSolarSpecularScale = mix(1.0, min(1.0, ${GARDEN_ATMOSPHERE.sunDiscRadiance} / max(gardenSpecularPeak, 1e-8)), uLighthouseLowSun);
  reflectedLight.directSpecular *= gardenSolarSpecularScale;
  reflectedLight.indirectSpecular *= gardenSolarSpecularScale;
}`);
      };
      // Distinguish rim-only from cloud+rim programs: the default cache key
      // is onBeforeCompile's source, identical for every chained closure, so
      // fold in the chained-from hook's source length (the cloud hook's
      // closure differs from the default empty method).
      material.customProgramCacheKey = () => (
        `${previousHookSource.length}|lighthouse-rim-solar-reflection`
      );
    }
  });
}

/**
 * Per-frame driver for the shared rim uniforms: colour and strength follow the
 * day cycle, and the sky mask follows the live key light — `gardenKeyLightPose`,
 * the sun by day and the moon after dark — rather than a frozen noon sun.
 */
export function updateLighthouseRimLight(phase: DayCyclePhase, keyLight: GardenLightPose): void {
  LIGHTHOUSE_RIM_UNIFORMS.uLighthouseRimSunDir.value.copy(keyLight.direction);
  blendDayCycleColor(
    LIGHTHOUSE_RIM_UNIFORMS.uLighthouseRimColor.value,
    RIM_NIGHT_COLOR,
    RIM_DUSK_COLOR,
    RIM_DAY_COLOR,
    phase.dusk,
    phase.daylight,
  );
  // Subtle by day; strongest at night where the tower meets the indigo sky.
  // T1.7 (2026-09-07): 0.1/+0.04/+0.08 -> 0.16/+0.06/+0.12, so day 0.16,
  // dusk 0.22, night 0.28. The whole curve moved together — the old dusk and
  // night lifts were proportionally right, just built on too low a base.
  LIGHTHOUSE_RIM_UNIFORMS.uLighthouseRimStrength.value = 0.16 + phase.dusk * 0.06 + phase.night * 0.12;
  LIGHTHOUSE_RIM_UNIFORMS.uLighthouseLowSun.value = (1 - phase.night)
    * (1 - MathUtils.smoothstep(keyLight.direction.y, 0.08, 0.45));
}

/**
 * W6.4 status overlay. Day-cycle and PSI values are already on the target
 * before this runs; applying the modulation after both means liveness cannot
 * erase the existing PSI character and unreachable can still win on intensity.
 */
export function updateLighthouseLampStatus(
  target: LighthouseLampTarget,
  modulation: LampStatusModulation,
): void {
  const coolMix = Math.min(1, Math.max(0, modulation.coolMix));
  target.beacon.material.color.copy(LAMP_BASE_COLOR).lerp(LAMP_COOL_COLOR, coolMix);
  target.beacon.material.emissive.copy(LAMP_BASE_EMISSIVE).lerp(LAMP_COOL_COLOR, coolMix * 0.7);
  target.beacon.material.emissiveIntensity *= modulation.intensityScale;

  target.beaconHalo.material.color.copy(LAMP_BASE_EMISSIVE).lerp(LAMP_COOL_COLOR, coolMix);
  target.beaconHalo.material.opacity *= modulation.intensityScale;

  target.lighthouseLight.color.copy(LAMP_BASE_COLOR).lerp(LAMP_COOL_COLOR, coolMix);
  target.lighthouseLight.intensity *= modulation.intensityScale;

  target.beam.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const material = object.material;
    if (!(material instanceof ShaderMaterial)) return;
    const color = material.uniforms.uColor?.value;
    if (color instanceof Color) {
      color.copy(BEAM_COLOR).lerp(BEAM_COOL_COLOR, coolMix);
    }
    if (typeof material.uniforms.uOpacity?.value === "number") {
      material.uniforms.uOpacity.value *= modulation.intensityScale;
    }
  });
}

/**
 * The three box steps of the grand square terrace, as `[width, height, centreY]`
 * in lighthouse-local units. The terrace runs from local y=0 to y=2.5.
 *
 * Worth knowing: the loaded GLB shell replaces this procedural tower, and its
 * generator (`scripts/pharosville/generate-garden-lighthouse.mjs`, the
 * `terraceSteps` table) cuts the identical three steps — half-widths 6.2 / 5.7
 * / 5.2 over y 0-0.85 / 0.85-1.7 / 1.7-2.5. Verified, not enforced: nothing
 * links the two tables, so if the GLB's terrace is ever re-cut this moves with
 * it.
 */
const LIGHTHOUSE_TERRACE_STEPS = [
  [12.4, 0.85, 0.425],
  [11.4, 0.85, 1.275],
  [10.4, 0.8, 2.1],
] as const;

export function createLighthouse(): {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  light: PointLight;
  root: Group;
  shell: Group;
} {
  const root = new Group();
  const paleStone = new MeshStandardMaterial({
    color: STONE_PALE_WARM,
    // Matches the GLB's warm-bounce lift (L4): the camera sees the tower's
    // shade side, so albedo + this whisper of warmth carry the day read.
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: STONE_WARM_BOUNCE,
    flatShading: true,
    roughness: 0.88,
  });
  const midStone = new MeshStandardMaterial({
    color: STONE_MID,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: STONE_WARM_BOUNCE,
    flatShading: true,
    roughness: 0.94,
  });
  const shadowStone = new MeshStandardMaterial({
    color: STONE_SHADOW,
    flatShading: true,
    roughness: 0.96,
  });
  const bronze = new MeshStandardMaterial({
    color: BRONZE,
    metalness: 0.5,
    roughness: 0.5,
  });
  const gilt = new MeshStandardMaterial({
    color: GILT,
    emissive: HARBOR_PALETTE.lantern_glow,
    // Dark by day; the day-cycle drives the dusk-only gleam.
    emissiveIntensity: 0,
    metalness: GILT_METALNESS,
    // Matches the GLB's material name so the W7 statue gleam finds the god in
    // both the procedural shell and the loaded model.
    name: "bronze-gilt",
    roughness: GILT_ROUGHNESS,
  });
  // Double-sided so the open brazier bowl reads solid from above.
  const brazierBronze = new MeshStandardMaterial({
    color: BRONZE,
    metalness: 0.5,
    roughness: 0.5,
    side: DoubleSide,
  });

  const stairMaterial = new MeshStandardMaterial({
    color: STAIR_STONE,
    flatShading: true,
    roughness: 1,
  });
  // Grand square terrace: three box steps up to the tower plinth.
  for (const [width, height, y] of LIGHTHOUSE_TERRACE_STEPS) {
    const step = new Mesh(new BoxGeometry(width, height, width), stairMaterial);
    step.position.set(0, y, 0);
    root.add(step);
  }

  // Battered square tier (half-width 4.6 → 3.7): a square cylinder with
  // different top/bottom half-widths, rotated π/4 so a flat face fronts +Z
  // (same facing convention as the GLB).
  const lowerTier = new Mesh(
    new CylinderGeometry(
      squareHalf(10) * SQRT2,
      squareHalf(TERRACE_TOP_Y) * SQRT2,
      10 - TERRACE_TOP_Y,
      4,
    ),
    paleStone,
  );
  lowerTier.position.y = (10 + TERRACE_TOP_Y) / 2;
  lowerTier.rotation.y = Math.PI / 4;
  root.add(lowerTier);

  const upperTier = new Mesh(
    new CylinderGeometry(
      squareHalf(SQUARE_TOP_Y) * SQRT2,
      squareHalf(10) * SQRT2,
      SQUARE_TOP_Y - 10,
      4,
    ),
    midStone,
  );
  upperTier.position.y = (10 + SQUARE_TOP_Y) / 2;
  upperTier.rotation.y = Math.PI / 4;
  root.add(upperTier);

  const doorMaterial = new MeshStandardMaterial({
    color: palette(P.timber_dark),
    roughness: 0.82,
  });
  // Elevated pylon doorway (~y 8, storm-raised) with a dark-bronze lintel and
  // a simple approach ramp climbing the seaward face.
  const landing = new Mesh(new BoxGeometry(1.5, 0.22, 0.95), stairMaterial);
  landing.position.set(0.55, 7.82, squareHalf(7.82) + 0.32);
  root.add(landing);
  const door = new Mesh(new BoxGeometry(0.95, 1.55, 0.14), doorMaterial);
  door.position.set(0.55, 8.6, squareHalf(8.6) + 0.02);
  root.add(door);
  const lintel = new Mesh(new BoxGeometry(1.62, 0.34, 0.26), bronze);
  lintel.position.set(0.55, 9.6, squareHalf(9.6) + 0.04);
  root.add(lintel);
  const ramp = new Mesh(new BoxGeometry(6.0, 0.18, 0.95), stairMaterial);
  ramp.position.set(-1.7, 5.14, squareHalf(5.14) + 0.3);
  ramp.rotation.z = Math.atan2(5.04, 3.2);
  root.add(ramp);

  const windowMaterial = new MeshStandardMaterial({
    // pharos-5(e): a dark void by day; the day cycle kindles it at dusk.
    color: palette(P.iron_dark),
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0,
    // W4.5: matches the GLB's aperture material name, so a day-cycle driver
    // for the interior glow finds the windows in the fallback shell and the
    // loaded model alike (same contract as the "bronze-gilt" statue gleam).
    name: LIGHTHOUSE_WINDOW_MATERIAL_NAME,
    roughness: 1,
    envMapIntensity: 0,
    toneMapped: true,
  });
  applyLighthouseStairEmbers(windowMaterial);
  // Two arched window rows on all four battered faces, emissive-only (the
  // door takes the lower centre bay of the +Z face). A shallow box and
  // semicircular head keep the fallback cheap.
  for (const y of [7.05, 11.05]) {
    for (let side = 0; side < 4; side += 1) {
      const face = new Group();
      for (const x of [-2.2, 0, 2.2]) {
        if (side === 0 && x === 0 && y < 8) continue;
        const window = new Mesh(new BoxGeometry(0.48, 1.1, 0.12), windowMaterial);
        window.position.set(x, y, squareHalf(y) + 0.08);
        face.add(window);
        const arch = new Mesh(
          new CylinderGeometry(0.24, 0.24, 0.12, 8, 1, false, -Math.PI / 2, Math.PI),
          windowMaterial,
        );
        arch.rotation.x = -Math.PI / 2;
        arch.position.set(x, y + 0.55, squareHalf(y) + 0.08);
        face.add(arch);
      }
      face.rotation.y = side * Math.PI / 2;
      root.add(face);
    }
  }
  for (let side = 0; side < 8; side += 1) {
    const angle = side * Math.PI / 4;
    const window = new Mesh(new BoxGeometry(0.5, 2.1, 0.12), windowMaterial);
    const reach = octRadius(SQUARE_TOP_Y + 4.5) * OCT_FACE + 0.06;
    window.position.set(Math.sin(angle) * reach, SQUARE_TOP_Y + 4.5, Math.cos(angle) * reach);
    window.rotation.y = angle;
    root.add(window);
    const arch = new Mesh(
      new CylinderGeometry(0.25, 0.25, 0.12, 8, 1, false, -Math.PI / 2, Math.PI),
      windowMaterial,
    );
    arch.rotation.x = -Math.PI / 2;
    arch.position.set(0, SQUARE_TOP_Y + 5.55, reach);
    const archRoot = new Group();
    archRoot.add(arch);
    archRoot.rotation.y = angle;
    root.add(archRoot);
    const pilasterAngle = angle + Math.PI / 8;
    const pilaster = new Mesh(new CylinderGeometry(0.14, 0.18, 8.5, 6), midStone);
    pilaster.position.set(
      Math.sin(pilasterAngle) * 2.625, SQUARE_TOP_Y + 4.25, Math.cos(pilasterAngle) * 2.625,
    );
    root.add(pilaster);
  }
  const corbelFlare = new Mesh(
    new CylinderGeometry(GALLERY_HALF * SQRT2, SQUARE_TOP_HALF * SQRT2, 0.65, 4),
    midStone,
  );
  corbelFlare.position.y = SQUARE_TOP_Y - 0.45;
  corbelFlare.rotation.y = Math.PI / 4;
  root.add(corbelFlare);

  // Octagonal drum with a flat face fronting +Z.
  const octDrum = new Mesh(
    new CylinderGeometry(OCT_TOP_RADIUS, OCT_BASE_RADIUS, OCT_TOP_Y - SQUARE_TOP_Y, 8),
    paleStone,
  );
  octDrum.position.y = (SQUARE_TOP_Y + OCT_TOP_Y) / 2;
  octDrum.rotation.y = Math.PI / 8;
  root.add(octDrum);

  // L6 gallery: the projecting balustraded terrace at the head of the square
  // tier, mirroring the GLB so the pre-load silhouette is the same monument
  // (the contract is anchors, but the tower's outline is what the eye reads).
  const galleryDeck = new Mesh(
    new BoxGeometry(GALLERY_HALF * 2, 0.28, GALLERY_HALF * 2),
    midStone,
  );
  galleryDeck.position.y = SQUARE_TOP_Y - 0.05;
  root.add(galleryDeck);
  const galleryCoping = new Mesh(
    new BoxGeometry(GALLERY_HALF * 2 + 0.22, 0.14, GALLERY_HALF * 2 + 0.22),
    shadowStone,
  );
  galleryCoping.position.y = SQUARE_TOP_Y + 0.16;
  root.add(galleryCoping);
  for (const side of [-1, 1]) {
    for (const axis of ["x", "z"] as const) {
      const rail = new Mesh(
        new BoxGeometry(
          axis === "x" ? 0.3 : GALLERY_HALF * 2,
          0.18,
          axis === "x" ? GALLERY_HALF * 2 : 0.3,
        ),
        paleStone,
      );
      rail.position.set(
        axis === "x" ? side * (GALLERY_HALF - 0.14) : 0,
        SQUARE_TOP_Y + 1.04,
        axis === "z" ? side * (GALLERY_HALF - 0.14) : 0,
      );
      root.add(rail);
      for (let post = -4; post <= 4; post += 1) {
        const baluster = new Mesh(new BoxGeometry(0.16, 0.72, 0.16), paleStone);
        baluster.position.set(
          axis === "x" ? side * (GALLERY_HALF - 0.14) : post,
          SQUARE_TOP_Y + 0.59,
          axis === "z" ? side * (GALLERY_HALF - 0.14) : post,
        );
        root.add(baluster);
      }
    }
  }
  for (const [cornerX, cornerZ] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const pier = new Mesh(new BoxGeometry(0.72, 1.35, 0.72), midStone);
    pier.position.set(
      cornerX * (GALLERY_HALF - 0.3),
      SQUARE_TOP_Y + 0.9,
      cornerZ * (GALLERY_HALF - 0.3),
    );
    root.add(pier);
  }

  // Four Triton corner finials: simplified cone+sphere conch-blowers standing
  // on the gallery's corner piers, facing outward along the diagonals.
  const tritonOffset = GALLERY_HALF - 0.3;
  for (const [x, z] of [
    [tritonOffset, tritonOffset],
    [-tritonOffset, tritonOffset],
    [tritonOffset, -tritonOffset],
    [-tritonOffset, -tritonOffset],
  ] as const) {
    const triton = new Group();
    const body = new Mesh(new ConeGeometry(0.2, 0.8, 5), shadowStone);
    body.position.y = 0.4;
    triton.add(body);
    const head = new Mesh(new SphereGeometry(0.13, 6, 4), shadowStone);
    head.position.y = 0.95;
    triton.add(head);
    const conch = new Mesh(new ConeGeometry(0.08, 0.3, 5), bronze);
    conch.position.set(0, 0.92, 0.2);
    conch.rotation.x = -0.9;
    triton.add(conch);
    triton.position.set(x, SQUARE_TOP_Y + 1.71, z);
    triton.rotation.y = Math.atan2(x, z);
    root.add(triton);
  }

  // Shared drum-head perch ledge, lantern floor and open colonnade.
  const drumBaseRing = new Mesh(new CylinderGeometry(2.55, 2.55, 0.4, 24), shadowStone);
  drumBaseRing.position.y = OCT_TOP_Y + 0.2;
  root.add(drumBaseRing);
  for (let column = 0; column < 8; column += 1) {
    const angle = column * Math.PI / 4;
    const shaft = new Mesh(new CylinderGeometry(0.17, 0.17, 3.4, 8), paleStone);
    shaft.position.set(Math.sin(angle) * LANTERN_RADIUS, LANTERN_BASE_Y + 1.7, Math.cos(angle) * LANTERN_RADIUS);
    root.add(shaft);
    const capital = new Mesh(new BoxGeometry(0.5, 0.22, 0.5), midStone);
    capital.position.set(shaft.position.x, LANTERN_TOP_Y - 0.11, shaft.position.z);
    root.add(capital);
    // Raised arch between neighbouring columns, open below its soffit.
    const arch = new Mesh(
      new CylinderGeometry(0.73, 0.73, 0.22, 12, 1, true, -Math.PI / 2, Math.PI),
      paleStone,
    );
    const archRoot = new Group();
    arch.rotation.x = -Math.PI / 2;
    arch.position.set(0, LANTERN_TOP_Y - 0.75, LANTERN_RADIUS * Math.cos(Math.PI / 8));
    archRoot.add(arch);
    archRoot.rotation.y = angle + Math.PI / 8;
    root.add(archRoot);
  }
  // pharos-1: the same open glass skin the GLB authors, so the fallback's
  // lantern is a flame seen through glass rather than a lit drum.
  const lanternGlass = new Mesh(
    new CylinderGeometry(1.78, 1.78, 2.45, 32, 1, true),
    createLanternGlassMaterial(),
  );
  lanternGlass.name = "lighthouse-lantern-glass";
  lanternGlass.position.y = LANTERN_BASE_Y + 1.405;
  seatLanternGlass(lanternGlass);
  const entablature = new Mesh(new CylinderGeometry(2.17, 2.17, 0.4, 24), midStone);
  entablature.position.y = LANTERN_TOP_Y + 0.2;
  root.add(entablature);
  const cap = new Mesh(new ConeGeometry(2.17, 1.2, 24), paleStone);
  cap.position.y = LANTERN_TOP_Y + 1.0;
  root.add(cap);
  const pedestal = new Mesh(new CylinderGeometry(0.55, 0.7, 0.6, 8), midStone);
  pedestal.position.y = GARDEN_LIGHTHOUSE_HEIGHT - 3.3;
  root.add(pedestal);

  // Bronze brazier inside the lantern, with coals pinned to the fire origin.
  const brazierFoot = new Mesh(
    new CylinderGeometry(0.55, 0.82, 0.3, 12),
    brazierBronze,
  );
  brazierFoot.position.y = LANTERN_BASE_Y + 0.15;
  root.add(brazierFoot);
  const brazierBowl = new Mesh(
    new CylinderGeometry(1.25, 0.55, 0.75, 12, 1, true),
    brazierBronze,
  );
  brazierBowl.position.y = GARDEN_LIGHTHOUSE_BEACON_Y;
  root.add(brazierBowl);
  const emberBed = new Mesh(
    new CylinderGeometry(1.02, 1.02, 0.16, 12),
    new MeshStandardMaterial({
      color: palette(P.ember),
      emissive: HARBOR_PALETTE.lantern_glow,
      emissiveIntensity: 1.45,
      flatShading: true,
      roughness: 0.5,
      toneMapped: false,
    }),
  );
  emberBed.position.y = GARDEN_LIGHTHOUSE_BEACON_Y;
  root.add(emberBed);

  // Crowning Zeus Soter: tapered robe, head, long vertical sceptre in one
  // hand, the other arm outstretched toward the sea (+Z front). Dark bronze,
  // oversized per the Roman-coin convention; sceptre tip = HEIGHT.
  const robe = new Mesh(new CylinderGeometry(0.3, 0.52, 1.6, 8), gilt);
  robe.position.y = GARDEN_LIGHTHOUSE_HEIGHT - 2.2;
  root.add(robe);
  const chest = new Mesh(new CylinderGeometry(0.34, 0.3, 0.55, 8), gilt);
  chest.position.y = GARDEN_LIGHTHOUSE_HEIGHT - 1.125;
  root.add(chest);
  const head = new Mesh(new SphereGeometry(0.23, 8, 6), gilt);
  head.position.y = GARDEN_LIGHTHOUSE_HEIGHT - 0.58;
  root.add(head);
  const sceptre = new Mesh(new CylinderGeometry(0.05, 0.05, 2.3, 6), gilt);
  sceptre.position.set(-0.5, GARDEN_LIGHTHOUSE_HEIGHT - 1.15, 0.1);
  root.add(sceptre);
  const sceptreTip = new Mesh(new SphereGeometry(0.1, 6, 4), gilt);
  sceptreTip.position.set(-0.5, GARDEN_LIGHTHOUSE_HEIGHT - 0.1, 0.1);
  root.add(sceptreTip);
  const seaArm = new Mesh(new BoxGeometry(0.16, 0.16, 1.05), gilt);
  seaArm.position.set(0.18, GARDEN_LIGHTHOUSE_HEIGHT - 1.02, 0.6);
  root.add(seaArm);
  const sceptreArm = new Mesh(new BoxGeometry(0.52, 0.14, 0.14), gilt);
  sceptreArm.position.set(-0.32, GARDEN_LIGHTHOUSE_HEIGHT - 1.08, 0.08);
  root.add(sceptreArm);

  const shell = new Group();
  shell.name = "lighthouse-procedural-shell";
  shell.add(...root.children);
  // Geometry budget (perf lane: geometries ≤ 275): the fallback shell is
  // visible until the GLB attaches, so every primitive would be GPU-uploaded
  // and counted. Nothing inside the shell moves at runtime (the frame path
  // only toggles shell.visible), so the 40+ static primitives merge into one
  // mesh per material group — visuals, materials (incl. the "bronze-gilt"
  // statue-gleam name), and shadows are identical, ~10 geometries instead.
  mergeStaticShellMeshes(shell);
  // The glass skin is a shader film, not a merge candidate; it joins the
  // shell after the merge so it hides with it when the GLB (and its own
  // glass) stands.
  shell.add(lanternGlass);
  shell.rotation.y = TOWER_YAW;
  root.add(shell);

  // L3 shore props (keeper's rowboat + waterline stones) stay OUTSIDE the
  // shell: they ground the tower at the lee shore in both fallback and GLB
  // modes, so they must survive `lighthouseShell.visible = false`.
  root.add(createKeeperShoreProps());

  // W4 (Pharos Wonder D2): the old glowing beacon sphere is retired as the
  // fire core — the toon flame in garden-beacon-fire.ts owns the summit now.
  // The sphere lives on shrunk to an ember-glow core sitting inside the
  // brazier bowl, under the flame; the day-cycle banks it well below the old
  // hero intensity so it reads as coals, not a floating lamp.
  const beacon = new Mesh(
    new SphereGeometry(0.34, 12, 8),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_warm,
      emissive: HARBOR_PALETTE.lantern_glow,
      emissiveIntensity: 1.1,
      roughness: 0.3,
      toneMapped: false,
    }),
  );
  beacon.position.y = GARDEN_LIGHTHOUSE_BEACON_Y;
  root.add(beacon);

  const halo = createLanternCorona();
  halo.position.copy(beacon.position);
  root.add(halo);

  const light = new PointLight(
    HARBOR_PALETTE.lantern_warm,
    0.95,
    LIGHTHOUSE_LIGHT_RANGE,
    2,
  );
  light.position.copy(beacon.position);
  root.add(light);

  const beam = new Group();
  beam.position.copy(beacon.position);
  // One authored beam at a time: the cone is the normal volumetric cue and
  // the plane is the low-tier fallback. The former outer cone, radial ray fan
  // and dust motes layered several translucent versions of the same signal.
  beam.add(createBeamCone(), createBeamPlane());
  root.add(beam);

  return { beacon, beaconHalo: halo, beam, light, root, shell };
}

/**
 * Collapses the fallback shell's static primitives into one mesh per shared
 * material. Every part (terrace steps, tiers, doorway, ramp, windows, corbel,
 * drums, tritons, brazier, statue) is positioned once at creation and never
 * touched again, so baking each mesh's transform into its geometry is
 * visually identical; materials keep their identity (the "bronze-gilt" gleam
 * lookup and the rim/cloud onBeforeCompile hooks traverse the merged meshes
 * exactly as before). Runs before first render, so nothing merged here was
 * ever GPU-uploaded.
 */
function mergeStaticShellMeshes(shell: Group): void {
  shell.updateMatrixWorld(true);
  const buckets = new Map<MeshStandardMaterial, BufferGeometry[]>();
  shell.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const material = object.material;
    if (!(material instanceof MeshStandardMaterial)) return;
    const bucket = buckets.get(material) ?? [];
    bucket.push(object.geometry.clone().applyMatrix4(object.matrixWorld));
    buckets.set(material, bucket);
  });
  shell.clear();
  let index = 0;
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const mesh = new Mesh(merged, material);
    mesh.name = `lighthouse-shell-part-${index}`;
    index += 1;
    shell.add(mesh);
  }
}

/**
 * L3 toy-scale grounding at the lee shore: a tiny keeper's rowboat and a
 * scatter of waterline stones. Positions are lighthouse-local; the water
 * plane sits at GARDEN_WATER_Y world, i.e. WATER_LOCAL_Y inside this root.
 */
const WATER_LOCAL_Y = GARDEN_WATER_Y - GARDEN_LIGHTHOUSE_ROOT_OFFSET.y;

function createKeeperShoreProps(): Group {
  const group = new Group();
  group.name = "lighthouse-shore-props";

  const hullMaterial = new MeshStandardMaterial({
    color: palette(P.timber_mid),
    flatShading: true,
    roughness: 0.9,
  });
  const trimMaterial = new MeshStandardMaterial({
    color: palette(P.timber_dark),
    flatShading: true,
    roughness: 0.92,
  });
  const benchMaterial = new MeshStandardMaterial({
    color: palette(P.timber_warm),
    flatShading: true,
    roughness: 0.95,
  });

  const rowboat = new Group();
  rowboat.name = "keeper-rowboat";
  // Simple clinker read: a tapered six-sided hull lying on its side, a bench,
  // and two shipped oars. ~1.7 units long against the 38-unit Pharos.
  const hull = new Mesh(new CylinderGeometry(0.26, 0.15, 1.7, 6), hullMaterial);
  hull.rotation.z = Math.PI / 2;
  hull.scale.y = 0.72;
  rowboat.add(hull);
  const bench = new Mesh(new BoxGeometry(0.34, 0.05, 0.4), benchMaterial);
  bench.position.set(0.1, 0.12, 0);
  rowboat.add(bench);
  for (const side of [-1, 1]) {
    const oar = new Mesh(new BoxGeometry(1.1, 0.035, 0.06), trimMaterial);
    oar.position.set(-0.1, 0.16, side * 0.14);
    oar.rotation.y = side * 0.5;
    rowboat.add(oar);
  }
  rowboat.position.set(-13.0, WATER_LOCAL_Y + 0.14, 6.3);
  // Long axis along the shoreline tangent at the lee-side waterline.
  rowboat.rotation.y = -1.37;
  group.add(rowboat);

  // Half-sunk stones on the island's west waterline, outside the fortified
  // precinct (outer half-width 8.6 plus its corner bastions).
  const stoneMaterial = new MeshStandardMaterial({
    color: SHORE_STONE,
    flatShading: true,
    roughness: 0.96,
  });
  const stoneGeometry = new IcosahedronGeometry(1, 0);
  for (const [x, z, size, squash, turn] of [
    [-12.5, 5.6, 0.5, 0.7, 0.4],
    [-13.0, 6.6, 0.38, 0.75, 2.1],
    [-14.0, 7.4, 0.55, 0.7, 1.2],
    [-13.6, 5.2, 0.34, 0.8, 2.9],
    [-12.9, 6.8, 0.44, 0.7, 0.9],
  ] as const) {
    const stone = new Mesh(stoneGeometry, stoneMaterial);
    stone.position.set(x, WATER_LOCAL_Y + size * squash * 0.35, z);
    stone.scale.set(size, size * squash, size);
    stone.rotation.y = turn;
    group.add(stone);
  }

  return group;
}

// The beam sweeps horizontally along the group's +X (apex at the beacon). Its
// 92-unit reach meets the finite rim from the island in the default framing;
// the broad end stays a feathered volume rather than a screen-wide wedge. The
// water shader derives its road and landing pool from these same dimensions.
export const GARDEN_LIGHTHOUSE_BEAM_LENGTH = 92;
export const GARDEN_LIGHTHOUSE_BEAM_BASE_RADIUS = 4.2;
export const GARDEN_LIGHTHOUSE_BEAM_POOL_DISTANCE = 86;
/**
 * The breath shading normalises the chord to the local diameter (1 at a
 * side-on pass through the axis), where the retired double-sided shell
 * stacked two layers with a nested core; this gain keeps the night throat's
 * integrated alpha at the day cycle's authored level.
 */
const BEAM_BREATH_GAIN = 1.9;
/** Path-length ceiling: an end-on chord would otherwise stack into a disc. */
const BEAM_PATH_CEILING = 2.4;
// C1 palette-derived: warm lantern gold lifted toward foam white.
const BEAM_COLOR = palette(P.lantern_glow).lerp(palette(P.foam_white), 0.22);
const BEAM_COOL_COLOR = BEAM_COLOR.clone().lerp(LAMP_COOL_COLOR, 0.75);

/**
 * W2.10 (pharos-3, K9) — the beam as breath. One open cone, apex at the
 * beacon and axis along +X, drawn back faces only so each pixel is shaded
 * once. The fragment is shaded by the view ray's path through the volume,
 * not by the mesh surface: each back-face fragment is one root of the ray–cone
 * quadratic, so the entry is the other root (product of roots = c/a) or the
 * open far end, and the chord between them carries the light. Silhouettes go
 * to nothing on their own (the chord shrinks to zero), the density falls
 * radially from the axis and fades to nothing over the beam's last third,
 * and there is no end-cap. End-on, the chord is capped and the beam
 * dissolves (per-fragment ray/axis alignment) into the lantern's corona
 * rather than stacking into a disc. At full/balanced (`uVolumetric` 1) a
 * world-locked two-octave mist drifts through it and a storm thickens it;
 * recovery keeps the plain breath. `uTime` is frozen under reduced motion by
 * the caller.
 */
function createBeamCone(): Mesh<ConeGeometry, ShaderMaterial> {
  const geometry = new ConeGeometry(
    GARDEN_LIGHTHOUSE_BEAM_BASE_RADIUS,
    GARDEN_LIGHTHOUSE_BEAM_LENGTH,
    48,
    1,
    true,
  );
  // Apex to the group origin, axis rotated from +Y to +X.
  geometry.translate(0, -GARDEN_LIGHTHOUSE_BEAM_LENGTH / 2, 0);
  geometry.rotateZ(Math.PI / 2);
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uLength;
      uniform float uOpacity;
      uniform float uStorm;
      uniform float uTan;
      uniform float uTime;
      uniform float uVolumetric;
      varying vec3 vCamLocal;
      varying vec3 vLocal;
      varying vec3 vWorldPos;

      float beamHash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float beamNoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(
            mix(beamHash(i), beamHash(i + vec3(1.0, 0.0, 0.0)), u.x),
            mix(beamHash(i + vec3(0.0, 1.0, 0.0)), beamHash(i + vec3(1.0, 1.0, 0.0)), u.x),
            u.y
          ),
          mix(
            mix(beamHash(i + vec3(0.0, 0.0, 1.0)), beamHash(i + vec3(1.0, 0.0, 1.0)), u.x),
            mix(beamHash(i + vec3(0.0, 1.0, 1.0)), beamHash(i + vec3(1.0, 1.0, 1.0)), u.x),
            u.y
          ),
          u.z
        );
      }

      void main() {
        vec3 o = vCamLocal;
        vec3 toExit = vLocal - o;
        float sExit = length(toExit);
        vec3 d = toExit / sExit;
        float t2 = uTan * uTan;
        float a = d.y * d.y + d.z * d.z - t2 * d.x * d.x;
        float c = o.y * o.y + o.z * o.z - t2 * o.x * o.x;
        // This fragment is one root; the entry is the other, if it lies on
        // the forward nappe before the exit, else the open far end / apex.
        float sOther = abs(a) > 1e-7 ? c / (a * sExit) : -1e9;
        float coneEntry = (sOther < sExit && o.x + d.x * sOther >= 0.0) ? sOther : -1e9;
        float slabEntry = abs(d.x) > 1e-6
          ? ((d.x < 0.0 ? uLength : 0.0) - o.x) / d.x
          : -1e9;
        float sEntry = max(max(coneEntry, slabEntry), 0.0);
        float chord = max(sExit - sEntry, 0.0);
        float sMid = 0.5 * (sEntry + sExit);
        vec3 mid = o + d * sMid;
        float x = clamp(mid.x, 0.5, uLength);
        float radius = x * uTan;
        float along = x / uLength;
        float radial = length(mid.yz) / radius;
        float density = exp(-3.0 * radial * radial);
        float path = min(chord / (2.0 * radius), ${BEAM_PATH_CEILING.toFixed(2)});
        // Densest at the lantern's throat, nothing over the last third.
        float fade = smoothstep(0.004, 0.04, along)
          * (1.0 - smoothstep(0.64, 1.0, along))
          / (1.0 + along * 1.6);
        // Light travelling toward the eye scatters forward a little more;
        // fully end-on the shaft gives way to the corona instead of a disc.
        float toward = max(-d.x, 0.0);
        float endOn = 1.0 - 0.85 * smoothstep(0.55, 0.95, d.x * d.x);
        float forward = 1.0 + 0.8 * toward * toward;
        float alpha = uOpacity * ${BEAM_BREATH_GAIN.toFixed(2)}
          * path * density * fade * forward * endOn;
        if (uVolumetric > 0.5) {
          vec3 worldMid = cameraPosition + (vWorldPos - cameraPosition) * (sMid / sExit);
          vec3 mistPoint = worldMid * 0.22
            + vec3(uTime * 0.05, uTime * 0.013, -uTime * 0.031);
          float mist = beamNoise(mistPoint) * 0.65
            + beamNoise(mistPoint * 2.7 + 11.3) * 0.35;
          float thickness = clamp(0.55 + uStorm * 0.9, 0.0, 1.0);
          alpha *= mix(1.0, 0.45 + 1.1 * mist, thickness) * (1.0 + uStorm * 0.8);
        }
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    side: BackSide,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uColor: { value: BEAM_COLOR.clone() },
      uLength: { value: GARDEN_LIGHTHOUSE_BEAM_LENGTH },
      uOpacity: { value: 0 },
      uStorm: { value: 0 },
      uTan: { value: GARDEN_LIGHTHOUSE_BEAM_BASE_RADIUS / GARDEN_LIGHTHOUSE_BEAM_LENGTH },
      uTime: { value: 0 },
      uVolumetric: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vCamLocal;
      varying vec3 vLocal;
      varying vec3 vWorldPos;

      void main() {
        vLocal = position;
        vCamLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
      }
    `,
  });
  const cone = new Mesh(geometry, material);
  cone.name = "lighthouse-beam-cone";
  return cone;
}

/**
 * pharos-1 air corona radius (world units) at the day cycle's night scale.
 * The day cycle caps the halo's scale at 1.25 (W0.7), so the authored sphere
 * is the corona ÷ 1.25.
 */
export const LIGHTHOUSE_CORONA_RADIUS = 6;
const CORONA_BASE_RADIUS = LIGHTHOUSE_CORONA_RADIUS / 1.25;

const CORONA_VARYINGS = /* glsl */ `
  varying vec3 vCoronaView;
  varying vec3 vCoronaCentre;
  varying float vCoronaRadius;
`;

/**
 * W2.9 (pharos-1): the air around the lantern glows — a soft warm corona two
 * to three lantern-widths across that fades into the night, replacing the
 * tight halo ball. It is a sphere shaded as a camera-facing sprite: each
 * pixel's distance from the lantern to its eye ray (world units) sets a
 * `pow(1/(1+(r/1.2)²), 1.4)` core over a broad faint skirt, which reaches
 * zero before the silhouette, so tessellation never shows. Additive,
 * depth-tested (the front of the sphere stands in the air before the tower),
 * untouched by fog and far below the bloom knee: at the night opacity (0.3)
 * its peak is ≈ 0.3 linear (≈ 0.5 at the top of a K9 swell). The day cycle
 * writes opacity/scale; the frame path adds the flame's flicker, the lamp
 * status and the K9 swell.
 */
function createLanternCorona(): Mesh<SphereGeometry, MeshBasicMaterial> {
  const material = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: HARBOR_PALETTE.lantern_glow,
    depthWrite: false,
    fog: false,
    opacity: 0,
    toneMapped: false,
    transparent: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${CORONA_VARYINGS}`)
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vCoronaView = mvPosition.xyz;
        vCoronaCentre = ( modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
        vCoronaRadius = length( ( modelViewMatrix * vec4( position, 0.0 ) ).xyz );`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${CORONA_VARYINGS}`)
      .replace(
        "#include <opaque_fragment>",
        `{
          float coronaR = length( cross( normalize( vCoronaView ), vCoronaCentre ) );
          float coronaEdge = coronaR / max( vCoronaRadius, 1e-3 );
          float coronaCore = pow( 1.0 / ( 1.0 + coronaR * coronaR / 1.44 ), 1.4 );
          float coronaSkirt = 0.4 * ( 1.0 - coronaEdge ) * ( 1.0 - coronaEdge );
          diffuseColor.a *= ( coronaCore + coronaSkirt )
            * ( 1.0 - smoothstep( 0.72, 1.0, coronaEdge ) );
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => "lighthouse-corona";
  const corona = new Mesh(new SphereGeometry(CORONA_BASE_RADIUS, 24, 16), material);
  corona.name = "lighthouse-halo";
  corona.castShadow = false;
  corona.receiveShadow = false;
  return corona;
}

/** Recovery/constrained fallback: the original flat additive beam plane. */
function createBeamPlane(): Mesh<PlaneGeometry, ShaderMaterial> {
  const geometry = new PlaneGeometry(
    GARDEN_LIGHTHOUSE_BEAM_LENGTH,
    GARDEN_LIGHTHOUSE_BEAM_BASE_RADIUS * 2,
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(GARDEN_LIGHTHOUSE_BEAM_LENGTH / 2, 0, 0);
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        float along = vUv.x;
        float across = abs(vUv.y - 0.5);
        float halfWidth = mix(0.02, 0.38, smoothstep(0.0, 1.0, along));
        float feather = 1.0 - smoothstep(halfWidth * 0.42, halfWidth, across);
        float startFade = smoothstep(0.0, 0.08, along);
        float endFade = 1.0 - smoothstep(0.7, 1.0, along);
        float strands = 0.82 + sin(along * 96.0) * 0.18;
        gl_FragColor = vec4(
          uColor,
          uOpacity * feather * startFade * endFade * strands
        );
      }
    `,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uColor: { value: BEAM_COLOR.clone() },
      uOpacity: { value: 0.08 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  });
  const sweep = new Mesh(geometry, material);
  sweep.name = "lighthouse-beam";
  sweep.visible = false;
  return sweep;
}
