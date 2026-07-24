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
} from "three";
import type { ThreeWorldRendererFrame } from "../renderer/world-renderer-backend";
import { HARBOR_PALETTE } from "../systems/palette";

const P = HARBOR_PALETTE;
const paletteColor = (hex: string): Color => new Color(hex);

// Pearl overcast light for day — desaturated, never the old saturated teal
// noon (Decision D1). Warm pale key stands in for a low overcast sun.
const PEARL = paletteColor(P.fog_pale).lerp(paletteColor(P.foam_white), 0.6);
const PEARL_SUN = paletteColor(P.lantern_glow).lerp(paletteColor(P.foam_white), 0.55);

// --- Sky presets (consumed by garden-sky) -----------------------------------
export const SKY_ZENITH_NIGHT = paletteColor(P.sky_night);
export const SKY_ZENITH_DUSK = paletteColor(P.sky_horizon);
export const SKY_ZENITH_DAY = paletteColor(P.fog_blue).lerp(PEARL, 0.72);
export const SKY_HORIZON_NIGHT = paletteColor(P.sky_horizon);
export const SKY_HORIZON_DUSK = paletteColor(P.sky_horizon).lerp(paletteColor(P.lantern_warm), 0.42);
export const SKY_HORIZON_DAY = PEARL.clone();
export const FOG_NIGHT = paletteColor(P.sky_horizon);
export const FOG_DUSK = paletteColor(P.sky_horizon).lerp(paletteColor(P.lantern_warm), 0.28);
export const FOG_DAY = PEARL.clone();
export const MOON_COLOR = paletteColor(P.moonlight);
export const STAR_COLOR = paletteColor(P.moonlight).lerp(paletteColor(P.foam_white), 0.4);

interface LightPreset {
  ambient: Color;
  ambientIntensity: number;
  dirColor: Color;
  dirIntensity: number;
  hemiGround: Color;
  hemiIntensity: number;
  hemiSky: Color;
}

// Night rig is deliberately dim so warm emissives (beacon, lanterns) carry the
// scene; day rig is a bright, desaturated overcast.
const NIGHT_RIG: LightPreset = {
  ambient: paletteColor(P.moonlight),
  ambientIntensity: 0.2,
  dirColor: paletteColor(P.moonlight),
  dirIntensity: 0.95,
  hemiGround: paletteColor(P.deep_sea_2),
  hemiIntensity: 0.44,
  hemiSky: paletteColor(P.fog_blue),
};
const DUSK_RIG: LightPreset = {
  ambient: paletteColor(P.lantern_warm).lerp(paletteColor(P.moonlight), 0.4),
  ambientIntensity: 0.26,
  dirColor: paletteColor(P.lantern_warm),
  dirIntensity: 1.1,
  hemiGround: paletteColor(P.ember),
  hemiIntensity: 0.56,
  hemiSky: paletteColor(P.sky_horizon),
};
const DAY_RIG: LightPreset = {
  ambient: PEARL.clone(),
  ambientIntensity: 0.5,
  dirColor: PEARL_SUN.clone(),
  dirIntensity: 1.65,
  hemiGround: paletteColor(P.fog_blue),
  hemiIntensity: 1.15,
  hemiSky: PEARL.clone(),
};

export interface DayCyclePhase {
  daylight: number;
  dusk: number;
  night: number;
}

export function dayCyclePhase(hourInput: number): DayCyclePhase {
  const hour = ((hourInput % 24) + 24) % 24;
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const dusk = Math.max(
    Math.max(0, 1 - Math.abs(hour - 6) / 2),
    Math.max(0, 1 - Math.abs(hour - 18) / 2),
  );
  const night = MathUtils.clamp(1 - daylight - dusk * 0.38, 0, 1);
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
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  harborLanternMaterial: MeshStandardMaterial;
  lighthouseLight: PointLight;
  shipShadows: InstancedMesh<CircleGeometry, MeshBasicMaterial>;
  ships: ReadonlyArray<{ identitySailMaterial: MeshStandardMaterial }>;
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

  blendDayCycleColor(scene.hemisphereLight.color, NIGHT_RIG.hemiSky, DUSK_RIG.hemiSky, DAY_RIG.hemiSky, dusk, daylight);
  blendDayCycleColor(scene.hemisphereLight.groundColor, NIGHT_RIG.hemiGround, DUSK_RIG.hemiGround, DAY_RIG.hemiGround, dusk, daylight);
  scene.hemisphereLight.intensity = blendScalar(NIGHT_RIG.hemiIntensity, DUSK_RIG.hemiIntensity, DAY_RIG.hemiIntensity, dusk, daylight);

  blendDayCycleColor(scene.ambientLight.color, NIGHT_RIG.ambient, DUSK_RIG.ambient, DAY_RIG.ambient, dusk, daylight);
  scene.ambientLight.intensity = blendScalar(NIGHT_RIG.ambientIntensity, DUSK_RIG.ambientIntensity, DAY_RIG.ambientIntensity, dusk, daylight);

  blendDayCycleColor(scene.directionalLight.color, NIGHT_RIG.dirColor, DUSK_RIG.dirColor, DAY_RIG.dirColor, dusk, daylight);
  scene.directionalLight.intensity = blendScalar(NIGHT_RIG.dirIntensity, DUSK_RIG.dirIntensity, DAY_RIG.dirIntensity, dusk, daylight);

  if (!scene.content) return;
  // Kept below the hard clip so AgX rolls the core to gold, not white; the
  // additive halo supplies the outer glow that bloom then lifts.
  const beaconIntensity = 3.4 + night * 3.2 + frame.seaState.source.psiStress * 0.6;
  scene.content.beacon.material.emissiveIntensity = beaconIntensity;
  scene.content.beaconHalo.material.opacity = 0.18 + dusk * 0.1 + night * 0.34;
  scene.content.beaconHalo.scale.setScalar(1.1 + dusk * 0.2 + night * 0.62);
  scene.content.lighthouseLight.intensity = 0.95 + dusk * 2.3 + night * 8.2;
  // Cap warm emissives below the clip point so AgX keeps them golden instead
  // of rolling them off to white pinpricks.
  scene.content.harborLanternMaterial.emissiveIntensity = 0.18 + dusk * 1.2 + night * 1.9;
  scene.content.beam.visible = true;
  scene.content.shipShadows.material.opacity = 0.1 + daylight * 0.12;
  for (const ship of scene.content.ships) {
    ship.identitySailMaterial.emissiveIntensity = 0.16 + dusk * 0.12 + night * 0.42;
  }
  for (const child of scene.content.beam.children) {
    if (!(child instanceof Mesh)) continue;
    if (child.material instanceof ShaderMaterial) {
      const opacity = child.material.uniforms.uOpacity;
      if (opacity) opacity.value = 0.012 + dusk * 0.036 + night * 0.11;
      continue;
    }
    if (!(child.material instanceof MeshBasicMaterial)) continue;
    child.material.opacity = child.name === "lighthouse-beam-inner"
      ? 0.0018 + dusk * 0.011 + night * 0.05
      : 0.001 + dusk * 0.006 + night * 0.028;
  }
}
