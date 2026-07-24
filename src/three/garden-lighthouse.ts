import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
} from "three";
import {
  GARDEN_LIGHTHOUSE_BEACON_Y,
  GARDEN_LIGHTHOUSE_HEIGHT,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import { gardenModelAnchor } from "./garden-models";
import { stableUnit } from "./garden-util";

const scratchMatrix = new Matrix4();

interface LighthouseModelTarget {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
}

export function attachGardenLighthouseModel(
  model: Group | null,
  content: LighthouseModelTarget | null,
): void {
  if (!content || !model) return;

  model.removeFromParent();
  model.traverse((object) => {
    if (object instanceof Mesh) object.castShadow = true;
  });
  content.lighthouseRoot.add(model);
  content.lighthouseShell.visible = false;

  const beaconPosition = gardenModelAnchor(
    model,
    "garden-lighthouse-shell",
    "beacon",
  ).position;
  const beamPosition = gardenModelAnchor(
    model,
    "garden-lighthouse-shell",
    "beam",
  ).position;
  content.beacon.position.copy(beaconPosition);
  content.beaconHalo.position.copy(beaconPosition);
  content.lighthouseLight.position.copy(beaconPosition);
  content.beam.position.copy(beamPosition);
}

export function createLighthouse(): {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  light: PointLight;
  root: Group;
  shell: Group;
} {
  const root = new Group();
  const paleStone = new MeshStandardMaterial({
    color: "#d8d0b8",
    flatShading: true,
    roughness: 0.88,
  });
  const midStone = new MeshStandardMaterial({
    color: "#aaa58f",
    flatShading: true,
    roughness: 0.94,
  });
  const shadowStone = new MeshStandardMaterial({
    color: "#777b70",
    flatShading: true,
    roughness: 0.96,
  });
  const bronze = new MeshStandardMaterial({
    color: "#67584a",
    metalness: 0.5,
    roughness: 0.5,
  });
  const copper = new MeshStandardMaterial({
    color: "#547367",
    metalness: 0.42,
    roughness: 0.58,
  });

  const stairMaterial = new MeshStandardMaterial({
    color: "#c9c0a8",
    flatShading: true,
    roughness: 1,
  });
  for (const [width, depth, y, z] of [
    [5.7, 5.2, 0.22, 0],
    [4.9, 4.2, 0.52, 0.35],
    [4.15, 3.4, 0.82, 0.65],
  ] as const) {
    const step = new Mesh(new BoxGeometry(width, 0.34, depth), stairMaterial);
    step.position.set(0, y, z);
    root.add(step);
  }

  const foundation = new Mesh(new CylinderGeometry(2.35, 2.7, 1.45, 8), shadowStone);
  foundation.position.y = 1.42;
  foundation.rotation.y = Math.PI / 8;
  root.add(foundation);

  const lowerTower = new Mesh(
    new CylinderGeometry(1.82, 2.32, 4.6, 8),
    paleStone,
  );
  lowerTower.position.y = 4.35;
  lowerTower.rotation.y = Math.PI / 8;
  root.add(lowerTower);

  const middleTower = new Mesh(
    new CylinderGeometry(1.48, 1.85, 4.15, 8),
    midStone,
  );
  middleTower.position.y = 8.72;
  middleTower.rotation.y = Math.PI / 8;
  root.add(middleTower);

  const upperTower = new Mesh(
    new CylinderGeometry(1.25, 1.52, 2.65, 8),
    paleStone,
  );
  upperTower.position.y = 12.08;
  upperTower.rotation.y = Math.PI / 8;
  root.add(upperTower);

  for (const [radius, y, height] of [
    [2.42, 2.15, 0.24],
    [1.92, 6.55, 0.22],
    [1.57, 10.76, 0.2],
    [1.38, 13.42, 0.22],
  ] as const) {
    const cornice = new Mesh(
      new CylinderGeometry(radius, radius, height, 8),
      shadowStone,
    );
    cornice.position.y = y;
    cornice.rotation.y = Math.PI / 8;
    root.add(cornice);
  }

  const courseGeometry = new CylinderGeometry(1, 1, 0.055, 8);
  for (const [radius, y] of [
    [2.2, 3.0], [2.08, 4.05], [1.95, 5.15],
    [1.76, 7.35], [1.66, 8.45], [1.56, 9.55],
    [1.39, 11.55], [1.31, 12.55],
  ] as const) {
    const course = new Mesh(courseGeometry, shadowStone);
    course.position.y = y;
    course.scale.set(radius, 1, radius);
    course.rotation.y = Math.PI / 8;
    root.add(course);
  }

  const doorMaterial = new MeshStandardMaterial({
    color: "#5a4030",
    roughness: 0.82,
  });
  const door = new Mesh(new BoxGeometry(0.82, 1.65, 0.12), doorMaterial);
  door.position.set(0, 2.3, 2.17);
  root.add(door);

  const windowMaterial = new MeshStandardMaterial({
    color: "#26383a",
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.24,
    roughness: 0.38,
    toneMapped: false,
  });
  for (const [angle, y, radius] of [
    [0, 5.0, 2.0],
    [Math.PI / 2, 8.7, 1.68],
    [Math.PI, 11.85, 1.35],
  ] as const) {
    const window = new Mesh(new BoxGeometry(0.56, 0.95, 0.1), windowMaterial);
    window.position.set(
      Math.sin(angle) * radius,
      y,
      Math.cos(angle) * radius,
    );
    window.rotation.y = angle;
    root.add(window);
  }

  const balcony = new Mesh(new CylinderGeometry(1.95, 1.95, 0.34, 16), bronze);
  balcony.position.y = 13.65;
  root.add(balcony);
  const rail = new Mesh(new TorusGeometry(1.78, 0.05, 6, 28), bronze);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 14.38;
  root.add(rail);
  const railPosts = new InstancedMesh(
    new CylinderGeometry(0.035, 0.045, 0.7, 5),
    bronze,
    12,
  );
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    scratchMatrix.makeTranslation(
      Math.cos(angle) * 1.76,
      14.02,
      Math.sin(angle) * 1.76,
    );
    railPosts.setMatrixAt(index, scratchMatrix);
  }
  railPosts.instanceMatrix.needsUpdate = true;
  root.add(railPosts);

  const glazing = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.55,
    opacity: 0.44,
    roughness: 0.12,
    toneMapped: false,
    transparent: true,
  });
  const lanternRoom = new Mesh(
    new CylinderGeometry(1.25, 1.25, 1.75, 8),
    glazing,
  );
  lanternRoom.position.y = 14.95;
  lanternRoom.rotation.y = Math.PI / 8;
  root.add(lanternRoom);
  const lanternFrame = new InstancedMesh(
    new CylinderGeometry(0.035, 0.045, 1.72, 5),
    bronze,
    8,
  );
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    scratchMatrix.makeTranslation(
      Math.cos(angle) * 1.21,
      14.95,
      Math.sin(angle) * 1.21,
    );
    lanternFrame.setMatrixAt(index, scratchMatrix);
  }
  lanternFrame.instanceMatrix.needsUpdate = true;
  root.add(lanternFrame);

  const roof = new Mesh(
    new ConeGeometry(1.68, 1.65, 8),
    copper,
  );
  roof.position.y = 16.62;
  roof.rotation.y = Math.PI / 8;
  root.add(roof);
  const finial = new Mesh(
    new SphereGeometry(0.18, 8, 6),
    new MeshStandardMaterial({
      color: "#75644f",
      metalness: 0.6,
      roughness: 0.42,
    }),
  );
  finial.position.y = GARDEN_LIGHTHOUSE_HEIGHT;
  root.add(finial);

  const shell = new Group();
  shell.name = "lighthouse-procedural-shell";
  shell.add(...root.children);
  root.add(shell);

  const beacon = new Mesh(
    new SphereGeometry(0.4, 12, 8),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_warm,
      emissive: HARBOR_PALETTE.lantern_glow,
      emissiveIntensity: 3.2,
      roughness: 0.12,
      // The hero bloom source: stay bright through AgX on the direct-render
      // (constrained) path; the composer path never tone maps scene materials.
      toneMapped: false,
    }),
  );
  beacon.position.y = GARDEN_LIGHTHOUSE_BEACON_Y;
  root.add(beacon);

  const halo = new Mesh(
    new SphereGeometry(1.34, 16, 10),
    new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: HARBOR_PALETTE.lantern_glow,
      depthWrite: false,
      opacity: 0.22,
      transparent: true,
    }),
  );
  halo.position.copy(beacon.position);
  halo.name = "lighthouse-halo";
  root.add(halo);

  const light = new PointLight(
    HARBOR_PALETTE.lantern_warm,
    0.95,
    36,
    2,
  );
  light.position.copy(beacon.position);
  root.add(light);

  const beam = new Group();
  beam.position.copy(beacon.position);
  beam.add(createBeamCone(), createBeamDust(), createBeamPlane());
  root.add(beam);

  return { beacon, beaconHalo: halo, beam, light, root, shell };
}

// The beam sweeps horizontally along the group's +X (apex at the beacon), so
// the far end fades out roughly BEAM_LENGTH world units over the dark sea.
const BEAM_LENGTH = 44;
const BEAM_BASE_RADIUS = 4.4;
const BEAM_DUST_COUNT = 40;
const BEAM_COLOR = new Color("#ffdda0");

/**
 * The volumetric beam: an open additive cone (apex at the beacon, axis along
 * +X). Under the fixed ortho view a fresnel-ish edge term (grazing surfaces
 * glow, face-on softens) plus front+back additive overlap read as light in
 * air; a longitudinal fade darkens it toward the far end and slow banding
 * drifts through it. `uTime` is frozen under reduced motion by the caller.
 */
function createBeamCone(): Mesh<ConeGeometry, ShaderMaterial> {
  const geometry = new ConeGeometry(BEAM_BASE_RADIUS, BEAM_LENGTH, 28, 1, true);
  // Apex to the group origin, axis rotated from +Y to +X.
  geometry.translate(0, -BEAM_LENGTH / 2, 0);
  geometry.rotateZ(Math.PI / 2);
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying float vAlong;
      varying vec3 vNormalView;

      void main() {
        // Bright just past the apex, carrying out over the sea before fading
        // to nothing by the far end (~40 units).
        float fade = smoothstep(0.015, 0.09, vAlong)
          * (1.0 - smoothstep(0.5, 0.99, vAlong));
        // Ortho fresnel: grazing (silhouette) surfaces glow, face-on softens.
        float rim = 1.0 - abs(vNormalView.z);
        float shaft = 0.3 + 0.7 * rim;
        float bands = 0.86 + 0.14 * sin(vAlong * 30.0 - uTime * 1.3);
        gl_FragColor = vec4(uColor, uOpacity * fade * shaft * bands);
      }
    `,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uColor: { value: BEAM_COLOR.clone() },
      uLength: { value: BEAM_LENGTH },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uLength;
      varying float vAlong;
      varying vec3 vNormalView;

      void main() {
        vAlong = position.x / uLength;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  });
  const cone = new Mesh(geometry, material);
  cone.name = "lighthouse-beam-cone";
  return cone;
}

/** Faint motes suspended in the cone (full tier, motion only). */
function createBeamDust(): Points<BufferGeometry, ShaderMaterial> {
  const positions: number[] = [];
  const seeds: number[] = [];
  for (let index = 0; index < BEAM_DUST_COUNT; index += 1) {
    const along = (0.14 + stableUnit(`beam-dust-a.${index}`) * 0.72) * BEAM_LENGTH;
    const coneRadius = (along / BEAM_LENGTH) * BEAM_BASE_RADIUS;
    const radius = coneRadius * (0.15 + stableUnit(`beam-dust-r.${index}`) * 0.7);
    const angle = stableUnit(`beam-dust-t.${index}`) * Math.PI * 2;
    positions.push(along, Math.cos(angle) * radius, Math.sin(angle) * radius);
    seeds.push(stableUnit(`beam-dust-s.${index}`));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vTwinkle;

      void main() {
        float soft = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(uColor, uOpacity * soft * vTwinkle);
      }
    `,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uColor: { value: BEAM_COLOR.clone() },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      varying float vTwinkle;

      void main() {
        vec3 p = position;
        // Slow drift, small enough that motes stay inside the cone envelope.
        p.x += sin(uTime * 0.25 + aSeed * 6.28) * 0.6;
        p.y += sin(uTime * 0.31 + aSeed * 12.0) * 0.25;
        p.z += cos(uTime * 0.27 + aSeed * 9.0) * 0.25;
        vTwinkle = 0.5 + 0.5 * sin(uTime * 0.9 + aSeed * 20.0);
        gl_PointSize = 2.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
  });
  const dust = new Points(geometry, material);
  dust.name = "lighthouse-beam-dust";
  dust.visible = false;
  return dust;
}

/** Recovery/constrained fallback: the original flat additive beam plane. */
function createBeamPlane(): Mesh<PlaneGeometry, ShaderMaterial> {
  const geometry = new PlaneGeometry(46, 12);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(23, 0, 0);
  const material = new ShaderMaterial({
    blending: AdditiveBlending,
    depthWrite: false,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;

      void main() {
        float along = vUv.x;
        float across = abs(vUv.y - 0.5);
        float halfWidth = mix(0.02, 0.38, smoothstep(0.0, 1.0, along));
        float feather = 1.0 - smoothstep(halfWidth * 0.42, halfWidth, across);
        float startFade = smoothstep(0.0, 0.08, along);
        float endFade = 1.0 - smoothstep(0.7, 1.0, along);
        float strands = 0.82 + sin(along * 96.0) * 0.18;
        gl_FragColor = vec4(
          uColor,
          uOpacity * feather * startFade * endFade * strands
        );
      }
    `,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uColor: { value: BEAM_COLOR.clone() },
      uOpacity: { value: 0.08 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
  });
  const sweep = new Mesh(geometry, material);
  sweep.name = "lighthouse-beam";
  sweep.visible = false;
  return sweep;
}
