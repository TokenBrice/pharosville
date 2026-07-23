import {
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from "three";
import type { ThreeWorldRendererFrame } from "../renderer/world-renderer-backend";

export const DAY_SKY = new Color("#467c83");
export const DUSK_SKY = new Color("#294e59");
export const NIGHT_SKY = new Color("#142b38");
const scratchColor = new Color();

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
  root: Scene;
}

export function updateDayCycle(scene: DayCycleScene, frame: ThreeWorldRendererFrame): void {
  const hour = ((frame.wallClockHour % 24) + 24) % 24;
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const dusk = Math.max(
    Math.max(0, 1 - Math.abs(hour - 6) / 2),
    Math.max(0, 1 - Math.abs(hour - 18) / 2),
  );
  const night = MathUtils.clamp(1 - daylight - dusk * 0.38, 0, 1);

  const sky = scratchColor.copy(NIGHT_SKY).lerp(DUSK_SKY, dusk).lerp(DAY_SKY, daylight);
  scene.root.background = sky.clone();
  if (scene.root.fog instanceof Fog) scene.root.fog.color.copy(sky);

  scene.hemisphereLight.intensity = 0.82 + daylight * 0.58 + dusk * 0.18;
  scene.ambientLight.intensity = 0.34 + daylight * 0.26 + dusk * 0.12;
  scene.directionalLight.intensity = 0.92 + daylight * 1.58 + dusk * 0.52;
  scene.directionalLight.color.set(daylight > 0.2 ? "#ffe8b5" : dusk > 0.25 ? "#e6baa0" : "#abc4cf");

  if (!scene.content) return;
  const beaconIntensity = 4.2 + night * 5.8 + frame.seaState.source.psiStress * 0.5;
  scene.content.beacon.material.emissiveIntensity = beaconIntensity;
  scene.content.beaconHalo.material.opacity = 0.22 + dusk * 0.1 + night * 0.2;
  scene.content.beaconHalo.scale.setScalar(1.08 + dusk * 0.16 + night * 0.34);
  scene.content.lighthouseLight.intensity = 0.95 + dusk * 2.3 + night * 8.2;
  scene.content.harborLanternMaterial.emissiveIntensity = 0.18
    + dusk * 1.35
    + night * 3.4;
  scene.content.beam.visible = true;
  scene.content.shipShadows.material.opacity = 0.12 + daylight * 0.1;
  for (const ship of scene.content.ships) {
    ship.identitySailMaterial.emissiveIntensity = 0.18
      + dusk * 0.1
      + night * 0.3;
  }
  for (const child of scene.content.beam.children) {
    if (!(child instanceof Mesh)) continue;
    if (child.material instanceof ShaderMaterial) {
      const opacity = child.material.uniforms.uOpacity;
      if (opacity) opacity.value = 0.012 + dusk * 0.034 + night * 0.084;
      continue;
    }
    if (!(child.material instanceof MeshBasicMaterial)) continue;
    child.material.opacity = child.name === "lighthouse-beam-inner"
      ? 0.002 + dusk * 0.013 + night * 0.067
      : 0.001 + dusk * 0.007 + night * 0.036;
  }
}
