import {
  AmbientLight,
  BufferGeometry,
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

// --- C1: day-cycle contract (frozen in P0) ----------------------------------
// Every time-of-day color in the scene derives from HARBOR_PALETTE via the
// preset objects below; no module declares its own hex literals. Blend
// factors come from `dayCyclePhase` — modules that need day/dusk/night
// weights (Lane W's water shader included) must import it from here rather
// than keeping a local copy of the curve.
export type DayCyclePhaseName = "day" | "dusk" | "night";

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

// Sky presets (consumed by garden-sky). Night keeps the Lantern Sea identity;
// dusk is the ember horizon (G4 — a real, distinct state again); day is the
// ukiyo-e bokashi gradient: deep indigo-teal zenith, pale warm horizon, fog
// matched to the horizon band (G5, decision D-R1).
export const DAY_CYCLE_SKY_PRESETS: Record<DayCyclePhaseName, DayCycleSkyPreset> = {
  day: {
    fog: paletteColor(P.fog_day),
    horizon: paletteColor(P.sky_day_horizon),
    zenith: paletteColor(P.sky_day_zenith),
  },
  dusk: {
    fog: paletteColor(P.sky_horizon).lerp(paletteColor(P.lantern_warm), 0.36),
    horizon: paletteColor(P.sky_horizon).lerp(paletteColor(P.lantern_warm), 0.5),
    zenith: paletteColor(P.sky_horizon),
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

// Night rig is deliberately dim so warm emissives (beacon, lanterns) carry the
// scene; the day rig is the ukiyo-e morning: a warm cream key sun against a
// cool indigo-teal sky fill (warm highlights / cool-teal shadows).
export const DAY_CYCLE_LIGHT_PRESETS: Record<DayCyclePhaseName, DayCycleLightPreset> = {
  day: {
    ambient: paletteColor(P.sky_day_horizon),
    ambientIntensity: 0.38,
    dirColor: paletteColor(P.sun_day_warm),
    dirIntensity: 1.7,
    hemiGround: paletteColor(P.shallow_teal_lit),
    hemiIntensity: 1.05,
    hemiSky: paletteColor(P.sky_day_zenith),
  },
  dusk: {
    ambient: paletteColor(P.lantern_warm).lerp(paletteColor(P.moonlight), 0.4),
    ambientIntensity: 0.26,
    dirColor: paletteColor(P.lantern_warm),
    dirIntensity: 1.1,
    hemiGround: paletteColor(P.ember),
    hemiIntensity: 0.56,
    hemiSky: paletteColor(P.sky_horizon),
  },
  night: {
    ambient: paletteColor(P.moonlight),
    ambientIntensity: 0.2,
    dirColor: paletteColor(P.moonlight),
    dirIntensity: 0.95,
    hemiGround: paletteColor(P.deep_sea_2),
    hemiIntensity: 0.44,
    hemiSky: paletteColor(P.fog_blue),
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

export function dayCyclePhase(hourInput: number): DayCyclePhase {
  const hour = ((hourInput % 24) + 24) % 24;
  // G4: daylight holds through the afternoon and sets 16:30–19:00, so the
  // 17:00–20:00 window is a genuine ember-horizon dusk instead of collapsing
  // straight to night (the old sine curve was already 0 by 18:30).
  const daylight = smoothstep(5.5, 8, hour) * (1 - smoothstep(16.5, 19, hour));
  const dawnGlow = smoothstep(4, 5.25, hour) * (1 - smoothstep(6.75, 8.25, hour));
  const eveningGlow = smoothstep(15.75, 17.5, hour) * (1 - smoothstep(19, 21.25, hour));
  const dusk = Math.max(dawnGlow, eveningGlow);
  // Night yields to dusk instead of coexisting with it, so dusk-keyed systems
  // (ember horizon, just-lit lanterns) own the evening frame.
  const night = MathUtils.clamp(1 - daylight - dusk, 0, 1);
  return { daylight, dusk, night };
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

function blendScalar(night: number, dusk: number, day: number, duskMix: number, daylightMix: number): number {
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
  lighthouseLight: PointLight;
  rayFan: Mesh<BufferGeometry, ShaderMaterial> | null;
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
  const nightRig = DAY_CYCLE_LIGHT_PRESETS.night;
  const duskRig = DAY_CYCLE_LIGHT_PRESETS.dusk;
  const dayRig = DAY_CYCLE_LIGHT_PRESETS.day;

  blendDayCycleColor(scene.hemisphereLight.color, nightRig.hemiSky, duskRig.hemiSky, dayRig.hemiSky, dusk, daylight);
  blendDayCycleColor(scene.hemisphereLight.groundColor, nightRig.hemiGround, duskRig.hemiGround, dayRig.hemiGround, dusk, daylight);
  scene.hemisphereLight.intensity = blendScalar(nightRig.hemiIntensity, duskRig.hemiIntensity, dayRig.hemiIntensity, dusk, daylight);

  blendDayCycleColor(scene.ambientLight.color, nightRig.ambient, duskRig.ambient, dayRig.ambient, dusk, daylight);
  scene.ambientLight.intensity = blendScalar(nightRig.ambientIntensity, duskRig.ambientIntensity, dayRig.ambientIntensity, dusk, daylight);

  blendDayCycleColor(scene.directionalLight.color, nightRig.dirColor, duskRig.dirColor, dayRig.dirColor, dusk, daylight);
  scene.directionalLight.intensity = blendScalar(nightRig.dirIntensity, duskRig.dirIntensity, dayRig.dirIntensity, dusk, daylight);

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
  // The retired sphere lives on as the brazier's ember-glow core inside the
  // flame — same signal, banked to coals.
  scene.content.beacon.material.emissiveIntensity = beaconIntensity * 0.32;
  // D3: by day the flame banks low (the smoke column is the day signal);
  // at dusk it rises; by night it owns the sky.
  scene.content.beaconFire.uniforms.uIntensity.value = beaconIntensity
    * blendScalar(1, 0.85, 0.26, dusk, daylight);
  // D3 smoke daymark: a proud grey-blue column by day, thinning through dusk
  // to a thin backlit wisp at night.
  const smokeUniforms = scene.content.beaconFire.smokeMaterial.uniforms;
  smokeUniforms.uDayMix.value = daylight;
  smokeUniforms.uOpacity.value = blendScalar(0.1, 0.22, 0.62, dusk, daylight);
  // D4 mirror glint: a slow day-only emissive pulse (peak HDR ~2.2) so the
  // legendary bronze mirror flashes against the day sky. Deterministic in
  // timeSeconds; frozen at its t=0 glint under reduced motion.
  const glintTime = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
  const glint = Math.pow(0.5 + 0.5 * Math.sin(glintTime * 0.55 + 1.1), 6);
  scene.content.beaconFire.mirrorMaterial.emissiveIntensity = daylight * (0.3 + glint * 1.9);
  // The halo keeps its day-cycle shape (enlarged with the living fire — W4);
  // the frame path adds the flicker modulation on top of this base.
  scene.content.beaconHalo.material.opacity = 0.22 + dusk * 0.14 + night * 0.5;
  scene.content.beaconHalo.scale.setScalar(1.35 + dusk * 0.3 + night * 1.0);
  scene.content.lighthouseLight.intensity = 0.95 + dusk * 2.3 + night * 8.2;
  // W7 statue gleam: a warm base lift keeps the gilt god readable against the
  // day sky; at dusk it peaks just over the bloom knee, then settles to a
  // faint glow at night.
  const statueGleam = 0.22 + dusk * 0.94 + night * 0.12;
  for (const material of scene.content.statueGleamMaterials) {
    material.emissiveIntensity = statueGleam;
  }
  // Cap warm emissives below the clip point so AgX keeps them golden instead
  // of rolling them off to white pinpricks.
  scene.content.harborLanternMaterial.emissiveIntensity = 0.18 + dusk * 1.2 + night * 1.9;
  scene.content.beam.visible = true;
  // Lane S grounded the fleet on a darker 0.28 base opacity (S7); the curve
  // stays at or above it so the day-cycle never overrides it back down.
  scene.content.shipShadows.material.opacity = 0.28 + daylight * 0.12;
  // Ship lantern cores bloom warm at night; the additive glow halo and the
  // sail backlight rise with them. Kept below the AgX clip (~2.2) so they roll
  // to gold, not white pinpricks.
  scene.content.shipLanternMaterial.emissiveIntensity = 0.05 + dusk * 0.85 + night * 1.9;
  scene.content.shipLanternGlowMaterial.opacity = dusk * 0.28 + night * 0.68;
  const sailEmissive = 0.16 + dusk * 0.14 + night * 0.62;
  // The batched fleet shares ONE sail material, so the night backlight is a
  // single write instead of one per ship (W1 / D2).
  if (scene.content.fleetSailMaterial) {
    scene.content.fleetSailMaterial.emissiveIntensity = sailEmissive;
  }
  for (const ship of scene.content.ships) {
    if (!ship.identitySailMaterial) continue;
    ship.identitySailMaterial.emissiveIntensity = sailEmissive;
  }
  // Beam intensity curves. World-renderer owns which piece is visible per tier;
  // here we set opacity and freeze uTime under reduced motion.
  const beamTime = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
  // Daylight suppresses the light-in-air pieces; the lit sea lane fades with
  // the lighthouse light instead.
  const coneOpacity = (dusk * 0.07 + night * 0.24) * (1 - daylight * 0.9);
  const dustOpacity = (dusk * 0.2 + night * 0.55) * (1 - daylight);
  const planeOpacity = (0.012 + dusk * 0.036 + night * 0.11) * (1 - daylight * 0.9);
  // W5: the nested outer cone is the beam's faint fresnel skirt.
  const outerConeOpacity = (dusk * 0.03 + night * 0.1) * (1 - daylight * 0.9);
  for (const child of scene.content.beam.children) {
    if (!(child instanceof Mesh) && !(child instanceof Points)) continue;
    const material = child.material;
    if (!(material instanceof ShaderMaterial)) continue;
    if (material.uniforms.uTime) material.uniforms.uTime.value = beamTime;
    if (child.name === "lighthouse-beam-cone") {
      material.uniforms.uOpacity.value = coneOpacity;
    } else if (child.name === "lighthouse-beam-outer-cone") {
      material.uniforms.uOpacity.value = outerConeOpacity;
    } else if (child.name === "lighthouse-beam-dust") {
      material.uniforms.uOpacity.value = dustOpacity;
    } else {
      material.uniforms.uOpacity.value = planeOpacity;
    }
  }
  // W5 ray fan: the poster sunburst owns dusk and night (D3) — daylight
  // suppresses it alongside the other light-in-air pieces.
  if (scene.content.rayFan) {
    scene.content.rayFan.material.uniforms.uOpacity.value = (dusk * 0.15 + night * 0.28)
      * (1 - daylight);
  }
}
