import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import type { PharosVilleRenderSchedulerState } from "../renderer/render-types";
import { seaQualityTier } from "../renderer/render-scheduler";
import { HARBOR_PALETTE } from "../systems/palette";
import type { SeaState } from "../systems/sea-state";
import {
  blendDayCycleColor,
  DAY_CYCLE_LIGHT_PRESETS,
  DAY_CYCLE_SKY_PRESETS,
  dayCyclePhase,
  MOON_COLOR,
} from "./garden-day-cycle";
import { GARDEN_MOON_AZIMUTH } from "./garden-sky";
import { MAX_GARDEN_LIGHT_LANES } from "./garden-lanterns";
import {
  SEA_REGION_CHARACTER,
  SEA_REGION_COUNT,
  SEA_REGION_FALLBACK_TINT,
  SEA_REGION_ORDER,
  buildSeaRegionField,
} from "../systems/garden-sea-regions";
import {
  GARDEN_WATER_MAX_RIPPLE_RINGS,
  GARDEN_WATER_MAX_ZONE_TINTS,
  type GardenCloudShadowSource,
  type GardenHarborCalmMask,
  type GardenRippleRingEmitter,
  type GardenWaterZoneTint,
} from "./garden-water-contract";

const WATER_SIZE = 900;
// Tile -> world scale, mirroring TILE_SCALE in garden-util. Redeclared here to
// keep garden-water free of a util import cycle.
const TILE_SCALE_UNITS = Math.SQRT2;
/**
 * W2 / D5+W2.7: how strongly a region tints its water.
 *
 * The old per-band values were 0.04-0.20 because six ellipses STACKED — a
 * WATCH tint covering the whole map had to be almost invisible or it would
 * wash everything. A partition has no stacking, so each region can read
 * properly. Character (swell, chop, foam, reflectivity) still carries most of
 * the signal; this is the supporting colour.
 */
const REGION_TINT_STRENGTH = 0.34;

/**
 * Bakes the terrain-derived sea-region field into GPU textures.
 *
 * S5: the field carries two channels with OPPOSITE filtering needs, so it ships
 * as two textures rather than one.
 *
 * - The region **id** must be point-sampled. A bilinear blend between region 1
 *   and region 3 would produce region 2 and paint a phantom band along every
 *   boundary.
 * - The **boundary distance** is a smooth scalar, and point-sampling it is why
 *   the tide lines crawled: at whole-map framing one screen pixel covers
 *   several texels, and the seam terms read a 0.14-wide window of it, so the
 *   line stair-stepped and swam as the camera moved. Linear filtering plus
 *   mipmaps resolves it the way any other continuous field would be.
 */
function createSeaRegionTextures(): {
  distance: DataTexture;
  field: DataTexture;
  tileSpan: number;
} {
  const baked = buildSeaRegionField();
  const field = new DataTexture(baked.data, baked.size, baked.size, RGBAFormat);
  field.magFilter = NearestFilter;
  field.minFilter = NearestFilter;
  field.generateMipmaps = false;
  field.needsUpdate = true;
  field.flipY = false;

  // Distance-only copy. Same bytes, different sampler state — the two cannot
  // share a texture because filtering is a property of the texture, not the
  // fetch.
  const distanceData = new Uint8Array(baked.size * baked.size * 4);
  for (let index = 0; index < baked.size * baked.size; index += 1) {
    const boundary = baked.data[index * 4 + 1]!;
    distanceData[index * 4] = boundary;
    distanceData[index * 4 + 1] = boundary;
    distanceData[index * 4 + 2] = boundary;
    distanceData[index * 4 + 3] = 255;
  }
  const distance = new DataTexture(distanceData, baked.size, baked.size, RGBAFormat);
  distance.magFilter = LinearFilter;
  distance.minFilter = LinearMipmapLinearFilter;
  distance.generateMipmaps = true;
  distance.needsUpdate = true;
  distance.flipY = false;

  return { distance, field, tileSpan: baked.tileSpan };
}
const WATER_SEGMENTS = 96;
export const GARDEN_WATER_MAX_DISPLACEMENT = 0.036;
// Kept as the historical export name; the C2 contract constant is canonical.
export const MAX_GARDEN_WATER_ZONES = GARDEN_WATER_MAX_ZONE_TINTS;
// W6: approximate world-unit radius of the island rock at the waterline (the
// shore ellipse spans 18.4 x 13.8 around the island root; 14 is the calm
// circular mean used by the caustic glow and foam-ring SDF).
export const GARDEN_ISLAND_ROCK_RADIUS = 14;

const NORMAL_MAP_URL = "/pharosville/textures/water-normals.png?v=3c09a2159c4f";

// Cloud-shadow world mapping: one noise tile spans ~170 world units; drift is
// a slow east-southeast wind so light weather crosses the garden in minutes.
const CLOUD_SHADOW_TEXEL_SCALE = 1 / 170;
const CLOUD_SHADOW_DRIFT_X = 0.0009;
const CLOUD_SHADOW_DRIFT_Z = 0.00055;

// Moon-road azimuth carried over from the sky so the sea's glitter band lands
// under the same moon the dome draws. The water plane's -90deg X rotation maps
// world +Z to local -Y, so the horizontal moon direction negates its Z.
const MOON_DIR = new Vector2(
  Math.cos(GARDEN_MOON_AZIMUTH),
  -Math.sin(GARDEN_MOON_AZIMUTH),
).normalize();

// Palette-derived sea presets (C1: no hex literals — everything derives from
// HARBOR_PALETTE and the day-cycle preset objects). The Garden Sea day identity
// (D-R1 ukiyo-e morning) is a shallow→deep HSV ramp: turquoise shelf water →
// saturated blue mids → deep indigo-violet open sea, posterized into flat
// bands by the shader. Night keeps the Lantern Sea as indigo bands. Every band
// stays below the bloom knee (per-state thresholds in garden-post): large
// water areas must never bloom — only sparse glitter, foam, and emissives may.
const pc = (key: keyof typeof HARBOR_PALETTE): Color => new Color(HARBOR_PALETTE[key]);
// R4: noon has to read as noon. Every "sea" entry in HARBOR_PALETTE is an
// indigo (deep_sea_1 #141a30, shallow_teal #1f2a4a, sky_day_zenith #27567d),
// so the old day ramp was essentially the night sky at a slightly higher
// value — a warm-lit fleet floating on a midnight sea at hour 12.
//
// The day sea now sits in a JADE/TEAL family built from sail_teal and
// aurora_green: a turquoise shelf, a jade mid-water, and a deep teal basin.
// Night and dusk keep their indigo, so the day/night contrast is a real
// journey rather than two shades of the same blue.
//
// All three stay far below the day bloom knee (0.95 luminance) — large water
// areas must never bloom, only glitter and foam may.
const DAY_SHALLOW = pc("sky_day_zenith").lerp(pc("aurora_green"), 0.46).lerp(pc("lantern_cold"), 0.12);
const DAY_MID = pc("sky_day_zenith").lerp(pc("sail_teal"), 0.35).lerp(pc("aurora_green"), 0.2);
// Built FROM the daylight zenith rather than from deep_sea_1: anchoring the
// deep band on the night indigo dragged the whole far sea toward black, and
// since the open ocean beyond the map derives from this band, it turned the
// world into a lit slab on a void.
const DAY_DEEP = pc("sky_day_zenith").lerp(pc("sail_teal"), 0.42).lerp(pc("deep_sea_1"), 0.25);
const DUSK_SHALLOW = pc("shallow_teal").lerp(pc("lantern_warm"), 0.16).lerp(pc("deep_sea_1"), 0.28);
const DUSK_MID = pc("deep_sea_1").lerp(pc("ember"), 0.3).lerp(pc("lantern_warm"), 0.08);
const DUSK_DEEP = pc("deep_sea_2").lerp(pc("deep_sea_1"), 0.5);
const NIGHT_SHALLOW = pc("shallow_teal").lerp(pc("deep_sea_1"), 0.25);
const NIGHT_MID = pc("deep_sea_1").lerp(pc("shallow_teal"), 0.3);
const NIGHT_DEEP = pc("deep_sea_2");
const DAY_HIGHLIGHT = pc("foam_white");
const DUSK_HIGHLIGHT = DAY_HIGHLIGHT.clone().lerp(pc("lantern_warm"), 0.22);
const NIGHT_HIGHLIGHT = pc("moonlight");
const BEACON_HIGHLIGHT = pc("lantern_glow");
const MOON_ROAD_COLOR = pc("moonlight");

// W2 sky env tint endpoints come from the C1 sky presets; at night the sheen
// becomes moonlight (W6), so the night variants are pre-mixed with the moon.
// The day horizon is pulled toward the zenith so the sheen stays below the
// bloom knee even at full mask strength.
const DAY_ENV_HORIZON = DAY_CYCLE_SKY_PRESETS.day.horizon.clone()
  .lerp(DAY_CYCLE_SKY_PRESETS.day.zenith, 0.45);
const DAY_ENV_ZENITH = DAY_CYCLE_SKY_PRESETS.day.zenith.clone();
const DUSK_ENV_HORIZON = DAY_CYCLE_SKY_PRESETS.dusk.horizon.clone();
const DUSK_ENV_ZENITH = DAY_CYCLE_SKY_PRESETS.dusk.zenith.clone();
const NIGHT_ENV_HORIZON = DAY_CYCLE_SKY_PRESETS.night.horizon.clone().lerp(MOON_COLOR, 0.35);
const NIGHT_ENV_ZENITH = DAY_CYCLE_SKY_PRESETS.night.zenith.clone().lerp(MOON_COLOR, 0.18);

const VERTEX_SHADER = /* glsl */ `
  uniform float uDetail;
  uniform float uHarborCalm;
  uniform vec4 uHarborEllipse;
  uniform float uTempo;
  uniform float uTime;
  uniform float uWaveAmplitude;
  uniform sampler2D uRegionField;
  uniform vec4 uRegionSwell[${SEA_REGION_COUNT}];
  uniform vec4 uRegionTransform;

  varying vec2 vWaterPosition;
  varying vec3 vWorldPosition;
  varying vec2 vRegionUv;

  #include <fog_pars_vertex>

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
    // C2(b) harbor-calm mask (I2 mirror basin): swell is suppressed inside the
    // harbor ellipse so the basin reads still against the open sea's motion.
    float harborDistance = length((waterPosition - uHarborEllipse.xy) * uHarborEllipse.zw);
    float harborCalm = (1.0 - smoothstep(0.7, 1.05, harborDistance)) * uHarborCalm;
    // W2/D6: swell amplitude and chop are per-region, so calm water lies
    // near-still while danger water runs steep. Region lookup happens in the
    // vertex stage — one texture fetch per vertex, not per fragment.
    vec2 regionUv = (waterPosition - uRegionTransform.xy) * uRegionTransform.zw;
    vec4 regionSample = texture2D(uRegionField, regionUv);
    int regionId = int(regionSample.r * 255.0 + 0.5);
    float regionSwell = uRegionSwell[regionId].x;
    float regionChop = uRegionSwell[regionId].y;
    float wave = gardenWave(waterPosition * regionChop, uTime);
    vec3 displaced = position;
    displaced.z += wave * uWaveAmplitude * regionSwell * (1.0 - harborCalm * 0.8);

    vRegionUv = regionUv;
    vWaterPosition = waterPosition;
    vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uBandColor[4];
  uniform vec3 uBaseColor;
  uniform float uBeaconAngle;
  uniform vec3 uBeaconColor;
  uniform float uBeaconFlicker;
  uniform vec2 uBeaconPosition;
  uniform float uBeaconStrength;
  uniform vec2 uCemeteryCenter;
  uniform sampler2D uCloudShadow;
  uniform float uCloudShadowStrength;
  uniform vec4 uCloudShadowTransform;
  uniform float uDaylight;
  uniform vec3 uDeepColor;
  uniform float uDetail;
  uniform float uDusk;
  uniform vec3 uEnvHorizonColor;
  uniform float uEnvStrength;
  uniform vec3 uEnvZenithColor;
  uniform float uGlitterStrength;
  uniform float uHarborCalm;
  uniform vec4 uHarborEllipse;
  uniform vec3 uHighlightColor;
  uniform vec2 uIslandCenter;
  uniform float uLaneCount;
  uniform vec3 uLaneField;
  uniform sampler2D uLaneTexture;
  uniform vec2 uMoonDir;
  uniform vec3 uMoonRoadColor;
  uniform float uNight;
  uniform sampler2D uNormalMap;
  uniform vec2 uPigeonnierCenter;
  uniform vec4 uRipple[${GARDEN_WATER_MAX_RIPPLE_RINGS}];
  uniform float uRippleCount;
  uniform vec4 uRippleParams[${GARDEN_WATER_MAX_RIPPLE_RINGS}];
  uniform float uRippleStrength;
  uniform float uRockRadius;
  uniform vec3 uShallowColor;
  uniform vec3 uSunGlitterColor;
  uniform float uSwell;
  uniform float uTempo;
  uniform float uTime;
  uniform float uWaveAmplitude;
  uniform vec2 uOpenOceanCenter;
  uniform float uOpenOceanRadius;
  uniform sampler2D uRegionField;
  uniform sampler2D uRegionDistance;
  uniform vec3 uRegionColor[${SEA_REGION_COUNT}];
  // xyzw = depth multiplier, foam density, reflectivity, tint strength.
  uniform vec4 uRegionParams[${SEA_REGION_COUNT}];
  uniform vec4 uRegionTransform;

  varying vec2 vWaterPosition;
  varying vec3 vWorldPosition;
  varying vec2 vRegionUv;

  #include <fog_pars_fragment>

  const float LANE_TEXELS = ${MAX_GARDEN_LIGHT_LANES}.0;

  vec3 sampleWaterNormal(vec2 uv) {
    return texture2D(uNormalMap, uv).xyz * 2.0 - 1.0;
  }

  // Value noise for the region whitecaps (W2/D6). Products of sines tile into
  // a visible diagonal lattice; this does not.
  //
  // S4: the classic fract(sin(dot(p, k)) * 43758.5453) hash is unstable at
  // this scale. Whitecap lattice coordinates run to ~150, so dot(p, k)
  // reaches ~66000 — and highp's 24-bit mantissa leaves roughly 0.6 rad of
  // error there, so the "noise" changed under the camera and the crests
  // shimmered. Folding p into a small window first keeps the sine argument in a
  // range where it is exact. The fold is on the integer LATTICE, so the noise
  // field is unchanged apart from repeating every 289 cells — far larger than
  // the sea, and invisible against two octaves of fbm.
  float gardenHash(vec2 p) {
    vec2 folded = mod(p, 289.0);
    return fract(sin(dot(folded, vec2(127.1, 311.7))) * 43758.5453);
  }

  float gardenValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(gardenHash(i), gardenHash(i + vec2(1.0, 0.0)), u.x),
      mix(gardenHash(i + vec2(0.0, 1.0)), gardenHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // Two octaves, not three: the third contributes 10% of the amplitude for
  // 33% of the cost, and whitecaps are a high-frequency accent either way.
  float gardenFbm(vec2 p) {
    return gardenValueNoise(p) * 0.68 + gardenValueNoise(p * 2.1 + 17.3) * 0.32;
  }

  vec2 rotate2(vec2 v, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
  }

  /**
   * S3: a threshold that knows how fast its own field is moving on screen.
   *
   * The sea was full of bare step()s -- the sparkle masks, the shore foam
   * rings. MSAA antialiases geometry edges, not a discontinuity a shader
   * invents per fragment, so each one aliased into crawling speckle whenever
   * the camera moved: the operator's "flickering", and why the sun glitter read
   * as scattered dust rather than light on water.
   *
   * Widening the transition to one screen pixel of the field's own gradient
   * resolves it exactly where it is undersampled and nowhere else, so close-up
   * detail is untouched. The floor keeps a nearly-flat field from opening the
   * ramp so wide the mark dissolves.
   */
  float aaStep(float edge, float value) {
    float width = max(fwidth(value), 1e-4);
    return smoothstep(edge - width, edge + width, value);
  }

  void main() {
    // --- W6.1: open-ocean early-out ----------------------------------------
    // The water plane is 900 units across; the playable map is ~79. Everything
    // past the map's edge is empty ocean that can never contain a region, a
    // ripple ring, a light lane, a shore or the island — yet it was running the
    // full shader, and at overview zoom it covers most of the screen.
    //
    // This is a spatially COHERENT branch (one contiguous ring around the
    // map), so it costs nothing in divergence and buys back the majority of
    // the frame's fragment work at wide zooms.
    // NOTE the centre: tiles map to world (tx*TILE_SCALE, ty*TILE_SCALE), so
    // the map spans 0..79 rather than straddling the origin, and the plane's
    // -90deg X rotation flips Z. Testing against the origin would clip live
    // water off the map's far edge.
    vec2 fromMapCenter = vWaterPosition - uOpenOceanCenter;
    float mapDistance = max(abs(fromMapCenter.x), abs(fromMapCenter.y));
    if (mapDistance > uOpenOceanRadius) {
      // The cheap path must land on the SAME colour the detailed path would,
      // or the boundary shows as a hard diamond seam around the map.
      //
      // Out here the detailed path is provably degenerate: the shore SDF is
      // saturated (depth = 1 -> deepest band), every shelf/basin/islet term is
      // zero, no region covers the fragment, and no ripple or light lane is in
      // range. So the whole thing collapses to the deepest band plus the slow
      // tonal current and the distance fade — which is all this reproduces.
      // Only the loops and texture fetches are skipped, not the look.
      float openTonalCurrent = 0.5 + 0.5 * sin(
        dot(vWaterPosition, vec2(0.046, -0.058)) + uTime * 0.027
      );
      // Deeper and cooler than the deepest in-map band. The world should sit
      // on a continental shelf that drops away, so the eye reads
      // shelf -> open ocean. Matching the band exactly made the sea OUTSIDE
      // read lighter than the tinted sea inside, inverting the depth cue and
      // turning the map into a slab floating on a void.
      // Deeper and cooler than the deepest in-map band, so the eye reads a
      // shelf dropping away — but only slightly. R4 moved the day sea into a
      // jade family, which left the old 0.55/0.86 darkening reading as a black
      // VOID around a lit slab, the opposite of the problem it was added to
      // solve.
      vec3 openColor = mix(uBandColor[3], uDeepColor, 0.3)
        * (0.94 + openTonalCurrent * 0.05);
      openColor = mix(
        openColor,
        mix(uEnvHorizonColor, uEnvZenithColor, 0.35),
        uEnvStrength * 0.06
      );
      float openCamDistance = distance(cameraPosition, vWorldPosition);
      float openFade = smoothstep(150.0, 520.0, openCamDistance);
      openColor = mix(
        openColor,
        uBaseColor,
        openFade * (0.08 + uDusk * 0.05 + uNight * 0.04)
      );
      gl_FragColor = vec4(openColor, 1.0);
      // The early-out must close the frame EXACTLY as the end of main does.
      // Three only compiles TONE_MAPPING and an encoding linearToOutputTexel
      // into a material when it draws to the default framebuffer, so both
      // chunks are no-ops while the post composer owns the frame and become
      // live the moment it is shed at the constrained tier. Ending this
      // branch without them wrote linear values straight into the sRGB canvas,
      // and the open sea outside the map snapped to a near-black void behind a
      // hard diamond seam every time the scheduler crossed that tier.
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      return;
    }

    // --- harbor-calm mask (C2(b), I2 mirror basin) -------------------------
    float harborDistance = length((vWaterPosition - uHarborEllipse.xy) * uHarborEllipse.zw);
    float harborCalm = (1.0 - smoothstep(0.7, 1.05, harborDistance)) * uHarborCalm;

    // --- B1: dual scrolling normal map -------------------------------------
    float scroll = uTime * (0.6 + uTempo * 0.9);
    vec2 flow = uMoonDir * scroll;
    vec3 nA = sampleWaterNormal(vWaterPosition * 0.055 + flow * 0.045);
    // W6.1: the second, counter-rotated normal fetch adds cross-hatched
    // surface detail that only reads at close zoom and high tiers. Below
    // balanced it is a full texture fetch per fragment for detail the tier is
    // already shedding elsewhere, so it is gated on the same uDetail signal.
    vec3 blendedNormal;
    if (uDetail > 0.55) {
      vec3 nB = sampleWaterNormal(
        rotate2(vWaterPosition, 2.3) * 0.11 - flow * 0.03 + vec2(0.37, 0.11)
      );
      blendedNormal = normalize(vec3(nA.xy + nB.xy, nA.z * nB.z + 0.55));
    } else {
      blendedNormal = normalize(vec3(nA.xy, nA.z + 0.55));
    }
    // The mirror basin flattens the scrolled detail so it reads still.
    blendedNormal = normalize(mix(blendedNormal, vec3(0.0, 0.0, 1.0), harborCalm * 0.75));
    float camDistance = distance(cameraPosition, vWorldPosition);
    // W7: normal detail survives the default framing distance (camera sits at
    // ~110–190); the falloff floor keeps far water alive and the tier (uDetail)
    // — not distance alone — decides how much detail ships.
    float detailFalloff = max(1.0 - smoothstep(130.0, 460.0, camDistance), 0.32) * uDetail;
    vec3 surfaceNormal = normalize(mix(vec3(0.0, 0.0, 1.0), blendedNormal, detailFalloff));

    // --- analytic shore SDF (island + outlying islets) ----------------------
    vec2 shoreDelta = vWaterPosition - uIslandCenter - vec2(0.6, -1.2);
    shoreDelta = rotate2(shoreDelta, -0.08) / vec2(18.4, 13.8);
    float shoreAngle = atan(shoreDelta.y, shoreDelta.x);
    float shoreVariation = sin(shoreAngle * 3.0 + 0.3) * 0.04
      + sin(shoreAngle * 7.0 - 0.21) * 0.022;
    float shoreDistance = length(shoreDelta) + shoreVariation;
    // N1: with the sea 4x larger the old tight 0.76-1.34 ramp read as a hard
    // cyan ring hugging the island. Widened a little so it shelves rather
    // than stops — but only a little: a long ramp turns the shelf into a pale
    // halo the size of the harbour, which is worse than the ring was.
    float shallowShelf = 1.0 - smoothstep(0.72, 1.5, shoreDistance);

    float cemDist = length((vWaterPosition - uCemeteryCenter) / 4.6);
    float pigDist = length((vWaterPosition - uPigeonnierCenter) / 3.4);
    float isletShelf = (1.0 - smoothstep(0.5, 1.25, cemDist))
      + (1.0 - smoothstep(0.5, 1.25, pigDist));

    // --- W1: banded depth color ---------------------------------------------
    // Depth comes from the shore SDF plus authored bathymetry: two shallow
    // aprons off the island and one deep basin in the open water, then the
    // shallow→deep ramp is posterized into flat ukiyo-e bands.
    // Depth ramps out further now that there is real open sea to ramp into.
    float depth = smoothstep(0.92, 3.8, shoreDistance);
    float shelfA = 1.0 - smoothstep(0.55, 1.25, length(
      (vWaterPosition - uIslandCenter - vec2(-14.0, 10.0)) / vec2(22.0, 12.0)
    ));
    float shelfB = 1.0 - smoothstep(0.55, 1.3, length(
      (vWaterPosition - uIslandCenter - vec2(20.0, -8.0)) / vec2(16.0, 10.0)
    ));
    float basin = 1.0 - smoothstep(0.3, 1.1, length(
      (vWaterPosition - uIslandCenter - vec2(34.0, 30.0)) / vec2(34.0, 24.0)
    ));
    depth = clamp(depth + basin * 0.22, 0.0, 1.0);
    depth *= 1.0 - max(shelfA, shelfB) * 0.42;
    depth *= 1.0 - clamp(isletShelf, 0.0, 1.0) * 0.5;
    float bandIndex = floor(clamp(depth, 0.0, 0.9999) * 4.0);
    vec3 waterColor = bandIndex < 0.5 ? uBandColor[0]
      : bandIndex < 1.5 ? uBandColor[1]
      : bandIndex < 2.5 ? uBandColor[2]
      : uBandColor[3];
    float tonalCurrent = 0.5 + 0.5 * sin(
      dot(vWaterPosition, vec2(0.046, -0.058)) + uTime * 0.027
    );
    waterColor *= 0.97 + tonalCurrent * 0.05;

    // --- W4: drifting cloud shadows -----------------------------------------
    // One world-space noise fetch attenuates the light term; the same texture
    // and transform are shared with land/ship materials (C2(c)) so the weather
    // drifts coherently across the whole garden. Below balanced the strength
    // uniform is 0, so the fetch is skipped by a coherent branch — the term is
    // provably identity there (cloudLight = 1, sun-glitter dapple factor = 1).
    vec2 cloudUv = vec2(vWaterPosition.x, -vWaterPosition.y) * uCloudShadowTransform.xy
      + uCloudShadowTransform.zw;
    float cloudCover = 0.0;
    if (uCloudShadowStrength > 0.001) {
      cloudCover = texture2D(uCloudShadow, cloudUv).r;
    }
    float cloudLight = 1.0 - cloudCover * uCloudShadowStrength;

    // --- facet light ---------------------------------------------------------
    vec3 keyDirection = normalize(vec3(-0.46, 0.2, 0.86));
    float facetLight = clamp(dot(surfaceNormal, keyDirection) * 0.5 + 0.55, 0.2, 1.0);
    waterColor *= (0.95 + facetLight * 0.1) * mix(1.0, cloudLight, 0.9);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(0.0, dot(surfaceNormal, viewDirection)), 3.0);
    vec3 skyReflection = mix(uBaseColor, uHighlightColor, 0.34);
    waterColor = mix(
      waterColor,
      skyReflection,
      fresnel * (0.08 + uDaylight * 0.08 + uNight * 0.04)
    );

    // --- W2: sky env tint ------------------------------------------------------
    // Analytic bokashi gradient sample, stronger toward the frame edges (fake
    // horizon sheen), suppressed over shallow bands, shimmered by the dual
    // scrolling normals. The mirror basin boosts it into a sky reflection.
    float islandDistance = length(vWaterPosition - uIslandCenter);
    float envMask = smoothstep(30.0, 110.0, islandDistance) * (0.2 + 0.8 * depth);
    envMask = max(envMask, harborCalm * 0.75);
    vec3 skySample = mix(
      uEnvHorizonColor,
      uEnvZenithColor,
      clamp(0.25 + envMask * 0.55 + surfaceNormal.x * 0.14, 0.0, 1.0)
    );
    waterColor = mix(
      waterColor,
      skySample,
      clamp(envMask * uEnvStrength * (1.0 + harborCalm * 1.2), 0.0, 0.85)
    );

    // --- B4: island + islet shore foam (V2 lapping kept, W5 rings stay outside)
    // Gentler peak too: the shelf is a depth cue, not a highlight.
    waterColor = mix(waterColor, uShallowColor, shallowShelf * (0.26 - uNight * 0.07));

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
    // Foam stays a crisp waterline accent: broad foam sheets cross the bloom
    // knee at day, so the lapping bands are dimmer than the shore edge and the
    // mix clamps well below the bloom threshold.
    float shoreFoam = (shoreEdge + lapFoam * 0.6) * (0.16 + uDetail * 0.22) * (0.7 + uDaylight * 0.3);
    waterColor = mix(waterColor, uHighlightColor, clamp(shoreFoam, 0.0, 0.34));

    waterColor = mix(waterColor, uShallowColor, clamp(isletShelf, 0.0, 1.0) * (0.3 - uNight * 0.08));
    float isletFoam = (
      smoothstep(0.86, 0.98, cemDist) * (1.0 - smoothstep(0.98, 1.12, cemDist))
      + smoothstep(0.86, 0.98, pigDist) * (1.0 - smoothstep(0.98, 1.12, pigDist))
    ) * (0.55 + 0.45 * sin(shoreAngle * 9.0 - foamMotion));
    waterColor = mix(waterColor, uHighlightColor, clamp(isletFoam, 0.0, 0.35) * (0.3 + uDetail * 0.3));

    // Region reflectivity, hoisted so the mirror column below can ask how
    // mirror-like this stretch of water is.
    float seaReflectivity = 1.0;

    // --- W2 / D5+D6: sea regions as bodies of water ---------------------------
    // Replaces the six overlapping tinted ellipses. The region field is the
    // SAME terrain classification the simulation obeys (finding F6), so the
    // edge drawn here is the edge ships actually respect.
    //
    // A region is carried by its water CHARACTER, not just a tint: depth,
    // foam and reflectivity all shift, so the sea state stays legible without
    // reading hue (D6, accessibility contract).
    {
      vec4 regionSample = texture2D(uRegionField, vRegionUv);
      int regionId = int(regionSample.r * 255.0 + 0.5);
      // S5: the id comes from the point-sampled field; the distance comes from
      // its linear, mipmapped twin. Reading both off one NEAREST texture is
      // what made the tide lines stair-step and crawl at overview zoom.
      float boundaryDistance = texture2D(uRegionDistance, vRegionUv).r;

      vec3 regionTint = uRegionColor[regionId];
      float regionDepth = uRegionParams[regionId].x;
      float regionFoam = uRegionParams[regionId].y;
      float regionReflect = uRegionParams[regionId].z;
      float regionStrength = uRegionParams[regionId].w;

      // Converge with the open-ocean early-out. Without this the region tint
      // stops dead at the cheap-path boundary and the map reads as a hard
      // diamond tile floating on flat sea. Fading the tint (and its foam)
      // toward the boundary makes the two paths meet at the same colour.
      // The fade must begin at the MAP EDGE, not well inside it. uOpenOceanRadius
      // is deliberately wider than the map half-extent (0.56 of the full span vs
      // the 0.5 the map occupies), so 0.80-1.0 of it brackets the shoreline of
      // the world: regions stay fully tinted across the whole playable map and
      // only dissolve past its edge.
      //
      // An earlier ramp started at 0.42 and silently stripped the region tint
      // from the outer half of the map.
      // A long ramp so the sea dissolves into open ocean rather than stopping
      // at a line. Paired with the fog cap in garden-sky.ts, which keeps the
      // boundary from ever resolving at whole-map framing.
      float edgeFade = 1.0 - smoothstep(
        uOpenOceanRadius * 0.62,
        uOpenOceanRadius * 1.0,
        mapDistance
      );
      regionStrength *= edgeFade;
      regionFoam *= edgeFade;
      regionDepth = mix(1.0, regionDepth, edgeFade);
      regionReflect = mix(1.0, regionReflect, edgeFade);
      seaReflectivity = regionReflect;

      // Luminance-match the tint against the live water color so a region
      // reads as water that is a different STATE, not paint on a surface
      // (the Z3 rule, preserved).
      float waterLuma = dot(waterColor, vec3(0.2126, 0.7152, 0.0722));
      float tintLuma = max(dot(regionTint, vec3(0.2126, 0.7152, 0.0722)), 0.03);
      vec3 regionColor = regionTint * clamp(waterLuma * 1.6 / tintLuma, 0.35, 1.15);

      // Soften the join so two regions meet like currents, not like a decal.
      // The ramp is wide on purpose: a narrow one leaves the terrain field's
      // geometric edges reading as ruler lines.
      float blend = smoothstep(0.0, 0.72, boundaryDistance);
      waterColor = mix(waterColor, regionColor, regionStrength * blend);
      waterColor *= mix(1.0, regionDepth, blend);

      // Sky/beacon return: calm water is a mirror, danger water swallows light.
      waterColor = mix(
        waterColor,
        mix(uEnvHorizonColor, uEnvZenithColor, 0.35),
        clamp((regionReflect - 1.0) * 0.22, 0.0, 0.3) * blend * uEnvStrength
      );

      // W2.6 — the boundary itself. A drifting foam/current line where two
      // bodies of water meet: this is what makes a region read as having an
      // edge rather than being a gradient.
      //
      // S1: two terms, not one. The narrow bright line is the tide line where
      // the currents shear; the wider dark term behind it is the shadow under
      // that shear. A single bright line at low weight was invisible at
      // whole-map framing, which is most of why the regions read as a gradient
      // field rather than as separate bodies of water.
      float seam = (1.0 - smoothstep(0.0, 0.14, boundaryDistance)) * edgeFade;
      float seamShadow = (1.0 - smoothstep(0.06, 0.34, boundaryDistance)) * edgeFade;
      float seamWave = 0.55 + 0.45 * sin(
        dot(vWaterPosition, vec2(0.31, 0.24)) - uTime * 0.35 * (0.6 + uTempo)
      );
      waterColor *= 1.0 - seamShadow * 0.12 * uDetail;
      // Not pure foam white: a tide line is a slick, so the highlight is
      // pulled back toward the water it sits on. At full strength the seams
      // read as chalk streaks marbling the whole sea.
      waterColor = mix(
        waterColor,
        mix(uHighlightColor, waterColor, 0.42),
        seam * seamWave * 0.34 * uDetail
      );

      // Whitecaps scale with the band. Danger water is streaked; calm is bare.
      //
      // This MUST be real noise, not a product of sines: sin(a)*sin(b) tiles
      // into a regular diagonal lattice that reads as a shader artifact
      // scrawled across the whole sea.
      // W6.1: the fbm below is the most expensive term in this shader (three
      // octaves of hash noise per fragment). Gate it to genuinely rough
      // water — alert and worse — so it runs on ~8% of the sea instead of
      // nearly all of it. Calm/watch/ledger/open water shows no whitecaps
      // anyway, so this is output-identical where it matters.
      if (regionFoam > 0.3) {
        vec2 capUv = vWaterPosition * 0.34 + vec2(uTime * 0.05 * (0.5 + uTempo), 0.0);
        float capNoise = gardenFbm(capUv);
        // Only the crests break, so the threshold sits high and tightens as
        // the band worsens.
        float capThreshold = mix(0.74, 0.56, clamp(regionFoam, 0.0, 1.0));
        float caps = smoothstep(capThreshold, capThreshold + 0.16, capNoise);
        waterColor = mix(
          waterColor,
          uHighlightColor,
          clamp(caps * regionFoam * blend, 0.0, 0.32) * uDetail
        );
      }
    }

    // --- B2: authored moon road + thresholded night glitter ------------------
    // Coherent day gate: at nightRoad = 0 both terms are provably zero, so the
    // day frame skips the pow/exp/mask ALU entirely (identical output).
    float nightRoad = clamp(uNight + uDusk * 0.5, 0.0, 1.0);
    if (nightRoad > 0.001) {
      vec2 fromIsland = vWaterPosition - uIslandCenter;
      float roadAlong = dot(fromIsland, uMoonDir);
      float roadAcross = dot(fromIsland, vec2(-uMoonDir.y, uMoonDir.x));
      float roadHalfWidth = 6.0;
      float bandProfile = exp(-(roadAcross * roadAcross) / (roadHalfWidth * roadHalfWidth));
      float roadReach = 1.0 - smoothstep(26.0, 140.0, abs(roadAlong));
      float moonBand = bandProfile * roadReach;
      waterColor = mix(waterColor, uMoonRoadColor, moonBand * nightRoad * 0.06);

      vec3 moonLight = normalize(vec3(uMoonDir * 1.15, 0.5));
      vec3 halfMoon = normalize(moonLight + vec3(0.0, 0.0, 1.0));
      float specular = pow(max(0.0, dot(blendedNormal, halfMoon)), 90.0);
      float sparkleField =
        sin(dot(vWaterPosition, vec2(2.3, 3.1)) + blendedNormal.x * 11.0)
        * sin(dot(vWaterPosition, vec2(-3.7, 2.1)) + blendedNormal.y * 9.0);
      float sparkleMask = aaStep(0.35, sparkleField);
      float glitterGate = mix(0.8, 0.68, uSwell);
      float glitter = smoothstep(glitterGate, glitterGate + 0.12, specular)
        * sparkleMask * moonBand * nightRoad;
      waterColor += uMoonRoadColor * clamp(glitter, 0.0, 1.0) * 2.6;
    }

    // --- W3: sun glitter (the daytime moon-road) ------------------------------
    // Thresholded high-exponent Blinn specular on the scrolling normals, pushed
    // HDR so sparse sparkles feed bloom; density scales with seaState and the
    // cloud mask dapples the sunlit patches. The glitter must read as sparse
    // sun-dappled patches, never uniform speckle: the sparkle mask is strict,
    // the high exponent keeps each sparkle tiny, the cloud shadow concentrates
    // glitter into the sunlit gaps, and the fade matches the sky fog band
    // (FOG_NEAR 192 / FOG_FAR 275 in garden-sky) so aerial perspective swallows
    // the far sparkles instead of letting them read as stars at noon.
    // Below balanced uGlitterStrength is 0 — the coherent branch skips the
    // specular and mask work there with identical output.
    //
    // S3: the exponent was 520 with a 0.06-wide gate — a spike far narrower
    // than a pixel, so whether any given fragment caught it was decided by
    // sub-pixel luck. Under camera motion that is not glitter, it is noise: the
    // sparkles read as scattered single-pixel dust and crawled. 120 with a
    // wider gate keeps each sparkle small while giving it enough screen
    // footprint to be sampled honestly, and the mask is now derivative-aware.
    if (uGlitterStrength > 0.001 && uDaylight + uDusk > 0.001) {
      vec3 halfSun = normalize(keyDirection + vec3(0.0, 0.0, 1.0));
      float sunSpecular = pow(max(0.0, dot(blendedNormal, halfSun)), 120.0);
      float sunSparkleField =
        sin(dot(vWaterPosition, vec2(3.1, -2.4)) + blendedNormal.y * 13.0)
        * sin(dot(vWaterPosition, vec2(-2.2, -3.6)) + blendedNormal.x * 10.0);
      float sunSparkleMask = aaStep(0.76, sunSparkleField);
      float sunGate = mix(0.86, 0.76, uSwell);
      float sunGlitter = smoothstep(sunGate, sunGate + 0.14, sunSpecular)
        * sunSparkleMask
        * (uDaylight + uDusk * 0.4)
        * uGlitterStrength;
      sunGlitter *= clamp(1.0 - cloudCover * uCloudShadowStrength * 2.6, 0.0, 1.0);
      sunGlitter *= 1.0 - smoothstep(170.0, 265.0, camDistance);
      waterColor += uSunGlitterColor * clamp(sunGlitter, 0.0, 1.0) * 1.7;
    }

    // --- W5: karesansui ripple rings (C2(d)) -----------------------------------
    // Phase-offset expanding rings around island, islets, and any emitters the
    // other lanes register (dock pylons, moored ships, garden islets). The V2
    // lapping foam stays inside each train's inner radius. Below balanced
    // uRippleStrength is 0 and the whole train is a no-op — skipped coherently.
    if (uRippleStrength > 0.001) {
      float ripple = 0.0;
      for (int ri = 0; ri < ${GARDEN_WATER_MAX_RIPPLE_RINGS}; ri += 1) {
        if (float(ri) >= uRippleCount) break;
        vec4 ring = uRipple[ri];
        vec4 rp = uRippleParams[ri];
        float ringDistance = distance(vWaterPosition, ring.xy);
        if (ringDistance > ring.z + 1.5) continue;
        float innerRadius = ring.z * rp.w;
        for (int rb = 0; rb < 3; rb += 1) {
          if (float(rb) >= rp.x) break;
          float t = fract(uTime / rp.y + ring.w + float(rb) / rp.x);
          float r = mix(innerRadius, ring.z, t);
          float crest = 1.0 - smoothstep(0.0, 0.5 + t * 0.9, abs(ringDistance - r));
          ripple += crest * crest * (1.0 - t) * rp.z;
        }
      }
      ripple = clamp(ripple * uRippleStrength, 0.0, 1.0);
      waterColor = mix(waterColor, uHighlightColor, ripple * (0.1 + uDaylight * 0.06));
    }

    // --- beacon sweeping lane (kept from V1; L5 fade stretched to match the
    // 58-unit beam of the 34-unit Pharos tower — the BEAM_LENGTH coupling is a
    // contract, keep the fade constants with the beam) -----------------------
    vec2 beamDirection = vec2(cos(uBeaconAngle), sin(uBeaconAngle));
    vec2 fromBeacon = vWaterPosition - uBeaconPosition;
    float beamAlong = dot(fromBeacon, beamDirection);
    float beamAcross = abs(dot(fromBeacon, vec2(-beamDirection.y, beamDirection.x)));
    float beamWidth = 0.34 + max(0.0, beamAlong) * 0.029;
    float beamLane = smoothstep(0.0, 2.0, beamAlong)
      * (1.0 - smoothstep(30.0, 52.0, beamAlong))
      * exp(-(beamAcross * beamAcross) / max(0.04, beamWidth * beamWidth));
    float beamRipple = 0.56 + 0.44 * sin(beamAlong * 0.78 - uTime * 0.8 + tonalCurrent * 0.8);
    float beaconReflection = beamLane
      * (0.05 + smoothstep(0.48, 0.9, beamRipple) * 0.12)
      * uBeaconStrength;
    // W6 flame-flicker lane (Pharos Wonder, §3.4): the same CPU flicker that
    // drives the flame, halo, and PointLight breathes through the reflection,
    // and a scrolled fetch of the already-bound cloud noise breaks the lane's
    // cross-section into dancing firelight streaks. All firelight terms sit
    // behind a coherent uniform branch: the banked day flame (D3 — strength
    // ~0.15 at noon) skips every extra fetch, leaving a calm analytic lane.
    if (uBeaconStrength > 0.2) {
      float flickerGlow = 0.62 + 0.76 * uBeaconFlicker;
      vec2 streakUv = vec2(
        beamAlong * 0.021 - uTime * 0.017,
        beamAcross * 0.085 + uTime * 0.004
      );
      float streakNoise = texture2D(uCloudShadow, streakUv).r;
      float streaks = 0.55 + 0.45 * smoothstep(0.18, 0.72, streakNoise);
      beaconReflection *= streaks * flickerGlow;

      // Caustic base glow: firelight lapping at the rock — a warm radial
      // falloff warped by one fetch of the shared cloud noise, gated by night
      // strength x flicker.
      float rockDist = length(vWaterPosition - uIslandCenter - vec2(0.6, -1.2));
      float causticNoise = texture2D(uCloudShadow,
        vWaterPosition * 0.023 + vec2(uTime * 0.004, -uTime * 0.003)).r;
      float caustic = (1.0 - smoothstep(uRockRadius * 0.45, uRockRadius + 6.5, rockDist))
        * (0.45 + 0.55 * causticNoise);
      waterColor += uBeaconColor
        * caustic
        * uBeaconStrength
        * (0.35 + 0.65 * uBeaconFlicker)
        * 0.16;
    }
    waterColor = mix(waterColor, uBeaconColor, clamp(beaconReflection, 0.0, 0.2));

    // --- the Pharos mirror column -------------------------------------------
    // The concept render's signature image: the tower standing upside-down in
    // the water beneath itself, broken into shimmering bands by the swell.
    //
    // In this ortho iso rig the viewer is always in the same direction, so the
    // reflection is a fixed vertical streak in water-local space rather than a
    // real planar pass — no second render, no extra target, a handful of ALU.
    //
    // It obeys the sea it lies on: calm water mirrors (reflectivity 1.5),
    // danger water swallows it (0.42), so the monument's reflection is itself
    // a reading of the water's state.
    {
      vec2 fromTower = vWaterPosition - uBeaconPosition;
      // +local Y runs toward the viewer, so the image hangs "below" the tower.
      float alongColumn = fromTower.y;
      float acrossColumn = abs(fromTower.x);
      // Widens with distance, the way a real reflection frays on moving water.
      float columnWidth = 1.6 + max(0.0, alongColumn) * 0.10;
      float column = smoothstep(0.0, 1.5, alongColumn)
        * (1.0 - smoothstep(16.0, 44.0, alongColumn))
        * exp(-(acrossColumn * acrossColumn) / max(0.05, columnWidth * columnWidth));
      // Break it into horizontal bands: a reflection on water is never solid.
      float bands = 0.45 + 0.55 * smoothstep(
        0.25, 0.85,
        0.5 + 0.5 * sin(alongColumn * 1.35 - uTime * 0.55 + surfaceNormal.x * 5.0)
      );
      // Strongest at dusk and night, when the tower is lit and the sea is dark.
      float columnLight = clamp(uNight + uDusk * 0.85, 0.0, 1.0);
      waterColor = mix(
        waterColor,
        uBeaconColor,
        clamp(column * bands * columnLight * seaReflectivity * 0.34, 0.0, 0.42)
      );
    }

    // --- W6: shoreline foam rings (analytic shore SDF, no depth pass) -------
    // Hard-stepped ukiyo-e outline bands expanding slowly outward through the
    // 0–4 unit near-shore band; frozen at t=0 they hold a composed static
    // pose. Shed with the ripple-ring tier gate (uRippleStrength).
    //
    // S3: "hard-stepped" is the ukiyo-e intent and it stays -- but a bare
    // step() on a spatial sine has no screen-space width, so the bands
    // shimmered along the waterline whenever the camera moved. aaStep keeps the
    // graphic edge and resolves it only where it is undersampled.
    if (uRippleStrength > 0.01) {
      float shoreWorld = length(vWaterPosition - uIslandCenter - vec2(0.6, -1.2))
        - uRockRadius;
      float foamRings = aaStep(0.86, sin(shoreWorld * 3.2 - uTime * 0.5))
        * (1.0 - smoothstep(3.0, 4.0, shoreWorld))
        * aaStep(0.0, shoreWorld);
      waterColor = mix(
        waterColor,
        uHighlightColor,
        foamRings * 0.18 * uRippleStrength * (0.6 + uDaylight * 0.4)
      );
    }

    // --- B3: warm light lanes from the registry --------------------------
    // Field gate: outside the registry's bounding circle every lane fails the
    // 30-unit distSq cull, so skipping the loop there is output-identical and
    // saves one texture fetch per lane per fragment on open water.
    vec2 fieldDelta = vWaterPosition - uLaneField.xy;
    if (dot(fieldDelta, fieldDelta) < uLaneField.z * uLaneField.z) {
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
        float pool = exp(-distSq / 42.0);
        float along = dot(d, streakDir) + tremble;
        float across = dot(d, streakPerp) + tremble * 0.4;
        float streak = exp(-(across * across) / 3.0)
          * exp(-max(0.0, along) * max(0.0, along) / 120.0)
          * step(-2.0, along);
        laneAccum += body.rgb * intensity * (pool * 0.9 + streak * 0.6);
      }
      waterColor += clamp(laneAccum, 0.0, 2.2);
    }

    // W7: far water keeps its color much further out; the fade only blends the
    // extreme edge toward the base so the fog seam stays invisible.
    float distanceFade = smoothstep(150.0, 520.0, camDistance);
    waterColor = mix(waterColor, uBaseColor, distanceFade * (0.08 + uDusk * 0.05 + uNight * 0.04));
    gl_FragColor = vec4(waterColor, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export interface GardenWaterFrame {
  reducedMotion: boolean;
  renderScheduler: Pick<PharosVilleRenderSchedulerState, "tier" | "loadTier">;
  seaState: Pick<SeaState, "swell" | "tempo">;
  timeSeconds: number;
  wallClockHour: number;
}

export interface GardenWater {
  material: ShaderMaterial;
  mesh: Mesh<PlaneGeometry, ShaderMaterial>;
  /** C2(c): shared cloud-shadow sampler for Lane I (island) and Lane S (ships). */
  cloudShadows: GardenCloudShadowSource;
  /** C2(d): karesansui ripple-ring emitter registry (Lanes I/S/Z). */
  rippleRings: GardenRippleRingEmitter;
  /** C4 evidence: whether cloud shadows are shading this frame's tier. */
  cloudShadowsOn: () => boolean;
  setBeaconState: (
    worldX: number,
    worldZ: number,
    angle: number,
    strength: number,
    flicker?: number,
  ) => void;
  /** C2(b): harbor mirror-basin extents (Lane I); a sensible default is active until this is called. */
  setHarborCalmMask: (mask: GardenHarborCalmMask) => void;
  setIslandCenter: (worldX: number, worldZ: number) => void;
  setIsletCenters: (
    cemetery: { x: number; z: number },
    pigeonnier: { x: number; z: number },
  ) => void;
  setLaneState: (
    texture: DataTexture,
    activeLaneCount: number,
    fieldBounds?: { centerX: number; centerZ: number; radius: number },
  ) => void;
  /** C2(a): zone soft-tint path; Lane Z supplies positions/radii/colors. */
  setZoneState: (zones: readonly GardenWaterZoneTint[]) => void;
  update: (frame: GardenWaterFrame) => void;
}

/** Back-compatible alias for the C2 zone-tint shape. */
export type GardenWaterZone = GardenWaterZoneTint;

/**
 * One full-bleed water surface — the Garden Sea. Banded depth color, sky env
 * tint, sun glitter, drifting cloud shadows, and karesansui ripple rings by
 * day; the authored moon road and the shared light-lane registry keep the
 * Lantern Sea identity at night. W6 (Pharos Wonder): the beacon lane breathes
 * with the flame flicker and breaks into scrolled-noise firelight streaks, a
 * warm caustic glow laps the island rock, and hard-stepped foam rings expand
 * through the near-shore band — all on the analytic shore SDF, no depth pass.
 * Reduced motion freezes every animation into one static detailed frame;
 * cloud shadows and glitter ship at balanced+ and ripple rings at full/balanced.
 */
export function createGardenWater(waterLevel: number): GardenWater {
  const baseColor = DAY_MID.clone();
  const deepColor = DAY_DEEP.clone();
  const highlightColor = DAY_HIGHLIGHT.clone();
  const shallowColor = DAY_SHALLOW.clone();
  const bandColors = [DAY_SHALLOW.clone(), DAY_MID.clone(), DAY_MID.clone(), DAY_DEEP.clone()];
  const envHorizonColor = DAY_ENV_HORIZON.clone();
  const envZenithColor = DAY_ENV_ZENITH.clone();
  const sunGlitterColor = DAY_CYCLE_LIGHT_PRESETS.day.dirColor.clone();
  const cloudShadows = createGardenCloudShadowSource();
  const regionField = createSeaRegionTextures();
  // Region character is static data (D6) — colour is resolved per day phase in
  // `update`, but swell/chop/foam/reflectivity never change.
  // Seeded from the fallback table so every slot has a real colour even
  // before (or without) a live theme write — an unset slot renders black.
  const regionColors = SEA_REGION_ORDER.map((name) => new Color(SEA_REGION_FALLBACK_TINT[name]));
  const regionParams = SEA_REGION_ORDER.map((name) => {
    const character = SEA_REGION_CHARACTER[name];
    return new Vector4(
      character.depth,
      character.foam,
      character.reflectivity,
      name === "none" || name === "open" ? 0 : REGION_TINT_STRENGTH,
    );
  });
  const regionSwell = SEA_REGION_ORDER.map((name) => {
    const character = SEA_REGION_CHARACTER[name];
    return new Vector4(character.swell, character.chop, 0, 0);
  });
  // Maps world XY on the water plane into the field's 0-1 UV space.
  //
  // A tile (tx, ty) sits at world (tx*TILE_SCALE, _, ty*TILE_SCALE), and the
  // plane's -90deg X rotation maps world +Z to local -Y — so the V scale is
  // NEGATIVE. Getting this sign wrong mirrors every region about the equator.
  const regionExtent = regionField.tileSpan * TILE_SCALE_UNITS;
  const regionTransform = new Vector4(0, 0, 1 / regionExtent, -1 / regionExtent);
  const uniforms = {
    fogColor: { value: new Color() },
    fogFar: { value: 1_000 },
    fogNear: { value: 1 },
    uBandColor: { value: bandColors },
    uBaseColor: { value: baseColor },
    uBeaconAngle: { value: -0.55 },
    uBeaconColor: { value: BEACON_HIGHLIGHT.clone() },
    uBeaconFlicker: { value: 0.5 },
    uBeaconPosition: { value: new Vector2() },
    uBeaconStrength: { value: 0 },
    uCemeteryCenter: { value: new Vector2(1e4, 1e4) },
    // C2(c): the water material shares the exact uniform objects the cloud
    // source exposes, so land/ship consumers stay in sync by construction.
    uCloudShadow: cloudShadows.uniforms.uCloudShadow,
    uCloudShadowStrength: cloudShadows.uniforms.uCloudShadowStrength,
    uCloudShadowTransform: cloudShadows.uniforms.uCloudShadowTransform,
    uDaylight: { value: 1 },
    uDeepColor: { value: deepColor },
    uDetail: { value: 1 },
    uDusk: { value: 0 },
    uEnvHorizonColor: { value: envHorizonColor },
    uEnvStrength: { value: 0.3 },
    uEnvZenithColor: { value: envZenithColor },
    uGlitterStrength: { value: 1 },
    uHarborCalm: { value: 0.7 },
    uHarborEllipse: { value: new Vector4(0, 0, 1 / 13, 1 / 9) },
    uHighlightColor: { value: highlightColor },
    uIslandCenter: { value: new Vector2() },
    uLaneCount: { value: 0 },
    // Bounding circle (water coords: x, -z, radius) of the active light lanes;
    // a huge default keeps the loop unconditional until the registry supplies
    // real bounds.
    uLaneField: { value: new Vector3(0, 0, 1e5) },
    uLaneTexture: { value: null as DataTexture | null },
    uMoonDir: { value: MOON_DIR.clone() },
    uMoonRoadColor: { value: MOON_ROAD_COLOR.clone() },
    uNight: { value: 0 },
    uNormalMap: { value: loadNormalMap() as Texture | null },
    uPigeonnierCenter: { value: new Vector2(1e4, 1e4) },
    uRipple: {
      value: Array.from({ length: GARDEN_WATER_MAX_RIPPLE_RINGS }, () => new Vector4()),
    },
    uRippleCount: { value: 0 },
    uRippleParams: {
      value: Array.from({ length: GARDEN_WATER_MAX_RIPPLE_RINGS }, () => new Vector4()),
    },
    uRippleStrength: { value: 1 },
    // W6: approximate rock radius of the island's waterline (world units) for
    // the analytic shore SDF behind the caustic glow and foam rings; anchored
    // by setIslandCenter from the island root position.
    uRockRadius: { value: GARDEN_ISLAND_ROCK_RADIUS },
    uShallowColor: { value: shallowColor },
    uSunGlitterColor: { value: sunGlitterColor },
    uSwell: { value: 0 },
    uTempo: { value: 0.2 },
    uTime: { value: 0 },
    uWaveAmplitude: { value: 0.02 },
    // W2 / D5: the sea-region field replaces the six tinted ellipses. One
    // texture, sampled in both stages, carrying the SAME terrain
    // classification the simulation obeys.
    // The map's centre in water-local space, and the half-extent past which
    // no shader feature can contribute. The margin (0.62 of the full span vs
    // the 0.5 the map strictly needs) keeps shore foam and the outermost
    // region blend well inside the detailed path.
    uOpenOceanCenter: {
      value: new Vector2(
        (regionField.tileSpan * TILE_SCALE_UNITS) * 0.5,
        -(regionField.tileSpan * TILE_SCALE_UNITS) * 0.5,
      ),
    },
    uOpenOceanRadius: { value: (regionField.tileSpan * TILE_SCALE_UNITS) * 0.56 },
    uRegionField: { value: regionField.field },
    uRegionDistance: { value: regionField.distance },
    uRegionColor: { value: regionColors },
    uRegionParams: { value: regionParams },
    uRegionSwell: { value: regionSwell },
    uRegionTransform: { value: regionTransform },
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

  // Karesansui ripple-ring emitters (C2(d)). The island and the outlying
  // islets self-register when their centers arrive; other lanes register dock
  // pylons, moored ships, and garden islets through the same API.
  const rippleEmitters = new Map<string, {
    bands: 2 | 3;
    centerX: number;
    centerY: number;
    innerFraction: number;
    periodSeconds: number;
    phase: number;
    radius: number;
    strength: number;
  }>();
  const syncRippleUniforms = () => {
    let index = 0;
    for (const emitter of rippleEmitters.values()) {
      if (index >= GARDEN_WATER_MAX_RIPPLE_RINGS) break;
      uniforms.uRipple.value[index]!.set(
        emitter.centerX,
        emitter.centerY,
        emitter.radius,
        emitter.phase,
      );
      uniforms.uRippleParams.value[index]!.set(
        emitter.bands,
        emitter.periodSeconds,
        emitter.strength,
        emitter.innerFraction,
      );
      index += 1;
    }
    uniforms.uRippleCount.value = index;
  };
  const rippleRings: GardenRippleRingEmitter = {
    setRing(ring) {
      const previous = rippleEmitters.get(ring.id);
      rippleEmitters.set(ring.id, {
        bands: ring.bands,
        centerX: ring.center.x,
        centerY: -ring.center.z,
        innerFraction: previous?.innerFraction ?? 0.5,
        periodSeconds: Math.max(0.001, ring.periodSeconds),
        phase: previous?.phase ?? stablePhase(ring.id),
        radius: Math.max(0.001, ring.radius),
        strength: MathUtils.clamp(ring.strength, 0, 1),
      });
      syncRippleUniforms();
    },
    removeRing(id) {
      if (rippleEmitters.delete(id)) syncRippleUniforms();
    },
    ringCount() {
      return rippleEmitters.size;
    },
  };
  // Internal default emitters use a richer inner-radius so the ring train
  // starts outside the lapping shore foam; lanes overriding by id keep it.
  const setDefaultRing = (
    id: string,
    center: { x: number; z: number },
    radius: number,
    bands: 2 | 3,
    periodSeconds: number,
    strength: number,
    innerFraction: number,
  ) => {
    const previous = rippleEmitters.get(id);
    rippleEmitters.set(id, {
      bands,
      centerX: center.x,
      centerY: -center.z,
      innerFraction,
      periodSeconds,
      phase: previous?.phase ?? stablePhase(id),
      radius,
      strength,
    });
    syncRippleUniforms();
  };

  let harborMaskOverridden = false;
  let cloudShadowsActive = true;
  // S2: previous frame's clock, for the tier-uniform easing in `update`.
  let lastFrameSeconds: number | null = null;

  return {
    material,
    mesh,
    cloudShadows,
    rippleRings,
    cloudShadowsOn() {
      return cloudShadowsActive;
    },
    setBeaconState(worldX, worldZ, angle, strength, flicker = 0.5) {
      uniforms.uBeaconPosition.value.set(worldX, -worldZ);
      uniforms.uBeaconAngle.value = angle;
      uniforms.uBeaconStrength.value = MathUtils.clamp(strength, 0, 1);
      uniforms.uBeaconFlicker.value = MathUtils.clamp(flicker, 0, 1);
    },
    setHarborCalmMask(mask) {
      harborMaskOverridden = true;
      uniforms.uHarborEllipse.value.set(
        mask.center.x,
        -mask.center.z,
        1 / Math.max(0.001, mask.radiusX),
        1 / Math.max(0.001, mask.radiusZ),
      );
      uniforms.uHarborCalm.value = MathUtils.clamp(mask.calmStrength, 0, 1);
    },
    setIslandCenter(worldX, worldZ) {
      // The plane's -90 degree X rotation maps local Y to negative world Z.
      uniforms.uIslandCenter.value.set(worldX, -worldZ);
      // W6: the rock radius rides along with the island anchor so the caustic
      // glow and foam-ring SDF stay glued to the rock if the island moves.
      uniforms.uRockRadius.value = GARDEN_ISLAND_ROCK_RADIUS;
      // I2 default mirror basin: a feathered ellipse off the island's harbor
      // side until Lane I supplies the real harbor SDF extents.
      if (!harborMaskOverridden) {
        uniforms.uHarborEllipse.value.set(worldX + 18, -worldZ - 14, 1 / 13, 1 / 9);
      }
      // Default karesansui train: inner band starts outside the V2 lapping
      // foam (~1.34 SDF units ≈ 25 world units on the long axis).
      setDefaultRing("garden.island", { x: worldX, z: worldZ }, 40, 3, 16, 0.5, 0.65);
    },
    setIsletCenters(cemetery, pigeonnier) {
      uniforms.uCemeteryCenter.value.set(cemetery.x, -cemetery.z);
      uniforms.uPigeonnierCenter.value.set(pigeonnier.x, -pigeonnier.z);
      setDefaultRing("garden.islet.cemetery", cemetery, 12, 2, 11, 0.45, 0.5);
      setDefaultRing("garden.islet.pigeonnier", pigeonnier, 10, 2, 9, 0.45, 0.5);
    },
    setLaneState(texture, activeLaneCount, fieldBounds) {
      uniforms.uLaneTexture.value = texture;
      uniforms.uLaneCount.value = activeLaneCount;
      if (fieldBounds) {
        // The plane's -90 degree X rotation maps world Z to negative water Y.
        uniforms.uLaneField.value.set(
          fieldBounds.centerX,
          -fieldBounds.centerZ,
          Math.max(0, fieldBounds.radius),
        );
      }
    },
    setZoneState(zones) {
      // W2 / D5: zone TINTS are no longer painted as ellipses — the region
      // field carries the geometry. What still arrives here is each band's
      // live colour, which is routed to its region slot so day/dusk/night
      // colour blending and the theme bridge keep working unchanged.
      for (const zone of zones) {
        const slot = zone.regionId;
        if (slot === undefined || slot <= 0 || slot >= SEA_REGION_COUNT) continue;
        regionColors[slot]!.copy(zone.color);
        uniforms.uRegionParams.value[slot]!.w = zone.strength;
      }
    },
    update(frame) {
      // C1: the water consumes the shared day-cycle curve and blend law; no
      // local copy of the phase curve lives in this module anymore.
      const { daylight, dusk, night } = dayCyclePhase(frame.wallClockHour);
      blendDayCycleColor(shallowColor, NIGHT_SHALLOW, DUSK_SHALLOW, DAY_SHALLOW, dusk, daylight);
      blendDayCycleColor(baseColor, NIGHT_MID, DUSK_MID, DAY_MID, dusk, daylight);
      blendDayCycleColor(deepColor, NIGHT_DEEP, DUSK_DEEP, DAY_DEEP, dusk, daylight);
      blendDayCycleColor(highlightColor, NIGHT_HIGHLIGHT, DUSK_HIGHLIGHT, DAY_HIGHLIGHT, dusk, daylight);
      // W1: the shallow→deep ramp is HSV-lerped into four posterized stops.
      bandColors[0]!.copy(shallowColor);
      hslLerpColor(bandColors[1]!, shallowColor, baseColor, 0.55);
      hslLerpColor(bandColors[2]!, baseColor, deepColor, 0.5);
      bandColors[3]!.copy(deepColor);
      // W2/W6: sky env tint follows the bokashi sky presets and becomes
      // moonlight at night; the sun glitter tint follows the light rig.
      blendDayCycleColor(envHorizonColor, NIGHT_ENV_HORIZON, DUSK_ENV_HORIZON, DAY_ENV_HORIZON, dusk, daylight);
      blendDayCycleColor(envZenithColor, NIGHT_ENV_ZENITH, DUSK_ENV_ZENITH, DAY_ENV_ZENITH, dusk, daylight);
      blendDayCycleColor(
        sunGlitterColor,
        DAY_CYCLE_LIGHT_PRESETS.night.dirColor,
        DAY_CYCLE_LIGHT_PRESETS.dusk.dirColor,
        DAY_CYCLE_LIGHT_PRESETS.day.dirColor,
        dusk,
        daylight,
      );
      // Day keeps the env sheen subtle (0.11): at 0.18 the pale horizon tint
      // washed the banded ramp across the whole frame, not just the far band.
      uniforms.uEnvStrength.value = blendPhaseScalar(0.08, 0.13, 0.11, dusk, daylight);

      // S1: `interaction` is a camera-movement signal, not a load tier — the
      // sea reads it as `balanced` so moving the camera no longer strips the
      // water's character. See `seaQualityTier`.
      const tier = seaQualityTier(frame.renderScheduler);
      const balancedOrBetter = tier === "full" || tier === "balanced";
      // Guardrails: sun glitter and cloud shadows ship at balanced+; ripple
      // rings at full/balanced. Lower tiers keep the graceful fallbacks.
      cloudShadows.update({
        reducedMotion: frame.reducedMotion,
        tier,
        timeSeconds: frame.timeSeconds,
      });
      cloudShadowsActive = balancedOrBetter;

      // S2: ease the tier-driven uniforms instead of stepping them.
      //
      // Even with `interaction` neutralised, a load-tier change (balanced ->
      // recovery on a weaker machine, where the ladder's downshift streak is
      // only 2 frames) still swings uDetail 1 -> 0.36 and switches glitter and
      // cloud shadows off. Stepping that is a visible flash; the hysteresis
      // ladder suppresses flapping but cannot make a single crossing invisible.
      // A ~300 ms approach can, and it costs three scalars.
      //
      // Reduced motion must NOT ease: that path renders one static frame and
      // the invariant is that it is a COMPLETE composition, so it snaps to the
      // target and any part-way value would be an accidental pause.
      const targetDetail = detailForTier(tier);
      const targetGlitter = balancedOrBetter ? 1 : 0;
      const targetRipple = balancedOrBetter ? 1 : 0;
      const targetCloud = cloudShadowsActive
        ? blendPhaseScalar(0.12, 0.2, 0.34, dusk, daylight)
        : 0;
      const now = Math.max(0, frame.timeSeconds);
      // Clamped so a tab returning from background does not ease across a
      // multi-second gap, and so the first frame (no previous sample) snaps.
      const deltaSeconds = lastFrameSeconds === null
        ? Number.POSITIVE_INFINITY
        : MathUtils.clamp(now - lastFrameSeconds, 0, 0.25);
      lastFrameSeconds = now;
      const ease = frame.reducedMotion ? 1 : easeFactor(deltaSeconds);

      uniforms.uDetail.value += (targetDetail - uniforms.uDetail.value) * ease;
      uniforms.uGlitterStrength.value
        += (targetGlitter - uniforms.uGlitterStrength.value) * ease;
      uniforms.uRippleStrength.value
        += (targetRipple - uniforms.uRippleStrength.value) * ease;
      const cloudStrength = cloudShadows.uniforms.uCloudShadowStrength;
      cloudStrength.value += (targetCloud - cloudStrength.value) * ease;

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

/**
 * C2(c) cloud-shadow source: a procedural, tileable two-octave value-noise
 * DataTexture scrolled in world-XZ. The water material samples it directly;
 * Lane I/S materials receive the same texture and uniform objects so the same
 * cloud lightens and darkens the whole garden at once.
 */
function createGardenCloudShadowSource(): GardenCloudShadowSource {
  const texture = createCloudNoiseTexture(256);
  const transform: [number, number, number, number] = [
    CLOUD_SHADOW_TEXEL_SCALE,
    CLOUD_SHADOW_TEXEL_SCALE,
    0,
    0,
  ];
  const uniforms: GardenCloudShadowSource["uniforms"] = {
    uCloudShadow: { value: texture },
    uCloudShadowTransform: { value: transform },
    uCloudShadowStrength: { value: 0.34 },
  };
  return {
    texture,
    uniforms,
    update({ reducedMotion, tier, timeSeconds }) {
      // Drift only advances at balanced+ with motion allowed; reduced motion
      // freezes the sky exactly where it was (static detailed frame).
      if (reducedMotion) return;
      if (tier !== "full" && tier !== "balanced") return;
      transform[2] = Math.max(0, timeSeconds) * CLOUD_SHADOW_DRIFT_X;
      transform[3] = Math.max(0, timeSeconds) * CLOUD_SHADOW_DRIFT_Z;
    },
  };
}

function createCloudNoiseTexture(size: number): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Tileable value noise: lattice frequencies divide the texture size.
      const fbm = valueNoise(x, y, size, 4) * 0.55
        + valueNoise(x, y, size, 8) * 0.3
        + valueNoise(x, y, size, 16) * 0.15;
      // Shape into soft cloud blobs with open sky between them.
      const cover = MathUtils.clamp((fbm - 0.42) / 0.34, 0, 1);
      const value = Math.round(cover * cover * (3 - 2 * cover) * 255);
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function valueNoise(x: number, y: number, size: number, cells: number): number {
  const scale = cells / size;
  const gx = x * scale;
  const gy = y * scale;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wrap = (v: number) => ((v % cells) + cells) % cells;
  const a = latticeHash(wrap(ix), wrap(iy), cells);
  const b = latticeHash(wrap(ix + 1), wrap(iy), cells);
  const c = latticeHash(wrap(ix), wrap(iy + 1), cells);
  const d = latticeHash(wrap(ix + 1), wrap(iy + 1), cells);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function latticeHash(ix: number, iy: number, seed: number): number {
  let hash = (ix * 374761393 + iy * 668265263 + seed * 2246822519) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 0xffffffff;
}

function stablePhase(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

const scratchHslA = { h: 0, s: 0, l: 0 };
const scratchHslB = { h: 0, s: 0, l: 0 };

/** Shortest-path HSL lerp so the band ramp travels hue smoothly (turquoise→blue→indigo). */
function hslLerpColor(target: Color, from: Color, to: Color, t: number): void {
  from.getHSL(scratchHslA);
  to.getHSL(scratchHslB);
  let hueDelta = scratchHslB.h - scratchHslA.h;
  if (hueDelta > 0.5) hueDelta -= 1;
  if (hueDelta < -0.5) hueDelta += 1;
  target.setHSL(
    (scratchHslA.h + hueDelta * t + 1) % 1,
    scratchHslA.s + (scratchHslB.s - scratchHslA.s) * t,
    scratchHslA.l + (scratchHslB.l - scratchHslA.l) * t,
  );
}

function blendPhaseScalar(
  night: number,
  dusk: number,
  day: number,
  duskMix: number,
  daylightMix: number,
): number {
  const duskValue = night + (dusk - night) * duskMix;
  return duskValue + (day - duskValue) * daylightMix;
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

/**
 * S2: how far to travel toward a tier target this frame.
 *
 * Frame-rate independent exponential approach — `1 - e^(-rate * dt)` — so the
 * ~300 ms settle is the same at 30 fps and at 144 fps. A non-finite delta (the
 * first frame, or a resume from a backgrounded tab) returns 1, which snaps.
 */
const TIER_EASE_RATE = 12;

function easeFactor(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds)) return 1;
  return 1 - Math.exp(-TIER_EASE_RATE * deltaSeconds);
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
