import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
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
  const beamGeometry = new PlaneGeometry(46, 12);
  beamGeometry.rotateX(-Math.PI / 2);
  beamGeometry.translate(23, 0, 0);
  const beamMaterial = new ShaderMaterial({
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
    transparent: true,
    uniforms: {
      uColor: { value: new Color("#ffdda0") },
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
  const sweep = new Mesh(beamGeometry, beamMaterial);
  sweep.name = "lighthouse-beam";
  beam.add(sweep);
  root.add(beam);

  return { beacon, beaconHalo: halo, beam, light, root, shell };
}
