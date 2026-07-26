import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
  type DataTexture,
} from "three";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import { HARBOR_PALETTE } from "../systems/palette";
import { stableUnit } from "./garden-util";

/**
 * W4 — The living fire of the Pharos (Pharos Wonder plan §3.2, decisions
 * D2/D3/D5/D6). Replaces the old "glowing sphere" beacon with an open-brazier
 * fire: a posterized toon flame on two crossed camera-facing quads, a GPU
 * ember spiral, an instanced smoke plume (day = grey-blue daymark column, the
 * Pharos's historical daytime signal; night = thin dark wisp backlit by the
 * flame), and the legendary bronze mirror dish (D4 artistic license).
 *
 * One shared uniforms block (uTime/uFlicker/uIntensity) drives flame, embers,
 * and smoke so the whole fire breathes together. uFlicker is a deterministic
 * 3-sine + hash function of timeSeconds computed once per frame on the CPU —
 * no Math.random, no wall clock; uTime freezes at 0 under reduced motion, so
 * the t=0 state is a deliberate composed pose (static flame frame, parked
 * puffs, fixed embers).
 *
 * Frame discipline: zero per-frame allocation (all particles are GPU-driven
 * from seed attributes, like the existing beam dust). Counts shed per
 * scheduler tier via draw range / instance count — never reallocated.
 */

// C1: every colour derives from HARBOR_PALETTE. The flame's outer band spends
// the one reserved vermillion accent exactly where it belongs (D6).
const P = HARBOR_PALETTE;
const palette = (hex: string): Color => new Color(hex);
const FLAME_CORE = palette(P.sun_day_warm);
const FLAME_MID = palette(P.lantern_glow);
const FLAME_OUTER = palette(P.vermillion);
const EMBER_HOT = palette(P.foam_white);
const EMBER_MID = palette(P.lantern_glow);
const EMBER_COOL = palette(P.vermillion);
const SMOKE_DAY_LIGHT = palette(P.fog_pale);
const SMOKE_DAY_DARK = palette(P.fog_blue);
const SMOKE_NIGHT = palette(P.deep_sea_1).lerp(palette(P.fog_blue), 0.3);
const SMOKE_BACKLIGHT = palette(P.lantern_glow);
const MIRROR_BRONZE = palette(P.timber_mid).lerp(palette(P.iron_dark), 0.35);

const FLAME_WIDTH = 2.4;
const FLAME_HEIGHT = 2.9;
const EMBER_COUNT = 32;
const SMOKE_COUNT = 16;
// The fire sits slightly toward the fixed camera (+X/+Z azimuth) so it reads
// in front of the crowning statue, which shares the brazier's centre axis.
const FIRE_FORWARD_X = 0.42;
const FIRE_FORWARD_Z = 0.42;
// Smoke drifts with the same slow diagonal the sky mist rides
// (garden-sky.ts: position.x += drift, position.z -= drift).
const WIND_X = Math.SQRT1_2;
const WIND_Z = -Math.SQRT1_2;

export interface BeaconFireUniforms {
  uFlicker: { value: number };
  uIntensity: { value: number };
  uTime: { value: number };
}

export interface GardenBeaconFireUpdate {
  /** PSI stress — scales the flicker amplitude (D5). */
  psiStress: number;
  reducedMotion: boolean;
  timeSeconds: number;
}

export interface GardenBeaconFire {
  /** Small bronze dish beside the brazier; the day-cycle drives its glint. */
  mirrorMaterial: MeshStandardMaterial;
  root: Group;
  /** Posterized 2-band smoke; the day-cycle drives uDayMix/uOpacity (D3). */
  smokeMaterial: ShaderMaterial;
  uniforms: BeaconFireUniforms;
  dispose: () => void;
  setTier: (tier: PharosVilleRenderSchedulerTier) => void;
  /** Advances uTime/uFlicker and the flame's breathing scale; returns flicker. */
  update: (input: GardenBeaconFireUpdate) => number;
}

export function createGardenBeaconFire(cloudNoise: DataTexture): GardenBeaconFire {
  const root = new Group();
  root.name = "lighthouse-beacon-fire";
  const uniforms: BeaconFireUniforms = {
    uFlicker: { value: 0.5 },
    uIntensity: { value: 0 },
    uTime: { value: 0 },
  };

  const flame = createFlame(uniforms);
  flame.position.set(FIRE_FORWARD_X, 0, FIRE_FORWARD_Z);
  root.add(flame);

  const embers = createEmbers(uniforms);
  embers.position.set(FIRE_FORWARD_X, 0, FIRE_FORWARD_Z);
  root.add(embers);

  const smoke = createSmoke(uniforms, cloudNoise);
  smoke.position.set(FIRE_FORWARD_X * 0.6, 0, FIRE_FORWARD_Z * 0.6);
  root.add(smoke);

  const mirror = createMirror();
  root.add(mirror);

  return {
    dispose() {
      flame.geometry.dispose();
      flame.material.dispose();
      embers.geometry.dispose();
      embers.material.dispose();
      smoke.geometry.dispose();
      smoke.material.dispose();
      mirror.geometry.dispose();
      mirrorMaterial(mirror).dispose();
    },
    mirrorMaterial: mirrorMaterial(mirror),
    root,
    setTier(tier) {
      // Ember counts shed via draw range; smoke via instance count. The flame
      // itself never sheds — it is the beacon at every tier above the floor.
      const emberCount = tier === "full" ? EMBER_COUNT : tier === "balanced" ? 12 : 0;
      embers.visible = emberCount > 0;
      embers.geometry.setDrawRange(0, emberCount);
      const smokeCount = tier === "full" ? SMOKE_COUNT : tier === "balanced" ? 8 : 0;
      smoke.visible = smokeCount > 0;
      smoke.count = smokeCount;
    },
    smokeMaterial: smoke.material,
    uniforms,
    update({ psiStress, reducedMotion, timeSeconds }) {
      const time = reducedMotion ? 0 : Math.max(0, timeSeconds);
      uniforms.uTime.value = time;
      // Deterministic flicker: three detuned sines plus a stepped hash jitter,
      // amplitude widened by PSI stress so a stressed harbour reads as a
      // harder-burning fire (D5). Frozen at the t=0 pose under reduced motion.
      const amplitude = 0.24 + Math.min(1, Math.max(0, psiStress)) * 0.2;
      const wave = Math.sin(time * 7.3) * 0.5
        + Math.sin(time * 11.7 + 1.3) * 0.3
        + Math.sin(time * 3.1 + 4.2) * 0.2;
      const step = Math.floor(time * 9);
      const jitter = fract(Math.sin(step * 12.9898) * 43758.5453) - 0.5;
      const flicker = clamp01(
        0.5 + wave * amplitude + jitter * amplitude * 0.7,
      );
      uniforms.uFlicker.value = flicker;
      // The old beacon pulse, reborn as the flame's breathing.
      flame.scale.set(
        1 + (flicker - 0.5) * 0.1,
        1 + (flicker - 0.5) * 0.16,
        1,
      );
      return flicker;
    },
  };
}

function mirrorMaterial(mirror: Mesh): MeshStandardMaterial {
  return mirror.material as MeshStandardMaterial;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

/**
 * The toon flame: two crossed quads (second at 45° about Y) pre-faced to the
 * fixed isometric camera azimuth, merged into a single 4-triangle geometry.
 * Value-noise fbm scrolls upward inside a teardrop mask and posterizes into
 * three flat bands — cream core, lantern-glow mid, vermillion edge. HDR head
 * lands ~2.3 at full night intensity so the existing UnrealBloomPass picks it
 * up over its 0.9–0.95 knee while the banked day flame stays subtle.
 */
function createFlame(uniforms: BeaconFireUniforms): Mesh<BufferGeometry, ShaderMaterial> {
  const geometry = createCrossedQuadGeometry(FLAME_WIDTH, FLAME_HEIGHT);
  const material = new ShaderMaterial({
    blending: NormalBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorCore;
      uniform vec3 uColorMid;
      uniform vec3 uColorOuter;
      uniform float uFlicker;
      uniform float uIntensity;
      uniform float uTime;
      varying vec2 vUv;

      float flameHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float flameNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(flameHash(cell), flameHash(cell + vec2(1.0, 0.0)), u.x),
          mix(flameHash(cell + vec2(0.0, 1.0)), flameHash(cell + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float flameFbm(vec2 p) {
        // Two octaves suffice: the posterized toon bands hide the third.
        float sum = flameNoise(p) * 0.66;
        sum += flameNoise(p * 2.03 + 17.7) * 0.34;
        return sum;
      }

      void main() {
        float rise = uTime * 1.35;
        float n = flameFbm(vec2(vUv.x * 3.0, vUv.y * 2.2 - rise));
        n = n * 0.72 + 0.28 * flameFbm(vec2(vUv.x * 6.5 + 13.7, vUv.y * 5.0 - rise * 1.7));

        // Teardrop/egg mask: broad belly low, pinched tip high, centreline
        // swayed by the noise field and the CPU flicker.
        float sway = (n - 0.5) * 0.22 * vUv.y + (uFlicker - 0.5) * 0.07 * vUv.y;
        float cx = abs(vUv.x - 0.5 + sway);
        float width = 0.34 * (1.0 - vUv.y * 0.58)
          * (0.35 + 0.65 * smoothstep(0.0, 0.18, vUv.y));
        width *= 1.0 - smoothstep(0.55, 1.0, vUv.y) * 0.75;
        float body = 1.0 - smoothstep(width * 0.55, width, cx);
        float flame = clamp(body * (0.75 + n * 0.5) + (n - 0.5) * 0.25 * vUv.y, 0.0, 1.0);
        flame *= smoothstep(0.0, 0.06, vUv.y);

        // Posterize into three flat bands with hard toon edges.
        float mid = step(0.30, flame);
        float core = step(0.62, flame);
        vec3 color = uColorOuter;
        color = mix(color, uColorMid, mid);
        color = mix(color, uColorCore, core);
        float alpha = step(0.08, flame) * 0.96;
        if (alpha < 0.01) discard;

        float hdr = uIntensity * 0.32 * (0.88 + uFlicker * 0.3);
        // Band-shaped gain: only the cream core burns hot enough to bloom;
        // the gold mid and vermillion edge stay near 1.0 so the posterized
        // bands keep their hue instead of blowing to a white column.
        float gain = mix(0.45, 0.62, mid) + core * 0.75;
        gl_FragColor = vec4(color * (hdr * gain), alpha);
      }
    `,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
    uniforms: {
      ...uniforms,
      uColorCore: { value: FLAME_CORE },
      uColorMid: { value: FLAME_MID },
      uColorOuter: { value: FLAME_OUTER },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "lighthouse-flame";
  return mesh;
}

/**
 * Two quads crossed at 45° about Y, the first pre-faced to the fixed camera
 * azimuth (π/4). Base edge sits at local y=0 (the brazier's ember bed).
 */
function createCrossedQuadGeometry(width: number, height: number): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const angle of [Math.PI / 4, Math.PI / 2]) {
    const axisX = Math.cos(angle) * width * 0.5;
    const axisZ = -Math.sin(angle) * width * 0.5;
    const base = positions.length / 3;
    positions.push(
      -axisX, 0, -axisZ,
      axisX, 0, axisZ,
      axisX, height, axisZ,
      -axisX, height, -axisZ,
    );
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Ember spiral: one THREE.Points, fully GPU-driven from per-point seeds —
 * age = fract(uTime·speed + seed), spiralling out and up while the point
 * shrinks; colour ramps white → lantern gold → vermillion by age, HDR only at
 * birth. Same zero-allocation contract as the beam dust.
 */
function createEmbers(uniforms: BeaconFireUniforms): Points<BufferGeometry, ShaderMaterial> {
  const positions: number[] = [];
  const seeds: number[] = [];
  for (let index = 0; index < EMBER_COUNT; index += 1) {
    positions.push(0, 0, 0);
    seeds.push(
      stableUnit(`beacon-ember-p.${index}`),
      stableUnit(`beacon-ember-s.${index}`),
      stableUnit(`beacon-ember-r.${index}`),
      stableUnit(`beacon-ember-a.${index}`),
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 4));
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorCool;
      uniform vec3 uColorHot;
      uniform vec3 uColorMid;
      uniform float uIntensity;
      varying float vAge;

      void main() {
        float soft = 1.0 - smoothstep(0.12, 0.5, length(gl_PointCoord - 0.5));
        if (soft < 0.02) discard;
        vec3 color = mix(uColorHot, uColorMid, smoothstep(0.0, 0.45, vAge));
        color = mix(color, uColorCool, smoothstep(0.4, 1.0, vAge));
        float hdr = mix(2.2, 0.5, vAge) * (0.3 + uIntensity * 0.12);
        gl_FragColor = vec4(color * hdr, soft);
      }
    `,
    toneMapped: false,
    transparent: true,
    uniforms: {
      ...uniforms,
      uColorCool: { value: EMBER_COOL },
      uColorHot: { value: EMBER_HOT },
      uColorMid: { value: EMBER_MID },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      varying float vAge;

      void main() {
        float age = fract(uTime * (0.2 + aSeed.y * 0.22) + aSeed.x);
        float angle = aSeed.w * 6.2831 + age * (2.0 + aSeed.z * 3.0);
        float radius = mix(0.12, 0.72, age) * (0.4 + aSeed.z * 0.6);
        vec3 p = vec3(cos(angle) * radius, 0.12 + age * 2.6, sin(angle) * radius);
        vAge = age;
        gl_PointSize = mix(4.5, 1.2, age);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
  });
  const points = new Points(geometry, material);
  points.name = "lighthouse-embers";
  points.frustumCulled = false;
  return points;
}

/**
 * Smoke plume: one InstancedMesh of small camera-facing quads, age-from-uTime
 * in the vertex shader (no CPU sim), rising and drifting on the sky-mist wind
 * diagonal. The fragment alpha-erodes against the shared cloud-noise texture
 * (the same texture object the water shader binds — one noise source for the
 * whole garden). Day identity (D3): a proud cool grey-blue column posterized
 * into two flat tonal bands with hard cutout edges, ukiyo-e style; by night a
 * thin dark wisp backlit by the flame. Normal blending, depthWrite off, quads
 * kept small against overdraw.
 */
function createSmoke(
  uniforms: BeaconFireUniforms,
  cloudNoise: DataTexture,
): InstancedMesh<BufferGeometry, ShaderMaterial> {
  const geometry = new PlaneGeometry(1.6, 1.6);
  geometry.rotateY(Math.PI / 4);
  const seeds: number[] = [];
  for (let index = 0; index < SMOKE_COUNT; index += 1) {
    seeds.push(stableUnit(`beacon-smoke.${index}`));
  }
  geometry.setAttribute("aSeed", new InstancedBufferAttribute(new Float32Array(seeds), 1));
  const material = new ShaderMaterial({
    blending: NormalBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uBacklight;
      uniform vec3 uDayDark;
      uniform vec3 uDayLight;
      uniform float uDayMix;
      uniform sampler2D uNoise;
      uniform vec3 uNight;
      uniform float uOpacity;
      uniform float uTime;
      varying float vAge;
      varying float vSeed;
      varying vec2 vUv;

      void main() {
        float mask = smoothstep(0.5, 0.3, length(vUv - 0.5));
        float n = texture2D(
          uNoise,
          vUv * 0.85 + vSeed * 7.31 + vec2(uTime * 0.006, -vAge * 0.22)
        ).r;
        // Alpha-erosion dissolve: the puff breaks up as it ages.
        float erode = smoothstep(vAge * 0.85, vAge * 0.85 + 0.3, n);
        float alpha = mask * erode * uOpacity;
        if (alpha < 0.004) discard;
        // Ukiyo-e two-tone: a hard step splits the puff into flat bands.
        float band = step(0.42, n);
        vec3 dayColor = mix(uDayDark, uDayLight, band);
        vec3 color = mix(uNight, dayColor, uDayMix);
        color += uBacklight * (1.0 - band) * (1.0 - uDayMix) * 0.3;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
    uniforms: {
      ...uniforms,
      uBacklight: { value: SMOKE_BACKLIGHT },
      uDayDark: { value: SMOKE_DAY_DARK },
      uDayLight: { value: SMOKE_DAY_LIGHT },
      uDayMix: { value: 0 },
      uNight: { value: SMOKE_NIGHT },
      uNoise: { value: cloudNoise },
      uOpacity: { value: 0 },
      uWind: { value: new Vector2(WIND_X, WIND_Z) },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform vec2 uWind;
      varying float vAge;
      varying float vSeed;
      varying vec2 vUv;

      void main() {
        float age = fract(uTime * (0.05 + aSeed * 0.028) + aSeed * 7.13);
        vec3 center = vec3(0.0, 0.3 + age * 7.2, 0.0);
        center.x += uWind.x * age * age * 5.5 + sin(aSeed * 40.0 + age * 3.0) * 0.3;
        center.z += uWind.y * age * age * 5.5;
        float scale = mix(0.55, 1.9, age);
        vAge = age;
        vSeed = aSeed;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(center + position * scale, 1.0);
      }
    `,
  });
  const mesh = new InstancedMesh(geometry, material, SMOKE_COUNT);
  mesh.name = "lighthouse-smoke";
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * The legendary Pharos mirror (D4 artistic license): a tiny burnished-bronze
 * dish beside the brazier, tilted up toward the sun so its day-only emissive
 * glint (driven by the day-cycle) blooms briefly.
 */
function createMirror(): Mesh {
  const geometry = new CylinderGeometry(0.3, 0.12, 0.1, 12);
  const material = new MeshStandardMaterial({
    color: MIRROR_BRONZE,
    emissive: HARBOR_PALETTE.lantern_glow,
    emissiveIntensity: 0,
    metalness: 0.9,
    roughness: 0.22,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "lighthouse-mirror";
  mesh.position.set(0.95, -0.5, 0.7);
  // Open face tipped from straight-up toward the day key sun (-35, 48, -30).
  const face = new Vector3(-0.35, 1.15, -0.3).normalize();
  mesh.quaternion.copy(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), face),
  );
  return mesh;
}
