import {
  Color,
  MathUtils,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from "three";
import type { PharosVilleRenderSchedulerState } from "../renderer/render-types";
import { HARBOR_PALETTE } from "../systems/palette";
import type { SeaState } from "../systems/sea-state";

const WATER_SIZE = 900;
const WATER_SEGMENTS = 96;
export const GARDEN_WATER_MAX_DISPLACEMENT = 0.036;

const DAY_BASE = new Color("#227783");
const DUSK_BASE = new Color("#174c5b");
const NIGHT_BASE = new Color("#0d3040");
const DAY_DEEP = new Color("#073b4d");
const DUSK_DEEP = new Color("#092d3b");
const NIGHT_DEEP = new Color("#051722");
const DAY_SHALLOW = new Color("#57a393");
const DUSK_SHALLOW = new Color("#356b68");
const NIGHT_SHALLOW = new Color("#1b4550");
const DAY_HIGHLIGHT = new Color(HARBOR_PALETTE.foam_white);
const DUSK_HIGHLIGHT = DAY_HIGHLIGHT.clone().lerp(
  new Color(HARBOR_PALETTE.lantern_warm),
  0.22,
);
const NIGHT_HIGHLIGHT = new Color(HARBOR_PALETTE.moonlight);
const BEACON_HIGHLIGHT = new Color(HARBOR_PALETTE.lantern_glow);

const VERTEX_SHADER = /* glsl */ `
  uniform float uDetail;
  uniform float uTempo;
  uniform float uTime;
  uniform float uWaveAmplitude;

  varying vec2 vWaterPosition;
  varying vec3 vWorldPosition;

  #include <fog_pars_vertex>

  float gardenWave(vec2 waterPosition, float time, float detail) {
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
    float fine = sin(
      dot(waterPosition, vec2(0.16, -0.11)) + time * 0.22 * speed
    ) * detail;
    return primary * 0.48 + crossing * 0.28 + longSwell * 0.2 + fine * 0.04;
  }

  void main() {
    vec2 waterPosition = position.xy;
    float wave = gardenWave(waterPosition, uTime, uDetail);
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
  uniform float uDaylight;
  uniform vec3 uDeepColor;
  uniform float uDetail;
  uniform float uDusk;
  uniform vec3 uHighlightColor;
  uniform vec2 uIslandCenter;
  uniform float uNight;
  uniform vec3 uShallowColor;
  uniform float uTime;
  uniform float uWaveAmplitude;

  varying vec2 vWaterPosition;
  varying vec3 vWorldPosition;

  #include <fog_pars_fragment>

  void main() {
    float broadPhase = dot(vWaterPosition, vec2(0.061, 0.028)) + uTime * 0.08;
    float crossingPhase = dot(vWaterPosition, vec2(-0.039, 0.092)) - uTime * 0.115;
    float longPhase = dot(vWaterPosition, vec2(0.014, -0.023)) + uTime * 0.04;
    float broadRibbon = sin(broadPhase);
    float crossingRibbon = sin(crossingPhase);
    float longSwell = sin(longPhase);
    float ripplePhaseA = dot(vWaterPosition, vec2(0.42, 0.13))
      + crossingRibbon * 0.45
      + uTime * 0.19;
    float ripplePhaseB = dot(vWaterPosition, vec2(-0.23, 0.47))
      + broadRibbon * 0.34
      - uTime * 0.14;
    float rippleA = sin(ripplePhaseA);
    float rippleB = sin(ripplePhaseB);
    float surfaceCrest = broadRibbon * 0.48
      + crossingRibbon * 0.28
      + longSwell * 0.2;
    float surfaceGrain = 0.5 + 0.5 * sin(
      dot(vWaterPosition, vec2(0.93, 1.27))
        + rippleA * 0.8
        + rippleB * 0.4
    );
    float depthMix = clamp(
      0.54
        + surfaceCrest * 0.065
        + rippleA * 0.018
        + rippleB * 0.012,
      0.0,
      1.0
    );
    vec3 waterColor = mix(uDeepColor, uBaseColor, depthMix);
    float currentWarp = sin(
      dot(vWaterPosition, vec2(0.019, 0.033)) - uTime * 0.019
    );
    float tonalCurrent = 0.5 + 0.5 * sin(
      dot(vWaterPosition, vec2(0.046, -0.058))
        + currentWarp * 1.15
        + uTime * 0.027
    );
    waterColor = mix(
      waterColor,
      uDeepColor,
      tonalCurrent * (0.025 + uDetail * 0.025 + uNight * 0.012)
    );
    vec3 jadeCurrent = mix(uShallowColor, uBaseColor, 0.38);
    float currentBand = pow(
      0.5 + 0.5 * sin(
        dot(vWaterPosition, vec2(0.115, 0.026))
          + longSwell * 0.72
          - uTime * 0.045
      ),
      7.0
    );
    waterColor = mix(
      waterColor,
      jadeCurrent,
      currentBand * uDetail * (0.032 + uDaylight * 0.032)
    );
    vec2 surfaceSlope = (
      cos(broadPhase) * vec2(0.061, 0.028) * 0.48
        + cos(crossingPhase) * vec2(-0.039, 0.092) * 0.28
        + cos(longPhase) * vec2(0.014, -0.023) * 0.2
        + cos(ripplePhaseA) * vec2(0.42, 0.13) * 0.11 * uDetail
        + cos(ripplePhaseB) * vec2(-0.23, 0.47) * 0.07 * uDetail
    ) * uWaveAmplitude * 18.0;
    vec3 surfaceNormal = normalize(vec3(
      -surfaceSlope.x,
      -surfaceSlope.y,
      1.0
    ));
    vec3 keyDirection = normalize(vec3(-0.46, 0.2, 0.86));
    vec3 halfDirection = normalize(vec3(0.11, -0.29, 0.95));
    float facetLight = clamp(dot(surfaceNormal, keyDirection) * 0.5 + 0.55, 0.2, 1.0);
    waterColor *= 0.955 + facetLight * 0.09;
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(
      1.0 - max(0.0, dot(surfaceNormal, viewDirection)),
      3.0
    );
    vec3 skyReflection = mix(uBaseColor, uHighlightColor, 0.34);
    waterColor = mix(
      waterColor,
      skyReflection,
      fresnel * (0.08 + uDaylight * 0.08 + uNight * 0.04)
    );

    vec2 shoreDelta = vWaterPosition - uIslandCenter - vec2(0.6, -1.2);
    float shoreCos = cos(0.08);
    float shoreSin = sin(0.08);
    shoreDelta = vec2(
      shoreDelta.x * shoreCos + shoreDelta.y * shoreSin,
      -shoreDelta.x * shoreSin + shoreDelta.y * shoreCos
    ) / vec2(18.4, 13.8);
    float shoreAngle = atan(shoreDelta.y, shoreDelta.x);
    float shoreVariation = sin(shoreAngle * 3.0 + 0.3) * 0.04
      + sin(shoreAngle * 7.0 - 0.21) * 0.022;
    float shoreDistance = length(shoreDelta) + shoreVariation;
    float shallowShelf = 1.0 - smoothstep(0.76, 1.28, shoreDistance);
    float nearShore = 1.0 - smoothstep(1.02, 2.4, shoreDistance);
    float openWater = smoothstep(1.35, 4.8, shoreDistance);
    waterColor = mix(
      waterColor,
      uDeepColor,
      openWater * (0.035 + uNight * 0.03)
    );
    waterColor = mix(
      waterColor,
      uShallowColor,
      shallowShelf * (0.38 - uNight * 0.09)
    );

    float shoreFoam = smoothstep(0.93, 0.972, shoreDistance)
      * (1.0 - smoothstep(0.972, 1.018, shoreDistance));
    float shoreBreak = 0.58 + 0.42 * sin(shoreAngle * 13.0 + uTime * 0.38);
    shoreFoam *= shoreBreak
      * (0.16 + uDetail * 0.22)
      * (0.6 + uDaylight * 0.4);
    waterColor = mix(waterColor, uHighlightColor, shoreFoam);

    float crestFoam = smoothstep(0.92, 0.998, 0.5 + rippleA * 0.5)
      * smoothstep(0.94, 0.999, surfaceGrain)
      * smoothstep(0.25, 0.92, uDetail)
      * (0.018 + uDaylight * 0.018)
      * (0.04 + nearShore * 0.96);
    waterColor = mix(waterColor, uHighlightColor, crestFoam);

    float normalGlint = pow(max(0.0, dot(surfaceNormal, halfDirection)), 54.0);
    float crestSheen = smoothstep(0.46, 0.92, surfaceCrest);
    float rippleSheen = smoothstep(
      0.88,
      0.995,
      0.5 + rippleA * 0.5
    );
    float crossingSheen = smoothstep(
      0.9,
      0.998,
      0.5 + rippleB * 0.5
    );
    float brokenRipple = rippleSheen * smoothstep(0.94, 0.999, surfaceGrain);
    float brokenCrossing = crossingSheen * smoothstep(
      0.94,
      0.999,
      0.5 + 0.5 * sin(
        dot(vWaterPosition, vec2(0.79, -1.16)) + rippleA * 0.65
      )
    );
    float glint = (
      normalGlint * 0.012
      + currentBand * 0.008
      + crestSheen * 0.004
    ) * uDetail * (0.34 + uDaylight * 0.66 + uNight * 0.18);
    glint += (
      brokenRipple * 0.022
      + brokenCrossing * 0.012
    ) * (0.42 + uDetail * 0.58) * (0.6 + uDaylight * 0.4);
    glint *= (0.72 + surfaceGrain * 0.28) * (0.02 + nearShore * 0.98);

    waterColor = mix(
      waterColor,
      uHighlightColor,
      clamp(glint, 0.0, 0.28)
    );

    vec2 beamDirection = vec2(cos(uBeaconAngle), sin(uBeaconAngle));
    vec2 fromBeacon = vWaterPosition - uBeaconPosition;
    float beamAlong = dot(fromBeacon, beamDirection);
    float beamAcross = abs(dot(fromBeacon, vec2(-beamDirection.y, beamDirection.x)));
    float beamWidth = 0.34 + max(0.0, beamAlong) * 0.029;
    float beamLane = smoothstep(0.0, 2.0, beamAlong)
      * (1.0 - smoothstep(22.0, 36.0, beamAlong))
      * exp(-(beamAcross * beamAcross) / max(0.04, beamWidth * beamWidth));
    float beamRipple = 0.56 + 0.44 * sin(
      beamAlong * 0.78 - uTime * 0.8 + crossingRibbon * 0.8
    );
    float brokenReflection = smoothstep(0.48, 0.9, beamRipple)
      * (0.62 + surfaceGrain * 0.38);
    float beaconReflection = beamLane
      * (0.035 + brokenReflection * 0.11)
      * uBeaconStrength;
    waterColor = mix(
      waterColor,
      uBeaconColor,
      clamp(beaconReflection, 0.0, 0.16)
    );

    float distanceFade = smoothstep(110.0, 360.0, distance(cameraPosition, vWorldPosition));
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
  update: (frame: GardenWaterFrame) => void;
}

/**
 * One full-bleed water surface. Its broad displacement and sparse glints keep
 * the sea alive without textures, postprocessing, or another animation clock.
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
    uDaylight: { value: 1 },
    uDeepColor: { value: deepColor },
    uDetail: { value: 1 },
    uDusk: { value: 0 },
    uHighlightColor: { value: highlightColor },
    uIslandCenter: { value: new Vector2() },
    uNight: { value: 0 },
    uShallowColor: { value: shallowColor },
    uTempo: { value: 0.2 },
    uTime: { value: 0 },
    uWaveAmplitude: { value: 0.02 },
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
      uniforms.uTempo.value = MathUtils.clamp(frame.seaState.tempo, 0, 1);
      uniforms.uTime.value = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      uniforms.uWaveAmplitude.value = 0.022
        + MathUtils.clamp(frame.seaState.swell, 0, 1) * 0.014;
    },
  };
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
