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
  Points,
  ShaderMaterial,
  SphereGeometry,
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
export type DayCycleBeatName = "dawn" | "day" | "golden" | "blue" | "night";
export type DayCycleBeats = Record<DayCycleBeatName, number>;
const LIGHT_BEAT_NAMES: readonly DayCycleBeatName[] = ["dawn", "day", "golden", "blue", "night"];

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
export const DAY_CYCLE_LIGHT_PRESETS: Record<DayCycleBeatName, DayCycleLightPreset> = {
  dawn: {
    ambient: paletteColor(P.foam_white),
    ambientIntensity: 0.14,
    dirColor: paletteColor(P.sun_day_warm),
    dirIntensity: 1.2,
    hemiGround: paletteColor(P.timber_mid),
    hemiIntensity: 0.26,
    hemiSky: paletteColor(P.fog_blue),
  },
  day: {
    ambient: paletteColor(P.foam_white),
    ambientIntensity: 0.2,
    dirColor: new Color(1, 1, 1),
    dirIntensity: 3.3,
    hemiGround: paletteColor(P.timber_mid).lerp(paletteColor(P.foam_white), 0.65),
    hemiIntensity: 0.42,
    hemiSky: paletteColor(P.foam_white),
  },
  golden: {
    ambient: paletteColor(P.sky_horizon),
    ambientIntensity: 0.16,
    dirColor: paletteColor(P.lantern_warm).lerp(paletteColor(P.vermillion), 0.06),
    dirIntensity: 3.84,
    hemiGround: paletteColor(P.timber_mid),
    hemiIntensity: 0.32,
    hemiSky: paletteColor(P.sky_horizon).lerp(paletteColor(P.fog_blue), 0.3),
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
    ambient: paletteColor(P.sky_night).lerp(paletteColor(P.fog_blue), 0.3),
    ambientIntensity: 0.06,
    dirColor: paletteColor(P.moonlight),
    dirIntensity: 0.64,
    hemiGround: paletteColor(P.deep_sea_2).lerp(paletteColor(P.timber_dark), 0.46),
    hemiIntensity: 0.1,
    hemiSky: paletteColor(P.sky_night).lerp(paletteColor(P.fog_blue), 0.25),
  },
};

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

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Adjacent smooth crossfades, with a held golden peak until the blue-hour
 * handoff at 18:15. Midnight is inside the night plateau, not a seam.
 */
export function dayCycleBeats(hourInput: number): DayCycleBeats {
  const hour = ((hourInput % 24) + 24) % 24;
  const beats: DayCycleBeats = { dawn: 0, day: 0, golden: 0, blue: 0, night: 0 };
  if (hour < 4.75 || hour >= 20) {
    beats.night = 1;
  } else if (hour < 6) {
    beats.dawn = smoothstep(4.75, 6, hour);
    beats.night = 1 - beats.dawn;
  } else if (hour < 7.25) {
    beats.day = smoothstep(6, 7.25, hour);
    beats.dawn = 1 - beats.day;
  } else if (hour < 16.25) {
    beats.day = 1;
  } else if (hour < 17.25) {
    beats.golden = smoothstep(16.25, 17.25, hour);
    beats.day = 1 - beats.golden;
  } else if (hour < 18.25) {
    beats.golden = 1;
  } else if (hour < 19) {
    beats.blue = smoothstep(18.25, 19, hour);
    beats.golden = 1 - beats.blue;
  } else {
    beats.night = smoothstep(19, 20, hour);
    beats.blue = 1 - beats.night;
  }
  return beats;
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
    smokeMaterial: ShaderMaterial;
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
   * mesh per detail level, holding every warm window and lit quay edge.
   *
   * Typed structurally rather than as `GardenHarborBatch`: garden-harbor-batch
   * imports garden-height-fog, which imports THIS module, so a runtime import
   * would close a cycle. Optional so the field can be absent without breaking
   * the build.
   */
  harborBatch?: {
    bucketMeshes: { window: Mesh | null };
    fineDetailBucketMeshes: { window: Mesh | null };
    propMeshes: { lampHead: Mesh | null };
    fineDetailPropMeshes: { lampHead: Mesh | null };
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
    scene.directionalLight.intensity += rig.dirIntensity * weight;
  }

  if (!scene.content) return;
  // The beacon signal is unchanged (D5): the same PSI-modulated intensity
  // number the retired glow sphere carried now drives the living fire — flame
  // brightness (via uIntensity), flicker amplitude (world-renderer), halo,
  // and light. No post pass is required for data legibility: the flame's
  // overall brightness tracks this number exactly.
  const beaconIntensity = MathUtils.clamp(
    3.4 + night * 3.8 + frame.seaState.source.psiStress * 0.6,
    0,
    8,
  );
  // Preserve the PSI signal while keeping the night brazier above every
  // lantern in linear HDR luminance; the daytime coals remain banked.
  scene.content.beacon.material.emissiveIntensity = beaconIntensity
    * (0.32 * (1 - night) + BEACON_NIGHT_GAIN * night);
  // D3: by day the flame banks low (the smoke column is the day signal);
  // at dusk it rises; by night it owns the sky.
  scene.content.beaconFire.uniforms.uIntensity.value = beaconIntensity
    * blendDayCycleScalar(1, 0.85, 0.26, dusk, daylight);
  // D3 smoke daymark: a proud grey-blue column by day, thinning through dusk
  // and gone by night — against the G2 near-black sky a "backlit wisp" reads
  // as a grey blob beside the lantern, the one place nothing may compete.
  const smokeUniforms = scene.content.beaconFire.smokeMaterial.uniforms;
  smokeUniforms.uDayMix.value = daylight;
  smokeUniforms.uOpacity.value = blendDayCycleScalar(0, 0.16, 0.62, dusk, daylight);
  // D4 mirror glint: a slow day-only emissive pulse (peak HDR ~2.2) so the
  // legendary bronze mirror flashes against the day sky. Deterministic in
  // timeSeconds; frozen at its t=0 glint under reduced motion.
  const glintTime = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
  const glint = Math.pow(0.5 + 0.5 * Math.sin(glintTime * 0.55 + 1.1), 6);
  scene.content.beaconFire.mirrorMaterial.emissiveIntensity = daylight * (0.3 + glint * 1.9);
  // The halo keeps its day-cycle shape (enlarged with the living fire — W4);
  // the frame path adds the flicker modulation on top of this base.
  scene.content.beaconHalo.material.opacity = 0.16 + dusk * 0.1 + night * 0.3;
  scene.content.beaconHalo.scale.setScalar(1.2 + dusk * 0.18 + night * 0.6);
  scene.content.lighthouseLight.intensity = 0.95 + dusk * 2.3 + night * 8.2;
  // W7 statue gleam: a warm base lift keeps the gilt god readable against the
  // day sky; at dusk it peaks just over the bloom knee, then settles to a
  // faint glow at night.
  const statueGleam = 0.22 + dusk * 0.94 + night * 0.12;
  for (const material of scene.content.statueGleamMaterials) {
    material.emissiveIntensity = statueGleam;
  }
  // Lantern cores clear the 2.4 linear bloom knee; windows remain below it.
  const harborLanternIntensity = 0.18 * (1 - night) + dusk * 1.2
    + night * WARM_LANTERN_NIGHT_INTENSITY;
  scene.content.harborLanternMaterial.emissiveIntensity = harborLanternIntensity;
  // Station windows and lit quay edges remain dim interiors, not lamp cores.
  const stationWindowEmber = 0.35 + dusk * 1.4 + night * 1.75;
  const harborBatch = scene.content.harborBatch;
  if (harborBatch) {
    for (const meshes of [harborBatch.bucketMeshes, harborBatch.fineDetailBucketMeshes]) {
      const material = meshes.window?.material;
      if (material instanceof MeshStandardMaterial) {
        material.emissiveIntensity = stationWindowEmber;
      }
    }
    for (const meshes of [harborBatch.propMeshes, harborBatch.fineDetailPropMeshes]) {
      const material = meshes.lampHead?.material;
      if (material instanceof MeshStandardMaterial) {
        material.emissiveIntensity = harborLanternIntensity;
      }
    }
  }
  // Tower and gatehouse apertures: constant 0.24 -> 0.18 day / 1.08 dusk /
  // 1.53 night. Deliberately below the station curve and far below the
  // beacon: the Pharos' own windows read as a lit stair, never as a second
  // signal competing with the fire at its head.
  const towerWindowGlow = 0.18 + dusk * 0.9 + night * 1.35;
  for (const material of scene.content.lighthouseWindowMaterials ?? []) {
    material.emissiveIntensity = towerWindowGlow;
  }
  // Island path lanterns share the warm core colour and night luminance;
  // their slightly higher day base keeps the fixtures visible on pale gravel.
  if (scene.content.islandLanternMaterial) {
    scene.content.islandLanternMaterial.emissiveIntensity = 0.22 * (1 - night) + dusk * 1.15
      + night * WARM_LANTERN_NIGHT_INTENSITY;
  }
  scene.content.beam.visible = true;
  // Lane S grounded the fleet on a darker 0.28 base opacity (S7); the curve
  // stays at or above it so the day-cycle never overrides it back down.
  // R8: a touch deeper so the contact reads at overview zoom, where a hull
  // is only a few pixels tall and its shadow is most of what grounds it.
  scene.content.shipShadows.material.opacity = 0.34 + daylight * 0.14;
  // Ship lanterns use the paler glow colour, so the same luminance needs less
  // intensity than the warm harbour cores.
  scene.content.shipLanternMaterial.emissiveIntensity = 0.05 * (1 - night) + dusk * 0.85
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
  // Beam intensity curves. One cone is the normal signal, the plane is its
  // low-tier fallback, and dust is only a restrained full-tier accent.
  // World-renderer owns which piece is visible per tier; here we set opacity
  // and freeze uTime under reduced motion.
  const beamTime = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
  // Daylight suppresses the light-in-air pieces; the lit sea lane fades with
  // the lighthouse light instead.
  const coneOpacity = (dusk * 0.035 + night * 0.11) * (1 - daylight * 0.9);
  const dustOpacity = (dusk * 0.09 + night * 0.24) * (1 - daylight);
  const planeOpacity = (0.008 + dusk * 0.025 + night * 0.06) * (1 - daylight * 0.9);
  for (const child of scene.content.beam.children) {
    if (!(child instanceof Mesh) && !(child instanceof Points)) continue;
    const material = child.material;
    if (!(material instanceof ShaderMaterial)) continue;
    if (material.uniforms.uTime) material.uniforms.uTime.value = beamTime;
    if (child.name === "lighthouse-beam-cone") {
      material.uniforms.uOpacity.value = coneOpacity;
    } else if (child.name === "lighthouse-beam-dust") {
      material.uniforms.uOpacity.value = dustOpacity;
    } else {
      material.uniforms.uOpacity.value = planeOpacity;
    }
  }
}
