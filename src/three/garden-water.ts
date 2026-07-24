import {
  Color,
  DataTexture,
  MathUtils,
  Mesh,
  PlaneGeometry,
  RepeatWrapping,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector2,
  Vector4,
} from "three";
import type { PharosVilleRenderSchedulerState } from "../renderer/render-types";
import { HARBOR_PALETTE } from "../systems/palette";
import type { SeaState } from "../systems/sea-state";
import { GARDEN_MOON_AZIMUTH } from "./garden-sky";
import { MAX_GARDEN_LIGHT_LANES } from "./garden-lanterns";

const WATER_SIZE = 900;
const WATER_SEGMENTS = 96;
export const GARDEN_WATER_MAX_DISPLACEMENT = 0.036;
export const MAX_GARDEN_WATER_ZONES = 6;

const NORMAL_MAP_URL = "/pharosville/textures/water-normals.png";

// Moon-road azimuth carried over from the sky so the sea's glitter band lands
// under the same moon the dome draws. The water plane's -90deg X rotation maps
// world +Z to local -Y, so the horizontal moon direction negates its Z.
const MOON_DIR = new Vector2(
  Math.cos(GARDEN_MOON_AZIMUTH),
  -Math.sin(GARDEN_MOON_AZIMUTH),
).normalize();

// Palette-derived sea. The hue family is HARBOR_PALETTE's deep indigo (Art
// Direction: the Lantern Sea). Night is the hero: nearly ink, lifted off pure
// black by the grade pass so the navy survives.
const pc = (key: keyof typeof HARBOR_PALETTE): Color => new Color(HARBOR_PALETTE[key]);
const DAY_BASE = pc("shallow_teal_lit").lerp(pc("fog_pale"), 0.42).lerp(pc("foam_white"), 0.12);
const DUSK_BASE = pc("deep_sea_1").lerp(pc("ember"), 0.26);
const NIGHT_BASE = pc("deep_sea_1");
const DAY_DEEP = pc("deep_sea_1").lerp(pc("shallow_teal"), 0.55);
const DUSK_DEEP = pc("deep_sea_2").lerp(pc("deep_sea_1"), 0.5);
const NIGHT_DEEP = pc("deep_sea_2");
const DAY_SHALLOW = pc("shallow_teal_lit").lerp(pc("moonlight"), 0.42);
const DUSK_SHALLOW = pc("shallow_teal").lerp(pc("lantern_warm"), 0.14);
const NIGHT_SHALLOW = pc("shallow_teal");
const DAY_HIGHLIGHT = new Color(HARBOR_PALETTE.foam_white);
const DUSK_HIGHLIGHT = DAY_HIGHLIGHT.clone().lerp(
  new Color(HARBOR_PALETTE.lantern_warm),
  0.22,
);
const NIGHT_HIGHLIGHT = new Color(HARBOR_PALETTE.moonlight);
const BEACON_HIGHLIGHT = new Color(HARBOR_PALETTE.lantern_glow);
const MOON_ROAD_COLOR = new Color(HARBOR_PALETTE.moonlight);

const VERTEX_SHADER = /* glsl */ `
  uniform float uDetail;
  uniform float uTempo;
  uniform float uTime;
  uniform float uWaveAmplitude;

  varying vec2 vWaterPosition;
  varying vec3 vWorldPosition;

  #include <fog_pars_vertex>

  // Three broad sines carry the silhouette only; surface sparkle now comes from
  // the scrolling normal map in the fragment stage.
  float gardenWave(vec2 waterPosition, float time) {
    float speed = 0.72 + uTempo * 0.38;
    float primary = sin(
      dot(waterPosition, vec2(0.074, 0.031)) + time * 0.17 * speed
    );
    float crossing = sin(
      dot(waterPosition, vec2(-0.042, 0.083)) - time * 0.12 * speed
    );
    float longSwell = sin(
      dot(waterPosition, vec2(0.018, -0.027)) + time * 0.055 * speed
    );
    return primary * 0.5 + crossing * 0.3 + longSwell * 0.2;
  }

  void main() {
    vec2 waterPosition = position.xy;
    float wave = gardenWave(waterPosition, uTime);
    vec3 displaced = position;
    displaced.z += wave * uWaveAmplitude;

    vWaterPosition = waterPosition;
    vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform float uBeaconAngle;
  uniform vec3 uBeaconColor;
  uniform vec2 uBeaconPosition;
  uniform float uBeaconStrength;
  uniform vec2 uCemeteryCenter;
  uniform float uDaylight;
  uniform vec3 uDeepColor;
  uniform float uDetail;
  uniform float uDusk;
  uniform vec3 uHighlightColor;
  uniform vec2 uIslandCenter;
  uniform float uLaneCount;
  uniform sampler2D uLaneTexture;
  uniform vec2 uMoonDir;
  uniform vec3 uMoonRoadColor;
  uniform float uNight;
  uniform sampler2D uNormalMap;
  uniform vec2 uPigeonnierCenter;
  uniform vec3 uShallowColor;
  uniform float uSwell;
  uniform float uTempo;
  uniform float uTime;
  uniform float uWaveAmplitude;
  // Risk-zone tint: (centerX, centerZ_water, 1/radiusX, 1/radiusZ) and
  // (r, g, b, strength). Replaces the filled decal discs — the water itself
  // reads the charted region.
  uniform float uZoneCount;
  uniform vec4 uZoneEllipse[${MAX_GARDEN_WATER_ZONES}];
  uniform vec4 uZoneTint[${MAX_GARDEN_WATER_ZONES}];

  varying vec2 vWaterPosition;
  varying vec3 vWorldPosition;

  #include <fog_pars_fragment>

  const float LANE_TEXELS = ${MAX_GARDEN_LIGHT_LANES}.0;

  vec3 sampleWaterNormal(vec2 uv) {
    return texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;
  }

  vec2 rotate2(vec2 v, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }

  void main() {
    // --- B1: dual scrolling normal map -----------------------------------
    float scroll = uTime * (0.6 + uTempo * 0.9);
    vec2 flow = uMoonDir * scroll;
    vec3 nA = sampleWaterNormal(vWaterPosition * 0.055 + flow * 0.045);
    vec3 nB = sampleWaterNormal(
      rotate2(vWaterPosition, 2.3) * 0.11 - flow * 0.03 + vec2(0.37, 0.11)
    );
    // Blend the two tangent-space normals and keep z (up) dominant.
    vec3 blendedNormal = normalize(vec3(nA.xy + nB.xy, nA.z * nB.z + 0.55));
    // Smoothness-by-distance: flatten the shading normal far from camera to kill
    // the iso-zoom shimmer that a static texture would otherwise sparkle with.
    // (The moon-road glitter keeps the un-flattened normal so its confined
    // sparkles survive at distance.)
    float camDistance = distance(cameraPosition, vWorldPosition);
    float detailFalloff = (1.0 - smoothstep(70.0, 260.0, camDistance)) * uDetail;
    vec3 surfaceNormal = normalize(mix(vec3(0.0, 0.0, 1.0), blendedNormal, detailFalloff));

    // --- base depth colour ------------------------------------------------
    float broadPhase = dot(vWaterPosition, vec2(0.061, 0.028)) + uTime * 0.08;
    float longPhase = dot(vWaterPosition, vec2(0.014, -0.023)) + uTime * 0.04;
    float broadRibbon = sin(broadPhase);
    float longSwell = sin(longPhase);
    float depthMix = clamp(0.54 + broadRibbon * 0.06 + surfaceNormal.x * 0.05, 0.0, 1.0);
    vec3 waterColor = mix(uDeepColor, uBaseColor, depthMix);
    float tonalCurrent = 0.5 + 0.5 * sin(
      dot(vWaterPosition, vec2(0.046, -0.058)) + uTime * 0.027
    );
    waterColor = mix(waterColor, uDeepColor, tonalCurrent * (0.03 + uNight * 0.015));

    // --- facet light + sky fresnel ---------------------------------------
    vec3 keyDirection = normalize(vec3(-0.46, 0.2, 0.86));
    float facetLight = clamp(dot(surfaceNormal, keyDirection) * 0.5 + 0.55, 0.2, 1.0);
    waterColor *= 0.95 + facetLight * 0.1;
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(0.0, dot(surfaceNormal, viewDirection)), 3.0);
    vec3 skyReflection = mix(uBaseColor, uHighlightColor, 0.34);
    waterColor = mix(
      waterColor,
      skyReflection,
      fresnel * (0.08 + uDaylight * 0.08 + uNight * 0.04)
    );

    // --- B4: island + islet shore ----------------------------------------
    vec2 shoreDelta = vWaterPosition - uIslandCenter - vec2(0.6, -1.2);
    shoreDelta = rotate2(shoreDelta, -0.08) / vec2(18.4, 13.8);
    float shoreAngle = atan(shoreDelta.y, shoreDelta.x);
    float shoreVariation = sin(shoreAngle * 3.0 + 0.3) * 0.04
      + sin(shoreAngle * 7.0 - 0.21) * 0.022;
    float shoreDistance = length(shoreDelta) + shoreVariation;
    float shallowShelf = 1.0 - smoothstep(0.76, 1.34, shoreDistance);
    float nearShore = 1.0 - smoothstep(1.02, 2.4, shoreDistance);
    float openWater = smoothstep(1.35, 4.8, shoreDistance);
    waterColor = mix(waterColor, uDeepColor, openWater * (0.035 + uNight * 0.03));
    waterColor = mix(waterColor, uShallowColor, shallowShelf * (0.4 - uNight * 0.1));

    // Two lapping foam bands parallel to the shore, noise-broken.
    float foamMotion = uTime * 0.55;
    float bandA = sin(shoreDistance * 20.0 - foamMotion);
    float bandB = sin(shoreDistance * 34.0 - foamMotion * 1.35 + shoreAngle * 2.0);
    float bandNoise = 0.6 + 0.4 * sin(shoreAngle * 17.0 + surfaceNormal.y * 3.1);
    float lapFoam = (
      smoothstep(0.55, 0.98, bandA) * 0.7
      + smoothstep(0.7, 0.99, bandB) * 0.5
    ) * bandNoise;
    lapFoam *= (1.0 - smoothstep(0.86, 1.16, shoreDistance))
      * smoothstep(0.7, 0.9, shoreDistance);
    float shoreEdge = smoothstep(0.9, 0.965, shoreDistance)
      * (1.0 - smoothstep(0.965, 1.02, shoreDistance));
    float shoreFoam = (shoreEdge + lapFoam) * (0.2 + uDetail * 0.28) * (0.6 + uDaylight * 0.4);
    waterColor = mix(waterColor, uHighlightColor, clamp(shoreFoam, 0.0, 0.6));

    // Small shallow haloes + foam rings around the outlying islets so they sit
    // in the water instead of on it.
    float cemDist = length((vWaterPosition - uCemeteryCenter) / 4.6);
    float pigDist = length((vWaterPosition - uPigeonnierCenter) / 3.4);
    float isletShelf = (1.0 - smoothstep(0.5, 1.25, cemDist))
      + (1.0 - smoothstep(0.5, 1.25, pigDist));
    waterColor = mix(waterColor, uShallowColor, clamp(isletShelf, 0.0, 1.0) * (0.3 - uNight * 0.08));
    float isletFoam = (
      smoothstep(0.86, 0.98, cemDist) * (1.0 - smoothstep(0.98, 1.12, cemDist))
      + smoothstep(0.86, 0.98, pigDist) * (1.0 - smoothstep(0.98, 1.12, pigDist))
    ) * (0.55 + 0.45 * sin(shoreAngle * 9.0 - foamMotion));
    waterColor = mix(waterColor, uHighlightColor, clamp(isletFoam, 0.0, 0.35) * (0.3 + uDetail * 0.3));

    // --- E3/E4: charted risk-zone water tint -----------------------------
    // Subtle SDF-edged tint toward the band colour inside each zone ellipse.
    // Danger colours arrive pre-darkened, so mixing broods the patch without a
    // separate darken term. Sits under the moon road/lanes so glitter and buoy
    // reflections still play on top.
    for (int zi = 0; zi < ${MAX_GARDEN_WATER_ZONES}; zi += 1) {
      if (float(zi) >= uZoneCount) break;
      vec4 ellipse = uZoneEllipse[zi];
      vec2 zd = (vWaterPosition - ellipse.xy) * ellipse.zw;
      float inside = 1.0 - smoothstep(0.72, 1.0, length(zd));
      vec4 tint = uZoneTint[zi];
      // Luminance-match the tint to the water underneath so zones recolour
      // the sea instead of glowing: at night the hue broods in dark water,
      // by day it reads as a pastel wash.
      float waterLuma = dot(waterColor, vec3(0.2126, 0.7152, 0.0722));
      float tintLuma = max(dot(tint.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.03);
      vec3 zoneColor = tint.rgb * clamp(waterLuma * 1.6 / tintLuma, 0.35, 1.1);
      waterColor = mix(waterColor, zoneColor, inside * tint.w);
    }

    // --- B2: authored moon road + thresholded glitter --------------------
    vec2 fromIsland = vWaterPosition - uIslandCenter;
    float roadAlong = dot(fromIsland, uMoonDir);
    float roadAcross = dot(fromIsland, vec2(-uMoonDir.y, uMoonDir.x));
    // One continuous soft lane through the island centre along the moon
    // azimuth. Fixed narrow width (~12 units) so open water stays deep navy.
    float roadHalfWidth = 6.0;
    float bandProfile = exp(-(roadAcross * roadAcross) / (roadHalfWidth * roadHalfWidth));
    float roadReach = 1.0 - smoothstep(26.0, 140.0, abs(roadAlong));
    float moonBand = bandProfile * roadReach;
    float nightRoad = clamp(uNight + uDusk * 0.5, 0.0, 1.0);
    // The lane base is barely-there; the sparkles carry the road.
    waterColor = mix(waterColor, uMoonRoadColor, moonBand * nightRoad * 0.06);

    // Sparse thresholded sparkles, confined to the lane so open water stays
    // dark. The normal map's high-frequency detail makes the specular term
    // point-like; a hard threshold thins it to a few dozen bright glints that
    // catch the bloom pass.
    // A slightly grazing moon direction so the specular lobe responds to the
    // ripple slopes and breaks into points, instead of a flat vertical sheen.
    vec3 moonLight = normalize(vec3(uMoonDir * 1.15, 0.5));
    vec3 halfMoon = normalize(moonLight + vec3(0.0, 0.0, 1.0));
    float specular = pow(max(0.0, dot(blendedNormal, halfMoon)), 90.0);
    float sparkleMask = step(0.35,
      sin(dot(vWaterPosition, vec2(2.3, 3.1)) + blendedNormal.x * 11.0)
      * sin(dot(vWaterPosition, vec2(-3.7, 2.1)) + blendedNormal.y * 9.0)
    );
    float glitterGate = mix(0.8, 0.68, uSwell);
    float glitter = smoothstep(glitterGate, glitterGate + 0.12, specular)
      * sparkleMask * moonBand * nightRoad;
    waterColor += uMoonRoadColor * clamp(glitter, 0.0, 1.0) * 2.6;

    // --- beacon sweeping lane (kept from V1) ------------------------------
    vec2 beamDirection = vec2(cos(uBeaconAngle), sin(uBeaconAngle));
    vec2 fromBeacon = vWaterPosition - uBeaconPosition;
    float beamAlong = dot(fromBeacon, beamDirection);
    float beamAcross = abs(dot(fromBeacon, vec2(-beamDirection.y, beamDirection.x)));
    float beamWidth = 0.34 + max(0.0, beamAlong) * 0.029;
    float beamLane = smoothstep(0.0, 2.0, beamAlong)
      * (1.0 - smoothstep(22.0, 36.0, beamAlong))
      * exp(-(beamAcross * beamAcross) / max(0.04, beamWidth * beamWidth));
    float beamRipple = 0.56 + 0.44 * sin(beamAlong * 0.78 - uTime * 0.8 + broadRibbon * 0.8);
    float beaconReflection = beamLane
      * (0.05 + smoothstep(0.48, 0.9, beamRipple) * 0.12)
      * uBeaconStrength;
    waterColor = mix(waterColor, uBeaconColor, clamp(beaconReflection, 0.0, 0.2));

    // --- B3: warm light lanes from the registry --------------------------
    // Reflections stretch toward the near edge of the frame under ortho.
    vec2 streakDir = normalize(vec2(0.45, -1.0));
    vec2 streakPerp = vec2(-streakDir.y, streakDir.x);
    float tremble = surfaceNormal.x * (1.2 + uTempo * 1.6);
    vec3 laneAccum = vec3(0.0);
    for (int i = 0; i < ${MAX_GARDEN_LIGHT_LANES}; i += 1) {
      if (float(i) >= uLaneCount) break;
      float u = (float(i) + 0.5) / LANE_TEXELS;
      vec4 head = texture2D(uLaneTexture, vec2(u, 0.25));
      vec2 lanePos = vec2(head.x, -head.y);
      vec2 d = vWaterPosition - lanePos;
      float distSq = dot(d, d);
      if (distSq > 900.0) continue;
      vec4 body = texture2D(uLaneTexture, vec2(u, 0.75));
      float intensity = head.z;
      // Soft radial pool.
      float pool = exp(-distSq / 42.0);
      // Short elongated streak toward the viewer, jittered by the wave normal.
      float along = dot(d, streakDir) + tremble;
      float across = dot(d, streakPerp) + tremble * 0.4;
      float streak = exp(-(across * across) / 3.0)
        * exp(-max(0.0, along) * max(0.0, along) / 120.0)
        * step(-2.0, along);
      laneAccum += body.rgb * intensity * (pool * 0.9 + streak * 0.6);
    }
    waterColor += clamp(laneAccum, 0.0, 2.2);

    float distanceFade = smoothstep(110.0, 360.0, camDistance);
    waterColor = mix(waterColor, uBaseColor, distanceFade * (0.1 + uDusk * 0.06));
    gl_FragColor = vec4(waterColor, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export interface GardenWaterFrame {
  reducedMotion: boolean;
  renderScheduler: Pick<PharosVilleRenderSchedulerState, "tier">;
  seaState: Pick<SeaState, "swell" | "tempo">;
  timeSeconds: number;
  wallClockHour: number;
}

export interface GardenWater {
  material: ShaderMaterial;
  mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  setBeaconState: (
    worldX: number,
    worldZ: number,
    angle: number,
    strength: number,
  ) => void;
  setIslandCenter: (worldX: number, worldZ: number) => void;
  setIsletCenters: (
    cemetery: { x: number; z: number },
    pigeonnier: { x: number; z: number },
  ) => void;
  setLaneState: (texture: DataTexture, activeLaneCount: number) => void;
  setZoneState: (zones: readonly GardenWaterZone[]) => void;
  update: (frame: GardenWaterFrame) => void;
}

export interface GardenWaterZone {
  center: { x: number; z: number };
  color: Color;
  radiusX: number;
  radiusZ: number;
  strength: number;
}

/**
 * One full-bleed water surface. A scrolling normal map catches the light; an
 * authored moon road and the shared light-lane registry lay the warm
 * reflections that make the Lantern Sea read at iso zoom.
 */
export function createGardenWater(waterLevel: number): GardenWater {
  const baseColor = DAY_BASE.clone();
  const deepColor = DAY_DEEP.clone();
  const highlightColor = DAY_HIGHLIGHT.clone();
  const shallowColor = DAY_SHALLOW.clone();
  const uniforms = {
    fogColor: { value: new Color() },
    fogFar: { value: 1_000 },
    fogNear: { value: 1 },
    uBaseColor: { value: baseColor },
    uBeaconAngle: { value: -0.55 },
    uBeaconColor: { value: BEACON_HIGHLIGHT.clone() },
    uBeaconPosition: { value: new Vector2() },
    uBeaconStrength: { value: 0 },
    uCemeteryCenter: { value: new Vector2(1e4, 1e4) },
    uDaylight: { value: 1 },
    uDeepColor: { value: deepColor },
    uDetail: { value: 1 },
    uDusk: { value: 0 },
    uHighlightColor: { value: highlightColor },
    uIslandCenter: { value: new Vector2() },
    uLaneCount: { value: 0 },
    uLaneTexture: { value: null as DataTexture | null },
    uMoonDir: { value: MOON_DIR.clone() },
    uMoonRoadColor: { value: MOON_ROAD_COLOR.clone() },
    uNight: { value: 0 },
    uNormalMap: { value: loadNormalMap() as Texture | null },
    uPigeonnierCenter: { value: new Vector2(1e4, 1e4) },
    uShallowColor: { value: shallowColor },
    uSwell: { value: 0 },
    uTempo: { value: 0.2 },
    uTime: { value: 0 },
    uWaveAmplitude: { value: 0.02 },
    uZoneCount: { value: 0 },
    uZoneEllipse: {
      value: Array.from({ length: MAX_GARDEN_WATER_ZONES }, () => new Vector4()),
    },
    uZoneTint: {
      value: Array.from({ length: MAX_GARDEN_WATER_ZONES }, () => new Vector4()),
    },
  };
  const material = new ShaderMaterial({
    fog: true,
    fragmentShader: FRAGMENT_SHADER,
    uniforms,
    vertexShader: VERTEX_SHADER,
  });
  const mesh = new Mesh(
    new PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGMENTS, WATER_SEGMENTS),
    material,
  );
  mesh.name = "garden-water";
  mesh.position.y = waterLevel;
  mesh.rotation.x = -Math.PI / 2;

  return {
    material,
    mesh,
    setBeaconState(worldX, worldZ, angle, strength) {
      uniforms.uBeaconPosition.value.set(worldX, -worldZ);
      uniforms.uBeaconAngle.value = angle;
      uniforms.uBeaconStrength.value = MathUtils.clamp(strength, 0, 1);
    },
    setIslandCenter(worldX, worldZ) {
      // The plane's -90 degree X rotation maps local Y to negative world Z.
      uniforms.uIslandCenter.value.set(worldX, -worldZ);
    },
    setIsletCenters(cemetery, pigeonnier) {
      uniforms.uCemeteryCenter.value.set(cemetery.x, -cemetery.z);
      uniforms.uPigeonnierCenter.value.set(pigeonnier.x, -pigeonnier.z);
    },
    setLaneState(texture, activeLaneCount) {
      uniforms.uLaneTexture.value = texture;
      uniforms.uLaneCount.value = activeLaneCount;
    },
    setZoneState(zones) {
      const count = Math.min(zones.length, MAX_GARDEN_WATER_ZONES);
      uniforms.uZoneCount.value = count;
      for (let index = 0; index < count; index += 1) {
        const zone = zones[index]!;
        // The plane's -90deg X rotation maps world Z to negative water Y.
        uniforms.uZoneEllipse.value[index]!.set(
          zone.center.x,
          -zone.center.z,
          1 / Math.max(0.001, zone.radiusX),
          1 / Math.max(0.001, zone.radiusZ),
        );
        uniforms.uZoneTint.value[index]!.set(
          zone.color.r,
          zone.color.g,
          zone.color.b,
          zone.strength,
        );
      }
    },
    update(frame) {
      const { daylight, dusk, night } = dayCycle(frame.wallClockHour);
      blendCycle(baseColor, NIGHT_BASE, DUSK_BASE, DAY_BASE, dusk, daylight);
      blendCycle(deepColor, NIGHT_DEEP, DUSK_DEEP, DAY_DEEP, dusk, daylight);
      blendCycle(
        shallowColor,
        NIGHT_SHALLOW,
        DUSK_SHALLOW,
        DAY_SHALLOW,
        dusk,
        daylight,
      );
      blendCycle(
        highlightColor,
        NIGHT_HIGHLIGHT,
        DUSK_HIGHLIGHT,
        DAY_HIGHLIGHT,
        dusk,
        daylight,
      );

      uniforms.uDetail.value = detailForTier(frame.renderScheduler.tier);
      uniforms.uDaylight.value = daylight;
      uniforms.uDusk.value = dusk;
      uniforms.uNight.value = night;
      uniforms.uSwell.value = MathUtils.clamp(frame.seaState.swell, 0, 1);
      uniforms.uTempo.value = MathUtils.clamp(frame.seaState.tempo, 0, 1);
      uniforms.uTime.value = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      uniforms.uWaveAmplitude.value = 0.022
        + MathUtils.clamp(frame.seaState.swell, 0, 1) * 0.014;
    },
  };
}

function loadNormalMap(): Texture | null {
  // The renderer only mounts behind the desktop gate; unit tests run in a
  // DOM-less environment where no image can load, so skip it there.
  if (typeof document === "undefined") return null;
  const texture = new TextureLoader().load(NORMAL_MAP_URL);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

function blendCycle(
  target: Color,
  night: Color,
  dusk: Color,
  day: Color,
  duskMix: number,
  daylightMix: number,
): void {
  target.copy(night).lerp(dusk, duskMix).lerp(day, daylightMix);
}

function dayCycle(hourInput: number): {
  daylight: number;
  dusk: number;
  night: number;
} {
  const hour = ((hourInput % 24) + 24) % 24;
  const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const dusk = Math.max(
    Math.max(0, 1 - Math.abs(hour - 6) / 2),
    Math.max(0, 1 - Math.abs(hour - 18) / 2),
  );
  return {
    daylight,
    dusk,
    night: MathUtils.clamp(1 - daylight - dusk * 0.38, 0, 1),
  };
}

function detailForTier(tier: PharosVilleRenderSchedulerState["tier"]): number {
  switch (tier) {
    case "full":
    case "balanced":
      return 1;
    case "interaction":
      return 0.58;
    case "recovery":
      return 0.36;
    case "constrained":
      // The shader still evaluates its wave fields at zero detail, so retain
      // enough contrast to keep the water legible without extra GPU work.
      return 0.24;
  }
}
