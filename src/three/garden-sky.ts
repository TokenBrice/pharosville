import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  Fog,
  RGBAFormat,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from "three";
import {
  blendDayCycleColor,
  DAY_CYCLE_SKY_PRESETS,
  DUSK_EMBER_COLOR,
  MOON_COLOR,
  STAR_COLOR,
  type DayCyclePhase,
} from "./garden-day-cycle";

const DOME_RADIUS = 300;
const STAR_COUNT = 720;
// P2 aerial perspective: the fog ladder is tuned to the default ortho
// framing (1440×960, zoom 0.78, elevation 30° — ground-plane depth spans
// ~121–255 world units bottom→top). The island (depth ~155–195, lighthouse
// crown ~165) stays below FOG_NEAR at full color; midground ships
// (~195–225) lift gently; the Z4 horizon cards (~232) and the frame-top far
// water (~244) sit at 0.4–0.65 fog so the sea dissolves into the C1 horizon
// band — the bokashi seam where far water meets sky. Zooming out only
// deepens the haze toward FOG_FAR; zooming in (explore) shrinks the span
// below FOG_NEAR so close-ups stay crisp.
const FOG_NEAR = 192;
const FOG_FAR = 275;
// W6.6 (Grand Scale Revamp): the ladder above was calibrated for ONE framing
// (1440x960 at zoom 0.78). The revamp made the world worth zooming out for —
// 187 ships across the whole sea — and at wide zoom the ground plane spans far
// more depth, so most of the frame fell past FOG_FAR and the day read as a
// white-out. The range now scales with the camera's view span so aerial
// perspective stays a depth cue instead of becoming a haze wall.
//
// Reference view height at the calibration framing, used as the scale pivot.
const FOG_REFERENCE_VIEW_HEIGHT = 34;
const FOG_MIN_SCALE = 1;
// Capped at 1.5, not 2.6. W6.6 scaled fog with the view to stop noon becoming
// a white-out, but at whole-map framing a 2.6x scale pushed FOG_NEAR out to
// ~500 units — well past the far edge of a 158-unit world — so no fog reached
// the boundary at all and the map resolved as a hard-edged diamond slab
// floating in a void. The cap keeps the aerial perspective honest at close
// zoom AND keeps the world's edge dissolving at wide zoom.
const FOG_MAX_SCALE = 1.5;

// The moon sits upper-left of the standard framing; V2's moon road aligns its
// water glitter band to this azimuth.
export const GARDEN_MOON_AZIMUTH = Math.PI * 0.62;
const MOON_ELEVATION = Math.PI * 0.34;

export interface GardenSkyFrame {
  reducedMotion: boolean;
  /** Camera view height in world units; drives the fog-range scale (W6.6). */
  viewHeight: number;
  targetX: number;
  targetZ: number;
  timeSeconds: number;
}

export interface GardenSky {
  dispose: () => void;
  fog: Fog;
  moonAzimuth: number;
  root: Group;
  update: (phase: DayCyclePhase, frame: GardenSkyFrame) => void;
}

function createDome(): {
  material: ShaderMaterial;
  mesh: Mesh<SphereGeometry, ShaderMaterial>;
} {
  const zenith = DAY_CYCLE_SKY_PRESETS.night.zenith.clone();
  const horizon = DAY_CYCLE_SKY_PRESETS.night.horizon.clone();
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    fog: false,
    side: BackSide,
    uniforms: {
      uEmberColor: { value: DUSK_EMBER_COLOR.clone() },
      uEmberStrength: { value: 0 },
      uHorizon: { value: horizon },
      uZenith: { value: zenith },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      varying float vHeight;
      void main() {
        vDir = normalize(position);
        vHeight = vDir.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uEmberColor;
      uniform float uEmberStrength;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      varying vec3 vDir;
      varying float vHeight;
      void main() {
        float t = smoothstep(-0.06, 0.7, vHeight);
        vec3 color = mix(uHorizon, uZenith, t);
        // Faint brightening right at the horizon band.
        float glow = smoothstep(0.16, -0.04, abs(vHeight)) * 0.12;
        color += uHorizon * glow;
        // G4 ember west band: a warm azimuthal glow where the sun sets, so the
        // dusk frame reads as its own state instead of dimmed night. The band
        // faces away from the isometric camera (frame-centre far horizon).
        float west = pow(max(0.0, dot(normalize(vec3(vDir.x, 0.0, vDir.z)), vec3(-0.7071, 0.0, -0.7071))), 2.5);
        float band = smoothstep(0.42, 0.02, abs(vHeight - 0.06));
        color += uEmberColor * west * band * uEmberStrength;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const mesh = new Mesh(new SphereGeometry(DOME_RADIUS, 32, 16), material);
  mesh.name = "garden-sky-dome";
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  return { material, mesh };
}

function createStars(): { material: ShaderMaterial; points: Points } {
  const positions = new Float32Array(STAR_COUNT * 3);
  const phases = new Float32Array(STAR_COUNT);
  // Deterministic scatter across the upper hemisphere so the field is stable
  // across reloads.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const u = rand();
    const v = rand() * 0.82 + 0.06; // bias above the horizon
    const theta = u * Math.PI * 2;
    const phi = Math.acos(v);
    const r = DOME_RADIUS * 0.94;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    phases[i] = rand();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    fog: false,
    transparent: true,
    uniforms: {
      uColor: { value: STAR_COLOR.clone() },
      uOpacity: { value: 0 },
      uSize: { value: 2.2 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      uniform float uSize;
      uniform float uTime;
      varying float vTwinkle;
      void main() {
        vTwinkle = 0.55 + 0.45 * sin(uTime * 1.4 + aPhase * 6.2831853);
        gl_PointSize = uSize * (0.7 + vTwinkle * 0.6);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = smoothstep(0.5, 0.0, d) * vTwinkle * uOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  const points = new Points(geometry, material);
  points.name = "garden-sky-stars";
  points.renderOrder = -1;
  points.frustumCulled = false;
  return { material, points };
}

function createMoon(): { group: Group; halo: MeshBasicMaterial } {
  const group = new Group();
  group.name = "garden-sky-moon";
  const disc = new Mesh(
    new SphereGeometry(7, 20, 14),
    new MeshBasicMaterial({ color: MOON_COLOR.clone(), fog: false, toneMapped: false }),
  );
  disc.renderOrder = -1;
  const haloMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: MOON_COLOR.clone(),
    depthWrite: false,
    fog: false,
    opacity: 0.2,
    toneMapped: false,
    transparent: true,
  });
  const halo = new Mesh(new SphereGeometry(16, 20, 14), haloMaterial);
  halo.renderOrder = -1;
  group.add(halo, disc);
  group.position.set(
    Math.cos(MOON_ELEVATION) * Math.cos(GARDEN_MOON_AZIMUTH) * DOME_RADIUS * 0.82,
    Math.sin(MOON_ELEVATION) * DOME_RADIUS * 0.82,
    Math.cos(MOON_ELEVATION) * Math.sin(GARDEN_MOON_AZIMUTH) * DOME_RADIUS * 0.82,
  );
  group.renderOrder = -1;
  return { group, halo: haloMaterial };
}

function createMist(): { material: MeshBasicMaterial; mesh: Mesh } {
  const material = new MeshBasicMaterial({
    alphaMap: createMistFalloffTexture(),
    blending: AdditiveBlending,
    color: DAY_CYCLE_SKY_PRESETS.dusk.fog.clone(),
    depthWrite: false,
    fog: false,
    opacity: 0,
    transparent: true,
  });
  // One low, faint band drifting across the far water at dawn/dusk. Vertical
  // plane rotated to face the fixed isometric camera; kept far behind the
  // island so it softens the distance without milking the scene.
  const mesh = new Mesh(new PlaneGeometry(320, 9), material);
  mesh.name = "garden-sky-mist";
  mesh.rotation.y = Math.PI / 4;
  mesh.position.set(-72, 3.4, -72);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return { material, mesh };
}

/**
 * L8: a soft falloff for the dawn/dusk mist band.
 *
 * The band was a bare PlaneGeometry with uniform opacity, so at night it drew a
 * hard-edged rectangle across the upper sky — visible in any whole-map capture
 * once you look for it. Fading the edges to nothing makes it read as haze.
 */
function createMistFalloffTexture(): DataTexture {
  const width = 64;
  const height = 16;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      // Smooth to zero at both ends of both axes.
      const across = Math.sin(Math.PI * v) ** 1.4;
      const along = Math.sin(Math.PI * u) ** 0.7;
      const alpha = Math.round(Math.max(0, Math.min(1, across * along)) * 255);
      const index = (y * width + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = alpha;
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export function createGardenSky(): GardenSky {
  const root = new Group();
  root.name = "garden-sky";
  const dome = createDome();
  const stars = createStars();
  const moon = createMoon();
  const mist = createMist();
  root.add(dome.mesh, stars.points, moon.group, mist.mesh);

  const fog = new Fog(DAY_CYCLE_SKY_PRESETS.night.fog.clone(), FOG_NEAR, FOG_FAR);

  return {
    dispose() {
      dome.mesh.geometry.dispose();
      dome.mesh.material.dispose();
      stars.points.geometry.dispose();
      stars.material.dispose();
      mist.mesh.geometry.dispose();
      mist.material.dispose();
      moon.group.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          (object.material as MeshBasicMaterial).dispose();
        }
      });
    },
    fog,
    moonAzimuth: GARDEN_MOON_AZIMUTH,
    root,
    update(phase, frame) {
      root.position.set(frame.targetX, 0, frame.targetZ);
      // Push the haze back as the view widens (W6.6).
      const fogScale = Math.max(
        FOG_MIN_SCALE,
        Math.min(FOG_MAX_SCALE, frame.viewHeight / FOG_REFERENCE_VIEW_HEIGHT),
      );
      fog.near = FOG_NEAR * fogScale;
      fog.far = FOG_FAR * fogScale;
      const { daylight, dusk, night } = phase;
      const skyPresets = DAY_CYCLE_SKY_PRESETS;
      const zenith = dome.material.uniforms.uZenith.value as Color;
      const horizon = dome.material.uniforms.uHorizon.value as Color;
      blendDayCycleColor(zenith, skyPresets.night.zenith, skyPresets.dusk.zenith, skyPresets.day.zenith, dusk, daylight);
      blendDayCycleColor(horizon, skyPresets.night.horizon, skyPresets.dusk.horizon, skyPresets.day.horizon, dusk, daylight);
      blendDayCycleColor(fog.color, skyPresets.night.fog, skyPresets.dusk.fog, skyPresets.day.fog, dusk, daylight);
      // Ember west band owns the dusk horizon; it stays out of day and night.
      dome.material.uniforms.uEmberStrength.value = dusk * (1 - daylight) * 0.55;

      const starOpacity = Math.min(1, dusk * 0.35 + night);
      stars.material.uniforms.uOpacity.value = starOpacity;
      stars.material.uniforms.uTime.value = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      stars.points.visible = starOpacity > 0.01;

      const moonPresence = Math.min(1, dusk * 0.5 + night);
      moon.group.visible = moonPresence > 0.02;
      moon.halo.opacity = 0.08 + night * 0.28;

      // Dawn/dusk mist: faint, low, and slowly drifting; frozen under
      // reduced motion.
      const mistOpacity = dusk * 0.085 + night * 0.025;
      mist.material.opacity = mistOpacity;
      mist.mesh.visible = mistOpacity > 0.008;
      const mistDrift = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      mist.mesh.position.x = -72 + Math.sin(mistDrift * 0.021) * 9;
      mist.mesh.position.z = -72 - Math.sin(mistDrift * 0.021) * 9;
    },
  };
}
