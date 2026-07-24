import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from "three";
import {
  blendDayCycleColor,
  FOG_DAY,
  FOG_DUSK,
  FOG_NIGHT,
  MOON_COLOR,
  SKY_HORIZON_DAY,
  SKY_HORIZON_DUSK,
  SKY_HORIZON_NIGHT,
  SKY_ZENITH_DAY,
  SKY_ZENITH_DUSK,
  SKY_ZENITH_NIGHT,
  STAR_COLOR,
  type DayCyclePhase,
} from "./garden-day-cycle";

const DOME_RADIUS = 300;
const STAR_COUNT = 720;
const FOG_NEAR = 205;
const FOG_FAR = 450;

// The moon sits upper-left of the standard framing; V2's moon road aligns its
// water glitter band to this azimuth.
export const GARDEN_MOON_AZIMUTH = Math.PI * 0.62;
const MOON_ELEVATION = Math.PI * 0.34;

export interface GardenSkyFrame {
  reducedMotion: boolean;
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
  mesh: Mesh<SphereGeometry, ShaderMaterial>;
  horizon: Color;
  zenith: Color;
} {
  const zenith = SKY_ZENITH_NIGHT.clone();
  const horizon = SKY_HORIZON_NIGHT.clone();
  const material = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    fog: false,
    side: BackSide,
    uniforms: {
      uHorizon: { value: horizon },
      uZenith: { value: zenith },
    },
    vertexShader: /* glsl */ `
      varying float vHeight;
      void main() {
        vHeight = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      varying float vHeight;
      void main() {
        float t = smoothstep(-0.06, 0.7, vHeight);
        vec3 color = mix(uHorizon, uZenith, t);
        // Faint brightening right at the horizon band.
        float glow = smoothstep(0.16, -0.04, abs(vHeight)) * 0.12;
        color += uHorizon * glow;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const mesh = new Mesh(new SphereGeometry(DOME_RADIUS, 32, 16), material);
  mesh.name = "garden-sky-dome";
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  return { horizon, mesh, zenith };
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

export function createGardenSky(): GardenSky {
  const root = new Group();
  root.name = "garden-sky";
  const dome = createDome();
  const stars = createStars();
  const moon = createMoon();
  root.add(dome.mesh, stars.points, moon.group);

  const fog = new Fog(FOG_NIGHT.clone(), FOG_NEAR, FOG_FAR);

  return {
    dispose() {
      dome.mesh.geometry.dispose();
      dome.mesh.material.dispose();
      stars.points.geometry.dispose();
      stars.material.dispose();
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
      const { daylight, dusk, night } = phase;
      blendDayCycleColor(dome.zenith, SKY_ZENITH_NIGHT, SKY_ZENITH_DUSK, SKY_ZENITH_DAY, dusk, daylight);
      blendDayCycleColor(dome.horizon, SKY_HORIZON_NIGHT, SKY_HORIZON_DUSK, SKY_HORIZON_DAY, dusk, daylight);
      blendDayCycleColor(fog.color, FOG_NIGHT, FOG_DUSK, FOG_DAY, dusk, daylight);

      const starOpacity = Math.min(1, dusk * 0.35 + night);
      stars.material.uniforms.uOpacity.value = starOpacity;
      stars.material.uniforms.uTime.value = frame.reducedMotion ? 0 : Math.max(0, frame.timeSeconds);
      stars.points.visible = starOpacity > 0.01;

      const moonPresence = Math.min(1, dusk * 0.5 + night);
      moon.group.visible = moonPresence > 0.02;
      moon.halo.opacity = 0.08 + night * 0.28;
    },
  };
}
