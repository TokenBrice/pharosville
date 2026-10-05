import {
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import type { ThreeWorldRendererFrame } from "../renderer/world-renderer-backend";
import { HARBOR_PALETTE } from "../systems/palette";

const P = HARBOR_PALETTE;
const paletteColor = (hex: string): Color => new Color(hex);

// Emissive intensity is a multiplier, not linear luminance. Calibrate the
// authored practical colours once so their night cores straddle the bloom knee.
function colorLuminance(color: Color): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}
const WARM_LANTERN_NIGHT_INTENSITY = 2.7 / colorLuminance(paletteColor(P.lantern_warm));
const GLOW_LANTERN_NIGHT_INTENSITY = 2.7 / colorLuminance(paletteColor(P.lantern_glow));
const BEACON_NIGHT_GAIN = 3.2 / (7.2 * colorLuminance(paletteColor(P.lantern_glow)));
// --- C1: day-cycle contract (frozen in P0) ----------------------------------
// Every time-of-day color in the scene derives from HARBOR_PALETTE via the
// preset objects below; no module declares its own hex literals. Blend
// factors come from `dayCyclePhase` — modules that need day/dusk/night
// weights (Lane W's water shader included) must import it from here rather
// than keeping a local copy of the curve.
export type DayCyclePhaseName = "day" | "dusk" | "night";
export { dayCycleBeats, type DayCycleBeatName, type DayCycleBeats } from "../systems/day-cycle-beats";
import { dayCycleBeats, type DayCycleBeatName, type DayCycleBeats } from "../systems/day-cycle-beats";
import { gardenMoonPose, type GardenLightPose } from "./garden-sun";
import { gardenDayDrift } from "./garden-aerial";
import { GARDEN_KINDLE_ORDER, gardenLanternKindleFactor, gardenLanternKindleState } from "./garden-lanterns";

/** How much of its night strength the brazier takes when the lantern catches at blue hour. */
const BEACON_CATCH_NIGHT = 0.6;
const LIGHT_BEAT_NAMES: readonly DayCycleBeatName[] = ["dawn", "day", "golden", "blue", "night"];
const scratchMoonPose: GardenLightPose = { direction: new Vector3(0, 1, 0), elevation: 0, moonLight: 0 };

export interface DayCycleSkyPreset {
  fog: Color;
  horizon: Color;
  zenith: Color;
}

export interface DayCycleLightPreset {
  ambient: Color;
  ambientIntensity: number;
  dirColor: Color;
  dirIntensity: number;
  hemiGround: Color;
  hemiIntensity: number;
  hemiSky: Color;
}

/**
 * W2.1: authored parameters for the shared sun-tinted height-fog term.
 *
 * Density is intentionally lowest by day: the day grade is already pale, so
 * the fog's job there is to separate a crisp foreground from a cooler distant
 * fleet, not to lay another milk wash over the whole frame. Height falloff
 * protects the monument and upper sails while the sea-level air remains
 * legible. These are decorative atmosphere values only; they encode no data.
 */
export interface DayCycleHeightFogPreset {
  density: number;
  heightFalloff: number;
  horizon: Color;
  phaseGain: number;
  sunTint: Color;
  zenith: Color;
}

// Sky presets (consumed by garden-sky). Golden Garden (2026-09-07):
//   day   — a lighter cerulean zenith over a gold-cream horizon and a warm
//           haze, so the sky fill reveals form without cooling it;
//   dusk  — the ember hour with a VIOLET zenith. The old dusk reined its
//           ember back to a navy that was itself a cold grey, and the result
//           was brown smog. Ember reads as light only against its complement,
//           so the dusk zenith now sits on the violet `sky_horizon` lifted a
//           quarter of the way to the day cerulean, and the fog is ember
//           mixed with the violet mist rather than with the navy;
//   night — violet-indigo, the Lantern Sea after dark.
const DUSK_EMBER_AIR = paletteColor(P.lantern_warm).lerp(paletteColor(P.vermillion), 0.22);
export const DAY_CYCLE_SKY_PRESETS: Record<DayCyclePhaseName, DayCycleSkyPreset> = {
  day: {
    fog: paletteColor(P.fog_day),
    horizon: paletteColor(P.sky_day_horizon),
    zenith: paletteColor(P.sky_day_zenith),
  },
  dusk: {
    fog: DUSK_EMBER_AIR.clone().lerp(paletteColor(P.fog_blue), 0.85),
    horizon: DUSK_EMBER_AIR.clone().lerp(paletteColor(P.fog_blue), 0.3),
    zenith: paletteColor(P.sky_horizon).lerp(paletteColor(P.sky_day_zenith), 0.25),
  },
  night: {
    fog: paletteColor(P.sky_horizon),
    horizon: paletteColor(P.sky_horizon),
    zenith: paletteColor(P.sky_night),
  },
};

// The dusk "west band" ember accent painted by the sky dome where the sun
// sets; strength is driven by the dusk blend factor.
export const DUSK_EMBER_COLOR = paletteColor(P.lantern_warm).lerp(paletteColor(P.vermillion), 0.45);

export const MOON_COLOR = paletteColor(P.moonlight);
export const STAR_COLOR = paletteColor(P.moonlight).lerp(paletteColor(P.foam_white), 0.4);

// Five authored rigs. Key:fill is measured against ambient + hemisphere;
// the environment is a separate, phase-scaled reflection correction.
//
// W2.1 (light-2): complementary rigs. Warmth lives in the key and nowhere
// else; the fill is the sky's cool complement and the ground bounce is a
// neutral-cool sea-and-stone value, so shade reads violet-blue against gold
// rather than as a darker orange. The print inks (garden-print-inks) re-ink
// the same indirect term per beat; the rigs set its energy.
// Print-gate tune: 0.45 → 0.6 of the anchor, so the lit planes at 18:30 read
// gold against the violet-blue air rather than as pale stone in lavender.
const GOLDEN_KEY = paletteColor(P.sun_day_warm).lerp(paletteColor(P.lantern_warm), 0.6);
export const DAY_CYCLE_LIGHT_PRESETS: Record<DayCycleBeatName, DayCycleLightPreset> = {
  dawn: {
    ambient: paletteColor(P.foam_white),
    ambientIntensity: 0.14,
    dirColor: paletteColor(P.sun_day_warm),
    dirIntensity: 1.2,
    // W1.8 (printmaker sub 3): a stone bounce, not orange timber. With the
    // key now front-right the visible faces take shade fill from the ground.
    hemiGround: paletteColor(P.stone_mid),
    hemiIntensity: 0.26,
    hemiSky: paletteColor(P.fog_blue),
  },
  day: {
    ambient: paletteColor(P.foam_white),
    // 0.2 → 0.15 (W2.1): the shade face was within 1.53× of the lit face at
    // #t=12.25; less shapeless fill lets the side light draw the courses.
    ambientIntensity: 0.15,
    dirColor: new Color(1, 1, 1),
    // 3.3 → 6.2 (Print-gate tune): the side-lit limestone must stand brighter
    // than the middle-value noon air, so the lit face reads warm-white; the
    // sky fill rises with it (0.42 → 0.68) so the shade face stays a readable
    // cool middle value and the tower's mean clears its air.
    dirIntensity: 6.2,
    hemiGround: paletteColor(P.timber_mid).lerp(paletteColor(P.foam_white), 0.65),
    hemiIntensity: 0.68,
    // A breath of cerulean in the sky fill so noon shade reads blue-green.
    hemiSky: paletteColor(P.foam_white).lerp(paletteColor(P.sky_day_zenith), 0.25),
  },
  golden: {
    ambient: paletteColor(P.sky_horizon),
    ambientIntensity: 0.08,
    // Honey, not paint: the anchor `lantern_warm` diluted with the day's honey
    // key cuts the key's chroma so the light reads as light, not as a filter.
    dirColor: GOLDEN_KEY,
    // 3.0 → 3.6 (Print-gate tune): the last light on the tower and sails is
    // the brightest warm thing in the frame.
    dirIntensity: 3.6,
    // The cool complement: sky fill from the violet mist lifted toward the
    // zenith, and a neutral-cool bounce off stone and sea.
    hemiGround: paletteColor(P.stone_mid).lerp(paletteColor(P.deep_sea_1), 0.3),
    // 0.5 → 0.4 (Print-gate tune): deeper violet shade, lit/shade toward 2.
    hemiIntensity: 0.4,
    hemiSky: paletteColor(P.fog_blue).lerp(paletteColor(P.sky_day_zenith), 0.45),
  },
  blue: {
    ambient: paletteColor(P.fog_blue),
    ambientIntensity: 0.12,
    dirColor: paletteColor(P.moonlight),
    dirIntensity: 0.96,
    hemiGround: paletteColor(P.timber_dark),
    hemiIntensity: 0.2,
    hemiSky: paletteColor(P.sky_horizon),
  },
  night: {
    // Moon-independent diffuse: reflected cool sky and stone/ground bounce
    // reveal surface mass, while local occlusion keeps cracks and eaves dark.
    ambient: paletteColor(P.moonlight).lerp(paletteColor(P.fog_blue), 0.45),
    ambientIntensity: 0.28,
    // Only the actual lunar presence × illumination drives this silver rim.
    dirColor: paletteColor(P.moonlight).lerp(paletteColor(P.fog_blue), 0.5),
    dirIntensity: 0.4,
    hemiGround: paletteColor(P.stone_mid).lerp(paletteColor(P.deep_sea_2), 0.35),
    hemiIntensity: 0.64,
    hemiSky: paletteColor(P.moonlight).lerp(paletteColor(P.fog_blue), 0.5),
  },
};

/**
 * X9 (light-6): time inside the day beat, scaled by `gardenDayDrift` (−1
 * morning … +1 afternoon) and the day weight. `fill` scales hemisphere and
 * ambient (±15 %); the key takes a luma-preserving cool or honey tint.
 */
export const DAY_CYCLE_DAY_DRIFT = { fill: 0.15, keyCool: 0.1, keyWarm: 0.14 } as const;
const unitLuma = (color: Color): Color => color.multiplyScalar(1 / colorLuminance(color));
const DAY_KEY_MORNING_TINT = unitLuma(paletteColor(P.foam_white).lerp(paletteColor(P.sky_day_zenith), 0.3));
const DAY_KEY_AFTERNOON_TINT = unitLuma(paletteColor(P.sun_day_warm));

/**
 * W2.1 authored eye adaptation (light-2): each beat sits at its own
 * brightness. Deterministic per clock, blended by the beats — not
 * auto-exposure. Bloom thresholds the linear HDR before tone mapping, so the
 * 2.4 knee is unaffected; night's lift pairs with the dimmer practicals.
 */
export const DAY_CYCLE_EXPOSURE: Readonly<Record<DayCycleBeatName, number>> = {
  dawn: 1.0,
  // 0.96 → 1.06 (Print-gate tune): the noon air is now middle-value blue, not
  // milk, so the top row needs the exposure back to hold the bible's 60–72.
  day: 1.06,
  golden: 0.84,
  blue: 1.0,
  night: 1.15,
};

export function dayCycleExposure(beats: DayCycleBeats): number {
  let exposure = 0;
  for (const name of LIGHT_BEAT_NAMES) exposure += DAY_CYCLE_EXPOSURE[name] * beats[name];
  return exposure;
}

/**
 * Wave 6 sail value, separate from the cloth's issuer-owned colour policy.
 * Moonlight may reveal the dye after dark, but the fleet cannot become a
 * second field of white lamps competing with the beacon and moon road.
 */
export const GARDEN_SAIL_EMISSIVE = Object.freeze({
  day: 0.06,
  dusk: 0.12,
  night: 0.09,
});

export const DAY_CYCLE_HEIGHT_FOG_PRESETS: Record<DayCyclePhaseName, DayCycleHeightFogPreset> = {
  day: {
    // 2026-09-07: 0.000055 -> 0.00012, gain 0.12 -> 0.2. The height term is the
    // art-directed half of the aerial perspective: at falloff 0.28 the sea
    // plane hazes ~10x harder than the Pharos crown at y=8, so distance eats
    // the water and open fleet while the monument stays crisp. Still below
    // night's density, so the authored day < night < dusk order holds.
    density: 0.00012,
    heightFalloff: 0.28,
    horizon: DAY_CYCLE_SKY_PRESETS.day.fog.clone(),
    phaseGain: 0.2,
    sunTint: DAY_CYCLE_LIGHT_PRESETS.day.dirColor.clone(),
    zenith: DAY_CYCLE_SKY_PRESETS.day.zenith.clone(),
  },
  dusk: {
    // Golden Garden (2026-09-07): thinned again from 0.00035 / gain 0.78 —
    // with a violet zenith the ember no longer needs a smog wash to read; it
    // reads as hue on the seam and as the key's rake. Dusk still keeps the
    // densest air of the three phases (pinned), so it remains the haziest hour.
    density: 0.00023,
    heightFalloff: 0.2,
    horizon: DAY_CYCLE_SKY_PRESETS.dusk.fog.clone(),
    phaseGain: 0.4,
    sunTint: DAY_CYCLE_LIGHT_PRESETS.golden.dirColor.clone(),
    zenith: DAY_CYCLE_SKY_PRESETS.dusk.zenith.clone(),
  },
  night: {
    density: 0.00022,
    heightFalloff: 0.24,
    horizon: DAY_CYCLE_SKY_PRESETS.night.fog.clone(),
    phaseGain: 0.04,
    sunTint: DAY_CYCLE_LIGHT_PRESETS.night.dirColor.clone(),
    zenith: DAY_CYCLE_SKY_PRESETS.night.zenith.clone(),
  },
};

export interface DayCyclePhase {
  daylight: number;
  dusk: number;
  night: number;
}

export function dayCyclePhase(hourInput: number): DayCyclePhase {
  const beats = dayCycleBeats(hourInput);
  const warm = 0.5 * (beats.dawn + beats.golden);
  return { daylight: beats.day + warm, dusk: warm + beats.blue, night: beats.night };
}

/** Night base, lerp toward dusk then day — one blend law for the whole scene. */
export function blendDayCycleColor(
  target: Color,
  night: Color,
  dusk: Color,
  day: Color,
  duskMix: number,
  daylightMix: number,
): void {
  target.copy(night).lerp(dusk, duskMix).lerp(day, daylightMix);
}

export function blendDayCycleScalar(
  night: number,
  dusk: number,
  day: number,
  duskMix: number,
  daylightMix: number,
): number {
  return (night + (dusk - night) * duskMix) + (day - (night + (dusk - night) * duskMix)) * daylightMix;
}

interface DayCycleContent {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  // W4 living fire: the day-cycle owns its day/dusk/night identity (D3).
  beaconFire: {
    mirrorMaterial: MeshStandardMaterial;
    uniforms: { uIntensity: { value: number } };
  };
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  /** Shared sail material for the batched fleet (W1); null before batches exist. */
  fleetSailMaterial: MeshStandardMaterial | null;
  harborLanternMaterial: MeshStandardMaterial;
  /**
   * T0.2 remainder (2026-09-07): the island's two stone path lanterns share
   * one lamp material (`gardenIslandLanternMaterial`). Optional and nullable
   * so the cycle no-ops safely before the integrator wires the handle.
   */
  islandLanternMaterial?: MeshStandardMaterial | null;
  /**
   * T0.2 (2026-09-07): the batched station apertures — one "window" bucket
   * mesh per detail level, holding every station shoji.
   *
   * Typed structurally rather than as `GardenHarborBatch`: garden-harbor-batch
   * imports garden-height-fog, which imports THIS module, so a runtime import
   * would close a cycle. Optional so the field can be absent without breaking
   * the build.
   */
  harborBatch?: {
    bucketMeshes: { window: Mesh | null };
    fineDetailBucketMeshes: { window: Mesh | null };
  } | null;
  lighthouseLight: PointLight;
  /**
   * T0.2: every building aperture that carries the "lighthouse-window-glow"
   * material name — the tower's arched window rows (procedural shell or the
   * cloned GLB set) and the precinct gatehouse light. Same collect-by-name
   * contract as `statueGleamMaterials`.
   */
  lighthouseWindowMaterials?: readonly MeshStandardMaterial[];
  shipLanternGlowMaterial: MeshBasicMaterial;
  shipLanternMaterial: MeshStandardMaterial;
  shipShadows: InstancedMesh<CircleGeometry, MeshBasicMaterial>;
  ships: ReadonlyArray<{ identitySailMaterial: MeshStandardMaterial | null }>;
  // W7 statue gleam: bronze-gilt materials (procedural shell or the cloned
  // GLB set) lifted warm at dusk.
  statueGleamMaterials: readonly MeshStandardMaterial[];
}

interface DayCycleScene {
  ambientLight: AmbientLight;
  content: DayCycleContent | null;
  directionalLight: DirectionalLight;
  hemisphereLight: HemisphereLight;
}

// Keep the full analytic fill for identities/practicals. Prepared PBR surfaces
// replace a metered share locally; world-renderer stages it after DEV overrides.
export function updateDayCycle(
  scene: DayCycleScene,
  frame: ThreeWorldRendererFrame,
  phase: DayCyclePhase,
): void {
  const { daylight, dusk, night } = phase;
  const beats = dayCycleBeats(frame.wallClockHour);
  scene.hemisphereLight.color.setRGB(0, 0, 0);
  scene.hemisphereLight.groundColor.setRGB(0, 0, 0);
  scene.ambientLight.color.setRGB(0, 0, 0);
  scene.directionalLight.color.setRGB(0, 0, 0);
  scene.hemisphereLight.intensity = 0;
  scene.ambientLight.intensity = 0;
  scene.directionalLight.intensity = 0;
  // No permanent night key: moon down or new means no directional lunar rim.
  const moonKey = beats.night > 0
    ? (gardenMoonPose(frame.wallClockHour, scratchMoonPose).moonLight ?? 0)
    : 1;
  for (const name of LIGHT_BEAT_NAMES) {
    const weight = beats[name];
    if (weight === 0) continue;
    const rig = DAY_CYCLE_LIGHT_PRESETS[name];
    scene.hemisphereLight.color.r += rig.hemiSky.r * weight;
    scene.hemisphereLight.color.g += rig.hemiSky.g * weight;
    scene.hemisphereLight.color.b += rig.hemiSky.b * weight;
    scene.hemisphereLight.groundColor.r += rig.hemiGround.r * weight;
    scene.hemisphereLight.groundColor.g += rig.hemiGround.g * weight;
    scene.hemisphereLight.groundColor.b += rig.hemiGround.b * weight;
    scene.ambientLight.color.r += rig.ambient.r * weight;
    scene.ambientLight.color.g += rig.ambient.g * weight;
    scene.ambientLight.color.b += rig.ambient.b * weight;
    scene.directionalLight.color.r += rig.dirColor.r * weight;
    scene.directionalLight.color.g += rig.dirColor.g * weight;
    scene.directionalLight.color.b += rig.dirColor.b * weight;
    scene.hemisphereLight.intensity += rig.hemiIntensity * weight;
    scene.ambientLight.intensity += rig.ambientIntensity * weight;
    scene.directionalLight.intensity += rig.dirIntensity * weight * (name === "night" ? moonKey : 1);
  }
  // X9 (light-6): inside the day beat the morning key is a touch cooler with
  // less shapeless fill (crisper shade), the afternoon key warmer with more.
  const drift = gardenDayDrift(frame.wallClockHour) * beats.day;
  if (drift !== 0) {
    const tint = drift < 0 ? DAY_KEY_MORNING_TINT : DAY_KEY_AFTERNOON_TINT;
    const amount = drift < 0 ? -drift * DAY_CYCLE_DAY_DRIFT.keyCool : drift * DAY_CYCLE_DAY_DRIFT.keyWarm;
    const key = scene.directionalLight.color;
    key.r *= 1 + (tint.r - 1) * amount;
    key.g *= 1 + (tint.g - 1) * amount;
    key.b *= 1 + (tint.b - 1) * amount;
    const fill = 1 + DAY_CYCLE_DAY_DRIFT.fill * drift;
    scene.hemisphereLight.intensity *= fill;
    scene.ambientLight.intensity *= fill;
  }

  if (!scene.content) return;
  // The beacon signal is unchanged (D5): the same PSI-modulated intensity
  // number the retired glow sphere carried now drives the living fire — flame
  // brightness (via uIntensity), flicker amplitude (world-renderer), halo,
  // and light. No post pass is required for data legibility: the flame's
  // overall brightness tracks this number exactly.
  // K20: once the keeper (or the sun's default clock) has caught the
  // lantern, the brazier takes most of its night strength before the night
  // beat arrives; additive only, so the catch never dims it.
  const { progress: kindleProgress, window: kindleWindow } = gardenLanternKindleState();
  const lampNight = Math.max(
    night,
    BEACON_CATCH_NIGHT * gardenLanternKindleFactor(GARDEN_KINDLE_ORDER.lantern, kindleProgress, kindleWindow),
  );
  const beaconIntensity = MathUtils.clamp(
    3.4 + lampNight * 3.8 + frame.seaState.source.psiStress * 0.6,
    0,
    8,
  );
  // Preserve the PSI signal while keeping the night brazier above every
  // lantern in linear HDR luminance; the daytime coals remain banked.
  scene.content.beacon.material.emissiveIntensity = beaconIntensity
    * (0.32 * (1 - lampNight) + BEACON_NIGHT_GAIN * lampNight);
  // D3: by day the flame banks low (the mirror glint is the day signal); at
  // dusk it rises; by night it owns the sky.
  scene.content.beaconFire.uniforms.uIntensity.value = beaconIntensity
    * Math.max(blendDayCycleScalar(1, 0.85, 0.26, dusk, daylight), 0.26 + 0.74 * lampNight);
  // D4 mirror glint: a slow day-only emissive pulse (peak HDR ~2.2) so the
  // legendary bronze mirror flashes against the day sky. Deterministic in
  // timeSeconds; frozen at its t=0 glint under reduced motion. This is the
  // ONE practical that emits in full daylight (Hour-Print §1.1 rule 2).
  const glintTime = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
  const glint = Math.pow(0.5 + 0.5 * Math.sin(glintTime * 0.55 + 1.1), 6);
  scene.content.beaconFire.mirrorMaterial.emissiveIntensity = daylight * (0.3 + glint * 1.9);
  // W0.7 night beacon discipline: the halo stays a tight corona (night scale
  // ≤ 1.25, opacity ≤ 0.3) so an end-on beam never swells into a disc; the
  // frame path adds the flicker modulation on top of this base. W2.9: nothing
  // glows by day, so the corona has no daylight term.
  scene.content.beaconHalo.material.opacity = dusk * 0.12 + lampNight * 0.3;
  scene.content.beaconHalo.scale.setScalar(1.2 + (dusk + lampNight) * 0.05);
  // The PointLight grazes the lantern storey only (range 30, see
  // createLighthouse); it no longer floodlights the masonry at night.
  scene.content.lighthouseLight.intensity = 0.95 + dusk * 1.2 + lampNight * 2.4;
  // Statue gleam: bronze never glows by day or by night. Only the dusk beat
  // lends it a faint warm catch (≤ 0.4 at the blue-hour peak); form comes
  // from the rim light and specular, not self-light.
  const statueGleam = dusk * 0.3;
  for (const material of scene.content.statueGleamMaterials) {
    material.emissiveIntensity = statueGleam;
  }
  // No daytime glow (Hour-Print W0.9): every lamp and window below is dark in
  // full daylight and kindles with the dusk and night beats. Lantern cores
  // clear the 2.4 linear bloom knee at night; windows remain below it.
  const harborLanternIntensity = dusk * 1.2 + night * WARM_LANTERN_NIGHT_INTENSITY;
  scene.content.harborLanternMaterial.emissiveIntensity = harborLanternIntensity;
  // Station shoji remain dim interiors, not lamp cores; each kindles in the
  // harbour's order (contract H-A) on top of this base.
  const stationWindowEmber = dusk * 1.4 + night * 1.75;
  const harborBatch = scene.content.harborBatch;
  if (harborBatch) {
    for (const meshes of [harborBatch.bucketMeshes, harborBatch.fineDetailBucketMeshes]) {
      const material = meshes.window?.material;
      if (material instanceof MeshStandardMaterial) {
        material.emissiveIntensity = stationWindowEmber;
      }
    }
  }
  // Tower and gatehouse apertures: dark openings by day (the darkest thing on
  // the stone face), kindling only once dusk is well under way (> 0.35), then
  // 1.35 at night. Deliberately below the station curve and far below the
  // beacon: the Pharos' own windows read as embers on a lit stair, never as a
  // second signal competing with the fire at its head.
  const towerWindowGlow = MathUtils.smoothstep(dusk, 0.35, 1) * 0.9 + night * 1.0;
  for (const material of scene.content.lighthouseWindowMaterials ?? []) {
    material.emissiveIntensity = towerWindowGlow;
  }
  // Island path lanterns share the warm core colour and night luminance.
  if (scene.content.islandLanternMaterial) {
    scene.content.islandLanternMaterial.emissiveIntensity = dusk * 1.15
      + night * WARM_LANTERN_NIGHT_INTENSITY;
  }
  scene.content.beam.visible = true;
  // Lane S grounded the fleet on a darker 0.28 base opacity (S7); the curve
  // stays at or above it so the day-cycle never overrides it back down.
  // R8: a touch deeper so the contact reads at overview zoom, where a hull
  // is only a few pixels tall and its shadow is most of what grounds it.
  scene.content.shipShadows.material.opacity = 0.34 + daylight * 0.14;
  // Ship lanterns use the paler glow colour, so the same luminance needs less
  // intensity than the warm harbour cores. Unlit by day, like every lamp.
  scene.content.shipLanternMaterial.emissiveIntensity = dusk * 0.85
    + night * GLOW_LANTERN_NIGHT_INTENSITY;
  // Dimmer per-lantern halo to match the smaller quad (W1.10): the fleet's
  // warmth should come from MANY small lights, not from each one flaring.
  scene.content.shipLanternGlowMaterial.opacity = dusk * 0.12 + night * 0.24;
  const sailEmissive = blendDayCycleScalar(
    GARDEN_SAIL_EMISSIVE.night,
    GARDEN_SAIL_EMISSIVE.dusk,
    GARDEN_SAIL_EMISSIVE.day,
    dusk,
    daylight,
  );
  // The batched fleet shares ONE sail material, so the night backlight is a
  // single write instead of one per ship (W1 / D2).
  if (scene.content.fleetSailMaterial) {
    scene.content.fleetSailMaterial.emissiveIntensity = sailEmissive;
  }
  for (const ship of scene.content.ships) {
    if (!ship.identitySailMaterial) continue;
    ship.identitySailMaterial.emissiveIntensity = sailEmissive;
  }
  // Beam intensity curves. One cone is the normal signal and the plane is its
  // low-tier fallback.
  // World-renderer owns which piece is visible per tier; here we set opacity
  // and freeze uTime under reduced motion.
  const beamTime = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
  // Daylight suppresses the light-in-air pieces; the lit sea lane fades with
  // the lighthouse light instead.
  const coneOpacity = (dusk * 0.035 + night * 0.11) * (1 - daylight * 0.9);
  const planeOpacity = (0.008 + dusk * 0.025 + night * 0.06) * (1 - daylight * 0.9);
  for (const child of scene.content.beam.children) {
    if (!(child instanceof Mesh)) continue;
    const material = child.material;
    if (!(material instanceof ShaderMaterial)) continue;
    if (material.uniforms.uTime) material.uniforms.uTime.value = beamTime;
    if (child.name === "lighthouse-beam-cone") {
      material.uniforms.uOpacity.value = coneOpacity;
    } else {
      material.uniforms.uOpacity.value = planeOpacity;
    }
  }
}
